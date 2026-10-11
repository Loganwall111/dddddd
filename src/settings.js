/**
 * THE MULTIVERSE: SIMOLYSIS — settings.js
 * ------------------------------------------------------------------
 * Quality presets, player settings, and their persistence. This module is
 * deliberately free of DOM/WebGL so the values can be unit-tested, and every
 * setter clamps to a legal range: a bad localStorage value from an older
 * build must never be able to break the renderer.
 */
import { clamp } from './core/math.js';

export const SETTINGS_VERSION = 3;
export const STORAGE_KEY = 'multiverse.settings.v3';

/**
 * Quality presets, ordered from "runs on a toaster" to "melts the toaster".
 * Every consumer of the renderer reads from here — nothing else hard-codes
 * resolution or effect toggles.
 */
export const QUALITY_PRESETS = {
  potato: {
    label: 'PARTICLE',
    blurb: 'You are dust. So is the renderer.',
    renderScale: 0.5,
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 512,
    cascades: 1,
    ssao: false,
    ssr: false,
    bloom: false,
    bloomStrength: 0.35,
    dof: false,
    motionBlur: false,
    godrays: false,
    volumetrics: false,
    cloudSteps: 0,
    rain: false,
    weatherFx: false,
    reflectionSize: 128,
    terrainRadius: 3,
    terrainSegments: 40,
    grassDensity: 0.25,
    grassRadius: 90,
    treeDensity: 0.3,
    creatureDensity: 0.15,
    creatureRadius: 220,
    drawDistance: 900,
    lodBias: 0.6,
    particles: 0.2,
    postAA: 'none',
    taa: false,
    chromatic: false,
    grain: false,
    lensFlare: false,
    spaceBackdrop: false,
    waterQuality: 'low',
  },
  low: {
    label: 'LOW',
    blurb: 'Reality, untextured.',
    renderScale: 0.75,
    pixelRatioCap: 1,
    shadows: true,
    shadowMapSize: 1024,
    cascades: 2,
    ssao: false,
    ssr: false,
    bloom: true,
    bloomStrength: 0.45,
    dof: false,
    motionBlur: false,
    godrays: false,
    volumetrics: false,
    cloudSteps: 12,
    rain: true,
    weatherFx: true,
    reflectionSize: 256,
    terrainRadius: 4,
    terrainSegments: 56,
    grassDensity: 0.5,
    grassRadius: 130,
    treeDensity: 0.6,
    creatureDensity: 0.4,
    creatureRadius: 320,
    drawDistance: 1400,
    lodBias: 0.8,
    particles: 0.5,
    postAA: 'fxaa',
    taa: false,
    chromatic: false,
    grain: true,
    lensFlare: true,
    spaceBackdrop: true,
    waterQuality: 'medium',
  },
  medium: {
    label: 'MEDIUM',
    blurb: 'The intended shape of the valley.',
    renderScale: 1,
    pixelRatioCap: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    cascades: 2,
    ssao: true,
    ssr: false,
    bloom: true,
    bloomStrength: 0.55,
    dof: true,
    motionBlur: false,
    godrays: true,
    volumetrics: true,
    cloudSteps: 24,
    rain: true,
    weatherFx: true,
    reflectionSize: 512,
    terrainRadius: 5,
    terrainSegments: 72,
    grassDensity: 0.8,
    grassRadius: 180,
    treeDensity: 0.85,
    creatureDensity: 0.7,
    creatureRadius: 420,
    drawDistance: 2000,
    lodBias: 1,
    particles: 0.75,
    postAA: 'smaa',
    taa: false,
    chromatic: true,
    grain: true,
    lensFlare: true,
    spaceBackdrop: true,
    waterQuality: 'high',
  },
  high: {
    label: 'HIGH',
    blurb: 'Water you can see yourself in. Cliffs you can hear.',
    renderScale: 1,
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 4096,
    cascades: 3,
    ssao: true,
    ssr: true,
    ssrOpacity: 0.5,
    bloom: true,
    bloomStrength: 0.65,
    dof: true,
    motionBlur: true,
    godrays: true,
    volumetrics: true,
    cloudSteps: 40,
    rain: true,
    weatherFx: true,
    reflectionSize: 1024,
    terrainRadius: 7,
    terrainSegments: 96,
    grassDensity: 1,
    grassRadius: 260,
    treeDensity: 1,
    creatureDensity: 1,
    creatureRadius: 600,
    drawDistance: 3200,
    lodBias: 1.3,
    particles: 1,
    postAA: 'smaa',
    taa: false,
    chromatic: true,
    grain: true,
    lensFlare: true,
    spaceBackdrop: true,
    waterQuality: 'high',
  },
  ultra: {
    label: 'ULTRA',
    blurb: 'Every droplet is a mirror. Simolysis is watching.',
    renderScale: 1,
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 4096,
    cascades: 4,
    ssao: true,
    ssr: true,
    ssrOpacity: 0.75,
    bloom: true,
    bloomStrength: 0.8,
    dof: true,
    motionBlur: true,
    godrays: true,
    volumetrics: true,
    cloudSteps: 64,
    rain: true,
    weatherFx: true,
    reflectionSize: 2048,
    terrainRadius: 9,
    terrainSegments: 128,
    grassDensity: 1.35,
    grassRadius: 340,
    treeDensity: 1.25,
    creatureDensity: 1.4,
    creatureRadius: 900,
    drawDistance: 5000,
    lodBias: 1.6,
    particles: 1.5,
    postAA: 'smaa',
    taa: true,
    chromatic: true,
    grain: true,
    lensFlare: true,
    spaceBackdrop: true,
    waterQuality: 'ultra',
  },
};

export const QUALITY_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

/** Numeric/boolean/enum clamps per setting key. */
const RULES = {
  quality: { type: 'enum', values: QUALITY_ORDER, fallback: 'high' },
  autoQuality: { type: 'bool', fallback: true },
  renderScale: { type: 'num', min: 0.35, max: 2, fallback: 1 },
  pixelRatioCap: { type: 'num', min: 0.5, max: 2.5, fallback: 1.5 },
  fov: { type: 'num', min: 50, max: 120, fallback: 78 },
  invertY: { type: 'bool', fallback: false },
  mouseSensitivity: { type: 'num', min: 0.2, max: 4, fallback: 1 },
  gamepadSensitivity: { type: 'num', min: 0.2, max: 4, fallback: 1.2 },
  masterVolume: { type: 'num', min: 0, max: 1, fallback: 0.85 },
  musicVolume: { type: 'num', min: 0, max: 1, fallback: 0.6 },
  ambienceVolume: { type: 'num', min: 0, max: 1, fallback: 0.7 },
  sfxVolume: { type: 'num', min: 0, max: 1, fallback: 0.8 },
  voiceVolume: { type: 'num', min: 0, max: 1, fallback: 1 },
  narration: { type: 'bool', fallback: true },
  subtitles: { type: 'bool', fallback: true },
  hud: { type: 'bool', fallback: true },
  crosshair: { type: 'bool', fallback: true },
  showFps: { type: 'bool', fallback: false },
  cameraShake: { type: 'num', min: 0, max: 2, fallback: 1 },
  headBob: { type: 'num', min: 0, max: 1, fallback: 0.6 },
  motionScale: { type: 'num', min: 0, max: 1, fallback: 0.35 },
  viewDistance: { type: 'num', min: 0.5, max: 2, fallback: 1 },
  godMode: { type: 'bool', fallback: false },
  thirdPerson: { type: 'bool', fallback: false },
  seed: { type: 'num', min: 0, max: 4294967295, fallback: 1337, integer: true },
  endedEarth: { type: 'bool', fallback: false }, // set true once the intro is seen
  glitchIntensity: { type: 'num', min: 0, max: 1, fallback: 0.5 },
  fieldOfViewKick: { type: 'num', min: 0, max: 1, fallback: 0.5 },
  allowTeleportKeys: { type: 'bool', fallback: true },
  runToggle: { type: 'bool', fallback: false },
  crouchToggle: { type: 'bool', fallback: false },
};

function clampValue(key, value) {
  const rule = RULES[key];
  if (!rule) return value;
  switch (rule.type) {
    case 'bool':
      return !!value;
    case 'enum':
      return rule.values.includes(value) ? value : rule.fallback;
    case 'num': {
      let n = typeof value === 'number' && Number.isFinite(value) ? value : Number.parseFloat(value);
      if (!Number.isFinite(n)) n = rule.fallback;
      n = clamp(n, rule.min, rule.max);
      return rule.integer ? Math.round(n) : n;
    }
    default:
      return value;
  }
}

export function defaultsFromPreset(preset = 'high') {
  const p = QUALITY_PRESETS[preset] || QUALITY_PRESETS.high;
  const out = {};
  for (const [key, rule] of Object.entries(RULES)) out[key] = rule.fallback;
  out.quality = preset;
  // preset-driven renderer knobs live alongside the user settings
  return { ...out, preset: { ...p } };
}

/** Storage abstraction: browsers get localStorage, Node gets a memory shim. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
}

export function createSettings({ storage = defaultStorage(), preset = 'high' } = {}) {
  const state = defaultsFromPreset(preset);
  const listeners = new Set();

  const emit = (key) => {
    for (const fn of listeners) {
      try {
        fn(key, state[key], state);
      } catch (err) {
        console.error('[settings] listener failed', err);
      }
    }
  };

  const load = () => {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      apply(parsed, { silent: true, persist: false });
      return true;
    } catch (err) {
      console.warn('[settings] corrupt settings payload discarded', err);
      storage.removeItem(STORAGE_KEY);
      return false;
    }
  };

  const save = () => {
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SETTINGS_VERSION, ...state, preset: undefined })
      );
      return true;
    } catch (err) {
      console.warn('[settings] could not persist settings', err);
      return false;
    }
  };

  /** Apply a partial object of settings (unknown keys ignored). */
  function apply(patch, { silent = false, persist = true } = {}) {
    const changed = [];
    if (patch.quality && patch.quality !== state.quality) {
      Object.assign(state, defaultsFromPreset(patch.quality));
      Object.assign(state, { preset: { ...QUALITY_PRESETS[patch.quality] } });
      changed.push('quality');
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'preset' || key === 'version' || key === 'quality') continue;
      if (!(key in RULES)) continue;
      const next = clampValue(key, value);
      if (state[key] !== next) {
        state[key] = next;
        changed.push(key);
      }
    }
    if (persist) save();
    if (!silent) for (const key of changed) emit(key);
    return changed;
  }

  const api = {
    get state() {
      return state;
    },
    get preset() {
      return state.preset;
    },
    get(key) {
      return state[key];
    },
    set(key, value) {
      return apply({ [key]: value });
    },
    patch: apply,
    reset(preset = state.quality) {
      Object.assign(state, defaultsFromPreset(preset));
      save();
      emit('*');
    },
    load,
    save,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Detect a sensible starting preset from the hardware. */
    detectQuality() {
      if (typeof navigator === 'undefined') return 'high';
      const mem = navigator.deviceMemory || 8;
      const cores = navigator.hardwareConcurrency || 4;
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      if (mobile) return cores >= 8 ? 'medium' : 'low';
      if (cores <= 4 || mem <= 4) return 'medium';
      if (cores >= 12 && mem >= 8) return 'ultra';
      if (cores >= 8) return 'high';
      return 'high';
    },
    toJSON() {
      return { ...state, preset: undefined };
    },
  };
  return api;
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__mv_test', '1');
      localStorage.removeItem('__mv_test');
      return localStorage;
    }
  } catch (err) {
    console.warn('[settings] localStorage unavailable, running in memory', err);
  }
  const store = memoryStorage();
  try {
    if (typeof globalThis !== 'undefined') globalThis.__multiverseMemoryStorage = store;
  } catch {
    /* ignore */
  }
  return store;
}

export { RULES as SETTINGS_RULES };
