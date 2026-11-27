const gameKey=id=>id==='replica-en'?'replica-ar':id;

export function latestGames(rows=[]){
  const latest=new Map();
  for(const row of rows){
    const key=gameKey(row.game);
    if(!latest.has(key)||row.at>latest.get(key).at)latest.set(key,row);
  }
  return [...latest.values()].sort((a,b)=>b.at-a.at).slice(0,30);
}
