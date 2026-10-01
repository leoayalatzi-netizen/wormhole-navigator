# Wormhole Navigator — Exact GR Ray-Tracer

Simulador interactivo de un agujero de gusano de **Morris–Thorne / Ellis**
(1973/1988): la solución traversable más simple conocida de las ecuaciones
de campo de Einstein. Corre 100% en el navegador — sin servidor, sin
backend, sin GPU dedicada.

**⚠️ Es teórico.** Esta geometría requiere "materia exótica" que viola la
condición de energía nula (NEC), nunca observada experimentalmente. El
proyecto lo dice explícitamente en la interfaz: es una simulación, no una
predicción de que estos objetos existan.

## Cómo correrlo

No requiere instalación ni build:

1. Descomprime el zip.
2. Abre `index.html` directamente en el navegador (doble clic) **o** sírvelo
   con cualquier servidor estático (`python3 -m http.server`, extensión
   "Live Server" de VS Code, etc. — ambas formas funcionan igual).
3. Necesitas conexión a internet la primera vez, porque Babylon.js y KaTeX
   se cargan desde CDN (no están vendorizados en este zip).

También se incluye `wormhole_relatividad_standalone.html`: la misma
simulación completa en un único archivo HTML, como respaldo garantizado si
algo en la versión modular no cargara en tu entorno.

## Qué hay adentro (arquitectura)

```
index.html          estructura y controles de la interfaz
css/style.css        estilos
js/physics.js         núcleo matemático PURO — sin Babylon, sin DOM.
                      Encaje isométrico exacto, geodésicas nulas (RK4).
                      Se puede leer y auditar de forma aislada.
js/textures.js        texturas procedurales (canvas / DynamicTexture)
js/verify.js          suite de auto-verificación física (ver abajo)
js/app.js             escena Babylon.js + interfaz, usa lo anterior
```

`physics.js` se separó deliberadamente de todo lo demás: es el archivo que
un jurado o un profesor de Relatividad General puede leer sin tener que
entender Babylon.js, y contiene *exactamente* las ecuaciones documentadas
abajo, sin adornos.

## Física implementada

**Métrica exacta** (Φ≡0, sin corrimiento al rojo gravitacional):

```
ds² = −dt² + dℓ² + r(ℓ)² dΩ²,      r(ℓ) = √(ℓ² + r₀²)
```

**Encaje isométrico exacto** en ℝ³ (la rejilla 3D es este encaje literal,
no una ilustración):

```
h(ℓ) = r₀·asinh(ℓ/r₀)   ⟺   r = r₀·cosh(h/r₀)      (un catenoide)
```

**Materia exótica** (ecuaciones de Einstein, G=c=1), forma de Ellis
`b(r) = r₀²/r`:

```
ρ(ℓ) = −r₀² / (8π r(ℓ)⁴)          τ₀ = 1 / (8π r₀²)      (Morris–Thorne 1988)
```

**Geodésicas nulas** (fotón, E=1, L=b), integradas con Runge–Kutta 4:

```
d²ℓ/dλ² = L² r'(ℓ) / r(ℓ)³        dφ/dλ = L / r(ℓ)²
```

`b < r₀` ⇒ el fotón cruza al otro lado (transmisión).
`b > r₀` ⇒ rebota por la barrera centrífuga `L²/r(ℓ)²` (reflexión).

**Aberración relativista y efecto Doppler** del viajero (v/c):

```
cos θ_estático = (cos θ_viajero + v) / (1 + v·cos θ_viajero)
δ = 1 / [γ(1 − v·cos θ)]              brillo ∝ δ³
```

**Inestabilidad orbital** (100% calculada en vivo): el potencial efectivo
`V_eff(ℓ) = L²/r(ℓ)²` tiene un máximo en la garganta — un equilibrio
inestable, como la esfera de fotones de un agujero negro. El simulador lo
demuestra lanzando fotones con `b = r₀(1±δ)` y midiendo su divergencia real.

**Inestabilidad de la geometría completa** (citada de la literatura, no
calculada en vivo — ver sección "Alcance y limitaciones"): el agujero de
gusano de Ellis es linealmente inestable ante perturbaciones de la métrica;
colapsa a un agujero negro de Schwarzschild o se infla, según el signo de
la perturbación.

## Auto-verificación física (`verify.js`)

En vez de solo afirmar que la física es correcta, el simulador la
**verifica en vivo** cada vez que cambias r₀, recalculando identidades
exactas desde cero:

- Flare-out: `b′(r₀) = −1`
- Masa ADM → 0
- Encaje isométrico: `r′² + h′² = 1`
- Ecuación de estado: `τ(ℓ) = −ρ(ℓ)`
- Conservación de la condición nula: `E² = 1` a lo largo de la geodésica

Si alguna de estas pruebas fallara (por ejemplo, al modificar `physics.js`
y romper algo sin darse cuenta), el panel de la interfaz lo mostraría en
rojo de inmediato.

## Alcance y limitaciones (honestidad científica)

- Es una solución **estática y exacta**. La animación de "formación de la
  garganta" es una secuencia de soluciones estáticas distintas mostradas en
  sucesión — **no** es una evolución dinámica resuelta de las ecuaciones de
  Einstein.
- El modelo de "colapso/inflado" (`r₀(t) = r₀·e^{±κt}`) es **explícitamente
  ilustrativo**: el signo del comportamiento es el resultado real citado
  abajo, pero la tasa κ es ajustable por el usuario, no derivada aquí de
  las ecuaciones de perturbación completas (un problema de investigación
  activo, ver referencias).
- El corrimiento de color por efecto Doppler en la vista del eje es una
  aproximación visual (RGB), no un cálculo espectral exacto.

## Referencias

- Ellis, H. G. (1973). *Ether flow through a drainhole: A particle model in
  general relativity*. J. Math. Phys. 14, 104.
- Morris, M. S. & Thorne, K. S. (1988). *Wormholes in spacetime and their
  use for interstellar travel*. Am. J. Phys. 56, 395.
- Visser, M. (1995). *Lorentzian Wormholes: From Einstein to Hawking*.
  AIP Press.
- González, J. A., Guzmán, F. S. & Sarbach, O. (2009). *Instability of
  wormholes supported by a ghost scalar field*, Class. Quantum Grav. 26.
- Cremona, F., Pizzocchero, L. & Sarbach, O. (2020). *Effective potentials
  arising from a singularity-free master equation for wormhole
  perturbations*.

## Stack técnico

Babylon.js + WebGL2 (con intento de WebGPU nativo y *fallback* automático
si el navegador no lo soporta) para el render 3D; integración numérica RK4
en JavaScript puro para las geodésicas; Canvas 2D para la lente
gravitacional y las gráficas de estabilidad; KaTeX para las ecuaciones.
100% en el navegador.

## Licencia

MIT — ver `LICENSE`.
