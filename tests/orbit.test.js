import test from 'node:test';
import assert from 'node:assert/strict';
import {orbit} from '../server/games/orbit.js';
test('station keeps roles private and resolves a reported elimination by vote',()=>{
  const s=orbit.start(['a','b','c','d','e']);
  const crew=s.players.filter(id=>id!==s.spy);
  assert.equal(orbit.view(s,'viewer').orbit.spy,null);
  assert.equal(orbit.view(s,crew[0]).orbit.reveal,null);
  assert.equal(orbit.move(s,crew[0],{type:'vent',value:0}),null);
  assert.equal(orbit.move(s,s.spy,{type:'tag',value:crew[0]}),null);
  s.readyAt=0;
  orbit.move(s,s.spy,{type:'tag',value:crew[0]});
  orbit.move(s,crew[1],{type:'report'});
  assert.equal(s.phase,'meeting');
  assert.equal(orbit.move(s,crew[0],{type:'vote',value:s.spy}),null);
  for(const id of s.players.filter(p=>!s.out.includes(p)))orbit.move(s,id,{type:'vote',value:s.spy});
  assert.deepEqual(s.winners,crew);
});
test('station alarm requires two distinct repairs or expires for an impostor win',()=>{
  const s=orbit.start(['a','b','c','d']);
  s.alarmAt=0;orbit.move(s,s.spy,{type:'alarm'});
  assert.deepEqual(orbit.move(structuredClone(s),s.spy,{type:'timeout'},{automated:true}).winners,[s.spy]);
  const crew=s.players.filter(id=>id!==s.spy);
  for(const [i,room] of [0,8].entries()){
    s.pos[crew[i]]=room;
    assert.ok(orbit.move(s,crew[i],{type:'repair'}));
  }
  assert.equal(s.phase,'field');
});

test('fifteen seats support three allied impostors with private identities and parity victory',()=>{
  const s=orbit.start(Array.from({length:15},(_,i)=>String(i)));
  const [a,b]=s.impostors;
  assert.equal(s.impostors.length,3);
  assert.equal(orbit.view(s,a).orbit.allies.length,2);
  assert.deepEqual(orbit.view(s,'spectator').orbit.allies,[]);
  const crew=s.players.filter(id=>!s.impostors.includes(id));
  assert.deepEqual(orbit.view(s,crew[0]).orbit.allies,[]);
  s.readyAt=0;
  assert.equal(orbit.move(s,a,{type:'tag',value:b}),null);
  for(const id of crew.slice(0,9)){s.readyAt=0;orbit.move(s,a,{type:'tag',value:id});}
  assert.deepEqual(s.winners.sort(),[...s.impostors].sort());
});
import {floorAt} from '../public/games/ship-floor.js';
test('ship walking crosses the corridor and refuses an off-floor movement',()=>{
  const s=orbit.start(['a','b','c','d']);
  for(let n=0;n<16;n++){
    s.moved.a=0;
    assert.ok(orbit.move(s,'a',{type:'step',value:'right'}));
    assert.ok(floorAt(s.xy.a.x,s.xy.a.y));
  }
  assert.equal(s.pos.a,5);
  s.xy.a={x:549,y:220};s.moved.a=0;
  assert.equal(orbit.move(s,'a',{type:'step',value:'right'}),null);
  assert.equal(orbit.move(s,'a',{type:'walk',value:4}),null);
});
