export function matchClock(match,t){
  if(match.finished||!match.deadline)return '';
  return '<div class="turn-clock" data-deadline="'+match.deadline+'" data-duration="'+match.phaseDuration+
    '"><span class="clock-label">'+t('timeLeft')+'</span><strong class="clock-value" role="timer"></strong>'+
    '<div class="clock-track"><span></span></div></div>';
}

export function resultActions(room,viewerId,t){
  if(!room.match.finished||room.host!==viewerId)return '';
  return '<div class="match-actions"><button class="button primary" type="button" data-action="rematch">'+t('rematch')+
    '</button><button class="button secondary" type="button" data-action="changeGame">'+t('changeGame')+'</button></div>';
}
