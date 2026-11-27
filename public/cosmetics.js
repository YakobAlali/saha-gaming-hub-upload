const animationAssets={
  'butterfly-garden':['butterfly','butterfly'],
  'cherry-crest':['blossom','blossom'],
  'stardust-sweep':['sparkle','star','sparkle'],
  'spring-drift':['blossom','butterfly','blossom']
};

export const cosmetics=[
  {id:'saha-butterfly-garden',type:'decoration',style:'butterfly-garden',price:30,name:{ar:'حديقة الفراشات',en:'Butterfly Garden'}},
  {id:'saha-cherry-crest',type:'decoration',style:'cherry-crest',price:34,name:{ar:'إكليل الكرز',en:'Cherry Crest'}},
  {id:'saha-stardust-sweep',type:'effect',style:'stardust-sweep',price:40,name:{ar:'غبار النجوم',en:'Stardust Sweep'}},
  {id:'saha-spring-drift',type:'effect',style:'spring-drift',price:44,name:{ar:'نسيم الربيع',en:'Spring Drift'}},
  {id:'saha-orbit-crown',type:'decoration',style:'orbit-crown',price:12,name:{ar:'تاج المدار',en:'Orbit Crown'}},
  {id:'saha-ember-ring',type:'decoration',style:'ember-ring',price:18,name:{ar:'طوق الجمر',en:'Ember Ring'}},
  {id:'saha-blue-nebula',type:'effect',style:'blue-nebula',price:21,name:{ar:'السديم الأزرق',en:'Blue Nebula'}},
  {id:'saha-gold-trail',type:'effect',style:'gold-trail',price:24,name:{ar:'أثر الذهب',en:'Gold Trail'}}
];

export function cosmeticLayer(type,style){
  if(!cosmetics.some(item=>item.type===type&&item.style===style))return '';
  const assets=animationAssets[style];
  if(assets){
    return '<span class="cosmetic-layer cosmetic-'+type+' cosmetic-'+style+' cosmetic-illustrated" aria-hidden="true">'+assets.map(asset=>{
      const path='/cosmetics/noto/'+asset;
      return '<picture><source media="(prefers-reduced-motion: reduce)" srcset="'+path+'.svg">'+
        '<img alt="" decoding="async" src="'+path+'.webp"></picture>';
    }).join('')+'</span>';
  }
  return '<span class="cosmetic-layer cosmetic-'+type+' cosmetic-'+style+'" aria-hidden="true">'+
    '<i></i><i></i><i></i><i></i><i></i></span>';
}
