// app.js — Escena Babylon.js, interfaz de usuario y orquestación general.
// Usa como GLOBALES las funciones de physics.js, textures.js y verify.js
// (cargados antes que este archivo en index.html vía <script> clásico,
// sin módulos ES, para poder abrir index.html directamente sin servidor).

async function main(){
const canvas = document.getElementById("renderCanvas");

// --- Motor de render: intento real de WebGPU (Babylon WebGPUEngine), con
// fallback automatico y transparente a WebGL2 si el navegador no lo soporta,
// si la clase no esta disponible en el bundle cargado, o si la
// inicializacion falla por cualquier razon. Nada de la fisica ni de la
// escena depende de cual de los dos se use: es puramente la capa de render. ---
let engine = null, usingWebGPU = false;
if (navigator.gpu && window.BABYLON && BABYLON.WebGPUEngine) {
  try {
    const supported = await BABYLON.WebGPUEngine.IsSupportedAsync;
    if (supported) {
      const gpuEngine = new BABYLON.WebGPUEngine(canvas, {antialias:true, stencil:true});
      await gpuEngine.initAsync();
      engine = gpuEngine;
      usingWebGPU = true;
    }
  } catch(e) { engine = null; usingWebGPU = false; }
}
if (!engine) {
  engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true, antialias:true});
}
const badge = document.getElementById("engineBadge");
if (badge) {
  badge.textContent = usingWebGPU ? "⚡ Renderizando con WebGPU" : "Renderizando con WebGL2 (WebGPU no disponible aquí)";
  badge.className = usingWebGPU ? "gpu" : "";
}

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.01,0.01,0.03,1);

const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI/2.3, Math.PI/2.35, 26, BABYLON.Vector3.Zero(), scene);
camera.lowerRadiusLimit = 4; camera.upperRadiusLimit = 45; camera.wheelPrecision = 35; camera.inertia = 0.88;
camera.attachControl(canvas, true);
BABYLON.Animation.CreateAndStartAnimation("dolly","cam","radius",30,90,35,26,BABYLON.Animation.ANIMATIONTYPE_FLOAT,BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);

const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
hemi.intensity = 0.25; hemi.groundColor = new BABYLON.Color3(0.03,0.04,0.09);
const glow = new BABYLON.GlowLayer("glow", scene, {mainTextureRatio:0.5});
glow.intensity = 0.9;

const sky = BABYLON.MeshBuilder.CreateSphere("sky", {diameter:120, segments:16, sideOrientation:BABYLON.Mesh.BACKSIDE}, scene);
paintSkyGradient(sky);
const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
skyMat.disableLighting = true;
skyMat.emissiveColor = new BABYLON.Color3(0,0,0); // el color de vertice ya ES el color final (unlit)
skyMat.specularColor = new BABYLON.Color3(0,0,0);
skyMat.backFaceCulling = false;
sky.material = skyMat; sky.infiniteDistance = true;

const starTex = makeDotTexture(scene, 32, "255,255,255");
const stars = new BABYLON.ParticleSystem("stars", 2000, scene);
stars.particleTexture = starTex;
stars.emitter = BABYLON.Vector3.Zero();
stars.minEmitBox = new BABYLON.Vector3(-55,-55,-55); stars.maxEmitBox = new BABYLON.Vector3(55,55,55);
stars.color1 = new BABYLON.Color4(1,1,1,1); stars.color2 = new BABYLON.Color4(0.8,0.88,1,1);
stars.minSize = 0.05; stars.maxSize = 0.22;
stars.minLifeTime = Number.MAX_VALUE; stars.maxLifeTime = Number.MAX_VALUE;
stars.emitRate = 100000; stars.manualEmitCount = 2000;
stars.direction1 = BABYLON.Vector3.Zero(); stars.direction2 = BABYLON.Vector3.Zero();
stars.minEmitPower = 0; stars.maxEmitPower = 0; stars.gravity = BABYLON.Vector3.Zero();
stars.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
stars.start();

const coreTex = makeDotTexture(scene, 128, "200,225,255");
const corePlane = BABYLON.MeshBuilder.CreatePlane("core", {size:1.5}, scene);
corePlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
const coreMat = new BABYLON.StandardMaterial("coreMat", scene);
coreMat.emissiveTexture = coreTex; coreMat.opacityTexture = coreTex;
coreMat.disableLighting = true; coreMat.backFaceCulling = false;
coreMat.emissiveColor = new BABYLON.Color3(0.75,0.9,1.3);
coreMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
corePlane.material = coreMat;

const photonDotTex = makeDotTexture(scene, 64, "255,255,255");

/* =========================================================
   REJILLA (encaje isométrico exacto, sin superficie sólida)
   ========================================================= */
let throatLines = null;
const HMAX_L = 6.5, N_RINGS = 60, N_MERID = 48;

// pulsePos (opcional): posicion |ell| del "frente de crecimiento" durante la
// formacion animada. Es un realce visual (un bulto gaussiano de brillo) que
// marca el borde hasta donde ya se desplego la hoja asintoticamente plana;
// no representa un termino fisico adicional, solo un indicador de progreso.
function lineColorAt(ell, r0, pulsePos){
  const r = rOf(ell, r0);
  const rhoAbs = r0*r0/(8*Math.PI*Math.pow(r,4));
  const rho0 = 1/(8*Math.PI*r0*r0);
  const t = Math.min(rhoAbs/rho0, 1);
  let bright = 0.5 + 1.5*Math.pow(t,1.6); // puede superar 1 para alimentar el bloom HDR
  if (pulsePos !== undefined){
    const d = Math.abs(Math.abs(ell) - pulsePos);
    const w = Math.max(r0*0.4, 0.05);
    bright += 1.3*Math.exp(-(d*d)/(2*w*w));
  }
  return new BABYLON.Color4(0.5*bright, 0.78*bright, 1.05*bright, 1);
}

// extentFrac (0..1): cuanto del rango total HMAX_L*r0 se dibuja ya — permite
// que la hoja asintotica se "despliegue" hacia afuera en vez de aparecer de
// golpe a tamano completo. Sigue siendo el mismo encaje exacto r(ell),h(ell);
// solo cambia el intervalo de ell que se renderiza en cada instante.
function buildWireframe(r0, alpha, extentFrac, pulsePos){
  if (throatLines) throatLines.dispose();
  const frac = (extentFrac===undefined) ? 1 : Math.max(0.06, extentFrac);
  const ellSamples = [];
  for(let i=0;i<=N_RINGS;i++) ellSamples.push(((i/N_RINGS)*2-1)*HMAX_L*r0*frac);

  const lines = [], colorsArr = [];
  for(let j=0;j<N_MERID;j++){
    const theta = (j/N_MERID)*Math.PI*2;
    const pts=[], cols=[];
    for(const ell of ellSamples){
      const r=rOf(ell,r0), h=hOf(ell,r0);
      pts.push(new BABYLON.Vector3(r*Math.cos(theta), h, r*Math.sin(theta)));
      cols.push(lineColorAt(ell,r0,pulsePos));
    }
    lines.push(pts); colorsArr.push(cols);
  }
  for(let i=0;i<=N_RINGS;i++){
    const ell = ellSamples[i], r=rOf(ell,r0), h=hOf(ell,r0);
    const pts=[], cols=[];
    for(let j=0;j<=N_MERID;j++){
      const theta=(j/N_MERID)*Math.PI*2;
      pts.push(new BABYLON.Vector3(r*Math.cos(theta), h, r*Math.sin(theta)));
      cols.push(lineColorAt(ell,r0,pulsePos));
    }
    lines.push(pts); colorsArr.push(cols);
  }
  throatLines = BABYLON.MeshBuilder.CreateLineSystem("wireGrid", {lines:lines, colors:colorsArr}, scene);
  throatLines.alpha = (alpha===undefined) ? 1 : alpha;
}

/* =========================================================
   GEODÉSICAS DE FOTONES — ranuras persistentes, actualizables in situ.
   Antes cada cambio de r0 destruía y recreaba las líneas: por eso se
   veían "congeladas" durante la formación (no había nada intermedio que
   dibujar). Ahora cada geodésica es un slot fijo cuya geometría se
   reescribe cuadro a cuadro con la MISMA ecuación, así que se puede
   animar en vivo sin perder rigor: sigue siendo la solución RK4 exacta,
   solo que evaluada en el r0(t) de cada instante.
   ========================================================= */
const GEO_POINTS = 220; // cuenta fija de puntos: permite actualizar la malla in situ
const TRANS_COLOR = new BABYLON.Color3(0.4,1.35,1.2);
const REFLECT_COLOR = new BABYLON.Color3(1.5,0.95,0.42);

function makeMarker(tint){
  const plane = BABYLON.MeshBuilder.CreatePlane("marker", {size:0.22}, scene);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  const mat = new BABYLON.StandardMaterial("markerMat"+Math.random(), scene);
  mat.emissiveTexture = photonDotTex; mat.opacityTexture = photonDotTex;
  mat.disableLighting = true; mat.backFaceCulling = false;
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  mat.emissiveColor = tint;
  plane.material = mat;
  return plane;
}
function solveSlotPath(r0, b, ellObs, fast){
  const maxSteps = fast ? 3500 : 15000;
  const dl = fast ? 0.03*r0 : 0.015*r0;
  const res = integrateGeodesicFull(r0, b, ellObs, maxSteps, dl);
  const pts = resampleFixed(res.pts, GEO_POINTS);
  return { path3D: pathTo3D(pts, r0), transmitted: res.transmitted, finalPhi: res.finalPhi };
}
function createGeodesicSlot(r0, b, ellObs, tintOverride, fast){
  const solved = solveSlotPath(r0, b, ellObs, fast);
  const tint = tintOverride || (solved.transmitted ? TRANS_COLOR : REFLECT_COLOR);
  const line = BABYLON.MeshBuilder.CreateLines("geoLine", {points:solved.path3D, updatable:true}, scene);
  line.color = tint; line.alpha = 0.9;
  const marker = makeMarker(tint);
  marker.position.copyFrom(solved.path3D[0]);
  return { line, marker, path3D:solved.path3D, transmitted:solved.transmitted,
           finalPhi:solved.finalPhi, b, tintOverride, tint };
}
function updateGeodesicSlot(slot, r0, ellObs, fast){
  // slot.b ya viene fijado (para el fotón personalizado se actualiza antes de llamar)
  const solved = solveSlotPath(r0, slot.b, ellObs, fast);
  BABYLON.MeshBuilder.CreateLines("geoLine", {points:solved.path3D, instance:slot.line});
  const tint = slot.tintOverride || (solved.transmitted ? TRANS_COLOR : REFLECT_COLOR);
  slot.line.color = tint;
  slot.marker.material.emissiveColor = tint;
  slot.path3D = solved.path3D;
  slot.transmitted = solved.transmitted;
  slot.finalPhi = solved.finalPhi;
}
function clearGeodesics(){
  for(const g of geoSlots){ g.line.dispose(); g.marker.dispose(); }
  geoSlots = []; customSlot = null;
}

const FIXED_B_RATIOS = [0.35, 0.75, 1.15, 1.5, 2.1];
let geoSlots = [];
let customSlot = null;
let customGeo = null; // alias que usan los readouts

function ensureGeoSlots(r0, bRatio, fast){
  const ellObs = 5*r0;
  if (geoSlots.length === 0){
    for(const br of FIXED_B_RATIOS) geoSlots.push(createGeodesicSlot(r0, br*r0, ellObs, null, fast));
    customSlot = createGeodesicSlot(r0, bRatio*r0, ellObs, new BABYLON.Color3(1.4,1.4,1.4), fast);
    geoSlots.push(customSlot);
  } else {
    for(let i=0;i<FIXED_B_RATIOS.length;i++) updateGeodesicSlot(geoSlots[i], r0, ellObs, fast);
    customSlot.b = bRatio*r0;
    updateGeodesicSlot(customSlot, r0, ellObs, fast);
  }
  customGeo = customSlot;
}

function rebuildAll(r0, bRatio, v){
  buildWireframe(r0, 1);
  ensureGeoSlots(r0, bRatio, false);
  updateReadouts(r0, bRatio, v, customGeo);
  invalidateLensTable();
  scheduleThroatView(r0, v);
  drawStabilityChart(r0, bRatio);
  drawDensityChart(r0);
  renderSelfTests(r0);
}

// Corre la bateria de verify.js y la pinta en el panel #selfTestResults.
// Cada vez que cambias r0 se vuelve a ejecutar: es una prueba en vivo, no
// un resultado precalculado que se muestra siempre igual.
function renderSelfTests(r0){
  const el = document.getElementById("selfTestResults");
  if (!el) return;
  const results = runPhysicsSelfTests(r0);
  el.innerHTML = results.map(r =>
    `<div class="${r.pass ? '' : 'fail'}">${r.pass ? '✅' : '❌'} ${r.name} — ${r.detail}</div>`
  ).join('');
}

/* =========================================================
   PANEL DE ESTABILIDAD
   - Curva en vivo: potencial efectivo de fotones V_eff(ell)=L^2/r(ell)^2,
     exactamente el mismo termino que aparece en la ecuacion de geodesicas
     ya integrada arriba (no es una formula nueva, es su version "estatica").
     El maximo en la garganta (ell=0) es un equilibrio INESTABLE: un foton
     con b=r0 exactamente podria orbitar ahi para siempre, pero cualquier
     perturbacion lo manda a un lado (transmision) o al otro (reflexion) —
     el mismo mecanismo que la esfera de fotones de un agujero negro.
   - Nota aparte (no calculada aqui, citada de la literatura): la GEOMETRIA
     completa del agujero de gusano de Ellis es linealmente inestable bajo
     perturbaciones de la metrica (Gonzalez, Guzman & Sarbach 2009 y trabajos
     posteriores): decae a un agujero negro de Schwarzschild o se infla,
     segun el signo de la perturbacion. Simularlo en vivo requeriria resolver
     las ecuaciones de Einstein perturbadas dependientes del tiempo, fuera
     del alcance de este simulador en tiempo real.
   ========================================================= */
function drawStabilityChart(r0, bRatio){
  const canvas = document.getElementById("stabilityChart");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const margin = {l:34, r:10, t:10, b:20};
  const plotW = W-margin.l-margin.r, plotH = H-margin.t-margin.b;
  const ellMax = 3.2*r0;
  const b = bRatio*r0;

  // V_eff normalizado por E^2=1: Veff(ell) = (b^2)/r(ell)^2 -- graficamos
  // ademas la curva "generica" del maximo de la barrera para b=r0 (referencia)
  function Veff(ell, bb){ const r=rOf(ell,r0); return (bb*bb)/(r*r); }
  const N = 140;
  const pts = [];
  let vMax = 0;
  for(let i=0;i<=N;i++){
    const ell = -ellMax + (i/N)*2*ellMax;
    const v = Veff(ell, r0); // barrera de referencia (b=r0): la envolvente maxima posible
    pts.push({ell, v});
    if (v>vMax) vMax = v;
  }
  vMax = Math.max(vMax, 1.15);

  function X(ell){ return margin.l + ((ell+ellMax)/(2*ellMax))*plotW; }
  function Y(v){ return margin.t + (1 - v/vMax)*plotH; }

  // ejes
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(margin.l, margin.t); ctx.lineTo(margin.l, margin.t+plotH); ctx.lineTo(margin.l+plotW, margin.t+plotH); ctx.stroke();
  ctx.fillStyle = "#8f96b3"; ctx.font = "9px Consolas,monospace";
  ctx.fillText("ℓ", margin.l+plotW-6, margin.t+plotH+14);
  ctx.fillText("V", margin.l-14, margin.t+8);

  // linea E^2=1 (umbral de transmision/reflexion)
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(margin.l, Y(1)); ctx.lineTo(margin.l+plotW, Y(1)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle="#9aa3c0"; ctx.fillText("E²=1", margin.l+plotW-30, Y(1)-4);

  // curva de barrera de referencia (b=r0), tenue
  ctx.strokeStyle = "rgba(143,208,255,0.35)"; ctx.lineWidth=1.4;
  ctx.beginPath();
  pts.forEach((p,i)=>{ const x=X(p.ell), y=Y(p.v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.stroke();

  // curva del foton de prueba actual V_eff con su propio b, coloreada por resultado
  const transmit = b < r0;
  ctx.strokeStyle = transmit ? "#57e6c9" : "#ffab4d";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for(let i=0;i<=N;i++){
    const ell = -ellMax + (i/N)*2*ellMax;
    const v = Veff(ell, b);
    const x=X(ell), y=Y(Math.min(v,vMax));
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();

  // punto de equilibrio inestable en la garganta (ell=0, barrera de referencia)
  const eqX = X(0), eqY = Y(Veff(0,r0));
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath(); ctx.arc(eqX, eqY, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ff9b9b"; ctx.font="9px Consolas,monospace";
  ctx.fillText("equilibrio inestable", Math.min(eqX+6, W-110), eqY-6);

  document.getElementById("metricStability").innerHTML =
    `<b>Estabilidad de la geometría completa</b> (resultado de la literatura,
     no calculado en vivo): el agujero de gusano de Ellis es linealmente
     <b>inestable</b> ante perturbaciones de la métrica — decae a un agujero
     negro de Schwarzschild o se infla, según el signo de la perturbación
     (González, Guzmán &amp; Sarbach, 2009; confirmado en trabajos
     posteriores). Simular esa dinámica exigiría resolver las ecuaciones de
     Einstein perturbadas dependientes del tiempo, fuera del alcance de un
     simulador en tiempo real en el navegador.`;
}

/* =========================================================
   PERFIL ESPACIAL DE MATERIA EXÓTICA — ρ(ℓ) y τ(ℓ), las mismas fórmulas
   exactas usadas para colorear la rejilla 3D, aquí como curva cuantitativa.
   ========================================================= */
function drawDensityChart(r0){
  const canvas = document.getElementById("densityChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W=canvas.width, H=canvas.height, margin={l:38,r:10,t:10,b:18};
  const plotW=W-margin.l-margin.r, plotH=H-margin.t-margin.b;
  const ellMax = 3*r0;
  const rho0 = 1/(8*Math.PI*r0*r0); // |rho| maxima, en la garganta

  function X(ell){ return margin.l + ((ell+ellMax)/(2*ellMax))*plotW; }
  function Y(t){ return margin.t + (1-t)*plotH; } // t = |rho|/rho0 en [0,1]

  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle="rgba(255,255,255,0.18)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(margin.l,margin.t); ctx.lineTo(margin.l,margin.t+plotH); ctx.lineTo(margin.l+plotW,margin.t+plotH); ctx.stroke();
  ctx.fillStyle="#8f96b3"; ctx.font="9px Consolas,monospace";
  ctx.fillText("|ρ|/ρ₀, τ/ρ₀", margin.l+2, margin.t+9);
  ctx.fillText("ℓ →", margin.l+plotW-16, margin.t+plotH+14);

  // |rho(ell)|/rho0  (idéntica a tau(ell)/rho0 -- ecuacion de estado tau=-rho)
  ctx.strokeStyle = "#ff8a8a"; ctx.lineWidth=2;
  ctx.beginPath();
  const N=140;
  for(let i=0;i<=N;i++){
    const ell = -ellMax + (i/N)*2*ellMax;
    const r = rOf(ell,r0);
    const t = (r0*r0/(8*Math.PI*Math.pow(r,4))) / rho0;
    const x=X(ell), y=Y(t);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();

  // marca la garganta
  ctx.fillStyle="#ffd479";
  ctx.beginPath(); ctx.arc(X(0), Y(1), 3, 0, Math.PI*2); ctx.fill();
  ctx.font="9px Consolas,monospace"; ctx.fillText(`τ₀=${(1/(8*Math.PI*r0*r0)).toExponential(2)}`, X(0)+6, Y(1)-5);
}

/* =========================================================
   RETRATO DE FASE (ℓ, pℓ) del fotón de prueba actual: la curva de energía
   conservada pℓ² + b²/r(ℓ)² = 1, con un punto que se mueve EN VIVO, leído
   directamente de la posición real del marcador 3D (acopla el render 3D
   con esta gráfica 2D: son literalmente el mismo estado físico).
   ========================================================= */
let phasePrevEll = undefined;
function drawPhasePortrait(r0, b, dot){
  const canvas = document.getElementById("phaseChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W=canvas.width, H=canvas.height, margin={l:30,r:8,t:8,b:16};
  const plotW=W-margin.l-margin.r, plotH=H-margin.t-margin.b;
  const ellMax = 3*r0;
  function X(ell){ return margin.l + ((ell+ellMax)/(2*ellMax))*plotW; }
  function Y(p){ return margin.t + (1-(p+1.15)/2.3)*plotH; }

  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle="rgba(255,255,255,0.18)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(margin.l,margin.t); ctx.lineTo(margin.l,margin.t+plotH); ctx.lineTo(margin.l+plotW,margin.t+plotH); ctx.stroke();
  ctx.fillStyle="#8f96b3"; ctx.font="9px Consolas,monospace";
  ctx.fillText("pℓ", margin.l-16, margin.t+8);
  ctx.fillText("ℓ →", margin.l+plotW-16, margin.t+plotH+14);

  ctx.strokeStyle = "#8fd0ff"; ctx.lineWidth=1.6;
  const N=160;
  for(const sign of [1,-1]){
    let started=false;
    ctx.beginPath();
    for(let i=0;i<=N;i++){
      const ell = -ellMax + (i/N)*2*ellMax;
      const r = rOf(ell,r0);
      const inside = 1-(b*b)/(r*r);
      if (inside<0){ started=false; continue; }
      const x=X(ell), y=Y(sign*Math.sqrt(inside));
      if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  if (dot){
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(X(dot.ell), Y(dot.p), 3.5, 0, Math.PI*2); ctx.fill();
  }
}
// Llamado cada frame (ver el bucle de animacion): lee la posicion Y real del
// marcador del foton personalizado, la invierte a ell (h=r0*asinh(ell/r0)),
// y recalcula pell de la MISMA ecuacion de conservacion -- no es una
// animacion separada, es el mismo estado leido dos veces.
function updatePhasePortraitLive(){
  if (!customSlot) return;
  const r0 = parseFloat(r0Input.value);
  const b = parseFloat(bInput.value)*r0;
  const h = customSlot.marker.position.y;
  const ell = r0*Math.sinh(h/r0);
  const r = rOf(ell, r0);
  const pmag = Math.sqrt(Math.max(1-(b*b)/(r*r), 0));
  if (phasePrevEll === undefined) phasePrevEll = ell;
  const sign = (ell >= phasePrevEll) ? 1 : -1;
  phasePrevEll = ell;
  drawPhasePortrait(r0, b, {ell, p: sign*pmag});
}

/* =========================================================
   DEMOSTRACIÓN DE INESTABILIDAD ORBITAL — 100% cálculo en vivo.
   Tres fotones casi idénticos (b=r0(1-δ), b=r0, b=r0(1+δ)) se integran con
   el MISMO RK4 de siempre, a pasos fijos (sin salida anticipada), y se mide
   su separación real paso a paso. No hay nada pre-animado ni pre-dibujado:
   si cambias r0 o δ, la curva de divergencia cambia porque se vuelve a
   integrar la ecuación, no porque se reescale un dibujo.
   ========================================================= */
let demoLines = [], demoMarkers = [];
let demoRunning = false;
function clearDemo(){
  for(const l of demoLines) l.dispose();
  for(const m of demoMarkers) m.dispose();
  demoLines = []; demoMarkers = [];
}
function runInstabilityDemo(){
  if (demoRunning || forming || toyRunning) return;
  demoRunning = true;
  const btn = document.getElementById("instabilityBtn");
  btn.disabled = true;
  clearDemo();

  const r0 = parseFloat(r0Input.value);
  const delta = 0.008;
  const ellObs = 6*r0;
  const steps = 3000;
  const dl = 0.02*r0;
  const bVals = [r0*(1-delta), r0, r0*(1+delta)];
  const tints = [new BABYLON.Color3(1.5,0.6,0.4), new BABYLON.Color3(1.6,1.6,1.6), new BABYLON.Color3(0.4,1.4,1.6)];

  const trajectories = bVals.map(b => integrateFixedSteps(r0, b, ellObs, steps, dl));
  const paths3D = trajectories.map(pts => pathTo3D(pts, r0));

  const fullLen = paths3D[0].length;
  for(let k=0;k<3;k++){
    // se crea ya con la longitud final fija (todos los puntos en el origen);
    // "instance" update exige mantener siempre el mismo numero de puntos,
    // asi que el crecimiento progresivo se logra revelando valores reales
    // en las primeras posiciones y repitiendo la ultima en el resto (invisible,
    // coincide consigo mismo) en vez de cambiar el tamaño del arreglo.
    const initPts = new Array(fullLen).fill(paths3D[k][0]);
    const line = BABYLON.MeshBuilder.CreateLines("demoLine"+k, {points:initPts, updatable:true}, scene);
    line.color = tints[k]; line.alpha = 0.95;
    demoLines.push(line);
    const marker = makeMarker(tints[k]);
    marker.position.copyFrom(paths3D[k][0]);
    demoMarkers.push(marker);
  }

  // separacion real entre la trayectoria (1-δ) y (1+δ), medida en el
  // encaje 3D exacto (distancia euclidiana entre los puntos ya calculados)
  const sep = [];
  for(let i=0;i<paths3D[0].length;i++){
    sep.push(BABYLON.Vector3.Distance(paths3D[0][i], paths3D[2][i]));
  }

  const duration = 6000;
  const t0 = performance.now();
  const chart = document.getElementById("divergenceChart");
  const cctx = chart.getContext("2d");
  const W=chart.width, H=chart.height, margin={l:34,r:8,t:8,b:16};
  const plotW=W-margin.l-margin.r, plotH=H-margin.t-margin.b;
  const sMin = Math.max(Math.min(...sep.filter(s=>s>0)), 1e-6);
  const sMax = Math.max(...sep);
  function Ylog(s){ const lo=Math.log10(sMin), hi=Math.log10(sMax); const t=(Math.log10(Math.max(s,sMin))-lo)/(hi-lo||1); return margin.t+(1-t)*plotH; }
  function Xi(i){ return margin.l + (i/(sep.length-1))*plotW; }

  cctx.clearRect(0,0,W,H);
  cctx.strokeStyle="rgba(255,255,255,0.18)"; cctx.lineWidth=1;
  cctx.beginPath(); cctx.moveTo(margin.l,margin.t); cctx.lineTo(margin.l,margin.t+plotH); cctx.lineTo(margin.l+plotW,margin.t+plotH); cctx.stroke();
  cctx.fillStyle="#8f96b3"; cctx.font="9px Consolas,monospace";
  cctx.fillText("separación (escala log)", margin.l+2, margin.t+9);
  cctx.fillText("λ →", margin.l+plotW-16, margin.t+plotH+14);

  function step(now){
    const t = Math.min((now-t0)/duration, 1);
    const idx = Math.min(Math.floor(t*(paths3D[0].length-1)), paths3D[0].length-1);

    for(let k=0;k<3;k++){
      demoMarkers[k].position.copyFrom(paths3D[k][idx]);
      const frame = new Array(fullLen);
      for(let i=0;i<fullLen;i++) frame[i] = paths3D[k][i<=idx ? i : idx];
      BABYLON.MeshBuilder.CreateLines("demoLine"+k, {points: frame, instance: demoLines[k]});
    }

    // dibuja el tramo nuevo de la curva de divergencia (progresivo, no de golpe)
    cctx.strokeStyle = "#ffab4d"; cctx.lineWidth = 1.8;
    cctx.beginPath();
    for(let i=0;i<=idx;i++){ const x=Xi(i), y=Ylog(sep[i]); i===0?cctx.moveTo(x,y):cctx.lineTo(x,y); }
    cctx.stroke();

    document.getElementById("demoStatus").textContent =
      `δ=${delta} · separación actual ≈ ${sep[idx].toExponential(2)} (unidades de r₀=${r0.toFixed(2)})`;

    if (t < 1){
      requestAnimationFrame(step);
    } else {
      demoRunning = false;
      btn.disabled = false;
      document.getElementById("demoStatus").textContent += "  — demo terminada, corre de nuevo cuando quieras";
    }
  }
  requestAnimationFrame(step);
}

/* =========================================================
   MODELO ILUSTRATIVO DE COLAPSO/INFLADO DEL AGUJERO DE GUSANO
   r0(t) = r0 * exp(±kappa*t): anima el signo REAL del resultado de la
   literatura (colapso vs inflación), con una tasa kappa ajustable que NO
   se deriva aquí de las ecuaciones de perturbación completas (ver aviso en
   la interfaz). Durante la animación se ocultan las geodésicas estáticas
   porque no describen correctamente esta dinámica transitoria; al terminar
   se restauran junto con el r0 real del deslizador.
   ========================================================= */
let toyRunning = false;
function runToyDynamics(direction){
  if (toyRunning || forming) return;
  toyRunning = true;
  collapseBtn.disabled = true; inflateBtn.disabled = true;
  for(const g of geoSlots) g.line.alpha = 0; // no describen la dinamica transitoria
  for(const g of geoSlots) g.marker.isVisible = false;

  const r0Start = parseFloat(r0Input.value);
  const kappa = parseFloat(kappaInput.value);
  const duration = 4500;
  const t0 = performance.now();
  const floor = 0.03, ceil = r0Start*5;

  function step(now){
    const t = (now-t0)/1000; // segundos reales, para que kappa tenga unidades claras
    let r0t = r0Start*Math.exp(direction*kappa*t);
    r0t = Math.min(Math.max(r0t, floor), ceil);
    const doneCollapse = direction<0 && r0t<=floor*1.01;
    const doneInflate = direction>0 && r0t>=ceil*0.99;

    const extentFrac = direction>0 ? Math.min(1, 0.3+0.15*t) : 1;
    buildWireframe(r0t, 1, extentFrac);
    drawDensityChart(r0t); // la curva de materia exotica se dispara/colapsa en vivo con r0(t)
    drawStabilityChart(r0t, parseFloat(bInput.value));

    const tau0t = 1/(8*Math.PI*r0t*r0t);
    const label = direction<0 ? "colapsando hacia un agujero negro" : "inflándose sin límite";
    document.getElementById("toyStatus").textContent =
      `[ilustrativo] r₀(t)=${r0t.toExponential(2)} · τ₀(t)=${tau0t.toExponential(2)} · ${label}…`;

    if (!doneCollapse && !doneInflate){
      requestAnimationFrame(step);
    } else {
      document.getElementById("toyStatus").textContent =
        direction<0
          ? "[ilustrativo] garganta cerrada — en la geometría real esto formaría un horizonte de sucesos"
          : "[ilustrativo] la hoja se infla sin límite — no queda garganta traversable";
      setTimeout(()=>{
        // restaurar al r0 real del deslizador, con geodesicas visibles otra vez
        const r0Real = parseFloat(r0Input.value);
        buildWireframe(r0Real, 1);
        ensureGeoSlots(r0Real, parseFloat(bInput.value), false);
        for(const g of geoSlots){ g.marker.isVisible = true; g.line.alpha = 0.9; }
        updateReadouts(r0Real, parseFloat(bInput.value), parseFloat(vInput.value), customGeo);
        invalidateLensTable();
        scheduleThroatView(r0Real, parseFloat(vInput.value));
        drawStabilityChart(r0Real, parseFloat(bInput.value));
        drawDensityChart(r0Real);
        document.getElementById("toyStatus").textContent += "  · geometría restaurada a r₀ del deslizador";
        toyRunning = false;
        collapseBtn.disabled = false; inflateBtn.disabled = false;
      }, 1400);
    }
  }
  requestAnimationFrame(step);
}

/* =========================================================
   ANIMACION: fotones viajando por sus geodesicas
   ========================================================= */
let frameCounter = 0;
scene.onBeforeRenderObservable.add(()=>{
  frameCounter += 1;
  for(const g of geoSlots){
    const len = g.path3D.length;
    if (len < 2) continue;
    const period = 2*(len-1);
    let m = (frameCounter*1.3) % period;
    const idx = m <= (len-1) ? m : period - m;
    g.marker.position.copyFrom(g.path3D[Math.floor(idx)]);
  }
  const t = performance.now()/1000;
  corePlane.scaling.setAll(1 + 0.15*Math.sin(t*2.5));
  coreMat.emissiveColor.set(0.7+0.1*Math.sin(t*3), 0.85, 1.2+0.15*Math.cos(t*2));

  // retrato de fase: mismo estado fisico que el marcador 3D, leido en vivo
  // (acopla el render 3D con esta grafica 2D en vez de ser algo aparte)
  if (frameCounter % 2 === 0) updatePhasePortraitLive();
});

/* =========================================================
   POST-PROCESADO
   ========================================================= */
const pipeline = new BABYLON.DefaultRenderingPipeline("pipe", true, scene, [camera]);
pipeline.bloomEnabled = true; pipeline.bloomThreshold = 0.32; pipeline.bloomWeight = 0.75; pipeline.bloomKernel = 56;
pipeline.fxaaEnabled = true;
pipeline.chromaticAberrationEnabled = true; pipeline.chromaticAberration.aberrationAmount = 7;
pipeline.grainEnabled = true; pipeline.grain.intensity = 5;
pipeline.imageProcessing.contrast = 1.2; pipeline.imageProcessing.exposure = 1.15;
pipeline.imageProcessing.vignetteEnabled = true; pipeline.imageProcessing.vignetteWeight = 3.2;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;

/* =========================================================
   VISTA 2D DEL EJE: LENTE GRAVITACIONAL + ABERRACION RELATIVISTA
   ========================================================= */
const SKY_SIZE = 256;
const universeBand = makeBandCanvas(SKY_SIZE);  // fuente del "anillo" (reflejado)
const universeWorld = makeWorldCanvas(SKY_SIZE); // "otro lado" (transmitido)

let lensTable = null, lensTableR0 = null;
function invalidateLensTable(){ lensTable = null; lensTableR0 = null; }
function ensureLensTable(r0){
  if (lensTable && lensTableR0 === r0) return lensTable;
  const ellObs = 5*r0, bMax = 3*r0, nSamples = 130;
  const table = [];
  for(let i=0;i<nSamples;i++){
    const b = (i/(nSamples-1))*bMax + 1e-3;
    const res = integrateGeodesicFast(r0, b, ellObs, 9000, 0.02*r0);
    table.push({b, deltaPhi: res.finalPhi, transmitted: res.transmitted});
  }
  lensTable = table; lensTableR0 = r0;
  return table;
}
function lensLookup(table, b){
  if (b<=table[0].b) return table[0];
  if (b>=table[table.length-1].b) return table[table.length-1];
  let lo=0, hi=table.length-1;
  while(hi-lo>1){ const mid=(lo+hi)>>1; if(table[mid].b<b) lo=mid; else hi=mid; }
  const a=table[lo], c=table[hi], t=(b-a.b)/(c.b-a.b);
  return { deltaPhi: a.deltaPhi+(c.deltaPhi-a.deltaPhi)*t, transmitted: t<0.5?a.transmitted:c.transmitted };
}
function clamp255(v){ return v<0?0:(v>255?255:v); }

function renderThroatFrame(r0, v, phasePx){
  const table = ensureLensTable(r0);
  const ellObs = 5*r0, rRefObs = rOf(ellObs, r0);
  const beta = v, gamma = 1/Math.sqrt(Math.max(1-beta*beta, 1e-6));
  const outCanvas = document.getElementById("throatView");
  const size = outCanvas.width;
  const outCtx = outCanvas.getContext("2d");
  const outImg = outCtx.createImageData(size,size);
  const cx=size/2, cy=size/2, R=size/2, thetaMax = 80*Math.PI/180;

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const dx=x-cx, dy=y-cy, rho=Math.sqrt(dx*dx+dy*dy);
      const idxOut=(y*size+x)*4;
      if (rho>R){ outImg.data[idxOut+3]=0; continue; }
      const psi = Math.atan2(dy,dx);
      const thetaTrav = (rho/R)*thetaMax;
      const cosTrav = Math.cos(thetaTrav);

      // aberracion relativista: angulo estatico equivalente
      let cosStatic = (cosTrav + beta) / (1 + beta*cosTrav);
      cosStatic = Math.min(1, Math.max(-1, cosStatic));
      const thetaStatic = Math.acos(cosStatic);
      const b = rRefObs*Math.sin(thetaStatic);

      const look = lensLookup(table, b);
      const psiOut = psi + look.deltaPhi;
      const src = look.transmitted ? universeWorld : universeBand;

      const delta = 1/(gamma*(1-beta*cosTrav));
      const boost = Math.min(Math.max(Math.pow(delta,3), 0.15), 3.2);
      const shift = Math.min(Math.max((delta-1)*0.5, -0.5), 0.5);

      const sx = Math.round(cx + rho*Math.cos(psiOut)*(src.width/size)) + Math.round(phasePx);
      const sy = Math.round(cy + rho*Math.sin(psiOut)*(src.height/size));
      const sxx = ((sx % src.width) + src.width) % src.width;
      const syy = ((sy % src.height) + src.height) % src.height;
      const idxSrc = (syy*src.width+sxx)*4;

      let rC=src.data[idxSrc], gC=src.data[idxSrc+1], bC=src.data[idxSrc+2];
      if (shift>0){ bC = bC*(1+shift*0.6); rC = rC*(1-shift*0.3); } // acercandose: azulado
      else { rC = rC*(1-shift*0.6); bC = bC*(1+shift*0.3); }       // alejandose: rojizo

      outImg.data[idxOut]   = clamp255(rC*boost);
      outImg.data[idxOut+1] = clamp255(gC*boost);
      outImg.data[idxOut+2] = clamp255(bC*boost);
      outImg.data[idxOut+3] = 255;
    }
  }
  outCtx.putImageData(outImg,0,0);
}

let throatViewTimer = null;
function scheduleThroatView(r0, v){
  clearTimeout(throatViewTimer);
  document.getElementById("lensWarn").textContent = "Calculando lente gravitacional…";
  throatViewTimer = setTimeout(()=>{
    renderThroatFrame(r0, v, animPhase);
    document.getElementById("lensWarn").textContent = "";
  }, 30);
}

let animPhase = 0, animTimer = null;
function startAnim(r0v, vv){
  stopAnim();
  animTimer = setInterval(()=>{
    animPhase += 3;
    const r0c = parseFloat(document.getElementById("r0").value);
    const vc = parseFloat(document.getElementById("vRatio").value);
    renderThroatFrame(r0c, vc, animPhase);
  }, 130);
}
function stopAnim(){ if(animTimer){ clearInterval(animTimer); animTimer=null; } }

/* =========================================================
   LECTURAS NUMÉRICAS
   ========================================================= */
function updateReadouts(r0, bRatio, v, customGeo){
  const tau0 = 1/(8*Math.PI*r0*r0);
  const gamma = 1/Math.sqrt(Math.max(1-v*v,1e-6));
  document.getElementById("readout").innerHTML = `
    <div><span>τ₀ (tensión en la garganta)</span><span>${tau0.toFixed(4)}</span></div>
    <div><span>ρ₀ (densidad de energía)</span><span>${(-tau0).toFixed(4)}</span></div>
    <div><span>b′(r₀) (flare-out, &lt;1)</span><span>−1.000 ✓</span></div>
    <div><span>Corrimiento gravitacional</span><span>nulo (Φ≡0)</span></div>
    <div><span>γ del viajero</span><span>${gamma.toFixed(3)}</span></div>
  `;
  const b = bRatio*r0;
  document.getElementById("photonReadout").innerHTML = `
    <div><span>Fotón de prueba, b</span><span>${b.toFixed(3)}</span></div>
    <div><span>Resultado</span><span>${customGeo.transmitted ? "TRANSMITIDO ✅" : "REFLEJADO 🔁"}</span></div>
    <div><span>Δφ total acumulado</span><span>${customGeo.finalPhi.toFixed(3)} rad</span></div>
  `;
}

/* =========================================================
   UI
   ========================================================= */
const r0Input = document.getElementById("r0");
const bInput = document.getElementById("bRatio");
const vInput = document.getElementById("vRatio");
const r0val = document.getElementById("r0val");
const bval = document.getElementById("bval");
const vval = document.getElementById("vval");
const cine = document.getElementById("cine");
const animLens = document.getElementById("animLens");

// Arrastrar el slider de r0 disparaba geodesicas RK4 de precision completa
// (hasta 15000 pasos x 6 fotones) en CADA evento "input" del slider -> eso
// es lo que se sentia entrecortado. Ahora: mientras arrastras, se usa RK4
// reducido (fast=true, igual de exacto en la forma, menos pasos) para que
// la rejilla y las geodesicas respondan al instante; cuando sueltas (o pasan
// 160ms sin mover el slider), se hace UNA pasada de precision completa.
let rebuildDebounceTimer = null;
function refresh(){
  const r0 = parseFloat(r0Input.value);
  const bRatio = parseFloat(bInput.value);
  const v = parseFloat(vInput.value);
  r0val.textContent = r0.toFixed(2);
  bval.textContent = bRatio.toFixed(2);
  vval.textContent = v.toFixed(2);

  buildWireframe(r0, 1);
  ensureGeoSlots(r0, bRatio, true);
  updateReadouts(r0, bRatio, v, customGeo);
  drawStabilityChart(r0, bRatio);
  drawDensityChart(r0);
  scheduleThroatView(r0, v); // ya tiene su propio debounce interno

  clearTimeout(rebuildDebounceTimer);
  rebuildDebounceTimer = setTimeout(()=>{
    ensureGeoSlots(r0, bRatio, false);
    updateReadouts(r0, bRatio, v, customGeo);
    renderSelfTests(r0);
  }, 160);
}
r0Input.addEventListener("input", refresh);
bInput.addEventListener("input", refresh);
vInput.addEventListener("input", refresh);
cine.addEventListener("change", ()=>{ camera.useAutoRotationBehavior = cine.checked; });
animLens.addEventListener("change", ()=>{ animLens.checked ? startAnim() : stopAnim(); });

// --- Formacion animada: r0(t) crece de ~0 a su valor objetivo y la rejilla
// se reconstruye cada frame evaluando r(ell)=sqrt(ell^2+r0(t)^2) en vivo.
// No hay fotogramas guardados: es la ecuacion evaluandose en tiempo real. ---
const formBtn = document.getElementById("formBtn");
const formStatus = document.getElementById("formStatus");
let forming = false;
function animateFormation(){
  if (forming || toyRunning) return;
  forming = true;
  formBtn.disabled = true;
  const targetR0 = parseFloat(r0Input.value);
  const targetBRatio = parseFloat(bInput.value);
  const duration = 5200;
  const t0 = performance.now();
  let frame = 0;

  // aseguramos que existan los slots de geodesicas antes de animar
  // (si es la primera vez, se crean ya en el r0 inicial de la animacion)
  if (geoSlots.length === 0) ensureGeoSlots(0.05, targetBRatio, true);

  const smooth = (x)=> x*x*(3-2*x);

  function step(now){
    frame += 1;
    const t = Math.min((now-t0)/duration, 1);

    // FASE 1 (0 -> 0.5 de t): la garganta se abre, r0 crece de casi 0 al objetivo.
    const p1 = smooth(Math.min(t/0.5, 1));
    const r0t = 0.03 + p1*(targetR0-0.03);

    // FASE 2 (0.22 -> 1 de t, solapada): la hoja asintoticamente plana se
    // despliega hacia afuera desde la garganta ya (parcialmente) formada.
    const p2 = smooth(Math.min(Math.max((t-0.22)/0.78, 0), 1));
    const extentFrac = 0.08 + 0.92*p2;
    const pulsePos = extentFrac*HMAX_L*r0t; // frente de onda viajero (indicador visual, no un termino fisico nuevo)

    const alphaGrid = 0.2 + 0.8*Math.min(p1, 1);
    buildWireframe(r0t, alphaGrid, extentFrac, pulsePos);

    // las geodesicas se re-resuelven con RK4 reducido cada pocos frames, con
    // un observador ellObs ligado a cuanto de la hoja ya existe: siguen
    // siendo la misma ecuacion exacta, solo evaluada con el r0(t) e ellObs(t)
    // de cada instante.
    if (frame % 4 === 0 || t >= 1){
      const fast = t < 1;
      const ellObsT = Math.max(2*r0t, 0.85*pulsePos);
      for(let i=0;i<FIXED_B_RATIOS.length;i++) updateGeodesicSlot(geoSlots[i], r0t, ellObsT, fast);
      customSlot.b = targetBRatio*r0t;
      updateGeodesicSlot(customSlot, r0t, ellObsT, fast);
      customGeo = customSlot;
      const alphaLine = 0.1 + 0.85*p2;
      for(const g of geoSlots) g.line.alpha = alphaLine;
      drawDensityChart(r0t);
      drawStabilityChart(r0t, targetBRatio);
    }

    const tau0t = 1/(8*Math.PI*r0t*r0t);
    const fase = p1<0.98 ? "abriendo la garganta (r₀ creciendo)" : "desplegando la hoja asintótica plana";
    formStatus.textContent = `r₀(t)=${r0t.toFixed(3)} · τ₀(t)=${tau0t.toFixed(3)} · ${fase}…`;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      formStatus.textContent = `Garganta formada: r₀ = ${targetR0.toFixed(2)} (secuencia de soluciones estáticas exactas, no una evolución dinámica de Einstein)`;
      forming = false;
      formBtn.disabled = false;
      updateReadouts(targetR0, targetBRatio, parseFloat(vInput.value), customGeo);
      invalidateLensTable();
      scheduleThroatView(targetR0, parseFloat(vInput.value));
      drawStabilityChart(targetR0, targetBRatio);
      drawDensityChart(targetR0);
    }
  }
  requestAnimationFrame(step);
}
formBtn.addEventListener("click", animateFormation);

const instabilityBtn = document.getElementById("instabilityBtn");
instabilityBtn.addEventListener("click", runInstabilityDemo);

const collapseBtn = document.getElementById("collapseBtn");
const inflateBtn = document.getElementById("inflateBtn");
const kappaInput = document.getElementById("kappaInput");
const kappaVal = document.getElementById("kappaVal");
kappaInput.addEventListener("input", ()=>{ kappaVal.textContent = parseFloat(kappaInput.value).toFixed(2); });
kappaVal.textContent = parseFloat(kappaInput.value).toFixed(2);
collapseBtn.addEventListener("click", ()=> runToyDynamics(-1));
inflateBtn.addEventListener("click", ()=> runToyDynamics(1));

// --- Reproducir una vista compartida desde ?r0=..&b=..&v=.. en la URL ---
(function applySharedParams(){
  const p = new URLSearchParams(window.location.search);
  if (p.has("r0")) r0Input.value = Math.min(Math.max(parseFloat(p.get("r0")), parseFloat(r0Input.min)), parseFloat(r0Input.max));
  if (p.has("b"))  bInput.value  = Math.min(Math.max(parseFloat(p.get("b")),  parseFloat(bInput.min)),  parseFloat(bInput.max));
  if (p.has("v"))  vInput.value  = Math.min(Math.max(parseFloat(p.get("v")),  parseFloat(vInput.min)),  parseFloat(vInput.max));
})();
refresh();

// --- Share View: genera un enlace exacto con los parametros actuales ---
const shareBtn = document.getElementById("shareBtn");
const shareLink = document.getElementById("shareLink");
const shareMsg = document.getElementById("shareMsg");
shareBtn.addEventListener("click", async ()=>{
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("r0", r0Input.value);
  url.searchParams.set("b", bInput.value);
  url.searchParams.set("v", vInput.value);
  const link = url.toString();
  shareLink.value = link;
  try{
    await navigator.clipboard.writeText(link);
    shareMsg.textContent = "Enlace copiado al portapapeles.";
  }catch(e){
    shareLink.select();
    shareMsg.textContent = "Copia el enlace manualmente (seleccionado).";
  }
});

// --- Renderizar las ecuaciones LaTeX con KaTeX ---
if (window.renderMathInElement){
  renderMathInElement(document.getElementById("ui"), {
    delimiters: [
      {left:"$$", right:"$$", display:true},
      {left:"$", right:"$", display:false}
    ],
    throwOnError:false
  });
}

engine.runRenderLoop(()=> scene.render());
window.addEventListener("resize", ()=> engine.resize());
} // fin de main()
main();
