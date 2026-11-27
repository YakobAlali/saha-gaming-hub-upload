import { randomInt } from 'node:crypto';

export function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function base(players) { return { players, turn: 0, finished: false, winners: [] }; }
export function advance(state, step = 1) { state.turn = (state.turn + step + state.players.length) % state.players.length; }
export function finish(state, seats = []) {
  state.finished = true;
  state.winners = seats.map(seat => state.players[seat]);
  return state;
}
export function active(state, id) { return !state.finished && state.players[state.turn] === id; }
export function option(value, label, args = []) { return { value: String(value), label, args }; }
export function view(state, id, extras = {}) {
  return { turn: state.players[state.turn], winners: state.winners, finished: state.finished, active: active(state, id), ...extras };
}
