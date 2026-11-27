import {randomInt} from 'node:crypto';
import { Chess } from 'chess.js';
import { base, active, view, finish, advance } from './core.js';

function chessPosition(state) {
  const chess = new Chess();
  for (const move of state.moves) chess.move(move);
  return chess;
}
export const chess = {
  start: players => ({ ...base(players), moves: [] }),
  move(state, id, input) {
    if (!active(state, id) || typeof input !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(input)) return null;
    const position = chessPosition(state);
    try { position.move(input); } catch { return null; }
    state.moves.push(input);
    if (position.isCheckmate()) return finish(state, [state.turn]);
    if (position.isDraw()) return finish(state);
    advance(state);
    return state;
  },
  autoMove(state) {
    const position = chessPosition(state);
    const value = { p:1, n:3, b:3, r:5, q:9, k:20 };
    const moves = position.moves({ verbose:true });
    let best;
    let high = -Infinity;
    for (const move of moves) {
      const input = move.from + move.to + (move.promotion ?? '');
      if (move.san.endsWith('#')) return input;
      position.move(input);
      const replies = position.moves({ verbose:true });
      position.undo();
      const dangerous = replies.some(reply => reply.san.endsWith('#'));
      const recapture = replies.some(reply => reply.to === move.to && reply.captured);
      const score = (value[move.captured] ?? 0) * 2 + (value[move.promotion] ?? 0) +
        (move.san.endsWith('+') ? 0.45 : 0) + (['d4','e4','d5','e5'].includes(move.to) ? 0.5 : 0) -
        (recapture ? value[move.piece] : 0) - (dangerous ? 100 : 0) + randomInt(100) / 500;
      if (score > high) { high = score; best = input; }
    }
    return best ?? null;
  },
  view(state, id) {
    const position = chessPosition(state);
    const symbols = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', P:'♙', N:'♘', B:'♗', R:'♖', Q:'♕', K:'♔' };
    return view(state, id, {
      board: position.board().flat().map(piece => piece ? symbols[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] : ''),
      cols: 8, check: position.isCheck(), history: position.history(),
      legal: active(state, id) ? position.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion ?? '')) : []
    });
  }
};
