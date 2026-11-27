import {puzzleStatus,solveShopPuzzle} from './shop-puzzle.js';
import {cosmetics} from '../public/cosmetics.js';

const styles={decoration:['orbit','frame','stars','crystal','flare'],effect:['shine','float']};

export function readShop(value){
  const entries=value?JSON.parse(value):[];
  if(!Array.isArray(entries))throw Error('SHOP_CATALOG must be an array');
  const ids=new Set();
  for(const item of entries){
    if(!item||!/^[a-z0-9-]{1,32}$/.test(item.id)||ids.has(item.id)||!(styles[item.type]?.includes(item.style)||cosmetics.some(entry=>entry.type===item.type&&entry.style===item.style))||
      !Number.isSafeInteger(item.price)||item.price<1||
      !['ar','en'].every(lang=>typeof item.name?.[lang]==='string'&&item.name[lang].trim()&&item.name[lang].length<=64)){
      throw Error('Invalid SHOP_CATALOG item');
    }
    ids.add(item.id);
  }
  return [...cosmetics.filter(item=>!ids.has(item.id)),...entries];
}

export function setupShop({app,store,identify,guard,areFriends,catalog,onEquip}){
  const {players}=store.state;
  const byId=new Map(catalog.map(item=>[item.id,item]));
  const wallet=p=>Math.max(0,(p.points??0)+(p.shopPuzzle?.credit??0)+(p.shopGrantedPoints??0)-(p.shopSpent??0));
  const view=p=>({catalog,puzzle:puzzleStatus(p),balance:p?wallet(p):null,owned:p?.shopItems??[],wishlist:p?.shopWishlist??[],equipped:p?.shopEquipped??{}});
  app.get('/auth/discord/shop',(req,res)=>{
    res.set('Cache-Control','no-store');
    return res.json(view(players[identify(req.headers.cookie)?.id]));
  });
  app.post('/auth/discord/shop',(req,res)=>{
    if(!guard(req,res))return;
    const id=identify(req.headers.cookie)?.id;
    const player=players[id];
    if(!player)return res.status(401).json({error:'discordLogin'});
    if(req.body?.action==='solvePuzzle'){
      const previous=structuredClone(player.shopPuzzle);
      const result=solveShopPuzzle(player,req.body?.answer);
      if(result.changed){
        try{store.save();}
        catch(error){
          if(previous===undefined)delete player.shopPuzzle;
          else player.shopPuzzle=previous;
          throw error;
        }
      }
      return result.error?res.status(result.status).json({error:result.error}):res.json(view(player));
    }
    const item=byId.get(req.body?.item);
    const action=req.body?.action;
    if(!item)return res.status(404).json({error:'shopUnavailable'});
    if(action==='wish'){
      const list=new Set(player.shopWishlist);
      if(req.body.enabled===true)list.add(item.id);
      else if(req.body.enabled===false)list.delete(item.id);
      else return res.status(400).json({error:'shopUnavailable'});
      player.shopWishlist=[...list];
    }else if(action==='equip'){
      if(!player.shopItems?.includes(item.id))return res.status(403).json({error:'forbidden'});
      const current=player.shopEquipped??={};
      if(current[item.type]===item.id)delete current[item.type];
      else current[item.type]=item.id;
    }else if(action==='buy'||action==='gift'){
      const recipient=action==='buy'?player:players[req.body.to];
      if(!recipient?.discordId||(action==='gift'&&(recipient.id===id||!areFriends(id,recipient.id))))return res.status(403).json({error:'forbidden'});
      if(recipient.shopItems?.includes(item.id))return res.status(409).json({error:'shopOwned'});
      if(wallet(player)<item.price)return res.status(409).json({error:'shopFunds'});
      if(action==='gift')player.giftsGiven=(player.giftsGiven??0)+1;
      player.shopSpent=(player.shopSpent??0)+item.price;
      (recipient.shopItems??=[]).push(item.id);
      recipient.shopWishlist=recipient.shopWishlist?.filter(entry=>entry!==item.id)??[];
    }else return res.status(400).json({error:'shopUnavailable'});
    store.save();
    if(action==='equip')onEquip?.(id);
    return res.json(view(player));
  });
}
