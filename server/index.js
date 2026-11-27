import {latestGames} from './activity.js';
import {restricted} from './admin.js';
import {findRoom,roomMembership} from './rooms.js';
import express from 'express';
import {configureDiscord,installDiscord} from './discord.js';
import { createVoice,readIceServers } from './voice.js';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { catalog } from '../public/catalog.js';
import { openStore } from './store.js';
import { games as defaultGames } from './games.js';
import { automaticMove, reactions } from './flow.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const invalid = code => { throw new Error(code); };
const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '') .slice(0, max) : '';

export function createHub({ file = resolve(root, 'data/hub.db'), games = defaultGames, botDelay = 600, offlineGrace = 15000, timerUnit = 1000, iceServers = readIceServers(process.env.VOICE_ICE_SERVERS), discord = configureDiscord(process.env), discordFetch, shopCatalog, ownerId } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const store = openStore(file);
  const { players, rooms, tokens } = store.state;
  for (const room of Object.values(rooms)) {
    room.spectators ??= [];
    room.allowSpectators ??= true;
    room.turnSeconds ??= 0;
    room.botFill ??= false;
  }
  const app = express();
  app.disable('x-powered-by');
  const parseJson=express.json({limit:'8kb'});
  app.use('/auth/discord',(req,res,next)=>{
    if(req.method==='POST'&&['/reports','/reports/'].includes(req.path))return next();
    return parseJson(req,res,next);
  });
  app.use(express.static(resolve(root, 'public')));
  app.use('/fonts', express.static(resolve(root, 'node_modules/@fontsource/ibm-plex-sans-arabic/files')));
  app.use('/icons', express.static(resolve(root, 'node_modules/lucide-static/icons')));
  app.use('/inter', express.static(resolve(root, 'node_modules/@fontsource-variable/inter/files')));
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192 });
  const discordAuth=installDiscord(app,store,{config:discord,fetcher:discordFetch,catalog,shopCatalog,ownerId,
    forgetGuest:id=>io.in('player:'+id).disconnectSockets(true),
    disconnectSession:key=>io.in('discord-session:'+key).disconnectSockets(true),
    profileUpdated:id=>{
      io.to('player:'+id).emit('account:appearance',{name:players[id].name,avatar:discordAuth.accountAvatar(id)});
      const room=memberRoom(id);
      if(room)voice.broadcast(room.code);
      publish(room);
    },
    profilePresence:id=>{
      if(!online(id))return {state:'offline'};
      const room=memberRoom(id);
      const game=room?.match&&!room.match.finished&&room.members.some(member=>member.id===id)?room.game:null;
      const idle=[...presence.get(id)].every(socketId=>idleSockets.has(socketId));
      return {state:game?'inGame':idle?'idle':'online',game};
    }
  });
  const invites=store.state.roomInvites??={};
  function inbox(id){
    const items=[];
    for(const [key,item] of Object.entries(invites)){
      const room=rooms[item.code];
      if(item.expires<=Date.now()||!room||!room.members.some(m=>m.id===item.from)||!discordAuth.areFriends(item.from,item.to)){
        delete invites[key];continue;
      }
      if(item.to===id)items.push({key,name:players[item.from].name,room:room.name,game:room.game,expires:item.expires});
    }
    return items;
  }
  const pushInbox=id=>io.to('player:'+id).emit('room:inbox',inbox(id));
  const presence = new Map();
  const idleSockets = new Set();
  const timersByRoom = new Map();
  const offlineSince = new Map();
  const lastReaction = new Map();
  const startup = Date.now();
  let closing = false;
  const online = id => Boolean(presence.get(id)?.size);
  const memberRoom=id=>findRoom(rooms,id);
  const playerView = id => ({ id, name: players[id].name, points: players[id].points, bot: Boolean(players[id].bot) });
  const visiblePlayer=(id,viewer)=>{
    const player=playerView(id);
    if(players[id].discordId){
      player.profile=true;
      if(!discordAuth.canSee(players[id],viewer,'stats'))delete player.points;
    }
    return player;
  };
  const voice = createVoice({memberRoom,iceServers,siteMuted:id=>restricted(players[id],'mute'),peerView:id=>{
    const p=players[id];
    return {name:p?.name??'',...(p?.discordId?{
      avatar:discordAuth.accountAvatar(id),...discordAuth.accountCosmetics(p),...discordAuth.accountTheme(p)
    }:{})};
  }});
  const connected = id => players[id]?.bot || online(id);
  const fallback = (room,id) => Boolean(room.botFill && !connected(id) && Date.now() >= (offlineSince.get(id) ?? startup) + offlineGrace);
  const roomView = (room, id) => {
    if(room.game==='orbit'&&!room.shipKey)room.shipKey=randomBytes(16).toString('hex');
    const { shipKey, match, voiceModeration, staffVoice, staffText, staffObservers, ...visible } = room;
    return {
      ...visible,
      ...(shipKey&&room.game==='orbit'&&room.members.some(p=>p.id===id)?{shipKey}:{}),
      voiceEnabled:room.voiceEnabled!==false,
      serverTime: Date.now(),
      members: room.members.map(member => ({ ...visiblePlayer(member.id,id), ready: member.ready, online: connected(member.id), controlledByBot: fallback(room,member.id) })),
      spectators: room.spectators.map(peer => ({ ...visiblePlayer(peer,id), online: online(peer), staffObserver:Boolean(staffObservers?.includes(peer)) })),
      role: room.spectators.includes(id) ? 'spectator' : 'player',
      playable: games.has(room.game),
      match: match && games.has(room.game) ? { ...games.get(room.game).view(match, id), abandoned: Boolean(match.abandoned), revision: match.revision ?? 0, matchId: match.matchId ?? room.code, phaseDuration: match.phaseDuration ?? room.turnSeconds, deadline: match.deadline ?? null, effect: match.effect ?? null } : null
    };
  };
  const dashboard = () => ({
    online: presence.size,
    enabled: [...games.keys()],
    rooms: Object.values(rooms).filter(room => room.listed).map(room => ({
      code: room.code, name: room.name, game: room.game, count: room.members.length, capacity: room.capacity, allowSpectators: room.allowSpectators, playing: Boolean(room.match && !room.match.finished), botSeats: room.members.filter(member => players[member.id].bot).length
    })),
    rankings: Object.keys(players).filter(id => players[id].name && !players[id].bot && (!players[id].discordId || discordAuth.canSee(players[id],null,'stats'))).map(id=>visiblePlayer(id,null))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 25)
  });
  function publish(room) {
    if (closing) return;
    voice.prune();
    if (room) schedule(room);
    if (room) for (const id of [...room.members.map(member => member.id), ...room.spectators]) {
      io.to('player:' + id).emit('room', roomView(room, id));
    }
    io.emit('dashboard', dashboard());
  }
  function resetDeadline(room) {
    const seconds=games.get(room.game)?.deadlineSeconds?.(room.match,room.turnSeconds) ?? room.turnSeconds;
    room.match.phaseDuration=seconds;
    room.match.deadline = seconds && !room.match.finished ? Date.now() + seconds * timerUnit : null;
  }

  function award(room) {
    const winners=room.match.winners ?? [];
    const played=room.match.startedAt?Math.min(3*3600000,Math.max(0,Date.now()-room.match.startedAt)):0;
    for (const member of room.members) {
      const player=players[member.id];
      if(!player||player.bot)continue;
      const games=player.gameStats??={};
      const stats=games[room.game]??={played:0,wins:0};
      stats.played++;
      if(!room.match.abandoned)player.playedMs=(player.playedMs??0)+played;
      const won=winners.includes(player.id);
      player.recentGames=latestGames([{game:room.game,at:Date.now(),won,
        outcome:room.match.abandoned?'abandoned':won?'win':winners.length?'loss':'draw'},...(player.recentGames??[])]);
      if(winners.includes(player.id)) {stats.wins++;player.points+=3;}
    }
  }

  function move(room, id, input, automated = false) {
    const game = games.get(room.game);
    const previous = room.match;
    const next = game.move(structuredClone(previous), id, input,{automated});
    if (!next) return false;
    next.revision = (previous.revision ?? 0) + 1;
    const effect = { type: 'move', automated };
    if (room.game === 'chess') {
      Object.assign(effect,{ from:input.slice(0,2), to:input.slice(2,4) });
      const last = game.view(next,id).history?.at(-1);
      if (last?.startsWith('O-O')) {
        const long = last.startsWith('O-O-O');
        effect.rook = { from:(long ? 'a' : 'h') + input[1], to:(long ? 'd' : 'f') + input[1] };
      }
    }
    if (next.board && previous.board) effect.changed = next.board.flatMap((cell,index) => cell === previous.board[index] ? [] : [index]);
    if (room.game === 'ludo') {
      const captured = next.pawns.some((pawns, seat) => seat !== previous.turn && pawns.some((step, index) => step < 0 && previous.pawns[seat][index] >= 0));
      if (input !== 'roll') {
        const pawn = Number(input);
        effect.pawn = { seat:previous.turn, index:pawn, from:previous.pawns[previous.turn][pawn], to:next.pawns[previous.turn][pawn] };
      }
      effect.type = input === 'roll' ? 'roll' : captured ? 'capture' : next.pawns[previous.turn][Number(input)] === 57 ? 'home' : 'hop';
    }
    if (room.game === 'color') {
      effect.type = input === 'draw' ? 'draw' : next.discard.at(-1)[1];
      effect.color = next.color;
    }
    if (room.game === 'tarneeb') effect.type = previous.phase === 'trump' ? 'trump' : previous.phase === 'play' ? 'card' : 'bid';
    if (room.game === 'domino') {
      effect.type = input === 'draw' ? 'draw' : input === 'pass' ? 'pass' : 'tile';
      if (effect.type === 'tile') effect.side = input.endsWith(':l') ? 'left' : 'right';
    }
    next.effect = effect;
    next.automationAt = Date.now();
    room.match = next;
    const sameTurn = !next.finished && next.turn === previous.turn &&
      (room.game === 'ludo' && input === 'roll' || room.game === 'domino' && input === 'draw' || room.game === 'checkers' || game.concurrent && next.phase === previous.phase && next.round === previous.round);
    if (!sameTurn) resetDeadline(room);
    else if (automated && previous.deadline && Date.now() >= previous.deadline) next.deadline = Date.now() + Math.min(1000,botDelay);
    if (next.finished) award(room);
    return true;
  }

  function schedule(room) {
    clearTimeout(timersByRoom.get(room.code));
    timersByRoom.delete(room.code);
    const match = room.match;
    const actor = match?.players?.[match.turn];
    if (closing || match?.finished || !actor) return;
    const now = Date.now();
    const engine=games.get(room.game);
    if(engine?.practiceMove){
      const interval=Math.max(1200,botDelay);
      const seats=match.players.filter(id=>players[id]?.bot);
      const nextAt=id=>(match.practiceTimes?.[id]??match.startedAt??startup)+interval;
      const deadline=match.deadline||Infinity;
      const due=Math.min(deadline,...seats.map(nextAt));
      if(!Number.isFinite(due))return;
      const handle=setTimeout(()=>{
        timersByRoom.delete(room.code);
        if(closing||room.match!==match)return;
        let changed=false;
        if(deadline<=Date.now()){
          changed=move(room,actor,engine.timeoutMove(match),true);
        }else{
          for(const id of seats){
            if(room.match.finished||nextAt(id)>Date.now())continue;
            const state=room.match;
            (state.practiceTimes??={})[id]=Date.now();
            const input=engine.practiceMove(state,id);
            if(input&&move(room,id,input,true))changed=true;
          }
        }
        if(changed){store.save();publish(room);}
        schedule(room);
      },Math.max(0,due-now));
      handle.unref();timersByRoom.set(room.code,handle);return;
    }
    const bot = !engine?.humanOnly && players[actor]?.bot;
    const offlineAt = !engine?.humanOnly && !connected(actor) && room.botFill ? (offlineSince.get(actor) ?? startup) + offlineGrace : Infinity;
    const due = Math.min(match.deadline || Infinity, bot ? (match.automationAt ?? startup) + botDelay : Math.max(offlineAt, match.automationAt ?? startup) + botDelay);
    if (!Number.isFinite(due)) return;
    const handle = setTimeout(() => {
      timersByRoom.delete(room.code);
      if (closing || rooms[room.code]?.match !== match) return;
      const timedOut = Boolean(match.deadline && Date.now() >= match.deadline);
      if (!timedOut && !bot && !fallback(room,actor)) { schedule(room); return; }
      try {
        const game = games.get(room.game);
        const input = timedOut && game.timeoutMove ? game.timeoutMove(match) : automaticMove(room.game,game,match,actor,timedOut);
        if (input !== null && move(room,actor,input,true)) { store.save(); publish(room); }
      } catch (error) {
        console.error('Automatic move failed for',room.code,error);
      }
    },Math.max(0,due-now));
    handle.unref();
    timersByRoom.set(room.code,handle);
  }

  function startMatch(room, requireReady) {
    const game = games.get(room.game);
    if (!game) invalid('unavailable');
    if (room.match && !room.match.finished) invalid('running');
    const { min } = catalog.find(entry => entry.id === room.game);
    if (game.humanOnly && room.members.some(member=>players[member.id].bot)) invalid('notReady');
    if (room.members.length < min || !room.members.every(member =>
      players[member.id].bot || ((!requireReady || member.ready) && (online(member.id) || (!requireReady && room.botFill))))) invalid('notReady');
    room.match = game.start(room.members.map(member => member.id));
    Object.assign(room.match,{ matchId:randomUUID(), revision:0, startedAt:Date.now(), automationAt:Date.now() });
    room.members.forEach(member => { member.ready = false; });
    resetDeadline(room);
    return room;
  }

  function changeRoomGame(room,game){
      if (room.match && !room.match.finished) invalid('running');
      const entry = catalog.find(item => item.id === game && games.has(game));
      if (!entry) invalid('badRoom');
      if (room.members.filter(member => !players[member.id].bot).length > entry.max) invalid('tooManyPlayers');
      while (room.members.length > entry.max || entry.humanOnly && room.members.some(member=>players[member.id].bot)) {
        const index = room.members.findLastIndex(member => players[member.id].bot);
        const [bot] = room.members.splice(index,1);
        delete players[bot.id];
      }
      delete room.shipSession;
      room.game = entry.id;
      room.capacity = entry.max;
      room.match = null;
      room.members.forEach(member => { member.ready = false; });
      return room;
  }

  function closeRoom(room){
    clearTimeout(timersByRoom.get(room.code));
    timersByRoom.delete(room.code);
    for(const id of [...room.members.map(m=>m.id),...room.spectators]){
      if(players[id]?.bot)delete players[id];
      io.to('player:'+id).emit('room',null);
    }
    delete rooms[room.code];
  }
  function evict(room,id){
    if(room.members.some(m=>m.id===id)){
      if(room.match&&!room.match.finished){
        Object.assign(room.match,{finished:true,abandoned:true,winners:[],deadline:null,revision:(room.match.revision??0)+1});
        room.members.forEach(member=>{member.ready=false;});
      }
      if(room.shipSession?.members.includes(id))delete room.shipSession;
      room.members=room.members.filter(m=>m.id!==id);
      const successor=room.members.find(member=>!players[member.id].bot);
      if(!successor){closeRoom(room);return;}
      if(room.host===id){delete room.shipSession;room.host=successor.id;}
    }
    room.spectators=room.spectators.filter(peer=>peer!==id);
    if(room.staffObservers)room.staffObservers=room.staffObservers.filter(peer=>peer!==id);
    io.to('player:'+id).emit('room',null);
  }
  discordAuth.installAdmin({
    observe(id,room){
      const prior=memberRoom(id);
      if(prior===room)return true;
      if(prior)return false;
      room.spectators.push(id);
      (room.staffObservers??=[]).push(id);
      return true;
    },
    edit(room,patch){
      const name=clean(patch.name,40);
      if(!name||['listed','allowSpectators','voiceEnabled'].some(key=>typeof patch[key]!=='boolean'))invalid('adminInvalid');
      if(patch.game!==room.game)changeRoomGame(room,patch.game);
      Object.assign(room,{name,listed:patch.listed,allowSpectators:patch.allowSpectators,voiceEnabled:patch.voiceEnabled});
    },
    moderate(room,id,action,value){
      if(action==='kick')evict(room,id);
      else if(action==='textMute'){
        const muted=room.staffText??={};
        if(value)muted[id]=true;
        else delete muted[id];
      }else voice.moderate(room,{id,field:action==='voiceMute'?'hostMuted':'hostDeaf',value},true);
    },
    close:closeRoom,
    publish:room=>publish(rooms[room.code]),
    mute(id){const room=memberRoom(id);if(room)voice.broadcast(room.code);},
    banNetwork(net){
      for(const peer of io.sockets.sockets.values()){
        if(peer.data.network!==net||discordAuth.staff.level(players[peer.data.account])===4)continue;
        peer.emit('account:blocked','networkBanned');
        peer.disconnect(true);
      }
    },
    ban(id){
      const room=memberRoom(id);
      if(room)evict(room,id);
      store.save();
      io.to('player:'+id).emit('account:blocked');
      io.in('player:'+id).disconnectSockets(true);
      publish(room&&rooms[room.code]);
    }
  });
  const expiredMutes=setInterval(()=>{
    for(const user of Object.values(players)){
      const until=user.sanctions?.mute?.until;
      if(until&&until<=Date.now()){
        delete user.sanctions.mute;
        const room=memberRoom(user.id);
        if(room)voice.broadcast(room.code);
      }
    }
  },1000);
  expiredMutes.unref();
  for (const room of Object.values(rooms)) schedule(room);
  io.on('connection', socket => {
    const identity=discordAuth.identify(socket.request.headers.cookie,true);
    const net=discordAuth.fingerprint(socket.request.socket.remoteAddress);
    if(discordAuth.network.active(net)&&discordAuth.staff.level(players[identity?.id])<4){
      socket.emit('account:blocked','networkBanned');socket.disconnect(true);return;
    }
    socket.data.network=net;
    socket.data.account=identity?.id;
    if(identity&&restricted(players[identity.id],'ban')){socket.emit('account:blocked');socket.disconnect(true);return;}
    const supplied = socket.handshake.auth?.token;
    const token = identity ? null : typeof supplied === 'string' && Object.hasOwn(tokens,supplied) &&
      !players[tokens[supplied]]?.discordId ? supplied : randomBytes(32).toString('hex');
    const profile = players[identity?.id ?? tokens[token]] ?? {id:randomUUID(),name:'',points:0,siteJoinedAt:Date.now()};
    if (identity) socket.join('discord-session:'+identity.key);
    else if (!tokens[token]) {
      tokens[token]=profile.id;
      players[profile.id]=profile;
      store.save();
    }
    // A public ID can never authenticate a player.
    const id = profile.id;
    if(identity&&net&&profile.lastNetwork!==net){profile.lastNetwork=net;store.save();}
    voice.attach(socket,id);
    const existing = presence.get(id) ?? new Set();
    existing.add(socket.id);
    presence.set(id, existing);
    offlineSince.delete(id);
    socket.join('player:' + id);
    const current = memberRoom(id);
    socket.emit('hello', { token, discord:Boolean(identity), player: {...playerView(id),avatar:identity?discordAuth.accountAvatar(id):''}, room: current ? roomView(current, id) : null });
    if(identity)pushInbox(id);
    publish(current);

    let times = [];
    function on(event, action) {
      socket.on(event, (payload, ack) => {
        if (typeof ack !== 'function') return;
        if(restricted(players[id],'ban'))return ack({ok:false,error:'accountBanned'});
        const now = Date.now();
        times = times.filter(time => now - time < 5000);
        if (times.length >= 20) return ack({ ok: false, error: 'slow' });
        times.push(now);
        try {
          const room = action(payload && typeof payload === 'object' ? payload : {});
          store.save();
          ack({ ok: true });
          publish(room);
        } catch (error) {
          const known = ['badName','badRoom','badCode','full','already','noRoom','badMessage','slow','forbidden','unavailable','notReady','badMove','running','spectatorsDisabled','spectatorsFull','badReaction','stale','tooManyPlayers','accountMuted'];
          if (!known.includes(error.message)) console.error(error);
          ack({ ok: false, error: known.includes(error.message) ? error.message : 'serverError' });
        }
      });
    }
    function requireRoom() { return memberRoom(id) ?? invalid('noRoom'); }
    function named(value) {
      const name = clean(value, 24);
      if (name.length < 2) invalid('badName');
      return name;
    }
    function ensureFree() { if (memberRoom(id)) invalid('already'); }
    const {createRoom,joinRoom}=roomMembership({rooms,players,clean,invalid,id,identity,ensureFree,named});
    on('room:create',createRoom);
    on('room:join',joinRoom);
    on('voice:settings',data=>{
      const room=requireRoom();
      if(room.host!==id||typeof data.enabled!=='boolean')invalid('forbidden');
      room.voiceEnabled=data.enabled;
      return room;
    });
    on('voice:moderate',data=>{
      const room=requireRoom();
      if(room.host!==id||!voice.moderate(room,data))invalid('forbidden');
      return room;
    });
    on('invite:send',data=>{
      const room=requireRoom();
      if(!identity||!room.members.some(m=>m.id===id)||typeof data.to!=='string'||!discordAuth.areFriends(id,data.to))invalid('forbidden');
      if(memberRoom(data.to)===room)invalid('already');
      if(room.match&&!room.match.finished)invalid('running');
      if(room.members.length>=room.capacity&&!room.members.some(m=>players[m.id].bot))invalid('full');
      inbox(data.to);
      if(!Object.values(invites).some(i=>i.from===id&&i.to===data.to&&i.code===room.code)){
        invites[randomBytes(16).toString('hex')]={from:id,to:data.to,code:room.code,expires:Date.now()+600000};
      }
      pushInbox(data.to);
    });
    on('invite:reply',data=>{
      if(!identity||typeof data.key!=='string'||!inbox(id).some(i=>i.key===data.key)||typeof data.accept!=='boolean')invalid('unavailable');
      const item=invites[data.key];
      const room=data.accept?joinRoom({code:item.code,nickname:players[id].name}):null;
      delete invites[data.key];
      pushInbox(id);
      return room;
    });
    on('room:leave', () => {
      const room = requireRoom();
      if (room.spectators.includes(id)) {
        room.spectators = room.spectators.filter(entry => entry !== id);
        if(room.staffObservers)room.staffObservers=room.staffObservers.filter(entry=>entry!==id);
        io.to('player:' + id).emit('room', null);
        return room;
      }
      if (room.match && !room.match.finished) invalid('running');
      room.members = room.members.filter(member => member.id !== id);
      if (room.match?.finished) room.match = null;
      io.to('player:' + id).emit('room', null);
      if (!room.members.some(member => !players[member.id].bot)) {
        for (const member of room.members) delete players[member.id];
        clearTimeout(timersByRoom.get(room.code));
        timersByRoom.delete(room.code);
        for (const spectator of room.spectators) io.to('player:' + spectator).emit('room', null);
        delete rooms[room.code];
        return;
      }
      if (room.host === id) {
        room.host=room.members.find(member=>!players[member.id].bot).id;
        if(room.voiceModeration)delete room.voiceModeration[room.host];
      }
      return room;
    });
    on('room:ready', () => {
      const room = requireRoom();
      if (room.match && !room.match.finished) invalid('running');
      const member = room.members.find(entry => entry.id === id);
      if (!member) invalid('forbidden');
      member.ready = !member.ready;
      return room;
    });
    on('chat:send', ({ text }) => {
      const room = requireRoom();
      if(restricted(players[id],'mute')||room.staffText?.[id])invalid('accountMuted');
      const message = clean(text, 300);
      if (!message) invalid('badMessage');
      room.chat.push({ id: randomUUID(), author: players[id].name, text: message, time: Date.now() });
      if (room.chat.length > 75) room.chat.shift();
      return room;
    });
    function hostRoom() {
      const room = requireRoom();
      if (room.host !== id) invalid('forbidden');
      return room;
    }
    on('ship:start',()=>{
      const room=hostRoom();
      if(room.game!=='orbit'||room.match&&!room.match.finished)invalid('unavailable');
      if(room.shipSession)invalid('running');
      const seats=room.members.filter(m=>!players[m.id].bot);
      if(seats.some(m=>!connected(m.id)))invalid('notReady');
      room.shipKey=randomBytes(16).toString('hex');
      room.shipSession={id:randomUUID(),members:seats.map(m=>m.id),size:Math.max(4,room.members.length)};
      return room;
    });
    on('ship:end',({session})=>{
      const room=hostRoom();
      if(!room.shipSession||room.shipSession.id!==session)invalid('stale');
      delete room.shipSession;return room;
    });
    on('match:start', () => startMatch(hostRoom(),true));
    on('match:rematch', () => {
      const room = hostRoom();
      if (!room.match?.finished) invalid('unavailable');
      return startMatch(room,false);
    });
    on('room:game',({game})=>changeRoomGame(hostRoom(),game));
    on('room:bot', () => {
      const room = hostRoom();
      if (games.get(room.game)?.humanOnly) invalid('unavailable');
      if (room.match && !room.match.finished) invalid('running');
      if (room.members.length >= room.capacity) invalid('full');
      const id = randomUUID();
      players[id] = { id, name: 'AI ' + (room.members.filter(member => players[member.id].bot).length + 1), points:0, bot:true };
      room.members.push({ id, ready:true });
      room.match = null;
      return room;
    });
    on('room:removeBot', ({ playerId }) => {
      const room = hostRoom();
      if (room.match && !room.match.finished) invalid('running');
      if (!room.members.some(member => member.id === playerId && players[playerId].bot)) invalid('forbidden');
      room.members = room.members.filter(member => member.id !== playerId);
      delete players[playerId];
      room.match = null;
      return room;
    });
    on('room:reaction', ({ emoji }) => {
      const room = requireRoom();
      if (!reactions.includes(emoji)) invalid('badReaction');
      const now = Date.now();
      if (now - (lastReaction.get(id) ?? 0) < 900) invalid('slow');
      lastReaction.set(id,now);
      room.reaction = { id:randomUUID(), playerId:id, name:players[id].name, emoji, time:now };
      return room;
    });
    on('match:resign', () => {
      const room = requireRoom();
      const seat = room.members.findIndex(member => member.id === id);
      if (seat < 0) invalid('forbidden');
      if (!room.match || room.match.finished) invalid('unavailable');
      const winners = room.members.filter((member, index) => (room.game === 'tarneeb' && index % 2 !== seat % 2) || (room.members.length === 2 && member.id !== id));
      room.match.finished = true;
      room.match.abandoned = winners.length === 0;
      room.match.winners = winners.map(member => member.id);
      room.match.deadline = null;
      room.match.revision = (room.match.revision ?? 0) + 1;
      room.match.effect = { type:'resign' };
      award(room);
      room.members.forEach(member => { member.ready = false; });
      return room;
    });
    on('match:move', ({ move:input, revision, matchId }) => {
      const room = requireRoom();
      if (!room.match || room.match.finished) invalid('unavailable');
      if (!room.members.some(member => member.id === id)) invalid('forbidden');
      const concurrent=games.get(room.game)?.concurrent;
      if ((concurrent ? matchId!==room.match.matchId : revision !== undefined && revision !== room.match.revision) ||
        (matchId && matchId!==room.match.matchId)) invalid('stale');
      if (room.match.deadline && Date.now() >= room.match.deadline) invalid('stale');
      if (!move(room,id,input)) invalid('badMove');
      return room;
    });
    if(identity)socket.on('profile:idle',idle=>{
      if(idle===true)idleSockets.add(socket.id);
      if(idle===false)idleSockets.delete(socket.id);
    });
    socket.on('disconnect', () => {
      idleSockets.delete(socket.id);
      existing.delete(socket.id);
      if (!existing.size) { presence.delete(id); offlineSince.set(id,Date.now()); lastReaction.delete(id); }
      publish(memberRoom(id));
    });
  });
  return { http, close: () => {
    closing = true;
    clearInterval(expiredMutes);
    timersByRoom.forEach(clearTimeout);
    return new Promise(resolveClose => io.close(() => { store.close(); resolveClose(); }));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3000);
  createHub({ file: process.env.DATA_FILE }).http.listen(port, process.env.HOST ?? '0.0.0.0', () => {
    console.log('Saha · http://localhost:' + port);
  });
}


