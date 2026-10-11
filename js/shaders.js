// shaders.js — Lente gravitacional calculada EN GPU, por píxel, en vivo.
//
// Antes: una tabla de 130 muestras de Δφ(b) se precomputaba en CPU
// (integrateGeodesicFast) y la imagen se armaba interpolando esa tabla.
// Ahora: cada píxel del canvas resuelve su PROPIA integración RK4 completa
// de la ecuación geodésica real — la misma de physics.js — directamente en
// el fragment shader, sin tabla ni interpolación de por medio.
//
// Con *fallback* automático: si WebGL o el shader no inicializan por
// cualquier razón, initGpuLens devuelve null y app.js sigue usando la
// versión CPU (renderThroatFrame), que queda intacta como respaldo.

const LENS_VERTEX_SHADER = `
precision highp float;
attribute vec2 position;
varying vec2 vUV;
const vec2 madd = vec2(0.5, 0.5);
void main(void) {
  vUV = position * madd + madd;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const LENS_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float r0;
uniform float ellObs;
uniform float travelerV;
uniform float phaseShift;

// --- Misma geometria exacta que physics.js: r(ell) = sqrt(ell^2+r0^2) ---
float rOf(float ell){ return sqrt(ell*ell + r0*r0); }

// --- Misma ecuacion de geodesicas nulas que physics.js:
//     d^2(ell)/dlambda^2 = L^2 r'(ell) / r(ell)^3,   dphi/dlambda = L/r(ell)^2 ---
void geoDeriv(float ell, float pell, float L, out float dell, out float dpell){
  float r = rOf(ell);
  float rp = ell / r;
  dell = pell;
  dpell = (L*L) * rp / (r*r*r);
}

// Integra con RK4 a pasos fijos desde ell=-ellObs hasta que el foton cruza
// a +ellObs (transmitido) o regresa a -ellObs (reflejado). Devuelve
// (phi_total, transmitido 0/1).
vec2 integrateGeodesic(float b){
  float ell = -ellObs;
  float rStart = rOf(ell);
  float pell = sqrt(max(1.0 - (b*b)/(rStart*rStart), 1e-6));
  float phi = 0.0;
  const int STEPS = 70;
  float dl = (2.4*ellObs) / float(STEPS);
  float transmitted = -1.0;
  for (int i = 0; i < STEPS; i++){
    float k1e, k1p; geoDeriv(ell, pell, b, k1e, k1p);
    float k2e, k2p; geoDeriv(ell+0.5*dl*k1e, pell+0.5*dl*k1p, b, k2e, k2p);
    float k3e, k3p; geoDeriv(ell+0.5*dl*k2e, pell+0.5*dl*k2p, b, k3e, k3p);
    float k4e, k4p; geoDeriv(ell+dl*k3e, pell+dl*k3p, b, k4e, k4p);
    ell  += dl/6.0*(k1e+2.0*k2e+2.0*k3e+k4e);
    pell += dl/6.0*(k1p+2.0*k2p+2.0*k3p+k4p);
    float r = rOf(ell);
    phi += (b/(r*r)) * dl;
    if (transmitted < 0.0 && ell >= ellObs)  transmitted = 1.0;
    if (transmitted < 0.0 && ell <= -ellObs) transmitted = 0.0;
  }
  if (transmitted < 0.0) transmitted = (ell > 0.0) ? 1.0 : 0.0;
  return vec2(phi, transmitted);
}

// --- Estrellas y "universos" procedurales (sin texturas externas) ---
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
vec3 starfield(vec2 uv, vec3 tint){
  vec2 g = floor(uv*46.0);
  float h = hash21(g);
  float s = step(0.986, h) * (0.4 + 0.9*hash21(g+13.1));
  return tint*0.03 + tint*s*1.6;
}
vec3 bandUniverse(vec2 uv){
  vec3 col = starfield(uv, vec3(1.0,0.68,0.32));
  float band = 1.0 - smoothstep(0.0, 0.07, abs(fract(uv.y*2.6+0.5)-0.5));
  col += vec3(0.85,0.92,1.0)*band*0.9;
  return col;
}
vec3 worldUniverse(vec2 uv){
  return starfield(uv, vec3(0.45,0.75,0.55)) + starfield(uv*1.7+3.1, vec3(0.5,0.35,0.65))*0.6;
}

void main(void){
  vec2 p = (vUV - 0.5) * 2.0;
  float rho = length(p);
  if (rho > 1.0){ gl_FragColor = vec4(0.0); return; }

  float psi = atan(p.y, p.x);
  float thetaMax = radians(80.0);
  float thetaTrav = rho*thetaMax;
  float cosTrav = cos(thetaTrav);

  // Aberracion relativista (misma formula que la version CPU):
  float beta = travelerV;
  float cosStatic = clamp((cosTrav+beta)/(1.0+beta*cosTrav), -1.0, 1.0);
  float thetaStatic = acos(cosStatic);
  float rRef = rOf(ellObs);
  float b = rRef * sin(thetaStatic);

  // *** Aqui esta el cambio central: esto se resuelve por pixel, en vivo ***
  vec2 res = integrateGeodesic(b);
  float psiOut = psi + res.x + phaseShift;
  vec2 uv2 = vec2(cos(psiOut), sin(psiOut)) * rho;

  // Doppler / beaming relativista (misma formula que la version CPU):
  float gamma = 1.0/sqrt(max(1.0-beta*beta, 1e-6));
  float delta = 1.0/(gamma*(1.0-beta*cosTrav));
  float boost = clamp(pow(delta,3.0), 0.15, 3.2);
  float shift = clamp((delta-1.0)*0.5, -0.5, 0.5);

  vec3 col = (res.y > 0.5) ? worldUniverse(uv2) : bandUniverse(uv2);
  if (shift > 0.0) { col.b *= (1.0+shift*0.6); col.r *= (1.0-shift*0.3); }
  else             { col.r *= (1.0-shift*0.6); col.b *= (1.0+shift*0.3); }
  col *= boost;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Intenta inicializar el lente en GPU sobre el canvas dado (su propio motor
// Babylon independiente, separado de la escena 3D principal). Devuelve
// {render(r0,v,phasePx)} si tuvo éxito, o null si algo falló — en cuyo caso
// app.js debe seguir usando la versión CPU (renderThroatFrame) intacta.
function initGpuLens(canvasId){
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.BABYLON) return null;

    const engine2 = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:false, antialias:false}, true);
    const scene2 = new BABYLON.Scene(engine2);
    scene2.autoClear = true;
    const camera2 = new BABYLON.FreeCamera("lensCam", new BABYLON.Vector3(0,0,-1), scene2);
    scene2.activeCamera = camera2;

    const shaderName = "wormholeLens";
    BABYLON.Effect.ShadersStore[shaderName + "VertexShader"] = LENS_VERTEX_SHADER;
    BABYLON.Effect.ShadersStore[shaderName + "FragmentShader"] = LENS_FRAGMENT_SHADER;

    const pp = new BABYLON.PostProcess(
      "wormholeLensPP", shaderName,
      ["r0", "ellObs", "travelerV", "phaseShift"],
      null, 1.0, camera2
    );

    const uniforms = { r0: 1, ellObs: 5, travelerV: 0, phaseShift: 0 };
    pp.onApply = function(effect){
      effect.setFloat("r0", uniforms.r0);
      effect.setFloat("ellObs", uniforms.ellObs);
      effect.setFloat("travelerV", uniforms.travelerV);
      effect.setFloat("phaseShift", uniforms.phaseShift);
    };

    scene2.render(); // primera pasada de prueba

    return {
      render(r0, v, phasePx){
        uniforms.r0 = r0;
        uniforms.ellObs = 5*r0;
        uniforms.travelerV = v;
        uniforms.phaseShift = (phasePx || 0) * 0.02;
        scene2.render();
      }
    };
  } catch (e) {
    console.warn("Lente GPU no disponible, usando respaldo en CPU:", e);
    return null;
  }
}
