/**
 * THE MULTIVERSE — render/quality.js
 * ==================================================================
 * ADAPTIVE PERFORMANCE CONTROL. A 60 fps holographic valley needs a safety
 * net: this module watches frame times and trades resolution (then effects)
 * for smoothness, and gives them back when the machine can afford it.
 *
 * The controller is pure logic — no DOM, no WebGL — so its hysteresis,
 * thresholds and clamps are unit-tested.
 */
import { clamp, RingBuffer } from '../core/math.js';

export const TIERS = [
  {
    name: 'ultra',
    renderScale: 1,
    pixelRatio: 1.75,
    effects: { ssao: true, ssr: true, bloom: true, dof: true, motionBlur: true, godrays: true, clouds: 1, shadows: true },
  },
  {
    name: 'high',
    renderScale: 1,
    pixelRatio: 1.4,
    effects: { ssao: true, ssr: true, bloom: true, dof: true, motionBlur: true, godrays: true, clouds: 1, shadows: true },
  },
  {
    name: 'medium',
    renderScale: 0.9,
    pixelRatio: 1.15,
    effects: { ssao: true, ssr: false, bloom: true, dof: true, motionBlur: false, godrays: true, clouds: 0.75, shadows: true },
  },
  {
    name: 'low',
    renderScale: 0.75,
    pixelRatio: 1,
    effects: { ssao: false, ssr: false, bloom: true, dof: false, motionBlur: false, godrays: false, clouds: 0.5, shadows: true },
  },
  {
    name: 'potato',
    renderScale: 0.55,
    pixelRatio: 0.85,
    effects: { ssao: false, ssr: false, bloom: false, dof: false, motionBlur: false, godrays: false, clouds: 0, shadows: false },
  },
];

/**
 * Frame-time driven controller.
 *
 * @param {object} opts
 *   targetMs    — desired frame time (16.7 for 60 fps, 33.3 for 30 fps)
 *   minScale    — lowest resolution scale we will ever use
 *   maxScale    — highest
 *   downshiftMs / upshiftMs — hysteresis thresholds
 */
export function createAdaptiveController({
  targetMs = 1000 / 60,
  minScale = 0.55,
  maxScale = 1,
  downshiftMs = targetMs * 1.45,
  upshiftMs = targetMs * 0.82,
  sampleCount = 45,
  cooldownSec = 1.5,
} = {}) {
  const samples = new RingBuffer(sampleCount);
  let scale = maxScale;
  let tier = 0; // index into TIERS, 0 = best
  let cooldown = 0;
  let changes = 0;
  let locked = false;
  const history = [];

  const averageMs = () => (samples.length ? samples.average(Math.min(30, samples.length)) : targetMs * 0.9);

  return {
    get scale() {
      return scale;
    },
    get tier() {
      return tier;
    },
    get tierName() {
      return TIERS[tier].name;
    },
    get changes() {
      return changes;
    },
    get history() {
      return history;
    },
    lock(value = true) {
      locked = value;
    },
    reset() {
      samples.clear?.();
      scale = maxScale;
      tier = 0;
      changes = 0;
      history.length = 0;
    },
    /** Feed one frame; returns true when the scale or tier changed. */
    update(frameMs, dt = 0) {
      samples.push(clamp(frameMs, 0.1, 500));
      if (locked) return false;
      cooldown -= dt;
      if (cooldown > 0) return false;
      if (samples.length < 20) return false;

      const avg = averageMs();
      let changed = false;

      if (avg > downshiftMs) {
        // Too slow: first give up resolution, then effects, then more resolution.
        if (scale > minScale + 0.01) {
          scale = Math.max(minScale, scale - 0.06);
          changed = true;
        } else if (tier < TIERS.length - 1) {
          tier++;
          scale = Math.max(minScale, TIERS[tier].renderScale);
          changed = true;
        }
        cooldown = cooldownSec;
      } else if (avg < upshiftMs) {
        // Comfortable: buy back effects first, then resolution.
        if (tier > 0 && samples.average(20) < upshiftMs * 0.92) {
          tier--;
          scale = Math.max(scale, TIERS[tier].renderScale);
          changed = true;
          cooldown = cooldownSec * 2;
        } else if (tier === 0 && scale < maxScale - 0.01) {
          scale = Math.min(maxScale, scale + 0.03);
          changed = true;
          cooldown = cooldownSec;
        }
      }

      if (changed) {
        changes++;
        history.push({ scale: +scale.toFixed(3), tier, avg: +avg.toFixed(2) });
        if (history.length > 64) history.shift();
      }
      return changed;
    },
    /** Diagnostics for the perf overlay. */
    stats() {
      return {
        fps: samples.length ? 1000 / Math.max(0.1, averageMs()) : 0,
        frameMs: averageMs(),
        scale,
        tier: TIERS[tier].name,
        changes,
      };
    },
    /** Apply the current tier's effect switches onto a quality object. */
    applyTo(quality) {
      const t = TIERS[tier];
      quality.renderScale = scale;
      quality.pixelRatioCap = Math.min(quality.pixelRatioCap ?? 1.5, t.pixelRatio);
      quality.ssao = (quality.ssao ?? true) && t.effects.ssao;
      quality.ssr = (quality.ssr ?? true) && t.effects.ssr;
      quality.bloom = (quality.bloom ?? true) && t.effects.bloom;
      quality.dof = (quality.dof ?? true) && t.effects.dof;
      quality.motionBlur = (quality.motionBlur ?? true) && t.effects.motionBlur;
      quality.godrays = (quality.godrays ?? true) && t.effects.godrays;
      quality.shadows = (quality.shadows ?? true) && t.effects.shadows;
      quality.cloudSteps = Math.round((quality.cloudSteps ?? 32) * t.effects.clouds);
      return quality;
    },
  };
}

/** Perf overlay data: a rolling graph of frame times and the active tier. */
export function createPerfMonitor(size = 120) {
  const frames = new RingBuffer(size);
  let worst = 0;
  let count = 0;
  return {
    push(frameMs, dt) {
      frames.push(frameMs);
      worst = Math.max(worst * 0.995, frameMs);
      count++;
      void dt;
    },
    get fps() {
      return frames.length ? 1000 / Math.max(0.1, frames.average(60)) : 0;
    },
    get frameMs() {
      return frames.length ? frames.average(60) : 0;
    },
    get worstMs() {
      return worst;
    },
    get frames() {
      return count;
    },
    samples: () => frames.toArray(),
  };
}
