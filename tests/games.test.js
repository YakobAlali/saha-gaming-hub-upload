import {latestGames} from '../server/activity.js';
import {prepareEarlyMembers,registerEarlyMember,profileBadges} from '../server/badges.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { games } from '../server/games.js';
import { catalog } from '../public/catalog.js';
import { translate } from '../public/locale.js';
import { renderMatch } from '../public/match.js';

test('every catalog game initializes and renders in Arabic and English', () => {
  assert.deepEqual([...games.keys()].sort(),catalog.map(entry=>entry.id).sort());
  for (const [game,engine] of games) {
    const ids = ['a','b','c','d','e','f','g','h'].slice(0,catalog.find(entry=>entry.id===game).min);
    const state = engine.start(ids);
    const match = engine.view(state,ids[state.turn??0]);
    assert.equal(match.active,true,game);
    assert.equal(engine.view(state,'watcher').active,false,game);
    assert.equal(engine.move(structuredClone(state),'watcher','0'),null,game);
    for (const lang of ['ar','en']) {
      const t = key => translate(lang,key);
      assert.match(renderMatch({ game, match, members:ids.map(id => ({id,name:id})) },
        { t, safe:String, promotion:[] }), /match-panel/);
    }
  }
});

test('chess rejects illegal moves, validates turn and ends on checkmate', () => {
  const engine = games.get('chess');
  let state = engine.start(['white','black']);
  assert.equal(engine.move(state,'white','e2e5'),null);
  assert.equal(engine.move(state,'black','e7e5'),null);
  for (const move of ['f2f3','e7e5','g2g4','d8h4']) {
    state = engine.move(state,engine.view(state).turn,move);
    assert.ok(state,move);
  }
  const final = engine.view(state,'spectator');
  assert.equal(final.finished,true);
  assert.equal(final.check,true);
  assert.deepEqual(final.winners,['black']);
  assert.equal(final.history.at(-1),'Qh4#');
  assert.equal(final.board.length,64);
});

test('tic-tac-toe and four-in-a-row recognize winning lines', () => {
  for (const [game,moves] of [['tic',['0','3','1','4','2']],['connect',['0','6','1','6','2','6','3']]]) {
    const engine = games.get(game);
    let state = engine.start(['a','b']);
    for (const move of moves) state = engine.move(state,engine.view(state).turn,move);
    assert.deepEqual(engine.view(state).winners,['a']);
  }
});

test('reversi flips a bracketed disc and advances the turn', () => {
  const engine = games.get('reversi');
  const state = engine.start(['a','b']);
  const next = engine.move(state,'a','19');
  assert.ok(next);
  const view = engine.view(next,'b');
  assert.equal(view.colors[27],0);
  assert.equal(view.active,true);
});

test('card and tile views publish counts while preserving private hands', () => {
  for (const game of ['color','tarneeb','domino']) {
    const engine = games.get(game);
    const seats = game === 'tarneeb' ? ['a','b','c','d'] : ['a','b'];
    const state = engine.start(seats);
    const player = engine.view(state,'a');
    const spectator = engine.view(state,'viewer');
    assert.ok(player.hand.length);
    assert.deepEqual(spectator.hand,[]);
    assert.deepEqual(spectator.actions,[]);
    assert.deepEqual(spectator.counts,player.counts);
    assert.equal(Object.hasOwn(spectator,'deck'),false);
  }
});

test('tarneeb resolves a full deal and ludo completes an exact finish', () => {
  const engine = games.get('tarneeb');
  let state = engine.start(['a','b','c','d']);
  state = engine.move(state,'a','7');
  for (const id of ['b','c','d']) state = engine.move(state,id,'pass');
  state = engine.move(state,'a','♥');
  for (let n = 0; n < 52; n++) {
    const id = engine.view(state).turn;
    state = engine.move(state,id,engine.view(state,id).actions[0].value);
  }
  assert.equal(state.finished,true);
  assert.equal(state.winners.length,2);
  const ludo = games.get('ludo');
  const last = ludo.start(['a','b']);
  last.pawns[0] = [57,57,57,55];
  last.die = 2;
  assert.deepEqual(ludo.move(last,'a','3').winners,['a']);
});

test('UNO +4 requires no matching color and skips the recipient after drawing', () => {
  const engine = games.get('color');
  const state = engine.start(['a','b','c']);
  state.color = 'red';
  state.discard = [['red','3']];
  state.hands[0] = [['wild','draw4'],['red','1']];
  assert.equal(engine.move(structuredClone(state),'a','0:blue'),null);
  state.hands[0][1] = ['green','1'];
  const opponentCards = state.hands[1].length;
  const next = engine.move(state,'a','0:blue');
  assert.equal(next.hands[1].length,opponentCards+4);
  assert.equal(next.turn,2);
  assert.equal(next.color,'blue');
  assert.deepEqual(engine.view(next,'spectator').hand,[]);
});

test('Gomoku supports the full board and wins on five consecutive stones', () => {
  const game=games.get('gomoku');
  let state=game.start(['a','b']);
  const moves=['110','0','111','1','112','2','113','3','114'];
  for (const [index,move] of moves.entries()) {
    state=game.move(state,index%2 ? 'b' : 'a',move);
    assert.ok(state,move);
  }
  const result=game.view(state,'spectator');
  assert.deepEqual(result.winners,['a']);
  assert.equal(result.winningLine.length,5);
  assert.equal(result.board.length,121);
  assert.deepEqual(result.legal,[]);
});

test('Checkers requires consecutive captures and crowns a man on the back row', () => {
  const game=games.get('checkers');
  let state=game.start(['a','b']);
  state.board.fill(0);
  state.board[49]=1;
  state.board[42]=-1;
  state.board[28]=-1;
  state.board[14]=-1;
  state.board[5]=-1;
  assert.deepEqual(game.view(state,'a').legal,['49:35']);
  assert.equal(game.move(state,'a','49:40'),null);
  state=game.move(state,'a','49:35');
  assert.deepEqual(game.view(state,'a').legal,['35:21']);
  state=game.move(state,'a','35:21');
  state=game.move(state,'a','21:7');
  assert.equal(state.board[7],2);
  assert.equal(state.turn,1);
});

test('Replica rotates the selector, hides drafts, and scores duplicates and rejected answers', () => {
  const engine=games.get('replica-en');
  let state=engine.start(['a','b','c']);
  function move(id,type,payload={}){
    state=engine.move(state,id,{type,phase:state.phase,round:state.round,...payload});
    assert.ok(state,type);
  }
  move('a','letter',{letter:'A'});
  move('a','answers',{values:{name:'Alice',plant:'Apple',object:'Anvil',animal:'Ant',country:'Austria'}});
  assert.deepEqual(engine.view(state,'b').wordRound.entries,[]);
  assert.deepEqual(engine.view(state,'viewer').wordRound.entries,[]);
  move('b','answers',{values:{name:'alice',plant:'Rose'}});
  move('c','answers',{values:{name:'Alex'}});
  assert.equal(engine.view(state,'viewer').wordRound.entries.length,15);
  move('a','review',{flags:[10]});
  move('b','review',{flags:[10]});
  move('c','review',{flags:[]});
  assert.deepEqual(state.scores,[45,5,0]);
  move('a','next');
  assert.equal(state.turn,1);
  assert.equal(state.round,2);
  assert.equal(engine.move(state,'b',{type:'letter',phase:'choose',round:2,letter:'A'}),null);
});

test('Replica completes all Arabic and English letters, including the final round', () => {
  for(const [id,count,first,last] of [['replica-ar',28,'أ','ي'],['replica-en',26,'A','Z']]){
    const engine=games.get(id);
    let state=engine.start(['a','b']);
    const letters=engine.view(state,'a').wordRound.alphabet;
    assert.equal(new Set(letters).size,count);
    assert.equal(letters[0],first);
    assert.equal(letters.at(-1),last);
    for(let n=0;n<count;n++){
      const actor=state.players[state.turn];
      state=engine.move(state,actor,engine.timeoutMove(state),{automated:true});
      if(n===0) state=engine.move(state,'a',{type:'answers',phase:'write',round:1,values:{name:id.endsWith('ar')?'إبراهيم':'Aria'}});
      state=engine.move(state,actor,engine.timeoutMove(state),{automated:true});
      state=engine.move(state,actor,engine.timeoutMove(state),{automated:true});
      if(!state.finished) state=engine.move(state,actor,engine.timeoutMove(state),{automated:true});
    }
    assert.equal(state.finished,true);
    assert.deepEqual(state.used,letters);
    assert.deepEqual(state.winners,['a']);
  }
});

test('classic card games keep hands private and complete a deal',()=>{
  for(const id of ['eights','hearts','spades']){
    const engine=games.get(id);
    let state=engine.start(['a','b','c','d']);
    assert.deepEqual(engine.view(state,'spectator').hand,[]);
    assert.deepEqual(engine.view(state,'spectator').actions,[]);
    for(let step=0;step<300&&!state.finished;step++){
      const player=state.players[state.turn];
      const [action]=engine.view(state,player).actions;
      assert.ok(action,id);
      state=engine.move(state,player,action.value);
      assert.ok(state,id);
    }
    assert.equal(state.finished,true,id);
  }
});

test('social games hide secrets and reveal a complete drawing relay',()=>{
  const ids=['a','b','c'];
  const circle=games.get('undercover');
  let state=circle.start(ids);
  assert.equal(circle.view(state,'watcher').party.secret,null);
  assert.equal(circle.view(state,ids[state.spy]).party.secret,null);
  for(const id of ids)state=circle.move(state,id,{type:'clue',value:'Interesting'});
  while(state.phase==='vote'&&!state.finished){
    state=circle.move(state,ids[state.turn],{type:'vote',value:ids[state.spy]});
  }
  assert.equal(state.phase,'identify');
  assert.deepEqual(circle.view(state,'watcher').party.options,[]);
  state=circle.move(state,ids[state.spy],{type:'identify',value:state.secret});
  assert.deepEqual(state.winners,[ids[state.spy]]);

  const sketch=games.get('sketch');
  state=sketch.start(ids);
  state=sketch.move(state,'a',{type:'mode',value:'relayWrite'});
  for(const id of ids)state=sketch.move(state,id,{type:'relayWrite',value:'Prompt '+id});
  assert.equal(sketch.view(state,'watcher').party.prompt,null);
  assert.equal(sketch.view(state,'a').party.prompt,'Prompt c');
  assert.deepEqual(sketch.view(state,'a').party.album,[]);
  for(const id of ids)state=sketch.move(state,id,{type:'relayDraw',value:[0,1024,4095]});
  for(const id of ids)state=sketch.move(state,id,{type:'relayGuess',value:'Guess '+id});
  assert.equal(state.finished,true);
  assert.equal(sketch.view(state,'watcher').party.album.length,3);
});

test('OG places stop at 100 and expired subscription badges disappear',()=>{
  const store={state:{players:{}},reports:{confirmed:()=>0}};
  prepareEarlyMembers(store);
  for(let i=0;i<101;i++){
    const id=String(i);
    const player={id,discordId:id};
    store.state.players[id]=player;
    registerEarlyMember(store,player);
  }
  assert.equal(store.state.players['99'].earlyMember,100);
  assert.equal(store.state.players['100'].earlyMember,null);
  const profile={...store.state.players['99'],sahaPlus:{tier:'gold',until:Date.now()-1},points:30};
  assert.deepEqual(profileBadges(store,profile,null,false),[{id:'og',value:100}]);
  assert.deepEqual(profileBadges(store,profile,null,true).at(-1),{id:'wins',value:10});
});

test('profile activity keeps the newest result for each game',()=>{
  const rows=[
    {game:'color',at:1,won:true},{game:'replica-en',at:4},
    {game:'color',at:5,outcome:'loss'},{game:'chess',at:3},{game:'replica-ar',at:2}
  ];
  assert.deepEqual(latestGames(rows),[rows[2],rows[1],rows[3]]);
  assert.equal(rows.length,5);
});
