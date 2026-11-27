import {center,roomAt,floorAt} from '../../public/games/ship-floor.js';
import {randomInt} from 'node:crypto';
import {base,finish,shuffle} from './core.js';

const stations=[0,2,6,8];
const neighboring=(a,b)=>Math.abs(a%3-b%3)+Math.abs(Math.floor(a/3)-Math.floor(b/3))===1;
const living=s=>s.players.filter(id=>!s.out.includes(id));
const team=s=>s.impostors??[s.spy];
const impostor=(s,id)=>team(s).includes(id);
function victory(s,spyWins){
  return finish(s,s.players.flatMap((id,i)=>impostor(s,id)===spyWins?[i]:[]));
}
function evaluate(s){
  const remaining=living(s).filter(id=>impostor(s,id)).length;
  if(!remaining)return victory(s,false);
  if(living(s).length<=2*remaining)return victory(s,true);
  if(s.players.every(id=>impostor(s,id)||!s.tasks[id].length))return victory(s,false);
  return s;
}
function closeMeeting(s){
  const tally=new Map();
  for(const id of Object.values(s.votes))tally.set(id,(tally.get(id)||0)+1);
  const order=[...tally].sort((a,b)=>b[1]-a[1]);
  s.ejected=order.length&&order[0][1]>(order[1]?.[1]||0)&&order[0][0]!=='skip'?order[0][0]:null;
  if(s.ejected)s.out.push(s.ejected);
  s.phase='field';s.round++;s.bodies=[];s.votes={};
  s.readyAt=Date.now()+12000;
  s.xy={};
  for(const id of s.players)s.pos[id]=4;
  return evaluate(s);
}
export const orbit={
  concurrent:true,
  practiceMove(s,id){
    const v=this.view(s,id).orbit;
    const here=v.here, now=Date.now();
    if(s.phase==='meeting'){
      if(v.ghost||id in s.votes)return null;
      const choices=v.alive.filter(p=>p!==id&&!v.allies.includes(p));
      choices.push('skip');
      return {type:'vote',value:choices[randomInt(choices.length)]};
    }
    const walkTo=destination=>{
      if(here===destination)return null;
      const horizontal=destination%3-here%3;
      const next=horizontal?here+Math.sign(horizontal):here+3*Math.sign(destination-here);
      return {type:'walk',value:next};
    };
    if(v.spy&&v.ghost)return null;
    if(v.spy){
      const target=v.nearby.find(p=>p!==id&&!v.allies.includes(p));
      if(target&&now>=v.readyAt)return {type:'tag',value:target};
      if(v.phase==='field'&&now>=v.alarmAt)return {type:'alarm'};
    }else{
      if(!v.ghost&&v.bodies.length)return {type:'report'};
      if(!v.ghost&&v.phase==='alarm'){
        const station=[0,8].filter(p=>!v.repairs.includes(p)).sort((a,b)=>Math.abs(a-here)-Math.abs(b-here))[0];
        return station===here?{type:'repair'}:walkTo(station);
      }
      const task=v.tasks.find(t=>t.room===here)??v.tasks[0];
      if(task)return task.room===here?{type:'task',value:(task.code+task.step)%4}:walkTo(task.room);
      if(v.ghost)return null;
    }
    const exits=Array.from({length:9},(_,i)=>i).filter(i=>neighboring(here,i));
    return {type:'walk',value:exits[randomInt(exits.length)]};
  },
  deadlineSeconds:s=>s.phase==='alarm'?45:s.phase==='meeting'?60:0,
  timeoutMove:()=>({type:'timeout'}),
  start(players){
    const impostors=shuffle([...players]).slice(0,players.length>=12?3:players.length>=8?2:1);
    const spy=impostors[0];
    const s={...base(players),spy,impostors,phase:'field',round:1,pos:{},tasks:{},out:[],bodies:[],votes:{},calls:[],readyAt:Date.now()+12000,alarmAt:Date.now()+18000,moved:{},ejected:null};
    for(const id of players){s.pos[id]=4;s.tasks[id]=shuffle([...stations]).slice(0,3).map(room=>({room,code:randomInt(4),step:0}));}
    return s;
  },
  move(s,id,input,{automated=false}={}){
    if(s.finished||!input||!s.players.includes(id))return null;
    const {type,value}=input,now=Date.now(),here=s.pos[id],alive=!s.out.includes(id);
    if(automated&&type==='timeout')return s.phase==='meeting'?closeMeeting(s):s.phase==='alarm'?victory(s,true):null;
    if(s.phase==='meeting'){
      if(!alive||type!=='vote'||id in s.votes||!(value==='skip'||living(s).includes(value)))return null;
      s.votes[id]=value;
      return living(s).every(p=>p in s.votes)?closeMeeting(s):s;
    }
    if(type==='step'){
      const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[value];
      if(!Array.isArray(delta)||now<(s.moved[id]||0))return null;
      const old=s.xy?.[id]??center(here);
      let {x,y}=old;
      for(let i=0;i<12;i++){const nx=x+delta[0],ny=y+delta[1];if(!floorAt(nx,ny))break;x=nx;y=ny;}
      if(x===old.x&&y===old.y)return null;
      (s.xy??={})[id]={x,y};s.pos[id]=roomAt(x,y);s.moved[id]=now+95;return s;
    }
    if(type==='walk'||type==='vent'){
      if(type==='walk'&&!automated)return null;
      if(!Number.isInteger(value)||value<0||value>8||now<(s.moved[id]||0))return null;
      if(type==='walk'?!neighboring(here,value):!impostor(s,id)||!stations.includes(here)||!stations.includes(value)||here===value)return null;
      (s.xy??={})[id]=center(value);s.pos[id]=value;s.moved[id]=now+400;return s;
    }
    if(type==='task'&&!impostor(s,id)){
      const i=s.tasks[id].findIndex(task=>task.room===here&&(task.code+task.step)%4===value);
      if(i<0)return null;
      const task=s.tasks[id][i];
      task.step++;
      if(task.step>=(here===0?3:here===6?2:1))s.tasks[id].splice(i,1);
      return evaluate(s);
    }
    if(!alive)return null;
    if(type==='tag'&&impostor(s,id)&&here>=0&&living(s).includes(value)&&!impostor(s,value)&&s.pos[value]===here&&now>=s.readyAt){
      s.out.push(value);s.bodies.push({id:value,room:here});s.readyAt=now+18000;return evaluate(s);
    }
    if(type==='alarm'&&impostor(s,id)&&s.phase==='field'&&now>=s.alarmAt){
      s.phase='alarm';s.repairs=[];return s;
    }
    if(type==='repair'&&s.phase==='alarm'&&[0,8].includes(here)&&!s.repairs.includes(here)){
      s.repairs.push(here);
      if(s.repairs.length===2){s.phase='field';s.alarmAt=now+40000;}
      return s;
    }
    if(type==='report'&&s.bodies.some(body=>body.room===here)||type==='call'&&s.phase==='field'&&here===4&&!s.calls.includes(id)){
      if(type==='call')s.calls.push(id);
      s.caller=id;s.phase='meeting';s.alarmAt=now+40000;s.votes={};return s;
    }
    return null;
  },
  view(s,id){
    const member=s.players.includes(id),here=s.pos[id],alive=living(s),spy=impostor(s,id);
    return {active:member&&!s.finished&&(s.phase!=='meeting'||alive.includes(id)&&!(id in s.votes)),finished:s.finished,winners:s.winners,orbit:{
      phase:s.phase,here,actors:s.players.filter(p=>p===id||!s.out.includes(p)).map(p=>({id:p,...(s.xy?.[p]??center(s.pos[p]))})).filter(p=>{
        const me=s.xy?.[id]??center(here);return !member||p.id===id||Math.hypot(p.x-me.x,p.y-me.y)<150;
      }),spy:member?spy:null,ghost:member&&!alive.includes(id),alive:s.phase==='meeting'?alive:undefined,
      nearby:alive.filter(p=>s.pos[p]===here),bodies:s.bodies.filter(b=>b.room===here),caller:s.caller,ejected:s.ejected,
      tasks:member&&!spy?s.tasks[id]:[],total:(s.players.length-team(s).length)*3,left:s.players.reduce((n,p)=>n+(impostor(s,p)?0:s.tasks[p].length),0),
      repairs:s.phase==='alarm'?s.repairs:[],canCall:member&&!s.calls.includes(id),allies:spy?team(s).filter(p=>p!==id):[],reveal:s.finished?team(s):null,
      voted:Object.keys(s.votes).length,readyAt:spy?s.readyAt:null,alarmAt:spy?s.alarmAt:null}};
  }
};
