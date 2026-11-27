const scales={tenure:[0,1,2,3,5,8,10],wins:[1,5,10,25,50,100,250],hours:[1,5,20,75,150,500,1000],
  gifter:[1,5,10,25,50,100],hunter:[1,3,5,10,25]};
const metals=['#a7bbc9','#95cfaa','#75dcdb','#8faeff','#baa1ff','#f6a7db','#ffd589'];
const plus=['bronze','silver','gold'];
const stepsFor=id=>scales[id]??(plus.includes(id)?[1,2,3]:[]);

const artIds=['og','owner','tenure','gifter','hunter','bronze','silver','gold','wins','hours','moderator','admin'];
const mark=(id,tone,tier=0)=>{
  const art=id==='helper'?'moderator':id==='shopkeeper'?'gifter':id;
  return '<span class="badge-art badge-art-'+id+' tier-'+tier+'" style="--gem:'+tone+
    '"><img src="/badge-art/'+art+'.png" alt="" draggable="false" decoding="async"></span>';
};

export function badgeStrip(badges,{t,safe,num}){
  if(!badges?.length)return '';
  return '<ul class="saha-badges" aria-label="'+t('sahaBadges')+'">'+badges.map(({id,value})=>{
    if(!artIds.includes(id)&&!['helper','shopkeeper'].includes(id))return '';
    const steps=stepsFor(id);
    const progress=plus.includes(id)?plus.indexOf(id)+1:value;
    const tier=Math.max(0,steps.findLastIndex(n=>n<=progress));
    const next=steps[tier+1];
    const name=t('sahaBadge_'+id);
    const detail=value===undefined?'':id==='tenure'&&value===0?t('sahaBadgeNew'):num(value);
    const summary=name+(detail?' · '+detail:'')+(steps.length?' · '+t('badgeLevel')+' '+num(tier+1):'');
    const progressMarkup=steps.length?'<p>'+safe(next===undefined?t('badgeMax'):t('badgeNext')+' '+num(next))+'</p>'+
      '<progress max="'+(next??steps.at(-1))+'" value="'+progress+'"></progress><ol>'+steps.map((step,i)=>
        '<li class="'+(i<=tier?'earned':'')+'">'+mark(plus.includes(id)?plus[i]:id,metals[i],i)+
        '<span>'+safe(plus.includes(id)?t('sahaBadge_'+plus[i]):num(step))+'</span></li>').join('')+'</ol>':'';
    const icon=mark(id,steps.length?(plus.includes(id)?['#df9b71','#d0e4fb','#ffd589'][tier]:metals[tier]):'var(--badge-rim)',tier);
    return '<li class="saha-badge badge-'+id+'"><button type="button" data-badge-open aria-label="'+safe(summary)+'">'+icon+
      '<span class="badge-hover" aria-hidden="true">'+safe(summary)+'</span></button><template><div class="badge-detail"><header class="badge-showcase">'+icon+'<h3>'+safe(name)+'</h3><p>'+safe(summary)+'</p></header><div class="badge-milestones">'+progressMarkup+'</div>'+'</div></template></li>';
  }).join('')+'</ul>';
}

export function setupBadgeDetails(t){
  const dialog=document.querySelector('#badge-dialog');
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-badge-open]');
    if(button){
      dialog.querySelector('h2').textContent=t('sahaBadges');
      dialog.querySelector('button').textContent=t('close');
      dialog.querySelector('.dialog-content').replaceChildren(button.nextElementSibling.content.cloneNode(true));
      dialog.showModal();
    }
    if(event.target.closest?.('[data-badge-close]'))dialog.close();
  });
}
