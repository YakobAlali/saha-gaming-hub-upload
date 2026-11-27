import { randomInt } from 'node:crypto';
import { base, active, option, view, finish, advance } from './core.js';

const sharedSafe = [0,8,13,21,26,34,39,47];
function pawnOptions(state) {
  if (!state.die) return [];
  return state.pawns[state.turn].flatMap((step, index) =>
    (step === -1 ? state.die === 6 : step + state.die <= 57) ? [option(index, 'pawn', [index + 1])] : []);
}
export const ludo = {
  start: players => ({ ...base(players), pawns: players.map(() => [-1,-1,-1,-1]), die: 0, lastDie: 0 }),
  move(state, id, input) {
    if (!active(state, id)) return null;
    if (input === 'roll' && !state.die) {
      state.die = state.lastDie = randomInt(1, 7);
      if (!pawnOptions(state).length) { state.die = 0; advance(state); }
      return state;
    }
    if (!pawnOptions(state).some(entry => entry.value === input)) return null;
    const current = state.pawns[state.turn];
    const die = state.die;
    current[input] = current[input] < 0 ? 0 : current[input] + die;
    state.die = 0;
    const step = current[input];
    if (step < 52) {
      const square = (state.turn * 13 + step) % 52;
      if (!sharedSafe.includes(square)) state.pawns.forEach((pawns, seat) => {
        if (seat !== state.turn) pawns.forEach((position, index) => {
          if (position >= 0 && position < 52 && (seat * 13 + position) % 52 === square) pawns[index] = -1;
        });
      });
    }
    if (current.every(position => position === 57)) return finish(state, [state.turn]);
    if (die !== 6) advance(state);
    return state;
  },
  view(state, id) {
    return view(state, id, { pawns: state.pawns, die: state.lastDie,
      actions: active(state, id) ? state.die ? pawnOptions(state) : [option('roll','roll')] : [] });
  }
};
