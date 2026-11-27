const track = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8]];
const safeSquares = new Set([0,8,13,21,26,34,39,47]);
const homes = [[2,2],[2,3],[3,2],[3,3]];
const homeOrigins = [[2,2],[2,11],[11,11],[11,2]];
const dieAngles = [[0,0],[0,-90],[-90,0],[90,0],[0,90],[0,180]];
const pipSlots = [[5],[1,9],[1,5,9],[1,3,7,9],[1,3,5,7,9],[1,3,4,6,7,9]];

function rotate([row,col], count) {
  for (let turn = 0; turn < count; turn++) [row,col] = [col,14-row];
  return row * 15 + col;
}

export function pawnCell(seat,index,position) {
  if (position < 0) return rotate(homes[index],seat);
  if (position >= 52) return position === 57 ? 112 : rotate([7,position-51],seat);
  const global = (seat*13 + position)%52;
  return rotate(track[global%13],Math.floor(global/13));
}

export function ludoBoard(match,room,say) {
  const cells = Array.from({length:225},() => ({ pieces:[], type:'', mark:'' }));
  for (let seat = 0; seat < 4; seat++) {
    track.forEach((square,index) => {
      const cell = cells[rotate(square,seat)];
      const safe = safeSquares.has(seat*13+index);
      cell.type = 'track' + (safe ? ' safe-square ludo-tone-' + seat : '');
      if (safe) cell.mark = '<span class="ludo-star" aria-hidden="true">✦</span>';
    });
    for (let step = 1; step <= 6; step++) cells[rotate([7,step],seat)].type = 'lane ludo-tone-' + seat;
    for (const row of [1,2,3,4]) for (const col of [1,2,3,4]) cells[rotate([row,col],seat)].type = 'home-tile ludo-tone-' + seat;
  }
  cells[112].type = 'finish-cell';
  const actor = room.members.findIndex(member => member.id === match.turn);
  match.pawns.forEach((pawns,seat) => pawns.forEach((position,index) => {
    const attributes = ' class="ludo-piece ludo-tone-' + seat + '" data-pawn="' + seat + '-' + index + '"';
    const legal = match.active && seat === actor && match.actions.some(action => action.label === 'pawn' && action.value === String(index));
    const content = '<span class="pawn-face"><span class="pawn-numeral">' + (index+1) + '</span></span>';
    cells[pawnCell(seat,index,position)].pieces.push(legal ?
      '<button type="button"' + attributes + ' data-action="move" data-move="' + index + '" aria-label="' + say('pawn',index+1) + '">' + content + '</button>' :
      '<span' + attributes + '>' + content + '</span>');
  }));
  const homesMarkup = homeOrigins.map(([row,col],seat) => '<div class="ludo-home ludo-tone-' + seat +
    '" style="--home-row:' + row + ';--home-col:' + col + '" aria-hidden="true"><i class="house-crest"></i></div>').join('');
  return '<div class="ludo-board" role="group" aria-label="' + say('ludoTrack') + '">' + homesMarkup +
    '<div class="ludo-goal" aria-hidden="true"><i class="goal-insignia"></i></div>' + cells.map((cell,index) =>
      '<div data-ludo-cell="' + index + '" class="ludo-cell ' + cell.type + '">' + cell.mark +
      '<div class="pawn-stack">' + cell.pieces.join('') + '</div></div>').join('') + '</div>';
}

export function ludoDie(value, canRoll, say) {
  const [x,y] = dieAngles[(value || 1)-1];
  const faces = pipSlots.map((slots,face) => '<span class="cube-side side-' + (face+1) + '">' +
    slots.map(slot => '<i style="--pip-row:' + Math.ceil(slot/3) + ';--pip-column:' + ((slot-1)%3+1) + '"></i>').join('') + '</span>').join('');
  const cube = '<span class="die-face" aria-hidden="true"><span class="die-cube" style="--die-x:' + x + 'deg;--die-y:' + y + 'deg">' + faces + '</span></span>';
  return '<div class="die-control"><div class="die-display">' + cube +
    (value ? '<span class="die-result">' + say('die',value) + '</span>' : '') + '</div>' +
    (canRoll ? '<button class="button primary game-action ludo-roll" type="button" data-action="move" data-move="roll">' + say('roll') + '</button>' : '') +
    '</div>';
}
