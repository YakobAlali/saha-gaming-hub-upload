import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { io } from 'socket.io-client';
import { createHub } from '../server/index.js';

async function launch(options) {
  const hub = createHub(options);
  hub.http.listen(0, '127.0.0.1');
  await once(hub.http, 'listening');
  return { ...hub, url: 'http://127.0.0.1:' + hub.http.address().port };
}

async function connect(hub, token) {
  const socket = io(hub.url, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false });
  let snapshot;
  socket.on('dashboard', data => { snapshot = data; });
  const hello = event(socket, 'hello');
  socket.connect();
  return { socket, hello: await hello, dashboard: () => snapshot };
}

function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error('Timed out waiting for ' + name));
    }, 2500);
    function listener(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    }
    socket.on(name, listener);
  });
}

const send = (client, command, data = {}) => client.socket.timeout(2500).emitWithAck(command, data);

test('private invitations, capacity, live chat, presence and persistence across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saha-'));
  const options = { file: join(directory, 'hub.db') };
  let hub = await launch(options);
  try {
    const host = await connect(hub);
    const guest = await connect(hub);
    // Public player identifiers do not authenticate a session.
    const outsider = await connect(hub, host.hello.player.id);
    assert.notEqual(outsider.hello.player.id, host.hello.player.id);
    const created = event(host.socket, 'room');
    assert.deepEqual(await send(host, 'room:create', { nickname:'Host', name:'Friends', game:'chess' }), { ok:true });
    const { code } = await created;
    assert.match(code, /^[A-F0-9]{8}$/);
    assert.deepEqual(outsider.dashboard().rooms, []);
    const joined = event(host.socket, 'room', room => room.members.length === 2);
    assert.deepEqual(await send(guest, 'room:join', { nickname:'Guest', code:code.toLowerCase() }), { ok:true });
    await joined;
    assert.deepEqual(await send(outsider, 'room:join', { nickname:'Other', code }), { ok:false, error:'full' });
    assert.deepEqual(await send(outsider, 'chat:send', { text:'outside' }), { ok:false, error:'noRoom' });
    const ready = event(host.socket, 'room', room => room.members[1].ready);
    await send(guest, 'room:ready');
    await ready;
    const chat = event(guest.socket, 'room', room => room.chat.length);
    await send(host, 'chat:send', { text:'أهلاً / Hello' });
    assert.equal((await chat).chat[0].text, 'أهلاً / Hello');
    const offline = event(host.socket, 'room', room => room.members[1].online === false);
    guest.socket.disconnect();
    await offline;
    const returned = await connect(hub, guest.hello.token);
    assert.equal(returned.hello.room.members[1].ready, true);
    assert.equal(returned.hello.room.members[1].online, true);
    await hub.close();
    hub = await launch(options);
    const recovered = await connect(hub, host.hello.token);
    assert.equal(recovered.hello.room.code, code);
    assert.equal(recovered.hello.room.chat.length, 1);
    assert.equal(recovered.hello.room.members[1].online, false);
    await send(recovered, 'room:leave');
    const remaining = await connect(hub, guest.hello.token);
    assert.equal(remaining.hello.room.host, guest.hello.player.id);
    await send(remaining, 'room:leave');
    assert.deepEqual(await send(recovered, 'room:join', { nickname:'Host', code }), { ok:false, error:'badCode' });
  } finally {
    await hub.close();
    await rm(directory, { recursive:true, force:true });
  }
});

test('public listing and exactly-once scoring from a registered game engine', async () => {
  const engine = {
    start: ([first]) => ({ first, finished:false }),
    view: state => ({ finished:state.finished }),
    move: (state, id, move) => id === state.first && move === 'win' ? { ...state, finished:true, winners:[id] } : null
  };
  const hub = await launch({ file:':memory:', games:new Map([['chess', engine]]) });
  try {
    const host = await connect(hub);
    const guest = await connect(hub);
    const publicList = event(guest.socket, 'dashboard', data => data.rooms.length === 1);
    await send(host, 'room:create', { nickname:'Host', name:'Open', game:'chess', listed:true });
    const { code } = (await publicList).rooms[0];
    await send(guest, 'room:join', { nickname:'Guest', code });
    assert.deepEqual(await send(guest, 'match:start'), { ok:false, error:'forbidden' });
    assert.deepEqual(await send(host, 'match:start'), { ok:false, error:'notReady' });
    await send(guest, 'room:ready');
    await send(host, 'room:ready');
    assert.deepEqual(await send(host, 'match:start'), { ok:true });
    assert.deepEqual(await send(guest, 'match:move', { move:'win' }), { ok:false, error:'badMove' });
    const ranking = event(guest.socket, 'dashboard', data => data.rankings[0]?.points === 3);
    await send(host, 'match:move', { move:'win' });
    assert.equal((await ranking).rankings[0].id, host.hello.player.id);
    assert.deepEqual(await send(host, 'match:move', { move:'win' }), { ok:false, error:'unavailable' });
  } finally {
    await hub.close();
  }
});

test('spectators join a full active room and see moves without player privileges', async () => {
  const hub = await launch({ file:':memory:' });
  try {
    const host = await connect(hub);
    const guest = await connect(hub);
    const viewer = await connect(hub);
    const created = event(host.socket,'room');
    await send(host,'room:create',{ nickname:'Host', name:'Viewer room', game:'tic', listed:true });
    const { code } = await created;
    await send(guest,'room:join',{ nickname:'Player', code });
    await send(host,'room:ready');
    await send(guest,'room:ready');
    assert.deepEqual(await send(host,'match:start'),{ok:true});
    const viewing = event(viewer.socket,'room');
    assert.deepEqual(await send(viewer,'room:join',{ nickname:'Viewer', code, role:'spectator' }),{ok:true});
    const joined = await viewing;
    assert.equal(joined.role,'spectator');
    assert.equal(joined.members.length,2);
    assert.equal(joined.spectators[0].name,'Viewer');
    assert.equal(viewer.dashboard().rooms[0].playing,true);
    assert.deepEqual(await send(viewer,'match:move',{move:'0'}),{ok:false,error:'forbidden'});
    assert.deepEqual(await send(viewer,'match:start'),{ok:false,error:'forbidden'});
    const changed = event(viewer.socket,'room', room => room?.match?.board[0] === '✕');
    await send(host,'match:move',{move:'0'});
    assert.equal((await changed).match.active,false);
    assert.deepEqual(await send(viewer,'room:leave'),{ok:true});
  } finally {
    await hub.close();
  }
});

test('host can create a room that rejects spectators', async () => {
  const hub = await launch({ file:':memory:' });
  try {
    const host = await connect(hub);
    const viewer = await connect(hub);
    const created = event(host.socket,'room');
    await send(host,'room:create',{ nickname:'Host', name:'Closed', game:'chess', allowSpectators:false });
    const { code } = await created;
    assert.deepEqual(await send(viewer,'room:join',{ nickname:'Viewer', code, role:'spectator' }),{ok:false,error:'spectatorsDisabled'});
  } finally {
    await hub.close();
  }
});

test('expiry advances the authoritative game and rejects a stale move', async () => {
  const hub = await launch({file:':memory:',timerUnit:20});
  try {
    const host = await connect(hub);
    const guest = await connect(hub);
    const row = event(host.socket,'room');
    await send(host,'room:create',{nickname:'Host',name:'Timed',game:'tic',turnSeconds:15});
    const {code} = await row;
    await send(guest,'room:join',{nickname:'Guest',code});
    await send(host,'room:ready');
    await send(guest,'room:ready');
    const first = event(host.socket,'room',room => room?.match?.revision === 0);
    const timed = event(host.socket,'room',room => room?.match?.revision === 1);
    assert.deepEqual(await send(host,'match:start'),{ok:true});
    const opened = await first;
    assert.ok(opened.match.deadline > opened.serverTime);
    const next = await timed;
    assert.equal(next.match.effect.automated,true);
    assert.equal(next.match.turn,guest.hello.player.id);
    assert.equal(next.match.board.filter(Boolean).length,1);
    assert.deepEqual(await send(guest,'match:move',{move:'2',revision:0,matchId:opened.match.matchId}),{ok:false,error:'stale'});
  } finally { await hub.close(); }
});

test('bots keep seats playable and the host can rematch or switch games with a spectator', async () => {
  const hub = await launch({file:':memory:',botDelay:20});
  try {
    const host = await connect(hub);
    const spectator = await connect(hub);
    const created = event(host.socket,'room');
    await send(host,'room:create',{nickname:'Host',name:'Party',game:'tic'});
    const {code} = await created;
    await send(spectator,'room:join',{nickname:'Viewer',code,role:'spectator'});
    assert.deepEqual(await send(spectator,'room:bot'),{ok:false,error:'forbidden'});
    const bots = event(host.socket,'room',room => room?.members[1]?.bot);
    await send(host,'room:bot');
    const lobby = await bots;
    assert.equal(lobby.members[1].ready,true);
    assert.equal(lobby.members[1].online,true);
    await send(host,'room:ready');
    const first = event(spectator.socket,'room',room => room?.match?.revision === 0);
    await send(host,'match:start');
    const original = await first;
    const robot = event(spectator.socket,'room',room => room?.match?.revision === 2);
    await send(host,'match:move',{move:'0',revision:0,matchId:original.match.matchId});
    const played = await robot;
    assert.equal(played.match.effect.automated,true);
    assert.equal(played.match.board.filter(Boolean).length,2);
    const reaction = event(host.socket,'room',room => room?.reaction?.emoji === '👏');
    assert.deepEqual(await send(spectator,'room:reaction',{emoji:'👏'}),{ok:true});
    assert.equal((await reaction).reaction.name,'Viewer');
    assert.deepEqual(await send(spectator,'room:reaction',{emoji:'bad'}),{ok:false,error:'badReaction'});
    await send(host,'match:resign');
    const recreated = event(spectator.socket,'room',room => room?.match?.revision === 0 && room.match.matchId !== original.match.matchId);
    assert.deepEqual(await send(host,'match:rematch'),{ok:true});
    assert.equal((await recreated).role,'spectator');
    await send(host,'match:resign');
    const changed = event(spectator.socket,'room',room => room?.game === 'ludo');
    assert.deepEqual(await send(host,'room:game',{game:'ludo'}),{ok:true});
    const next = await changed;
    assert.equal(next.code,code);
    assert.equal(next.capacity,4);
    assert.equal(next.members.length,2);
    assert.equal(next.members[1].points,0);
    assert.equal(next.match,null);
  } finally { await hub.close(); }
});

test('automatic fallback plays for a disconnected user and preserves their reconnect seat', async () => {
  const hub = await launch({file:':memory:',botDelay:20,offlineGrace:35});
  try {
    const host = await connect(hub);
    const guest = await connect(hub);
    const created = event(host.socket,'room');
    await send(host,'room:create',{nickname:'Host',name:'Reconnect',game:'tic',botFill:true});
    const {code} = await created;
    await send(guest,'room:join',{nickname:'Guest',code});
    await send(host,'room:ready');
    await send(guest,'room:ready');
    await send(host,'match:start');
    const replaced = event(host.socket,'room',room => room?.match?.revision === 2);
    await send(host,'match:move',{move:'0'});
    guest.socket.disconnect();
    const played = await replaced;
    assert.equal(played.match.effect.automated,true);
    assert.equal(played.members[1].controlledByBot,true);
    const returned = await connect(hub,guest.hello.token);
    assert.equal(returned.hello.room.code,code);
    assert.equal(returned.hello.room.members[1].controlledByBot,false);
    assert.equal(returned.hello.room.members[1].id,guest.hello.player.id);
  } finally { await hub.close(); }
});

test('voice roster and signaling are limited to opted-in members of the same room', async () => {
  const hub=await launch({file:':memory:',iceServers:[]});
  try {
    const host=await connect(hub);
    const viewer=await connect(hub);
    const outsider=await connect(hub);
    const row=event(host.socket,'room');
    await send(host,'room:create',{nickname:'Host',name:'Voice',game:'checkers'});
    const {code}=await row;
    await send(viewer,'room:join',{nickname:'Viewer',code,role:'spectator'});
    assert.deepEqual(await send(outsider,'voice:join'),{ok:false,error:'noRoom'});
    const solo=event(host.socket,'voice:roster');
    assert.deepEqual(await send(host,'voice:join'),{ok:true,iceServers:[]});
    assert.equal((await solo).peers.length,1);
    const duplicate=await connect(hub,host.hello.token);
    assert.deepEqual(await send(duplicate,'voice:join'),{ok:false,error:'voiceOtherTab'});
    const roster=event(host.socket,'voice:roster',data=>data.peers.length===2);
    await send(viewer,'voice:join',{listen:true});
    assert.equal((await roster).peers[1].listen,true);
    const relayed=event(viewer.socket,'voice:signal');
    outsider.socket.emit('voice:signal',{to:viewer.hello.player.id,data:{type:'offer',sdp:'outside'}});
    host.socket.emit('voice:signal',{to:viewer.hello.player.id,data:{type:'offer',sdp:'inside'}});
    assert.deepEqual(await relayed,{from:host.hello.player.id,data:{type:'offer',sdp:'inside'}});
    const muted=event(viewer.socket,'voice:roster',data=>data.peers[0].muted);
    host.socket.emit('voice:mute',null);
    host.socket.emit('voice:mute',{muted:true});
    assert.equal((await muted).peers[0].muted,true);
    const target=viewer.hello.player.id;
    assert.deepEqual(await send(viewer,'voice:settings',{enabled:false}),{ok:false,error:'forbidden'});
    assert.deepEqual(await send(viewer,'voice:moderate',{id:host.hello.player.id,field:'hostMuted',value:true}),{ok:false,error:'forbidden'});
    const deafened=event(viewer.socket,'voice:roster',snapshot=>snapshot.peers.some(peer=>peer.id===target&&peer.hostDeaf));
    assert.equal((await send(host,'voice:moderate',{id:target,field:'hostDeaf',value:true})).ok,true);
    await deafened;
    const closed=event(viewer.socket,'voice:closed');
    const remaining=event(host.socket,'voice:roster',data=>data.peers.length===1);
    await send(viewer,'room:leave');
    await closed;
    assert.equal((await remaining).peers.length,1);
    const stopped=event(host.socket,'voice:closed');
    assert.equal((await send(host,'voice:settings',{enabled:false})).ok,true);
    await stopped;
    assert.deepEqual(await send(host,'voice:join'),{ok:false,error:'voiceDisabled'});
  } finally { await hub.close(); }
});

test('Discord links a guest, validates browser state, and revokes the web session on logout', async () => {
  const origin='http://localhost:3000';
  const redirectUri=origin+'/auth/discord/callback';
  const clientSecret='unit-test-value';
  let calls=0;
  let exchangedVerifier;
  const hub=await launch({file:':memory:',discord:{clientId:'123',clientSecret,redirectUri},
    discordFetch:async (url,options)=>{
      calls++;
      if(url.endsWith('/token')) {
        assert.equal(options.body.get('client_secret'),clientSecret);
        assert.equal(options.body.get('redirect_uri'),redirectUri);
        assert.equal(options.body.get('code'),'test-code');
        exchangedVerifier=options.body.get('code_verifier');
        return Response.json({access_token:'test-access'});
      }
      assert.equal(options.headers.Authorization,'Bearer test-access');
      return Response.json({id:'123456789012345678',username:'Discord guest'});
    }
  });
  const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]);
  const post=(path,body,header)=>fetch(hub.url+'/auth/discord/'+path,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(header?{Cookie:header}:{})},
    body:JSON.stringify(body)
  });
  const status=header=>fetch(hub.url+'/auth/discord/status',{headers:{Cookie:header}}).then(res=>res.json());
  try {
    const guest=await connect(hub);
    const created=event(guest.socket,'room');
    await send(guest,'room:create',{nickname:'Existing player',name:'Test',game:'tic'});
    const {code}=await created;
    const begin=await post('start',{guest:guest.hello.token});
    const stateCookie=cookies(begin)[0];
    const {url}=await begin.json();
    const auth=new URL(url);
    assert.equal(auth.origin,'https://discord.com');
    assert.equal(auth.searchParams.get('scope'),'identify email');
    assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
    const callback=hub.url+'/auth/discord/callback?code=test-code&state='+auth.searchParams.get('state');
    const unbound=await fetch(callback,{redirect:'manual'});
    assert.match(unbound.headers.get('location'),/discordFailed/);
    assert.equal(calls,0);
    const success=await fetch(callback,{redirect:'manual',headers:{Cookie:stateCookie}});
    assert.match(success.headers.get('location'),/discordSuccess/);
    assert.equal(calls,2);
    assert.ok(exchangedVerifier.length>=43);
    const session=cookies(success).find(value=>value.startsWith('saha_discord_session='));
    assert.ok(success.headers.getSetCookie().some(value=>value.startsWith(session)&&value.includes('HttpOnly')));
    assert.deepEqual(await status(session),{enabled:true,signedIn:true});
    const oldGuest=await connect(hub,guest.hello.token);
    assert.notEqual(oldGuest.hello.player.id,guest.hello.player.id);
    const browser=io(hub.url,{transports:['websocket'],autoConnect:false,extraHeaders:{Cookie:session}});
    const hello=event(browser,'hello'); browser.connect();
    const restored=await hello;
    assert.equal(restored.token,null);
    assert.equal(restored.player.id,guest.hello.player.id);
    assert.equal(restored.room.code,code);
    assert.equal(restored.discord,true);
    const replay=await fetch(callback,{redirect:'manual',headers:{Cookie:stateCookie}});
    assert.match(replay.headers.get('location'),/discordFailed/);
    const disconnected=event(browser,'disconnect');
    assert.equal((await post('logout',{},session)).status,200);
    await disconnected;
    assert.equal((await status(session)).signedIn,false);
  } finally {await hub.close();}
});

test('private account stores a verified email from the same Discord sign-in', async () => {
  const origin='http://localhost:3000';
  const hub=await launch({file:':memory:',discord:{clientId:'123',clientSecret:'test',redirectUri:origin+'/auth/discord/callback'},
    discordFetch:async url=>Response.json(url.endsWith('/token') ? {access_token:'fake'} :
      {id:'123456789012345678',username:'Player',email:'Owner@Example.test',verified:true})
  });
  const base=hub.url+'/auth/discord/';
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const getCookie=(response,key)=>response.headers.getSetCookie().find(item=>item.startsWith(key+'='))?.split(';')[0];
  const profile=cookie=>fetch(base+'profile',{headers:cookie?{Cookie:cookie}:{}});
  async function authorize() {
    const started=await post('start',{});
    const state=getCookie(started,'saha_discord_state');
    const url=new URL((await started.json()).url);
    const response=await fetch(base+'callback?code=mock&state='+url.searchParams.get('state'),{
      redirect:'manual',headers:{Cookie:state}
    });
    assert.match(response.headers.get('location'),/discordSuccess/);
    return {scope:url.searchParams.get('scope'),session:getCookie(response,'saha_discord_session')};
  }
  try {
    assert.equal((await profile()).status,401);
    const auth=await authorize();
    assert.equal(auth.scope,'identify email');
    const saved=await post('profile',{city:'Vienna',privacy:{stats:'public'}},auth.session);
    const privateProfile=await saved.json();
    assert.equal(privateProfile.name,'Player');
    assert.equal(privateProfile.email,'owner@example.test');
    assert.ok(!Object.hasOwn(privateProfile,'city'));
    assert.deepEqual(privateProfile.badges,['badgeLinked']);
    const guest=await connect(hub);
    const dashboard=event(guest.socket,'dashboard',data=>data.rankings.some(item=>item.name==='Player'));
    await send(guest,'room:create',{nickname:'Guest',name:'Privacy',game:'tic'});
    const view=await dashboard;
    const publicProfile=view.rankings.find(item=>item.name==='Player');
    assert.ok(!Object.hasOwn(publicProfile,'email')&&!Object.hasOwn(publicProfile,'city'));
    assert.equal((await (await post('profile',{removeEmail:true},auth.session)).json()).email,'');
  } finally{await hub.close();}
});

test('Replica accepts simultaneous answers without revision conflicts and gates spectators', async () => {
  const hub=await launch({file:':memory:'});
  try {
    const a=await connect(hub);
    const b=await connect(hub);
    const watcher=await connect(hub);
    const roomCreated=event(a.socket,'room');
    await send(a,'room:create',{nickname:'Alpha',name:'Words',game:'replica-en'});
    const initial=await roomCreated;
    assert.equal(initial.capacity,6);
    assert.deepEqual(await send(a,'room:bot'),{ok:false,error:'unavailable'});
    await send(b,'room:join',{nickname:'Beta',code:initial.code});
    await send(watcher,'room:join',{nickname:'Watch',code:initial.code,role:'spectator'});
    await send(a,'room:ready');
    await send(b,'room:ready');
    const started=event(a.socket,'room',room=>room.match?.wordRound?.phase==='choose');
    await send(a,'match:start');
    const {match}=await started;
    const writing=event(watcher.socket,'room',room=>room.match?.wordRound?.phase==='write');
    await send(a,'match:move',{matchId:match.matchId,move:{type:'letter',phase:'choose',round:1,letter:'A'}});
    const open=await writing;
    assert.ok(open.match.deadline>open.serverTime);
    const submission={matchId:match.matchId,revision:open.match.revision,move:{type:'answers',phase:'write',round:1,values:{name:'Ada'}}};
    assert.deepEqual(await send(watcher,'match:move',submission),{ok:false,error:'forbidden'});
    const seen=event(watcher.socket,'room',room=>room.match?.wordRound?.phase==='review');
    assert.deepEqual(await Promise.all([send(a,'match:move',submission),send(b,'match:move',submission)]),[{ok:true},{ok:true}]);
    assert.equal((await seen).match.wordRound.entries.filter(row=>row.value==='Ada').length,2);
    assert.deepEqual(await send(a,'match:move',submission),{ok:false,error:'badMove'});
  } finally {await hub.close();}
});

test('profile sections follow privacy rules and friend requests require acceptance',async()=>{
  const origin='http://localhost:3000';
  const hub=await launch({file:':memory:',ownerId:'123456789012345678',shopCatalog:[
    {id:'test-frame',type:'decoration',style:'frame',price:1,name:{en:'Test frame',ar:'إطار اختبار'}},
    {id:'test-effect',type:'effect',style:'shine',price:2,name:{en:'Test effect',ar:'مؤثر اختبار'}}
  ],discord:{clientId:'123',clientSecret:'test',redirectUri:origin+'/auth/discord/callback'},
    discordFetch:async (url,options)=>Response.json(url.endsWith('/token')?{access_token:options.body.get('code')}:
      url.endsWith('/connections')?[
        {type:'github',name:'linked-alice',visibility:1,verified:true},
        {type:'steam',id:'76561198000000000',visibility:0,verified:true},
        {type:'twitch',name:'revoked',visibility:1,verified:true,revoked:true}
      ]:options.headers.Authorization==='Bearer alice'?{id:'123456789012345678',username:'alice',email:'alice@example.test',verified:true}:
        {id:'123456789012345679',username:'bob'})
  });
  const base=hub.url+'/auth/discord/';
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const cookie=(res,key)=>res.headers.getSetCookie().find(value=>value.startsWith(key+'='))?.split(';')[0];
  const get=(path,session)=>fetch(base+path,{headers:session?{Cookie:session}:{}});
  async function authorize(code){
    const started=await post('start',{});
    const state=cookie(started,'saha_discord_state');
    const url=new URL((await started.json()).url);
    const response=await fetch(base+'callback?code='+code+'&state='+url.searchParams.get('state'),{headers:{Cookie:state},redirect:'manual'});
    const session=cookie(response,'saha_discord_session');
    return {session,profile:await (await get('profile',session)).json()};
  }
  try{
    const alice=await authorize('alice');
    const bob=await authorize('bob');
    assert.equal(alice.profile.username,'alice');
    assert.ok(alice.profile.achievements.some(badge=>badge.id==='owner'));
    assert.equal((await get('admin',bob.session)).status,403);
    const staffAction=(action,id,value,extra={})=>post('admin',{action,id,value,...extra},alice.session);
    assert.equal((await staffAction('role',bob.profile.id,'moderator')).status,200);
    const staffData=await (await get('admin?q=@alice',bob.session)).json();
    assert.equal(staffData.role,'moderator');
    assert.equal(staffData.users[0].manageable,false);
    assert.equal((await post('admin',{action:'ban',id:alice.profile.id,value:true,days:1,reason:'Test'},bob.session)).status,403);
    assert.equal((await get('reports',bob.session).then(response=>response.json())).reviewer,false);
    assert.equal((await staffAction('mute',bob.profile.id,true,{days:1,reason:'Test mute'})).status,200);
    assert.equal((await staffAction('mute',bob.profile.id,false,{reason:'Test clear'})).status,200);
    assert.equal((await staffAction('role',bob.profile.id,'member')).status,200);
    assert.deepEqual(bob.profile.achievements.find(badge=>badge.id==='og'),{id:'og',value:2});
    const report=await post('reports',{title:'Test bug',description:'The test panel did not update.',
      image:Buffer.from([255,216,255,224,0,2,255,217]).toString('base64')},bob.session);
    assert.equal(report.status,201);
    const reportId=(await report.json()).id;
    assert.equal((await get('reports/'+reportId+'/screenshot',bob.session)).status,403);
    assert.equal((await get('reports/'+reportId+'/screenshot',alice.session)).headers.get('content-type'),'image/jpeg');
    assert.equal((await post('reports/review',{id:reportId,status:'confirmed'},bob.session)).status,403);
    assert.equal((await post('reports/review',{id:reportId,status:'confirmed'},alice.session)).status,200);
    assert.equal((await post('reports/review',{id:reportId,status:'confirmed'},alice.session)).status,409);
    assert.equal((await post('reports/plus',{id:bob.profile.id,tier:'gold',days:30},alice.session)).status,200);
    const badges=(await (await get('profile',bob.session)).json()).achievements;
    assert.deepEqual(badges.find(badge=>badge.id==='hunter'),{id:'hunter',value:1});
    assert.ok(badges.some(badge=>badge.id==='gold'));
    const video=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypisom0000')]).toString('base64');
    const playerReport={kind:'player',title:'Room incident',description:'Test evidence for moderation.',
      target:alice.profile.id,reason:'abuse',image:video,mediaType:'video/mp4'};
    assert.equal((await post('reports',{...playerReport,target:bob.profile.id},bob.session)).status,400);
    assert.equal((await post('reports',{...playerReport,image:Buffer.from('<svg></svg>').toString('base64')},bob.session)).status,400);
    const incident=await post('reports',playerReport,bob.session);
    assert.equal(incident.status,201);
    const incidentId=(await incident.json()).id;
    assert.equal((await get('reports/'+incidentId+'/evidence',bob.session)).status,403);
    assert.equal((await get('reports/'+incidentId+'/evidence',alice.session)).headers.get('content-type'),'video/mp4');
    const queue=await (await get('reports',alice.session)).json();
    assert.equal(queue.items.find(item=>item.id===incidentId).target,alice.profile.id);
    assert.equal((await post('reports/review',{id:incidentId,status:'confirmed'},alice.session)).status,200);
    const confirmed=(await (await get('profile',bob.session)).json()).achievements;
    assert.equal(confirmed.find(badge=>badge.id==='hunter').value,1);
    const updateImage=(kind,method,body,session=alice.session)=>fetch(base+'profile-image/'+kind,{
      method,headers:{Origin:origin,Cookie:session,'Content-Type':'image/jpeg'},body
    });
    const sample=Buffer.from([255,216,255,224,0,2,255,217]);
    const rejected=await updateImage('banner','PUT',Buffer.from('<svg></svg>'));
    assert.equal(rejected.status,400);
    const savedImage=await updateImage('banner','PUT',sample);
    assert.equal(savedImage.status,200);
    const storedProfile=await savedImage.json();
    assert.equal(storedProfile.bannerStyle,'upload');
    const publicBanner=await fetch(hub.url+storedProfile.images.banner);
    assert.equal(publicBanner.headers.get('content-type'),'image/jpeg');
    assert.deepEqual(Buffer.from(await publicBanner.arrayBuffer()),sample);
    assert.equal((await (await get('profile/'+alice.profile.id,bob.session)).json()).images.banner,storedProfile.images.banner);
    assert.equal((await updateImage('banner','DELETE')).status,200);
    assert.equal((await fetch(hub.url+storedProfile.images.banner)).status,404);
    const update=await post('profile',{name:'Night Comet',bio:'Strategy fan',accent:'#46ab96',decoration:'stars',effect:'shine',
      links:{instagram:'https://www.instagram.com/example/',tiktok:'https://www.tiktok.com/@example'},
      bannerStyle:'pattern',bannerColor:'#112233',cardTheme:'midnight',status:'Ready to play',featuredBadges:['badgeLinked','badgeTen'],
      privacy:{bio:'public',stats:'friends',games:'private',links:'friends',activity:'friends'}
    },alice.session);
    assert.equal(update.status,200);
    assert.equal((await post('profile',{links:{instagram:'https://example.test/'}},alice.session)).status,400);
    assert.equal((await get('profile/find?username=alice')).status,401);
    const guest=await (await get('profile/'+alice.profile.id)).json();
    assert.equal(guest.bio,'Strategy fan');
    assert.equal(guest.bannerStyle,'pattern');
    assert.equal(guest.bannerColor,'#112233');
    assert.equal(guest.cardTheme,'midnight');
    assert.equal(guest.presence,'offline');
    assert.ok(!Object.hasOwn(guest,'status'));
    assert.ok(!Object.hasOwn(guest,'wins')&&!Object.hasOwn(guest,'email')&&!Object.hasOwn(guest,'links'));
    const result=await (await get('profile/find?username=@alice',bob.session)).json();
    assert.equal(result.name,'Night Comet');
    assert.equal(result.username,'alice');
    await post('friends',{id:alice.profile.id,action:'request'},bob.session);
    assert.equal((await post('friends',{id:alice.profile.id,action:'accept'},bob.session)).status,409);
    assert.ok(!Object.hasOwn(await (await get('profile/'+alice.profile.id,bob.session)).json(),'links'));
    await post('friends',{id:bob.profile.id,action:'accept'},alice.session);
    const friend=await (await get('profile/'+alice.profile.id,bob.session)).json();
    assert.equal(friend.relationship,'friends');
    assert.equal(friend.wins,0);
    assert.deepEqual(friend.badges,['badgeLinked']);
    assert.equal(friend.status,'Ready to play');
    const board=await (await post('profile',{favorites:['tic','chess','tic','bad']},alice.session)).json();
    assert.deepEqual(board.favorites,['tic','chess']);
    assert.deepEqual((await (await get('profile/'+alice.profile.id,bob.session)).json()).favorites,['tic','chess']);
    const wish=await post('shop',{action:'wish',item:'test-frame',enabled:true},bob.session);
    assert.equal(wish.status,200);
    assert.equal((await (await get('profile/'+bob.profile.id,alice.session)).json()).wishlist[0].id,'test-frame');
    for(const query of ['night','@ali',alice.profile.id]){
      assert.equal((await (await get('profile/search?q='+query,bob.session)).json())[0].id,alice.profile.id);
    }
    assert.equal(friend.links.instagram,'https://www.instagram.com/example/');
    assert.ok(!Object.hasOwn(friend,'games')&&!Object.hasOwn(friend,'email')&&!Object.hasOwn(friend,'city'));
    assert.equal((await (await get('profile/search?q=Night%20Comet',bob.session)).json())[0].id,alice.profile.id);
    const imported=await (await post('profile',{importDiscord:true},alice.session)).json();
    assert.equal(imported.name,'alice');
    assert.equal(imported.id,alice.profile.id);
    assert.equal(imported.bio,'Strategy fan');
    const startImport=()=>post('start',{mode:'profile'},alice.session);
    async function finishImport(code){
      const start=await startImport();
      const url=new URL((await start.json()).url);
      assert.equal(url.searchParams.get('scope'),'identify connections');
      return fetch(base+'callback?code='+code+'&state='+url.searchParams.get('state'),{
        headers:{Cookie:alice.session+'; '+cookie(start,'saha_discord_state')},redirect:'manual'
      });
    }
    assert.equal((await post('start',{mode:'profile'})).status,401);
    assert.match((await finishImport('bob')).headers.get('location'),/importWrongAccount/);
    const completed=await finishImport('alice');
    assert.match(completed.headers.get('location'),/importComplete#account/);
    assert.equal(cookie(completed,'saha_discord_session'),undefined);
    const connections=(await (await get('profile',alice.session)).json()).links;
    assert.equal(connections.github,'https://github.com/linked-alice');
    assert.equal(connections.instagram,'https://www.instagram.com/example/');
    assert.ok(!Object.hasOwn(connections,'steam')&&!Object.hasOwn(connections,'twitch'));
    assert.ok(!Object.hasOwn(await (await get('profile/'+alice.profile.id)).json(),'links'));
    const loginSocket=async session=>{
      const client=io(hub.url,{extraHeaders:{Cookie:session},transports:['websocket'],autoConnect:false,reconnection:false});
      const hello=event(client,'hello');client.connect();await hello;return client;
    };
    const sender=await loginSocket(alice.session),receiver=await loginSocket(bob.session);
    try{
      assert.equal((await (await get('profile/'+alice.profile.id,bob.session)).json()).presence,'online');
      const avatarChanged=event(sender,'account:appearance',data=>data.avatar.includes('/avatar/'));
      const uploaded=await updateImage('avatar','PUT',sample);
      assert.equal(uploaded.status,200);
      const avatar=(await uploaded.json()).images.avatar;
      assert.equal((await avatarChanged).avatar,avatar);
      const avatarCleared=event(sender,'account:appearance',data=>!data.avatar);
      assert.equal((await updateImage('avatar','DELETE')).status,200);
      assert.equal((await avatarCleared).avatar,'');

      assert.equal((await send({socket:sender},'room:create',{game:'replica-en',name:'Word night',nickname:'alice'})).ok,true);
      for(const accept of [false,true]){
        const delivered=event(receiver,'room:inbox',items=>items.length===1);
        assert.equal((await send({socket:sender},'invite:send',{to:bob.profile.id})).ok,true);
        const [item]=await delivered;
        assert.equal(item.game,'replica-en');
        assert.equal((await send({socket:sender},'invite:reply',{key:item.key,accept})).ok,false);
        const joined=accept?event(receiver,'room',r=>r?.members.length===2):null;
        assert.equal((await send({socket:receiver},'invite:reply',{key:item.key,accept})).ok,true);
        if(joined)assert.equal((await joined).game,'replica-en');
        assert.equal((await send({socket:receiver},'invite:reply',{key:item.key,accept})).ok,false);
      }
      const a={socket:sender},b={socket:receiver};
      assert.equal((await send(a,'room:game',{game:'tic'})).ok,true);
      await send(a,'room:ready');await send(b,'room:ready');
      assert.equal((await send(a,'match:start')).ok,true);
      for(const [actor,move] of [[a,'0'],[b,'3'],[a,'1'],[b,'4'],[a,'2']]){
        assert.equal((await send(actor,'match:move',{move})).ok,true);
      }
      const logged=await (await get('profile',alice.session)).json();
      assert.equal(logged.recentGames[0].game,'tic');
      assert.equal(logged.recentGames[0].won,true);
      const gift=await post('shop',{action:'gift',item:'test-frame',to:bob.profile.id},alice.session);
      assert.equal((await gift.json()).balance,2);
      assert.deepEqual((await (await get('profile',alice.session)).json()).achievements.find(b=>b.id==='gifter'),{id:'gifter',value:1});
      assert.equal((await post('shop',{action:'gift',item:'test-frame',to:bob.profile.id},alice.session)).status,409);
      assert.equal((await send(a,'voice:join',{listen:true})).ok,true);
      assert.equal((await send(b,'voice:join',{listen:true})).ok,true);
      const cosmeticChanged=event(sender,'voice:roster',data=>data.peers.some(peer=>peer.id===bob.profile.id&&peer.decoration==='frame'));
      assert.equal((await post('shop',{action:'equip',item:'test-frame'},bob.session)).status,200);
      const decorated=(await cosmeticChanged).peers.find(peer=>peer.id===bob.profile.id);
      assert.equal(decorated.effect,'none');
      assert.ok(!Object.hasOwn(decorated,'email')&&!Object.hasOwn(decorated,'points'));
      const themed=event(sender,'voice:roster',data=>data.peers.some(peer=>peer.id===bob.profile.id&&peer.themeBottom==='#21232c'));
      const edited=await post('profile',{customTheme:true,themeTop:'#9b6b3c',themeBottom:'#21232c',frame:'double',nameStyle:'gradient'},bob.session);
      assert.equal(edited.status,200);
      const theme=(await themed).peers.find(peer=>peer.id===bob.profile.id);
      assert.equal(theme.themeTop,'#9b6b3c');
      assert.equal(theme.nameStyle,'gradient');
      assert.equal((await post('profile',{customTheme:true,themeTop:'red',themeBottom:'#21232c'},bob.session)).status,400);
      const profileTheme=await (await get('profile/'+bob.profile.id,alice.session)).json();
      assert.equal(profileTheme.frame,'double');
      assert.equal(profileTheme.themeTop,'#9b6b3c');
      assert.equal((await (await get('profile',bob.session)).json()).decoration,'frame');
      const buy=await post('shop',{action:'buy',item:'test-effect'},alice.session);
      assert.equal((await buy.json()).balance,0);
      assert.equal((await post('shop',{action:'solvePuzzle',answer:'6767'},bob.session)).status,400);
      const solved=await Promise.all(['٢٩٩٣','2993'].map(answer=>post('shop',{action:'solvePuzzle',answer},bob.session)));
      assert.deepEqual(solved.map(res=>res.status).sort(),[200,409]);
      const afterPuzzle=await (await get('shop',bob.session)).json();
      assert.equal(afterPuzzle.puzzle.solved,true);
      assert.equal(afterPuzzle.balance,24);
      const usedReward=await post('shop',{action:'buy',item:'test-effect'},bob.session);
      assert.equal((await usedReward.json()).balance,22);
      assert.equal((await (await get('profile',bob.session)).json()).points,0);
      const appearance={cosmeticSelection:{decoration:'',effect:'test-effect'}};
      assert.equal((await post('profile',appearance,bob.session)).status,200);
      const updatedProfile=await (await get('profile',bob.session)).json();
      assert.equal(updatedProfile.decoration,'none');
      assert.equal(updatedProfile.effect,'shine');
      assert.equal(updatedProfile.cosmeticItems.length,2);
      assert.equal((await post('profile',{cosmeticSelection:{effect:'not-owned'}},bob.session)).status,400);
      assert.equal((await staffAction('grantPoints',bob.profile.id,300,{reason:'Shop test credit'})).status,200);
      assert.equal((await (await get('shop',bob.session)).json()).balance,322);
      assert.equal((await send(a,'room:leave')).ok,true);
      assert.equal((await send(b,'room:leave')).ok,true);
      const created=event(receiver,'room',room=>room?.name==='Private staff test');
      assert.equal((await send(b,'room:create',{game:'tic',name:'Private staff test',nickname:'Bob',allowSpectators:false})).ok,true);
      const {code}=await created;
      const observed=event(sender,'room',room=>room?.role==='spectator');
      assert.equal((await staffAction('observe',undefined,true,{code})).status,200);
      assert.equal((await observed).spectators.find(viewer=>viewer.id===alice.profile.id).staffObserver,true);
      assert.equal((await staffAction('textMute',bob.profile.id,true,{code,reason:'Test room moderation'})).status,200);
      assert.deepEqual(await send(b,'chat:send',{text:'Test'}),{ok:false,error:'accountMuted'});
      assert.equal((await staffAction('close',undefined,true,{code,reason:'Test close'})).status,200);
    }finally{sender.disconnect();receiver.disconnect();}
    assert.equal((await staffAction('ban',bob.profile.id,true,{days:1,reason:'Test ban'})).status,200);
    assert.equal((await get('profile',bob.session)).status,401);
    assert.equal((await staffAction('ban',bob.profile.id,false,{reason:'Test clear'})).status,200);
    assert.equal((await get('profile',bob.session)).status,200);
    assert.equal((await staffAction('role',bob.profile.id,'moderator')).status,200);
    const staff=await (await get('admin?scope=staff',alice.session)).json();
    assert.deepEqual(staff.users.map(user=>user.role).sort(),['moderator','owner']);
    assert.equal((await post('admin',{action:'networkBan',id:alice.profile.id,days:1,reason:'Unauthorized'},bob.session)).status,403);
    const pendingGuest=await connect(hub);
    const kicked=event(pendingGuest.socket,'account:blocked');
    assert.equal((await staffAction('networkBan',bob.profile.id,true,{days:1,reason:'Test networkban'})).status,200);
    assert.equal(await kicked,'networkBanned');
    assert.equal((await get('profile',bob.session)).status,403);
    assert.equal((await get('profile',alice.session)).status,200);
    const blocked=await (await get('admin?scope=sanctions',alice.session)).json();
    assert.equal(blocked.networkBans.length,1);
    assert.equal(blocked.networkBans[0].player,bob.profile.id);
    assert.ok(!Object.hasOwn(blocked.networkBans[0],'key'));
    assert.equal((await staffAction('networkUnban',blocked.networkBans[0].id,false,{reason:'Test lift'})).status,200);
    assert.equal((await get('profile',bob.session)).status,200);
    assert.equal((await get('admin/audit',bob.session)).status,403);
    assert.equal((await post('admin',{action:'grantPoints',id:alice.profile.id,value:50,reason:'Unauthorized'},bob.session)).status,403);
    const grantAudit=await (await get('admin/audit?category=points',alice.session)).json();
    assert.equal(grantAudit.items[0].amount,300);
    const audit=async query=>(await get('admin/audit?'+query,alice.session)).json();
    const bans=await audit('category=bans');
    assert.ok(bans.items.some(row=>row.action==='networkUnban'));
    assert.ok(bans.items.some(row=>row.action==='ban'&&row.until>Date.now()));
    assert.ok(bans.items.every(row=>row.category==='bans'));
    const tickets=await audit('category=tickets');
    assert.deepEqual(tickets.items.filter(row=>row.subject===reportId).map(row=>row.action),['report:confirmed','report:opened']);
    assert.ok(tickets.items.every(row=>!Object.hasOwn(row,'screenshot')));
    const roles=await audit('category=roles&q=Bob&page=999');
    assert.equal(roles.page,1);
    assert.ok(roles.items.some(row=>row.from==='member'&&row.to==='moderator'));
    assert.equal((await audit('category=mutes&q=Test%20clear')).items[0].action,'mute:clear');
    await post('friends',{id:alice.profile.id,action:'remove'},bob.session);
    assert.ok(!Object.hasOwn(await (await get('profile/'+alice.profile.id,bob.session)).json(),'links'));
  }finally{await hub.close();}
});

test('orbital practice starts with a single human and three independently moving bots',async()=>{
  const hub=await launch({file:':memory:'});
  try{
    const host=await connect(hub);
    assert.equal((await send(host,'room:create',{nickname:'Pilot',name:'Practice',game:'orbit'})).ok,true);
    for(let i=0;i<3;i++)assert.equal((await send(host,'room:bot')).ok,true);
    await send(host,'room:ready');
    const moved=event(host.socket,'room',room=>room?.match?.revision>=3);
    assert.equal((await send(host,'match:start')).ok,true);
    const room=await moved;
    assert.equal(room.match.orbit.nearby.length,1);
  }finally{await hub.close();}
});

test('host starts one Among Us session for the assembled Saha room',async()=>{
  const hub=await launch({file:':memory:'});
  try{
    const host=await connect(hub),friend=await connect(hub);
    const created=event(host.socket,'room');
    await send(host,'room:create',{nickname:'Pilot',name:'Crew',game:'orbit'});
    const {code}=await created;
    await send(friend,'room:join',{nickname:'Navigator',code});
    assert.equal((await send(friend,'ship:start')).error,'forbidden');
    const opened=event(friend.socket,'room',r=>Boolean(r.shipSession));
    assert.equal((await send(host,'ship:start')).ok,true);
    const {shipSession}=await opened;
    assert.equal(shipSession.members.length,2);
    assert.equal(shipSession.size,4);
    assert.equal((await send(host,'ship:start')).error,'running');
    assert.equal((await send(host,'ship:end',{session:shipSession.id})).ok,true);
  }finally{await hub.close();}
});
