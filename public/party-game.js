import {matchClock,resultActions} from './games/match-chrome.js';
const sketches=new WeakMap();
const language=()=>globalThis.document?.documentElement.lang==='ar'?0:1;
const word=value=>Array.isArray(value)?value[language()]:value??'';

export function drawingFor(form){return sketches.get(form.querySelector('canvas'))??[];}

function paint(canvas,points){
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#243158';ctx.fillStyle='#243158';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
  let previous=null;
  for(const point of points){
    if(point===-1){previous=null;continue;}
    const x=(point%64)/63*canvas.width,y=Math.floor(point/64)/63*canvas.height;
    ctx.beginPath();
    if(previous){ctx.moveTo(...previous);ctx.lineTo(x,y);ctx.stroke();}
    else{ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}
    previous=[x,y];
  }
}
export function syncPartyCanvas(root){
  for(const canvas of root.querySelectorAll('canvas[data-party-art]')){
    if(sketches.has(canvas))continue;
    const points=JSON.parse(canvas.dataset.partyArt);
    sketches.set(canvas,points);
    paint(canvas,points);
    if(!canvas.hasAttribute('data-party-draw'))continue;
    const write=event=>{
      const box=canvas.getBoundingClientRect();
      const clamp=v=>Math.round(Math.max(0,Math.min(1,v))*63);
      const point=clamp((event.clientY-box.top)/box.height)*64+clamp((event.clientX-box.left)/box.width);
      if(points.length<1118&&points.at(-1)!==point){points.push(point);paint(canvas,points);}
    };
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      canvas.setPointerCapture(event.pointerId);
      if(points.length<1118&&points.at(-1)!==-1&&points.length)points.push(-1);
      write(event);
    });
    canvas.addEventListener('pointermove',event=>{if(canvas.hasPointerCapture(event.pointerId))write(event);});
    canvas.parentElement.querySelector('[data-party-clear]').onclick=()=>{points.length=0;paint(canvas,points);};
  }
}
export function renderParty(room,{t,safe,viewerId}){
  const match=room.match,{party}=match;
  const name=id=>safe(room.members.find(m=>m.id===id)?.name??'');
  const canvas=(points,editable=false)=>'<canvas width="448" height="250" data-party-art="'+safe(JSON.stringify(points))+'"'+(editable?' data-party-draw':'')+'></canvas>';
  const text='<input name="answer" required maxlength="100" dir="auto" aria-label="'+t('party_'+party.phase)+'">';
  const button=(label,value='')=>'<button class="button '+(value?'secondary':'primary')+'" type="submit" value="'+safe(value)+'">'+safe(label)+'</button>';
  const choices=party.phase==='mode'?button(t('partyDrawMode'),'draw')+button(t('partyRelayMode'),'relayWrite'):
    party.phase==='vote'?room.members.filter(m=>m.id!==viewerId).map(m=>button(m.name,m.id)).join(''):
    party.phase==='identify'?party.options.map((entry,i)=>button(word(entry),String(i))).join(''):'';
  const drawing=['draw','relayDraw'].includes(party.phase);
  const input=drawing?canvas([],true)+'<button class="button secondary" type="button" data-party-clear>'+t('partyClear')+'</button>':
    text;
  const form=match.active?'<form class="party-form" data-party-form="'+party.phase+'">'+(choices||input+button(t('partySend')))+'</form>':'';
  const current=room.members.find(m=>m.id===match.turn)?.name;
  const result=match.winners.length?match.winners.map(name).join(' · '):t('partyDone');
  const album=(party.album??[]).map(entry=>'<figure>'+canvas(entry.relayDraw??[])+'<figcaption>'+safe(word(entry.relayWrite))+
    (entry.relayGuess?' · '+safe(entry.relayGuess):'')+'</figcaption></figure>').join('');
  const clock=matchClock(match,t);
  return '<section class="panel match-panel party-match"><div class="panel-heading"><h2>'+safe(t(room.game)[0])+
    '</h2><span class="pill">'+(match.finished?result:t('party_'+party.phase)+' · '+safe(current))+'</span></div>'+clock+
    (party.isSpy&&!match.finished?'<p>'+t('partySpy')+'</p>':'')+
    (party.secret||party.prompt?'<strong class="party-prompt">'+safe(word(party.secret??party.prompt))+'</strong>':'')+
    (party.clues?.length?'<ul class="party-clues">'+party.clues.map(row=>'<li><bdi>'+name(row.id)+'</bdi> '+safe(row.clue)+'</li>').join('')+'</ul>':'')+
    (party.art?.length?canvas(party.art):'')+form+(album?'<div class="party-gallery">'+album+'</div>':'')+
    resultActions(room,viewerId,t)+'</section>';
}
