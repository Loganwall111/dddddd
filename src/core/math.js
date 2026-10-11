/**
 * THE MULTIVERSE — core/math.js
 * ------------------------------------------------------------------
 * Small, allocation-free math helpers used across the engine.
 * Pure logic, no DOM — covered by tools/test.mjs.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v !== v ? lo : v < lo ? lo : v > hi ? hi : v); // NaN-safe
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
/**
 * Hermite easing. Accepts either a normalised `t` in [0,1] or the full
 * `(edge0, edge1, x)` form — the world generators were written against the
 * latter, and silently reading a wrong edge would flatten every cliff.
 */
export const smoothstep = (a, b, c) => {
  if (b === undefined) {
    const t = clamp01(a);
    return t * t * (3 - 2 * t);
  }
  const t = clamp01(invLerp(a, b, c));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, c) => {
  if (b === undefined) {
    const t = clamp01(a);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  const t = clamp01(invLerp(a, b, c));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const smootherstepRange = smootherstep;
export const square = (v) => v * v;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Frame-rate independent exponential smoothing. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Frame-rate independent angular damping (shortest path). */
export function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/** Wrap a value into [0, m). */
export const wrap = (v, m) => ((v % m) + m) % m;

/** Move a value toward a target by at most `maxDelta`. */
export function moveToward(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Deterministic index into an array from a position (stable per-cell). */
export const pickIndex = (i, n) => ((i % n) + n) % n;

/** Approximate equality with epsilon. */
export const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/** Distance between two 2D points. */
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Squared distance between two 2D points. */
export function dist2sq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Angle in [-PI, PI] of a 2D vector. */
export const angleOf = (x, z) => Math.atan2(z, x);

/** Shortest signed angular difference (radians). */
export function angleDelta(a, b) {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Convert a hex color number to {r,g,b} in 0..1. */
export function hexToRgb(hex) {
  return {
    r: ((hex >> 16) & 255) / 255,
    g: ((hex >> 8) & 255) / 255,
    b: (hex & 255) / 255,
  };
}

/** Convert {r,g,b} 0..1 style components to a hex number. */
export function rgbToHex(r, g, b) {
  return ((Math.round(clamp01(r) * 255) << 16) | (Math.round(clamp01(g) * 255) << 8) | Math.round(clamp01(b) * 255)) >>> 0;
}

/** Perceptual-ish mix of two hex colors in linear space. */
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    Math.sqrt(lerp(ca.r * ca.r, cb.r * cb.r, t)),
    Math.sqrt(lerp(ca.g * ca.g, cb.g * cb.g, t)),
    Math.sqrt(lerp(ca.b * ca.b, cb.b * cb.b, t))
  );
}

/** Smooth min (polynomial) — great for blending terrain features. */
export function smin(a, b, k = 0.5) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Smooth max. */
export function smax(a, b, k = 0.5) {
  return -smin(-a, -b, k);
}

/** Fast 1D value noise interpolation helper (used by shaders + CPU code). */
export function noise1Fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Format seconds as M:SS. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Map a 0..1 day fraction to a HH:MM clock string. */
export function dayFractionToClock(f) {
  const total = wrap(f, 1) * 1440;
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Data structures
 * ------------------------------------------------------------------ */

/** Simple binary min-heap (used by A* pathfinding in the Backrooms). */
export class MinHeap {
  constructor(compare = (a, b) => a.f - b.f) {
    this.items = [];
    this.compare = compare;
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i], items[parent]) >= 0) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
    return item;
  }
  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && this.compare(items[l], items[best]) < 0) best = l;
        if (r < items.length && this.compare(items[r], items[best]) < 0) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best], items[i]];
        i = best;
      }
    }
    return top;
  }
}

/** Fixed-capacity ring buffer for the perf graph. */
export class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity);
    this.index = 0;
    this.count = 0;
  }
  push(v) {
    this.data[this.index] = v;
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    return v;
  }
  get length() {
    return this.count;
  }
  /** newest first */
  at(i) {
    return this.data[(this.index - 1 - i + this.capacity * 2) % this.capacity];
  }
  average(n = this.count) {
    const k = Math.min(n, this.count);
    if (k === 0) return 0;
    let sum = 0;
    for (let i = 0; i < k; i++) sum += this.at(i);
    return sum / k;
  }
  /** k-th percentile-ish (max of the most recent n) */
  max(n = this.count) {
    const k = Math.min(n, this.count);
    let m = -Infinity;
    for (let i = 0; i < k; i++) m = Math.max(m, this.at(i));
    return m;
  }
  toArray() {
    const out = [];
    for (let i = 0; i < this.count; i++) out.push(this.at(i));
    return out;
  }
}

/** Tiny object pool. */
export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.created = 0;
  }
  acquire() {
    const obj = this.free.pop();
    if (obj) return obj;
    this.created++;
    return this.factory();
  }
  release(obj) {
    if (this.reset) this.reset(obj);
    this.free.push(obj);
  }
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/** Minimal synchronous event bus. */
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }
  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }
  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${type}" threw`, err);
      }
    }
  }
  clear() {
    this.map.clear();
  }
}

/* ------------------------------------------------------------------ *
 * Interpolation curves used by cameras, cinematics and UI
 * ------------------------------------------------------------------ */

export const Easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
