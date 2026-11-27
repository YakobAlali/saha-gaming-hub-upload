export const replicaFields=['name','plant','object','animal','country'];
const alphabets={ar:[...'أبتثجحخدذرزسشصضطظعغفقكلمنهوي'],en:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']};
const durations={choose:35,write:75,review:40,result:12};

function normalize(value,language){
  const lower=value.normalize('NFKC').trim().toLowerCase();
  return language==='ar' ? lower.replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ') :
    lower.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ');
}

function answer(value,language){
  if(typeof value!=='string') return '';
  const text=value.replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/g,' ').trim();
  const pattern=language==='ar' ? /^[\p{Script=Arabic}\p{M} '\-]+$/u : /^[\p{Script=Latin}\p{M} '\-]+$/u;
  return text.length<=50 && pattern.test(text) ? text : '';
}

function table(state){
  const initial=normalize(state.letter,state.language);
  return state.players.map((id,seat)=>replicaFields.map((field,column)=>{
    const value=state.answers[seat]?.[field] ?? '';
    const key=normalize(value,state.language);
    return {id,seat,column,field,value,key,valid:Boolean(key && key.startsWith(initial))};
  })).flat();
}

function finishReview(state){
  const entries=table(state);
  const majority=Math.floor((state.players.length-1)/2)+1;
  const rejected=new Map();
  for(const flags of state.votes) for(const code of flags ?? []) rejected.set(code,(rejected.get(code)??0)+1);
  const approved=entries.map(entry=>({...entry,accepted:entry.valid && (rejected.get(entry.seat*5+entry.column)??0)<majority}));
  const frequencies=new Map();
  for(const row of approved) if(row.accepted) {
    const key=row.field+'|'+row.key;
    frequencies.set(key,(frequencies.get(key)??0)+1);
  }
  state.rows=approved.map(({key,accepted,...entry})=>{
    const score=!accepted?0:frequencies.get(entry.field+'|'+key)>1?5:10;
    state.scores[entry.seat]+=score;
    return {...entry,score};
  });
  if(state.used.length===alphabets[state.language].length){
    const highest=Math.max(...state.scores);
    state.winners=highest>0 && state.scores.filter(score=>score===highest).length===1 ?
      state.players.filter((_,seat)=>state.scores[seat]===highest) : [];
    state.finished=true;
    state.phase='finished';
  } else state.phase='result';
}

function startLetter(state,value){
  state.letter=value;
  state.used.push(value);
  state.phase='write';
  state.answers=state.players.map(()=>null);
  state.votes=state.players.map(()=>null);
  state.rows=[];
}

export function replica(language){
  return {
    humanOnly:true,
    concurrent:true,
    deadlineSeconds(state,custom){
      return custom && ['choose','write'].includes(state.phase) ? custom : durations[state.phase];
    },
    start(players){
      return {players,language,turn:0,round:1,phase:'choose',used:[],letter:null,
        scores:players.map(()=>0),answers:[],votes:[],rows:[],winners:[],finished:false};
    },
    timeoutMove(state){
      return {type:'timeout',phase:state.phase,round:state.round};
    },
    move(state,id,input,{automated=false}={}){
      const seat=state.players.indexOf(id);
      if(seat<0 || state.finished || !input || typeof input!=='object' || input.phase!==state.phase || input.round!==state.round) return null;
      const allowed=alphabets[language].filter(letter=>!state.used.includes(letter));
      const timeout=automated && input.type==='timeout';
      if(input.type==='timeout' && !timeout) return null;
      if(state.phase==='choose'){
        if(!timeout && (seat!==state.turn || input.type!=='letter' || !allowed.includes(input.letter))) return null;
        startLetter(state,timeout?allowed[0]:input.letter);
      }else if(state.phase==='write'){
        if(!timeout){
          if(input.type!=='answers' || state.answers[seat] || !input.values || typeof input.values!=='object') return null;
          state.answers[seat]=Object.fromEntries(replicaFields.map(field=>[field,answer(input.values[field],language)]));
        }
        if(timeout || state.answers.every(Boolean)) state.phase='review';
      }else if(state.phase==='review'){
        if(!timeout){
          if(input.type!=='review' || state.votes[seat] || !Array.isArray(input.flags) || input.flags.length>25) return null;
          state.votes[seat]=[...new Set(input.flags.filter(code=>Number.isInteger(code)&&code>=0&&code<state.players.length*5&&Math.floor(code/5)!==seat))];
        }
        if(timeout || state.votes.every(Boolean)) finishReview(state);
      }else if(state.phase==='result'){
        if(!timeout && (input.type!=='next' || seat!==state.turn)) return null;
        state.turn=(state.turn+1)%state.players.length;
        state.round++;
        state.letter=null;
        state.phase='choose';
      }else return null;
      return state;
    },
    view(state,id){
      const seat=state.players.indexOf(id);
      const {phase,turn,players,finished,winners,round,used,letter,scores}=state;
      const active=seat>=0 && !finished && ((phase==='choose'||phase==='result') ? seat===turn : phase==='write' ? !state.answers[seat] : !state.votes[seat]);
      const entries=phase==='review' ? table(state).map(({key,...entry})=>entry) :
        ['result','finished'].includes(phase)?state.rows:[];
      return {turn:players[turn],active,finished,winners,wordRound:{phase,round,language,used,letter,scores,entries,
        alphabet:alphabets[language],submitted:phase==='review'?state.votes.map(Boolean):state.answers.map(Boolean)}};
    }
  };
}
