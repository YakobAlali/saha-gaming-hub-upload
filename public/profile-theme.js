export const nameStyles=['default','serif','arcade','gradient'];
export const frames=['none','fine','double','glow'];
export const isThemeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function themeVariables(top,bottom){
  return isThemeColor(top)&&isThemeColor(bottom)?'--card-top:'+top+';--card-bottom:'+bottom+';':'';
}
