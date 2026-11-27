const reward=24;
const answer='2993';
const windowMs=10*60*1000;
const maximumTries=5;

export function puzzleStatus(player){
  return {reward,solved:Boolean(player?.shopPuzzle?.solvedAt)};
}

export function solveShopPuzzle(player,input,now=Date.now()){
  const state=player.shopPuzzle??={};
  if(state.solvedAt)return {error:'puzzleAlreadySolved',status:409};
  const guess=typeof input==='string'?input.trim().replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)&15)):'';
  if(!/^\d{4}$/.test(guess))return {error:'puzzleFormat',status:400};
  const recent=(state.tries??[]).filter(time=>time>now-windowMs);
  if(recent.length>=maximumTries)return {error:'puzzleRate',status:429};
  if(guess!==answer){
    state.tries=[...recent,now];
    return {error:'puzzleWrong',status:400,changed:true};
  }
  player.shopPuzzle={solvedAt:now,credit:reward};
  return {changed:true};
}
