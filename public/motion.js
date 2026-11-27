import { pawnCell } from './ludo.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = 'cubic-bezier(.2,.75,.35,1)';
function motion(node,frames,duration,delay = 0) {
  node?.animate?.(frames,{ duration,delay,easing:ease,fill:'backwards' });
}

function flyCard(card, origin, duration, delay = 0) {
  if (!card?.animate || !origin) return false;
  const end = card.getBoundingClientRect();
  if (!end.width || !end.height) return false;
  const ghost = document.createElement('div');
  const clone = card.firstElementChild?.cloneNode(true);
  if (!clone) return false;
  ghost.className = 'arena-flight';
  ghost.setAttribute('aria-hidden','true');
  Object.assign(ghost.style,{ left:end.left + 'px', top:end.top + 'px', width:end.width + 'px', height:end.height + 'px' });
  ghost.append(clone);
  document.body.append(ghost);
  const x = origin.left + (origin.width-end.width)/2-end.left;
  const y = origin.top + (origin.height-end.height)/2-end.top;
  const flight = ghost.animate([
    {opacity:0,transform:'translate(' + x + 'px,' + y + 'px) rotate(-22deg) scale(.72)'},
    {opacity:1,offset:.22},
    {opacity:1,transform:'translate(0,0) rotate(0) scale(1)'}
  ],{ duration,delay,easing:ease,fill:'backwards' });
  motion(card,[{opacity:0},{opacity:0,offset:.87},{opacity:1}],duration,delay);
  flight.finished.then(() => ghost.remove(),() => ghost.remove());
  return true;
}

export function animateMatch(panel, match, previous) {
  if (!panel || !match || reduce()) return;
  if (match.wordRound && (match.wordRound.phase!==previous?.wordRound?.phase || match.wordRound.round!==previous?.wordRound?.round)) {
    motion(panel.querySelector('.word-stage'),[{opacity:.65,translate:'0 .5rem'},{opacity:1,translate:'0 0'}],330);
    motion(panel.querySelector('.word-medallion'),[{scale:.76,rotate:'-8deg'},{scale:1,rotate:'0deg'}],440);
    return;
  }
  if (match.matchId !== previous?.matchId) {
    const cards = panel.querySelectorAll('.private-hand .physical-card');
    cards.forEach((card,index) =>
      motion(card,[{ opacity:0, translate:'1.5rem -1.5rem', scale:.8 },{ opacity:1, translate:'0 0', scale:1 }],275,index*34));
    motion(panel.querySelector('.match-stage'),[{ opacity:.6, scale:.99 },{ opacity:1,scale:1 }],240);
    return;
  }
  if (match.revision === previous?.revision) return;
  const effect = match.effect ?? {};
  if (effect.type === 'roll') {
    const die = panel.querySelector('.die-face');
    const cube = die?.querySelector('.die-cube');
    if (cube) {
      const x = parseFloat(cube.style.getPropertyValue('--die-x'));
      const y = parseFloat(cube.style.getPropertyValue('--die-y'));
      const angle = (rx,ry) => 'rotateX(' + (x+rx) + 'deg) rotateY(' + (y+ry) + 'deg)';
      motion(cube,[{transform:angle(-320,-540)},{transform:angle(0,0)}],490);
      motion(die,[{transform:'translateY(0) rotate(-8deg)'},{transform:'translateY(-18px) rotate(9deg)',offset:.36},
        {transform:'translateY(0) rotate(-4deg)',offset:.78},{transform:'translateY(-3px) rotate(0)',offset:.9},
        {transform:'translateY(0) rotate(0)'}],490);
    }
  }
  if (effect.pawn) {
    const {seat,index,from,to} = effect.pawn;
    const pawn = panel.querySelector('[data-pawn="' + seat + '-' + index + '"]');
    const cellRect = position => panel.querySelector('[data-ludo-cell="' + pawnCell(seat,index,position) + '"]').getBoundingClientRect();
    const destination = cellRect(to);
    const offsets = position => {
      const point = cellRect(position);
      return [point.left-destination.left,point.top-destination.top];
    };
    const path = from < 0 ? [from,to] : Array.from({length:to-from+1},(_,step) => from+step);
    const frames = path.flatMap((position,i) => {
      const [x,y] = offsets(position);
      const here = { transform:'translate(' + x + 'px,' + y + 'px)' };
      if (i === path.length-1) return [here];
      const [nx,ny] = offsets(path[i+1]);
      return [here,{ transform:'translate(' + (x+nx)/2 + 'px,' + ((y+ny)/2-destination.height*.3) + 'px) scale(1.12)' }];
    });
    motion(pawn,frames,Math.min(650,105*(path.length-1)));
  }
  if (effect.type === 'capture' && match.pawns) {
    match.pawns.forEach((pawns,seat) => pawns.forEach((step,index) => {
      if (step < 0 && previous.pawns?.[seat]?.[index] >= 0) motion(panel.querySelector('[data-pawn="' + seat + '-' + index + '"]'),
        [{ opacity:.3, scale:.3 },{ opacity:1,scale:1 }],350);
    }));
  }
  function slide(fromSquare,toSquare) {
    const from = panel.querySelector('[data-square="' + fromSquare + '"]');
    const to = panel.querySelector('[data-square="' + toSquare + '"]');
    if (from && to) {
      const start = from.getBoundingClientRect();
      const end = to.getBoundingClientRect();
      motion(to,[{ zIndex:4 },{ zIndex:4 }],235);
      motion(to.querySelector('.board-piece'),[{ transform:'translate(' + (start.x-end.x) + 'px,' + (start.y-end.y) + 'px)' },
        { transform:'translate(0,0)' }],235);
    }
  }
  if (effect.to) { slide(effect.from,effect.to); if (effect.rook) slide(effect.rook.from,effect.rook.to); }
  else if (effect.changed) {
    for (const index of effect.changed) {
      const piece = panel.querySelector('[data-index="' + index + '"] .board-piece');
      const frames = panel.classList.contains('game-connect') ? [{ transform:'translateY(-430%)',opacity:.15 },{ transform:'translateY(0)',opacity:1 }] :
        panel.classList.contains('game-reversi') && previous.colors?.[index] !== null ?
          [{ transform:'rotateY(180deg) scale(.85)' },{ transform:'rotateY(0) scale(1)' }] :
          [{ transform:'scale(.5)',opacity:.35 },{ transform:'scale(1)',opacity:1 }];
      motion(piece,frames,290);
    }
  }
  if (panel.matches('.game-color,.game-tarneeb,.game-domino')) {
    if (match.hand?.length > previous.hand?.length && ['draw','draw2','draw4'].includes(effect.type)) {
      const added = match.hand.length - previous.hand.length;
      const hand = [...panel.querySelectorAll('.private-hand .physical-card')];
      const stock = panel.querySelector('.arena-deck')?.getBoundingClientRect();
      hand.slice(-added).forEach((card,index) => {
        if (!flyCard(card,stock,320,index*34)) motion(card,[{opacity:0,translate:'2rem -4rem',scale:.75},
          {opacity:1,translate:'0 0',scale:1}],305,index*35);
      });
    }
    if (effect.type === 'draw') {
      if (!(match.hand?.length > previous.hand?.length)) motion(panel.querySelector('.seat-playing .seat-cards') ?? panel.querySelector('.arena-deck'),[{ opacity:.55,translate:'0 -.25rem' },{opacity:1,translate:'0 0'}],260);
    } else if (!['pass','bid','trump','resign'].includes(effect.type)) {
      const top = panel.querySelector(effect.side === 'left' ? '.table-hand .physical-card:first-child' : '.table-hand .physical-card:last-child');
      const actor = [...panel.querySelectorAll('.arena-seat')].find(seat => seat.dataset.player === previous.turn);
      if (!flyCard(top,actor?.getBoundingClientRect(),310)) motion(top,[
        { opacity:.4,translate:'1.7rem 3.5rem',rotate:'-13deg',scale:.8 },{ opacity:1,translate:'0 0',rotate:'0deg',scale:1 }
      ],330);
    }
  }
  motion(panel.querySelector('.special-effect'),[{ opacity:.45,scale:.97 },{ opacity:1,scale:1 }],280);
  if (match.finished) motion(panel.querySelector('.match-status'),[{ scale:.82,opacity:.5 },{ scale:1,opacity:1 }],410);
}
