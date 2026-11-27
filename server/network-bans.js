import {createHmac,randomUUID} from 'node:crypto';
import {isIP,SocketAddress} from 'node:net';

export function networkBans(state,secret){
  const records=state.networkBans??={};
  function fingerprint(address){
    if(!secret||typeof address!=='string')return null;
    const host=address.toLowerCase().replace(/^::ffff:(?=\d+\.)/,'').split('%')[0];
    const family=isIP(host);
    if(!family)return null;
    const normalized=new SocketAddress({address:host,family:family===4?'ipv4':'ipv6'}).address;
    return createHmac('sha256',secret).update('saha-network:'+normalized).digest('hex');
  }
  const active=key=>Boolean(key&&records[key]?.until>Date.now());
  function list(){
    return Object.values(records).filter(entry=>entry.until>Date.now()).map(({id,player,reason,until})=>({id,player,reason,until}));
  }
  function add(key,player,reason,until){
    for(const [hash,entry] of Object.entries(records))if(entry.until<=Date.now())delete records[hash];
    const id=records[key]?.id??randomUUID();
    records[key]={id,player,reason,until};
    return id;
  }
  function remove(id){
    const key=Object.keys(records).find(hash=>records[hash].id===id);
    if(!key)return false;
    delete records[key];
    return true;
  }
  return {fingerprint,active,list,add,remove};
}
