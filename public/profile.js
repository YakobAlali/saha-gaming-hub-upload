import {networks,labels,renderSettings} from './site-settings.js';
import {nameStyles,frames,isThemeColor,themeVariables} from './profile-theme.js';
import {cosmeticLayer} from './cosmetics.js';
import {avatarImage,cdn,uploadedPath} from './profile-image.js';
import {badgeStrip} from './badges.js';
import { gameCover } from './game-cover.js';
import { catalog } from './catalog.js';
const decorationNames=['none','orbit','frame','stars','crystal','flare'];
const bannerStyles=['image','solid','dusk','ocean','grove','pattern'];
const themes=['slate','midnight','tinted'];
const color=value=>/^#[a-f\d]{6}$/i.test(value);
const effects=['none','shine','float'];

export async function imageForUpload(file,kind){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('profileImageInvalid');
  if(file.size>15*1024*1024)throw Error('profileImageLarge');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('profileImageInvalid');});
  try{
    const width=kind==='avatar'?512:1600, height=kind==='avatar'?512:kind==='report'?1200:800;
    const scale=Math.min(1,width/bitmap.width,height/bitmap.height);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle='#252831';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
    if(!blob)throw Error('profileImageInvalid');
    if(blob.size>1024*1024)throw Error('profileImageLarge');
    return blob;
  }finally{bitmap.close();}
}

function cosmeticSample(item,profile,safe){
  const layer=cosmeticLayer(item.type,item.style);
  const avatar=avatarImage(profile?.images?.avatar||profile?.avatar,safe);
  return '<div class="cosmetic-sample" aria-hidden="true">'+(item.type==='effect'?layer:'')+
    '<div class="profile-portrait"><span class="profile-emblem">'+(avatar||'◆')+'</span>'+
    (item.type==='decoration'?layer:'')+'</div></div>';
}

export function renderProfile({owner,person,selected,social,preview,canInvite,loading,message,t,safe,num,tab='card',boardDraft}){
  const notice=message?'<p class="account-message" role="status">'+safe(t(message))+'</p>':'';
  const heading=preview?'':'<div class="page-head profile-page-head"><div><h1>'+t(social?'friends':'account')+'</h1></div>'+
    (selected?'<a class="button secondary" href="#account">'+t('account')+'</a>':'')+'</div>';
  if(loading) return heading+'<p class="panel account-panel" role="status">'+t('profileLoading')+'</p>';
  const login='<section class="panel account-panel"><h2>'+t('discordLogin')+'</h2><button class="button primary" data-action="accountLogin">Discord</button></section>';
  const data=selected&&selected!==owner?.id?person:owner;
  if(!data)return heading+notice+(selected?'':login);
  const sectionNav='<nav class="profile-tabs" aria-label="'+t('account')+'">'+['card','board','recent','wishlist'].map(key=>
    '<button type="button" class="button secondary" data-profile-tab="'+key+'" aria-pressed="'+(key===tab)+'">'+t('profileTab_'+key)+'</button>').join('')+'</nav>';
  const gameName=id=>{const label=t(id);return Array.isArray(label)?label[0]:id;};
  const date=value=>new Date(value).toLocaleDateString(document.documentElement.lang,{dateStyle:'medium'});
  const age=value=>{
    const months=Math.max(0,Math.floor((Date.now()-value)/2629800000));
    const years=Math.floor(months/12);
    return new Intl.NumberFormat(document.documentElement.lang,{style:'unit',unit:years?'year':'month',unitDisplay:'long'}).format(years||months);
  };
  if(!social&&tab!=='card'){
    const profileOwner=!selected||owner?.id===data.id;
    const games=catalog.filter(game=>game.id!=='replica-en');
    let body='';
    if(tab==='board'){
      const favorites=[...new Set((data.favorites??[]).map(id=>id==='replica-en'?'replica-ar':id))]
        .filter(id=>games.some(game=>game.id===id));
      const checked=boardDraft??favorites;
      const title=id=>id==='replica-ar'?t('replicaCoverTitle'):gameName(id);
      const tile=(id,selectable)=>'<li class="favorite-cover-tile"><button type="button" class="favorite-cover-open" data-action="rules" data-game="'+id+'">'+
        gameCover(id)+'<span class="favorite-cover-title">'+safe(title(id))+'</span></button>'+
        (selectable?'<label class="favorite-cover-choice"><input type="checkbox" name="favorite" value="'+id+'"'+
          (checked.includes(id)?' checked':'')+'><span>'+t('favoriteCoverPick')+'</span><span class="favorite-cover-hidden"> '+safe(title(id))+'</span></label>':'')+'</li>';
      const grid=(ids,selectable)=>'<ul class="favorite-cover-grid">'+ids.map(id=>tile(id,selectable)).join('')+'</ul>';
      if(data.favorites)body=favorites.length?grid(favorites,false):'<p>'+t('profileEmptyBoard')+'</p>';
      if(profileOwner)body+='<details class="favorite-cover-editor"'+(!favorites.length||boardDraft?' open':'')+'><summary>'+t('favoriteCoverEdit')+'</summary>'+
        '<form data-account="favorites"><fieldset class="favorite-cover-field"><legend>'+t('profileChooseFavorites')+
        '</legend>'+grid(games.map(game=>game.id),true)+'</fieldset><div class="favorite-cover-footer">'+
        '<p class="favorite-cover-count" role="status">'+num(checked.length)+' / '+num(4)+'</p>'+
        '<button class="button primary" type="submit">'+t('accountSave')+'</button></div></form></details>';
    }
    if(tab==='recent'&&data.recentGames){
      const dateTime=new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeStyle:'short'});
      const outcomeKeys={win:'profileWin',loss:'profileActivityLoss',draw:'profileActivityDraw',abandoned:'profileActivityAbandoned'};
      body=data.recentGames.length?'<ul class="profile-activity-list">'+data.recentGames.map(row=>{
        const title=row.game.startsWith('replica-')?t('replicaCoverTitle'):gameName(row.game);
        const outcome=outcomeKeys[row.outcome]??(row.won?'profileWin':'profileActivityPlayed');
        return '<li>'+gameCover(row.game)+'<div class="profile-activity-copy"><strong>'+safe(title)+'</strong><small>'+
          '<time datetime="'+new Date(row.at).toISOString()+'">'+safe(dateTime.format(row.at))+'</time>'+
          '<span aria-hidden="true"> · </span><span>'+safe(t(outcome))+'</span></small></div></li>';
      }).join('')+'</ul>':'<p>'+t('profileEmptyRecent')+'</p>';
    }
    if(tab==='recent'&&typeof data.points==='number'){
      body='<details class="profile-summary"><summary>'+t('profileStatsDetails')+'</summary><p>'+num(data.points)+' '+t('points')+
        ' · '+num(data.wins)+' '+t('profileWins')+' · '+num(data.played)+' '+t('profilePlayed')+'</p>'+
        (data.badges?.length?'<ul class="profile-badges">'+data.badges.map(badge=>'<li>'+safe(t(badge))+'</li>').join('')+'</ul>':'')+
        '</details>'+body;
    }
    if(tab!=='wishlist')return heading+notice+'<div class="profile-column">'+sectionNav+'<section class="panel profile-block profile-tab-body"><h2>'+
      t('profileTab_'+tab)+'</h2>'+(body||'<p>'+t('profilePrivateSection')+'</p>')+'</section></div>';
  }
  const field=(key,name,value,attrs='')=>'<label>'+t(key)+'<input name="'+name+'" value="'+safe(value)+'" '+attrs+'></label>';
  const submit=(key,style='primary')=>'<button type="submit" class="button '+style+'">'+t(key)+'</button>';
  const choice=(key,name,values,current)=>'<label>'+t(key)+'<select name="'+name+'">'+values.map(value=>'<option value="'+value+'"'+
    (value===current?' selected':'')+'>'+t('profile_'+value)+'</option>').join('')+'</select></label>';
  const accent=/^#[a-f\d]{6}$/i.test(data.accent)?data.accent:'#b087ee';
  const decoration=decorationNames.includes(data.decoration)?data.decoration:'none';
  const effect=effects.includes(data.effect)?data.effect:'none';
  const images=data.images??{};
  const cover=data.bannerStyle==='upload'&&uploadedPath(images.banner)?'upload':bannerStyles.includes(data.bannerStyle)?data.bannerStyle:'image';
  const covers=images.banner?['upload',...bannerStyles]:bannerStyles;
  const theme=themes.includes(data.cardTheme)?data.cardTheme:'slate';
  const themeCSS=themeVariables(data.themeTop,data.themeBottom);
  const nameStyle=nameStyles.includes(data.nameStyle)?data.nameStyle:'default';
  const frame=frames.includes(data.frame)?data.frame:'none';
  const themeTop=isThemeColor(data.themeTop)?data.themeTop:'#454a76';
  const themeBottom=isThemeColor(data.themeBottom)?data.themeBottom:'#242631';
  const tint=color(data.bannerColor)?data.bannerColor:accent;
  const presence=['online','idle','inGame','offline'].includes(data.presence)?data.presence:'offline';
  const memberName=data.name||data.username||t('account');
  const username=data.username?'<bdi class="profile-handle" dir="ltr">@'+safe(data.username)+'</bdi>':
    (!selected?'<p class="profile-handle">'+t('profileHandlePending')+'</p>':'');
  const action=(key,cmd,id)=>'<button class="button secondary" type="button" data-friend="'+cmd+'" data-peer="'+safe(id)+'">'+t(key)+'</button>';
  const relationship=data.relationship;
  const controls=selected&&owner&&owner.id!==data.id?'<div class="profile-relations">'+(
    relationship==='incoming'?action('friendAccept','accept',data.id)+action('friendDecline','remove',data.id):
    relationship==='outgoing'?action('friendCancel','remove',data.id):
    relationship==='friends'?action('friendRemove','remove',data.id)+(canInvite?'<button class="button primary" data-invite-to="'+safe(data.id)+'">'+t('inviteFriend')+'</button>':''):action('friendAdd','request',data.id))+'</div>':'';
  const links=data.links&&Object.keys(data.links).length?'<section class="profile-links"><h3>'+t('profileLinks')+'</h3><ul>'+
    networks.filter(id=>Object.hasOwn(data.links,id)).map(id=>{
      const url=data.links[id];
      if(typeof url!=='string'||!url.startsWith('https://'))return '';
      return '<li><a class="profile-connection connection-'+id+'" href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">'+
        '<span class="connection-icon"><img alt="" src="'+(id==='website'?'/icons/globe':'/brands/'+id)+'.svg"></span>'+
        '<span><strong>'+(labels[id]??t('profileWebsite'))+'</strong><small dir="ltr">'+safe(new URL(url).hostname)+'</small></span><span class="connection-arrow" aria-hidden="true">↗</span></a></li>';
    }).join('')+'</ul></section>':'';
  const banner=cdn(data.banner)&&data.banner.includes('/banners/')?safe(data.banner):'';
  const customBanner=uploadedPath(images.banner);
  const customAvatar=uploadedPath(images.avatar);
  const coverImage=(customBanner?'<img class="uploaded-banner" alt="" src="'+safe(customBanner)+'">':'')+(banner?'<img alt="" referrerpolicy="no-referrer" src="'+banner+'?size=1024"'+
    ' class="imported-banner" srcset="'+banner+'?size=1024 1x, '+banner+'?size=2048 2x">':'');
  const editorLinks=[['media','editorMedia'],['identity','editorIdentity'],['colors','profileColors'],['cosmetics','profileOwnedCosmetics']];
  const editorNav='<nav class="editor-shortcuts" aria-label="'+t('profileSettings')+'">'+editorLinks.map(([key,label])=>
    '<button class="button secondary" type="button" data-editor-jump="'+key+'">'+t(label)+'</button>').join('')+'</nav>';
  const section=(key,label)=>'<section class="editor-section" data-editor-section="'+key+'"><h3>'+t(label)+'</h3>';
  const upload=(kind,label,preview)=>'<div class="profile-image-field"><div class="editor-media editor-media-'+kind+'">'+preview+'</div><form data-account="upload" data-kind="'+kind+'"><label>'+t(label)+
    '<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label>'+submit('profileUpload','secondary')+'</form>'+
    (images[kind]?'<form data-account="deleteImage" data-kind="'+kind+'">'+submit('profileRemoveUpload','secondary')+'</form>':'')+'</div>';
  const itemName=item=>safe(item.name[document.documentElement.lang]??item.name.en);
  const cosmeticSelect=(type,label)=>'<label>'+t(label)+'<select name="cosmetic_'+type+'"><option value="">'+t('profileUnequipped')+'</option>'+
    (data.cosmeticItems??[]).filter(item=>item.type===type).map(item=>'<option value="'+safe(item.id)+'"'+
      (data.cosmeticSelection?.[type]===item.id?' selected':'')+'>'+itemName(item)+'</option>').join('')+'</select></label>';
  const editor=selected?'':'<details class="panel profile-block profile-editor"><summary>'+t('profileSettings')+'</summary>'+editorNav+section('media','editorMedia')+'<div class="editor-media-grid">'+
    upload('avatar','profileChooseAvatar',avatarImage(customAvatar||data.avatar,safe)||safe([...memberName][0]??'◆'))+
    upload('banner','profileChooseBanner',customBanner||banner?'<img alt="" referrerpolicy="no-referrer" src="'+(customBanner?safe(customBanner):banner+'?size=512')+'">':'')+'</div>'+
    '<form data-account="import"><p>'+t('importHint')+'</p>'+'<div class="actions">'+submit('importDiscord','secondary')+
      '<button class="button secondary" type="button" data-edit-import-bio>'+t('importBioButton')+'</button></div></form>'+
    (data.avatar||data.banner?'<form data-account="clear">'+submit('profileClearImported','secondary')+'</form>':'')+
    '</section><form data-account="edit">'+section('identity','editorIdentity')+
    '<div class="profile-edit-grid">'+field('profileDisplayName','name',data.name,'required minlength="2" maxlength="24"')+
    choice('profileNameStyle','nameStyle',nameStyles,nameStyle)+field('profileStatus','status',data.status,'maxlength="80" dir="auto"')+'</div>'+
    '<label>'+t('profileBio')+'<textarea name="bio" maxlength="220" rows="3">'+safe(data.bio)+'</textarea></label></section>'+
    section('colors','profileColors')+'<div class="editor-color-preview" aria-hidden="true" style="'+themeVariables(themeTop,themeBottom)+'"></div>'+
    '<label class="profile-theme-toggle"><input name="customTheme" type="checkbox"'+(themeCSS?' checked':'')+'> '+t('profileUseColors')+'</label>'+
    '<div class="profile-edit-grid"><label>'+t('profileTopColor')+'<input type="color" name="themeTop" value="'+themeTop+'"></label>'+
    '<label>'+t('profileBottomColor')+'<input type="color" name="themeBottom" value="'+themeBottom+'"></label>'+
    '<label>'+t('profileAccent')+'<input type="color" name="accent" value="'+accent+'"></label>'+
    choice('profileBannerStyle','bannerStyle',covers,cover)+choice('profileCardTheme','cardTheme',themes,theme)+
    '<label>'+t('profileBannerColor')+'<input type="color" name="bannerPicker" value="'+tint+'"></label>'+
    field('profileHex','bannerColor',tint,'required dir="ltr" pattern="#[0-9a-fA-F]{6}" maxlength="7"')+'</div></section>'+
    section('cosmetics','profileOwnedCosmetics')+'<div class="profile-edit-grid">'+choice('profileFrame','frame',frames,frame)+
    ((data.cosmeticItems??[]).length?cosmeticSelect('decoration','profileChooseDecoration')+cosmeticSelect('effect','profileChooseEffect'):'')+
    '</div>'+((data.cosmeticItems??[]).length?'':'<p>'+t('profileNoCosmetics')+'</p>')+'<a class="text-link" href="#shop">'+t('shop')+'</a></section>'+
    '<div class="editor-save">'+submit('accountSave')+'</div></form></details>';
  const friends=selected?'':'<section class="panel profile-block"><form data-account="find" class="profile-search">'+
    field('liveSearch','username','','type="search" maxlength="64" autocomplete="off" dir="auto"')+'</form><div class="search-results" aria-live="polite"></div>'+
    ['friends','requests'].map(group=>{
      const items=data.friends.filter(item=>(item.relationship==='friends')===(group==='friends'));
      return '<h3>'+t(group)+'</h3>'+(items.length?'<ul class="profile-friends">'+items.map(item=>'<li><div><a href="#profile/'+safe(item.id)+'"><bdi>'+
      safe(item.name)+'</bdi></a>'+(item.username?'<small><bdi dir="ltr">@'+safe(item.username)+'</bdi></small>':'')+'</div><div class="actions">'+
      (item.relationship==='incoming'?action('friendAccept','accept',item.id)+action('friendDecline','remove',item.id):
      item.relationship==='outgoing'?action('friendCancel','remove',item.id):action('friendRemove','remove',item.id))+'</div></li>').join('')+'</ul>':
      '<p>'+t(group==='friends'?'profileNoFriends':'profileNoRequests')+'</p>');}).join('')+'</section>';
  const email=selected?'':'<details class="panel profile-block"><summary>'+t('recoveryEmail')+'</summary><p>'+t('recoveryPrivacy')+'</p>'+
    (data.email?'<p dir="ltr" class="account-email">'+safe(data.email)+'</p><form data-account="remove">'+submit('recoveryRemove','secondary')+'</form>':'')+'</details>';
  if(social)return heading+notice+friends;
  const identityCard='<article class="profile-banner decoration-'+decoration+' effect-'+effect+' theme-'+theme+' name-style-'+nameStyle+' profile-frame-'+frame+(themeCSS?' profile-custom-colors':'')+'" style="--profile-accent:'+accent+';--banner-color:'+tint+';'+themeCSS+'">'+
    '<div class="profile-cover cover-'+cover+'">'+coverImage+'</div>'+cosmeticLayer('effect',data.effect)+'<div class="profile-orbit" aria-hidden="true"></div><div class="profile-banner-content"><div class="profile-portrait"><span class="profile-emblem" aria-hidden="true">'+
    (avatarImage(customAvatar||data.avatar,safe)||safe([...memberName][0]??'◆'))+'</span>'+cosmeticLayer('decoration',data.decoration)+'<i class="presence-dot presence-'+presence+'" aria-hidden="true"></i></div><div><h2><bdi>'+safe(memberName)+'</bdi></h2>'+username+
    '<p class="profile-activity">'+t('presence_'+presence)+(data.currentGame?' · '+safe(t(data.currentGame)[0]):'')+'</p></div></div>'+
    badgeStrip(data.achievements,{t,safe,num})+
    (data.siteJoinedAt?'<p class="profile-age"><span aria-hidden="true">◈</span> '+t('siteSince')+' <time datetime="'+new Date(data.siteJoinedAt).toISOString()+'">'+safe(date(data.siteJoinedAt))+'</time> · '+safe(age(data.siteJoinedAt))+'</p>':'')+
    '<p class="profile-custom-status" dir="auto"'+(!data.status?' hidden':'')+'>'+safe(data.status)+'</p>'+
    '<div class="profile-relations">'+(!selected?'<button class="button secondary" data-edit-profile>'+t('profileEdit')+'</button>':'')+
    '<button class="button secondary" data-copy-profile-id="'+safe(data.publicId)+'">'+t('profileCopyId')+'</button>'+'</div>'+
    '<div class="profile-about"'+(!data.bio?' hidden':'')+'><h3>'+t('profileBio')+'</h3><p class="profile-bio" dir="auto">'+safe(data.bio)+'</p></div>'+controls+
    links+'</article>';
  if(tab==='wishlist'){
    const items=data.wishlist;
    const manage=data.id===owner?.id;
    const toolbar=items?'<header class="wish-toolbar"><strong>'+t('wishItems')+' · '+num(items.length)+'</strong>'+
      (manage?'<a class="button secondary" data-open-shop href="#shop">'+t('wishAdd')+'</a>':'')+'</header>':'';
    const tiles=items?.map(item=>'<li>'+cosmeticSample(item,data,safe)+'<strong>'+safe(item.name[document.documentElement.lang]??item.name.en)+'</strong><small>'+num(item.price)+' '+t('points')+'</small></li>').join('');
    return heading+notice+'<div class="wish-layout">'+identityCard+'<div class="wish-pane">'+sectionNav+toolbar+
      (tiles?'<ul class="wish-grid">'+tiles+'</ul>':'<p>'+t(items?'profileEmptyWish':'profilePrivateSection')+'</p>')+'</div></div>';
  }
  return heading+notice+'<div class="profile-column">'+sectionNav+identityCard+(!selected?'<div class="profile-sections">'+editor+email+'<a class="button secondary report-profile-link" href="#settings/privacy">'+t('settings')+'</a><a class="button secondary report-profile-link" href="#reports">'+t('reportNew')+'</a></div>':'')+'</div>';
}

export function setupProfileUI({t,safe,num,route,render,signedIn,setName,canInvite,getSitePreferences}){
  let owner,person,message,shop;
  let pageTab='card',previewTab='card',boardDraft;
  const dialog=document.querySelector('#profile-dialog');
  let previewId, previewPerson, previewMessage, previewRun=0, searchTimer;
  function paintPreview(){
    if(!dialog.open)return;
    dialog.querySelector('.preview-title').textContent=t('profilePreview');
    dialog.querySelector('[data-close-preview]').textContent=t('close');
    dialog.querySelector('.preview-content').innerHTML=renderProfile({
      owner,person:previewPerson,selected:previewId,preview:true,loading:!previewPerson&&!previewMessage,
      canInvite:canInvite(previewId),tab:previewTab,boardDraft:previewId===owner?.id?boardDraft:undefined,message:previewMessage,t,safe,num
    });
  }
  async function openPreview(id){
    const run=++previewRun;
    if(previewId!==id||!dialog.open)previewTab='card';
    previewId=id;previewPerson=null;previewMessage=null;
    if(!dialog.open){
      dialog.querySelector('.preview-title').textContent=t('profilePreview');
      dialog.querySelector('[data-close-preview]').textContent=t('close');
      dialog.showModal();
    }
    paintPreview();
    try{
      const [person,mine]=await Promise.all([call('profile/'+encodeURIComponent(id)),signedIn()&&!owner?call('profile'):owner]);
      if(run===previewRun){previewPerson=person;owner=mine;}
    }catch(error){if(run===previewRun)previewMessage=error.message;}
    if(run===previewRun)paintPreview();
  }
  dialog.addEventListener('close',()=>{previewRun++;});
  let sequence=0;
  let loading=false;
  const target=()=>location.hash.startsWith('#profile/')?location.hash.slice(9):'';
  const renderIfOpen=()=>{if(['friends','account','shop','settings'].includes(route()))render();};
  async function call(path,body){
    const response=await fetch('/auth/discord/'+path,body===undefined?{cache:'no-store'}:
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'discordFailed');
    return data;
  }
  async function load(){
    if(!['friends','account','shop','settings'].includes(route()))return;
    const run=++sequence;
    const selected=target();
    loading=true;
    person=undefined;
    renderIfOpen();
    try{
      const [mine,other,market]=await Promise.all([signedIn()?call('profile'):null,selected?call('profile/'+encodeURIComponent(selected)):null,route()==='shop'?call('shop'):null]);
      if(run===sequence){owner=mine;person=other;shop=market;}
    }catch(error){if(run===sequence)message=error.message;}
    finally{if(run===sequence){loading=false;renderIfOpen();}}
  }
  window.addEventListener('hashchange',()=>{message=null;pageTab='card';boardDraft=undefined;void load();});
  document.addEventListener('submit',async event=>{
    const form=event.target.closest?.('form[data-account]');
    if(!form)return;
    event.preventDefault();
    if(form.dataset.account==='find')return;
    const fields=new FormData(form);
    const values=Object.fromEntries(fields);
    const toggle=form.querySelector('button[type=submit]');
    toggle.disabled=true;
    try{
        if(form.dataset.account==='import'){
        const {url}=await call('start',{mode:'profile'});
        location.assign(url);
        return;
      }
      if(form.dataset.account==='puzzle'){
        shop=await call('shop',{action:'solvePuzzle',answer:values.answer});
        message='puzzleRewarded';
        renderIfOpen();
        return;
      }
      if(form.dataset.account==='gift'){
          shop=await call('shop',{action:'gift',item:form.dataset.item,to:values.to});
          message='shopGiftSent';
          renderIfOpen();
          return;
        }
        const kind=form.dataset.kind;
        if(kind){
          const uploading=form.dataset.account==='upload';
          const body=uploading?await imageForUpload(fields.get('image'),kind):undefined;
          const response=await fetch('/auth/discord/profile-image/'+kind,{
            method:uploading?'PUT':'DELETE',headers:uploading?{'Content-Type':'image/jpeg'}:{},body
          });
          const data=await response.json();
          if(!response.ok)throw Error(data.error||'profileImageInvalid');
          const draft=form.closest('.profile-editor').querySelector('[data-account=edit]');
          const changed=Array.from(draft.elements).filter(input=>input.name&&(
            input.type==='checkbox'?input.checked!==input.defaultChecked:
            input.tagName==='SELECT'?input.value!==Array.from(input.options).find(option=>option.defaultSelected)?.value:
            input.value!==input.defaultValue
          )).map(input=>[input.name,input.type==='checkbox'?input.checked:input.value]);
          owner=data;
          message='accountSaved';
          renderIfOpen();
          const updated=document.querySelector('.profile-editor');
          if(updated){
            updated.open=true;
            const next=updated.querySelector('[data-account=edit]');
            for(const [name,value] of changed){
              if(uploading&&kind==='banner'&&name==='bannerStyle')continue;
              const input=next.elements.namedItem(name);
              if(input){if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
            }
          }
          return;
        }
        const subset=prefix=>Object.fromEntries(Object.entries(values).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key.slice(prefix.length),value]));
        const data=form.dataset.account==='privacy'?{privacy:subset('visibility_')}:
          form.dataset.account==='links'?{links:subset('link_')}:form.dataset.account==='clear'?{clearImages:true}:form.dataset.account==='remove'?{removeEmail:true}:
          form.dataset.account==='favorites'?{favorites:fields.getAll('favorite')}:
          {name:values.name,bio:values.bio,accent:values.accent,decoration:values.decoration,effect:values.effect,
            status:values.status,bannerStyle:values.bannerStyle,bannerColor:values.bannerColor,cardTheme:values.cardTheme,
            nameStyle:values.nameStyle,frame:values.frame,customTheme:fields.has('customTheme'),themeTop:values.themeTop,themeBottom:values.themeBottom,
            cosmeticSelection:subset('cosmetic_')};
        owner=await call('profile',data);
        if(form.dataset.account==='favorites'){boardDraft=undefined;paintPreview();}
        setName(owner.name);
        message='accountSaved';
    }catch(error){
      let errorNode=form.querySelector('[role=alert]');
      if(!errorNode){errorNode=document.createElement('p');errorNode.setAttribute('role','alert');form.append(errorNode);}
      errorNode.textContent=t(error.message);
      return;
    }finally{toggle.disabled=false;}
    renderIfOpen();
  });
  document.addEventListener('click',async event=>{
    const tabButton=event.target.closest?.('[data-profile-tab]');
    if(tabButton){
      const tab=tabButton.dataset.profileTab;
      const inPreview=Boolean(tabButton.closest('#profile-dialog'));
      if(inPreview){previewTab=tab;paintPreview();}
      else{pageTab=tab;renderIfOpen();}
      const scope=inPreview?dialog:document.querySelector('#main');
      scope.querySelector('[data-profile-tab="'+tab+'"]')?.focus();
      return;
    }
    if(event.target.closest?.('[data-open-shop]')&&dialog.open)dialog.close();
    const market=event.target.closest?.('[data-shop-action]');
    if(market&&!market.disabled){
      market.disabled=true;
      try{
        const {shopAction,item,enabled}=market.dataset;
        shop=await call('shop',{action:shopAction,item,enabled:enabled==='true'});
        message=shopAction==='buy'?'shopPurchased':'accountSaved';
      }catch(error){message=error.message;}
      finally{market.disabled=false;renderIfOpen();}
      return;
    }
    if(event.target.closest?.('[data-close-preview]')){dialog.close();return;}
    const copy=event.target.closest?.('[data-copy-profile-id]');
    if(copy){
      try{await navigator.clipboard.writeText(copy.dataset.copyProfileId);copy.textContent=t('copied');}
      catch{copy.replaceWith(Object.assign(document.createElement('code'),{textContent:copy.dataset.copyProfileId,dir:'ltr'}));}
      return;
    }
    const jump=event.target.closest?.('[data-editor-jump]');
    if(jump){
      const section=jump.closest('.profile-editor').querySelector('[data-editor-section="'+jump.dataset.editorJump+'"]');
      section?.scrollIntoView({block:'nearest'});
      section?.querySelector('input,select,textarea')?.focus({preventScroll:true});
      return;
    }
    if(event.target.closest?.('[data-edit-import-bio]')){
      event.target.closest('.profile-editor').querySelector('textarea[name=bio]').focus();
      return;
    }
    if(event.target.closest?.('[data-edit-profile]')){
      const editor=document.querySelector('.profile-editor');
      editor.open=true;editor.scrollIntoView({block:'nearest'});editor.querySelector('[name=name]').focus();
      return;
    }
    const link=event.target.closest?.('a[href^="#profile/"]');
    if(link&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
      event.preventDefault();void openPreview(link.hash.slice(9));return;
    }
    const button=event.target.closest?.('[data-friend]');
    if(!button||button.disabled)return;
    button.disabled=true;
    try{
      owner=await call('friends',{id:button.dataset.peer,action:button.dataset.friend});
      message='friendUpdated';
      if(dialog.open){
        await openPreview(button.dataset.peer);
        const query=document.querySelector('.profile-search input')?.value;
        renderIfOpen();
        const input=document.querySelector('.profile-search input');
        if(input&&query){input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}));}
        return;
      }
      if(target()){await load();return;}
    }catch(error){
      if(dialog.open){previewMessage=error.message;paintPreview();return;}
      message=error.message;
    }finally{button.disabled=false;}
    renderIfOpen();
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    const form=input.closest?.('[data-account=favorites]');
    if(!form||input.name!=='favorite')return;
    let selected=new FormData(form).getAll('favorite');
    const overLimit=selected.length>4;
    if(overLimit){
      input.checked=false;
      selected=new FormData(form).getAll('favorite');
    }
    boardDraft=selected;
    const count=num(selected.length)+' / '+num(4);
    form.querySelector('.favorite-cover-count').textContent=overLimit?t('favoriteCoverLimit')+' · '+count:count;
  });
  document.addEventListener('input',event=>{
    const input=event.target;
    const form=input.closest?.('.profile-search');
    if(form){
      clearTimeout(searchTimer);
      const query=input.value.trim();
      const results=form.nextElementSibling;
      results.textContent='';
      if(query.length>=2)searchTimer=setTimeout(async()=>{
        try{
          const matches=await call('profile/search?q='+encodeURIComponent(query));
          if(!form.isConnected||input.value.trim()!==query)return;
          results.innerHTML=matches.length?'<ul class="profile-friends">'+matches.map(p=>'<li><a href="#profile/'+safe(p.id)+'"><bdi>'+safe(p.name)+'</bdi>'+(p.username?' <small><bdi dir="ltr">@'+safe(p.username)+'</bdi></small>':'')+'</a></li>').join('')+'</ul>':t('profileMissing');
        }catch(error){if(form.isConnected&&input.value.trim()===query)results.textContent=t(error.message);}
      },220);
      return;
    }
    if(!input.closest?.('.profile-editor'))return;
    const banner=document.querySelector('.profile-banner');
    if(!banner)return;
    if(input.name==='name')banner.querySelector('.profile-banner-content h2 bdi').textContent=input.value;
    if(input.name==='bio'||input.name==='status'){
      const area=banner.querySelector(input.name==='bio'?'.profile-about':'.profile-custom-status');
      area.hidden=!input.value.trim();
      (input.name==='bio'?area.querySelector('.profile-bio'):area).textContent=input.value;
    }
    if(input.name==='cosmetic_decoration'||input.name==='cosmetic_effect'){
      const type=input.name.slice('cosmetic_'.length);
      const style=owner?.cosmeticItems?.find(item=>item.type===type&&item.id===input.value)?.style??'none';
      const container=type==='decoration'?banner.querySelector('.profile-portrait'):banner;
      container.querySelector('.cosmetic-'+type)?.remove();
      const permitted=type==='decoration'?decorationNames:effects;
      for(const name of permitted)banner.classList.toggle(type+'-'+name,name===style);
      const layer=cosmeticLayer(type,style);
      if(layer)container.insertAdjacentHTML('beforeend',layer);
      return;
    }
    if(['themeTop','themeBottom','customTheme'].includes(input.name)){
      const controls=input.form.elements;
      if(input.name!=='customTheme')controls.customTheme.checked=true;
      banner.classList.toggle('profile-custom-colors',controls.customTheme.checked);
      banner.style.setProperty('--card-top',controls.themeTop.value);
      banner.style.setProperty('--card-bottom',controls.themeBottom.value);
      input.closest('.profile-editor').querySelector('.editor-color-preview').style.cssText=themeVariables(controls.themeTop.value,controls.themeBottom.value);
    }
    if(input.name==='nameStyle'&&nameStyles.includes(input.value)){
      for(const style of nameStyles)banner.classList.toggle('name-style-'+style,input.value===style);
    }
    if(input.name==='frame'&&frames.includes(input.value)){
      for(const style of frames)banner.classList.toggle('profile-frame-'+style,input.value===style);
    }
    if(input.name==='accent'&&/^#[a-f0-9]{6}$/i.test(input.value)) banner.style.setProperty('--profile-accent',input.value);
    const cover=banner.querySelector('.profile-cover');
    if(input.name==='bannerPicker')input.form.elements.bannerColor.value=input.value;
    if(input.name==='bannerColor'&&color(input.value))input.form.elements.bannerPicker.value=input.value;
    if(['bannerPicker','bannerColor'].includes(input.name)&&color(input.value))banner.style.setProperty('--banner-color',input.value);
    if(input.name==='bannerStyle'&&[...bannerStyles,'upload'].includes(input.value))cover.className='profile-cover cover-'+input.value;
    if(input.name==='cardTheme'&&themes.includes(input.value))for(const theme of themes)banner.classList.toggle('theme-'+theme,theme===input.value);
    const options={effect:effects,decoration:decorationNames}[input.name];
    if(options?.includes(input.value)) for(const option of options) banner.classList.toggle(input.name+'-'+option,option===input.value);
  });
  function shopPage(){
    const heading='<div class="page-head"><h1>'+t('shop')+'</h1></div>';
    const response=message?'<p role="status" class="account-message">'+safe(t(message))+'</p>':'';
    if(loading||!shop)return heading+response+(loading?'<p>'+t('profileLoading')+'</p>':'');
    const puzzle='<section class="panel profile-block shop-puzzle" id="shop-puzzle"><div class="puzzle-lock" aria-hidden="true">◇</div><div>'+
      '<h2>'+t('puzzleTitle')+'</h2><p>'+t('puzzleLead')+'</p>'+
      '<button class="button secondary" type="button" data-action="rules" data-game="eights">'+t('puzzleShowCover')+'</button>'+
      '<p class="puzzle-prize">'+t('puzzlePrize')+' <strong>'+num(shop.puzzle.reward)+' '+t('points')+'</strong></p>'+
      '<details><summary>'+t('puzzleInstructions')+'</summary><p>'+t('puzzleOrder')+'</p><ol>'+
      ['puzzleRule1','puzzleRule2','puzzleRule3','puzzleRule4'].map(key=>'<li>'+t(key)+'</li>').join('')+
      '</ol></details>'+(shop.puzzle.solved?'<p class="puzzle-solved">'+t('puzzleAlreadySolved')+'</p>':
        owner?'<form data-account="puzzle"><label>'+t('puzzleCode')+'<input name="answer" dir="ltr" inputmode="numeric" autocomplete="off" maxlength="4" required></label>'+
          '<button class="button primary" type="submit">'+t('puzzleTry')+'</button></form>':'')+'</div></section>';
    const friends=owner?.friends.filter(peer=>peer.relationship==='friends')??[];
    const act=(id,key,action,enabled=false)=>'<button type="button" class="button secondary" data-shop-action="'+action+
      '" data-item="'+safe(id)+'" data-enabled="'+enabled+'">'+t(key)+'</button>';
    const items=shop.catalog.map(item=>{
      const owned=shop.owned.includes(item.id);
      const wished=shop.wishlist.includes(item.id);
      const equipped=shop.equipped[item.type]===item.id;
      const preview=cosmeticSample(item,owner,safe);
      return '<article class="panel profile-block shop-item">'+preview+'<h2>'+safe(item.name[document.documentElement.lang]??item.name.en)+'</h2>'+
        '<p>'+num(item.price)+' '+t('points')+'</p>'+
        (owner?'<div class="actions">'+(owned?act(item.id,equipped?'shopUnequip':'shopEquip','equip'):act(item.id,'shopBuy','buy')+
          act(item.id,wished?'shopUnwish':'shopWish','wish',!wished))+'</div>':'')+
        (friends.length?'<form data-account="gift" data-item="'+safe(item.id)+'"><label>'+t('shopGiftTo')+
          '<select name="to" required><option value=""></option>'+friends.map(peer=>'<option value="'+safe(peer.id)+'">'+safe(peer.name)+'</option>').join('')+
          '</select></label><button class="button secondary" type="submit">'+t('shopGift')+'</button></form>':'')+'</article>';
    }).join('');
    return heading+response+(owner?'<p class="shop-balance">'+t('shopBalance')+' <strong>'+num(shop.balance)+'</strong></p>':
      '<button class="button secondary" data-action="accountLogin">'+t('discordLogin')+'</button>')+
      puzzle+(items?'<div class="shop-grid">'+items+'</div><p class="cosmetic-credits"><a href="/cosmetics/noto/ATTRIBUTION.txt" target="_blank" rel="noopener">'+t('shopArtCredits')+'</a></p>':'<section class="panel profile-block"><p>'+t('shopEmpty')+'</p></section>');
  }
  return {load,paintPreview,page:()=>route()==='settings'?renderSettings({owner,loading,message,t,safe,...getSitePreferences()}):route()==='shop'?shopPage():renderProfile({owner,person,selected:target(),social:route()==='friends',tab:pageTab,boardDraft:target()?undefined:boardDraft,loading,message,t,safe,num})};
}
