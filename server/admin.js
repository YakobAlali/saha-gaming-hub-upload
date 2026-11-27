const DAY=86400000;
const auditCategories={
  ban:'bans',networkBan:'bans',networkUnban:'bans',report:'tickets',role:'roles',mute:'mutes',voiceMute:'mutes',voiceDeaf:'mutes',
  textMute:'mutes',kick:'rooms',observe:'rooms',edit:'rooms',close:'rooms',plus:'plus',grantPoints:'points'
};
const auditCategory=action=>auditCategories[action.split(':')[0]]??'other';
const auditPageSize=25;
const levels={member:0,helper:1,shopkeeper:1,moderator:2,admin:3,owner:4};
export const restricted=(player,type)=>Boolean(player?.sanctions?.[type]?.until>Date.now());

export function createAdministration(store,ownerId,network){
  const {players,rooms}=store.state;
  const role=p=>ownerId&&p?.discordId===ownerId?'owner':p?.discordId&&['helper','shopkeeper','moderator','admin'].includes(p.staffRole)?p.staffRole:'member';
  const level=p=>levels[role(p)];
  const roster=room=>[...room.members.map(member=>member.id),...room.spectators];
  const target=(map,id)=>typeof id==='string'&&Object.hasOwn(map,id)?map[id]:null;
  const current=(p,type)=>restricted(p,type)?p.sanctions[type]:null;
  function log(actor,action,subject,reason='',details={}){
    const rows=store.state.staffAudit??=[];
    const category=auditCategory(action);
    rows.unshift({actor:actor.id,actorName:actor.name,action,subject,reason,at:Date.now(),...details});
    let count=0;
    store.state.staffAudit=rows.filter(row=>auditCategory(row.action)!==category||++count<=500);
  }
  const grantLimit=p=>({owner:10000,admin:200,shopkeeper:100}[role(p)]??0);
  function grantPoints(actor,user,amount,reason){
    const limit=grantLimit(actor);
    if(!limit||!user?.discordId||(role(actor)!=='owner'&&level(actor)<=level(user)))return 'forbidden';
    if(!Number.isSafeInteger(amount)||amount<1||amount>limit||!reason)return 'adminInvalid';
    const day=new Date().toISOString().slice(0,10);
    const used=actor.shopGrants?.day===day?actor.shopGrants.used:0;
    if(role(actor)!=='owner'&&used+amount>limit)return 'shopGrantLimit';
    const credit=(user.shopGrantedPoints??0)+amount;
    if(!Number.isSafeInteger(credit))return 'adminInvalid';
    if(role(actor)!=='owner')actor.shopGrants={day,used:used+amount};
    user.shopGrantedPoints=credit;
    log(actor,'grantPoints',user.id,reason,{subjectName:user.name,amount});
    store.save();
    return null;
  }
  function install(app,{identify,guard,roomOps}){
    const path='/auth/discord/admin';
    const read=(req,res)=>{
      res.set('Cache-Control','no-store');
      return players[identify(req.headers.cookie)?.id];
    };
    app.get(path+'/access',(req,res)=>res.json({role:role(read(req,res))}));
    app.get(path+'/audit',(req,res)=>{
      const actor=read(req,res);
      if(level(actor)<3)return res.status(403).json({error:'forbidden'});
      const category=typeof req.query.category==='string'?req.query.category:'all';
      const search=typeof req.query.q==='string'?req.query.q.trim().toLowerCase().slice(0,100):'';
      const matches=(store.state.staffAudit??[]).flatMap(row=>{
        const group=auditCategory(row.action);
        if(category!=='all'&&category!==group)return [];
        const subjectName=row.subjectName??players[row.subject]?.name??'';
        if(search&&![row.actorName,row.actor,row.subject,subjectName,row.reason].some(value=>value?.toLowerCase().includes(search)))return [];
        return [{...row,category:group,subjectName}];
      });
      const page=Math.min(Math.max(1,Math.ceil(matches.length/auditPageSize)),Math.max(1,Math.floor(Number(req.query.page))||1));
      return res.json({items:matches.slice((page-1)*auditPageSize,page*auditPageSize),page,total:matches.length,pageSize:auditPageSize});
    });
    app.get(path,(req,res)=>{
      const actor=read(req,res);
      if(level(actor)<1)return res.status(403).json({error:'forbidden'});
      const q=typeof req.query.q==='string'?req.query.q.trim().toLowerCase().replace(/^@/,'').slice(0,64):'';
      const scope=['users','staff','sanctions'].includes(req.query.scope)?req.query.scope:'users';
      const matches=Object.values(players).filter(p=>p.discordId&&(!q||[p.id,p.name,p.discordHandle].some(v=>v?.toLowerCase().includes(q)))&&
        (scope!=='staff'||level(p)>0)&&(scope!=='sanctions'||restricted(p,'ban')||restricted(p,'mute')));
      const page=Math.min(Math.max(1,Math.ceil(matches.length/50)),Math.max(1,Math.floor(Number(req.query.page))||1));
      const users=matches.slice((page-1)*50,page*50).map(p=>({id:p.id,name:p.name,username:p.discordHandle,role:role(p),
        ban:current(p,'ban'),mute:current(p,'mute'),manageable:level(actor)>level(p)&&actor.id!==p.id,
        ...(level(actor)===4?{canNetworkBan:Boolean(p.lastNetwork)}:{})}));
      const activeRooms=(role(actor)==='shopkeeper'?[]:Object.values(rooms)).map(room=>({code:room.code,name:room.name,game:room.game,listed:room.listed,
        allowSpectators:room.allowSpectators,voiceEnabled:room.voiceEnabled!==false,running:Boolean(room.match&&!room.match.finished),
        people:roster(room).flatMap(id=>{
          const p=players[id];
          return !p||p.bot?[]:[{id,name:p.name,role:role(p),host:room.host===id,manageable:level(actor)>level(p)&&actor.id!==id,
            voiceMuted:Boolean(room.staffVoice?.[id]?.hostMuted),deafened:Boolean(room.staffVoice?.[id]?.hostDeaf),
            muted:Boolean(room.staffText?.[id])}];
        })}));
      return res.json({role:role(actor),grantLimit:grantLimit(actor),users,page,total:matches.length,networkBans:level(actor)===4?network.list().map(entry=>({...entry,name:players[entry.player]?.name??entry.player,username:players[entry.player]?.discordHandle})):[],rooms:activeRooms});
    });
    app.post(path,(req,res)=>{
      if(!guard(req,res))return;
      const actor=read(req,res);
      const rank=level(actor);
      const {action,id,code,value,days,reason:note}=req.body??{};
      const reason=typeof note==='string'?note.trim().slice(0,160):'';
      const fail=(error='forbidden',status=403)=>res.status(status).json({error});
      const user=target(players,id),room=target(rooms,code);
      if(rank<1)return fail();
      try{
        if(action==='grantPoints'){
          const error=grantPoints(actor,user,value,reason);
          if(error)return fail(error,error==='forbidden'?403:400);
        }else if(action==='networkBan'||action==='networkUnban'){
          if(rank!==4)return fail();
          if(!reason)return fail('adminInvalid',400);
          if(action==='networkBan'){
            if(!user?.discordId||rank<=level(user)||!user.lastNetwork||!Number.isInteger(days)||days<1||days>365)return fail('adminInvalid',400);
            const until=Date.now()+days*DAY;
            const banId=network.add(user.lastNetwork,user.id,reason,until);
            log(actor,action,banId,reason,{subjectName:user.name,until});
            store.save();
            roomOps.banNetwork(user.lastNetwork);
          }else{
            const entry=network.list().find(item=>item.id===id);
            if(!network.remove(id))return fail('adminInvalid',404);
            log(actor,action,id,reason,{subjectName:players[entry?.player]?.name});
            store.save();
          }
        }else if(['role','ban','mute'].includes(action)){
          const need={role:4,ban:3,mute:2}[action];
          if(rank<need||!user?.discordId||rank<=level(user)||actor.id===id)return fail();
          const previousRole=role(user);
          if(action==='role'){
            if(!['member','helper','shopkeeper','moderator','admin'].includes(value))return fail('adminInvalid',400);
            user.staffRole=value;
          }else{
            if(typeof value!=='boolean'||!reason||value&&(!Number.isInteger(days)||days<1||days>(rank===4?365:30)))return fail('adminInvalid',400);
            const record=user.sanctions??={};
            if(value)record[action]={reason,until:Date.now()+days*DAY};
            else delete record[action];
          }
          log(actor,action+(value===false?':clear':''),user.id,reason,{
            subjectName:user.name,...(action==='role'?{from:previousRole,to:value}:{until:user.sanctions?.[action]?.until})
          });
          store.save();
          if(action==='ban'&&value)roomOps.ban(user.id);
          if(action==='mute')roomOps.mute(user.id);
        }else if(room){
          if(role(actor)==='shopkeeper')return fail();
          if(['close','edit'].includes(action)&&room.host!==actor.id&&rank<=level(players[room.host]))return fail();
          if(action==='observe'){
            if(!roomOps.observe(actor.id,room))return fail('already',409);
          }else if(['voiceMute','voiceDeaf','textMute','kick'].includes(action)){
            if(rank<(action==='kick'?3:2)||!user||rank<=level(user)||!roster(room).includes(id)||!reason)return fail();
            if(action!=='kick'&&typeof value!=='boolean')return fail('adminInvalid',400);
            roomOps.moderate(room,id,action,value);
          }else if(action==='close'){
            if(rank<3||!reason)return fail();
            roomOps.close(room);
          }else if(action==='edit'){
            if(rank<3||!value||typeof value!=='object')return fail();
            roomOps.edit(room,value);
          }else return fail('adminInvalid',400);
          log(actor,action+(value===false?':clear':''),room.code+(user?' / '+id:''),reason,{subjectName:room.name+(user?' · '+user.name:'')});
          store.save();
          roomOps.publish(room);
        }else return fail('badCode',404);
      }catch(error){
        if(['running','badRoom','tooManyPlayers','adminInvalid'].includes(error.message))return fail(error.message,409);
        throw error;
      }
      return res.json({ok:true});
    });
  }
  return {role,level,install,log,grantPoints};
}
