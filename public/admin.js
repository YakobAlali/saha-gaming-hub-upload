import {reportDetails} from './reports.js';
import {catalog} from './catalog.js';

const levels={member:0,helper:1,shopkeeper:1,moderator:2,admin:3,owner:4};
export function setupAdmin({route,t,safe,render,go,notify}){
  let role='member',snapshot,error,query='',sequence=0,tab='users',pageNumber=1,tickets=[],ticketFilter='pending';
  let audit={items:[],page:1,total:0,pageSize:25},auditCategory='all',auditQuery='',auditPage=1;
  async function api(path='',body){
    const response=await fetch('/auth/discord/'+(path.startsWith('/reports')?path.slice(1):'admin'+path),body===undefined?{cache:'no-store'}:{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error??'serverError');
    return data;
  }
  async function load(){
    if(route()!=='admin')return;
    const run=++sequence;
    try{
      const scope=['users','staff','sanctions'].includes(tab)?tab:'users';
      const data=await api('?'+new URLSearchParams({q:query,scope,page:pageNumber}));
      const reports=tab==='tickets'&&levels[data.role]>=3?await api('/reports'):null;
      const history=tab==='audit'&&levels[data.role]>=3?await api('/audit?'+new URLSearchParams({category:auditCategory,q:auditQuery,page:auditPage})):null;
      if(run===sequence){if(history)audit=history;snapshot=data;role=data.role;error=null;tickets=reports?.items??[];}
    }
    catch(e){if(run===sequence){snapshot=null;error=e.message;}}
    if(run===sequence&&route()==='admin')render();
  }
  async function access(){
    try{role=(await api('/access')).role;}catch{role='member';}
    document.querySelector('#staff-link').hidden=!levels[role];
    if(route()==='admin')await load();
  }
  window.addEventListener('hashchange',()=>{if(route()==='admin')void access();else sequence++;});
  document.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-staff-tab],[data-staff-page],[data-ticket-filter],[data-audit-category],[data-audit-page]');
    if(!control)return;
    if(control.dataset.staffTab){tab=control.dataset.staffTab;query='';pageNumber=1;}
    else if(control.dataset.ticketFilter){ticketFilter=control.dataset.ticketFilter;render();return;}
    else if(control.dataset.auditCategory){auditCategory=control.dataset.auditCategory;auditPage=1;}
    else if(control.dataset.auditPage)auditPage=Number(control.dataset.auditPage);
    else pageNumber=Number(control.dataset.staffPage);
    void load();
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest?.('[data-admin]');
    if(!form)return;
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    const action=form.dataset.admin;
    if(action==='auditSearch'){auditQuery=values.q;auditPage=1;await load();return;}
    if(action==='search'){query=values.q;pageNumber=1;await load();return;}
    const button=event.submitter;
    if(button?.disabled)return;
    if(button)button.disabled=true;
    const payload={action,id:form.dataset.id,code:form.dataset.code,reason:values.reason,days:Number(values.days)};
    payload.value=action==='edit'?{name:values.name,game:values.game,listed:!!values.listed,
      allowSpectators:!!values.allowSpectators,voiceEnabled:!!values.voiceEnabled}:
      action==='role'?values.role:action==='grantPoints'?Number(values.amount):form.dataset.value==='true';
    try{
      if(action==='ticket')await api('/reports/review',{id:payload.id,status:button?.value});
      else await api('',payload);
      notify('accountSaved');
      if(action==='observe')go('room');
      else await load();
    }catch(e){form.querySelector('[role=status]').textContent=t(e.message);}
    finally{if(button)button.disabled=false;}
  });
  const btn=key=>'<button class="button secondary" type="submit">'+safe(t(key))+'</button>';
  const field=(label,name,attrs)=>'<label>'+t(label)+'<input name="'+name+'" '+attrs+'></label>';
  const status='<small role="status"></small>';
  const reason=()=>field('adminReason','reason','maxlength="160" required');
  function action(actionName,label,id,code,value,withReason=true,days=false){
    return '<form data-admin="'+actionName+'" data-id="'+safe(id??'')+'" data-code="'+safe(code??'')+
      '" data-value="'+value+'">'+(withReason?reason():'')+(days?field('plusDays','days','type="number" min="1" max="'+(role==='owner'?365:30)+'" value="1" required'):'')+btn(label)+status+'</form>';
  }
  function page(){
    const intro='<div class="page-head"><h1>'+t('adminPanel')+'</h1></div>';
    if(!snapshot)return intro+'<p role="status">'+t(error??'profileLoading')+'</p>';
    const rank=levels[snapshot.role];
    const accounts=snapshot.users.map(user=>{
      const controls=user.manageable?[
        rank>=3?action('ban',user.ban?'adminUnban':'adminBan',user.id,'',!user.ban,true,!user.ban):'',
        rank>=2?action('mute',user.mute?'adminUnmute':'adminMute',user.id,'',!user.mute,true,!user.mute):'',
        rank===4&&user.canNetworkBan&&tab==='users'?action('networkBan','adminNetworkBan',user.id,'',true,true,true):'',
        rank===4?'<form data-admin="role" data-id="'+safe(user.id)+'"><label>'+t('plusTier')+'<select name="role">'+
          ['member','helper','shopkeeper','moderator','admin'].map(r=>'<option value="'+r+'"'+(user.role===r?' selected':'')+'>'+t('staff_'+r)+'</option>').join('')+
          '</select></label>'+btn('accountSave')+status+'</form>':''
      ].join(''):'';
      const grant=snapshot.grantLimit&&(user.manageable||rank===4)?'<form data-admin="grantPoints" data-id="'+safe(user.id)+'">'+
        field('shopGrantAmount','amount','type="number" min="1" max="'+snapshot.grantLimit+'" required')+
        reason()+btn('shopGrantPoints')+status+'</form>':'';
      const sanctions=[['ban',user.ban],['mute',user.mute]].filter(([,record])=>record).map(([kind,record])=>
        '<p><strong>'+t(kind==='ban'?'accountBanned':'accountMuted')+'</strong> · '+safe(new Date(record.until).toLocaleString())+
        ' · '+safe(record.reason)+'</p>').join('');
      return '<details class="staff-entry"><summary><bdi>'+safe(user.name)+'</bdi> · <bdi>@'+safe(user.username??'')+'</bdi> · '+t('staff_'+user.role)+
        '</summary>'+sanctions+'<div class="staff-actions">'+controls+grant+'</div></details>';
    }).join('');
    const rooms=snapshot.rooms.map(room=>{
      const checkbox=(key,label)=>'<label class="staff-check"><input name="'+key+'" type="checkbox"'+(room[key]?' checked':'')+'>'+t(label)+'</label>';
      const edit=rank>=3?'<form data-admin="edit" data-code="'+safe(room.code)+'">'+field('roomName','name','maxlength="40" required value="'+safe(room.name)+'"')+
        '<label>'+t('game')+'<select name="game"'+(room.running?' disabled':'')+'>'+
        catalog.map(game=>'<option value="'+game.id+'"'+(game.id===room.game?' selected':'')+'>'+safe(t(game.id)[0])+'</option>').join('')+
        '</select></label>'+(room.running?'<input type="hidden" name="game" value="'+safe(room.game)+'">':'')+
        checkbox('listed','public')+checkbox('allowSpectators','allowSpectators')+checkbox('voiceEnabled','voiceChat')+
        btn('accountSave')+status+'</form>'+action('close','adminClose','',room.code,true):'';
      const people=rank>=2?room.people.filter(person=>person.manageable).map(person=>'<details class="staff-entry staff-person"><summary><bdi>'+
        safe(person.name)+'</bdi>'+(person.host?' · '+t('host'):'')+'</summary><div class="staff-actions">'+
        action('textMute',person.muted?'adminTextUnmute':'adminTextMute',person.id,room.code,!person.muted)+
        action('voiceMute',person.voiceMuted?'voiceReleaseMute':'voiceForceMute',person.id,room.code,!person.voiceMuted)+
        action('voiceDeaf',person.deafened?'voiceReleaseDeaf':'voiceForceDeaf',person.id,room.code,!person.deafened)+
        (rank>=3?action('kick','adminKick',person.id,room.code,true):'')+'</div></details>').join(''):'';
      return '<details class="staff-entry"><summary><bdi>'+safe(room.name)+'</bdi> · <bdi>'+safe(room.code)+'</bdi> · '+t(room.listed?'public':'private')+
        '</summary><div class="staff-actions">'+action('observe','adminObserve','',room.code,true,false)+edit+'</div>'+people+'</details>';
    }).join('');
    const auditFilters=['all','bans','tickets','roles','mutes','rooms','plus','points','other'];
    const auditPages=Math.ceil(audit.total/audit.pageSize);
    const auditPaging=auditPages>1?'<div class="actions">'+(audit.page>1?'<button class="button secondary" data-audit-page="'+(audit.page-1)+'">'+t('adminPrev')+'</button>':'')+
      '<span>'+audit.page+' / '+auditPages+'</span>'+(audit.page<auditPages?'<button class="button secondary" data-audit-page="'+(audit.page+1)+'">'+t('adminNext')+'</button>':'')+'</div>':'';
    const roleName=name=>t('staff_'+name);
    const entries=audit.items.map(row=>{
      const change=row.action==='role'&&row.to?roleName(row.from)+' → '+roleName(row.to):row.action==='plus'&&row.to?
        t(row.to==='none'?'plusRemove':'sahaBadge_'+row.to):row.action==='role'&&row.reason?roleName(row.reason):row.reason;
      return '<li><strong>'+safe(t('audit_'+row.action))+'</strong><div class="staff-log-subject"><bdi>'+safe(row.actorName)+'</bdi> → <bdi>'+
        safe(row.subjectName||row.subject)+'</bdi></div><small>'+safe(new Date(row.at).toLocaleString())+'</small>'+
        (row.amount?'<p>'+safe(String(row.amount))+' '+t('points')+'</p>':'')+(change?'<p dir="auto">'+safe(change)+'</p>':'')+(row.until?'<small>'+t('auditUntil')+' '+safe(new Date(row.until).toLocaleString())+'</small>':'')+'</li>';
    }).join('');
    const auditContent=rank>=3?'<section class="panel profile-block"><h2>'+t('adminAudit')+'</h2><div class="profile-tabs">'+auditFilters.map(key=>
      '<button class="button secondary" data-audit-category="'+key+'" aria-pressed="'+(key===auditCategory)+'">'+t('auditGroup_'+key)+'</button>').join('')+
      '</div><form data-admin="auditSearch">'+field('auditSearch','q','maxlength="100" value="'+safe(auditQuery)+'"')+btn('profileFind')+'</form>'+
      (entries?'<ol class="profile-tiles staff-log">'+entries+'</ol>':'<p>'+t('auditEmpty')+'</p>')+auditPaging+'</section>':'';
    const tabs=['tickets','staff','users','sanctions','rooms','audit'].filter(key=>(rank>=3||!['tickets','audit'].includes(key))&&(snapshot.role!=='shopkeeper'||key!=='rooms'));
    const navigation='<nav class="profile-tabs" aria-label="'+t('adminPanel')+'">'+tabs.map(key=>
      '<button type="button" class="button secondary" data-staff-tab="'+key+'" aria-pressed="'+(key===tab)+'">'+t('adminTab_'+key)+'</button>').join('')+'</nav>';
    const search='<form data-admin="search">'+field('liveSearch','q','maxlength="64" value="'+safe(query)+'"')+btn('profileFind')+'</form>';
    const pages=Math.ceil(snapshot.total/50);
    const pagination=pages>1?'<div class="actions">'+(snapshot.page>1?
      '<button class="button secondary" data-staff-page="'+(snapshot.page-1)+'">'+t('adminPrev')+'</button>':'')+
      '<span>'+snapshot.page+' / '+pages+'</span>'+(snapshot.page<pages?
      '<button class="button secondary" data-staff-page="'+(snapshot.page+1)+'">'+t('adminNext')+'</button>':'')+'</div>':'';
    const network=tab==='sanctions'&&rank===4?'<section class="panel profile-block"><h2>'+t('adminNetworks')+'</h2>'+
      (snapshot.networkBans.map(entry=>'<details class="staff-entry"><summary><bdi>'+safe(entry.name)+'</bdi>'+(entry.username?' · <bdi>@'+safe(entry.username)+'</bdi>':'')+' · '+
        safe(new Date(entry.until).toLocaleString())+'</summary><p>'+safe(entry.reason)+'</p>'+
        action('networkUnban','adminNetworkUnban',entry.id,'',false)+'</details>').join('')||'<p>'+t('adminNoSanctions')+'</p>')+'</section>':'';
    let content='';
    if(tab==='tickets'&&rank>=3){
      const filters=['pending','confirmed','rejected'].map(key=>'<button type="button" class="button secondary" data-ticket-filter="'+key+
        '" aria-pressed="'+(ticketFilter===key)+'">'+t('report_'+key)+'</button>').join('');
      const list=tickets.filter(item=>item.status===ticketFilter).map(item=>'<details class="staff-entry"><summary><bdi>'+safe(item.title)+'</bdi> · '+
        safe(new Date(item.created).toLocaleString())+'</summary>'+reportDetails(item,t,safe)+(item.status==='pending'?'<form data-admin="ticket" data-id="'+safe(item.id)+'">'+
        '<div class="actions"><button class="button primary" value="confirmed">'+t('reportApprove')+'</button><button class="button secondary" value="rejected">'+
        t('reportReject')+'</button></div>'+status+'</form>':'')+'</details>').join('');
      content='<section class="panel profile-block"><h2>'+t('reportQueue')+'</h2><div class="profile-tabs">'+filters+'</div>'+
        (list||'<p>'+t('reportEmpty')+'</p>')+'</section>';
    }else if(tab==='rooms')content='<section class="panel profile-block"><h2>'+t('rooms')+'</h2>'+(rooms||'<p>'+t('noRooms')+'</p>')+'</section>';
    else if(tab==='audit')content=auditContent;
    else content='<section class="panel profile-block"><h2>'+t('adminTab_'+tab)+'</h2>'+search+
      (tab==='users'&&rank===4?'<p>'+t('adminNetworkHint')+'</p>':'')+
      (accounts||'<p>'+t(tab==='sanctions'?'adminNoSanctions':'profileMissing')+'</p>')+pagination+'</section>'+network;
    return intro+'<p>'+t('staff_'+snapshot.role)+'</p>'+navigation+'<div class="staff-grid">'+content+'</div>';
  }
  return {page,access};
}
