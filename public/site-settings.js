import {siteThemes,siteAccents,validAccent} from './site-theme.js';
export const networks=['instagram','tiktok','youtube','twitch','github','spotify','steam','website'];
export const labels={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',twitch:'Twitch',github:'GitHub',spotify:'Spotify',steam:'Steam'};

const fields=['bio','stats','links','activity','board','games','wishlist'];

export function renderSettings({owner,loading,message,t,safe,language,soundMuted,siteTheme='dark',siteAccent=siteAccents[0],hash=location.hash}){
  const active=hash==='#settings/privacy'?'privacy':hash==='#settings/links'?'links':'general';
  const sections=[['general','settingsGeneral','#settings'],['privacy','settingsPrivacy','#settings/privacy'],['links','profileLinks','#settings/links']];
  const navigation='<nav class="settings-nav" aria-label="'+t('settings')+'">'+sections.map(([id,label,url])=>
    '<a class="button secondary" href="'+url+'"'+(id===active?' aria-current="page"':'')+'>'+t(label)+'</a>').join('')+'</nav>';
  const notice=message?'<p role="status" class="account-message">'+safe(t(message))+'</p>':'';
  const save='<button type="submit" class="button primary">'+t('accountSave')+'</button>';
  let body;
  if(active==='general'){
    body='<h2>'+t('settingsGeneral')+'</h2><div class="settings-fields">'+
      '<label>'+t('settingsLanguage')+'<select data-site-language><option value="ar"'+(language==='ar'?' selected':'')+'>العربية</option>'+
      '<option value="en"'+(language==='en'?' selected':'')+'>English</option></select></label>'+
      '<label class="settings-toggle"><input type="checkbox" data-site-sounds'+(!soundMuted?' checked':'')+'> '+t('settingsSounds')+'</label>'+
      '<label>'+t('settingsTheme')+'<select data-site-theme>'+siteThemes.map(theme=>'<option value="'+theme+'"'+
      (siteTheme===theme?' selected':'')+'>'+t('settingsTheme_'+theme)+'</option>').join('')+'</select></label>'+
      '<label>'+t('settingsAccent')+'<input type="color" data-site-accent value="'+(validAccent(siteAccent)?siteAccent:siteAccents[0])+'"></label>'+
      '</div><p>'+t('settingsDevice')+'</p>'+(owner?'<div class="settings-user-id"><span>'+t('settingsUserId')+'</span><code dir="ltr">'+safe(owner.publicId)+
      '</code><button class="button secondary" type="button" data-copy-profile-id="'+safe(owner.publicId)+'">'+t('profileCopyId')+'</button></div>':'')+'<div class="settings-session"><button class="button secondary" type="button" data-action="'+
      (owner?'accountLogout':'accountLogin')+'">'+t(owner?'discordLogout':'discordLogin')+'</button></div>';
  }else if(loading){
    body='<p role="status">'+t('profileLoading')+'</p>';
  }else if(!owner){
    body='<button type="button" class="button primary" data-action="accountLogin">'+t('discordLogin')+'</button>';
  }else if(active==='privacy'){
    body='<h2>'+t('profilePrivacy')+'</h2><form data-account="privacy"><div class="settings-fields">'+fields.map(field=>
      '<label>'+t('profile_visibility_'+field)+'<select name="visibility_'+field+'">'+['private','friends','public'].map(value=>
        '<option value="'+value+'"'+(owner.privacy[field]===value?' selected':'')+'>'+t('profile_'+value)+'</option>').join('')+'</select></label>'
    ).join('')+'</div>'+save+'</form>';
  }else{
    body='<h2>'+t('profileLinks')+'</h2><p>'+t('profileLinksPublicHint')+'</p><form data-account="links"><div class="settings-fields">'+networks.map(id=>
      '<label><span class="settings-link-brand"><img alt="" src="'+(id==='website'?'/icons/globe':'/brands/'+id)+'.svg">'+
      (labels[id]??t('profileWebsite'))+'</span><input type="url" dir="ltr" name="link_'+id+'" value="'+safe(owner.links?.[id])+
      '" maxlength="270" placeholder="https://"></label>').join('')+'</div>'+save+'</form>';
  }
  return '<div class="page-head"><h1>'+t('settings')+'</h1></div><div class="settings-layout">'+navigation+
    '<section class="panel profile-block settings-content">'+notice+body+'</section></div>';
}
