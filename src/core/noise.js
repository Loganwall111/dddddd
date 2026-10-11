/**
 * THE MULTIVERSE — core/noise.js
 * ------------------------------------------------------------------
 * Seeded coherent noise: Perlin (2D/3D), Simplex (2D/3D), fractal sums
 * (fBm / ridged / billow), cellular (Worley) and a curl field for flow.
 *
 * Everything here is CPU-side, deterministic and allocation-free in the
 * hot path — terrain streaming calls `fbm` hundreds of thousands of times
 * per second while the player flies across a valley.
 */
import { hash2, hash3, mulberry32, hash1 } from './rand.js';
import { lerp, clamp01 } from './math.js';

/* ------------------------------------------------------------------ *
 * Gradient tables
 * ------------------------------------------------------------------ */

// 8 planar gradients (avoiding 45° duplicates is unnecessary for Perlin 2D)
const GRAD2 = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
]);

// Ken Perlin's 12 edge gradients for 3D
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/** Perlin's fade curve, 6t^5 - 15t^4 + 10t^3 */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/* ------------------------------------------------------------------ *
 * Perlin noise
 * ------------------------------------------------------------------ */

export class Perlin {
  constructor(seed = 1337) {
    const rng = mulberry32(seed);
    // Build a seeded 256-entry permutation + duplicated table.
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  /** 2D Perlin noise, approximately [-1,1]. */
  noise2(x, y) {
    const p = this.p;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);

    const g00 = (p[X + p[Y]] & 7) << 1;
    const g10 = (p[X + 1 + p[Y]] & 7) << 1;
    const g01 = (p[X + p[Y + 1]] & 7) << 1;
    const g11 = (p[X + 1 + p[Y + 1]] & 7) << 1;

    const n00 = GRAD2[g00] * xf + GRAD2[g00 + 1] * yf;
    const n10 = GRAD2[g10] * (xf - 1) + GRAD2[g10 + 1] * yf;
    const n01 = GRAD2[g01] * xf + GRAD2[g01 + 1] * (yf - 1);
    const n11 = GRAD2[g11] * (xf - 1) + GRAD2[g11 + 1] * (yf - 1);

    const nx0 = lerp(n00, n10, u);
    const nx1 = lerp(n01, n11, u);
    return lerp(nx0, nx1, v) * 1.4;
  }

  /** 3D Perlin noise, approximately [-1,1]. */
  noise3(x, y, z) {
    const p = this.p;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    let g = ((p[AA] & 15) * 3) % 36;
    const n000 = GRAD3[g] * xf + GRAD3[g + 1] * yf + GRAD3[g + 2] * zf;
    g = ((p[BA] & 15) * 3) % 36;
    const n100 = GRAD3[g] * (xf - 1) + GRAD3[g + 1] * yf + GRAD3[g + 2] * zf;
    g = ((p[AB] & 15) * 3) % 36;
    const n010 = GRAD3[g] * xf + GRAD3[g + 1] * (yf - 1) + GRAD3[g + 2] * zf;
    g = ((p[BB] & 15) * 3) % 36;
    const n110 = GRAD3[g] * (xf - 1) + GRAD3[g + 1] * (yf - 1) + GRAD3[g + 2] * zf;
    g = ((p[AA + 1] & 15) * 3) % 36;
    const n001 = GRAD3[g] * xf + GRAD3[g + 1] * yf + GRAD3[g + 2] * (zf - 1);
    g = ((p[BA + 1] & 15) * 3) % 36;
    const n101 = GRAD3[g] * (xf - 1) + GRAD3[g + 1] * yf + GRAD3[g + 2] * (zf - 1);
    g = ((p[AB + 1] & 15) * 3) % 36;
    const n011 = GRAD3[g] * xf + GRAD3[g + 1] * (yf - 1) + GRAD3[g + 2] * (zf - 1);
    g = ((p[BB + 1] & 15) * 3) % 36;
    const n111 = GRAD3[g] * (xf - 1) + GRAD3[g + 1] * (yf - 1) + GRAD3[g + 2] * (zf - 1);

    const x00 = lerp(n000, n100, u);
    const x10 = lerp(n010, n110, u);
    const x01 = lerp(n001, n101, u);
    const x11 = lerp(n011, n111, u);
    const y0 = lerp(x00, x10, v);
    const y1 = lerp(x01, x11, v);
    return lerp(y0, y1, w) * 1.15;
  }
}

/* ------------------------------------------------------------------ *
 * Simplex noise (Gustavson-style, seeded by table shuffle)
 * ------------------------------------------------------------------ */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

export class Simplex {
  constructor(seed = 1337) {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    const rng = mulberry32(seed ^ 0x5bf03635);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = perm[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2(xin, yin) {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    let i1;
    let j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  noise3(xin, yin, zin) {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1;
    let j1;
    let k1;
    let i2;
    let j2;
    let k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0 + GRAD3[gi0 + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1 + GRAD3[gi1 + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2 + GRAD3[gi2 + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi3] * x3 + GRAD3[gi3 + 1] * y3 + GRAD3[gi3 + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }
}

/* ------------------------------------------------------------------ *
 * Cellular (Worley) noise
 * ------------------------------------------------------------------ */

/** Returns {f1, f2, cellX, cellY, id} for jittered-grid cellular noise. */
export function worley2(x, y, seed = 0, out = {}) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let cx = 0;
  let cy = 0;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = xi + ox;
      const gy = yi + oy;
      const h = hash2(gx, gy) ^ (seed | 0);
      const jx = ((h & 1023) / 1023) * 0.98;
      const jy = (((h >>> 10) & 1023) / 1023) * 0.98;
      const px = gx + jx;
      const py = gy + jy;
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cx = gx;
        cy = gy;
        id = h;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  out.f1 = f1;
  out.f2 = f2;
  out.cellX = cx;
  out.cellY = cy;
  out.id = id >>> 0;
  return out;
}

/* ------------------------------------------------------------------ *
 * Fractal sums + flow fields
 * ------------------------------------------------------------------ */

/**
 * Fractal Brownian motion. Each octave is rotated slightly so the result has
 * no axis-aligned structure (a giveaway of naive fBm on terrain).
 *
 * @param {Perlin|Simplex} noise
 * @param {number} x
 * @param {number} y
 * @param {object} [opts]
 * @returns {number} roughly [-1,1] for gain<=0.5
 */
export function fbm(noise, x, y, opts = {}) {
  const octaves = opts.octaves ?? 5;
  const frequency = opts.frequency ?? 1;
  const lacunarity = opts.lacunarity ?? 2.03;
  const gain = opts.gain ?? 0.5;
  const amplitude0 = opts.amplitude ?? 1;
  const warp = opts.warp ?? 0.0;
  const use3D = opts.plane !== undefined;

  let fx = x * frequency;
  let fz = y * frequency;
  let amp = amplitude0;
  let sum = 0;
  let norm = 0;
  let cosR = Math.cos(0.5);
  let sinR = Math.sin(0.5);

  for (let o = 0; o < octaves; o++) {
    let v;
    if (use3D) v = noise.noise3(fx, opts.plane, fz);
    else v = noise.noise2(fx, fz);
    if (warp > 0) {
      const wx = noise.noise2(fx * 0.5 + 13.7, fz * 0.5 - 7.3) * warp;
      const wz = noise.noise2(fx * 0.5 - 91.1, fz * 0.5 + 41.9) * warp;
      v = use3D ? noise.noise3(fx + wx, opts.plane, fz + wz) : noise.noise2(fx + wx, fz + wz);
    }
    sum += v * amp;
    norm += amp;
    amp *= gain;
    // rotate + scale for the next octave
    const nfx = (fx * cosR - fz * sinR) * lacunarity;
    const nfz = (fx * sinR + fz * cosR) * lacunarity;
    fx = nfx;
    fz = nfz;
    cosR = cosR * 0.98 - sinR * 0.2;
    sinR = sinR * 0.98 + cosR * 0.2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal — creates sharp mountain crests and cliff walls. */
export function ridged(noise, x, y, opts = {}) {
  const octaves = opts.octaves ?? 5;
  const frequency = opts.frequency ?? 1;
  const lacunarity = opts.lacunarity ?? 2.07;
  const gain = opts.gain ?? 0.5;
  const sharpness = opts.sharpness ?? 1.0;
  let fx = x * frequency;
  let fz = y * frequency;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise.noise2(fx, fz)) * 2;
    const v = Math.pow(clamp01(n), sharpness);
    sum += v * v * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fz *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Billowy noise — puffy, cloud-like lobes (crystal clusters, caverns). */
export function billow(noise, x, y, opts = {}) {
  const octaves = opts.octaves ?? 4;
  const frequency = opts.frequency ?? 1;
  let fx = x * frequency;
  let fz = y * frequency;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += Math.abs(noise.noise2(fx, fz)) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.03;
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : 0;
}

/**
 * Curl of a scalar noise field in 2D — divergence-free vector field.
 * Perfect for wind advection, grass bending, smoke and creature wandering.
 */
export function curl2(noise, x, y, eps = 0.35, frequency = 1, out = { x: 0, y: 0 }) {
  const fx = x * frequency;
  const fy = y * frequency;
  const n1 = noise.noise2(fx, fy + eps);
  const n2 = noise.noise2(fx, fy - eps);
  const n3 = noise.noise2(fx + eps, fy);
  const n4 = noise.noise2(fx - eps, fy);
  // curl of scalar field = (dN/dy, -dN/dx)
  out.x = (n1 - n2) / (2 * eps);
  out.y = -(n3 - n4) / (2 * eps);
  return out;
}

/* ------------------------------------------------------------------ *
 * A single, shared noise context per seed
 * ------------------------------------------------------------------ */

/**
 * Bundles the noise primitives a world needs, plus handy composites.
 * Instantiate one per reality so realities never interfere.
 */
export class NoiseStack {
  constructor(seed = 1337) {
    this.seed = seed;
    this.perlin = new Perlin(seed);
    this.simplex = new Simplex(seed ^ 0x1234567);
    this.detail = new Perlin(seed ^ 0xabcdef);
    this._w = { f1: 0, f2: 0, cellX: 0, cellY: 0, id: 0 };
  }

  fbm(x, y, opts) {
    return fbm(this.perlin, x, y, opts);
  }
  fractal3(x, z, plane, opts) {
    return fbm(this.perlin, x, z, { ...opts, plane });
  }
  ridged(x, y, opts) {
    return ridged(this.perlin, x, y, opts);
  }
  billow(x, y, opts) {
    return billow(this.detail, x, y, opts);
  }
  worley(x, y, seed = 0) {
    return worley2(x, y, (this.seed + seed) | 0, this._w);
  }
  curl(x, y, frequency = 0.01, out) {
    return curl2(this.perlin, x, y, 0.35, frequency, out);
  }
  /** 3D turbulence, used for clouds, smoke and nebula brushes. */
  turbulence3(x, y, z, octaves = 4) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += Math.abs(this.perlin.noise3(x * f, y * f, z * f)) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.05;
    }
    return norm > 0 ? sum / norm : 0;
  }
}

/* ------------------------------------------------------------------ *
 * Tileable 2D noise for textures (no seams when repeated on the GPU)
 * ------------------------------------------------------------------ */

/**
 * Sample fBm on a torus so a `size x size` field tiles seamlessly.
 * Returns a Float32Array of `size*size` values in [0,1].
 */
export function tileableNoiseField(size, seed = 7, octaves = 5, baseFreq = 3) {
  const noise = new Perlin(seed);
  const out = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let sum = 0;
      let amp = 1;
      let norm = 0;
      let f = baseFreq;
      for (let o = 0; o < octaves; o++) {
        // map the unit square onto a torus in 4D, projected to two noise reads
        const a = u * Math.PI * 2;
        const b = v * Math.PI * 2;
        const nx = Math.cos(a) * f;
        const ny = Math.sin(a) * f;
        const nz = Math.cos(b) * f;
        const nw = Math.sin(b) * f;
        const n =
          noise.noise2(nx, ny) * 0.5 +
          noise.noise2(nz + 31.7, nw - 12.3) * 0.5;
        sum += n * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.0;
      }
      const value = norm > 0 ? sum / norm : 0;
      out[y * size + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  const inv = 1 / Math.max(1e-6, max - min);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) * inv;
  return out;
}

/** Cheap 2D blue-noise-ish dither value, stable per pixel. */
export function dither2(x, y) {
  return (hash2(x, y) >>> 8) / 16777216;
}

/** Deterministic per-cell id in [0,1). */
export function cellRandom(x, y, salt = 0) {
  return (hash1(hash2(x, y) ^ salt) >>> 0) / 4294967296;
}
