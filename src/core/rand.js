/**
 * THE MULTIVERSE — core/rand.js
 * ------------------------------------------------------------------
 * Deterministic, seedable randomness. Every reality, every creature and
 * every mountain in this game is generated from a 32-bit seed, which means
 * the multiverse is reproducible: seed 1337 always yields the same world.
 * Pure logic, no DOM — covered by tools/test.mjs.
 */

/** Fast 32-bit PRNG. Returns a function producing floats in [0,1). */
export function mulberry32(seed) {
  let a = (seed | 0) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of one integer -> uint32. */
export function hash1(x) {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic hash of two integers -> uint32 (integer lattice noise). */
export function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Deterministic hash of three integers -> uint32. */
export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash -> float in [0,1). */
export const hash1f = (x) => hash1(x) / 4294967296;
export const hash2f = (x, y) => hash2(x, y) / 4294967296;
export const hash3f = (x, y, z) => hash3(x, y, z) / 4294967296;

const TAU = Math.PI * 2;

/**
 * A seeded random stream with ergonomic helpers.
 * Use one Rng per subsystem so adding features never shifts another
 * subsystem's output (a real problem with a single global PRNG).
 */
export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
    this._spare = null;
  }

  /** float in [0,1) */
  float() {
    return this._next();
  }

  /** float in [min,max) */
  range(min, max) {
    return min + (max - min) * this._next();
  }

  /** integer in [min,max] inclusive */
  int(min, max) {
    return Math.floor(min + (max - min + 1) * this._next());
  }

  bool(p = 0.5) {
    return this._next() < p;
  }

  /** pick a random element */
  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  /** weighted pick: entries are [value, weight] or objects with {weight} */
  weighted(entries, weightOf = (e) => (Array.isArray(e) ? e[1] : e.weight)) {
    let total = 0;
    for (const e of entries) total += Math.max(0, weightOf(e));
    let r = this._next() * total;
    for (const e of entries) {
      r -= Math.max(0, weightOf(e));
      if (r <= 0) return Array.isArray(e) ? e[0] : e;
    }
    const last = entries[entries.length - 1];
    return Array.isArray(last) ? last[0] : last;
  }

  /** approximate standard normal via Box–Muller (cached spare) */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this._next() * 2 - 1;
      v = this._next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * m;
    return mean + sd * u * m;
  }

  /** uniformly distributed point on the unit sphere */
  onSphere(out = { x: 0, y: 0, z: 0 }) {
    const z = this._next() * 2 - 1;
    const t = this._next() * TAU;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    out.x = r * Math.cos(t);
    out.y = r * Math.sin(t);
    out.z = z;
    return out;
  }

  /** random direction in the XZ plane (angle in radians) */
  angle() {
    return this._next() * TAU;
  }

  /** in-place Fisher–Yates */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** random unit vector in a cone (axis optional) */
  cone(spread = 0.3) {
    const a = this._next() * TAU;
    const r = Math.sqrt(this._next()) * spread;
    return { x: Math.cos(a) * r, y: (this._next() * 2 - 1) * spread, z: Math.sin(a) * r };
  }

  /** hex-ish color string from a hue range, for UI use */
  hex(hue, sat = 0.7, light = 0.6) {
    return `hsl(${Math.round(hue)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%)`;
  }

  /** derive a child stream (keeps things decorrelated) */
  fork(salt = 0) {
    return new Rng(hash1(this.seed ^ (salt * 0x9e3779b9)) | 0);
  }
}

/** Turn any string into a stable 32-bit seed (FNV-1a). */
export function seedFromString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
