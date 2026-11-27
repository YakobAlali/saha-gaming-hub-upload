import { shuffle, base, active, option, view, finish, advance } from './core.js';

function dominoOptions(state) {
  const chain = state.chain;
  return state.hands[state.turn].flatMap((tile, index) => {
    const value = tile.join('–');
    if (!chain.length) return [option(index + ':r', 'tile', [value])];
    const choices = [];
    if (tile.includes(chain[0][0])) choices.push(option(index + ':l','tileLeft',[value]));
    if (tile.includes(chain.at(-1)[1])) choices.push(option(index + ':r','tileRight',[value]));
    return choices;
  });
}
export const domino = {
  start(players) {
    const pile = shuffle(Array.from({ length: 7 }, (_, a) => Array.from({ length: 7-a }, (_, b) => [a,a+b])).flat());
    return { ...base(players), hands: players.map(() => pile.splice(0, players.length === 4 ? 7 : 5)), pile, chain: [], passes: 0 };
  },
  move(state, id, input) {
    if (!active(state, id)) return null;
    const available = dominoOptions(state);
    if (!available.length && input === 'draw' && state.pile.length) {
      state.hands[state.turn].push(state.pile.pop());
      return state;
    }
    if (!available.length && input === 'pass' && !state.pile.length) {
      if (++state.passes === state.players.length) {
        const scores = state.hands.map(hand => hand.flat().reduce((sum, pip) => sum + pip, 0));
        const best = Math.min(...scores);
        const winners = scores.flatMap((score, seat) => score === best ? [seat] : []);
        return finish(state, winners.length === 1 ? winners : []);
      }
      advance(state);
      return state;
    }
    if (!available.some(entry => entry.value === input)) return null;
    const [index,side] = input.split(':');
    const [tile] = state.hands[state.turn].splice(Number(index), 1);
    if (side === 'l') {
      if (tile[1] !== state.chain[0][0]) tile.reverse();
      state.chain.unshift(tile);
    } else {
      if (state.chain.length && tile[0] !== state.chain.at(-1)[1]) tile.reverse();
      state.chain.push(tile);
    }
    if (!state.hands[state.turn].length) return finish(state, [state.turn]);
    state.passes = 0;
    advance(state);
    return state;
  },
  view(state, id) {
    const seat = state.players.indexOf(id);
    const tile = entry => option('', 'tile', [entry.join('–')]);
    const choices = active(state, id) ? dominoOptions(state) : [];
    return view(state, id, { table: state.chain.map(tile), hand: seat < 0 ? [] : state.hands[seat].map(tile), counts: state.hands.map(hand => hand.length),
      actions: active(state, id) ? choices.length ? choices : [option(state.pile.length ? 'draw' : 'pass', state.pile.length ? 'draw' : 'pass')] : [] });
  }
};
