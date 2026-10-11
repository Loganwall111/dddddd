/**
 * Shared assertions for the test suite.
 */
import assert from 'node:assert/strict';

export default {
  ok: (v, msg) => assert.ok(v, msg),
  eq: (a, b, msg) => assert.equal(a, b, msg),
  notEq: (a, b, msg) => assert.notEqual(a, b, msg),
  deepEq: (a, b, msg) => assert.deepEqual(a, b, msg),
  close(a, b, eps = 1e-6, msg) {
    assert.ok(Math.abs(a - b) <= eps, msg || `expected ${a} ≈ ${b} (±${eps})`);
  },
  inRange(v, lo, hi, msg) {
    assert.ok(v >= lo && v <= hi, msg || `expected ${v} within [${lo}, ${hi}]`);
  },
  gt: (a, b, msg) => assert.ok(a > b, msg || `expected ${a} > ${b}`),
  gte: (a, b, msg) => assert.ok(a >= b, msg || `expected ${a} >= ${b}`),
  lt: (a, b, msg) => assert.ok(a < b, msg || `expected ${a} < ${b}`),
  lte: (a, b, msg) => assert.ok(a <= b, msg || `expected ${a} <= ${b}`),
  throws: (fn, msg) => assert.throws(fn, msg),
  includes: (hay, needle, msg) => assert.ok(String(hay).includes(needle), msg || `expected to include "${needle}"`),
  isArray: (v, msg) => assert.ok(Array.isArray(v), msg || 'expected an array'),
  /** statistically sane: mean near 0, spread not degenerate */
  noiseStats(samples, { meanTol = 0.12, minSpread = 0.25 } = {}) {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of samples) {
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    assert.ok(Math.abs(mean) < meanTol, `noise mean ${mean.toFixed(3)} should be near 0`);
    assert.ok(hi - lo > minSpread, `noise spread ${(hi - lo).toFixed(3)} should exceed ${minSpread}`);
    return { mean, lo, hi };
  },
};
