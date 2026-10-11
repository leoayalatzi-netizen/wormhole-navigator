// physics.js — Núcleo matemático puro (sin DOM, sin Babylon salvo BABYLON.Vector3
// para el resultado final de pathTo3D). Ecuaciones exactas del agujero de gusano
// de Ellis/Morris-Thorne: encaje isométrico, geodésicas nulas (RK4).
// Este archivo es intencionalmente independiente del render: se puede leer,
// auditar y probar (ver verify.js) sin tocar Babylon.js en absoluto.

function rOf(ell, r0){ return Math.sqrt(ell*ell + r0*r0); }
function hOf(ell, r0){ return r0*Math.asinh(ell/r0); }

function geoDeriv(state, r0, L){
  const ell = state[0], pell = state[1];
  const r = rOf(ell, r0);
  const rp = ell / r;
  return [pell, (L*L)*rp/(r*r*r), L/(r*r)];
}
function rk4(state, r0, L, dl){
  const k1 = geoDeriv(state, r0, L);
  const s2 = [state[0]+dl/2*k1[0], state[1]+dl/2*k1[1], state[2]+dl/2*k1[2]];
  const k2 = geoDeriv(s2, r0, L);
  const s3 = [state[0]+dl/2*k2[0], state[1]+dl/2*k2[1], state[2]+dl/2*k2[2]];
  const k3 = geoDeriv(s3, r0, L);
  const s4 = [state[0]+dl*k3[0], state[1]+dl*k3[1], state[2]+dl*k3[2]];
  const k4 = geoDeriv(s4, r0, L);
  return [
    state[0] + dl/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]),
    state[1] + dl/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]),
    state[2] + dl/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2])
  ];
}
function integrateGeodesicFull(r0, b, ellObs, maxSteps, dl){
  const r_start = rOf(-ellObs, r0);
  const pell0 = Math.sqrt(Math.max(1 - (b*b)/(r_start*r_start), 1e-9));
  let state = [-ellObs, pell0, 0];
  const pts = [{ell:state[0], phi:state[2]}];
  let transmitted = null;
  for(let i=0;i<maxSteps;i++){
    state = rk4(state, r0, b, dl);
    pts.push({ell:state[0], phi:state[2]});
    if (state[0] >= ellObs){ transmitted = true; break; }
    if (state[0] <= -ellObs && i>20){ transmitted = false; break; }
  }
  if (transmitted === null) transmitted = state[0] > 0;
  return { pts, transmitted, finalPhi: state[2] };
}
function integrateGeodesicFast(r0, b, ellObs, maxSteps, dl){
  const r_start = rOf(-ellObs, r0);
  const pell0 = Math.sqrt(Math.max(1 - (b*b)/(r_start*r_start), 1e-9));
  let state = [-ellObs, pell0, 0];
  let transmitted = null;
  for(let i=0;i<maxSteps;i++){
    state = rk4(state, r0, b, dl);
    if (state[0] >= ellObs){ transmitted = true; break; }
    if (state[0] <= -ellObs && i>20){ transmitted = false; break; }
  }
  if (transmitted === null) transmitted = state[0] > 0;
  return { transmitted, finalPhi: state[2] };
}
// Integra SIEMPRE el mismo numero de pasos (sin salir antes al transmitir o
// reflejar): necesario para comparar dos trayectorias vecinas paso a paso y
// medir su separacion real en funcion de lambda (demostracion de inestabilidad).
function integrateFixedSteps(r0, b, ellObs, steps, dl){
  const r_start = rOf(-ellObs, r0);
  const pell0 = Math.sqrt(Math.max(1 - (b*b)/(r_start*r_start), 1e-9));
  let state = [-ellObs, pell0, 0];
  const out = [{ell:state[0], phi:state[2]}];
  for(let i=0;i<steps;i++){
    state = rk4(state, r0, b, dl);
    out.push({ell:state[0], phi:state[2]});
  }
  return out;
}
function resamplePath(pts, maxPoints){
  if (pts.length <= maxPoints) return pts;
  const out = [];
  for(let i=0;i<maxPoints;i++) out.push(pts[Math.floor(i*(pts.length-1)/(maxPoints-1))]);
  return out;
}
// Remuestrea SIEMPRE a exactamente N puntos (interpolando ell,phi), para poder
// actualizar una LinesMesh existente in situ ("instance") en vez de recrearla
// cada frame: eso es lo que permite animar la formacion sin que se vea "congelada".
function resampleFixed(pts, N){
  const out = [], last = pts.length-1;
  for(let i=0;i<N;i++){
    const pos = i*last/(N-1);
    const i0 = Math.floor(pos), i1 = Math.min(i0+1, last);
    const t = pos - i0;
    out.push({ ell: pts[i0].ell + (pts[i1].ell-pts[i0].ell)*t,
               phi: pts[i0].phi + (pts[i1].phi-pts[i0].phi)*t });
  }
  return out;
}
function pathTo3D(pts, r0){
  return pts.map(p=>{
    const r = rOf(p.ell, r0), h = hOf(p.ell, r0);
    return new BABYLON.Vector3(r*Math.cos(p.phi), h, r*Math.sin(p.phi));
  });
}
