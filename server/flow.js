import { randomInt } from 'node:crypto';

export const reactions = ['👏','🔥','😂','😮','❤️','🤝'];
export const timers = [0,15,30,45,60,90];

function choices(game, engine, state, actor) {
  const view = engine.view(state,actor);
  if (view.actions?.length) return view.actions.map(action => action.value);
  return [...new Set(view.legal?.filter(Boolean) ?? [])];
}

export function automaticMove(game, engine, state, actor, timedOut) {
  if (game === 'chess' && engine.autoMove) return engine.autoMove(state);
  const available = choices(game,engine,state,actor);
  if (!available.length) return null;
  if (timedOut && available.includes('draw')) return 'draw';
  if (timedOut && game === 'tarneeb' && available.includes('pass')) return 'pass';
  if (game === 'color') {
    const playable = available.filter(move => move !== 'draw');
    if (!playable.length) return 'draw';
    const hand = state.hands[state.turn];
    const power = move => {
      const [index,color] = move.split(':');
      const [suit,rank] = hand[index];
      const matching = hand.filter(card => card[0] === color).length;
      return suit === 'wild' ? matching - 4 : Math.min(3, Number.isNaN(Number(rank)) ? 3 : 1);
    };
    return playable.reduce((best,move) => power(move) > power(best) ? move : best);
  }
  if (game === 'tarneeb') {
    const hand = state.hands[state.turn];
    if (state.phase === 'bid') {
      const strength = hand.filter(([rank]) => ['A','K','Q'].includes(rank)).length;
      const target = Math.min(13,7 + Math.max(0,strength - 4));
      return Number(available[0]) <= target ? available[0] : 'pass';
    }
    if (state.phase === 'trump') return available.reduce((best,move) =>
      hand.filter(card => card[1] === move).length > hand.filter(card => card[1] === best).length ? move : best);
    const ranks = '23456789TJQKA';
    const lead = state.trick[0]?.card[1];
    const power = ([rank,suit]) => ranks.indexOf(rank === '10' ? 'T' : rank) + (suit === state.trump ? 40 : suit === lead ? 20 : 0);
    const ordered = [...available].sort((a,b) => power(hand[a]) - power(hand[b]));
    const strongest = state.trick.reduce((best,move) => !best || power(move.card) > power(best.card) ? move : best,null);
    if (!strongest || strongest.seat % 2 === state.turn % 2) return ordered[0];
    return ordered.find(move => power(hand[move]) > power(strongest.card) && [lead,state.trump].includes(hand[move][1])) ?? ordered[0];
  }
  if (game === 'ludo') {
    if (available.includes('roll')) return 'roll';
    const pawns = state.pawns[state.turn];
    return available.reduce((best,move) => (pawns[move] + state.die === 57 ? 100 : pawns[move]) >
      (pawns[best] + state.die === 57 ? 100 : pawns[best]) ? move : best);
  }
  if (game === 'domino') {
    if (available[0] === 'draw' || available[0] === 'pass') return available[0];
    const pips = move => state.hands[state.turn][Number(move.split(':')[0])].reduce((a,b) => a+b);
    return available.reduce((best,move) => pips(move) > pips(best) ? move : best);
  }
  let best = available[0];
  let score = -Infinity;
  for (const move of available) {
    const next = engine.move(structuredClone(state),actor,move);
    if (!next) continue;
    if (next.finished && next.winners.includes(actor)) return move;
    let value = randomInt(100) / 100;
    if (game === 'tic' || game === 'connect' || game === 'gomoku') {
      const rival = next.players[next.turn];
      if (!next.finished && (game !== 'gomoku' || state.board.filter(cell => cell !== null).length >= 8) && choices(game,engine,next,rival).some(reply => {
        const answer = engine.move(structuredClone(next),rival,reply);
        return answer?.finished && answer.winners.includes(rival);
      })) value -= 100;
      if (move === (game === 'tic' ? '4' : game === 'gomoku' ? '60' : '3')) value += 2;
    }
    if (game === 'checkers') {
      value += next.board.filter(cell => Math.sign(cell) === (state.turn === 0 ? 1 : -1)).reduce((sum,cell) => sum + Math.abs(cell),0);
    }
    if (game === 'reversi') {
      value += next.board.filter(cell => cell === state.turn).length / 10;
      if (['0','7','56','63'].includes(move)) value += 10;
    }
    if (value > score) { score = value; best = move; }
  }
  return best;
}
