import {shipScene} from './ship-scene.js';
import {matchClock,resultActions} from './match-chrome.js';

const rooms=[['المفاعل','Reactor'],['المختبر','Lab'],['الاتصالات','Comms'],['المخزن','Cargo'],['مركز القيادة','Bridge'],['العيادة','Medbay'],['الملاحة','Navigation'],['الممر','Transit'],['الطاقة','Power']];
const symbols=['◈','✧','⌁','▦','◎','✚','✥','⇄','ϟ'];
const terminals=['◆','●','▲','■'];
export function renderOrbit(room,{t,safe,viewerId}){
  const m=room.match,v=m.orbit,lang=t('orbit')[0]==='Among Us'?1:0;
  const l=(ar,en)=>lang?en:ar;
  const name=id=>safe(room.members.find(p=>p.id===id)?.name??'');
  const btn=(type,value,label,css='button secondary')=>'<button class="'+css+'" data-command="'+safe(JSON.stringify({type,value}))+'">'+label+'</button>';
  const living=!v.ghost&&v.spy!==null;
  let controls='';
  if(m.finished)controls='<h3>'+l('الفائزون','Winners')+' · '+m.winners.map(name).join('، ')+'</h3><p>'+l('المندس','Impostor')+' · '+v.reveal.map(name).join(' · ')+'</p>';
  else if(v.phase==='meeting'){
    controls='<h3>'+l('اجتماع الطاقم','Crew meeting')+'</h3><p>'+name(v.caller)+' · '+l('ناقشوا في دردشة الغرفة ثم صوّتوا','Discuss in room chat, then vote')+' · '+v.voted+' / '+v.alive.length+'</p>';
    if(m.active)controls+=v.alive.map(p=>btn('vote',p,name(p))).join(' ')+btn('vote','skip',l('تخطّي','Skip'));
  }else{
    controls=shipScene(room,v,viewerId,rooms,lang,safe);
    if(m.active)controls+='<div class="ship-pad" dir="ltr">'+[['left','←'],['up','↑'],['down','↓'],['right','→']].map(([d,text])=>'<button type="button" class="button secondary" data-ship-dir="'+d+'">'+text+'</button>').join('')+'</div>';
    if(v.ejected)controls+='<p>'+l('آخر لاعب أُخرج','Last ejected')+' · '+name(v.ejected)+'</p>';
    if(v.spy!==null)controls+='<p>'+l('في الحجرة','In compartment')+' · '+v.nearby.map(name).join('، ')+'</p>';
    if(v.phase==='alarm')controls+='<p role="status">'+l('إنذار! أصلح المفاعل والطاقة','Alarm! Restore reactor and power')+' · '+v.repairs.length+'/2</p>';
    const task=v.tasks.find(entry=>entry.room===v.here);
    const marks=task?.room===8?['12 V','24 V','36 V','48 V']:task?.room===6?['↑','→','↓','←']:terminals;
    const prompt=task?.room===0?l('زامن نبضات المفاعل','Synchronise reactor pulses'):task?.room===6?l('اضبط اتجاه الملاحة','Align navigation heading'):task?.room===8?l('اضبط جهد الطاقة','Set the bus voltage'):l('طابق إشارة الاتصالات','Match the comms signal');
    if(task)controls+='<p>'+prompt+' <b>'+marks[(task.code+task.step)%4]+'</b></p>'+marks.map((mark,i)=>btn('task',i,mark)).join(' ');
    if(living){
      if(v.bodies.length)controls+=btn('report',null,l('إبلاغ عن لاعب مقصى','Report downed player')+' · '+v.bodies.map(b=>name(b.id)).join('، '));
      if(v.here===4&&v.canCall&&v.phase==='field')controls+=btn('call',null,l('اجتماع طارئ','Emergency meeting'));
      if(v.phase==='alarm'&&[0,8].includes(v.here)&&!v.repairs.includes(v.here))controls+=btn('repair',null,l('إصلاح العطل','Repair system'));
      if(v.spy){
        if(v.allies.length)controls+='<p>'+l('فريقك','Your team')+' · '+v.allies.map(name).join(' · ')+'</p>';
        controls+='<p>'+l('الإقصاء من نفس الحجرة بعد فترة الانتظار','Tag a crewmate in your compartment after cooldown')+'</p>';
        controls+=v.nearby.filter(p=>p!==viewerId&&!v.allies.includes(p)).map(p=>btn('tag',p,l('إقصاء','Tag')+' · '+name(p))).join(' ');
        if(v.phase==='field')controls+=btn('alarm',null,l('تعطيل المفاعل','Sabotage reactor'));
        if([0,2,6,8].includes(v.here))controls+='<p>'+l('شبكة الفتحات','Vent network')+'</p>'+[0,2,6,8].filter(i=>i!==v.here).map(i=>btn('vent',i,rooms[i][lang])).join(' ');
      }
    }
  }
  const role=v.spy===null?l('متفرج','Spectator'):v.ghost?l('شبح','Ghost'):v.spy?l('المندس','Impostor'):l('أحد أفراد الطاقم','Crewmate');
  return '<section class="panel match-panel orbit-match"><header><h2>'+t('orbit')[0]+'</h2><strong>'+role+'</strong></header><p>'+l('مهام الطاقم','Crew tasks')+' · '+(v.total-v.left)+' / '+v.total+'</p><progress max="'+v.total+'" value="'+(v.total-v.left)+'"></progress>'+matchClock(m,t)+'<form data-orbit-form>'+controls+'</form>'+resultActions(room,viewerId,t)+'</section>';
}
