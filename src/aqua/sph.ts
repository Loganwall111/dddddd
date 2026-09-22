// Position Based Fluids solver (Macklin & Müller 2013) — the core of the lab.
// Real density-constraint simulation: not a shader trick. Every particle has
// position, velocity, temperature, fluid type, foam and ice state, and responds
// to gravity fields, vortices, black holes, portals, fire, wind and bodies.

import { FLUID_LIST } from "./materials";
import type {
  BlackHoleField, BodyProxy, FireSource, GravityWell, PortalPair, VortexField,
} from "./fields";
import { Rng } from "./rng";

export interface SphFx {
  kind: "steam" | "flash" | "mist" | "ember" | "smoke";
  x: number; y: number; z: number; s: number;
}

export interface SphPush {
  proxy: number; ix: number; iy: number; iz: number;
}

export interface SphQuality {
  iterations: number;
  maxVel: number;
  xsph: number;
  activeLimit: number;
}

export interface SphContext {
  dt: number;
  time: number;
  gravityX: number; gravityY: number; gravityZ: number;
  ambientC: number;
  windX: number; windY: number; windZ: number; windDrag: number;
  terrainHeight: (x: number, z: number) => number;
  wells: GravityWell[];
  vortices: VortexField[];
  holes: BlackHoleField[];
  portals: PortalPair[];
  proxies: BodyProxy[];
  fires: FireSource[];
  fx: SphFx[];
  push: SphPush[];
  quality: SphQuality;
}

// Kernel radius is exactly 1m, so all kernel coefficients are compile-time.
const H2 = 1.0;
const POLY6 = 1.566681; // 315 / (64 * pi * h^9)
const SPIKY = 14.323944; // 45 / (pi * h^6)
const PARTICLE_MASS = 238; // restDensity * spacing^3  (spacing ~0.62m)
const PARTICLE_R = 0.35;
const NBR_CAP = 110;

export class FluidSolver {
  readonly capacity: number;
  n = 0;

  px: Float32Array; py: Float32Array; pz: Float32Array;
  ox: Float32Array; oy: Float32Array; oz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  fx: Float32Array; fy: Float32Array; fz: Float32Array; // cohesion accel accumulator
  dx: Float32Array; dy: Float32Array; dz: Float32Array; // position correction
  lambda: Float32Array;
  densC: Float32Array; // constraint value (viz: pressure)
  temp: Float32Array;
  foam: Float32Array;
  ice: Float32Array;
  fluid: Uint8Array;
  collX: Float32Array; collY: Float32Array; collZ: Float32Array;
  collFlag: Uint8Array;

  private head: Int32Array;
  private nxt: Int32Array;
  private mask: number;
  private nbr: Int32Array = new Int32Array(NBR_CAP + 1);
  private proxyGrid = new Map<number, number[]>();
  private rng = new Rng(1337);

  // per-step telemetry
  maxSpeed = 0;
  meanSpeed = 0;
  volumeM3 = 0;
  neighborAvg = 0;
  impactSum = 0;

  constructor(capacity: number, seed: number) {
    this.capacity = capacity;
    const c = capacity;
    this.px = new Float32Array(c); this.py = new Float32Array(c); this.pz = new Float32Array(c);
    this.ox = new Float32Array(c); this.oy = new Float32Array(c); this.oz = new Float32Array(c);
    this.vx = new Float32Array(c); this.vy = new Float32Array(c); this.vz = new Float32Array(c);
    this.fx = new Float32Array(c); this.fy = new Float32Array(c); this.fz = new Float32Array(c);
    this.dx = new Float32Array(c); this.dy = new Float32Array(c); this.dz = new Float32Array(c);
    this.lambda = new Float32Array(c);
    this.densC = new Float32Array(c);
    this.temp = new Float32Array(c);
    this.foam = new Float32Array(c);
    this.ice = new Float32Array(c);
    this.fluid = new Uint8Array(c);
    this.collX = new Float32Array(c); this.collY = new Float32Array(c); this.collZ = new Float32Array(c);
    this.collFlag = new Uint8Array(c);
    let t = 1;
    while (t < capacity * 4) t <<= 1;
    this.mask = t - 1;
    this.head = new Int32Array(t);
    this.nxt = new Int32Array(c);
    this.rng = new Rng(seed);
  }

  clear(): void {
    this.n = 0;
  }

  private hashCell(ix: number, iy: number, iz: number): number {
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & this.mask;
  }

  private buildGrid(): void {
    this.head.fill(-1);
    const { px, py, pz, nxt } = this;
    for (let i = 0; i < this.n; i++) {
      const h = this.hashCell(Math.floor(px[i]), Math.floor(py[i]), Math.floor(pz[i]));
      nxt[i] = this.head[h];
      this.head[h] = i;
    }
  }

  /** Gather neighbor indices of particle i into this.nbr. Returns count. */
  private gather(i: number): number {
    const { px, py, pz, head, nxt, nbr } = this;
    const x = px[i]; const y = py[i]; const z = pz[i];
    const cx = Math.floor(x); const cy = Math.floor(y); const cz = Math.floor(z);
    let count = 0;
    for (let ax = -1; ax <= 1; ax++) {
      for (let ay = -1; ay <= 1; ay++) {
        for (let az = -1; az <= 1; az++) {
          let j = head[this.hashCell(cx + ax, cy + ay, cz + az)];
          while (j !== -1) {
            if (j !== i) {
              const dx = px[j] - x; const dy = py[j] - y; const dz = pz[j] - z;
              if (dx * dx + dy * dy + dz * dz < H2) {
                if (count < NBR_CAP) nbr[count++] = j;
              }
            }
            j = nxt[j];
          }
        }
      }
    }
    return count;
  }

  private buildProxyGrid(proxies: BodyProxy[]): void {
    this.proxyGrid.clear();
    const cell = 6;
    for (let p = 0; p < proxies.length; p++) {
      const b = proxies[p];
      const r = b.radius + 1;
      const x0 = Math.floor((b.x - r) / cell); const x1 = Math.floor((b.x + r) / cell);
      const y0 = Math.floor((b.y - r) / cell); const y1 = Math.floor((b.y + r) / cell);
      const z0 = Math.floor((b.z - r) / cell); const z1 = Math.floor((b.z + r) / cell);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          for (let iz = z0; iz <= z1; iz++) {
            const key = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
            let arr = this.proxyGrid.get(key);
            if (!arr) { arr = []; this.proxyGrid.set(key, arr); }
            arr.push(p);
          }
        }
      }
    }
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number,
    fluidId: number, tempC: number, spread: number, count: number, limit: number): number {
    let spawned = 0;
    for (let k = 0; k < count && this.n < limit && this.n < this.capacity; k++) {
      const i = this.n++;
      const jx = (this.rng.next() - 0.5) * spread;
      const jy = (this.rng.next() - 0.5) * spread;
      const jz = (this.rng.next() - 0.5) * spread;
      this.px[i] = x + jx; this.py[i] = y + jy; this.pz[i] = z + jz;
      this.ox[i] = x + jx; this.oy[i] = y + jy; this.oz[i] = z + jz;
      this.vx[i] = vx + jx * 2; this.vy[i] = vy + jy * 2; this.vz[i] = vz + jz * 2;
      this.fluid[i] = fluidId;
      this.temp[i] = tempC;
      this.foam[i] = 0; this.ice[i] = 0;
      this.lambda[i] = 0; this.densC[i] = 0;
      spawned++;
    }
    return spawned;
  }

  emitBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
    spacing: number, fluidId: number, tempC: number, limit: number): number {
    let spawned = 0;
    for (let x = minX; x <= maxX && this.n < limit && this.n < this.capacity; x += spacing) {
      for (let y = minY; y <= maxY && this.n < limit && this.n < this.capacity; y += spacing) {
        for (let z = minZ; z <= maxZ && this.n < limit && this.n < this.capacity; z += spacing) {
          const i = this.n++;
          this.px[i] = x; this.py[i] = y; this.pz[i] = z;
          this.ox[i] = x; this.oy[i] = y; this.oz[i] = z;
          this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
          this.fluid[i] = fluidId;
          this.temp[i] = tempC;
          this.foam[i] = 0; this.ice[i] = 0;
          spawned++;
        }
      }
    }
    return spawned;
  }

  private kill(i: number): void {
    const l = --this.n;
    if (i === l) return;
    this.px[i] = this.px[l]; this.py[i] = this.py[l]; this.pz[i] = this.pz[l];
    this.ox[i] = this.ox[l]; this.oy[i] = this.oy[l]; this.oz[i] = this.oz[l];
    this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
    this.temp[i] = this.temp[l]; this.foam[i] = this.foam[l]; this.ice[i] = this.ice[l];
    this.fluid[i] = this.fluid[l];
  }

  /** Remove calm, old, distant particles when over budget (graceful degradation). */
  cullDistant(cx: number, cy: number, cz: number, maxDist: number, target: number): void {
    if (this.n <= target) return;
    const md2 = maxDist * maxDist;
    for (let i = this.n - 1; i >= 0 && this.n > target; i--) {
      const dx = this.px[i] - cx; const dy = this.py[i] - cy; const dz = this.pz[i] - cz;
      const sp2 = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] + this.vz[i] * this.vz[i];
      if (dx * dx + dy * dy + dz * dz > md2 && sp2 < 4) this.kill(i);
    }
  }

  sampleVelocity(x: number, y: number, z: number, out: { x: number; y: number; z: number }): number {
    // Average velocity of particles near a point (used for body drag coupling).
    const { px, py, pz, vx, vy, vz, head, nxt } = this;
    const cx = Math.floor(x); const cy = Math.floor(y); const cz = Math.floor(z);
    let sx = 0; let sy = 0; let sz = 0; let w = 0;
    for (let ax = -1; ax <= 1; ax++) {
      for (let ay = -1; ay <= 1; ay++) {
        for (let az = -1; az <= 1; az++) {
          let j = head[this.hashCell(cx + ax, cy + ay, cz + az)];
          while (j !== -1) {
            const dx = px[j] - x; const dy = py[j] - y; const dz = pz[j] - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 4) {
              const k = 1 - d2 / 4;
              sx += vx[j] * k; sy += vy[j] * k; sz += vz[j] * k; w += k;
            }
            j = nxt[j];
          }
        }
      }
    }
    if (w > 0.001) { out.x = sx / w; out.y = sy / w; out.z = sz / w; }
    else { out.x = 0; out.y = 0; out.z = 0; }
    return w;
  }

  step(ctx: SphContext): void {
    const dt = ctx.dt;
    const n = this.n;
    if (n === 0) { this.maxSpeed = 0; this.meanSpeed = 0; this.volumeM3 = 0; return; }
    const { px, py, pz, ox, oy, oz, vx, vy, vz } = this;
    const q = ctx.quality;

    // ---- 1. External forces + predict ----
    const gX = ctx.gravityX; const gY = ctx.gravityY; const gZ = ctx.gravityZ;
    const wX = ctx.windX; const wY = ctx.windY; const wZ = ctx.windZ;
    const drag = ctx.windDrag;
    const wells = ctx.wells; const vortices = ctx.vortices; const holes = ctx.holes;
    for (let i = 0; i < n; i++) {
      let ax = gX; let ay = gY; let az = gZ;
      const x = px[i]; const y = py[i]; const z = pz[i];
      for (let w = 0; w < wells.length; w++) {
        const f = wells[w];
        const dx = f.x - x; const dy = f.y - y; const dz = f.z - z;
        const d2 = dx * dx + dy * dy + dz * dz + f.softening;
        const d = Math.sqrt(d2);
        if (d < f.radius && d > 1e-4) {
          const s = (f.strength / d2) * (1 - d / f.radius);
          ax += (dx / d) * s; ay += (dy / d) * s; az += (dz / d) * s;
        }
      }
      for (let v = 0; v < vortices.length; v++) {
        const f = vortices[v];
        const dx = x - f.x; const dz = z - f.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < f.radius && d > 1e-4) {
          const fall = 1 - d / f.radius;
          const core = f.radius * 0.18;
          const tang = f.swirl * fall / Math.max(d, core);
          ax += (-dz / d) * tang - (dx / d) * f.inward * fall;
          az += (dx / d) * tang - (dz / d) * f.inward * fall;
          ay += f.vertical * fall * f.axisY;
        }
      }
      for (let b = 0; b < holes.length; b++) {
        const f = holes[b];
        const dx = f.x - x; const dy = f.y - y; const dz = f.z - z;
        const d2 = dx * dx + dy * dy + dz * dz + 4;
        const d = Math.sqrt(d2);
        const s = f.mass / d2;
        ax += (dx / d) * s; ay += (dy / d) * s; az += (dz / d) * s;
      }
      // air drag toward wind
      ax += (wX - vx[i]) * drag;
      ay += (wY - vy[i]) * drag;
      az += (wZ - vz[i]) * drag;

      let nvx = vx[i] + ax * dt;
      let nvy = vy[i] + ay * dt;
      let nvz = vz[i] + az * dt;
      const sp2 = nvx * nvx + nvy * nvy + nvz * nvz;
      const mv = q.maxVel;
      if (sp2 > mv * mv) {
        const s = mv / Math.sqrt(sp2);
        nvx *= s; nvy *= s; nvz *= s;
      }
      vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;
      ox[i] = x; oy[i] = y; oz[i] = z;
      px[i] = x + nvx * dt; py[i] = y + nvy * dt; pz[i] = z + nvz * dt;
      this.fx[i] = 0; this.fy[i] = 0; this.fz[i] = 0;
      this.collFlag[i] = 0;
    }

    // ---- 2. Grid ----
    this.buildGrid();
    this.buildProxyGrid(ctx.proxies);

    // ---- 3. Density + lambda (+ cohesion accumulation) ----
    const nbr = this.nbr;
    let nbrSum = 0;
    for (let i = 0; i < n; i++) {
      const count = this.gather(i);
      nbrSum += count;
      const rest = FLUID_LIST[this.fluid[i]].density;
      const x = px[i]; const y = py[i]; const z = pz[i];
      let rho = PARTICLE_MASS * POLY6;
      let sumGrad2 = 0;
      let cohX = 0; let cohY = 0; let cohZ = 0;
      const cohesion = FLUID_LIST[this.fluid[i]].cohesion * 6;
      for (let k = 0; k < count; k++) {
        const j = nbr[k];
        const dx = x - px[j]; const dy = y - py[j]; const dz = z - pz[j];
        const r2 = dx * dx + dy * dy + dz * dz;
        rho += PARTICLE_MASS * POLY6 * (1 - r2) * (1 - r2) * (1 - r2);
        const r = Math.sqrt(r2);
        if (r > 1e-5) {
          const t = SPIKY * (1 - r) * (1 - r) / r;
          // PBF paper form: denominator is SUM |grad W|^2 / rho0 + eps
          sumGrad2 += t * t;
          // explicit cohesion (surface tension look, stable at small sigma)
          const cq = 1 - r;
          const cs = cohesion * cq * cq;
          cohX -= dx * cs; cohY -= dy * cs; cohZ -= dz * cs;
        }
      }
      const C = rho / rest - 1;
      this.densC[i] = C;
      let li2 = -C / (sumGrad2 / rest + 0.1);
      this.lambda[i] = li2 > 20 ? 20 : li2 < -20 ? -20 : li2;
      this.fx[i] = cohX; this.fy[i] = cohY; this.fz[i] = cohZ;
    }
    this.neighborAvg = n > 0 ? nbrSum / n : 0;

    // ---- 4. Solver iterations: position correction + collision projection ----
    const terrainHeight = ctx.terrainHeight;
    const proxies = ctx.proxies;
    const pushAcc = new Map<number, { x: number; y: number; z: number }>();
    for (let it = 0; it < q.iterations; it++) {
      for (let i = 0; i < n; i++) {
        const count = this.gather(i);
        const rest = FLUID_LIST[this.fluid[i]].density;
        const li = this.lambda[i];
        const x = px[i]; const y = py[i]; const z = pz[i];
        let ddx = 0; let ddy = 0; let ddz = 0;
        for (let k = 0; k < count; k++) {
          const j = nbr[k];
          const dx = x - px[j]; const dy = y - py[j]; const dz = z - pz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 > 1e-10 && r2 < H2) {
            const r = Math.sqrt(r2);
            const t = SPIKY * (1 - r) * (1 - r) / r;
            const s = -(li + this.lambda[j]) * t / rest;
            ddx += dx * s; ddy += dy * s; ddz += dz * s;
          }
        }
        // clamp correction (stability guard: never teleport)
        const c2 = ddx * ddx + ddy * ddy + ddz * ddz;
        const maxC = 0.3;
        if (c2 > maxC * maxC) {
          const s = maxC / Math.sqrt(c2);
          ddx *= s; ddy *= s; ddz *= s;
        }
        px[i] = x + ddx; py[i] = y + ddy; pz[i] = z + ddz;
      }
      this.projectCollisions(ctx, terrainHeight, proxies, pushAcc, it === q.iterations - 1);
    }

    // emit aggregated body impulses
    for (const [id, v] of pushAcc) {
      const m2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (m2 > 1e-6) ctx.push.push({ proxy: id, ix: v.x, iy: v.y, iz: v.z });
    }

    // ---- 5. Portals, capture, velocity update, thermal, kill ----
    this.finishStep(ctx, dt);
  }

  private projectCollisions(
    ctx: SphContext,
    terrainHeight: (x: number, z: number) => number,
    proxies: BodyProxy[],
    pushAcc: Map<number, { x: number; y: number; z: number }>,
    record: boolean,
  ): void {
    const { px, py, pz } = this;
    const n = this.n;
    const dt = Math.max(ctx.dt, 1e-5);
    for (let i = 0; i < n; i++) {
      let x = px[i]; let y = py[i]; let z = pz[i];
      // world walls
      if (x < -124) x = -124; else if (x > 124) x = 124;
      if (z < -124) z = -124; else if (z > 124) z = 124;
      if (y > 148) y = 148;
      // terrain
      const th = terrainHeight(x, z);
      if (y < th + PARTICLE_R) {
        y = th + PARTICLE_R;
        if (record) {
          const e = 0.6;
          const nx = (terrainHeight(x - e, z) - terrainHeight(x + e, z)) / (2 * e);
          const nz = (terrainHeight(x, z - e) - terrainHeight(x, z + e)) / (2 * e);
          const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
          this.collX[i] = nx * inv; this.collY[i] = inv; this.collZ[i] = nz * inv;
          this.collFlag[i] = 1;
          const impact = Math.abs(this.vy[i]);
          if (impact > 7) {
            this.impactSum += impact;
            if (ctx.fx.length < 240 && this.rng.next() < 0.02 * impact) {
              ctx.fx.push({ kind: "mist", x, y: y + 0.3, z, s: 0.5 + impact * 0.05 });
            }
          }
        }
      }
      // rigid body proxies
      const cell = 6;
      const key = (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
      const arr = this.proxyGrid.get(key);
      if (arr) {
        for (let a = 0; a < arr.length; a++) {
          const b = proxies[arr[a]];
          const dx = x - b.x; const dy = y - b.y; const dz = z - b.z;
          const rr = b.radius + PARTICLE_R;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const pushOut = rr - d;
            const nx = dx / d; const ny = dy / d; const nz = dz / d;
            x += nx * pushOut; y += ny * pushOut; z += nz * pushOut;
            // Newton's third law: particle pushes the body
            let acc = pushAcc.get(b.id);
            if (!acc) { acc = { x: 0, y: 0, z: 0 }; pushAcc.set(b.id, acc); }
            const k = PARTICLE_MASS * pushOut / dt / Math.max(proxies.length, 1);
            const share = Math.min(k, PARTICLE_MASS * 4) * 0.02;
            acc.x -= nx * share; acc.y -= ny * share; acc.z -= nz * share;
            if (record) {
              this.collX[i] = nx; this.collY[i] = ny; this.collZ[i] = nz;
              this.collFlag[i] = 2;
            }
          }
        }
      }
      px[i] = x; py[i] = y; pz[i] = z;
    }
  }

  private finishStep(ctx: SphContext, dt: number): void {
    const invDt = 1 / Math.max(dt, 1e-5);
    const { px, py, pz, ox, oy, oz, vx, vy, vz } = this;
    const nbr = this.nbr;
    const portals = ctx.portals;
    const holes = ctx.holes;
    const fires = ctx.fires;
    const ambient = ctx.ambientC;
    const q = ctx.quality;

    // portal traversal (position + history transformed together => momentum preserved)
    for (let i = 0; i < this.n; i++) {
      for (let p = 0; p < portals.length; p++) {
        const pt = portals[p];
        const ox0 = ox[i] - pt.ax; const oy0 = oy[i] - pt.ay; const oz0 = oz[i] - pt.az;
        const d0 = ox0 * pt.anx + oy0 * pt.any + oz0 * pt.anz;
        const d1 = (px[i] - pt.ax) * pt.anx + (py[i] - pt.ay) * pt.any + (pz[i] - pt.az) * pt.anz;
        if ((d0 > 0) !== (d1 > 0)) {
          const t = d0 / (d0 - d1);
          const hx = ox[i] + (px[i] - ox[i]) * t - pt.ax;
          const hy = oy[i] + (py[i] - oy[i]) * t - pt.ay;
          const hz = oz[i] + (pz[i] - oz[i]) * t - pt.az;
          const hd2 = hx * hx + hy * hy + hz * hz;
          if (hd2 < pt.radius * pt.radius) {
            // rotate entrance frame onto exit frame
            const quat = quatFromTo(pt.anx, pt.any, pt.anz, pt.bnx, pt.bny, pt.bnz);
            const rx = quat[0]; const ry = quat[1]; const rz = quat[2]; const rw = quat[3];
            const offx = px[i] - pt.ax; const offy = py[i] - pt.ay; const offz = pz[i] - pt.az;
            const rox = rotX(rx, ry, rz, rw, offx, offy, offz);
            const roy = rotY(rx, ry, rz, rw, offx, offy, offz);
            const roz = rotZ(rx, ry, rz, rw, offx, offy, offz);
            px[i] = pt.bx + rox + pt.bnx * 0.6;
            py[i] = pt.by + roy + pt.bny * 0.6;
            pz[i] = pt.bz + roz + pt.bnz * 0.6;
            const wvx = vx[i]; const wvy = vy[i]; const wvz = vz[i];
            vx[i] = rotX(rx, ry, rz, rw, wvx, wvy, wvz);
            vy[i] = rotY(rx, ry, rz, rw, wvx, wvy, wvz);
            vz[i] = rotZ(rx, ry, rz, rw, wvx, wvy, wvz);
            ox[i] = px[i] - vx[i] * dt;
            oy[i] = py[i] - vy[i] * dt;
            oz[i] = pz[i] - vz[i] * dt;
            if (ctx.fx.length < 240) ctx.fx.push({ kind: "flash", x: pt.bx, y: pt.by, z: pt.bz, s: 1 });
          }
        }
      }
    }

    let maxSp = 0;
    let sumSp = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      let x = px[i]; let y = py[i]; let z = pz[i];

      // black hole capture
      let captured = false;
      for (let b = 0; b < holes.length; b++) {
        const f = holes[b];
        const dx = x - f.x; const dy = y - f.y; const dz = z - f.z;
        if (dx * dx + dy * dy + dz * dz < f.horizon * f.horizon) {
          captured = true;
          if (ctx.fx.length < 240) ctx.fx.push({ kind: "flash", x: f.x, y: f.y, z: f.z, s: 2 });
          break;
        }
      }
      if (captured || y < -30 || !isFinite(x + y + z)) {
        this.kill(i);
        continue;
      }

      // velocity from positions + cohesion + XSPH viscosity
      let nvx = (x - ox[i]) * invDt + this.fx[i] * dt;
      let nvy = (y - oy[i]) * invDt + this.fy[i] * dt;
      let nvz = (z - oz[i]) * invDt + this.fz[i] * dt;

      const count = this.gather(i);
      const visc = FLUID_LIST[this.fluid[i]].viscosity;
      const c = Math.min(q.xsph * (0.4 + visc * 0.22), 0.65);
      if (c > 0.001 && count > 0) {
        let ax = 0; let ay = 0; let az = 0;
        for (let k = 0; k < count; k++) {
          const j = nbr[k];
          const dx = x - px[j]; const dy = y - py[j]; const dz = z - pz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 < H2) {
            const wgt = POLY6 * (1 - r2) * (1 - r2) * (1 - r2);
            ax += (vx[j] - nvx) * wgt; ay += (vy[j] - nvy) * wgt; az += (vz[j] - nvz) * wgt;
          }
        }
        nvx += ax * c; nvy += ay * c; nvz += az * c;
      }

      // collision response: kill normal velocity, damp tangent
      if (this.collFlag[i] !== 0) {
        const nx = this.collX[i]; const ny = this.collY[i]; const nz = this.collZ[i];
        const vn = nvx * nx + nvy * ny + nvz * nz;
        if (vn < 0) {
          nvx -= nx * vn * 1.0;
          nvy -= ny * vn * 1.0;
          nvz -= nz * vn * 1.0;
        }
        nvx *= 0.985; nvy *= 0.985; nvz *= 0.985;
      }

      const sp2 = nvx * nvx + nvy * nvy + nvz * nvz;
      const mv = q.maxVel;
      if (sp2 > mv * mv) {
        const s = mv / Math.sqrt(sp2);
        nvx *= s; nvy *= s; nvz *= s;
      }
      const sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz);
      if (sp > maxSp) maxSp = sp;
      sumSp += sp;
      vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;

      // ---- thermal: diffusion, fire, phase transitions ----
      const fdef = FLUID_LIST[this.fluid[i]];
      let t = this.temp[i];
      t += (ambient - t) * Math.min(1, dt * 0.15);
      for (let f = 0; f < fires.length; f++) {
        const fr = fires[f];
        const dx = x - fr.x; const dy = y - fr.y; const dz = z - fr.z;
        const rr = fr.radius + 0.5;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          t += (1400 - t) * Math.min(1, dt * 6);
          nvy += 6 * dt; // convective updraft
          vy[i] = nvy;
        }
      }
      // lava-water contact cooling handled implicitly via neighbor temp mix:
      if (count > 0 && (this.fluid[i] === 3 || t > 90)) {
        let nt = 0;
        for (let k = 0; k < count; k++) nt += this.temp[nbr[k]];
        nt /= count;
        t += (nt - t) * Math.min(1, dt * 2.5);
      }
      this.temp[i] = t;

      // freezing: stiffen + crust
      if (t < fdef.freezeC) {
        this.ice[i] = Math.min(1, this.ice[i] + dt * 1.5);
        const stiff = 1 - Math.min(0.9, dt * (2 + this.ice[i] * 8));
        vx[i] *= stiff; vy[i] *= stiff; vz[i] *= stiff;
      } else {
        this.ice[i] = Math.max(0, this.ice[i] - dt * 0.8);
      }

      // boiling: evaporate into steam
      if (t > fdef.boilC) {
        const p = Math.min(1, dt * (t - fdef.boilC) * 0.08 + (fdef.id === 5 ? dt * 3 : 0));
        if (this.rng.next() < p) {
          if (ctx.fx.length < 240) {
            ctx.fx.push({ kind: fdef.id === 3 ? "smoke" : "steam", x, y, z, s: 1 });
          }
          this.kill(i);
          continue;
        }
        if (fdef.id === 2 && t > 250 && ctx.fx.length < 240 && this.rng.next() < dt * 4) {
          ctx.fx.push({ kind: "ember", x, y: y + 0.3, z, s: 1 });
        }
      }

      // foam: agitation creates it, calm water loses it
      if (sp > 6 || this.densC[i] > 0.35) this.foam[i] = Math.min(1, this.foam[i] + dt * 2.5);
      else this.foam[i] = Math.max(0, this.foam[i] - dt * 0.9);
    }

    this.maxSpeed = maxSp;
    this.meanSpeed = this.n > 0 ? sumSp / this.n : 0;
    this.volumeM3 = (this.n * PARTICLE_MASS) / 1000;
  }
}

// ---- minimal quaternion helpers (portal frame rotation, no three dependency) ----
function quatFromTo(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number[] {
  const dot = ax * bx + ay * by + az * bz;
  if (dot > 0.9999) return [0, 0, 0, 1];
  if (dot < -0.9999) {
    // opposite: rotate around any perpendicular axis
    let px = 1; let py = 0; let pz = 0;
    if (Math.abs(ax) > 0.9) { px = 0; py = 1; pz = 0; }
    const cx = ay * pz - az * py;
    const cy = az * px - ax * pz;
    const cz = ax * py - ay * px;
    const inv = 1 / Math.sqrt(cx * cx + cy * cy + cz * cz + 1e-9);
    return [cx * inv, cy * inv, cz * inv, 0];
  }
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const w = 1 + dot;
  const inv = 1 / Math.sqrt(cx * cx + cy * cy + cz * cz + w * w);
  return [cx * inv, cy * inv, cz * inv, w * inv];
}

function rotX(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number): number {
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  return x + 2 * (qw * uvx + qy * uvz - qz * uvy);
}
function rotY(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number): number {
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  return y + 2 * (qw * uvy + qz * uvx - qx * uvz);
}
function rotZ(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number): number {
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  return z + 2 * (qw * uvz + qx * uvy - qy * uvx);
}
