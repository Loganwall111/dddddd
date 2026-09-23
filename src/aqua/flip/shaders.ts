// WGSL compute shaders for the 3D FLIP/PIC fluid engine (WebGPU).
//
// Grid: staggered MAC lattice, cubic cells, n x n x n fluid cells.
//   u (x-velocity) lives on x-faces: (n+1) x n   x n
//   v (y-velocity) lives on y-faces: n   x (n+1) x n
//   w (z-velocity) lives on z-faces: n   x n   x (n+1)
//   divergence / pressure / densities / render accumulators: cell-centered n^3.
//
// All grid data lives in ONE storage buffer (SoA sub-ranges, see GridOffsets).
// Particles live in ONE storage buffer: pos(P*vec4) | vel(P*vec4, w=temp) | prevVel(P*vec4).
// Render target: 3D texture rgba32f (R water, G heat, B steam, A ray-depth).
//
// Pass order per frame (one compute pass):
//   clear -> splatDensity -> advectGrid(u,v,w) -> forces(u,v,w) -> pic -> divergence
//   -> pressureRed/Black xN -> project -> flipVel -> advectParticles
//   -> splatRender -> uploadFluid -> statsA -> statsB

export const MAX_PARTICLES = 262144;
export const MAX_BODIES = 16;
export const MAX_FIELDS = 8;
export const MAX_WORKGROUPS = Math.ceil(MAX_PARTICLES / 128);

const COMMON = /* wgsl */ `
struct FrameParams {
  dt: f32, time: f32, n: f32, h: f32,
  originX: f32, originY: f32, originZ: f32,
  gravityX: f32, gravityY: f32, gravityZ: f32,
  windX: f32, windY: f32, windZ: f32, windDrag: f32,
  buoyancy: f32, steamLift: f32, damping: f32,
  flipRatio: f32, vorticity: f32,
  particleCount: u32,
  camX: f32, camY: f32, camZ: f32, ambientC: f32,
};
struct Body { x: f32, y: f32, z: f32, radius: f32, vx: f32, vy: f32, vz: f32, pad: f32 };
struct Well { x: f32, y: f32, z: f32, radius: f32, strength: f32, softening: f32, pad0: f32, pad1: f32 };
struct Vortex { x: f32, y: f32, z: f32, radius: f32, swirl: f32, inward: f32, vertical: f32, axisY: f32 };
struct Hole { x: f32, y: f32, z: f32, mass: f32, horizon: f32, pad0: f32, pad1: f32, pad2: f32 };
struct GridOffsets {
  offU: u32, offV: u32, offW: u32, offU0: u32, offV0: u32, offW0: u32,
  offDiv: u32, offP: u32, offDensW: u32, offDensS: u32,
  offR: u32, offG: u32, offB: u32, offA: u32,
  n: u32, nxU: u32, nyU: u32, nzV: u32,
  pad0: u32, pad1: u32, pad2: u32,
};

fn cidx(i: u32, j: u32, k: u32, nx: u32, ny: u32, nz: u32) -> u32 {
  return (j * nz + k) * nx + i;
}

fn terrainHeight(t: array<f32>, nx: u32, nz: u32, x: f32, z: f32, originX: f32, originZ: f32, h: f32) -> f32 {
  let gx = clamp((x - originX) / h - 0.5, 0.0, f32(nx) - 1.0);
  let gz = clamp((z - originZ) / h - 0.5, 0.0, f32(nz) - 1.0);
  let i0 = u32(gx);
  let j0 = u32(gz);
  let fx = gx - f32(i0);
  let fz = gz - f32(j0);
  let i1 = min(i0 + 1u, nx - 1u);
  let j1 = min(j0 + 1u, nz - 1u);
  let a = t[j0 * nx + i0];
  let b = t[j0 * nx + i1];
  let c = t[j1 * nx + i0];
  let d = t[j1 * nx + i1];
  return mix(mix(a, b, fx), mix(c, d, fx), fz);
}

// Trilinear MAC sample. axis: 0=u (x-faces), 1=v (y-faces), 2=w (z-faces).
fn macSample(g: array<f32>, off: u32, axis: u32, wpos: vec3<f32>, p: FrameParams, go: GridOffsets) -> f32 {
  let gx = (wpos.x - p.originX) / p.h;
  let gy = (wpos.y - p.originY) / p.h;
  let gz = (wpos.z - p.originZ) / p.h;
  var cx: f32;
  var cy: f32;
  var cz: f32;
  var nnx: u32;
  var nny: u32;
  var nnz: u32;
  if (axis == 0u) { cx = gx; cy = gy - 0.5; cz = gz - 0.5; nnx = go.nxU; nny = go.n; nnz = go.n; }
  else if (axis == 1u) { cx = gx - 0.5; cy = gy; cz = gz - 0.5; nnx = go.n; nny = go.nyU; nnz = go.n; }
  else { cx = gx - 0.5; cy = gy - 0.5; cz = gz; nnx = go.n; nny = go.n; nnz = go.nzV; }
  cx = clamp(cx, 0.0, f32(nnx) - 1.0);
  cy = clamp(cy, 0.0, f32(nny) - 1.0);
  cz = clamp(cz, 0.0, f32(nnz) - 1.0);
  let i0 = u32(cx);
  let j0 = u32(cy);
  let k0 = u32(cz);
  let dx = cx - f32(i0);
  let dy = cy - f32(j0);
  let dz = cz - f32(k0);
  var sum: f32 = 0.0;
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        let id = cidx(min(i0 + a, nnx - 1u), min(j0 + b, nny - 1u), min(k0 + c, nnz - 1u), nnx, nny, nnz);
        sum = sum + g[off + id] * w;
      }
    }
  }
  return sum;
}

fn faceDims(axis: u32, go: GridOffsets) -> vec3<u32> {
  if (axis == 0u) { return vec3<u32>(go.nxU, go.n, go.n); }
  else if (axis == 1u) { return vec3<u32>(go.n, go.nyU, go.n); }
  else { return vec3<u32>(go.n, go.n, go.nzV); }
}

fn faceOffset(axis: u32, go: GridOffsets) -> u32 {
  if (axis == 0u) { return go.offU; }
  else if (axis == 1u) { return go.offV; }
  else { return go.offW; }
}

fn faceOffset0(axis: u32, go: GridOffsets) -> u32 {
  if (axis == 0u) { return go.offU0; }
  else if (axis == 1u) { return go.offV0; }
  else { return go.offW0; }
}

// World position of a MAC face point.
fn facePos(i: u32, j: u32, k: u32, axis: u32, p: FrameParams) -> vec3<f32> {
  if (axis == 0u) { return vec3<f32>(p.originX + f32(i) * p.h, p.originY + (f32(j) + 0.5) * p.h, p.originZ + (f32(k) + 0.5) * p.h); }
  else if (axis == 1u) { return vec3<f32>(p.originX + (f32(i) + 0.5) * p.h, p.originY + f32(j) * p.h, p.originZ + (f32(k) + 0.5) * p.h); }
  else { return vec3<f32>(p.originX + (f32(i) + 0.5) * p.h, p.originY + (f32(j) + 0.5) * p.h, p.originZ + f32(k) * p.h); }
}

fn fieldsForce(wells: array<Well>, vortices: array<Vortex>, holes: array<Hole>, wpos: vec3<f32>) -> vec3<f32> {
  var f = vec3<f32>(0.0);
  for (var a = 0u; a < ${MAX_FIELDS}u; a = a + 1u) {
    let fw = wells[a];
    let dx = fw.x - wpos.x;
    let dy = fw.y - wpos.y;
    let dz = fw.z - wpos.z;
    let d2 = dx * dx + dy * dy + dz * dz + fw.softening;
    let d = sqrt(d2);
    if (d < fw.radius && d > 0.0001) {
      let s = (fw.strength / d2) * (1.0 - d / fw.radius);
      f += vec3<f32>(dx, dy, dz) / d * s;
    }
  }
  for (var a = 0u; a < ${MAX_FIELDS}u; a = a + 1u) {
    let fv = vortices[a];
    let dx = wpos.x - fv.x;
    let dz = wpos.z - fv.z;
    let d = sqrt(dx * dx + dz * dz);
    if (d < fv.radius && d > 0.0001) {
      let fall = 1.0 - d / fv.radius;
      let core = fv.radius * 0.18;
      let tang = fv.swirl * fall / max(d, core);
      f.x = f.x + (-dz / d) * tang - (dx / d) * fv.inward * fall;
      f.z = f.z + (dx / d) * tang - (dz / d) * fv.inward * fall;
      f.y = f.y + fv.vertical * fall * fv.axisY;
    }
  }
  for (var a = 0u; a < ${MAX_FIELDS}u; a = a + 1u) {
    let fh = holes[a];
    let dx = fh.x - wpos.x;
    let dy = fh.y - wpos.y;
    let dz = fh.z - wpos.z;
    let d2 = dx * dx + dy * dy + dz * dz + 4.0;
    let d = sqrt(d2);
    let s = fh.mass / d2;
    f += vec3<f32>(dx, dy, dz) / d * s;
  }
  return f;
}

// Cell-centered trilinear sample from a cell grid (n^3).
fn cellSample(g: array<f32>, off: u32, wpos: vec3<f32>, p: FrameParams) -> f32 {
  let gx = clamp((wpos.x - p.originX) / p.h - 0.5, 0.0, p.n - 1.0);
  let gy = clamp((wpos.y - p.originY) / p.h - 0.5, 0.0, p.n - 1.0);
  let gz = clamp((wpos.z - p.originZ) / p.h - 0.5, 0.0, p.n - 1.0);
  let nn = u32(p.n);
  let i0 = u32(gx);
  let j0 = u32(gy);
  let k0 = u32(gz);
  let dx = gx - f32(i0);
  let dy = gy - f32(j0);
  let dz = gz - f32(k0);
  var sum: f32 = 0.0;
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        let id = cidx(min(i0 + a, nn - 1u), min(j0 + b, nn - 1u), min(k0 + c, nn - 1u), nn, nn, nn);
        sum = sum + g[off + id] * w;
      }
    }
  }
  return sum;
}

// Vorticity confinement force at a point (curl of MAC field via trilinear samples).
fn vorticityForce(g: array<f32>, go: GridOffsets, p: FrameParams, wpos: vec3<f32>) -> vec3<f32> {
  let e = p.h * 0.75;
  var omx: f32; var omy: f32; var omz: f32;
  omx = (macSample(g, go.offW, 2u, vec3<f32>(wpos.x, wpos.y + e, wpos.z), p, go) - macSample(g, go.offW, 2u, vec3<f32>(wpos.x, wpos.y - e, wpos.z), p, go)
        - (macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y, wpos.z + e), p, go) - macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y, wpos.z - e), p, go))) / (2.0 * e);
  omy = (macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y, wpos.z + e), p, go) - macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y, wpos.z - e), p, go)
        - (macSample(g, go.offW, 2u, vec3<f32>(wpos.x + e, wpos.y, wpos.z), p, go) - macSample(g, go.offW, 2u, vec3<f32>(wpos.x - e, wpos.y, wpos.z), p, go))) / (2.0 * e);
  omz = (macSample(g, go.offV, 1u, vec3<f32>(wpos.x + e, wpos.y, wpos.z), p, go) - macSample(g, go.offV, 1u, vec3<f32>(wpos.x - e, wpos.y, wpos.z), p, go)
        - (macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y + e, wpos.z), p, go) - macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y - e, wpos.z), p, go))) / (2.0 * e);
  var nx: f32; var ny: f32; var nz: f32;
  nx = (sqrt(pow(macSample(g, go.offW, 2u, vec3<f32>(wpos.x + e, wpos.y, wpos.z), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x + e, wpos.y, wpos.z), p, go), 2.0))
        - sqrt(pow(macSample(g, go.offW, 2u, vec3<f32>(wpos.x - e, wpos.y, wpos.z), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x - e, wpos.y, wpos.z), p, go), 2.0))) / (2.0 * e);
  ny = (sqrt(pow(macSample(g, go.offW, 2u, vec3<f32>(wpos.x, wpos.y + e, wpos.z), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y + e, wpos.z), p, go), 2.0))
        - sqrt(pow(macSample(g, go.offW, 2u, vec3<f32>(wpos.x, wpos.y - e, wpos.z), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y - e, wpos.z), p, go), 2.0))) / (2.0 * e);
  nz = (sqrt(pow(macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y, wpos.z + e), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y, wpos.z + e), p, go), 2.0))
        - sqrt(pow(macSample(g, go.offU, 0u, vec3<f32>(wpos.x, wpos.y, wpos.z - e), p, go), 2.0) + pow(macSample(g, go.offV, 1u, vec3<f32>(wpos.x, wpos.y, wpos.z - e), p, go), 2.0))) / (2.0 * e);
  var N = vec3<f32>(nx, ny, nz);
  let nl = length(N);
  if (nl < 0.0001) { return vec3<f32>(0.0); }
  N = N / nl;
  let F = cross(N, vec3<f32>(omx, omy, omz));
  return F * (p.vorticity * p.h);
}

// Every kernel declares the full 11-binding set (pipeline layout is explicit
// and shared; the WebGPU implementation requires entry points to declare
// exactly the pipeline-layout bindings).
@group(0) @binding(0) var<uniform> p: FrameParams;
@group(0) @binding(1) var<uniform> bodies: array<Body>;
@group(0) @binding(2) var<uniform> wells: array<Well>;
@group(0) @binding(3) var<uniform> vortices: array<Vortex>;
@group(0) @binding(4) var<uniform> holes: array<Hole>;
@group(1) @binding(0) var<storage, read_write> grid: array<f32>;
@group(1) @binding(1) var<storage, read_write> parts: array<f32>;
@group(1) @binding(2) var<uniform> go: GridOffsets;
@group(1) @binding(3) var<storage, read> terrain: array<f32>;
@group(1) @binding(4) var<storage, read_write> stats: array<f32>;
@group(2) @binding(0) var tex: texture_3d<filtering>;
`;

// ============================================================ 1. clear density + render accumulators
export const WGSL_CLEAR = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= go.n || id.y >= go.n || id.z >= go.n) { return; }
  let idx = cidx(id.x, id.y, id.z, go.n, go.n, go.n);
  grid[go.offDensW + idx] = 0.0;
  grid[go.offDensS + idx] = 0.0;
  grid[go.offR + idx] = 0.0;
  grid[go.offG + idx] = 0.0;
  grid[go.offB + idx] = 0.0;
  grid[go.offA + idx] = 0.0;
}
`;

// ============================================================ 2. splat particle mass
export const WGSL_SPLAT_DENSITY = /* wgsl */ `${COMMON}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= p.particleCount) { return; }
  let base = id.x * 4u;
  let x = parts[base + 0u];
  let y = parts[base + 1u];
  let z = parts[base + 2u];
  let fluidId = parts[base + 3u];
  if (fluidId < -0.5 || (fluidId > 1.5 && fluidId < 2.5)) { return; } // steam only -> DensS
  let nn = u32(p.n);
  let isSteam = fluidId > 1.5 && fluidId < 2.5;
  let gx = clamp((x - p.originX) / p.h - 0.5, 0.0, p.n - 1.0);
  let gy = clamp((y - p.originY) / p.h - 0.5, 0.0, p.n - 1.0);
  let gz = clamp((z - p.originZ) / p.h - 0.5, 0.0, p.n - 1.0);
  let i0 = u32(gx);
  let j0 = u32(gy);
  let k0 = u32(gz);
  let dx = gx - f32(i0);
  let dy = gy - f32(j0);
  let dz = gz - f32(k0);
  let w000 = (1.0 - dx) * (1.0 - dy) * (1.0 - dz);
  let w100 = dx * (1.0 - dy) * (1.0 - dz);
  let w010 = (1.0 - dx) * dy * (1.0 - dz);
  let w110 = dx * dy * (1.0 - dz);
  let w001 = (1.0 - dx) * (1.0 - dy) * dz;
  let w101 = dx * (1.0 - dy) * dz;
  let w011 = (1.0 - dx) * dy * dz;
  let w111 = dx * dy * dz;
  let off = select(go.offDensW, go.offDensS, isSteam);
  let i1 = min(i0 + 1u, nn - 1u);
  let j1 = min(j0 + 1u, nn - 1u);
  let k1 = min(k0 + 1u, nn - 1u);
  atomicAdd(&grid[off + cidx(i0, j0, k0, nn, nn, nn)], 0.02 * w000);
  atomicAdd(&grid[off + cidx(i1, j0, k0, nn, nn, nn)], 0.02 * w100);
  atomicAdd(&grid[off + cidx(i0, j1, k0, nn, nn, nn)], 0.02 * w010);
  atomicAdd(&grid[off + cidx(i1, j1, k0, nn, nn, nn)], 0.02 * w110);
  atomicAdd(&grid[off + cidx(i0, j0, k1, nn, nn, nn)], 0.02 * w001);
  atomicAdd(&grid[off + cidx(i1, j0, k1, nn, nn, nn)], 0.02 * w101);
  atomicAdd(&grid[off + cidx(i0, j1, k1, nn, nn, nn)], 0.02 * w011);
  atomicAdd(&grid[off + cidx(i1, j1, k1, nn, nn, nn)], 0.02 * w111);
}
`;

// ============================================================ 3. advect grid (MAC semi-Lagrangian)
const ADVECT_BODY = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let axis = AXISu;
  let dims = faceDims(axis, go);
  if (id.x >= dims.x || id.y >= dims.y || id.z >= dims.z) { return; }
  let wpos = facePos(id.x, id.y, id.z, axis, p);
  let off = faceOffset(axis, go);
  let off0 = faceOffset0(axis, go);
  // face velocity for backtracing
  let uF = macSample(grid, go.offU, 0u, wpos, p, go);
  let vF = macSample(grid, go.offV, 1u, wpos, p, go);
  let wF = macSample(grid, go.offW, 2u, wpos, p, go);
  let bx = wpos.x - uF * p.dt;
  let by = wpos.y - vF * p.dt;
  let bz = wpos.z - wF * p.dt;
  let val = macSample(grid, off0, axis, vec3<f32>(bx, by, bz), p, go);
  grid[off + cidx(id.x, id.y, id.z, dims.x, dims.y, dims.z)] = val;
}
`;


export const WGSL_ADVECT_U = ADVECT_BODY.replace('let axis = AXISu;', 'let axis = 0u;');
export const WGSL_ADVECT_V = ADVECT_BODY.replace('let axis = AXISu;', 'let axis = 1u;');
export const WGSL_ADVECT_W = ADVECT_BODY.replace('let axis = AXISu;', 'let axis = 2u;');

// ============================================================ 4. forces (MAC)
const FORCES_BODY = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let axis = AXISu;
  let dims = faceDims(axis, go);
  if (id.x >= dims.x || id.y >= dims.y || id.z >= dims.z) { return; }
  let wpos = facePos(id.x, id.y, id.z, axis, p);
  let off = faceOffset(axis, go);
  let idx = off + cidx(id.x, id.y, id.z, dims.x, dims.y, dims.z);
  var vel = grid[idx];
  // body force
  var F = fieldsForce(wells, vortices, holes, wpos);
  // x5.0 normalizes a full cell (~0.2 density units at 0.55m spacing) to 1.0
  // so that packed fluid feels full gravity; clamp for very dense spawns
  let densW = min(cellSample(grid, go.offDensW, wpos, p) * 5.0, 3.0);
  let densS = min(cellSample(grid, go.offDensS, wpos, p) * 5.0, 3.0);
  F.y = F.y + p.gravityY * p.buoyancy * densW;
  F.y = F.y + p.steamLift * densS;
  F.x = F.x + (p.windX - macSample(grid, go.offU, 0u, wpos, p, go)) * p.windDrag;
  F.y = F.y + (p.windY - macSample(grid, go.offV, 1u, wpos, p, go)) * p.windDrag;
  F.z = F.z + (p.windZ - macSample(grid, go.offW, 2u, wpos, p, go)) * p.windDrag;
  if (p.vorticity > 0.001) {
    let VF = vorticityForce(grid, go, p, wpos);
    F = F + VF;
  }
  var comp: f32;
  if (axis == 0u) { comp = F.x; }
  else if (axis == 1u) { comp = F.y; }
  else { comp = F.z; }
  vel = (vel + comp * p.dt) * (1.0 - min(0.9, p.damping * p.dt));
  grid[idx] = vel;
}
`;


export const WGSL_FORCES_U = FORCES_BODY.replace('let axis = AXISu;', 'let axis = 0u;');
export const WGSL_FORCES_V = FORCES_BODY.replace('let axis = AXISu;', 'let axis = 1u;');
export const WGSL_FORCES_W = FORCES_BODY.replace('let axis = AXISu;', 'let axis = 2u;');

// ============================================================ 5. PIC impulse splat
export const WGSL_PIC = /* wgsl */ `${COMMON}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= p.particleCount) { return; }
  let base = id.x * 4u;
  let velBase = u32(${MAX_PARTICLES}) * 4u;
  let x = parts[base + 0u];
  let y = parts[base + 1u];
  let z = parts[base + 2u];
  let fluidId = parts[base + 3u];
  if (fluidId < -0.5) { return; }
  let vx = parts[velBase + base + 0u];
  let vy = parts[velBase + base + 1u];
  let vz = parts[velBase + base + 2u];
  let nn = u32(p.n);
  let nnU = nn + 1u;
  // u grid splat
  var gx: f32; var gy: f32; var gz: f32;
  gx = clamp((x - p.originX) / p.h, 0.0, f32(nnU) - 1.0);
  gy = clamp((y - p.originY) / p.h - 0.5, 0.0, p.n - 1.0);
  gz = clamp((z - p.originZ) / p.h - 0.5, 0.0, p.n - 1.0);
  var i0: u32; var j0: u32; var k0: u32;
  i0 = u32(gx); j0 = u32(gy); k0 = u32(gz);
  var dx: f32; var dy: f32; var dz: f32;
  dx = gx - f32(i0); dy = gy - f32(j0); dz = gz - f32(k0);
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        if (w < 0.001) { continue; }
        let fi = go.offU + cidx(min(i0 + a, nnU - 1u), min(j0 + b, nn - 1u), min(k0 + c, nn - 1u), nnU, nn, nn);
        let old = grid[go.offU0 + cidx(min(i0 + a, nnU - 1u), min(j0 + b, nn - 1u), min(k0 + c, nn - 1u), nnU, nn, nn)];
        atomicAdd(&grid[fi], 0.15 * w * (vx - old));
      }
    }
  }
  // v grid splat
  gx = clamp((x - p.originX) / p.h - 0.5, 0.0, p.n - 1.0);
  gy = clamp((y - p.originY) / p.h, 0.0, f32(nnU) - 1.0);
  gz = clamp((z - p.originZ) / p.h - 0.5, 0.0, p.n - 1.0);
  i0 = u32(gx); j0 = u32(gy); k0 = u32(gz);
  dx = gx - f32(i0); dy = gy - f32(j0); dz = gz - f32(k0);
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        if (w < 0.001) { continue; }
        let fi = go.offV + cidx(min(i0 + a, nn - 1u), min(j0 + b, nnU - 1u), min(k0 + c, nn - 1u), nn, nnU, nn);
        let old = grid[go.offV0 + cidx(min(i0 + a, nn - 1u), min(j0 + b, nnU - 1u), min(k0 + c, nn - 1u), nn, nnU, nn)];
        atomicAdd(&grid[fi], 0.15 * w * (vy - old));
      }
    }
  }
  // w grid splat
  gx = clamp((x - p.originX) / p.h - 0.5, 0.0, p.n - 1.0);
  gy = clamp((y - p.originY) / p.h - 0.5, 0.0, p.n - 1.0);
  gz = clamp((z - p.originZ) / p.h, 0.0, f32(nnU) - 1.0);
  i0 = u32(gx); j0 = u32(gy); k0 = u32(gz);
  dx = gx - f32(i0); dy = gy - f32(j0); dz = gz - f32(k0);
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        if (w < 0.001) { continue; }
        let fi = go.offW + cidx(min(i0 + a, nn - 1u), min(j0 + b, nn - 1u), min(k0 + c, nnU - 1u), nn, nn, nnU);
        let old = grid[go.offW0 + cidx(min(i0 + a, nn - 1u), min(j0 + b, nn - 1u), min(k0 + c, nnU - 1u), nn, nn, nnU)];
        atomicAdd(&grid[fi], 0.15 * w * (vz - old));
      }
    }
  }
}
`;

// ============================================================ 6. divergence (cell)
export const WGSL_DIVERGENCE = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let nn = go.n;
  if (id.x >= nn || id.y >= nn || id.z >= nn) { return; }
  let i = id.x; let j = id.y; let k = id.z;
  let u00 = grid[go.offU + cidx(i, j, k, nn + 1u, nn, nn)];
  let u10 = grid[go.offU + cidx(i + 1u, j, k, nn + 1u, nn, nn)];
  let v00 = grid[go.offV + cidx(i, j, k, nn, nn + 1u, nn)];
  let v01 = grid[go.offV + cidx(i, j + 1u, k, nn, nn + 1u, nn)];
  let w00 = grid[go.offW + cidx(i, j, k, nn, nn, nn + 1u)];
  let w02 = grid[go.offW + cidx(i, j, k + 1u, nn, nn, nn + 1u)];
  let invH = 1.0 / p.h;
  grid[go.offDiv + cidx(i, j, k, nn, nn, nn)] = (u10 - u00 + v01 - v00 + w02 - w00) * invH;
}
`;

// ============================================================ 7/8. red-black Gauss-Seidel pressure
function pressureWGSL(color: number): string {
  return /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let nn = go.n;
  if (id.x >= nn || id.y >= nn || id.z >= nn) { return; }
  if (((id.x + id.y + id.z) & 1u) != ${color}u) { return; }
  let i = id.x; let j = id.y; let k = id.z;
  let base = go.offP;
  let iL = min(i, 1u); let iR = min(i + 1u, nn - 1u);
  let jL = min(j, 1u); let jR = min(j + 1u, nn - 1u);
  let kL = min(k, 1u); let kR = min(k + 1u, nn - 1u);
  let s = grid[base + cidx(iR, j, k, nn, nn, nn)] + grid[base + cidx(iL, j, k, nn, nn, nn)]
        + grid[base + cidx(i, jR, k, nn, nn, nn)] + grid[base + cidx(i, jL, k, nn, nn, nn)]
        + grid[base + cidx(i, j, kR, nn, nn, nn)] + grid[base + cidx(i, j, kL, nn, nn, nn)]
        - grid[go.offDiv + cidx(i, j, k, nn, nn, nn)] * p.h * p.h;
  grid[base + cidx(i, j, k, nn, nn, nn)] = s * (1.0 / 6.0);
}
`;
}
export const WGSL_PRESSURE_RED = pressureWGSL(0);
export const WGSL_PRESSURE_BLACK = pressureWGSL(1);

// ============================================================ 9. project (subtract gradient)
export const WGSL_PROJECT = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let nn = go.n;
  let nnU = nn + 1u;
  let invH = 1.0 / p.h;
  let i = id.x; let j = id.y; let k = id.z;
  if (i < nnU && j < nn && k < nn) {
    let iL = min(i, 1u);
    let d = (grid[go.offP + cidx(i, j, k, nn, nn, nn)] - grid[go.offP + cidx(iL, j, k, nn, nn, nn)]) * invH;
    grid[go.offU + cidx(i, j, k, nnU, nn, nn)] = grid[go.offU + cidx(i, j, k, nnU, nn, nn)] - d;
  }
  if (i < nn && j < nnU && k < nn) {
    let jL = min(j, 1u);
    let d = (grid[go.offP + cidx(i, j, k, nn, nn, nn)] - grid[go.offP + cidx(i, jL, k, nn, nn, nn)]) * invH;
    grid[go.offV + cidx(i, j, k, nn, nnU, nn)] = grid[go.offV + cidx(i, j, k, nn, nnU, nn)] - d;
  }
  if (i < nn && j < nn && k < nnU) {
    let kL = min(k, 1u);
    let d = (grid[go.offP + cidx(i, j, k, nn, nn, nn)] - grid[go.offP + cidx(i, j, kL, nn, nn, nn)]) * invH;
    grid[go.offW + cidx(i, j, k, nn, nn, nnU)] = grid[go.offW + cidx(i, j, k, nn, nn, nnU)] - d;
  }
}
`;

// ============================================================ 10. FLIP/PIC particle velocity
export const WGSL_FLIP = /* wgsl */ `${COMMON}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= p.particleCount) { return; }
  let base = id.x * 4u;
  let velBase = u32(${MAX_PARTICLES}) * 4u;
  if (parts[base + 3u] < -0.5) { return; }
  let wpos = vec3<f32>(parts[base + 0u], parts[base + 1u], parts[base + 2u]);
  let vx = parts[velBase + base + 0u];
  let vy = parts[velBase + base + 1u];
  let vz = parts[velBase + base + 2u];
  let temp = parts[velBase + base + 3u];
  let vg = vec3<f32>(
    macSample(grid, go.offU, 0u, wpos, p, go),
    macSample(grid, go.offV, 1u, wpos, p, go),
    macSample(grid, go.offW, 2u, wpos, p, go));
  let vg0 = vec3<f32>(
    macSample(grid, go.offU0, 0u, wpos, p, go),
    macSample(grid, go.offV0, 1u, wpos, p, go),
    macSample(grid, go.offW0, 2u, wpos, p, go));
  var vnew = vg + p.flipRatio * (vec3<f32>(vx, vy, vz) - vg0);
  let sp = length(vnew);
  if (sp > 60.0) { vnew = vnew * (60.0 / sp); }
  parts[velBase + base + 0u] = vnew.x;
  parts[velBase + base + 1u] = vnew.y;
  parts[velBase + base + 2u] = vnew.z;
  parts[velBase + base + 3u] = temp;
}
`;

// ============================================================ 11. advect particles + terrain + bodies + phase
export const WGSL_ADVECT_PARTICLES = /* wgsl */ `${COMMON}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= p.particleCount) { return; }
  let base = id.x * 4u;
  let velBase = u32(${MAX_PARTICLES}) * 4u;
  if (parts[base + 3u] < -0.5) { return; }
  var pos = vec3<f32>(parts[base + 0u], parts[base + 1u], parts[base + 2u]);
  var vel = vec3<f32>(parts[velBase + base + 0u], parts[velBase + base + 1u], parts[velBase + base + 2u]);
  var temp = parts[velBase + base + 3u];
  var fluidId = parts[base + 3u];
  let nn = u32(p.n);

  // integrate
  pos = pos + vel * p.dt;

  // terrain collision (slide along analytic surface)
  let pr = 0.35;
  let th = terrainHeight(terrain, nn, nn, pos.x, pos.z, p.originX, p.originZ, p.h);
  if (pos.y < th + pr) {
    let e = 0.6;
    let dxd = (terrainHeight(terrain, nn, nn, pos.x + e, pos.z, p.originX, p.originZ, p.h) - terrainHeight(terrain, nn, nn, pos.x - e, pos.z, p.originX, p.originZ, p.h)) / (2.0 * e);
    let dzd = (terrainHeight(terrain, nn, nn, pos.x, pos.z + e, p.originX, p.originZ, p.h) - terrainHeight(terrain, nn, nn, pos.x, pos.z - e, p.originX, p.originZ, p.h)) / (2.0 * e);
    var nrm = normalize(vec3<f32>(-dxd, 1.0, -dzd));
    pos.y = th + pr;
    let vn = dot(vel, nrm);
    if (vn < 0.0) {
      vel = vel - (1.2 * vn) * nrm;
      vel = vel * 0.985;
    }
  }

  // rigid body collisions
  for (var b = 0u; b < ${MAX_BODIES}u; b = b + 1u) {
    let bd = bodies[b];
    if (bd.radius < 0.001) { continue; }
    let d = pos - vec3<f32>(bd.x, bd.y, bd.z);
    let dist = length(d);
    let rr = bd.radius + pr;
    if (dist < rr && dist > 0.0001) {
      let nrm = d / dist;
      pos = vec3<f32>(bd.x, bd.y, bd.z) + nrm * rr;
      let rel = dot(vel - vec3<f32>(bd.vx, bd.vy, bd.vz), nrm);
      if (rel < 0.0) {
        vel = vel - 1.4 * rel * nrm;
      }
    }
  }

  // world bounds
  if (pos.x < -124.0) { pos.x = -124.0; if (vel.x < 0.0) { vel.x = -vel.x * 0.5; } }
  if (pos.x > 124.0) { pos.x = 124.0; if (vel.x > 0.0) { vel.x = -vel.x * 0.5; } }
  if (pos.z < -124.0) { pos.z = -124.0; if (vel.z < 0.0) { vel.z = -vel.z * 0.5; } }
  if (pos.z > 124.0) { pos.z = 124.0; if (vel.z > 0.0) { vel.z = -vel.z * 0.5; } }
  if (pos.y > 148.0) { pos.y = 148.0; }

  // thermal + phase
  let cool = min(1.0, p.dt * 0.15);
  if (fluidId < 0.5) {
    temp = temp + (p.ambientC - temp) * cool;
    if (temp >= 100.0) { fluidId = 2.0; temp = temp - 30.0; }
    else if (temp <= 0.0) { fluidId = 3.0; }
  } else if (fluidId < 1.5) {
    // oil-like: just cool
    temp = temp + (p.ambientC - temp) * cool;
  } else if (fluidId < 2.5) {
    // steam
    temp = temp + (p.ambientC - temp) * min(1.0, p.dt * 0.2);
    if (temp < 60.0) { fluidId = 0.0; }
  } else if (fluidId < 3.5) {
    // ice
    temp = temp + (p.ambientC - temp) * min(1.0, p.dt * 0.05);
    vel = vel * 0.9;
    if (temp > 0.0) { fluidId = 0.0; }
  } else {
    // lava: very slow cooling, no phase change
    temp = temp + (p.ambientC - temp) * min(1.0, p.dt * 0.01);
  }

  // kill
  if (pos.y < -30.0) {
    parts[base + 3u] = -1.0;
    return;
  }

  parts[base + 0u] = pos.x;
  parts[base + 1u] = pos.y;
  parts[base + 2u] = pos.z;
  parts[base + 3u] = fluidId;
  parts[velBase + base + 0u] = vel.x;
  parts[velBase + base + 1u] = vel.y;
  parts[velBase + base + 2u] = vel.z;
  parts[velBase + base + 3u] = temp;
}
`;

// ============================================================ 12. render splat (particles -> grid accumulators)
export const WGSL_SPLAT_RENDER = /* wgsl */ `${COMMON}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= p.particleCount) { return; }
  let base = id.x * 4u;
  let velBase = u32(${MAX_PARTICLES}) * 4u;
  let x = parts[base + 0u];
  let y = parts[base + 1u];
  let z = parts[base + 2u];
  let fluidId = parts[base + 3u];
  if (fluidId < -0.5) { return; }
  let temp = parts[velBase + base + 3u];
  let nn = u32(p.n);
  let depth = length(vec3<f32>(x, y, z) - vec3<f32>(p.camX, p.camY, p.camZ));
  var cr: f32 = 0.0;
  var cg: f32 = 0.0;
  var cb: f32 = 0.0;
  let heat = clamp((temp - p.ambientC) * 0.002, 0.0, 0.5);
  if (fluidId < 0.5) { cr = 0.045; cg = heat * 0.045; }
  else if (fluidId < 1.5) { cr = 0.04; cg = 0.01; cb = 0.008; }
  else if (fluidId < 2.5) { cr = 0.05; cg = 0.05; cb = 0.055; }
  else if (fluidId < 3.5) { cr = 0.03; cg = 0.035; cb = 0.045; }
  else { cr = 0.10; cg = 0.03; cb = 0.006; }
  let ca = 0.02 * depth;
  let gx = clamp((x - p.originX) / p.h - 0.5, 0.0, p.n - 1.0);
  let gy = clamp((y - p.originY) / p.h - 0.5, 0.0, p.n - 1.0);
  let gz = clamp((z - p.originZ) / p.h - 0.5, 0.0, p.n - 1.0);
  let i0 = u32(gx);
  let j0 = u32(gy);
  let k0 = u32(gz);
  let dx = gx - f32(i0);
  let dy = gy - f32(j0);
  let dz = gz - f32(k0);
  for (var a = 0u; a < 2u; a = a + 1u) {
    for (var b = 0u; b < 2u; b = b + 1u) {
      for (var c = 0u; c < 2u; c = c + 1u) {
        let w = select(1.0 - dx, dx, a == 1u) * select(1.0 - dy, dy, b == 1u) * select(1.0 - dz, dz, c == 1u);
        if (w < 0.001) { continue; }
        let id2 = cidx(min(i0 + a, nn - 1u), min(j0 + b, nn - 1u), min(k0 + c, nn - 1u), nn, nn, nn);
        atomicAdd(&grid[go.offR + id2], cr * w);
        atomicAdd(&grid[go.offG + id2], cg * w);
        atomicAdd(&grid[go.offB + id2], cb * w);
        atomicAdd(&grid[go.offA + id2], ca * w);
      }
    }
  }
}
`;

// ============================================================ 13. upload accumulators -> fluid texture
export const WGSL_UPLOAD_FLUID = /* wgsl */ `${COMMON}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= go.n || id.y >= go.n || id.z >= go.n) { return; }
  let idx = cidx(id.x, id.y, id.z, go.n, go.n, go.n);
  textureStore(tex, id, vec4<f32>(grid[go.offR + idx], grid[go.offG + idx], grid[go.offB + idx], grid[go.offA + idx]));
}
`;

// ============================================================ 14. stats stage A (per-workgroup reduce)
// stats buffer layout (f32): [0..W) WG max speed, [W..2W) WG alive, [2W..3W) WG sum speed,
//   [3W] global max, [3W+1] alive total, [3W+2] mean speed.
export const WGSL_STATS_A = /* wgsl */ `${COMMON}
var<workgroup> wMax: atomic<u32>;
var<workgroup> wAlive: atomic<u32>;
var<workgroup> wSum: atomic<f32>;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>) {
  let velBase = u32(${MAX_PARTICLES}) * 4u;
  let W = ${MAX_WORKGROUPS}u;
  if (id.x < p.particleCount) {
    let base = id.x * 4u;
    let alive = parts[base + 3u] > -0.5;
    var sp: f32 = 0.0;
    if (alive) {
      sp = length(vec3<f32>(parts[velBase + base + 0u], parts[velBase + base + 1u], parts[velBase + base + 2u]));
    }
    if (sp > 0.0) { atomicMax(&wMax, bitcast<u32>(sp)); }
    if (alive) {
      atomicAdd(&wAlive, 1u);
      atomicAdd(&wSum, sp);
    }
  }
  workgroupBarrier();
  if (id.x == 0u) {
    stats[wid.x] = bitcast<f32>(atomicLoad(&wMax));
    stats[W + wid.x] = f32(atomicLoad(&wAlive));
    stats[2u * W + wid.x] = atomicLoad(&wSum);
  }
}
`;

// ============================================================ 15. stats stage B (global reduce, 1 workgroup)
export const WGSL_STATS_B = /* wgsl */ `${COMMON}
var<workgroup> sMax: array<f32, 128>;
var<workgroup> sAlive: array<f32, 128>;
var<workgroup> sSum: array<f32, 128>;
@compute @workgroup_size(128)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
  let W = ${MAX_WORKGROUPS}u;
  var m: f32 = 0.0;
  var al: f32 = 0.0;
  var sm: f32 = 0.0;
  for (var i = lid.x; i < W; i = i + 128u) {
    m = max(m, stats[i]);
    al = al + stats[W + i];
    sm = sm + stats[2u * W + i];
  }
  sMax[lid.x] = m;
  sAlive[lid.x] = al;
  sSum[lid.x] = sm;
  for (var st = 64u; st > 0u; st = st / 2u) {
    workgroupBarrier();
    if (lid.x < st) {
      sMax[lid.x] = max(sMax[lid.x], sMax[lid.x + st]);
      sAlive[lid.x] = sAlive[lid.x] + sAlive[lid.x + st];
      sSum[lid.x] = sSum[lid.x] + sSum[lid.x + st];
    }
  }
  workgroupBarrier();
  if (lid.x == 0u) {
    stats[3u * W] = sMax[0];
    stats[3u * W + 1u] = sAlive[0];
    stats[3u * W + 2u] = sAlive[0] > 1.0 ? sSum[0] / sAlive[0] : 0.0;
  }
}
`;
