/**
 * THE MULTIVERSE — audio/synth.js
 * ==================================================================
 * The game ships with ZERO audio files. Every sound in the multiverse —
 * the music, the wind, the waterfalls, the whale songs, the thunder, the
 * hum of LODEMUS, the voice of the Archivist — is synthesised live by the
 * Web Audio API from oscillators, procedural noise and one convolution
 * reverb built from generated impulse responses.
 *
 * Why: procedural audio reacts to the world (it can be tuned to the biome,
 * the weather, the creature, the time of day) and it keeps the whole game
 * a single reproducible artifact with no binary assets.
 *
 * This module is a *toolkit*: buffers, reverbs, envelopes and the generic
 * SFX renderer used by sfx.js. It never touches the DOM except to create an
 * AudioContext, which music/audio.js owns.
 */
import { clamp, clamp01 } from '../core/math.js';

/* ------------------------------------------------------------------ *
 * Buffers
 * ------------------------------------------------------------------ */

/** White/pink/brown noise buffer, optionally with a fade-in or -out. */
export function noiseBuffer(ctx, seconds = 1, { color = 'white', reverse = false, seedRandom = Math.random } = {}) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = seedRandom() * 2 - 1;
      let v = white;
      if (color === 'pink') {
        // Paul Kellet's pink filter
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        v = (b0 + b1 + b2 + white * 0.1848) * 0.28;
      } else if (color === 'brown') {
        brown = (brown + 0.02 * white) / 1.02;
        v = brown * 3.5;
      }
      data[i] = v;
    }
    if (reverse) data.reverse();
  }
  return buffer;
}

/**
 * Impulse response for ConvolverNode. Exponentially decaying noise with a
 * configurable pre-delay and tail colour — this is what makes the valley
 * feel like it has air in it.
 */
export function impulseResponse(ctx, { seconds = 3.2, decay = 2.6, preDelay = 0.012, brightness = 0.55, reverse = false } = {}) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const preSamples = Math.floor(rate * preDelay);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lp = 0;
    const lpCoef = clamp(brightness, 0.02, 1);
    for (let i = 0; i < length; i++) {
      if (i < preSamples) {
        data[i] = 0;
        continue;
      }
      const t = (i - preSamples) / (length - preSamples);
      const envelope = Math.pow(1 - t, decay);
      const white = Math.random() * 2 - 1;
      lp += lpCoef * (white - lp);
      data[i] = lp * envelope;
    }
    if (reverse) data.reverse();
  }
  return buffer;
}

/** A short "click"/"impulse" buffer for percussion. */
export function clickBuffer(ctx, seconds = 0.05) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6);
  }
  return buffer;
}

/* ------------------------------------------------------------------ *
 * Envelopes
 * ------------------------------------------------------------------ */

/**
 * ADSR-style amplitude envelope applied to a GainNode's param.
 * All times are seconds relative to `start`.
 */
export function applyEnvelope(param, start, { attack = 0.01, decay = 0.2, sustain = 0.0, release = 0.4, peak = 1, hold = 0 } = {}) {
  const eps = 1e-4;
  const a = Math.max(eps, attack);
  param.cancelScheduledValues?.(start);
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(eps, peak), start + a);
  if (hold > 0) param.setValueAtTime(Math.max(eps, peak), start + a + hold);
  const decayLevel = Math.max(eps, peak * sustain);
  param.exponentialRampToValueAtTime(decayLevel, start + a + hold + Math.max(eps, decay));
  if (release > 0) param.exponentialRampToValueAtTime(0.0001, start + a + hold + decay + release);
  return start + a + hold + decay + release;
}

/** Envelope total duration in seconds (mirrors applyEnvelope's timeline). */
export function envelopeDuration({ attack = 0.01, decay = 0.2, release = 0.4, hold = 0 } = {}) {
  return Math.max(1e-4, attack) + hold + Math.max(1e-4, decay) + release;
}

/** Linear attack / exponential decay curve for one-shot "tick" sounds. */
export function pluckCurve(param, start, { attack = 0.002, duration = 0.6, peak = 1, exponent = 3 } = {}) {
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(1e-4, peak), start + attack);
  param.exponentialRampToValueAtTime(0.0001, start + duration);
  return duration;
}

/* ------------------------------------------------------------------ *
 * The generic voice renderer
 * ------------------------------------------------------------------ */

const WAVEFORMS = new Set(['sine', 'square', 'sawtooth', 'triangle', 'custom']);

/**
 * Render one "layer" of a sound effect. Layers are pure data so the SFX
 * library can be inspected, tested and modified without audio expertise.
 *
 * layer = {
 *   kind: 'osc' | 'noise' | 'fm',
 *   waveform, freq, freqEnd, detune,               // oscillators
 *   color,                                          // noise colour
 *   attack, decay, hold, release, gain,             // envelope
 *   filter: { type, freq, freqEnd, q, env?, attack? },
 *   pan, delay, duration, glide, unison,            // extras
 *   sub: { freq, gain },                            // optional sub-oscillator
 * }
 */
export function renderLayer(ctx, destination, layer, start, { noiseCache } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0;
  let tail = out;

  if (layer.pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(layer.pan, -1, 1);
    out.connect(panner);
    tail = panner;
  }

  if (layer.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter.type || 'lowpass';
    filter.frequency.setValueAtTime(Math.max(30, layer.filter.freq ?? 1200), start);
    if (layer.filter.freqEnd != null) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(30, layer.filter.freqEnd),
        start + (layer.filter.env ?? envelopeDuration(layer))
      );
    }
    filter.Q.value = clamp(layer.filter.q ?? 0.7, 0.0001, 30);
    out.connect(filter);
    tail = filter;
  }

  if (layer.delay) {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = clamp(layer.delay, 0, 2);
    const feedback = ctx.createGain();
    feedback.gain.value = clamp(layer.feedback ?? 0.35, 0, 0.95);
    out.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(tail === out ? out : tail);
  }

  tail.connect(destination);

  const sources = [];
  const duration = envelopeDuration(layer);
  const t = start + (layer.offset ?? 0);

  if (layer.kind === 'noise') {
    const key = `${layer.color || 'white'}:${layer.duration || 2}`;
    let buffer = noiseCache?.get(key);
    if (!buffer) {
      buffer = noiseBuffer(ctx, Math.max(0.25, layer.duration || 2), { color: layer.color || 'white', reverse: !!layer.reverse });
      noiseCache?.set(key, buffer);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = clamp(layer.rate ?? 1, 0.05, 8);
    src.connect(out);
    sources.push(src);
  } else {
    const unison = clamp(layer.unison ?? 1, 1, 4);
    for (let u = 0; u < unison; u++) {
      const osc = ctx.createOscillator();
      osc.type = WAVEFORMS.has(layer.waveform) ? layer.waveform : 'sine';
      const detune = (layer.detune ?? 0) + (unison > 1 ? (u - (unison - 1) / 2) * (layer.spread ?? 6) : 0);
      osc.detune.value = detune;
      const f0 = Math.max(8, layer.freq ?? 220);
      const f1 = Math.max(8, layer.freqEnd ?? f0);
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) {
        const glide = clamp(layer.glide ?? duration, 0.001, 60);
        if (layer.exponential !== false) osc.frequency.exponentialRampToValueAtTime(f1, t + glide);
        else osc.frequency.linearRampToValueAtTime(f1, t + glide);
      }
      if (layer.kind === 'fm') {
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        mod.frequency.value = Math.max(4, layer.modFreq ?? f0 * 2);
        modGain.gain.value = Math.max(0, layer.modDepth ?? 200);
        mod.connect(modGain);
        modGain.connect(osc.frequency);
        mod.start(t);
        mod.stop(t + duration + 0.05);
      }
      osc.connect(out);
      osc.start(t);
      osc.stop(t + duration + 0.05);
      sources.push(osc);
    }
    if (layer.sub) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(Math.max(10, layer.sub.freq ?? 55), t);
      const subGain = ctx.createGain();
      subGain.gain.value = clamp(layer.sub.gain ?? 0.5, 0, 1);
      sub.connect(subGain);
      subGain.connect(out);
      sub.start(t);
      sub.stop(t + duration + 0.05);
      sources.push(sub);
    }
  }

  const peak = clamp(layer.gain ?? 0.6, 0, 4);
  applyEnvelope(out.gain, t, {
    attack: layer.attack ?? 0.005,
    decay: layer.decay ?? 0.25,
    hold: layer.hold ?? 0,
    sustain: layer.sustain ?? 0,
    release: layer.release ?? 0.3,
    peak,
  });

  for (const src of sources) {
    try {
      src.stop(t + duration + 0.05);
    } catch {
      /* already stopped */
    }
  }

  return { node: out, endTime: t + duration, sources };
}

/** Render an array of layers (a full sound effect) at `start`. */
export function renderRecipe(ctx, destination, recipe, start, opts) {
  let end = start;
  for (const layer of recipe.layers || []) {
    const { endTime } = renderLayer(ctx, destination, layer, start, opts);
    end = Math.max(end, endTime);
  }
  return end;
}

/** Longest duration of a recipe (used for cleanup timing). */
export function recipeDuration(recipe) {
  let max = 0;
  for (const layer of recipe.layers || []) {
    max = Math.max(max, (layer.offset ?? 0) + envelopeDuration(layer));
  }
  return max;
}

/* ------------------------------------------------------------------ *
 * Ambient loops (wind, water, rain, hum)
 * ------------------------------------------------------------------ */

/**
 * A layered, always-on ambience bed. Returns a handle whose `setLevel`
 * crossfades the whole bed — used for biome ambience and weather.
 */
export function createAmbienceBed(ctx, destination, { color = 'pink', filterFreq = 500, q = 0.8, modulation = 0.3, seed = 1 } = {}) {
  const rng = (() => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x9e3779b9) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 6, { color, seedRandom: rng });
  src.loop = true;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07 + rng() * 0.11;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = filterFreq * clamp(modulation, 0, 1);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  src.start();
  lfo.start();

  return {
    node: gain,
    setLevel(value, time = 0.8) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(clamp(value, 0, 1.5), now, Math.max(0.05, time / 3));
    },
    setFilter(freq) {
      filter.frequency.setTargetAtTime(clamp(freq, 40, 18000), ctx.currentTime, 0.5);
    },
    dispose() {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* ignore */
      }
      gain.disconnect();
      filter.disconnect();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Mixing graph
 * ------------------------------------------------------------------ */

/**
 * Build the standard bus graph:
 *
 *   sources -> [bus gains] -> compressor -> master -> destination
 *                          \-> reverb send (convolver) -/
 *
 * Pure construction against any AudioContext-shaped object, which is how
 * the test suite verifies levels and routing without a real audio device.
 */
export function buildMixGraph(ctx, destination, { volumes = {}, reverb = {}, compressor = {} } = {}) {
  const master = ctx.createGain();
  master.gain.value = clamp(volumes.master ?? 0.85, 0, 1);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = compressor.threshold ?? -14;
  comp.knee.value = compressor.knee ?? 22;
  comp.ratio.value = compressor.ratio ?? 3.2;
  comp.attack.value = compressor.attack ?? 0.006;
  comp.release.value = compressor.release ?? 0.28;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;

  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, reverb);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = clamp(reverb.send ?? 0.35, 0, 1);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = clamp(reverb.return ?? 0.9, 0, 1);

  const buses = {};
  for (const name of ['music', 'ambience', 'sfx', 'voice', 'ui']) {
    const gain = ctx.createGain();
    gain.gain.value = clamp(volumes[name] ?? 0.8, 0, 1);
    gain.connect(comp);
    buses[name] = gain;
  }

  // Music and voice get a taste of the room; UI stays dry and forward.
  buses.music.connect(reverbSend);
  buses.ambience.connect(reverbSend);
  buses.sfx.connect(reverbSend);
  buses.voice.connect(reverbSend);

  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(comp);

  comp.connect(master);
  master.connect(limiter);
  limiter.connect(destination);

  // A ducking sidechain so the Archivist is always intelligible.
  const duck = ctx.createGain();
  duck.gain.value = 1;
  comp.disconnect();
  comp.connect(duck);
  duck.connect(master);

  return { master, comp, limiter, reverbSend, reverbReturn, convolver, duck, buses };
}

/** Frequency (Hz) of a MIDI note number. */
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Semitone offset of a scale degree within a mode. */
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
  // The scale the machine invented for itself: minor, but with a raised
  // fourth and a lowered sixth — it sounds like an apology.
  simolysis: [0, 2, 3, 6, 7, 8, 11],
  floating: [0, 3, 5, 7, 10],
  dust: [0, 1, 5, 7, 8],
};

/** Degree -> semitone for a scale, wrapping across octaves. */
export function degreeToSemitone(scale, degree, root = 0) {
  const s = SCALES[scale] || SCALES.ionian;
  const octave = Math.floor(degree / s.length);
  const idx = ((degree % s.length) + s.length) % s.length;
  return root + octave * 12 + s[idx];
}

/** Degree -> frequency in Hz. */
export function degreeToFreq(scale, degree, rootMidi = 57) {
  return midiToFreq(degreeToSemitone(scale, degree, rootMidi));
}

/** Simple diatonic triad on a degree, voiced close for smooth pads. */
export function triad(scale, degree, rootMidi = 57) {
  return [0, 2, 4].map((i) => degreeToFreq(scale, degree + i, rootMidi));
}
