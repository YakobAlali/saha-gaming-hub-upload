export const uploadedPath=value=>typeof value==='string'&&/^\/auth\/discord\/profile-image\/[0-9a-f-]{36}\/(avatar|banner)\/[0-9a-f-]{36}$/i.test(value)?value:'';
export const cdn=url=>typeof url==='string'&&/^https:\/\/cdn\.discordapp\.com\/(avatars|banners)\/\d+\/(a_)?[a-f0-9]{32}\.webp$/.test(url)?url:'';
export function avatarImage(value,safe){
  if(!uploadedPath(value)&&!cdn(value))return '';
  return '<img alt="" src="'+safe(value)+'" referrerpolicy="no-referrer">';
}
