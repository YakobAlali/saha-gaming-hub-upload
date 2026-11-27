const fields=['name','plant','object','animal','country'];
const icons={name:'◉',plant:'✿',object:'◆',animal:'♞',country:'⚑'};

export function renderReplica(room,{t,safe,viewerId}){
  const {match}=room;
  const word=match.wordRound;
  const labels={choose:'wordChoose',write:'wordWrite',review:'wordReview',result:'wordResult',finished:'wordFinal'};
  const name=id=>room.members.find(member=>member.id===id)?.name ?? '';
  const number=value=>new Intl.NumberFormat(documentLanguage(t)).format(value);
  const text=(key,value)=>safe(t(key).replace('{0}',value));
  const mark=field=>'<i aria-hidden="true">'+icons[field]+'</i>';
  const formatName=id=>'<bdi>'+safe(name(id))+'</bdi>';
  const out=match.finished ? match.abandoned ? t('abandoned') : match.winners.length ? text('win',name(match.winners[0])) : t('drawResult') : '';
  const phase=match.finished?'finished':word.phase;
  const timer=match.deadline && !match.finished ? '<div class="turn-clock" data-deadline="'+match.deadline+'" data-duration="'+(match.phaseDuration||1)+'"><span class="clock-label">'+t('timeLeft')+
    '</span><strong class="clock-value" role="timer"></strong><div class="clock-track"><span></span></div></div>' : '';
  const leaderboard='<ol class="word-scores">'+room.members.map((member,seat)=>'<li'+(member.id===match.turn&&!match.finished?' class="word-lead"':'')+'><span class="avatar" aria-hidden="true">'+
    safe([...member.name][0]??'•')+'</span><div>'+formatName(member.id)+
    (['write','review'].includes(phase)&&word.submitted[seat]?'<small>'+t('wordSent')+'</small>':'')+
    '</div><strong>'+number(word.scores[seat]??0)+'</strong></li>').join('')+'</ol>';
  const status=phase==='choose' || phase==='result' ? (match.active?t('yourTurn'):text('turnOf',name(match.turn))) :
    room.role==='spectator'?t('spectating'):match.active?t(labels[phase]):t('wordWaiting');
  const opts='<div class="word-progress" role="group" aria-label="'+t('wordLetters')+'" lang="'+word.language+'" dir="'+(word.language==='ar'?'rtl':'ltr')+'">'+
    word.alphabet.map(letter=>{
      const used=word.used.includes(letter);
      return phase==='choose'&&match.active&&!used ? '<button type="button" class="word-letter" data-action="wordLetter" data-letter="'+safe(letter)+'">'+safe(letter)+'</button>' :
        '<span class="word-letter'+(used?' word-used':'')+(letter===word.letter?' word-current':'')+'">'+safe(letter)+'</span>';
    }).join('')+'</div>';
  const formKey=safe(match.matchId+':'+word.round+':'+phase);
  const write=match.active ? '<form class="word-form" data-word="answers" data-word-key="'+formKey+'">'+fields.map(field=>
    '<label><span>'+mark(field)+t('word_'+field)+'</span><input name="'+field+'" maxlength="50" lang="'+word.language+'" dir="'+(word.language==='ar'?'rtl':'ltr')+
    '" autocomplete="off" autocapitalize="words" spellcheck="false"></label>').join('')+'<button type="submit" class="button primary">'+t('wordSubmit')+'</button></form>' :
    '<p class="word-wait">'+t(room.role==='spectator'?'wordHidden':'wordLocked')+'</p>';
  const tab='<div class="word-review">'+room.members.map((member,seat)=>{
    const entries=word.entries.filter(row=>row.seat===seat);
    return '<article class="word-answer-card"><h3>'+formatName(member.id)+'</h3><dl>'+entries.map(entry=>{
      const code=entry.seat*5+entry.column;
      const vote=phase==='review'&&match.active&&member.id!==viewerId&&entry.valid;
      return '<div><dt>'+mark(entry.field)+t('word_'+entry.field)+'</dt><dd><bdi>'+safe(entry.value||'—')+'</bdi>'+
        (typeof entry.score==='number'?'<strong class="word-earned">'+number(entry.score)+'</strong>':
          (vote?'<label class="word-flag"><input type="checkbox" name="flag" value="'+code+'"> '+t('wordFlag')+'</label>':
          !entry.valid&&entry.value?'<span class="word-invalid">'+t('wordInvalid')+'</span>':''))+'</dd></div>';
    }).join('')+'</dl></article>';
  }).join('')+'</div>';
  const board=phase==='choose'?opts:phase==='write'?'<p class="word-directions">'+t('wordWriteHelp')+'</p>'+write:
    phase==='review'?'<p class="word-directions">'+t('wordReviewHelp')+'</p>'+
      (match.active?'<form data-word="review" data-word-key="'+formKey+'">'+tab+'<button class="button primary" type="submit">'+t('wordVote')+'</button></form>':tab):
    tab+(phase==='result'&&match.active?'<button type="button" class="button primary" data-action="wordNext">'+t('wordNext')+'</button>':'');
  const hostActions=match.finished&&room.host===viewerId ? '<div class="match-actions"><button class="button primary" data-action="rematch">'+t('rematch')+
    '</button><button class="button secondary" data-action="changeGame">'+t('changeGame')+'</button></div>' : '';
  return '<section class="panel match-panel replica-panel"><header class="panel-heading word-header"><div><p class="match-kicker">'+safe(t(room.game)[1])+'</p><h2>'+
    safe(t(room.game)[0])+'</h2></div><span class="pill" dir="ltr">'+number(word.round)+' / '+number(word.alphabet.length)+'</span></header>'+
    '<nav class="word-steps" aria-label="'+t('wordPhases')+'">'+['choose','write','review','result'].map(step=>'<span'+
      (step===phase||step==='result'&&phase==='finished'?' aria-current="step"':'')+'>'+t(labels[step])+'</span>').join('')+'</nav>'+
    '<div class="word-stage match-stage"><div class="word-medallion" aria-hidden="true"><b>'+safe(word.letter??(word.language==='ar'?'أ':'A'))+'</b></div>'+
    '<p class="word-status" aria-live="polite">'+(match.finished?out:status)+'</p>'+timer+board+'</div>'+leaderboard+hostActions+'</section>';
}

function documentLanguage(t){
  return t('language')==='English'?'ar':'en';
}
