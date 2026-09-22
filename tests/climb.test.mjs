import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempoAt, routeStep, steer, launchVelocity } from '../src/climb-physics.ts';
test('tempo increases continuously, jump reach stays constant', () => {
 let prev = 0;
 for (let m = 0; m <= 2500; m++) {
  const p = tempoAt(m);
  assert.ok(p.speed >= prev); prev = p.speed;
  assert.ok(Math.abs(p.jump ** 2 / (2 * p.gravity) - 145.2) < 1e-8);
 }
 assert.ok(tempoAt(1000).jump / tempoAt(0).jump >= 1.6);
 assert.ok(2 * tempoAt(1000).jump / tempoAt(1000).gravity < .55);
});
test('100 seeds × 4 viewport widths: permanent route is reachable through 2500m', () => {
 for (const width of [280, 320, 390, 548]) for (let seed = 1; seed <= 100; seed++) {
  let state = seed; const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let y = 30, x = width / 2;
  while (y < 25030) {
   const p = tempoAt((y - 30) / 10), next = routeStep(y, x, width, random);
   assert.ok(next.y - y < p.jump ** 2 / (2 * p.gravity) * .7);
   assert.ok(next.center - next.width / 2 >= 11.99);
   assert.ok(next.center + next.width / 2 <= width - 11.99);
   // Simulate flight with 100ms reaction delay and real horizontal acceleration.
   let bx=x, vx=0, by=y, vy=p.jump, t=0;
   while (vy >= 0 || by > next.y) {
    const dt=1/120;
    if (t > .1) { const move=steer(vx,next.center-bx,dt,(by-30)/10); bx+=move.step; vx=move.vx; }
    by+=vy*dt-.5*p.gravity*dt*dt; vy-=p.gravity*dt; t+=dt;
   }
   assert.ok(Math.abs(bx-next.center) < next.width/2-10, `unreachable seed ${seed} width ${width} y ${y}`);
   y=next.y; x=next.center;
  }
 }
});
test('spring impulse exceeds regular bounce at every tempo',()=>{
 for(const m of [0,150,350,650,1000,2500]) assert.ok(launchVelocity(m,1.65)>tempoAt(m).jump*1.6);
});
test('steering brakes at target without overshoot',()=>{
 for (const m of [0,1000,2500]) {
  let x=0,vx=0;
  for(let i=0;i<240;i++){const r=steer(vx,100-x,1/120,m); x+=r.step;vx=r.vx;assert.ok(x<=100);}
  assert.ok(Math.abs(100-x)<.1);
 }
});
