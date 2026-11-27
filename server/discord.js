import {publicConnectionLinks} from './discord-connections.js';
import {networkBans} from './network-bans.js';
import {createAdministration,restricted} from './admin.js';
import {prepareEarlyMembers,registerEarlyMember} from './badges.js';
import {installReports} from './reports.js';
import {readShop,setupShop} from './shop.js';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {handle,setupProfiles} from './profiles.js';

const stateCookie='saha_discord_state';
const sessionCookie='saha_discord_session';
const pendingLife=5*60*1000;
const sessionLife=30*24*60*60*1000;
const random=()=>randomBytes(32).toString('base64url');
const hash=value=>createHash('sha256').update(value).digest('base64url');

function appearance(identity){
    const asset=(kind,hash)=>typeof hash==='string'&&/^(?:a_)?[a-f0-9]{32}$/.test(hash)
      ? 'https://cdn.discordapp.com/'+kind+'/'+identity.id+'/'+hash+'.webp' : '';
    return {
      name:String(identity.global_name||identity.username||'').trim().slice(0,24),
      avatar:asset('avatars',identity.avatar),banner:asset('banners',identity.banner),
      accent:Number.isInteger(identity.accent_color)&&identity.accent_color>=0&&identity.accent_color<=0xffffff
        ? '#'+identity.accent_color.toString(16).padStart(6,'0') : null
    };
}

function cookie(header,name) {
  const pair=(header ?? '').split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='));
  return pair?.slice(name.length+1) ?? '';
}

export function configureDiscord(env) {
  if(!env.DISCORD_CLIENT_SECRET) return null;
  return {
    clientId:env.DISCORD_CLIENT_ID || '1567653785071779850',
    clientSecret:env.DISCORD_CLIENT_SECRET,
    redirectUri:env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback'
  };
}

export function installDiscord(app,store,{config,fetcher=fetch,forgetGuest,disconnectSession,profileUpdated,profilePresence,catalog,ownerId=process.env.SAHA_OWNER_DISCORD_ID,shopCatalog=readShop(process.env.SHOP_CATALOG)}={}) {
  const network=networkBans(store.state,process.env.SAHA_NETWORK_KEY||config?.clientSecret);
  const staff=createAdministration(store,ownerId,network);
  const pending=new Map();
  const {players,tokens}=store.state;
  const sessions=store.state.discordSessions ??= {};
  const redirect=config ? new URL(config.redirectUri) : null;
  if(redirect && (redirect.pathname!=='/auth/discord/callback' || redirect.search || redirect.hash ||
    (redirect.protocol!=='https:' && !(redirect.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(redirect.hostname))))) {
    throw new Error('Discord redirect must use /auth/discord/callback and HTTPS outside localhost');
  }
  const fingerprint=address=>{
    // A loopback reverse proxy presents the same address for every visitor.
    if(redirect?.protocol==='https:'&&/^(?:::ffff:)?(?:127\.|::1$)/i.test(address??''))return null;
    return network.fingerprint(address);
  };
  const cookieSettings={httpOnly:true,sameSite:'lax',secure:redirect?.protocol==='https:',path:'/'};
  const sessionKey=header=>hash(cookie(header,sessionCookie));
  function identify(header,includeBanned=false) {
    const key=sessionKey(header);
    const session=sessions[key];
    return session && session.expires>Date.now() && players[session.id]?.discordId && (includeBanned||!restricted(players[session.id],'ban')) ? {id:session.id,key} : null;
  }
  function dropSession(header) {
    const key=sessionKey(header);
    if (!sessions[key]) return;
    delete sessions[key];
    store.save();
    disconnectSession?.(key);
  }
  function guard(req,res) {
    res.set('Cache-Control','no-store');
    if(!config) {res.status(503).json({error:'discordDisabled'});return false;}
    if(req.get('origin')!==redirect.origin) {res.status(403).json({error:'discordOrigin'});return false;}
    return true;
  }
  app.use('/auth/discord',(req,res,next)=>{
    if(['/start','/callback','/logout','/status'].includes(req.path))return next();
    const id=identify(req.headers.cookie)?.id;
    if(staff.level(players[id])<4&&network.active(fingerprint(req.socket.remoteAddress))){
      return res.set('Cache-Control','no-store').status(403).json({error:'networkBanned'});
    }
    return next();
  });
  app.get('/auth/discord/status',(req,res)=>res.set('Cache-Control','no-store').json({
    enabled:Boolean(config),signedIn:Boolean(identify(req.headers.cookie))
  }));
  app.post('/auth/discord/start',(req,res)=>{
    if(!guard(req,res)) return;
    const importing=req.body?.mode==='profile';
    const account=importing?identify(req.headers.cookie):null;
    if(importing&&!account)return res.status(401).json({error:'discordLogin'});
    const now=Date.now();
    for(const [key,attempt] of pending) if(attempt.expires<=now) pending.delete(key);
    if(pending.size>=1000) return res.status(429).json({error:'slow'});
    const state=random();
    const verifier=random();
    const guest=typeof req.body?.guest==='string' && req.body.guest.length<=128 ? req.body.guest : '';
    const id=Object.hasOwn(tokens,guest) ? tokens[guest] : null;
    pending.delete(cookie(req.headers.cookie,stateCookie));
    pending.set(state,{guest,id,verifier,account,expires:now+pendingLife});
    const url=new URL('https://discord.com/oauth2/authorize');
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:redirect.href,response_type:'code',
      scope:importing?'identify connections':'identify email',prompt:'consent',state,code_challenge:hash(verifier),code_challenge_method:'S256'});
    res.cookie(stateCookie,state,{...cookieSettings,maxAge:pendingLife});
    return res.json({url:url.href});
  });
  app.get('/auth/discord/callback',async (req,res)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    if(!config) return res.redirect('/?discord=discordDisabled');
    const {state,code,error,iss}=req.query;
    const bound=cookie(req.headers.cookie,stateCookie);
    const attempt=typeof state==='string' && bound===state ? pending.get(state) : null;
    if(!attempt || attempt.expires<Date.now()) return res.redirect('/?discord=discordFailed');
    pending.delete(state);
    res.clearCookie(stateCookie,cookieSettings);
    const back=message=>res.redirect('/?discord='+message+(attempt.account?'#account':''));
    if(attempt.account&&identify(req.headers.cookie)?.key!==attempt.account.key)return back('discordFailed');
    if (error==='access_denied') return back('discordCancelled');
    if(typeof code!=='string' || code.length>2048 || (iss && iss!=='https://discord.com')) return res.redirect('/?discord=discordFailed');
    try {
      const tokenResponse=await fetcher('https://discord.com/api/oauth2/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect.href,
          client_id:config.clientId,client_secret:config.clientSecret,code_verifier:attempt.verifier}),
        signal:AbortSignal.timeout(8000)
      });
      if(!tokenResponse.ok) throw new Error('Discord token exchange failed');
      const {access_token}=await tokenResponse.json();
      if(typeof access_token!=='string') throw new Error('Discord token missing');
      const userResponse=await fetcher('https://discord.com/api/v10/users/@me',{
        headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(8000)
      });
      if(!userResponse.ok) throw new Error('Discord identity lookup failed');
      const identity=await userResponse.json();
      if(typeof identity.id!=='string' || !/^\d{15,22}$/.test(identity.id)) throw new Error('Discord identity invalid');
      let profile=Object.values(players).find(player=>player.discordId===identity.id);
      const net=fingerprint(req.socket.remoteAddress);
      if(network.active(net)&&identity.id!==ownerId)return res.redirect('/?discord=networkBanned');
      if(restricted(profile,'ban'))return back('accountBanned');
      if(attempt.account){
        if(profile?.id!==attempt.account.id)return back('importWrongAccount');
        const connections=await fetcher('https://discord.com/api/v10/users/@me/connections',{
          headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(8000)
        });
        if(!connections.ok)return back('importConnectionsFailed');
        const links=publicConnectionLinks(await connections.json());
        if(identify(req.headers.cookie)?.key!==attempt.account.key)return back('discordFailed');
        profiles.importAppearance(profile,appearance(identity),links);
        return back('importComplete');
      }
      let linkedGuest=false;
      if(!profile) {
        const guest=attempt.id && tokens[attempt.guest]===attempt.id && players[attempt.id];
        profile=guest && !guest.discordId && !guest.bot ? guest : {id:randomUUID(),name:'',points:0};
        linkedGuest=profile===guest;
        profile.discordId=identity.id;
        if(!profile.name) {
          const display=identity.global_name || identity.username;
          profile.name=typeof display==='string' ? display.trim().slice(0,24) : '';
        }
        players[profile.id]=profile;
        if(linkedGuest) for(const [token,id] of Object.entries(tokens)) if(id===profile.id) delete tokens[token];
      }
      profile.discordAppearance=appearance(identity);
      if(net)profile.lastNetwork=net;
      registerEarlyMember(store,profile);
      profile.siteJoinedAt??=profile.joinedAt??Date.now();
      if(handle(identity.username)) profile.discordHandle=identity.username;
      if(identity.verified===true && typeof identity.email==='string') {
        const address=identity.email.trim().toLowerCase();
        if(address.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) profile.recoveryEmail=address;
      }
      dropSession(req.headers.cookie);
      for(const [key,session] of Object.entries(sessions)) if(session.expires<=Date.now()) delete sessions[key];
      const value=random();
      sessions[hash(value)]={id:profile.id,expires:Date.now()+sessionLife};
      store.save();
      if(linkedGuest) forgetGuest?.(profile.id);
      res.cookie(sessionCookie,value,{...cookieSettings,maxAge:sessionLife});
      return res.redirect('/?discord=discordSuccess');
    } catch {
      return back('discordFailed');
    }
  });
  prepareEarlyMembers(store);
  const profiles=setupProfiles({app,store,identify,guard,onUpdate:profileUpdated,presence:profilePresence,catalog,shopCatalog,ownerId,staff});
  installReports({app,store,identify,guard,ownerId,staff});
  setupShop({app,store,identify,guard,areFriends:profiles.areFriends,catalog:shopCatalog,onEquip:profileUpdated});
  app.post('/auth/discord/logout',(req,res)=>{
    if(!guard(req,res)) return;
    dropSession(req.headers.cookie);
    res.clearCookie(sessionCookie,cookieSettings);
    return res.json({ok:true});
  });
  return {identify,staff,network,fingerprint,installAdmin:roomOps=>staff.install(app,{identify,guard,roomOps}),...profiles};
}
