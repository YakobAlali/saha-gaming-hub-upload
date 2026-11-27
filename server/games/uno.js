import { shuffle, base, active, option, view, finish, advance } from './core.js';

const colors = ['red','blue','green','yellow'];
const unoCards = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
const cardLabel = card => option('', 'unoCard', [card[0], card[1]]);
function takeUno(state, seat, count = 1) {
  for (let n = 0; n < count; n++) {
    if (!state.deck.length && state.discard.length > 1) state.deck = shuffle(state.discard.splice(0, state.discard.length - 1));
    if (state.deck.length) state.hands[seat].push(state.deck.pop());
  }
}
function unoOptions(state) {
  const number = state.discard.at(-1)[1];
  return state.hands[state.turn].flatMap((card, index) => {
    if (card[0] === 'wild') {
      if (card[1] === 'draw4' && state.hands[state.turn].some(other => other[0] === state.color)) return [];
      return colors.map(color => option(index + ':' + color, 'unoWild', [color]));
    }
    if (card[0] === state.color || card[1] === number) return [option(index, 'unoCard', card)];
    return [];
  });
}
export const uno = {
  start(players) {
    const deck = shuffle([...colors.flatMap(color => unoCards.flatMap((rank, index) => index ? [[color,rank],[color,rank]] : [[color,rank]])),
      ...Array.from({ length: 4 }, () => ['wild','wild']), ...Array.from({ length: 4 }, () => ['wild','draw4'])]);
    const index = deck.findIndex(card => /^\d$/.test(card[1]));
    const discard = deck.splice(index, 1);
    return { ...base(players), deck, discard, color: discard[0][0], direction: 1, hands: players.map(() => deck.splice(-7)) };
  },
  move(state, id, input) {
    if (!active(state, id)) return null;
    if (input === 'draw') {
      takeUno(state, state.turn);
      advance(state, state.direction);
      return state;
    }
    if (!unoOptions(state).some(entry => entry.value === input)) return null;
    const [index,color] = input.split(':');
    const [card] = state.hands[state.turn].splice(Number(index), 1);
    state.discard.push(card);
    state.color = color ?? card[0];
    if (!state.hands[state.turn].length) {
      if (card[1] === 'draw2' || card[1] === 'draw4') takeUno(state,(state.turn + state.direction + state.players.length) % state.players.length,card[1] === 'draw4' ? 4 : 2);
      return finish(state, [state.turn]);
    }
    if (card[1] === 'reverse') state.direction *= -1;
    if (card[1] === 'reverse' && state.players.length === 2) return state;
    advance(state, state.direction);
    if (card[1] === 'draw2') takeUno(state, state.turn, 2);
    if (card[1] === 'draw4') takeUno(state,state.turn,4);
    if (['skip','draw2','draw4'].includes(card[1])) advance(state, state.direction);
    return state;
  },
  view(state, id) {
    const seat = state.players.indexOf(id);
    return view(state, id, { table: [option('', 'unoCard', [state.color,state.discard.at(-1)[1]])],
      hand: seat < 0 ? [] : state.hands[seat].map(cardLabel), counts: state.hands.map(hand => hand.length),
      actions: active(state, id) ? [...unoOptions(state), option('draw','draw')] : [] });
  }
};
