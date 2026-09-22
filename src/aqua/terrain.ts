// Procedural terrain: analytic height-field + live erosion grid + wetness map.
// One height function drives the visual mesh, the SPH collision, the Rapier
// heightfield collider and the ocean shore-foam — they can never disagree.

import * as THREE from "three";
import { Rng } from "./rng";

export const WORLD_SIZE = 240;
export const HALF = WORLD_SIZE / 2;
export const DAM_X = -52;
export const RIVER_Z_BASE = -62;
export const SEA_LEVEL = 0;

export function riverZ(x: number): number {
  return RIVER_Z_BASE + 6 * Math.sin(x * 0.045);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Noise2 {
  private p: Uint8Array;
  constructor(seed: number) {
    const rng = new Rng(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  private grad(h: number, x: number, y: number): number {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = x * x * (3 - 2 * x);
    const v = y * y * (3 - 2 * y);
    const a = this.p[X] + Y;
    const b = this.p[X + 1] + Y;
    return lerp(
      lerp(this.grad(this.p[a], x, y), this.grad(this.p[b], x - 1, y), u),
      lerp(this.grad(this.p[a + 1], x, y - 1), this.grad(this.p[b + 1], x - 1, y - 1), u),
      v,
    );
  }
  fbm(x: number, y: number, oct: number): number {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise(x * f, y * f);
      a *= 0.5;
      f *= 2.03;
    }
    return s;
  }
}

export function analyticHeight(x: number, z: number, noise: Noise2): number {
  const ocean = smoothstep(35, 75, x);
  let h = 8 - ocean * 22.5;
  const hillW = 1 - smoothstep(-115, -55, x);
  h += hillW * 15;
  h += smoothstep(60, 115, Math.abs(z)) * 9;
  const n = noise.fbm(x * 0.03 + 7.3, z * 0.03 + 2.1, 3);
  h += n * 4.5 * (1 - ocean * 0.85);
  // city pad
  const padX = smoothstep(-74, -62, x) * (1 - smoothstep(32, 44, x));
  const padZ = 1 - smoothstep(46, 58, Math.abs(z));
  const pad = padX * padZ;
  h = h * (1 - pad) + 6 * pad;
  // river carve
  const rd = Math.abs(z - riverZ(x));
  const carve = 1 - smoothstep(3.5, 10, rd);
  const bed = x < DAM_X ? 3 : 3 - smoothstep(DAM_X, 55, x) * 8;
  h = lerp(h, Math.min(h, bed), carve * 0.96);
  if (h < -15) h = -15;
  if (h > 42) h = 42;
  return h;
}

const COLL_N = 96; // collider subdivisions (97x97 heights)
const WET_N = 64;
const FOAM_N = 128;

export class Terrain {
  readonly noise: Noise2;
  readonly erosion = new Float32Array((COLL_N + 1) * (COLL_N + 1));
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly wetTexture: THREE.DataTexture;
  readonly foamTexture: THREE.DataTexture;
  private wetGrid = new Float32Array(WET_N * WET_N);
  private geo: THREE.PlaneGeometry;
  private wetUniform = { value: null as THREE.DataTexture | null };
  colliderDirty = true;
  private foamTimer = 0;

  constructor(seed: number) {
    this.noise = new Noise2(seed);
    // visual mesh
    this.geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
    this.geo.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });
    const wetUniform = this.wetUniform;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uWetMap = wetUniform as unknown as THREE.IUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vWetUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvWetUv = uv;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uWetMap;\nvarying vec2 vWetUv;\nfloat gWet = 0.0;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ngWet = texture2D(uWetMap, vWetUv).r;\ndiffuseColor.rgb *= (1.0 - 0.48 * gWet);")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, gWet);");
    };
    this.material.customProgramCacheKey = () => "aqua-terrain-wet";
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    // wetness texture
    const wetData = new Uint8Array(WET_N * WET_N);
    this.wetTexture = new THREE.DataTexture(wetData, WET_N, WET_N, THREE.RedFormat);
    this.wetTexture.needsUpdate = true;
    this.wetUniform.value = this.wetTexture;
    // foam/depth texture for the ocean shader
    const foamData = new Uint8Array(FOAM_N * FOAM_N);
    this.foamTexture = new THREE.DataTexture(foamData, FOAM_N, FOAM_N, THREE.RedFormat);
    this.foamTexture.needsUpdate = true;
    this.refreshMesh();
    this.refreshFoamTexture();
  }

  height(x: number, z: number): number {
    const base = analyticHeight(x, z, this.noise);
    // erosion bilinear
    const gx = ((x + HALF) / WORLD_SIZE) * COLL_N;
    const gz = ((z + HALF) / WORLD_SIZE) * COLL_N;
    if (gx < 0 || gz < 0 || gx > COLL_N - 0.001 || gz > COLL_N - 0.001) return base;
    const ix = Math.floor(gx); const iz = Math.floor(gz);
    const fx = gx - ix; const fz = gz - iz;
    const N = COLL_N + 1;
    const a = this.erosion[ix * N + iz];
    const b = this.erosion[(ix + 1) * N + iz];
    const c = this.erosion[ix * N + iz + 1];
    const d = this.erosion[(ix + 1) * N + iz + 1];
    return base + lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }

  /** Carve (negative depth) or deposit (positive) terrain. Returns cells touched. */
  dent(x: number, z: number, radius: number, depth: number): number {
    const N = COLL_N + 1;
    const cell = WORLD_SIZE / COLL_N;
    const gr = radius / cell;
    const cx = ((x + HALF) / WORLD_SIZE) * COLL_N;
    const cz = ((z + HALF) / WORLD_SIZE) * COLL_N;
    let touched = 0;
    const r0 = Math.max(0, Math.floor(cx - gr));
    const r1 = Math.min(COLL_N, Math.ceil(cx + gr));
    const c0 = Math.max(0, Math.floor(cz - gr));
    const c1 = Math.min(COLL_N, Math.ceil(cz + gr));
    for (let ix = r0; ix <= r1; ix++) {
      for (let iz = c0; iz <= c1; iz++) {
        const dx = ix - cx; const dz = iz - cz;
        const d = Math.sqrt(dx * dx + dz * dz) / Math.max(gr, 0.001);
        if (d < 1) {
          const k = (1 - d * d) * (1 - d * d);
          this.erosion[ix * N + iz] += depth * k;
          touched++;
        }
      }
    }
    if (touched > 0) this.colliderDirty = true;
    return touched;
  }

  /** Static trimesh for the Rapier ground collider (explicit winding, no ambiguity). */
  colliderTrimesh(): { vertices: Float32Array; indices: Uint32Array } {
    const N = COLL_N + 1;
    const vertices = new Float32Array(N * N * 3);
    const step = WORLD_SIZE / COLL_N;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const i = (iz * N + ix) * 3;
        const x = -HALF + ix * step;
        const z = -HALF + iz * step;
        vertices[i] = x;
        vertices[i + 1] = analyticHeight(x, z, this.noise) + this.erosion[ix * N + iz];
        vertices[i + 2] = z;
      }
    }
    const indices = new Uint32Array(COLL_N * COLL_N * 6);
    let k = 0;
    for (let iz = 0; iz < COLL_N; iz++) {
      for (let ix = 0; ix < COLL_N; ix++) {
        const a = iz * N + ix;
        const b = a + 1;
        const c = a + N;
        const d = c + 1;
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d;
      }
    }
    return { vertices, indices };
  }

  refreshMesh(): void {
    const pos = this.geo.getAttribute("position") as THREE.BufferAttribute;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const seg = 128;
    const step = WORLD_SIZE / seg;
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const idx = iz * (seg + 1) + ix;
        const x = -HALF + ix * step;
        const z = -HALF + iz * step;
        const h = this.height(x, z);
        pos.setY(idx, h);
        // slope estimate
        const hx = this.height(x + 1.2, z) - this.height(x - 1.2, z);
        const hz = this.height(x, z + 1.2) - this.height(x, z - 1.2);
        const slope = Math.sqrt(hx * hx + hz * hz) / 2.4;
        const riverD = Math.abs(z - riverZ(x));
        let r: number; let g: number; let b: number;
        if (h < 0.4) { r = 0.42; g = 0.38; b = 0.27; } // seabed sand
        else if (h < 1.6) { r = 0.62; g = 0.55; b = 0.4; } // beach
        else if (slope > 0.85) { r = 0.32; g = 0.3; b = 0.29; } // cliff rock
        else if (h > 30) { r = 0.82; g = 0.85; b = 0.9; } // snow
        else if (h > 15) { const t = (h - 15) / 15; r = lerp(0.25, 0.45, t); g = lerp(0.4, 0.44, t); b = lerp(0.2, 0.4, t); }
        else { r = 0.23; g = 0.38; b = 0.18; } // grass
        // city pad concrete
        const padX = smoothstep(-74, -62, x) * (1 - smoothstep(32, 44, x));
        const padZ = 1 - smoothstep(46, 58, Math.abs(z));
        const pad = padX * padZ;
        if (pad > 0.5 && h > 1.5) { r = 0.3; g = 0.3; b = 0.3; }
        // riverbed mud
        if (riverD < 6 && h < 5) { r = 0.3; g = 0.24; b = 0.16; }
        // subtle variation
        const v = (this.noise.noise(x * 0.4, z * 0.4) + 1) * 0.04;
        colors[idx * 3] = r + v; colors[idx * 3 + 1] = g + v; colors[idx * 3 + 2] = b + v * 0.8;
      }
    }
    pos.needsUpdate = true;
    this.geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  refreshFoamTexture(): void {
    const data = this.foamTexture.image.data as Uint8Array;
    const step = WORLD_SIZE / (FOAM_N - 1);
    for (let r = 0; r < FOAM_N; r++) {
      for (let c = 0; c < FOAM_N; c++) {
        const h = this.height(-HALF + c * step, -HALF + r * step);
        data[r * FOAM_N + c] = Math.max(0, Math.min(255, Math.round(((h + 20) / 64) * 255)));
      }
    }
    this.foamTexture.needsUpdate = true;
  }

  stampWet(x: number, z: number, amount: number, radius = 1): void {
    const u = (x + HALF) / WORLD_SIZE;
    const v = (HALF - z) / WORLD_SIZE;
    const cc = Math.round(u * (WET_N - 1));
    const rr = Math.round(v * (WET_N - 1));
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = rr + dr; const c = cc + dc;
        if (r < 0 || c < 0 || r >= WET_N || c >= WET_N) continue;
        const idx = r * WET_N + c;
        this.wetGrid[idx] = Math.min(1, this.wetGrid[idx] + amount);
      }
    }
  }

  updateWet(dt: number, raining: boolean): void {
    const data = this.wetTexture.image.data as Uint8Array;
    const dry = dt * 0.025;
    const wet = raining ? dt * 0.25 : 0;
    for (let i = 0; i < this.wetGrid.length; i++) {
      let w = this.wetGrid[i] - dry + wet;
      if (w < 0) w = 0; else if (w > 1) w = 1;
      this.wetGrid[i] = w;
      data[i] = Math.round(w * 255);
    }
    this.wetTexture.needsUpdate = true;
  }

  /** Call periodically: refresh foam map + mesh if erosion changed things. */
  maint(dt: number): boolean {
    this.foamTimer += dt;
    if (this.colliderDirty && this.foamTimer > 1.2) {
      this.foamTimer = 0;
      this.refreshFoamTexture();
      this.refreshMesh();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
    this.wetTexture.dispose();
    this.foamTexture.dispose();
  }
}
