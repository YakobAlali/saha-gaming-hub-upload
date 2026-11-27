import { directions } from './line.js';
import { base, active, view, finish, advance } from './core.js';

const reversiDirs = [...directions, ...directions.map(([r,c]) => [-r,-c])];
function flips(board, index, seat) {
  if (board[index] !== null) return [];
  const row = Math.floor(index / 8);
  const col = index % 8;
  const result = [];
  for (const [dr,dc] of reversiDirs) {
    const line = [];
    for (let n = 1; n < 8; n++) {
      const r = row + dr * n;
      const c = col + dc * n;
      if (r < 0 || r >= 8 || c < 0 || c >= 8) break;
      const next = r * 8 + c;
      if (board[next] === null) break;
      if (board[next] === seat) { result.push(...line); break; }
      line.push(next);
    }
  }
  return result;
}
export const reversi = {
  start(players) {
    const state = { ...base(players), board: Array(64).fill(null) };
    state.board[27] = state.board[36] = 1;
    state.board[28] = state.board[35] = 0;
    return state;
  },
  move(state, id, input) {
    if (!active(state, id) || typeof input !== 'string' || !/^\d{1,2}$/.test(input)) return null;
    const index = Number(input);
    const changes = flips(state.board, index, state.turn);
    if (!changes.length) return null;
    for (const square of [index, ...changes]) state.board[square] = state.turn;
    advance(state);
    if (state.board.some((_, square) => flips(state.board, square, state.turn).length)) return state;
    advance(state);
    if (state.board.some((_, square) => flips(state.board, square, state.turn).length)) return state;
    const [one,two] = [0,1].map(seat => state.board.filter(cell => cell === seat).length);
    return finish(state, one === two ? [] : [one > two ? 0 : 1]);
  },
  view(state, id) {
    return view(state, id, { board: state.board.map(cell => cell === null ? '' : '●'), colors: state.board, cols: 8,
      legal: active(state, id) ? state.board.map((_, index) => flips(state.board, index, state.turn).length ? String(index) : '') : [] });
  }
};
