import { test } from '../tools/runner.mjs';
import { Rng, mulberry32, hash2, seedFromString, hash3f } from '../src/core/rand.js';
import {
  clamp, clamp01, lerp, remap, smoothstep, damp, dampAngle, moveToward,
  MinHeap, RingBuffer, EventBus, Easing, mixHex, formatClock, dayFractionToClock,
  dist2sq, angleDelta, wrap,
} from '../src/core/math.js';
import { Perlin, Simplex, NoiseStack, fbm, ridged, worley2, curl2, tileableNoiseField } from '../src/core/noise.js';

/* ---------------------------------- rng ---------------------------------- */

test('mulberry32 is deterministic for a seed and stays in [0,1)', (h) => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5000; i++) {
    const v = a();
    h.close(v, b(), 0, `stream diverged at ${i}`);
    h.inRange(v, 0, 0.9999999);
  }
});

test('different seeds produce different streams', (h) => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 1000; i++) if (a() === b()) same++;
  h.lt(same, 3, 'seeds 1 and 2 should almost never agree');
});

test('Rng helpers respect their ranges', (h) => {
  const rng = new Rng(2024);
  for (let i = 0; i < 3000; i++) {
    const f = rng.range(-5, 12);
    h.inRange(f, -5, 12);
    const n = rng.int(3, 9);
    h.ok(Number.isInteger(n) && n >= 3 && n <= 9, `int produced ${n}`);
  }
});

test('Rng.gauss has sane mean/sigma', (h) => {
  const rng = new Rng(9);
  const xs = [];
  for (let i = 0; i < 40000; i++) xs.push(rng.gauss(10, 2));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  h.close(mean, 10, 0.06);
  h.close(sd, 2, 0.06);
});

test('Rng.pick and weighted honour their domains', (h) => {
  const rng = new Rng(7);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 500; i++) h.ok(arr.includes(rng.pick(arr)));
  const counts = { common: 0, rare: 0 };
  for (let i = 0; i < 20000; i++) counts[rng.weighted([['common', 9], ['rare', 1]])]++;
  h.gt(counts.common / counts.rare, 5, 'weighting should be strongly biased');
});

test('Rng.shuffle permutes without losing elements', (h) => {
  const rng = new Rng(5);
  const arr = Array.from({ length: 200 }, (_, i) => i);
  const shuffled = rng.shuffle([...arr]);
  h.eq(shuffled.length, arr.length);
  h.deepEq([...shuffled].sort((a, b) => a - b), arr);
  h.ok(shuffled.some((v, i) => v !== arr[i]), 'shuffle should reorder something');
});

test('onSphere yields unit vectors that cover all directions', (h) => {
  const rng = new Rng(11);
  const buckets = new Array(8).fill(0);
  for (let i = 0; i < 8000; i++) {
    const p = rng.onSphere({ x: 0, y: 0, z: 0 });
    const len = Math.hypot(p.x, p.y, p.z);
    h.close(len, 1, 1e-9);
    buckets[Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 8) % 8]++;
  }
  for (const b of buckets) h.gt(b, 600, 'azimuth coverage should be even');
});

test('fork() decorrelates streams but stays deterministic', (h) => {
  const a = new Rng(123).fork(4);
  const b = new Rng(123).fork(4);
  const c = new Rng(123).fork(5);
  h.close(a.float(), b.float(), 0);
  h.ok(c.float() !== a.float());
});

test('seedFromString is stable and well distributed', (h) => {
  h.eq(seedFromString('simolysis'), seedFromString('simolysis'));
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(seedFromString('lodamis-' + i));
  h.eq(seen.size, 500, 'no collisions across 500 distinct strings');
});

test('integer hashes are stable and spread', (h) => {
  h.eq(hash2(3, 4), hash2(3, 4));
  const set = new Set();
  for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) set.add(hash2(x, y));
  h.gt(set.size, 3500, 'lattice hash should rarely collide');
  for (let i = 0; i < 2000; i++) h.inRange(hash3f(i, i * 3, i * 7), 0, 0.9999999);
});

/* ---------------------------------- math --------------------------------- */

test('clamp / lerp / remap behave at boundaries', (h) => {
  h.eq(clamp(5, 0, 1), 1);
  h.eq(clamp(-5, 0, 1), 0);
  h.eq(clamp01(0.42), 0.42);
  h.eq(lerp(0, 10, 0.25), 2.5);
  h.eq(remap(5, 0, 10, 100, 200), 150);
  h.eq(remap(-5, 0, 10, 100, 200), 100, 'remap clamps low');
  h.eq(remap(50, 0, 10, 100, 200), 200, 'remap clamps high');
  h.eq(wrap(-1, 10), 9);
});

test('smoothstep is monotonic and flat at the ends', (h) => {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const v = smoothstep(i / 100);
    h.ok(v >= prev, 'monotonic');
    prev = v;
  }
  h.eq(smoothstep(0), 0);
  h.eq(smoothstep(1), 1);
});

test('damp converges without overshoot', (h) => {
  let v = 0;
  for (let i = 0; i < 300; i++) v = damp(v, 10, 5, 1 / 60);
  h.close(v, 10, 0.01);
  h.lt(v, 10.0001);
});

test('dampAngle takes the shortest angular path', (h) => {
  let a = 3.0;
  for (let i = 0; i < 600; i++) a = dampAngle(a, -3.0, 4, 1 / 60);
  // -3.0 and 3.283 are the same angle
  h.ok(Math.abs(Math.abs(angleDelta(a, -3.0))) < 0.02, `angle ${a} should reach -3.0 (or +PI)`);
});

test('moveToward never overshoots', (h) => {
  h.eq(moveToward(0, 1, 0.3), 0.3);
  h.eq(moveToward(0.9, 1, 0.3), 1);
  h.eq(moveToward(0, -1, 0.25), -0.25);
});

test('distance and easing helpers are correct', (h) => {
  h.eq(dist2sq(0, 0, 3, 4), 25);
  h.eq(Easing.linear(0.5), 0.5);
  for (const key of Object.keys(Easing)) {
    h.close(Easing[key](0), 0, 1e-9, `${key}(0)`);
    h.close(Easing[key](1), 1, 1e-9, `${key}(1)`);
  }
});

test('MinHeap pops in sorted order', (h) => {
  const heap = new MinHeap();
  const rng = new Rng(3);
  const values = [];
  for (let i = 0; i < 500; i++) {
    const v = rng.range(0, 1000);
    values.push(v);
    heap.push({ f: v });
  }
  values.sort((a, b) => a - b);
  for (let i = 0; i < 500; i++) h.close(heap.pop().f, values[i], 1e-9, `pop ${i}`);
  h.eq(heap.size, 0);
  h.eq(heap.pop(), undefined);
});

test('RingBuffer keeps newest samples and averages', (h) => {
  const ring = new RingBuffer(4);
  for (const v of [1, 2, 3, 4, 5]) ring.push(v);
  h.eq(ring.length, 4);
  h.eq(ring.at(0), 5, 'newest first');
  h.eq(ring.max(), 5);
  h.close(ring.average(), 3.5);
});

test('EventBus delivers, unsubscribes and survives throwing handlers', (h) => {
  const bus = new EventBus();
  let count = 0;
  const off = bus.on('x', () => count++);
  bus.emit('x');
  bus.emit('x');
  off();
  bus.emit('x');
  h.eq(count, 2);
  bus.on('boom', () => {
    throw new Error('handler failure');
  });
  bus.on('boom', () => count++);
  bus.emit('boom');
  h.eq(count, 3, 'later handlers still run after a throwing one');
  let onceCount = 0;
  bus.once('y', () => onceCount++);
  bus.emit('y');
  bus.emit('y');
  h.eq(onceCount, 1);
});

test('colour + clock helpers format as expected', (h) => {
  h.eq(mixHex(0x000000, 0xffffff, 0), 0x000000);
  h.eq(mixHex(0x000000, 0xffffff, 1), 0xffffff);
  h.eq(formatClock(0), '0:00');
  h.eq(formatClock(61), '1:01');
  h.eq(dayFractionToClock(0), '00:00');
  h.eq(dayFractionToClock(0.5), '12:00');
  h.eq(dayFractionToClock(0.75), '18:00');
});

/* --------------------------------- noise --------------------------------- */

test('Perlin 2D is stable, bounded and centred', (h) => {
  const p1 = new Perlin(99);
  const p2 = new Perlin(99);
  const samples = [];
  for (let i = 0; i < 20000; i++) {
    const x = i * 0.37;
    const y = i * 0.91;
    const v = p1.noise2(x, y);
    h.close(v, p2.noise2(x, y), 0, 'deterministic');
    h.inRange(v, -1.5, 1.5);
    samples.push(v);
  }
  h.noiseStats(samples, { meanTol: 0.05, minSpread: 1.0 });
});

test('Perlin 2D is continuous (no seams between lattice cells)', (h) => {
  const p = new Perlin(4);
  for (let i = 0; i < 2000; i++) {
    const x = i * 0.13;
    const y = i * 0.29;
    const a = p.noise2(x, y);
    const b = p.noise2(x + 1e-5, y);
    h.lt(Math.abs(a - b), 1e-3, 'small step should not jump');
  }
});

test('Perlin 3D is bounded, centred and deterministic', (h) => {
  const p = new Perlin(21);
  const samples = [];
  for (let i = 0; i < 12000; i++) {
    const v = p.noise3(i * 0.21, i * 0.11, i * 0.53);
    h.inRange(v, -1.5, 1.5);
    samples.push(v);
  }
  h.noiseStats(samples, { meanTol: 0.06, minSpread: 0.9 });
});

test('Simplex 2D/3D stay in range and differ from Perlin', (h) => {
  const s = new Simplex(31);
  const p = new Perlin(31);
  let diff = 0;
  for (let i = 0; i < 4000; i++) {
    const x = i * 0.17;
    const y = i * 0.41;
    const v2 = s.noise2(x, y);
    const v3 = s.noise3(x, y, i * 0.07);
    h.inRange(v2, -1.05, 1.05);
    h.inRange(v3, -1.05, 1.05);
    if (Math.abs(v2 - p.noise2(x, y)) > 0.05) diff++;
  }
  h.gt(diff, 3000, 'simplex should not equal perlin');
});

test('fbm output is bounded in [-1,1] and scales with frequency', (h) => {
  const noise = new Perlin(8);
  const low = [];
  const high = [];
  for (let i = 0; i < 4000; i++) {
    const x = i * 0.5;
    const y = i * 0.25;
    low.push(fbm(noise, x, y, { octaves: 4, frequency: 0.01 }));
    high.push(fbm(noise, x, y, { octaves: 4, frequency: 0.25 }));
  }
  for (const v of [...low, ...high]) h.inRange(v, -1, 1);
  const varianceOfStep = (arr) => {
    let sum = 0;
    for (let i = 1; i < arr.length; i++) sum += Math.abs(arr[i] - arr[i - 1]);
    return sum / (arr.length - 1);
  };
  h.gt(varianceOfStep(high), varianceOfStep(low) * 2, 'higher frequency should change faster');
});

test('ridged noise is non-negative and peaks near 1', (h) => {
  const noise = new Perlin(15);
  let max = 0;
  let min = Infinity;
  for (let i = 0; i < 8000; i++) {
    const v = ridged(noise, i * 0.11, i * 0.23, { octaves: 5 });
    h.inRange(v, 0, 1.0001);
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  h.gt(max, 0.5, 'ridges should reach high values');
  h.lt(min, 0.2, 'ridges should have valleys');
});

test('Worley/cellular returns ordered distances and stable cell ids', (h) => {
  const rng = new Rng(2);
  const out = {};
  for (let i = 0; i < 3000; i++) {
    const x = rng.range(-50, 50);
    const y = rng.range(-50, 50);
    worley2(x, y, 77, out);
    h.inRange(out.f1, 0, 1.5);
    h.ok(out.f2 >= out.f1, 'f2 should be the second-closest distance');
    h.eq(out.id, worley2(x, y, 77, {}).id, 'cell id is stable');
  }
});

test('curl field is divergence-free (flow neither piles up nor drains)', (h) => {
  const noise = new Perlin(12);
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const x = i * 0.7 + 0.13;
    const y = i * 1.3 + 0.77;
    const e = 0.05;
    curl2(noise, x + e, y, 0.3, 1, a);
    curl2(noise, x - e, y, 0.3, 1, b);
    const dVx = (a.x - b.x) / (2 * e);
    curl2(noise, x, y + e, 0.3, 1, a);
    curl2(noise, x, y - e, 0.3, 1, b);
    const dVy = (a.y - b.y) / (2 * e);
    worst = Math.max(worst, Math.abs(dVx + dVy));
  }
  h.lt(worst, 60, `divergence ${worst.toFixed(1)} should stay small`);
});

test('NoiseStack composites are deterministic and reusable', (h) => {
  const stack = new NoiseStack(1337);
  h.close(stack.fbm(12.5, -3.25, { octaves: 5 }), new NoiseStack(1337).fbm(12.5, -3.25, { octaves: 5 }), 0);
  const w1 = stack.worley(1.2, 3.4, 2).f1;
  const w2 = stack.worley(1.2, 3.4, 2).f1;
  h.close(w1, w2, 0, 'shared scratch object must be read immediately');
  h.inRange(stack.turbulence3(1, 2, 3), 0, 1);
  h.inRange(stack.billow(4, 5), -1, 1);
});

test('tileable field wraps seamlessly on both axes', (h) => {
  const size = 64;
  const field = tileableNoiseField(size, 5, 4, 3);
  h.eq(field.length, size * size);
  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    h.inRange(v, 0, 1);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  h.close(min, 0, 0.001);
  h.close(max, 1, 0.001);
  // wrap check along x: value(0,y) ≈ value(size-1,y) + one step
  let seam = 0;
  for (let y = 0; y < size; y++) {
    const left = field[y * size];
    const prev = field[y * size + size - 1];
    seam = Math.max(seam, Math.abs(left - prev));
  }
  let interior = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 1; x < size; x++) {
      interior = Math.max(interior, Math.abs(field[y * size + x] - field[y * size + x - 1]));
    }
  }
  h.lt(seam, interior + 0.05, 'the wrap seam must not be bigger than an interior step');
});
