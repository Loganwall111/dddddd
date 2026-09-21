# FLIP / WebGPU fluid engine (Aqua Lab)

The "extreme mode" of the Aqua Lab: a 3D grid Navier–Stokes solver running
entirely in **WGSL compute shaders** on the same `GPUDevice` as three's
`WebGPURenderer`, with a screen-space volume rendering pipeline built from
plain TSL fragment nodes.

## Files

| file | role |
| --- | --- |
| `shaders.ts` | 19 WGSL compute modules (pure strings, no three dependency) |
| `FlipEngine.ts` | raw-WebGPU engine driver: buffers, pipelines, dispatch, stats readback |
| `FlipRenderer.ts` | TSL screen-space pipeline: depth pass → volume pass → bilateral blur ×2 → composite |

## Physics

- **Grid** — staggered **MAC** lattice, cubic `n × n × n` (default 96³,
  clamped 24–128), `h = 120/n` m over the 120 m world (y −20…100).
  u/v/w on the three face families; divergence, pressure and densities
  cell-centered. All grid data in one SoA storage buffer.
- **Transport** — hybrid **FLIP/PIC**: semi-Lagrangian grid advection
  (per-axis constant kernels), then `v_new = v_grid + flipRatio·(v_old − v_grid_old)`
  per particle, plus a PIC impulse splat that pushes the grid.
- **Pressure** — **red-black Gauss-Seidel** (1–48 iterations, default 20)
  with Neumann clamped boundaries, followed by a staggered gradient
  projection.
- **Forces** — gravity weighted by fluid density, steam lift, wind drag,
  curl (2-component approximation) vorticity confinement, gravity wells,
  vortices and black holes (the lab's field objects), up to 16 rigid-body
  sphere collisions, analytic terrain sliding (bilinear height +
  finite-difference normal), signed world bounds.
- **Phases** — particle temperature in `vel.w`: water ≥100 °C → steam
  (buoyant), ≤0 °C → ice (damped, melts >0 °C); oil cools only; lava (id 4)
  cools extremely slowly and never phases.
- **Particles** — up to 262 144, one storage buffer
  `[pos xyz, fluidId | vel xyz, temp]`.

## Frame

One command encoder, one submit: `u0/v0/w0 ← u/v/w` copies, then a single
compute pass dispatching 19 kernels (clear → splatDensity → advect ×3 →
forces ×3 → pic → divergence → red/black ×N → project → flip →
advectParticles → splatRender → uploadFluid → statsA → statsB).
Stats (max/mean speed, alive) come back through a 12-byte mapAsync buffer.

## Rendering (`FlipRenderer`)

Explicitly ordered fullscreen passes (no `PassNode` ordering assumptions):

1. **scene** → `sceneRT` (HalfFloat color + `depth32float` — the only
   sampleable depth format in WebGPU). This is the **depth pass**.
2. **fluid** — per-pixel ray-surface search (40-slice min/max fold) through
   the 3D fluid texture to find the front/back of the fluid slab along the
   view ray; Beer–Lambert coverage + premultiplied color
   (water blue / ice white-blue / lava-heat glow).
3. **bilateral blur H → V** — 9-tap Gaussian with alpha edge-stopping;
   removes particle splat bumps.
4. **composite** — transparent **refraction** (UV offset from the blurred
   coverage gradient), depth-based **light extinction** of the background
   behind the slab, **Fresnel** rim `pow(1 − |Nz|/|N|, p)` from
   depth-derived normals, procedural sky. → canvas.

Fluid channels in the 3D `rgba32float` texture: R = body density,
G = heat tint, B = cold/ice/steam body, A = camera-depth-weighted splat.

## Integration

`AquaWorld.setEngine("flip")` is **one-way per session**: a canvas can only
ever hold one context type, so a fresh canvas is created for the WebGPU
renderer and the WebGL context is released. `three/webgpu` + `three/tsl`
load lazily on first FLIP entry. In FLIP mode the WebGL-only visuals
(ShaderMaterial ocean/sky/fields, SPH points) are hidden, the terrain
material is swapped to a plain `MeshStandardMaterial` clone (the original
uses `onBeforeCompile`), and city buildings become visual-only (the particle
kernel collides against terrain + dynamic rigid bodies + fields).

## Verification status

- `tsc --noEmit` — 0 errors (WebGPU ambient types in `src/types/webgpu.d.ts`).
- WGSL structural lint — 19/19 modules balanced, `@compute` present.
- SPH regression (`aqua-simcheck.mts`) — 18/18 (unchanged).
- The GPU path itself cannot be exercised in the sandbox (no headless
  WebGPU); run the lab at `/#aqua`, pick **FLIP · WebGPU**, and check the
  event log + telemetry (particles / max V should light up).
