export const plusTiers=['bronze','silver','gold'];
const day=86400000;

export function prepareEarlyMembers(store){
  return store.state.earlyMembers??=Object.values(store.state.players)
    .filter(entry=>entry.discordId)
    .sort((a,b)=>(a.siteJoinedAt??a.joinedAt??0)-(b.siteJoinedAt??b.joinedAt??0)).slice(0,100).map(entry=>entry.id);
}
export function registerEarlyMember(store,player){
  if(Object.hasOwn(player,'earlyMember'))return;
  const list=prepareEarlyMembers(store);
  if(!list.includes(player.id)&&list.length<100)list.push(player.id);
  player.earlyMember=list.includes(player.id)?list.indexOf(player.id)+1:null;
}

export function profileBadges(store,player,ownerId,showStats){
  const badges=[];
  const position=player.earlyMember??(store.state.earlyMembers?.indexOf(player.id)+1||0);
  const add=(id,value)=>badges.push({id,value});
  if(ownerId&&player.discordId===ownerId)add('owner');
  if(position)add('og',position);
  const plus=player.sahaPlus;
  if(plus?.until>Date.now()&&plusTiers.includes(plus.tier))add(plus.tier);
  const age=player.siteJoinedAt?Math.max(0,Math.floor((Date.now()-player.siteJoinedAt)/(365.2425*day))):null;
  if(age!==null)add('tenure',age);
  if((player.giftsGiven??0)>0)add('gifter',player.giftsGiven);
  const confirmed=store.reports.confirmed(player.id);
  if(confirmed>0)add('hunter',confirmed);
  if(showStats){
    const wins=Math.floor((player.points??0)/3);
    const hours=Math.floor((player.playedMs??0)/3600000);
    if(wins>0)add('wins',wins);
    if(hours>0)add('hours',hours);
  }
  return badges;
}
