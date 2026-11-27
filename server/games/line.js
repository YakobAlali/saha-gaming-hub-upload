import { base, active, view, finish, advance } from './core.js';

export const directions = [[0,1], [1,0], [1,1], [1,-1]];
export function lineGame(rows, cols, target, gravity) {
  const count = rows * cols;
  const start = players => ({ ...base(players), board: Array(count).fill(null) });
  function landing(board, column) {
    if (!Number.isInteger(column) || column < 0 || column >= cols) return -1;
    for (let row = rows - 1; row >= 0; row--) if (board[row * cols + column] === null) return row * cols + column;
    return -1;
  }
  return {
    start,
    move(state, id, input) {
      if (!active(state, id) || typeof input !== 'string' || !/^\d{1,3}$/.test(input)) return null;
      const index = gravity ? landing(state.board, Number(input)) : Number(input);
      if (state.board[index] !== null) return null;
      const seat = state.turn;
      state.board[index] = seat;
      const row = Math.floor(index / cols);
      const col = index % cols;
      for (const [dr, dc] of directions) {
        const line = [index];
        for (const sign of [-1,1]) {
          for (let n = 1; n < target; n++) {
            const r = row + sign * dr * n;
            const c = col + sign * dc * n;
            if (r < 0 || r >= rows || c < 0 || c >= cols || state.board[r * cols + c] !== seat) break;
            line.push(r * cols + c);
          }
        }
        if (line.length >= target) { state.winningLine = line; return finish(state, [seat]); }
      }
      if (state.board.every(cell => cell !== null)) return finish(state);
      advance(state);
      return state;
    },
    view(state, id) {
      return view(state, id, {
        board: state.board.map(seat => seat === null ? '' : seat === 0 ? (gravity || target === 5 ? '●' : '✕') : (gravity || target === 5 ? '●' : '○')),
        colors: state.board, cols, winningLine: state.winningLine ?? [],
        legal: active(state, id) ? state.board.map((cell, index) => cell === null ? String(gravity ? index % cols : index) : '') : []
      });
    }
  };
}
