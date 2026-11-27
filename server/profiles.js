import {nameStyles,frames,isThemeColor} from '../public/profile-theme.js';
import {latestGames} from './activity.js';
import {profileBadges} from './badges.js';
import express from 'express';
import { randomUUID } from 'node:crypto';

const defaults={bio:'private',stats:'private',games:'private',links:'private',activity:'friends',board:'friends',wishlist:'friends'};
const bannerStyles=['image','upload','solid','dusk','ocean','grove','pattern'];
const cardThemes=['slate','midnight','tinted'];
const isColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const earnedBadges=p=>['badgeLinked',...[['badgeFirst',3],['badgeFive',15],['badgeTen',30]]
  .filter(([,min])=>(p.points??0)>=min).map(([id])=>id)];
const levels=['private','friends','public'];
const platforms={instagram:'instagram.com',tiktok:'tiktok.com',youtube:'youtube.com',twitch:'twitch.tv',github:'github.com',spotify:'spotify.com',steam:'steamcommunity.com',website:null};
const clean=(value,max)=>typeof value==='string'?value.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,max):'';
export const handle=value=>typeof value==='string'&&/^[a-z0-9_.]{2,32}$/.test(value)?value:'';
const key=(a,b)=>[a,b].sort().join('|');

export function setupProfiles({app,store,identify,guard,onUpdate,presence,catalog,shopCatalog,ownerId,staff}){
  const {players}=store.state;
  const relations=store.state.friendships??={};
  const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
  const get=id=>typeof id==='string'&&uuid.test(id)&&players[id]?.discordId ? players[id] : null;
  const relation=(a,b)=>a&&relations[key(a,b)];
  const summary=p=>({id:p.id,publicId:store.publicNumber(p.id),name:p.name,username:p.discordHandle??''});
  const rules=p=>({...defaults,...p.profileVisibility});
  function canSee(p,viewer,field){
    const visibility=rules(p)[field];
    return viewer===p.id || visibility==='public' || visibility==='friends' && relation(viewer,p.id)?.status==='friends';
  }
  const imagePath=(id,kind,revision)=>'/auth/discord/profile-image/'+id+'/'+kind+'/'+revision;
  const imageKinds=['avatar','banner'];
  function accountAvatar(id){
    const p=players[id];
    const avatar=store.images.list(id).find(image=>image.kind==='avatar');
    return avatar?imagePath(id,'avatar',avatar.revision):p.profileAvatar||'';
  }
  function accountCosmetics(p){
    const equipped=type=>shopCatalog.find(item=>item.type===type&&item.id===p.shopEquipped?.[type]&&p.shopItems?.includes(item.id))?.style??'none';
    return {decoration:equipped('decoration'),effect:equipped('effect')};
  }
  function accountTheme(p){
    return {themeTop:p.profileThemeTop??'',themeBottom:p.profileThemeBottom??'',
      nameStyle:p.profileNameStyle??'default',frame:p.profileFrame??'none'};
  }
  function view(p,viewer){
    const self=viewer===p.id;
    const link=relation(viewer,p.id);
    const friends=link?.status==='friends';
    const privacy=rules(p);
    const can=field=>canSee(p,viewer,field);
    const points=p.points??0;
    const activity=presence(p.id);
    const badges=earnedBadges(p);
    const images=Object.fromEntries(store.images.list(p.id).map(({kind,revision})=>[kind,imagePath(p.id,kind,revision)]));
    return {...summary(p),achievements:[...profileBadges(store,p,ownerId,can('stats')),...(['helper','shopkeeper','moderator','admin'].includes(staff.role(p))?[{id:staff.role(p)}]:[])],images,avatar:p.profileAvatar||'',banner:p.profileBanner||'',accent:p.profileAccent??'#b087ee',...accountCosmetics(p),...accountTheme(p),
      ...(p.siteJoinedAt?{siteJoinedAt:p.siteJoinedAt}:{}),
      bannerStyle:p.profileBannerStyle??'image',bannerColor:p.profileBannerColor??p.profileAccent??'#b087ee',
      cardTheme:p.profileCardTheme??'slate',presence:activity.state,
      ...(can('activity')?{status:p.profileStatus??'',currentGame:activity.game??null}:{}),
      ...(can('bio')?{bio:p.profileBio??''}:{}),
      ...(can('stats')?{points,wins:Math.floor(points/3),played:Object.values(p.gameStats??{}).reduce((total,game)=>total+game.played,0),badges:badges.filter(id=>!p.featuredBadges||p.featuredBadges.includes(id))}:{}),
      ...(can('games')?{games:p.gameStats??{},recentGames:latestGames(p.recentGames)}:{}),
      ...(can('board')?{favorites:p.profileFavorites??[]}:{}),
      ...(can('wishlist')?{wishlist:shopCatalog.filter(item=>p.shopWishlist?.includes(item.id)).map(({id,name,type,price,style})=>({id,name,type,price,style}))}:{}),
      ...(can('links')?{links:p.profileLinks??{}}:{}),
      ...(self?{privacy,cosmeticItems:shopCatalog.filter(item=>p.shopItems?.includes(item.id)),cosmeticSelection:p.shopEquipped??{},earnedBadges:badges,canImport:Boolean(p.discordAppearance),email:p.recoveryEmail??'',friends:friendsList(p.id)}:{
        relationship:friends?'friends':link?.status==='pending'?(link.from===viewer?'outgoing':'incoming'):'none'
      })
    };
  }
  function friendsList(id){
    return Object.entries(relations).flatMap(([pair,record])=>{
      const [a,b]=pair.split('|');
      if((id!==a&&id!==b)||record.status==='blocked') return [];
      const peer=get(a===id?b:a);
      return peer?[{...summary(peer),relationship:record.status==='friends'?'friends':record.from===id?'outgoing':'incoming'}]:[];
    });
  }
  function invisible(viewer,target){
    return relation(viewer,target)?.status==='blocked';
  }
  function read(req,res){
    res.set('Cache-Control','no-store');
    return identify(req.headers.cookie)?.id;
  }
  function appearancePatch(snapshot){
    return {
      ...(snapshot.name?{name:snapshot.name,customDisplayName:true}:{}),
      profileAvatar:snapshot.avatar,profileBanner:snapshot.banner,
      ...(snapshot.accent?{profileAccent:snapshot.accent}:{})
    };
  }
  function importAppearance(profile,snapshot,links){
    const prior={...profile.profileLinks};
    for(const [key,url] of Object.entries(profile.importedDiscordLinks??{})){
      if(prior[key]===url)delete prior[key];
    }
    const imported=Object.fromEntries(Object.entries(links).filter(([key])=>!Object.hasOwn(prior,key)));
    Object.assign(profile,appearancePatch(snapshot),{
      discordAppearance:snapshot,profileLinks:{...prior,...imported},importedDiscordLinks:imported
    });
    store.save();
    onUpdate?.(profile.id);
  }
  function update(profile,data){
    const patch={};
    if(typeof data?.name==='string'){
      const name=clean(data.name,24);
      if(name.length<2) return 'profileNameInvalid';
      patch.name=name;
      patch.customDisplayName=true;
    }
    if(typeof data?.bio==='string') patch.profileBio=clean(data.bio,220);
    if(typeof data?.accent==='string'&&/^#[0-9a-f]{6}$/i.test(data.accent)) patch.profileAccent=data.accent;
    if(typeof data?.status==='string')patch.profileStatus=clean(data.status,80);
    if(isColor(data?.bannerColor))patch.profileBannerColor=data.bannerColor;
    if(bannerStyles.includes(data?.bannerStyle)&&(data.bannerStyle!=='upload'||store.images.list(profile.id).some(image=>image.kind==='banner')))patch.profileBannerStyle=data.bannerStyle;
    if(cardThemes.includes(data?.cardTheme))patch.profileCardTheme=data.cardTheme;
    if(nameStyles.includes(data?.nameStyle))patch.profileNameStyle=data.nameStyle;
    if(frames.includes(data?.frame))patch.profileFrame=data.frame;
    if(data?.customTheme===false){patch.profileThemeTop='';patch.profileThemeBottom='';}
    else if(data?.customTheme===true){
      if(!isThemeColor(data.themeTop)||!isThemeColor(data.themeBottom))return 'profileThemeInvalid';
      patch.profileThemeTop=data.themeTop;
      patch.profileThemeBottom=data.themeBottom;
    }
    if(Array.isArray(data?.featuredBadges))patch.featuredBadges=earnedBadges(profile).filter(id=>data.featuredBadges.includes(id));
    if(Array.isArray(data?.favorites))patch.profileFavorites=[...new Set(data.favorites.filter(id=>catalog.some(game=>game.id===id)))].slice(0,4);
    if(data?.privacy&&typeof data.privacy==='object'){
      const next=rules(profile);
      for(const field of Object.keys(defaults)) if(levels.includes(data.privacy[field])) next[field]=data.privacy[field];
      patch.profileVisibility=next;
    }
    if(data?.links&&typeof data.links==='object'){
      const next={};
      for(const [platform,domain] of Object.entries(platforms)){
        const value=clean(data.links[platform],270);
        if(!value)continue;
        let url;
        try{url=new URL(value);}catch{return 'profileLinkInvalid';}
        if(url.protocol!=='https:'||url.username||url.password||url.port||
          (domain&&url.hostname!==domain&&!url.hostname.endsWith('.'+domain))) return 'profileLinkInvalid';
        next[platform]=url.href;
      }
      patch.profileLinks=next;
    }
    if(data?.cosmeticSelection!==undefined){
      if(!data.cosmeticSelection||typeof data.cosmeticSelection!=='object')return 'shopUnavailable';
      const next={...profile.shopEquipped};
      for(const type of ['decoration','effect']){
        const id=data.cosmeticSelection[type];
        if(id===undefined)continue;
        if(id===''){delete next[type];continue;}
        if(typeof id!=='string'||!profile.shopItems?.includes(id)||!shopCatalog.some(item=>item.id===id&&item.type===type))return 'shopUnavailable';
        next[type]=id;
      }
      patch.shopEquipped=next;
    }
    if(data?.importDiscord===true){
      const snapshot=profile.discordAppearance;
      if(!snapshot)return 'importLogin';
      Object.assign(patch,appearancePatch(snapshot));
    }
    if(data?.clearImages===true){patch.profileAvatar='';patch.profileBanner='';}
    Object.assign(profile,patch);
    if(data?.removeEmail===true) delete profile.recoveryEmail;
    return null;
  }
  app.get('/auth/discord/profile-image/:id/:kind/:revision',(req,res)=>{
    const {id,kind,revision}=req.params;
    if(!get(id)||!imageKinds.includes(kind)||!uuid.test(revision))return res.sendStatus(404);
    const image=store.images.get(id,kind,revision);
    if(!image)return res.sendStatus(404);
    res.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=300'});
    return res.send(Buffer.from(image.bytes));
  });
  const imageBody=express.raw({type:'image/jpeg',limit:'1mb',inflate:false});
  app.put('/auth/discord/profile-image/:kind',(req,res)=>{
    if(!guard(req,res))return;
    const id=read(req,res);
    if(!id)return res.status(401).json({error:'discordLogin'});
    const {kind}=req.params;
    if(!imageKinds.includes(kind))return res.status(404).json({error:'profileImageInvalid'});
    return imageBody(req,res,error=>{
      if(error)return res.status(error.status===413?413:400).json({error:error.status===413?'profileImageLarge':'profileImageInvalid'});
      const bytes=req.body;
      if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217){
        return res.status(400).json({error:'profileImageInvalid'});
      }
      store.images.put(id,kind,randomUUID(),bytes);
      if(kind==='banner'){players[id].profileBannerStyle='upload';store.save();}
      if(kind==='avatar')onUpdate?.(id);
      return res.json(view(players[id],id));
    });
  });
  app.delete('/auth/discord/profile-image/:kind',(req,res)=>{
    if(!guard(req,res))return;
    const id=read(req,res);
    if(!id)return res.status(401).json({error:'discordLogin'});
    const {kind}=req.params;
    if(!imageKinds.includes(kind))return res.status(404).json({error:'profileImageInvalid'});
    store.images.remove(id,kind);
    if(kind==='banner'&&players[id].profileBannerStyle==='upload'){
      players[id].profileBannerStyle='image';store.save();
    }
    if(kind==='avatar')onUpdate?.(id);
    return res.json(view(players[id],id));
  });
  app.get('/auth/discord/profile',(req,res)=>{
    const id=read(req,res);
    return id?res.json(view(players[id],id)):res.status(401).json({error:'discordLogin'});
  });
  app.post('/auth/discord/profile',(req,res)=>{
    if(!guard(req,res))return;
    const id=read(req,res);
    if(!id)return res.status(401).json({error:'discordLogin'});
    const error=update(players[id],req.body);
    if(error)return res.status(400).json({error});
    store.save();
    onUpdate?.(id);
    return res.json(view(players[id],id));
  });
  app.get('/auth/discord/profile/search',(req,res)=>{
    const id=read(req,res);
    if(!id)return res.status(401).json({error:'discordLogin'});
    const query=clean(req.query.q,64).toLowerCase();
    const term=query.replace(/^@/,'');
    const matches=term.length>=2?Object.values(players).filter(p=>{
      if(!p.discordId||invisible(id,p.id))return false;
      if(store.playerByNumber(term)===p.id)return true;
      if(uuid.test(term))return p.id===term;
      return p.discordHandle?.includes(term)||(!query.startsWith('@')&&p.name?.toLowerCase().includes(term));
    }).slice(0,20):[];
    return res.json(matches.map(summary));
  });
  app.get('/auth/discord/profile/find',(req,res)=>{
    const id=read(req,res);
    if(!id)return res.status(401).json({error:'discordLogin'});
    const username=handle(clean(req.query?.username,32).replace(/^@/,'').toLowerCase());
    const target=username&&Object.values(players).find(p=>p.discordId&&p.discordHandle===username);
    return target&&!invisible(id,target.id)?res.json(view(target,id)):res.status(404).json({error:'profileMissing'});
  });
  app.get('/auth/discord/profile/:id',(req,res)=>{
    const id=read(req,res);
    const target=get(store.playerByNumber(req.params.id)??req.params.id);
    return target&&!invisible(id,target.id)?res.json(view(target,id)):res.status(404).json({error:'profileMissing'});
  });
  app.post('/auth/discord/friends',(req,res)=>{
    if(!guard(req,res))return;
    const id=read(req,res);
    const peer=get(req.body?.id);
    if(!id)return res.status(401).json({error:'discordLogin'});
    if(!peer||peer.id===id)return res.status(404).json({error:'profileMissing'});
    const pair=key(id,peer.id);
    const prior=relations[pair];
    const action=req.body?.action;
    if(action==='request'&&!prior&&friendsList(id).length<100&&friendsList(peer.id).length<100) relations[pair]={from:id,status:'pending'};
    else if(action==='accept'&&prior?.status==='pending'&&prior.from===peer.id) prior.status='friends';
    else if(action==='remove'&&(prior?.status==='friends'||prior?.status==='pending')) delete relations[pair];
    else return res.status(409).json({error:'friendConflict'});
    store.save();
    return res.json(view(players[id],id));
  });
  return {importAppearance,accountAvatar,accountCosmetics,accountTheme,canSee,areFriends:(a,b)=>relation(a,b)?.status==='friends'};
}
