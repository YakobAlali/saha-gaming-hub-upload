import express from 'express';
import {randomUUID} from 'node:crypto';
import {plusTiers} from './badges.js';

const bodyText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const imageLimit=1024*1024,videoLimit=16*1024*1024;
const reasons=['abuse','harassment','cheating','spam','other'];
const userId=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const parseReport=express.json({limit:'22mb',inflate:false});

function evidence(input,type){
  const limit=type==='image/jpeg'?imageLimit:videoLimit;
  if(typeof input!=='string'||input.length>Math.ceil(limit/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input))return null;
  const bytes=Buffer.from(input,'base64');
  if(bytes.length<(type==='image/jpeg'?4:12)||bytes.length>limit)return null;
  if(type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return bytes;
  if(type==='video/mp4'&&bytes.toString('ascii',4,8)==='ftyp')return bytes;
  if(type==='video/webm'&&bytes.readUInt32BE(0)===0x1a45dfa3&&bytes.subarray(0,128).includes(Buffer.from('webm')))return bytes;
  return null;
}
export function installReports({app,store,identify,guard,ownerId,staff}){
  const {players}=store.state;
  const prefix='/auth/discord/reports';
  const actor=req=>players[identify(req.headers.cookie)?.id];
  const isOwner=p=>Boolean(ownerId&&p?.discordId===ownerId);
  function authorize(req,res,minimum=0){
    res.set('Cache-Control','no-store');
    const p=actor(req);
    if(!p){res.status(401).json({error:'discordLogin'});return null;}
    if(staff.level(p)<minimum){res.status(403).json({error:'forbidden'});return null;}
    return p;
  }
  app.get(prefix,(req,res)=>{
    const p=authorize(req,res);
    if(!p)return;
    const owner=isOwner(p);
    const reviewer=staff.level(p)>=3;
    return res.json({owner,reviewer,items:reviewer?store.reports.list():store.reports.own(p.id)});
  });
  app.post(prefix,(req,res)=>{
    if(!guard(req,res))return;
    const p=authorize(req,res);
    if(!p)return;
    if(store.reports.count(p.id,Date.now()-24*3600000)>=5)return res.status(429).json({error:'reportRate'});
    return parseReport(req,res,error=>{
      if(error)return res.status(error.status===413?413:400).json({error:error.status===413?'reportFileLarge':'reportInvalid'});
      const data=req.body??{};
      const kind=data.kind??'bug';
      const title=bodyText(data.title,80),description=bodyText(data.description,1600);
      const target=kind==='player'&&typeof data.target==='string'?(store.playerByNumber(data.target.trim())??(userId.test(data.target)?data.target.toLowerCase():null)):null;
      const reason=kind==='player'?data.reason:null;
      if(!['bug','player'].includes(kind)||title.length<3||description.length<10)return res.status(400).json({error:'reportInvalid'});
      if(kind==='player'&&(!target||target===p.id||!players[target]?.discordId||!reasons.includes(reason)))
        return res.status(400).json({error:'reportPlayerInvalid'});
      const type=data.mediaType??'image/jpeg';
      if(kind==='bug'&&type!=='image/jpeg')return res.status(400).json({error:'reportInvalid'});
      const bytes=evidence(data.image,type);
      if(!bytes)return res.status(400).json({error:'reportInvalid'});
      if(store.reports.count(p.id,Date.now()-24*3600000)>=5)return res.status(429).json({error:'reportRate'});
      const id=randomUUID();
      store.reports.add(id,p.id,title,description,Date.now(),bytes,kind,target,reason,type);
      staff.log(p,'report:opened',id,'',{subjectName:title});
      store.save();
      return res.status(201).json({id});
    });
  });
  app.get([prefix+'/:id/screenshot',prefix+'/:id/evidence'],(req,res)=>{
    if(!authorize(req,res,3))return;
    const image=store.reports.image(req.params.id);
    if(!image)return res.sendStatus(404);
    return res.set({'Content-Type':image.media_type,'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; media-src 'self'; sandbox"}).send(Buffer.from(image.screenshot));
  });
  app.post(prefix+'/review',(req,res)=>{
    if(!guard(req,res))return;
    const reviewer=authorize(req,res,3);
    if(!reviewer)return;
    if(!['confirmed','rejected'].includes(req.body?.status)||typeof req.body?.id!=='string')return res.status(400).json({error:'reportInvalid'});
    if(!store.reports.review(req.body.status,req.body.id))return res.status(409).json({error:'reportReviewed'});
    staff.log(reviewer,'report:'+req.body.status,req.body.id,'',{subjectName:store.reports.info(req.body.id)?.title});
    store.save();
    return res.json({ok:true});
  });
  app.post(prefix+'/plus',(req,res)=>{
    if(!guard(req,res))return;
    const actor=authorize(req,res,4);
    if(!actor)return;
    const {id,tier,days}=req.body??{};
    const player=typeof id==='string'&&Object.hasOwn(players,id)?players[id]:null;
    if(!player?.discordId||(!plusTiers.includes(tier)&&tier!=='none')||
      (tier!=='none'&&(!Number.isInteger(days)||days<1||days>365)))return res.status(400).json({error:'plusInvalid'});
    if(tier==='none')delete player.sahaPlus;
    else player.sahaPlus={tier,until:Date.now()+days*86400000};
    staff.log(actor,'plus',id,'',{subjectName:player.name,to:tier,until:player.sahaPlus?.until});
    store.save();
    return res.json({ok:true});
  });
}
