const marks = ['◆','✦','⬢','●'];

export function arenaSeats(room,viewerId,name,say,safe) {
  const { match, members } = room;
  const ownSeat = members.findIndex(member => member.id === viewerId);
  const origin = Math.max(0,ownSeat);
  return members.map((_,slot) => {
    const index = (origin + slot) % members.length;
    const member = members[index];
    const active = !match.finished && member.id === match.turn;
    const bot = member.bot || member.controlledByBot;
    const label = active ? say('activeSeat') : bot ? say('bot') : member.id === viewerId ? say('you') : !member.online ? say('offline') : '';
    const count = match.counts?.[index];
    return '<div class="arena-seat seat-slot-' + slot + (active ? ' seat-playing' : '') + '" data-seat="' + index + '" data-player="' + safe(member.id) + '">' +
      '<span class="seat-avatar seat-tone-' + index + '" aria-hidden="true">' + (bot ? 'AI' : safe([...member.name.trim()][0] || marks[index])) + '</span>' +
      '<span class="seat-text"><bdi>' + safe(name(member.id)) + '</bdi>' + (label ? '<small>' + label + '</small>' : '') + '</span>' +
      (Number.isInteger(count) ? '<span class="seat-cards" aria-label="' + say('cardCount',count) + '"><i aria-hidden="true"></i><b>' + count + '</b></span>' : '') +
      '</div>';
  }).join('');
}

export function drawStack(say, enabled) {
  const label = say('drawPile');
  const deck = '<span class="arena-deck" aria-hidden="true"><i></i><i></i><i></i><b>✦</b></span>';
  return '<div class="draw-stack">' + (enabled ?
    '<button class="draw-control" type="button" data-action="move" data-move="draw" aria-label="' + say('draw') + '">' +
    deck + '<span class="pile-label">' + say('draw') + '</span></button>' :
    '<div class="draw-static" role="img" aria-label="' + label + '">' + deck + '<span class="pile-label">' + label + '</span></div>') + '</div>';
}

export function renderArena(room,viewerId,name,say,safe,center,activeColor) {
  const layout = ['color','tarneeb','domino'].includes(room.game) ? 'arena-table' : 'arena-board';
  return '<div class="match-stage arena-stage ' + layout + ' seats-' + room.members.length +
    (activeColor ? ' arena-' + activeColor : '') + '"><div class="arena-surface" aria-hidden="true"></div>' +
    arenaSeats(room,viewerId,name,say,safe) + '<div class="arena-center">' + center + '</div></div>';
}
