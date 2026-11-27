export function boardMarkup(room,match,selected,say,safe) {
  const chess = room.game === 'chess';
  const draughts = room.game === 'checkers';
  const changed = match.effect?.changed ?? [];
  return '<div class="match-board board-' + room.game + '" style="--columns:' + match.cols + '" dir="ltr">' +
    match.board.map((value,index) => {
      const column = index % match.cols;
      const row = Math.floor(index / match.cols);
      const square = chess ? 'abcdefgh'[column] + (8-row) : room.game === 'connect' ? String(column) : String(index);
      const origin = draughts ? match.legal.some(move => move.startsWith(square + ':')) : chess && match.legal.some(move => move.startsWith(square));
      const target = draughts ? selected !== undefined && match.legal.includes(selected + ':' + square) : chess && selected && match.legal.some(move => move.startsWith(selected + square));
      const enabled = match.active && (chess || draughts ? origin || target : room.game === 'connect' ? match.legal.includes(square) : match.legal[index] === square);
      const color = match.colors?.[index];
      const label = chess ? square : say('square',room.game === 'connect' ? column+1 : index+1);
      const lastMove = changed.includes(index) || chess && [match.effect?.from,match.effect?.to].includes(square);
      const kingCheck = chess && match.check && value === (match.history.length%2 === 0 ? '♔' : '♚');
      return '<button type="button" class="board-square ' + ((column+row)%2 ? 'dark-square ':'') + (lastMove ? 'last-square ':'') + (enabled && !value ? 'available-square ' : '') +
        (match.winningLine?.includes(index) ? 'winning-square ':'') + (kingCheck ? 'checked-square ':'') + (selected === square ? 'selected-square ':'') + (target ? 'target-square ':'') +
        (color === 0 || color === 1 ? 'piece-' + color : '') + '" data-index="' + index + '" data-action="square" data-square="' + square +
        '" aria-label="' + safe(label + (value ? ' ' + value : '')) + '"' + (enabled ? '' : ' disabled') + '>' +
        (value ? '<span class="board-piece ' + (chess ? ('♙♘♗♖♕♔'.includes(value) ? 'white-piece' : 'black-piece') : '') + '">' + safe(value) + '</span>' : '') +
        (chess && column === 0 ? '<small class="rank-coordinate">' + (8-row) + '</small>' : '') +
        (chess && row === 7 ? '<small class="file-coordinate">' + 'abcdefgh'[column] + '</small>' : '') + '</button>';
    }).join('') + '</div>';
}

