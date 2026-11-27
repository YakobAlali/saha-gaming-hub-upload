const coverOrder=[
  'chess','color','ludo','tarneeb','connect','domino','tic','reversi',
  'gomoku','checkers','replica-ar','undercover','sketch','eights','hearts','spades'
];

export function gameCover(id){
  if(id==='orbit')return '<span class="game-cover orbit-cover" aria-hidden="true"><img src="/among-us-cover.jpg" alt="" loading="lazy"></span>';
  const cover=id==='replica-en'?'replica-ar':id;
  if(!coverOrder.includes(cover))return '';
  return '<span class="game-cover game-photo" aria-hidden="true" style="background-image:url(/cover-'+cover+'.webp);background-size:cover;background-position:center"></span>';
}
