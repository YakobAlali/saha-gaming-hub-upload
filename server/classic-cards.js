export function classicCards({shuffle,base,advance,finish,active,option,view}){
  const suits=['♠','♥','♦','♣'];
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck=()=>shuffle(suits.flatMap(suit=>ranks.map(rank=>rank+suit)));
  const face=card=>option('','card',[card]);
  const suit=card=>card.at(-1);
  const rank=card=>card.slice(0,-1);
  const strength=card=>ranks.indexOf(rank(card));
  function eightActions(state){
    const hand=state.hands[state.turn];
    const top=state.discard.at(-1);
    const legal=hand.flatMap((card,index)=>rank(card)==='8'?suits.map(s=>option(index+':'+s,'eightSuit',[card,s])):
      suit(card)===state.suit||rank(card)===rank(top)?[option(index,'card',[card])]:[]);
    return legal.length?legal:[option(state.pile.length||state.discard.length>1?'draw':'pass',state.pile.length||state.discard.length>1?'draw':'pass')];
  }
  const eights={
    start(players){
      const pile=deck(), size=players.length===2?7:5;
      const hands=players.map(()=>pile.splice(0,size));
      const index=pile.findIndex(card=>rank(card)!=='8');
      const discard=pile.splice(index,1);
      return {...base(players),hands,pile,discard,suit:suit(discard[0]),passes:0};
    },
    move(state,id,input){
      if(!active(state,id)||!eightActions(state).some(action=>action.value===input))return null;
      if(input==='draw'){
        if(!state.pile.length)state.pile=shuffle(state.discard.splice(0,state.discard.length-1));
        state.hands[state.turn].push(state.pile.pop());
        state.passes=0;
      }else if(input==='pass'){
        if(++state.passes===state.players.length){
          const min=Math.min(...state.hands.map(hand=>hand.length));
          return finish(state,state.hands.flatMap((hand,i)=>hand.length===min?[i]:[]));
        }
      }else{
        const [index,chosen]=input.split(':');
        const [card]=state.hands[state.turn].splice(Number(index),1);
        state.discard.push(card);state.suit=chosen??suit(card);state.passes=0;
        if(!state.hands[state.turn].length)return finish(state,[state.turn]);
      }
      advance(state);return state;
    },
    view(state,id){
      return view(state,id,{table:[face(state.discard.at(-1)),option('','eightCurrentSuit',[state.suit])],
        hand:(state.hands[state.players.indexOf(id)]??[]).map(face),counts:state.hands.map(hand=>hand.length),
        actions:active(state,id)?eightActions(state):[]});
    }
  };
  function trickGame(spades){
    function actions(state){
      if(state.phase==='bid')return Array.from({length:14},(_,bid)=>option(bid,'bid',[bid]));
      const hand=state.hands[state.turn], lead=state.trick[0]&&suit(state.trick[0].card);
      if(!spades&&state.completed===0&&!state.trick.length)return [option(hand.indexOf('2♣'),'card',['2♣'])];
      const follow=lead&&hand.some(card=>suit(card)===lead);
      return hand.flatMap((card,index)=>{
        if(follow&&suit(card)!==lead)return [];
        if(!lead&&!state.broken&&suit(card)===(spades?'♠':'♥')&&hand.some(c=>suit(c)!==suit(card)))return [];
        const penalty=c=>suit(c)==='♥'||c==='Q♠';
        if(!spades&&state.completed===0&&lead&&!follow&&penalty(card)&&hand.some(c=>!penalty(c)))return [];
        return [option(index,'card',[card])];
      });
    }
    return {
      start(players){
        const pile=deck(), hands=players.map(()=>pile.splice(0,13));
        return {...base(players),hands,phase:spades?'bid':'play',turn:spades?0:hands.findIndex(hand=>hand.includes('2♣')),
          bids:[],trick:[],last:[],scores:[0,0,0,0],completed:0,broken:false};
      },
      move(state,id,input){
        if(!active(state,id)||!actions(state).some(a=>a.value===input))return null;
        if(state.phase==='bid'){
          state.bids.push(Number(input));advance(state);
          if(state.bids.length===4)state.phase='play';
          return state;
        }
        const [card]=state.hands[state.turn].splice(Number(input),1);
        if(suit(card)===(spades?'♠':'♥'))state.broken=true;
        state.trick.push({card,seat:state.turn});
        if(state.trick.length<4){advance(state);return state;}
        const lead=suit(state.trick[0].card);
        const power=card=>strength(card)+(spades&&suit(card)==='♠'?40:suit(card)===lead?20:0);
        state.turn=state.trick.reduce((best,next)=>power(next.card)>power(best.card)?next:best).seat;
        state.scores[state.turn]+=spades?1:state.trick.reduce((sum,{card})=>sum+(suit(card)==='♥'?1:card==='Q♠'?13:0),0);
        state.last=state.trick;state.trick=[];
        if(++state.completed!==13)return state;
        if(spades){
          const scores=[0,1].map(i=>{
            const count=state.scores[i]+state.scores[i+2], bid=state.bids[i]+state.bids[i+2];
            const nil=[i,i+2].reduce((sum,seat)=>sum+(state.bids[seat]===0?(state.scores[seat]===0?100:-100):0),0);
            return nil+(count<bid?-10*bid:10*bid+count-bid);
          });
          state.finalScores=scores;
          return finish(state,scores[0]===scores[1]?[]:scores[0]>scores[1]?[0,2]:[1,3]);
        }
        if(state.scores.includes(26))state.scores=state.scores.map(n=>n===26?0:26);
        const min=Math.min(...state.scores);
        return finish(state,state.scores.flatMap((score,i)=>score===min?[i]:[]));
      },
      view(state,id){
        const table=(state.trick.length?state.trick:state.last).map(({seat,card})=>option('','trickCard',[seat+1,card]));
        const score=(state.finalScores??state.scores).join(' / ');
        return view(state,id,{table:[...table,option('','cardTotals',[score])],hand:(state.hands[state.players.indexOf(id)]??[]).map(face),
          counts:state.hands.map(hand=>hand.length),actions:active(state,id)?actions(state):[]});
      }
    };
  }
  return [['eights',eights],['hearts',trickGame(false)],['spades',trickGame(true)]];
}
