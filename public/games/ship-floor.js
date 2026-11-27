export const center=i=>({x:105+(i%3)*190,y:80+Math.floor(i/3)*140});
export function roomAt(x,y){
  for(let i=0;i<9;i++){
    const c=center(i);
    if(Math.abs(x-c.x)<=64&&Math.abs(y-c.y)<=43)return i;
  }
  return -1;
}
export function floorAt(x,y){
  if(roomAt(x,y)>=0)return true;
  for(let i=0;i<9;i++){
    const c=center(i);
    if(i%3<2&&x>=c.x&&x<=c.x+190&&Math.abs(y-c.y)<=12)return true;
    if(i<6&&y>=c.y&&y<=c.y+140&&Math.abs(x-c.x)<=12)return true;
  }
  return false;
}
