/**
 * THE MULTIVERSE — audio/music.js
 * ==================================================================
 * THE GENERATIVE SCORE. There is no music file in this game. The score is
 * composed live, bar by bar, from a theme definition per reality: a mode,
 * a root, a tempo, a chord cycle and a set of "instruments" that are really
 * just synthesis recipes.
 *
 * The director is deterministic: a realm with seed 1337 always sounds like
 * itself, but it evolves — layers enter as the player explores, tension
 * rises near danger, and the harmony moves in slow cycles rather than loops.
 */
import { clamp, clamp01, lerp } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { degreeToFreq, midiToFreq, SCALES } from './synth.js';

/** Instrument voices: named layer recipes parameterised by frequency/velocity. */
export const INSTRUMENTS = {
  pad: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'triangle', freq, attack: 2.4, decay: 2.6, release: 3.6, gain: 0.075 * velocity,
      hold: 2.2, unison: 3, spread: 9, filter: { type: 'lowpass', freq: 900, freqEnd: 1400, q: 0.7 },
    },
    {
      kind: 'osc', waveform: 'sine', freq: freq * 1.5, attack: 3.0, decay: 2.6, release: 3.8, gain: 0.03 * velocity,
      hold: 2.2, detune: 4,
    },
  ],
  bell: (freq, velocity) => [
    {
      kind: 'fm', waveform: 'sine', freq, modFreq: freq * 2.76, modDepth: freq * 1.4,
      attack: 0.004, decay: 1.8, release: 2.6, gain: 0.05 * velocity,
      filter: { type: 'highpass', freq: 380 },
    },
    { kind: 'osc', waveform: 'sine', freq: freq * 2.02, attack: 0.006, decay: 1.2, release: 2.0, gain: 0.02 * velocity },
  ],
  pluck: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sawtooth', freq, attack: 0.004, decay: 1.1, release: 1.4, gain: 0.055 * velocity,
      filter: { type: 'lowpass', freq: 4200, freqEnd: 520, q: 3.2 },
    },
    { kind: 'osc', waveform: 'triangle', freq: freq * 0.5, attack: 0.006, decay: 0.9, release: 1.2, gain: 0.02 * velocity },
  ],
  bass: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sine', freq, attack: 0.8, decay: 1.6, release: 2.4, gain: 0.11 * velocity, hold: 1.2,
      sub: { freq: freq * 0.5, gain: 0.5 }, filter: { type: 'lowpass', freq: 320, q: 1.2 },
    },
  ],
  choir: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sine', freq, attack: 1.6, decay: 1.8, release: 2.6, gain: 0.035 * velocity,
      hold: 1.4, unison: 4, spread: 18, filter: { type: 'bandpass', freq: freq * 2.2, q: 1.1 },
    },
    {
      kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: freq * 3.1, q: 3 }, attack: 1.8, decay: 1.6,
      release: 2.4, gain: 0.012 * velocity, duration: 4,
    },
  ],
  shimmer: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sine', freq, attack: 3.2, decay: 3.4, release: 4.2, gain: 0.018 * velocity,
      hold: 3.0, unison: 2, spread: 26,
    },
  ],
  drone: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sawtooth', freq, attack: 4.0, decay: 4.0, release: 5.0, gain: 0.05 * velocity,
      hold: 6.0, filter: { type: 'lowpass', freq: 480, freqEnd: 700, q: 1.4 }, unison: 2, spread: 6,
    },
  ],
  drum: (freq, velocity) => [
    {
      kind: 'osc', waveform: 'sine', freq: 130, freqEnd: 42, attack: 0.002, decay: 0.36, release: 0.3, gain: 0.16 * velocity,
      sub: { freq: 44, gain: 0.4 },
    },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2200, q: 0.8 }, attack: 0.001, decay: 0.09, release: 0.08, gain: 0.05 * velocity, duration: 0.2 },
  ],
  tick: (freq, velocity) => [
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 5200, q: 5 }, attack: 0.001, decay: 0.05, release: 0.04, gain: 0.045 * velocity, duration: 0.12 },
  ],
  sub: (freq, velocity) => [
    { kind: 'osc', waveform: 'sine', freq, attack: 2.2, decay: 2.6, release: 3.4, gain: 0.07 * velocity, hold: 3.0 },
  ],
  glass: (freq, velocity) => [
    { kind: 'osc', waveform: 'sine', freq, attack: 0.002, decay: 0.9, release: 1.6, gain: 0.03 * velocity, filter: { type: 'highpass', freq: 900 } },
    { kind: 'osc', waveform: 'sine', freq: freq * 3.01, attack: 0.002, decay: 0.6, release: 1.0, gain: 0.012 * velocity },
  ],
};

export const THEMES = {
  pastoral: {
    scale: 'ionian', rootMidi: 57, tempo: 62, mood: 'open', bright: 0.75, density: 0.45, tension: 0.05,
    chords: [0, 4, 5, 3, 0, 3, 4, 5], // degrees, one per bar
    pads: ['pad', 'choir'], melody: ['bell', 'pluck'], bass: ['bass'], percussion: [],
    weather: { wind: 0.35, water: 0.5 },
  },
  void: {
    scale: 'dust', rootMidi: 52, tempo: 44, mood: 'absent', bright: 0.35, density: 0.2, tension: 0.1,
    chords: [0, 1, 0, 2], pads: ['pad', 'shimmer'], melody: ['glass'], bass: [], percussion: [],
    weather: { wind: 0.6, water: 0.0 },
  },
  hum: {
    scale: 'locrian', rootMidi: 45, tempo: 76, mood: 'wrong', bright: 0.25, density: 0.3, tension: 0.55,
    chords: [0, 0, 5, 0], pads: ['drone'], melody: ['tick'], bass: ['sub'], percussion: ['tick'],
    weather: { wind: 0.05, water: 0.15 },
  },
  maze: {
    scale: 'phrygian', rootMidi: 48, tempo: 84, mood: 'pressured', bright: 0.3, density: 0.5, tension: 0.5,
    chords: [0, 3, 1, 4, 0, 5], pads: ['pad'], melody: ['pluck'], bass: ['bass'], percussion: ['drum', 'tick'],
    weather: { wind: 0.2, water: 0.1 },
  },
  fractal: {
    scale: 'wholeTone', rootMidi: 55, tempo: 58, mood: 'geometric', bright: 0.85, density: 0.6, tension: 0.25,
    chords: [0, 2, 4, 1, 3, 5], pads: ['choir', 'pad'], melody: ['bell', 'glass'], bass: ['bass'], percussion: ['tick'],
    weather: { wind: 0.3, water: 0.2 },
  },
  singularity: {
    scale: 'octatonic', rootMidi: 40, tempo: 52, mood: 'inevitable', bright: 0.4, density: 0.55, tension: 0.85,
    chords: [0, 1, 5, 3], pads: ['drone', 'sub'], melody: ['glass'], bass: ['bass'], percussion: ['drum'],
    weather: { wind: 0.7, water: 0.0 },
  },
  midnight: {
    scale: 'harmonicMinor', rootMidi: 50, tempo: 72, mood: 'noir', bright: 0.5, density: 0.55, tension: 0.45,
    chords: [0, 5, 3, 6, 2, 5], pads: ['pad'], melody: ['pluck', 'bell'], bass: ['bass'], percussion: ['tick', 'drum'],
    weather: { wind: 0.3, water: 0.3 },
  },
  ascension: {
    scale: 'lydian', rootMidi: 60, tempo: 56, mood: 'luminous', bright: 1.0, density: 0.4, tension: 0.0,
    chords: [0, 1, 4, 5], pads: ['choir', 'shimmer'], melody: ['bell'], bass: ['sub'], percussion: [],
    weather: { wind: 0.5, water: 0.0 },
  },
  micro: {
    scale: 'simolysis', rootMidi: 64, tempo: 88, mood: 'curious', bright: 0.7, density: 0.6, tension: 0.15,
    chords: [0, 3, 5, 2], pads: ['glass'], melody: ['glass', 'bell'], bass: [], percussion: ['tick'],
    weather: { wind: 0.1, water: 0.7 },
  },
  colossus: {
    scale: 'aeolian', rootMidi: 36, tempo: 48, mood: 'vast', bright: 0.45, density: 0.5, tension: 0.2,
    chords: [0, 5, 3, 4], pads: ['drone', 'choir'], melody: ['bell'], bass: ['sub', 'bass'], percussion: ['drum'],
    weather: { wind: 0.8, water: 0.2 },
  },
  cities: {
    scale: 'mixolydian', rootMidi: 53, tempo: 68, mood: 'urbane', bright: 0.8, density: 0.6, tension: 0.2,
    chords: [0, 4, 5, 1, 3], pads: ['pad'], melody: ['pluck', 'glass'], bass: ['bass'], percussion: ['tick', 'drum'],
    weather: { wind: 0.4, water: 0.3 },
  },
  abyss: {
    scale: 'simolysis', rootMidi: 41, tempo: 46, mood: 'deep', bright: 0.3, density: 0.35, tension: 0.3,
    chords: [0, 2, 5, 1], pads: ['drone', 'shimmer'], melody: ['glass'], bass: ['sub'], percussion: [],
    weather: { wind: 0.2, water: 0.9 },
  },
  // Special states layered over the current theme
  danger: { tempoScale: 1.35, tension: 0.95, densityBias: 0.3, percussion: ['drum'] },
  wonder: { tempoScale: 0.85, tension: 0.05, brightBias: 0.25 },
};

export function themeWithModifier(baseId, modifierIds = []) {
  const base = THEMES[baseId] || THEMES.pastoral;
  let tempo = base.tempo;
  let tension = base.tension ?? 0.1;
  let bright = base.bright ?? 0.6;
  let density = base.density ?? 0.5;
  let percussion = [...(base.percussion || [])];
  for (const id of modifierIds) {
    const mod = THEMES[id];
    if (!mod) continue;
    if (mod.tempoScale) tempo *= mod.tempoScale;
    if (mod.tension != null) tension = lerp(tension, mod.tension, 0.6);
    if (mod.brightBias) bright = clamp01(bright + mod.brightBias);
    if (mod.densityBias) density = clamp01(density + mod.densityBias);
    if (mod.percussion) percussion = [...new Set([...percussion, ...mod.percussion])];
  }
  return { ...base, tempo, tension, bright, density, percussion };
}

/**
 * The music director. It does not know about AudioContext internals — it asks
 * a `render(freq, time, velocity, instrument, duration)` callback to realise
 * the notes it composes, which keeps composition logic testable.
 */
export class MusicDirector {
  constructor({ theme = 'pastoral', seed = 1, render, lookahead = 2.5 } = {}) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.render = render || (() => {});
    this.lookahead = lookahead;
    this.themeId = theme;
    this.theme = themeWithModifier(theme);
    this.nextNoteTime = 0;
    this.bar = 0;
    this.beat = 0;
    this.started = false;
    this.intensity = 0.5; // 0..1, set by gameplay (danger, discovery)
    this.modifiers = [];
    this.lastScheduled = 0;
    this.noteCount = 0;
  }

  setTheme(themeId, { modifiers = [], immediate = true } = {}) {
    if (themeId === this.themeId && modifiers.join() === this.modifiers.join()) return;
    this.themeId = themeId;
    this.modifiers = modifiers;
    const next = themeWithModifier(themeId, modifiers);
    if (immediate) {
      this.theme = next;
      this.bar = 0;
    } else {
      this.pendingTheme = next;
    }
  }

  setIntensity(value) {
    this.intensity = clamp01(value);
  }

  /** Begin scheduling at a given absolute audio time. */
  start(now) {
    this.nextNoteTime = now + 0.15;
    this.started = true;
    this.bar = 0;
    this.beat = 0;
    return this;
  }

  beatDuration() {
    const tempo = clamp(this.theme.tempo * lerp(1, 1.12, this.intensity), 30, 160);
    return 60 / tempo;
  }

  /**
   * Called every frame with the current audio clock. Schedules anything that
   * falls inside the lookahead window.
   * @returns {number} number of notes scheduled this call
   */
  update(now) {
    if (!this.started) return 0;
    if (this.pendingTheme && now >= this.nextNoteTime) {
      this.theme = this.pendingTheme;
      this.pendingTheme = null;
      this.bar = 0;
    }
    let scheduled = 0;
    let guard = 0;
    while (this.nextNoteTime < now + this.lookahead && guard++ < 64) {
      scheduled += this._scheduleBeat(this.nextNoteTime);
      this.nextNoteTime += this.beatDuration();
      this.beat++;
      if (this.beat % 4 === 0) this.bar++;
    }
    this.lastScheduled = this.nextNoteTime;
    this.noteCount += scheduled;
    return scheduled;
  }

  /** Compose and emit everything that happens on one beat. */
  _scheduleBeat(time) {
    const theme = this.theme;
    const scale = SCALES[theme.scale] ? theme.scale : 'ionian';
    const root = theme.rootMidi;
    const beatInBar = this.beat % 4;
    const bar = this.bar;
    const chordDegree = theme.chords[bar % theme.chords.length];
    const rng = this.rng;
    let notes = 0;
    const emit = (degree, instrument, velocity, duration, octaveOffset = 0) => {
      const freq = degreeToFreq(scale, degree + octaveOffset * 7, root);
      if (!Number.isFinite(freq) || freq < 20 || freq > 8000) return;
      this.render({ freq, time, velocity: clamp01(velocity), instrument, duration, bar, beat: this.beat });
      notes++;
    };

    // ---- harmonic bed: a new chord every bar (occasionally every 2 bars) ----
    if (beatInBar === 0) {
      const padGain = clamp01(0.45 + this.intensity * 0.35) * (0.7 + theme.bright * 0.3);
      for (const instrument of theme.pads || []) {
        emit(chordDegree, instrument, padGain, 4, 0);
        emit(chordDegree + 2, instrument, padGain * 0.8, 4, 0);
        emit(chordDegree + 4, instrument, padGain * 0.7, 4, 0);
        if (theme.mood === 'vast' || theme.mood === 'geometric') emit(chordDegree - 3, instrument, padGain * 0.5, 4, -1);
      }
      for (const instrument of theme.bass || []) emit(chordDegree - 7, instrument, 0.6, 4, -1);
      // slow harmonic motion: an inner voice that drifts between chord tones
      if (rng.bool(0.5)) emit(chordDegree + 7 + rng.pick([0, 2, 4]), rng.pick(theme.melody || ['pad']), 0.25, 3, 1);
    }

    // ---- melody: sparse, never repeating exactly (it drifts by design) ----
    const melodyChance = clamp01(0.12 + theme.density * 0.3 + this.intensity * 0.15);
    if (rng.float() < melodyChance) {
      const instrument = rng.pick(theme.melody || ['bell']);
      const shape = rng.pick([
        chordDegree + rng.pick([0, 2, 4, 7]),
        chordDegree + rng.int(0, 6) + rng.pick([0, 0, 7]),
        chordDegree + 4 + rng.pick([0, 1, 2, 5]),
      ]);
      emit(shape, instrument, 0.4 + rng.float() * 0.35, rng.range(1.2, 3.2), rng.pick([0, 0, 0, 1]));
    }

    // ---- percussion: enters with tension, leaves with calm ----
    if (theme.percussion?.length && this.intensity > 0.28) {
      const drumChance = beatInBar === 0 ? 1 : clamp01(this.intensity * 0.6);
      if (rng.float() < drumChance) {
        const instrument = rng.pick(theme.percussion);
        emit(chordDegree - 14, instrument, 0.35 + this.intensity * 0.5, 1);
      }
      if (beatInBar === 2 && rng.bool(0.35 + this.intensity * 0.3)) {
        emit(chordDegree - 7, 'tick', 0.2 + this.intensity * 0.35, 0.5);
      }
    }

    // ---- tension shimmer: a high, quiet pulse when danger rises ----
    if (this.intensity > 0.65 && rng.bool(0.2)) {
      emit(chordDegree + 14, 'shimmer', 0.18, 4, 1);
    }

    return notes;
  }
}

/** Total seconds of musical material scheduled per minute (diagnostics). */
export function estimateDensity(director, seconds = 60) {
  const beats = seconds / director.beatDuration();
  let notes = 0;
  const savedRender = director.render;
  director.render = () => {
    notes++;
  };
  const savedTime = director.nextNoteTime;
  const savedBar = director.bar;
  const savedBeat = director.beat;
  director.started = true;
  director.update(savedTime + seconds);
  director.render = savedRender;
  director.nextNoteTime = savedTime;
  director.bar = savedBar;
  director.beat = savedBeat;
  return { beats: Math.round(beats), notes };
}

/** Convenience: a MIDI-frequency table for the themes (used by dev tooling). */
export function themeScaleFrequencies(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return [];
  const scale = theme.scale;
  return Array.from({ length: 14 }, (_, i) => degreeToFreq(scale, i, theme.rootMidi));
}

export { midiToFreq };
