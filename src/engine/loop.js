/**
 * THE MULTIVERSE — engine/loop.js
 * ==================================================================
 * The heartbeat of both realities: a fixed-timestep simulation with an
 * interpolated render, a frame budget watchdog, and the machinery for the
 * things that must survive a tab switch (pause, catch-up clamping, resume
 * smoothing).
 *
 * Why fixed step: creature gaits, water surfaces and the physics doors all
 * integrate; letting dt drift would let a slow machine walk through walls.
 */
import { clamp, clamp01 } from '../core/math.js';

export const FIXED_STEP = 1 / 60;
export const MAX_SUBSTEPS = 5;
export const MAX_FRAME = 0.25;

export class GameLoop {
  constructor({ onFixed, onFrame, onResize = null, fixedStep = FIXED_STEP, maxSubsteps = MAX_SUBSTEPS } = {}) {
    this.onFixed = onFixed ?? (() => {});
    this.onFrame = onFrame ?? (() => {});
    this.onResize = onResize;
    this.fixedStep = fixedStep;
    this.maxSubsteps = maxSubsteps;
    this.accumulator = 0;
    this.time = 0;
    this.simulationTime = 0;
    this.frame = 0;
    this.running = false;
    this.paused = false;
    this.timeScale = 1;
    this.lastRate = 0; // multiplier from the machine's sanity, set by the game
    this.lastTimestamp = 0;
    this.rawDt = 0;
    this.smoothedFrameMs = 16.7;
    this.droppedFrames = 0;
    this.catchUpFrames = 0;
    this.wasBackgrounded = false;
    this.rafId = null;
    this.frameMsHistory = [];
    this.boundTick = (timestamp) => this.tick(timestamp);
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.boundTick);
    return this;
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) {
      // Do not let a long pause become a giant catch-up burst.
      this.accumulator = 0;
      this.lastTimestamp = performance.now();
    }
  }

  tick(timestamp) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.boundTick);

    const now = timestamp || performance.now();
    let dt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > MAX_FRAME) {
      // A tab switch, a hitch, or the debugger. Don't simulate the gap.
      this.droppedFrames++;
      dt = Math.min(dt, MAX_FRAME);
    }
    this.rawDt = dt;
    this.frame++;
    const frameMs = dt * 1000;
    this.smoothedFrameMs = this.smoothedFrameMs * 0.9 + frameMs * 0.1;
    this.frameMsHistory.push(frameMs);
    if (this.frameMsHistory.length > 90) this.frameMsHistory.shift();

    if (this.paused || this.timeScale === 0) {
      this.onFrame(0, 1, now);
      return;
    }

    const scaled = dt * this.timeScale * (this.lastRate || 1);
    this.accumulator += scaled;
    this.time += scaled;

    let substeps = 0;
    while (this.accumulator >= this.fixedStep && substeps < this.maxSubsteps) {
      this.onFixed(this.fixedStep, this.simulationTime);
      this.simulationTime += this.fixedStep;
      this.accumulator -= this.fixedStep;
      substeps++;
    }
    if (substeps >= this.maxSubsteps) {
      // We're behind: drop the remainder so we never spiral.
      this.catchUpFrames++;
      this.accumulator = 0;
    }

    const alpha = clamp01(this.accumulator / this.fixedStep);
    this.onFrame(scaled, alpha, now);
  }

  /** Rolling average frame time in ms over the last ~90 frames. */
  get averageFrameMs() {
    if (this.frameMsHistory.length === 0) return 16.7;
    let sum = 0;
    for (const value of this.frameMsHistory) sum += value;
    return sum / this.frameMsHistory.length;
  }

  /** 99th-ish percentile frame time — the stutter metric that matters. */
  get worstFrameMs() {
    if (this.frameMsHistory.length === 0) return 16.7;
    const sorted = [...this.frameMsHistory].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }

  get fps() {
    return 1000 / Math.max(1, this.averageFrameMs);
  }

  stats() {
    return {
      frame: this.frame,
      fps: Math.round(this.fps),
      frameMs: this.averageFrameMs,
      worstMs: this.worstFrameMs,
      dropped: this.droppedFrames,
      catchUp: this.catchUpFrames,
      timeScale: this.timeScale,
      paused: this.paused,
    };
  }
}

/** Handle window resize / DPR changes and tell the loop about them. */
export function attachResizeHandler(callback, { debounceMs = 120 } = {}) {
  let timer = null;
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;
  let lastDpr = window.devicePixelRatio || 1;
  const check = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    if (width === lastWidth && height === lastHeight && dpr === lastDpr) return;
    lastWidth = width;
    lastHeight = height;
    lastDpr = dpr;
    callback({ width, height, dpr });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      check();
    }, debounceMs);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  const interval = setInterval(check, 1000);
  return {
    check,
    dispose() {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    },
  };
}

/** Pause-on-blur behaviour with a callback so the UI can show the menu. */
export function attachVisibilityHandler(loop, { onHidden = null, onVisible = null } = {}) {
  const handler = () => {
    if (document.hidden) {
      onHidden?.();
      loop.setPaused(true);
    } else {
      onVisible?.();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return { dispose: () => document.removeEventListener('visibilitychange', handler) };
}

/** Deterministic stepping for tests and for reproducible trailer capture. */
export function stepLoop(loop, seconds) {
  const steps = Math.max(0, Math.round(seconds / loop.fixedStep));
  for (let i = 0; i < steps; i++) {
    loop.onFixed(loop.fixedStep, loop.simulationTime);
    loop.simulationTime += loop.fixedStep;
    loop.time += loop.fixedStep;
    loop.frame++;
  }
  loop.onFrame(seconds, 0, performance.now());
  return steps;
}

export { clamp };
