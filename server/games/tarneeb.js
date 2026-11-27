import { shuffle, base, active, option, view, finish, advance } from './core.js';

const suits = ['♠','♥','♦','♣'];
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const tarneebCard = card => card.join('');
function bidOptions(state) {
  if (state.passed.includes(state.turn)) return [];
  return [...Array.from({ length: 13-state.bid }, (_, i) => option(state.bid+i+1,'bid',[state.bid+i+1])), option('pass','pass')];
}
function tarneebOptions(state) {
  if (state.phase === 'bid') return bidOptions(state);
  if (state.phase === 'trump') return suits.map(suit => option(suit,'trump',[suit]));
  const hand = state.hands[state.turn];
  const lead = state.trick[0]?.card[1];
  const mustFollow = hand.some(card => card[1] === lead);
  return hand.flatMap((card,index) => !mustFollow || card[1] === lead ? [option(index,'card',[tarneebCard(card)])] : []);
}
export const tarneeb = {
  start(players) {
    const deck = shuffle(suits.flatMap(suit => ranks.map(rank => [rank,suit])));
    return { ...base(players), hands: players.map(() => deck.splice(0,13)), phase:'bid', bid:6, bidder:null, passed:[], trump:null, trick:[], lastTrick:[], scores:[0,0] };
  },
  move(state, id, input) {
    if (!active(state,id) || !tarneebOptions(state).some(entry => entry.value === input)) return null;
    if (state.phase === 'bid') {
      if (input === 'pass') state.passed.push(state.turn);
      else { state.bid = Number(input); state.bidder = state.turn; }
      if (state.bid === 13 || (state.bidder !== null && state.passed.length === 3) || state.passed.length === 4) {
        if (state.bidder === null) Object.assign(state, { bid:7, bidder:0 });
        state.turn = state.bidder;
        state.phase = 'trump';
        return state;
      }
      do { advance(state); } while (state.passed.includes(state.turn) || state.turn === state.bidder);
      return state;
    }
    if (state.phase === 'trump') {
      state.trump = input;
      state.phase = 'play';
      return state;
    }
    const [card] = state.hands[state.turn].splice(Number(input),1);
    state.trick.push({ card, seat:state.turn });
    if (state.trick.length < 4) { advance(state); return state; }
    const lead = state.trick[0].card[1];
    const power = ([rank,suit]) => ranks.indexOf(rank) + (suit === state.trump ? 40 : suit === lead ? 20 : 0);
    const winner = state.trick.reduce((best, move) => power(move.card) > power(best.card) ? move : best);
    state.turn = winner.seat;
    state.scores[winner.seat % 2]++;
    state.lastTrick = state.trick;
    state.trick = [];
    if (state.scores[0] + state.scores[1] === 13) {
      const biddingTeam = state.bidder % 2;
      const winnerTeam = state.scores[biddingTeam] >= state.bid ? biddingTeam : 1-biddingTeam;
      return finish(state,[winnerTeam,winnerTeam+2]);
    }
    return state;
  },
  view(state,id) {
    const seat = state.players.indexOf(id);
    const card = entry => option('', 'card', [tarneebCard(entry)]);
    return view(state,id,{
      table:(state.trick.length ? state.trick : state.lastTrick).map(move => option('', 'trickCard', [move.seat+1,tarneebCard(move.card)])),
      hand:seat < 0 ? [] : state.hands[seat].map(card), counts:state.hands.map(hand => hand.length),
      actions:active(state,id) ? tarneebOptions(state) : [],
      tarneeb:{ bid:state.bidder === null ? null : state.bid, trump:state.trump, scores:state.scores, phase:state.phase }
    });
  }
};
