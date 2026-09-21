// 3D incompressible Navier-Stokes solver — Jos Stam "Stable Fluids" (GDC 2003).
// Grid-based (Eulerian) method: advect velocity, confine vorticity, project to
// divergence-free. This solves the ACTUAL Navier-Stokes PDEs (semi-Lagrangian
// advection + pressure projection), the most realistic fluid technology that
// runs on CPU in a browser. No DOM dependencies — fully testable in Node.
//
// Domain: x,z in [-HALF, HALF], y in [YMIN, YMIN + SIDE], cubic cells.
// Channels: 0 water, 1 heat (deg C), 2 steam, 3 ice.

export const GRID_HALF = 60;
export const GRID_YMIN = -20;
export const GRID_SIDE = 120;
export const SF_CHANNELS = 4;
export const SF_WATER = 0;
export const SF_HEAT = 1;
export const SF_STEAM = 2;
export const SF_ICE = 3;

export interface SFContext {
  dt: number;
  time: number;
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  windX: number;
  windY: number;
  windZ: number;
  windDrag: number;
  ambientC: number;
  terrainHeight: (x: number, z: number) => number;
  // tuning
  vorticity: number;    // confinement strength 0..3
  jacobi: number;       // projection iterations (10..40)
  buoyancy: number;     // gravity scale applied to water concentration (m/s^2)
  steamLift: number;    // upward lift for steam (m/s^2)
  damping: number;      // global velocity damping per second (0..2)
  // same force fields as the SPH engine
  wells: { x: number; y: number; z: number; radius: number; strength: number; softening: number }[];
  vortices: { x: number; y: number; z: number; radius: number; swirl: number; inward: number; vertical: number; axisY: number }[];
  holes: { x: number; y: number; z: number; mass: number; horizon: number }[];
}

export class StableFluids {
  readonly n: number;
  readonly cell: number;
  readonly n2: number;
  readonly n3: number;

  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  /** channel-major: dye[ch * n3 + idx] */
  dye: Float32Array;

  private u0: Float32Array;
  private v0: Float32Array;
  private w0: Float32Array;
  private p: Float32Array;
  private div: Float32Array;
  private curl: Float32Array; // |omega|
  private ox: Float32Array;
  private oy: Float32Array;
  private oz: Float32Array;
  private solid: Uint8Array;
  private dyeTmp: Float32Array;

  // stats (read by the lab UI)
  maxSpeed = 0;
  meanSpeed = 0;
  divResidual = 0;
  activeCells = 0;
  stepMs = 0;

  constructor(n: number) {
    this.n = n;
    this.cell = GRID_SIDE / n;
    this.n2 = n * n;
    this.n3 = this.n2 * n;
    const N = this.n3;
    this.u = new Float32Array(N);
    this.v = new Float32Array(N);
    this.w = new Float32Array(N);
    this.u0 = new Float32Array(N);
    this.v0 = new Float32Array(N);
    this.w0 = new Float32Array(N);
    this.dye = new Float32Array(N * SF_CHANNELS);
    this.p = new Float32Array(N);
    this.div = new Float32Array(N);
    this.curl = new Float32Array(N);
    this.ox = new Float32Array(N);
    this.oy = new Float32Array(N);
    this.oz = new Float32Array(N);
    this.dyeTmp = new Float32Array(N * SF_CHANNELS);
    this.solid = new Uint8Array(N);
  }

  idx(i: number, j: number, k: number): number {
    return (j * this.n + k) * this.n + i;
  }

  /** World coord of cell center. */
  wx(i: number): number { return -GRID_HALF + (i + 0.5) * this.cell; }
  wy(j: number): number { return GRID_YMIN + (j + 0.5) * this.cell; }
  wz(k: number): number { return -GRID_HALF + (k + 0.5) * this.cell; }

  /** Cell index (clamped) of a world coord. */
  cellX(x: number): number { return Math.max(0, Math.min(this.n - 1, Math.floor((x + GRID_HALF) / this.cell))); }
  cellY(y: number): number { return Math.max(0, Math.min(this.n - 1, Math.floor((y - GRID_YMIN) / this.cell))); }
  cellZ(z: number): number { return Math.max(0, Math.min(this.n - 1, Math.floor((z + GRID_HALF) / this.cell))); }

  inDomain(x: number, y: number, z: number): boolean {
    return x >= -GRID_HALF && x < GRID_HALF && y >= GRID_YMIN && y < GRID_YMIN + GRID_SIDE && z >= -GRID_HALF && z < GRID_HALF;
  }

  /** Mark cells below terrain as solid. Call after terrain dents. */
  rebuildSolid(terrainHeight: (x: number, z: number) => number): void {
    const { n, cell } = this;
    const th = new Float32Array(n * n);
    for (let k = 0; k < n; k++) {
      const z = this.wz(k);
      for (let i = 0; i < n; i++) {
        th[k * n + i] = terrainHeight(this.wx(i), z);
      }
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const t = th[k * n + i] + cell * 0.5;
        const j0 = this.cellY(t);
        for (let j = 0; j < n; j++) {
          this.solid[this.idx(i, j, k)] = j < j0 ? 1 : 0;
        }
      }
    }
  }

  dyeAt(ch: number, i: number, j: number, k: number): number {
    return this.dye[ch * this.n3 + this.idx(i, j, k)];
  }

  // ---------- public sampling (world coords, trilinear) ----------

  sampleVel(x: number, y: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
    if (!this.inDomain(x, y, z)) return null;
    const gx = (x + GRID_HALF) / this.cell - 0.5;
    const gy = (y - GRID_YMIN) / this.cell - 0.5;
    const gz = (z + GRID_HALF) / this.cell - 0.5;
    const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
    const fx = gx - i0, fy = gy - j0, fz = gz - k0;
    const n = this.n;
    const cl = (c: number) => (c < 0 ? 0 : c > n - 1 ? n - 1 : c);
    const iA = cl(i0), iB = cl(i0 + 1), jA = cl(j0), jB = cl(j0 + 1), kA = cl(k0), kB = cl(k0 + 1);
    const w000 = (1 - fx) * (1 - fy) * (1 - fz), w100 = fx * (1 - fy) * (1 - fz);
    const w010 = (1 - fx) * fy * (1 - fz), w110 = fx * fy * (1 - fz);
    const w001 = (1 - fx) * (1 - fy) * fz, w101 = fx * (1 - fy) * fz;
    const w011 = (1 - fx) * fy * fz, w111 = fx * fy * fz;
    const s = this.solid, u = this.u, v = this.v, w = this.w;
    let su = 0, sv = 0, sw = 0, swt = 0;
    const acc = (i: number, j: number, k: number, wt: number) => {
      const id = (j * n + k) * n + i;
      if (s[id]) return;
      swt += wt;
      su += u[id] * wt; sv += v[id] * wt; sw += w[id] * wt;
    };
    acc(iA, jA, kA, w000); acc(iB, jA, kA, w100);
    acc(iA, jB, kA, w010); acc(iB, jB, kA, w110);
    acc(iA, jA, kB, w001); acc(iB, jA, kB, w101);
    acc(iA, jB, kB, w011); acc(iB, jB, kB, w111);
    if (swt < 1e-6) return null;
    const inv = 1 / swt;
    out.x = su * inv; out.y = sv * inv; out.z = sw * inv;
    return out;
  }

  sampleDye(x: number, y: number, z: number, ch: number): number {
    if (!this.inDomain(x, y, z)) return 0;
    const d = this.dye.subarray(ch * this.n3, (ch + 1) * this.n3);
    const i = this.cellX(x), j = this.cellY(y), k = this.cellZ(z);
    return d[this.idx(i, j, k)];
  }

  // ---------- public injection (world coords) ----------

  /** Blend a neighborhood's velocity toward (vx,vy,vz) — used by SPH/rigid-body coupling. */
  splatVel(x: number, y: number, z: number, vx: number, vy: number, vz: number, radius: number): void {
    const r = Math.max(this.cell * 0.75, radius);
    const rc = r / this.cell;
    const ci = this.cellX(x), cj = this.cellY(y), ck = this.cellZ(z);
    const r0i = Math.max(0, Math.floor(ci - rc)), r1i = Math.min(this.n - 1, Math.ceil(ci + rc));
    const r0j = Math.max(0, Math.floor(cj - rc)), r1j = Math.min(this.n - 1, Math.ceil(cj + rc));
    const r0k = Math.max(0, Math.floor(ck - rc)), r1k = Math.min(this.n - 1, Math.ceil(ck + rc));
    for (let i = r0i; i <= r1i; i++) {
      for (let j = r0j; j <= r1j; j++) {
        for (let k = r0k; k <= r1k; k++) {
          const dx = i - ci, dy = j - cj, dz = k - ck;
          const d2 = (dx * dx + dy * dy + dz * dz) / (rc * rc);
          if (d2 >= 1) continue;
          const id = this.idx(i, j, k);
          if (this.solid[id]) continue;
          const wgt = (1 - d2) * (1 - d2) * 0.5;
          this.u[id] += (vx - this.u[id]) * wgt;
          this.v[id] += (vy - this.v[id]) * wgt;
          this.w[id] += (vz - this.w[id]) * wgt;
        }
      }
    }
  }

  /** Add dye of a channel within a radius. Amounts are concentrations (0..1). */
  splatDye(x: number, y: number, z: number, ch: number, amount: number, radius: number): void {
    const r = Math.max(this.cell * 0.75, radius);
    const rc = r / this.cell;
    const ci = this.cellX(x), cj = this.cellY(y), ck = this.cellZ(z);
    const r0i = Math.max(0, Math.floor(ci - rc)), r1i = Math.min(this.n - 1, Math.ceil(ci + rc));
    const r0j = Math.max(0, Math.floor(cj - rc)), r1j = Math.min(this.n - 1, Math.ceil(cj + rc));
    const r0k = Math.max(0, Math.floor(ck - rc)), r1k = Math.min(this.n - 1, Math.ceil(ck + rc));
    const d = this.dye;
    const base = ch * this.n3;
    for (let i = r0i; i <= r1i; i++) {
      for (let j = r0j; j <= r1j; j++) {
        for (let k = r0k; k <= r1k; k++) {
          const dx = i - ci, dy = j - cj, dz = k - ck;
          const d2 = (dx * dx + dy * dy + dz * dz) / (rc * rc);
          if (d2 >= 1) continue;
          const id = this.idx(i, j, k);
          if (this.solid[id]) continue;
          const wgt = (1 - d2) * (1 - d2);
          const v = d[base + id] + amount * wgt;
          d[base + id] = v > 1.5 ? 1.5 : v < 0 ? 0 : v;
        }
      }
    }
  }

  /** Fill a box with dye (dam-break style injection). */
  fillDyeBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ch: number, amount: number): number {
    let count = 0;
    const i0 = this.cellX(x0), i1 = this.cellX(x1);
    const j0 = this.cellY(y0), j1 = this.cellY(y1);
    const k0 = this.cellZ(z0), k1 = this.cellZ(z1);
    const base = ch * this.n3;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (let k = k0; k <= k1; k++) {
          const id = this.idx(i, j, k);
          if (this.solid[id]) continue;
          this.dye[base + id] = amount;
          count++;
        }
      }
    }
    return count;
  }

  reset(): void {
    this.u.fill(0); this.v.fill(0); this.w.fill(0);
    this.u0.fill(0); this.v0.fill(0); this.w0.fill(0);
    this.dye.fill(0); this.p.fill(0); this.div.fill(0); this.curl.fill(0);
  }

  // ---------- solver ----------

  step(ctx: SFContext): void {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const dt = ctx.dt;
    this.addForces(ctx, dt);
    this.advectVelocity(dt);
    this.vorticityConfinement(ctx, dt);
    this.project(ctx.jacobi);
    this.enforceSolid();
    this.advectDye(dt);
    this.phaseTransitions(ctx, dt);
    this.computeStats();
    this.stepMs = typeof performance !== "undefined" ? performance.now() - t0 : 0;
  }

  private addForces(ctx: SFContext, dt: number): void {
    const { n, n3, u, v, w, dye, solid } = this;
    const gY = ctx.gravityY;
    const buoy = ctx.buoyancy;
    const lift = ctx.steamLift;
    const drag = ctx.windDrag;
    const damping = ctx.damping;
    const dw = dye; // channel 0 base
    const dheat = dye.subarray(n3, 2 * n3);
    const dsteam = dye.subarray(2 * n3, 3 * n3);
    const wells = ctx.wells, vortices = ctx.vortices, holes = ctx.holes;
    for (let k = 0; k < n; k++) {
      const z = this.wz(k);
      for (let j = 0; j < n; j++) {
        const y = this.wy(j);
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) continue;
          const x = this.wx(i);
          let fu = 0; let fv = 0; let fz = 0;
          const c = dw[id];
          if (c > 1e-4) {
            // water is denser than air: gravity pulls it down (gY is negative)
            // warm water is lighter (buoyant)
            const warm = Math.min(1, Math.max(0, (dheat[id] - ctx.ambientC) * 0.01));
            fv += gY * buoy * c * (1 - 0.25 * warm);
          }
          const cs = dsteam[id];
          if (cs > 1e-4) fv += lift * cs;
          // air drag toward wind
          fu += (ctx.windX - u[id]) * drag;
          fv += (ctx.windY - v[id]) * drag;
          fz += (ctx.windZ - w[id]) * drag;
          // force fields (same definitions as the SPH engine)
          for (let a = 0; a < wells.length; a++) {
            const f = wells[a];
            const ddx = f.x - x; const ddy = f.y - y; const ddz = f.z - z;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz + f.softening;
            const d = Math.sqrt(d2);
            if (d < f.radius && d > 1e-4) {
              const s = (f.strength / d2) * (1 - d / f.radius);
              fu += (ddx / d) * s; fv += (ddy / d) * s; fz += (ddz / d) * s;
            }
          }
          for (let a = 0; a < vortices.length; a++) {
            const f = vortices[a];
            const ddx = x - f.x; const ddz = z - f.z;
            const d = Math.sqrt(ddx * ddx + ddz * ddz);
            if (d < f.radius && d > 1e-4) {
              const fall = 1 - d / f.radius;
              const core = f.radius * 0.18;
              const tang = f.swirl * fall / Math.max(d, core);
              fu += (-ddz / d) * tang - (ddx / d) * f.inward * fall;
              fz += (ddx / d) * tang - (ddz / d) * f.inward * fall;
              fv += f.vertical * fall * f.axisY;
            }
          }
          for (let a = 0; a < holes.length; a++) {
            const f = holes[a];
            const ddx = f.x - x; const ddy = f.y - y; const ddz = f.z - z;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz + 4;
            const d = Math.sqrt(d2);
            const s = f.mass / d2;
            fu += (ddx / d) * s; fv += (ddy / d) * s; fz += (ddz / d) * s;
          }
          const damp = 1 - Math.min(0.9, damping * dt);
          u[id] = (u[id] + fu * dt) * damp;
          v[id] = (v[id] + fv * dt) * damp;
          w[id] = (w[id] + fz * dt) * damp;
        }
      }
    }
  }

  private trilinear(field: Float32Array, gx: number, gy: number, gz: number, solidMask: boolean): number {
    const n = this.n;
    const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
    const fx = gx - i0, fy = gy - j0, fz = gz - k0;
    const cl = (c: number) => (c < 0 ? 0 : c > n - 1 ? n - 1 : c);
    const iA = cl(i0), iB = cl(i0 + 1), jA = cl(j0), jB = cl(j0 + 1), kA = cl(k0), kB = cl(k0 + 1);
    const s = this.solid;
    let sum = 0, wsum = 0;
    const take = (i: number, j: number, k: number, wt: number) => {
      const id = (j * n + k) * n + i;
      if (solidMask && s[id]) return;
      sum += field[id] * wt; wsum += wt;
    };
    take(iA, jA, kA, (1 - fx) * (1 - fy) * (1 - fz));
    take(iB, jA, kA, fx * (1 - fy) * (1 - fz));
    take(iA, jB, kA, (1 - fx) * fy * (1 - fz));
    take(iB, jB, kA, fx * fy * (1 - fz));
    take(iA, jA, kB, (1 - fx) * (1 - fy) * fz);
    take(iB, jA, kB, fx * (1 - fy) * fz);
    take(iA, jB, kB, (1 - fx) * fy * fz);
    take(iB, jB, kB, fx * fy * fz);
    return wsum > 1e-9 ? sum / wsum : 0;
  }

  private advectVelocity(dt: number): void {
    const { n, u, v, w, u0, v0, w0, solid } = this;
    u0.set(u); v0.set(v); w0.set(w);
    const inv = 1 / this.cell;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) { u[id] = 0; v[id] = 0; w[id] = 0; continue; }
          const gx = i + 0.5 - u[id] * dt * inv;
          const gy = j + 0.5 - v[id] * dt * inv;
          const gz = k + 0.5 - w[id] * dt * inv;
          u[id] = this.trilinear(u0, gx, gy, gz, true);
          v[id] = this.trilinear(v0, gx, gy, gz, true);
          w[id] = this.trilinear(w0, gx, gy, gz, true);
        }
      }
    }
  }

  private vorticityConfinement(ctx: SFContext, dt: number): void {
    const eps = ctx.vorticity;
    if (eps < 1e-4) return;
    const { n, u, v, w, curl, ox, oy, oz, solid } = this;
    const h = this.cell;
    const n2 = this.n2;
    const c05 = 0.5 / h;
    // pass 1: curl (omega = curl v) and |omega|
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) { ox[id] = 0; oy[id] = 0; oz[id] = 0; curl[id] = 0; continue; }
          const iL = i > 0 ? id - 1 : id, iR = i < n - 1 ? id + 1 : id;
          const jL = j > 0 ? id - n : id, jR = j < n - 1 ? id + n : id;
          const kL = k > 0 ? id - n2 : id, kR = k < n - 1 ? id + n2 : id;
          const wx = (w[jR] - w[jL] - (v[kR] - v[kL])) * c05;
          const wy = (u[kR] - u[kL] - (w[iR] - w[iL])) * c05;
          const wz = (v[iR] - v[iL] - (u[jR] - u[jL])) * c05;
          ox[id] = wx; oy[id] = wy; oz[id] = wz;
          curl[id] = Math.sqrt(wx * wx + wy * wy + wz * wz);
        }
      }
    }
    // pass 2: force F = eps * h * (N x omega), N = normalized grad |omega|
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) continue;
          const iL = i > 0 ? id - 1 : id, iR = i < n - 1 ? id + 1 : id;
          const jL = j > 0 ? id - n : id, jR = j < n - 1 ? id + n : id;
          const kL = k > 0 ? id - n2 : id, kR = k < n - 1 ? id + n2 : id;
          const gx = (curl[iR] - curl[iL]) * c05;
          const gy = (curl[jR] - curl[jL]) * c05;
          const gz = (curl[kR] - curl[kL]) * c05;
          const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
          if (gl < 1e-6) continue;
          const nx = gx / gl, ny = gy / gl, nz = gz / gl;
          const wx = ox[id], wy = oy[id], wz = oz[id];
          // N x omega
          const fx = ny * wz - nz * wy;
          const fy = nz * wx - nx * wz;
          const fz = nx * wy - ny * wx;
          const s = eps * h * dt;
          u[id] += fx * s;
          v[id] += fy * s;
          w[id] += fz * s;
        }
      }
    }
  }

  private project(jacobi: number): void {
    const { n, u, v, w, p, div, solid } = this;
    const h = this.cell;
    const c05 = 0.5 / h;
    // divergence
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) { div[id] = 0; continue; }
          const iL = i > 0 ? id - 1 : id, iR = i < n - 1 ? id + 1 : id;
          const jL = j > 0 ? id - n : id, jR = j < n - 1 ? id + n : id;
          const kL = k > 0 ? id - this.n2 : id, kR = k < n - 1 ? id + this.n2 : id;
          div[id] = c05 * ((u[iR] - u[iL]) + (v[jR] - v[jL]) + (w[kR] - w[kL]));
        }
      }
    }
    // Red-black Gauss-Seidel pressure solve (warm-started, Neumann via clamp)
    const iters = Math.max(1, Math.min(60, jacobi | 0));
    const n2 = this.n2;
    const hh = h * h;
    for (let it = 0; it < iters; it++) {
      for (let color = 0; color < 2; color++) {
        for (let k = 0; k < n; k++) {
          for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
              if (((i + j + k) & 1) !== color) continue;
              const id = (j * n + k) * n + i;
              if (solid[id]) continue;
              const iL = i > 0 ? id - 1 : id, iR = i < n - 1 ? id + 1 : id;
              const jL = j > 0 ? id - n : id, jR = j < n - 1 ? id + n : id;
              const kL = k > 0 ? id - n2 : id, kR = k < n - 1 ? id + n2 : id;
              p[id] = (p[iL] + p[iR] + p[jL] + p[jR] + p[kL] + p[kR] - div[id] * hh) * (1 / 6);
            }
          }
        }
      }
    }
    // subtract gradient
    let maxDiv = 0;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (j * n + k) * n + i;
          if (solid[id]) { u[id] = 0; v[id] = 0; w[id] = 0; continue; }
          const iL = i > 0 ? id - 1 : id, iR = i < n - 1 ? id + 1 : id;
          const jL = j > 0 ? id - n : id, jR = j < n - 1 ? id + n : id;
          const kL = k > 0 ? id - this.n2 : id, kR = k < n - 1 ? id + this.n2 : id;
          u[id] -= c05 * (p[iR] - p[iL]);
          v[id] -= c05 * (p[jR] - p[jL]);
          w[id] -= c05 * (p[kR] - p[kL]);
        }
      }
    }
    // residual: recompute divergence on a coarse sample
    for (let k = 2; k < n; k += 4) {
      for (let j = 2; j < n; j += 4) {
        for (let i = 2; i < n; i += 4) {
          const id = (j * n + k) * n + i;
          if (solid[id]) continue;
          const iL = id - 1, iR = id + 1, jL = id - n, jR = id + n, kL = id - this.n2, kR = id + this.n2;
          const d = Math.abs(c05 * ((u[iR] - u[iL]) + (v[jR] - v[jL]) + (w[kR] - w[kL])));
          if (d > maxDiv) maxDiv = d;
        }
      }
    }
    this.divResidual = maxDiv;
  }

  private enforceSolid(): void {
    const { n3, u, v, w, solid } = this;
    for (let id = 0; id < n3; id++) {
      if (solid[id]) { u[id] = 0; v[id] = 0; w[id] = 0; }
    }
  }

  private advectDye(dt: number): void {
    const { n, n3, u, v, w, dye, solid } = this;
    const inv = 1 / this.cell;
    // snapshot dye
    this.dyeTmp.set(dye);
    const old = this.dyeTmp;
    for (let ch = 0; ch < SF_CHANNELS; ch++) {
      const base = ch * n3;
      for (let k = 0; k < n; k++) {
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const id = (j * n + k) * n + i;
            if (solid[id]) { dye[base + id] = 0; continue; }
            const gx = i + 0.5 - u[id] * dt * inv;
            const gy = j + 0.5 - v[id] * dt * inv;
            const gz = k + 0.5 - w[id] * dt * inv;
            dye[base + id] = this.trilinear(old.subarray(base, base + n3), gx, gy, gz, true);
          }
        }
      }
    }
  }

  private phaseTransitions(ctx: SFContext, dt: number): void {
    const { n3, dye, solid } = this;
    const dw = dye.subarray(0, n3);
    const dheat = dye.subarray(n3, 2 * n3);
    const dsteam = dye.subarray(2 * n3, 3 * n3);
    const dice = dye.subarray(3 * n3, 4 * n3);
    const cool = Math.min(1, dt * 0.15);
    for (let id = 0; id < n3; id++) {
      if (solid[id]) continue;
      let t = dheat[id];
      if (t !== 0) {
        t += (ctx.ambientC - t) * cool;
        dheat[id] = t;
      }
      const c = dw[id];
      if (c > 1e-4) {
        if (t >= 100) {
          // boil: water -> steam
          const k = Math.min(1, dt * 0.4 * (1 + (t - 100) * 0.02));
          const moved = c * k;
          dw[id] = c - moved;
          dsteam[id] = Math.min(1.5, dsteam[id] + moved);
          dheat[id] = t - moved * 220; // latent heat
        } else if (t <= 0) {
          // freeze: water -> ice
          const k = Math.min(1, dt * 0.3 * (1 + -t * 0.05));
          const moved = c * k;
          dw[id] = c - moved;
          dice[id] = Math.min(1.5, dice[id] + moved);
          dheat[id] = t + moved * 33; // latent heat release
        }
      }
      // ice slowly melts back
      const ci = dice[id];
      if (ci > 1e-4 && dheat[id] > 0) {
        const k = Math.min(1, dt * 0.2);
        const moved = ci * k;
        dice[id] = ci - moved;
        dw[id] = Math.min(1.5, dw[id] + moved);
        dheat[id] -= moved * 33;
      }
      // steam condenses when cool
      const cs = dsteam[id];
      if (cs > 1e-4 && dheat[id] < 60) {
        const k = Math.min(1, dt * 0.25);
        const moved = cs * k;
        dsteam[id] = cs - moved;
        dw[id] = Math.min(1.5, dw[id] + moved);
      }
    }
  }

  private computeStats(): void {
    const { n, u, v, w, dye, solid } = this;
    let maxS = 0, sumS = 0, count = 0, active = 0;
    const stride = n > 48 ? 2 : 1;
    for (let k = 0; k < n; k += stride) {
      for (let j = 0; j < n; j += stride) {
        for (let i = 0; i < n; i += stride) {
          const id = (j * n + k) * n + i;
          if (solid[id]) continue;
          const s2 = u[id] * u[id] + v[id] * v[id] + w[id] * w[id];
          if (s2 > 1e-6 || dye[id] > 0.05) {
            const s = Math.sqrt(s2);
            if (s > maxS) maxS = s;
            sumS += s;
            count++;
            if (s > 0.1 || dye[id] > 0.1) active++;
          }
        }
      }
    }
    this.maxSpeed = maxS;
    this.meanSpeed = count > 0 ? sumS / count : 0;
    this.activeCells = active;
  }
}
