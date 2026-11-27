const squares = Array.from({length:64},(_,index)=>index);
const row = index => Math.floor(index/8);
const col = index => index%8;
const owner = piece => Math.sign(piece);
const sign = state => state.turn === 0 ? 1 : -1;

function available(state) {
  if (state.finished) return [];
  const captures = [];
  const steps = [];
  const side = sign(state);
  for (const from of state.chain === null ? squares : [state.chain]) {
    const piece = state.board[from];
    if (owner(piece) !== side) continue;
    for (const dr of Math.abs(piece) === 2 ? [-1,1] : [-side]) for (const dc of [-1,1]) {
      const r = row(from)+dr;
      const c = col(from)+dc;
      if (r<0 || r>7 || c<0 || c>7) continue;
      const middle = r*8+c;
      if (!state.board[middle]) { if (state.chain === null) steps.push({from,to:middle}); continue; }
      if (owner(state.board[middle]) !== -side) continue;
      const rr = r+dr;
      const cc = c+dc;
      const to = rr*8+cc;
      if (rr>=0 && rr<8 && cc>=0 && cc<8 && !state.board[to]) captures.push({from,to,capture:middle});
    }
  }
  return captures.length || state.chain !== null ? captures : steps;
}

export const checkers = {
  start(players) {
    const board = squares.map(index => (row(index)+col(index))%2 === 0 ? 0 : row(index)<3 ? -1 : row(index)>4 ? 1 : 0);
    return { players,board,turn:0,chain:null,quiet:0,finished:false,winners:[] };
  },
  move(state,id,input) {
    if (state.finished || state.players[state.turn] !== id) return null;
    const move = available(state).find(({from,to}) => input === from + ':' + to);
    if (!move) return null;
    const side=sign(state);
    const piece=state.board[move.from];
    const promoted=Math.abs(piece)===1 && row(move.to)===(side===1 ? 0 : 7);
    state.board[move.from]=0;
    state.board[move.to]=promoted ? side*2 : piece;
    if (move.capture !== undefined) {
      state.board[move.capture]=0;
      state.chain=move.to;
      if (!promoted && available(state).length) { state.quiet=0; return state; }
    }
    state.quiet=move.capture!==undefined || Math.abs(piece)===1 ? 0 : state.quiet+1;
    state.chain=null;
    state.turn=1-state.turn;
    if (!available(state).length) { state.finished=true; state.winners=[id]; }
    else if (state.quiet>=80) state.finished=true;
    return state;
  },
  view(state,id) {
    const turn=state.players[state.turn];
    const active=!state.finished && turn===id;
    return { turn,active,finished:state.finished,winners:state.winners,cols:8,
      board:state.board.map(piece => Math.abs(piece)===2 ? '♛' : piece ? '●' : ''),
      colors:state.board.map(piece => piece===0 ? null : piece>0 ? 0 : 1),
      legal:active ? available(state).map(({from,to}) => from + ':' + to) : []
    };
  }
};
