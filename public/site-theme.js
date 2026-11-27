export const siteThemes=['system','light','dark'];
export const siteAccents=['#aabcff','#71d8bd','#caa9fa','#efad82'];
export const validAccent=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function applySiteTheme(root,theme,accent,systemLight){
  root.dataset.theme=theme==='light'||theme==='system'&&systemLight?'light':'dark';
  root.style.setProperty('--site-accent',validAccent(accent)?accent:siteAccents[0]);
}
