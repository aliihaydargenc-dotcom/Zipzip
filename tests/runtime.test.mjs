import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as physics from '../src/climb-physics.ts';
const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
function game() {
 const elements = new Map();
 const element = id => { if (!elements.has(id)) elements.set(id, {textContent:'',hidden:false,classList:{add(){},remove(){},toggle(){}}}); return elements.get(id); };
 const start = source.indexOf('type PlatformKind');
 const end = source.indexOf('// Development-only');
 const code = ts.transpile(source.slice(start,end)+source.slice(source.indexOf('function roundRect'),source.indexOf("let activeMode:"))+'\nglobalThis.game = Climb;', {target:ts.ScriptTarget.ES2022});
 const sounds=[];
 const context={...physics,Math,performance,requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  byId:element,document:{getElementById:element},Store:{data:{climb:{totalLandings:0,bestHeight:0},coins:0},save(){}},
  AudioFx:{play:v=>sounds.push(v)},haptic(){},toast(){},showResult(){},closeResult(){},navigate(){}};
 vm.createContext(context);vm.runInContext(code,context);
 const c=context.game;c.reset();c.running=true;return {c,sounds,elements};
}
test('actual pickup collision launches immediately on descent',()=>{
 const {c,sounds}=game();c.ball.y=220;c.ball.vy=-150;c.pickups=[{x:c.ball.x,y:220,kind:'spring',collected:false}];
 c.update(1/120);
 assert.ok(c.ball.vy>1000);assert.equal(c.springJumps,2);assert.ok(sounds.includes('spring'));assert.ok(c.particles.length>=22);
});
test('actual generated route survives removing every fragile/moving/boost platform',()=>{
 const {c}=game();c.generatePlatforms(25030);
 const safe=c.platforms.filter(p=>p.anchor);
 for(let i=1;i<safe.length;i++){
  assert.ok(safe[i].y-safe[i-1].y<100);
  assert.ok(['solid','spring'].includes(safe[i].kind));
 }
});
test('spring and boost pads apply impulse on first landing',()=>{
 for(const kind of ['spring','boost']){
  const {c,sounds}=game();c.platforms=[{x:0,y:200,width:c.width,height:12,vx:0,kind,broken:false,breakTimer:0,anchor:false}];
  c.ball.y=214;c.ball.vy=-300;c.pickups=[];c.update(1/120);
  assert.ok(c.ball.vy>900);assert.ok(sounds.includes('spring'));
 }
});
test('shield recovery joins permanent route and resets lateral momentum',()=>{
 const {c}=game();c.cameraY=500;c.generatePlatforms(2000);c.shieldCharges=1;c.velocityX=400;c.rescue();
 const p=c.platforms.find(p=>p.anchor && p.y===c.safePoint.y);
 assert.ok(p);assert.equal(c.velocityX,0);assert.equal(c.shieldCharges,0);assert.ok(c.ball.vy>0);
});
test('actual autopilot climbs past 1000m with fixed-step physics',()=>{
 const {c}=game();c.pickups=[];
 // Aim for the next permanent row during ascent and hold it through descent.
 let target=c.platforms[1];
 for(let i=0;i<120*180 && c.running && c.runHeight<1050;i++){
  if(c.ball.vy>0 && c.ball.prevY>c.ball.y-15){
   const candidates=c.platforms.filter(p=>p.anchor && p.y>c.safePoint.y+1).sort((a,b)=>a.y-b.y);
   if(candidates.length) target=candidates[0];
  }
  if(target)c.targetX=target.x+target.width/2;
  c.update(1/120);
 }
 assert.ok(c.runHeight>=1050,`stopped at ${c.runHeight}m`);
});
test('canvas renderer supports all platform and pickup kinds',()=>{
 const {c}=game();
 const gradient={addColorStop(){}};
 c.ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:()=>{},set:()=>true});
 c.platforms=['solid','moving','fragile','spring','boost'].map((kind,i)=>({x:20,y:100+i*70,width:100,height:12,kind,vx:1,breakTimer:kind==='fragile'?.1:0,broken:false}));
 c.pickups=['coin','spring','shield'].map((kind,i)=>({x:180,y:150+i*70,kind,collected:false}));
 c.launchFx=.5;c.shieldCharges=1;c.draw();
});
