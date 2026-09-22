import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TowerWorld, nextFloor, jumpPower, GRAVITY, MAX_SPEED } from '../src/tower-engine.ts';
const idle={direction:0,jump:false};
function step(w,seconds,input=idle){for(let i=0;i<seconds*120;i++)w.update(1/120,input);}
test('no automatic bounce or camera pressure before first jump',()=>{
 const w=new TowerWorld();step(w,12);assert.equal(w.player.y,30);assert.equal(w.camera,0);assert.equal(w.elapsed,0);assert.ok(w.grounded);
});
test('momentum changes a one-floor hop into a four-floor leap',()=>{
 assert.ok(jumpPower(0)**2/(2*GRAVITY)>60);
 assert.ok(jumpPower(0)**2/(2*GRAVITY)<120);
 assert.ok(jumpPower(MAX_SPEED)**2/(2*GRAVITY)>240);
 assert.equal(jumpPower(-MAX_SPEED),jumpPower(MAX_SPEED));
});
test('running builds speed gradually and release brakes',()=>{
 const w=new TowerWorld();w.update(1/120,{direction:1,jump:false});assert.ok(w.player.vx>0&&w.player.vx<20);
 step(w,.15,{direction:1,jump:false});const speed=w.player.vx;step(w,.1);assert.ok(w.player.vx<speed);
});
test('wall rebounds instead of wrapping to the other side',()=>{
 const w=new TowerWorld();w.player.x=332;w.player.vx=300;w.update(1/120,{direction:1,jump:false});
 assert.ok(w.player.x<=333&&w.player.x>320);assert.ok(w.player.vx<0);assert.ok(w.events.includes('wall'));
});
test('tap produces one jump then rests on a floor',()=>{
 const w=new TowerWorld(640,()=>.5);w.update(1/120,{direction:0,jump:true});assert.ok(w.player.vy>0);assert.equal(w.grounded,null);
 step(w,1);assert.ok(w.grounded);const y=w.player.y;step(w,.3);assert.equal(w.player.y,y);assert.equal(w.player.vy,0);
});
test('holding jump continues hopping on landings',()=>{
 const w=new TowerWorld(640,()=>.5);step(w,2,{direction:0,jump:true});assert.ok(w.highestFloor>=3);
});
test('coyote window permits a late edge jump but cannot double jump',()=>{
 const w=new TowerWorld();w.grounded=null;w.coyote=.07;w.player.vy=-10;
 w.update(1/120,{direction:0,jump:true});assert.ok(w.player.vy>400);
 const vy=w.player.vy;w.update(1/120,idle);w.update(1/120,{direction:0,jump:true});assert.ok(w.player.vy<vy);
});
test('buffered jump fires after landing',()=>{
 const w=new TowerWorld();w.grounded=null;w.player.y=32;w.player.vy=-50;w.coyote=0;
 w.update(1/120,{direction:0,jump:true});step(w,.1);assert.ok(w.player.vy>300);
});
test('two-floor landings chain; single-floor landing banks exactly once',()=>{
 const w=new TowerWorld();w.takeoffFloor=0;w.land(w.floors[2]);assert.equal(w.combo,1);
 w.takeoffFloor=2;w.land(w.floors[4]);assert.equal(w.combo,2);assert.equal(w.bestCombo,2);
 w.takeoffFloor=4;w.land(w.floors[5]);assert.equal(w.combo,0);assert.equal(w.score,250);
 w.bankCombo();assert.equal(w.score,250);
 w.takeoffFloor=0;w.land(w.floors[2]);assert.equal(w.combo,0);assert.equal(w.score,250);
});
test('combo expires after three seconds and score is retained',()=>{
 const w=new TowerWorld();w.takeoffFloor=0;w.land(w.floors[2]);step(w,3.1);assert.equal(w.combo,0);assert.equal(w.score,70);
});
test('camera accelerates and eventually ends an idle started run',()=>{
 const w=new TowerWorld();w.started=true;const speed=w.scrollSpeed;step(w,15);assert.ok(w.camera>0);assert.ok(w.scrollSpeed>speed);assert.equal(w.alive,false);
});
test('100 seeded towers retain standing-jump route through 1000 floors',()=>{
 for(let seed=1;seed<=100;seed++){
  let state=seed;const random=()=>((state=(1664525*state+1013904223)>>>0)/2**32);
  let f={x:16,y:30,width:328,index:0};
  for(let i=0;i<1000;i++){
   const n=nextFloor(f,random);assert.equal(n.y-f.y,60);
   assert.ok(n.x>=19.99&&n.x+n.width<=340.01);
   assert.ok(Math.min(f.x+f.width,n.x+n.width)-Math.max(f.x,n.x)>=41.99);
   assert.ok(n.width>=104);f=n;
  }
 }
});
test('identical fixed steps give identical input outcomes',()=>{
 const a=new TowerWorld(640,()=>.5),b=new TowerWorld(640,()=>.5);
 for(let i=0;i<600;i++){const input={direction:i%150<75?1:-1,jump:i%90<30};a.update(1/120,input);b.update(1/120,input);}
 assert.deepEqual(a.player,b.player);assert.equal(a.score,b.score);
});
