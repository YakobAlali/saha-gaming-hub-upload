import {randomInt} from 'node:crypto';

const topics=[
  [['البحر','Sea'],['المكتبة','Library'],['القطار','Train'],['المقهى','Café']],
  [['البومة','Owl'],['الأخطبوط','Octopus'],['الفيل','Elephant'],['الثعلب','Fox']],
  [['البيتزا','Pizza'],['الفشار','Popcorn'],['الفراولة','Strawberry'],['المثلجات','Ice cream']],
  [['المظلة','Umbrella'],['المغناطيس','Magnet'],['المصباح','Lantern'],['الساعة','Clock']]
];
const drawingWords=[['منارة','Lighthouse'],['سلحفاة','Turtle'],['بالون','Balloon'],['مرآة','Mirror'],
  ['بركان','Volcano'],['قارب','Boat'],['روبوت','Robot'],['قمر','Moon'],['مفتاح','Key'],['فراشة','Butterfly']];
const clean=value=>typeof value==='string'?value.replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,100):'';
const normal=value=>clean(value).normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\s]+/g,'').replace(/[أإآ]/g,'ا');
const artValid=art=>Array.isArray(art)&&art.length>0&&art.length<=1120&&art.every(item=>
  Number.isInteger(item)&&item>=-1&&item<=4095)&&art.some(item=>item>=0);

export function socialGames({shuffle,base,advance,finish,active,view}){
  const undercover={
    humanOnly:true,
    deadlineSeconds:(_state,configured)=>configured||45,
    timeoutMove:()=>({type:'timeout'}),
    start(players){
      const choices=shuffle([...topics[randomInt(topics.length)]]);
      return {...base(players),phase:'clue',choices,secret:randomInt(choices.length),spy:randomInt(players.length),clues:[],votes:[]};
    },
    move(state,id,input,{automated}={}){
      if(!active(state,id)||!input||typeof input!=='object')return null;
      const timed=automated&&input.type==='timeout';
      if(state.phase==='clue'){
        const clue=clean(input.value);
        if(!timed&&(input.type!=='clue'||!clue||state.choices[state.secret].some(word=>normal(clue).includes(normal(word)))))return null;
        state.clues.push({id,clue});
        if(state.clues.length===state.players.length){state.phase='vote';state.turn=(state.spy+1)%state.players.length;}
        else advance(state);
        return state;
      }
      if(state.phase==='vote'){
        const vote=state.players.indexOf(input.value);
        if(!timed&&(input.type!=='vote'||vote<0||vote===state.turn))return null;
        state.votes.push(timed?-1:vote);
        if(state.votes.length<state.players.length-1){
          do{advance(state);}while(state.turn===state.spy);
          return state;
        }
        const count=state.players.map((_,i)=>state.votes.filter(vote=>vote===i).length);
        if(count[state.spy]===0||count.some((n,i)=>i!==state.spy&&n>=count[state.spy]))return finish(state,[state.spy]);
        state.phase='identify';state.turn=state.spy;return state;
      }
      if(!timed&&(input.type!=='identify'||!Number.isInteger(input.value)||input.value<0||input.value>=state.choices.length))return null;
      return finish(state,input.value===state.secret?[state.spy]:state.players.flatMap((_,i)=>i===state.spy?[]:[i]));
    },
    view(state,id){
      const seat=state.players.indexOf(id);
      return view(state,id,{party:{kind:'undercover',phase:state.phase,clues:state.clues,isSpy:seat===state.spy,
        secret:state.finished||seat>=0&&seat!==state.spy?state.choices[state.secret]:null,
        options:seat===state.spy&&state.phase==='identify'&&!state.finished?state.choices:[],
        revealed:state.finished?state.players[state.spy]:null}});
    }
  };
  const sketch={
    humanOnly:true,
    deadlineSeconds:(state,configured)=>configured||(state.phase==='draw'||state.phase==='relayDraw'?90:45),
    timeoutMove:()=>({type:'timeout'}),
    start(players){return {...base(players),phase:'mode',drawer:0,scores:players.map(()=>0),
      pool:shuffle([...drawingWords]).slice(0,players.length),art:[],album:[]};},
    move(state,id,input,{automated}={}){
      if(!active(state,id)||!input||typeof input!=='object')return null;
      const timed=automated&&input.type==='timeout';
      if(state.phase==='mode'){
        if(!timed&&(input.type!=='mode'||!['draw','relayWrite'].includes(input.value)))return null;
        state.phase=timed?'draw':input.value;return state;
      }
      if(state.phase.startsWith('relay')){
        const drawing=state.phase==='relayDraw';
        const value=drawing?input.value:clean(input.value);
        if(!timed&&(input.type!==state.phase||!(drawing?artValid(value):value)))return null;
        const step={relayWrite:0,relayDraw:1,relayGuess:2}[state.phase];
        const chain=(state.turn-step+state.players.length)%state.players.length;
        state.album[chain]??={};
        state.album[chain][state.phase]=timed?(drawing?[]:''):value;
        advance(state);
        if(state.turn===0){
          if(step===2)return finish(state);
          state.phase=step===0?'relayDraw':'relayGuess';
        }
        return state;
      }
      if(state.phase==='draw'){
        if(!timed&&(input.type!=='draw'||!artValid(input.value)))return null;
        state.art=timed?[]:input.value;state.phase='guess';state.attempts=0;advance(state);return state;
      }
      const guess=clean(input.value);
      if(!timed&&(input.type!=='guess'||!guess))return null;
      const correct=!timed&&state.pool[state.drawer].some(word=>normal(word)===normal(guess));
      if(correct){state.scores[state.turn]+=2;state.scores[state.drawer]++;}
      if(correct||++state.attempts===state.players.length-1){
        state.album.push({relayWrite:state.pool[state.drawer],relayDraw:state.art});
        if(++state.drawer===state.players.length){
          const high=Math.max(...state.scores);
          return finish(state,state.scores.flatMap((n,i)=>n===high&&high>0?[i]:[]));
        }
        state.turn=state.drawer;state.art=[];state.phase='draw';
      }else advance(state);
      return state;
    },
    view(state,id){
      const seat=state.players.indexOf(id);
      const step=state.phase==='relayDraw'?1:2;
      const chain=(seat-step+state.players.length)%state.players.length;
      const previous=seat>=0?state.album[chain]:null;
      return view(state,id,{party:{kind:'sketch',phase:state.phase,
        prompt:state.phase==='draw'&&seat===state.drawer?state.pool[state.drawer]:state.phase==='relayDraw'&&previous?.relayWrite||null,
        art:state.phase==='guess'?state.art:state.phase==='relayGuess'?previous?.relayDraw??[]:[],
        scores:state.scores,album:state.finished?state.album:[]}});
    }
  };
  return [['undercover',undercover],['sketch',sketch]];
}
