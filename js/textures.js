// textures.js — Generadores de texturas procedurales (DynamicTexture de
// Babylon y Canvas2D puro). Sin dependencias de la escena ni de la física;
// cada función recibe lo que necesita como parámetro.

function makeDotTexture(scene, size, rgb){
  const tex = new BABYLON.DynamicTexture("dot"+rgb+Math.random(), size, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.4, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size); tex.update(); tex.hasAlpha = true;
  return tex;
}
function lerp3(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function paintSkyGradient(mesh){
  const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  let maxY=-Infinity, minY=Infinity;
  for(let i=1;i<positions.length;i+=3){ if(positions[i]>maxY)maxY=positions[i]; if(positions[i]<minY)minY=positions[i]; }
  const top=[0.05,0.05,0.11], mid=[0.02,0.03,0.09], bottom=[0.01,0.01,0.02];
  const colors=[];
  for(let i=0;i<positions.length;i+=3){
    const t=(positions[i+1]-minY)/(maxY-minY);
    const c = t>0.5 ? lerp3(mid,top,(t-0.5)*2) : lerp3(bottom,mid,t*2);
    colors.push(c[0],c[1],c[2],1);
  }
  mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors);
}
// Banda/disco brillante (fuente de la "reflexión", crea el anillo tipo Einstein)
function makeBandCanvas(size){
  const c = document.createElement('canvas'); c.width=size; c.height=size;
  const ctx = c.getContext('2d');
  ctx.fillStyle='#000814'; ctx.fillRect(0,0,size,size);
  const bandY=size/2, bandH=size*0.085;
  const grad = ctx.createLinearGradient(0,bandY-bandH,0,bandY+bandH);
  grad.addColorStop(0,'rgba(190,215,255,0)'); grad.addColorStop(0.5,'rgba(215,230,255,0.95)'); grad.addColorStop(1,'rgba(190,215,255,0)');
  ctx.fillStyle=grad; ctx.fillRect(0,bandY-bandH,size,bandH*2);
  for(let i=0;i<10;i++){
    const x=Math.random()*size, y=bandY+(Math.random()-0.5)*bandH*1.6, rad=18+Math.random()*38;
    const g2=ctx.createRadialGradient(x,y,0,x,y,rad);
    g2.addColorStop(0,'rgba(255,185,150,0.4)'); g2.addColorStop(1,'rgba(255,185,150,0)');
    ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
  }
  for(let i=0;i<260;i++){
    const x=Math.random()*size,y=Math.random()*size,r=Math.random()*1.3+0.2;
    ctx.fillStyle=`rgba(255,255,255,${0.3+0.6*Math.random()})`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  return ctx.getImageData(0,0,size,size);
}
// Textura tipo "mundo lejano" (lo que se ve transmitido al otro lado)
function makeWorldCanvas(size){
  const c = document.createElement('canvas'); c.width=size; c.height=size;
  const ctx = c.getContext('2d');
  ctx.fillStyle='#05030a'; ctx.fillRect(0,0,size,size);
  const palette=['#2f6b4f','#6b3f66','#3a2f6b','#7a5a2f','#1f2f4a'];
  for(let i=0;i<140;i++){
    const x=Math.random()*size,y=Math.random()*size,rad=10+Math.random()*46;
    const col=palette[Math.floor(Math.random()*palette.length)];
    const g=ctx.createRadialGradient(x,y,0,x,y,rad);
    g.addColorStop(0,col+'aa'); g.addColorStop(1,col+'00');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
  }
  for(let i=0;i<90;i++){
    const x=Math.random()*size,y=Math.random()*size,r=Math.random()*1.2+0.2;
    ctx.fillStyle=`rgba(255,255,255,${0.2+0.5*Math.random()})`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  return ctx.getImageData(0,0,size,size);
}
