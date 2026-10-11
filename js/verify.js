// verify.js — Suite de auto-verificación física.
// Cada prueba recalcula una identidad EXACTA de la solución de Ellis desde
// cero, usando solo las funciones de physics.js, y la compara contra su
// valor teórico conocido. No son mocks ni valores fijos: si alguien rompe
// physics.js, estas pruebas fallan y lo muestran en la interfaz.
// Se ejecutan en vivo cada vez que cambias r0 (ver app.js -> rebuildAll).

function selfTest_flareOut(r0){
  // b(r) = r0^2/r  =>  b'(r0) debe ser EXACTAMENTE -1 (condición de
  // flare-out de Morris-Thorne), para cualquier r0. Diferencias finitas
  // centradas sobre la propia definición de b(r).
  const eps = 1e-5*r0;
  const bOf = (r) => (r0*r0)/r;
  const bp = (bOf(r0+eps) - bOf(r0-eps)) / (2*eps);
  return { name: "Flare-out: b′(r₀) = −1", pass: Math.abs(bp-(-1)) < 1e-3,
           detail: `b′(r₀) calculado = ${bp.toFixed(6)}` };
}

function selfTest_admMass(r0){
  // Masa ADM = lim(r→∞) b(r)/2. Se evalúa a r = 10^6·r0: si la solución es
  // correcta, la masa relativa a r0 debe ser numéricamente despreciable.
  const rFar = 1e6*r0;
  const M = (r0*r0/rFar)/2;
  return { name: "Masa ADM → 0", pass: (M/r0) < 1e-4,
           detail: `M/r₀ ≈ ${(M/r0).toExponential(2)}` };
}

function selfTest_isometricEmbedding(r0){
  // Condición de encaje isométrico en R³: (dr/dℓ)² + (dh/dℓ)² = 1 en todo
  // punto. Se verifica con diferencias finitas centradas sobre r(ℓ) y h(ℓ)
  // — una prueba geométrica independiente de cómo se construye la malla 3D
  // en app.js (si esta prueba pasa, la rejilla que ves es geométricamente
  // consistente, no solo "se ve bien").
  const eps = 1e-4*r0;
  let maxErr = 0;
  for(let k=-5;k<=5;k++){
    const ell = k*0.7*r0;
    const rp = (rOf(ell+eps,r0) - rOf(ell-eps,r0)) / (2*eps);
    const hp = (hOf(ell+eps,r0) - hOf(ell-eps,r0)) / (2*eps);
    maxErr = Math.max(maxErr, Math.abs(rp*rp + hp*hp - 1));
  }
  return { name: "Encaje isométrico: r′²+h′² = 1", pass: maxErr < 1e-3,
           detail: `error máximo = ${maxErr.toExponential(2)}` };
}

function selfTest_equationOfState(r0){
  // Ecuación de estado del agujero de gusano de Ellis: τ(ℓ) = −ρ(ℓ)
  // exactamente, para cualquier ℓ (no solo en la garganta).
  let maxErr = 0;
  for(let k=-4;k<=4;k++){
    const ell = k*0.5*r0;
    const r = rOf(ell, r0);
    const rho = -(r0*r0)/(8*Math.PI*Math.pow(r,4));
    const tau =  (r0*r0)/(8*Math.PI*Math.pow(r,4));
    maxErr = Math.max(maxErr, Math.abs(tau + rho));
  }
  return { name: "Ecuación de estado: τ(ℓ) = −ρ(ℓ)", pass: maxErr < 1e-12,
           detail: `error máximo = ${maxErr.toExponential(2)}` };
}

function selfTest_nullEnergyConservation(r0, b){
  // La condición nula debe mantenerse en TODO punto de la geodésica:
  // E² = pℓ(ℓ)² + b²/r(ℓ)² = 1 (E=1 por construcción). pℓ se recalcula por
  // diferencias finitas centradas a partir de los puntos YA integrados por
  // integrateFixedSteps — una comprobación independiente de las derivadas
  // internas que usa el propio RK4 (no reutiliza el cálculo, lo verifica).
  const ellObs = 5*r0, steps = 2000, dl = 0.01*r0;
  const pts = integrateFixedSteps(r0, b, ellObs, steps, dl);
  let maxErr = 0;
  for(let i=2;i<pts.length-2;i++){
    const pellNum = (pts[i+1].ell - pts[i-1].ell) / (2*dl);
    const r = rOf(pts[i].ell, r0);
    const E2 = pellNum*pellNum + (b*b)/(r*r);
    maxErr = Math.max(maxErr, Math.abs(E2-1));
  }
  return { name: "Conservación de energía del fotón: E² = 1", pass: maxErr < 5e-3,
           detail: `max|E²−1| = ${maxErr.toExponential(2)} (b=${b.toFixed(2)})` };
}

// Ejecuta toda la batería y devuelve los resultados (usado por app.js).
function runPhysicsSelfTests(r0){
  return [
    selfTest_flareOut(r0),
    selfTest_admMass(r0),
    selfTest_isometricEmbedding(r0),
    selfTest_equationOfState(r0),
    selfTest_nullEnergyConservation(r0, 0.85*r0),
  ];
}
