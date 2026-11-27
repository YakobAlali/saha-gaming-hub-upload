import {center} from './ship-floor.js';
const colors=['#e34548','#5792ff','#8ad361','#ffab48','#d174e0','#44cfc4','#ef77a0','#d5bc50','#9582ff','#dee6ed','#9a6956','#377449','#fc8858','#4c7a99','#b34a88'];
const equipment=[
 '<rect x="-38" y="-23" width="17" height="35" rx="5" fill="#805ba5"/><path d="M-34 -18v24m7-24v24" stroke="#dba1ff"/>',
 '<path d="M-44 7h26v9h-26z" fill="#b5d1d5"/><circle cx="-31" cy="4" r="7" fill="#78bade"/>',
 '<path d="M-42 -17q12 25 25 0z" fill="#babed6"/><path d="M-30 -5v13" stroke="#b9c2de"/>',
 '<path d="M-42 -16h22v20h-22zM-38 8h18v12h-18z" fill="#a67d54" stroke="#634d3b"/>',
 '<ellipse cx="-30" cy="0" rx="18" ry="11" fill="#467b9e" stroke="#162941"/><circle cx="-30" cy="-2" r="4" fill="#f45147"/>',
 '<rect x="-46" y="-12" width="28" height="16" rx="3" fill="#bcd8df"/><path d="M-40 -9v10" stroke="#5eb9a9" stroke-width="5"/>',
 '<path d="M-45 6v-21h29V6z" fill="#29394e"/><path d="M-42 -11h23v10h-23z" fill="#67cbd5"/>',
 '<path d="M-45 -10h27m-27 7h27m-27 7h27" stroke="#a19f93" stroke-width="4"/>',
 '<rect x="-45" y="-17" width="25" height="26" rx="3" fill="#576577"/><path d="m-30 -13-6 12h7l-4 8 10-14h-7z" fill="#ffce56"/>'
];
export function shipScene(room,v,viewer,labels,lang,safe){
 const walls=labels.map((label,i)=>{
   const {x,y}=center(i);
   return '<g transform="translate('+x+' '+y+')"><path d="M-72 -35l11-13h119l15 13v69l-12 14H-60l-12-13z" fill="#536173" stroke="#171c29" stroke-width="5"/><rect x="-64" y="-41" width="128" height="82" rx="9" fill="url(#shiptiles)"/>'+equipment[i]+'<text y="34">'+label[lang]+'</text>'+(v.tasks.some(t=>t.room===i)?'<text x="48" y="-17" fill="#ffcf48">!</text>':'')+'</g>';
 }).join('');
 const actors=v.actors.map((p,i)=>{
   const seat=room.members.findIndex(m=>m.id===p.id),nick=room.members[seat]?.name??'';
   return '<g transform="translate('+p.x+' '+p.y+')"><g transform="translate('+((seat%3)-1)*4+' '+(seat%2)*3+')"><ellipse cy="10" rx="11" ry="3" fill="#151820"/><g fill="'+colors[Math.max(0,seat)%colors.length]+'" stroke="#141923" stroke-width="1.8"><rect x="-11" y="-4" width="6" height="12" rx="2"/><path d="M-7 7v-12q0-9 8-9t8 9V9q0 3-4 3t-4-3H0q0 3-4 3t-3-5z"/><rect x="0" y="-10" width="11" height="6" rx="3" fill="#a8e7f2"/></g><title>'+safe(nick)+'</title>'+(p.id===viewer?'<path d="m-4 -20 4 4 4-4" fill="#ffdf67"/>':'')+'</g></g>';
 }).join('');
 return '<svg class="ship-scene" viewBox="0 0 590 440" role="img" aria-label="'+(lang?'Ship deck':'خريطة السفينة')+'"><defs><pattern id="shiptiles" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#384756"/><path d="M0 0h16v16" fill="none" stroke="#435360"/></pattern></defs><path d="M105 80H485M105 220H485M105 360H485M105 80V360M295 80V360M485 80V360" stroke="#1a202d" stroke-width="38"/><path d="M105 80H485M105 220H485M105 360H485M105 80V360M295 80V360M485 80V360" stroke="#677585" stroke-width="25"/>'+walls+actors+'</svg>';
}
