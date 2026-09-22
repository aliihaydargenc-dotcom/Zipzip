import type { TowerWorld } from './tower-engine';
const palettes = [
  {sky:'#172d4b',brick:'#254365',line:'#345678',ice:'#b2ecff',edge:'#5a9bbb',glow:'#58c9ed'},
  {sky:'#252341',brick:'#39345b',line:'#514879',ice:'#d6c7ff',edge:'#8d78bd',glow:'#b396f5'},
  {sky:'#183c43',brick:'#255058',line:'#396c72',ice:'#b3f5d9',edge:'#54a99b',glow:'#56e2b5'},
];
export function drawTower(ctx: CanvasRenderingContext2D, world: TowerWorld, reducedMotion = false) {
  const {width:w,viewHeight:h,camera,player:p}=world;
  const theme=palettes[Math.floor(world.highestFloor/50)%palettes.length]!;
  ctx.clearRect(0,0,w,h);
  const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,theme.sky);sky.addColorStop(1,'#102239');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  // Masonry follows the camera; central arches move more slowly for depth.
  ctx.strokeStyle=theme.line;ctx.lineWidth=1;ctx.globalAlpha=.25;
  const offset=(camera*.45)%64;
  for(let y=-64+offset,row=0;y<h+64;y+=64,row++){
    ctx.beginPath();ctx.moveTo(16,y);ctx.lineTo(w-16,y);ctx.stroke();
    for(let x=16+(row%2)*44;x<w-16;x+=88){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}
  }
  ctx.globalAlpha=1;
  for(let i=0;i<4;i++){
    const y=h-((i*250+100-camera*.32)%(h+250)+h+250)%(h+250);
    ctx.fillStyle='#0e2037';ctx.beginPath();ctx.roundRect(w/2-25,y,50,88,[25,25,2,2]);ctx.fill();
    ctx.strokeStyle=theme.line;ctx.lineWidth=3;ctx.stroke();
    ctx.strokeStyle=theme.glow;ctx.globalAlpha=.25;ctx.beginPath();ctx.moveTo(w/2,y+8);ctx.lineTo(w/2,y+82);ctx.stroke();ctx.globalAlpha=1;
  }
  for(const x of [0,w-16]){
    ctx.fillStyle=theme.brick;ctx.fillRect(x,0,16,h);
    ctx.fillStyle=theme.line;ctx.fillRect(x===0?13:x,0,3,h);
    for(let y=(camera%32)-32;y<h;y+=32){ctx.fillStyle=theme.sky;ctx.fillRect(x,y,16,2);}
  }
  for(const f of world.floors){
    const y=h-(f.y-camera);if(y< -25||y>h+25)continue;
    const milestone=f.index>0&&f.index%10===0;
    ctx.fillStyle='#0c1b2b88';ctx.beginPath();ctx.roundRect(f.x+2,y+5,f.width,12,4);ctx.fill();
    ctx.fillStyle=milestone?'#b69553':theme.edge;ctx.beginPath();ctx.roundRect(f.x,y,f.width,12,4);ctx.fill();
    ctx.fillStyle=milestone?'#ffe1a2':theme.ice;ctx.beginPath();ctx.roundRect(f.x,y,f.width,5,3);ctx.fill();
    ctx.fillStyle='#ffffff75';ctx.fillRect(f.x+7,y+1,Math.max(5,f.width-14),1);
    if(milestone){
      ctx.fillStyle='#fbe1ac';ctx.font='800 10px system-ui';ctx.textAlign='center';ctx.fillText(`${f.index}. KAT`,f.x+f.width/2,y+28);
    }else if(f.index>0){ctx.fillStyle='#a4bed0';ctx.font='600 9px system-ui';ctx.textAlign='left';ctx.fillText(String(f.index),f.x+5,y+23);}
    for(let x=f.x+18;x<f.x+f.width-10;x+=43){ctx.fillStyle=theme.ice+'88';ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x+3,y+17);ctx.lineTo(x+6,y+12);ctx.fill();}
  }
  if(!reducedMotion)for(const t of world.trail){ctx.globalAlpha=t.life*.9;ctx.fillStyle='#6de9ff';ctx.beginPath();ctx.roundRect(t.x-9,h-(t.y-camera)-25,18,24,7);ctx.fill();}
  ctx.globalAlpha=1;
  // Original scarfed runner: anticipatory lean, running feet, airborne tuck.
  const y=h-(p.y-camera);
  ctx.save();ctx.translate(p.x,y);
  const run=world.grounded&&!reducedMotion?Math.sin(world.elapsed*26+Math.abs(p.x)*.12)*Math.min(4,Math.abs(p.vx)/70):0;
  ctx.rotate(reducedMotion?0:p.vx/4200);
  if(world.landFlash>0&&!reducedMotion)ctx.scale(1.1,.9);
  ctx.fillStyle='#0a152555';ctx.beginPath();ctx.ellipse(0,2,13,3,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ff806c';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-p.facing*6,-20);ctx.quadraticCurveTo(-p.facing*18,-19,-p.facing*24,-25+run);ctx.stroke();
  ctx.fillStyle='#ffc75d';ctx.beginPath();ctx.roundRect(-9,-23,18,18,5);ctx.fill();
  ctx.fillStyle='#fff2bb';ctx.fillRect(-5,-20,3,11);
  ctx.fillStyle='#273b55';ctx.beginPath();ctx.roundRect(-9,-7+run,8,7,2);ctx.roundRect(2,-7-run,8,7,2);ctx.fill();
  ctx.fillStyle='#ffe0bd';ctx.beginPath();ctx.arc(0,-29,9,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#52d2dc';ctx.beginPath();ctx.roundRect(-10,-40,19,8,3);ctx.fill();ctx.fillRect(-11,-33,23,4);
  ctx.fillStyle='#21334b';ctx.beginPath();ctx.arc(p.facing*4,-29,1.4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#e39862';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.facing*3,-25);ctx.lineTo(p.facing*6,-25);ctx.stroke();
  ctx.restore();
  // The rising bottom is a readable danger zone rather than an invisible kill plane.
  const danger=ctx.createLinearGradient(0,h-35,0,h);danger.addColorStop(0,'#ff687000');danger.addColorStop(1,'#ff687035');
  if(world.started&&world.elapsed>6){ctx.fillStyle=danger;ctx.fillRect(16,h-35,w-32,35);}
}
