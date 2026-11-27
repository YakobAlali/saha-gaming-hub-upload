const sections=[
  ['home','layout-grid'],['games','gamepad-2'],['rooms','users-round'],
  ['friends','users-round'],['shop','shopping-bag'],['rankings','trophy']
];
const routes=new Set([...sections.map(([page])=>page),'room','account','reports','admin','settings']);
export function route(hash=location.hash){
  if(hash.startsWith('#settings/'))return 'settings';
  if(hash.startsWith('#profile/'))return 'account';
  const page=hash.slice(1);
  return routes.has(page)?page:'home';
}
export function createNavigation(nav){
  nav.innerHTML=sections.map(([page,icon])=>'<a href="#'+page+'" data-nav="'+page+'"><i data-icon="'+icon+
    '" aria-hidden="true"></i><span data-t="'+page+'"></span></a>').join('');
}
export function currentNavigation(nav,page){
  const current=page==='room'?'rooms':page;
  for(const link of nav.querySelectorAll('[data-nav]')){
    const active=link.dataset.nav===current;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
}
