/**
 * THE MULTIVERSE — audio/audio.js
 * ==================================================================
 * THE AUDIO ENGINE. Owns the AudioContext, the bus graph, the generative
 * score, the ambience beds, the SFX library and the voice of the Archivist.
 *
 * Design notes
 *  • The context is created lazily and unlocked on the first gesture, because
 *    browsers refuse to start audio otherwise.
 *  • Everything is synthesised (see sfx.js / music.js) — the game has no
 *    binary audio assets at all.
 *  • World code talks to this module with plain numbers: `playAt(id, {x,y,z})`
 *    attenuates and pans relative to a listener the game updates each frame.
 *  • Failure is never fatal: if Web Audio is missing or blocked, every method
 *    degrades to a no-op and the game keeps playing silently.
 */
import { clamp, clamp01, lerp } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { buildMixGraph, createAmbienceBed, midiToFreq, renderRecipe, recipeDuration } from './synth.js';
import { SFX, SFX_IDS } from './sfx.js';
import { MusicDirector, themeWithModifier } from './music.js';
import { VoiceSynth, estimateDuration, moodParams } from './voice.js';

export class AudioEngine {
  constructor({ settings, onSubtitle = null } = {}) {
    this.settings = settings;
    this.onSubtitle = onSubtitle;
    this.ctx = null;
    this.graph = null;
    this.started = false;
    this.failed = false;
    this.rng = new Rng(0xa0d10);
    this.listener = { x: 0, y: 0, z: 0, rightX: 1, rightZ: 0, forwardX: 0, forwardZ: -1 };
    this.beds = {};
    this.environment = {
      biome: 'meadow',
      night: 0,
      altitude: 0,
      underwater: 0,
      nearWaterfall: 0,
      rain: 0,
      wind: 0.3,
      interior: 0,
    };
    this.commentaryQueue = [];
    this.speaking = false;
    this.currentSpeaker = null;
    this.duck = 1;
    this.sfxCooldowns = new Map();
    this.activeSfx = 0;
    this.maxConcurrentSfx = 24;
    this.muted = false;
    this.noiseCache = new Map();
    this.lastThunder = 0;
    this.voice = new VoiceSynth({
      enabled: settings?.get('narration') ?? true,
      volume: settings?.get('voiceVolume') ?? 1,
    });
    this.voice.onEnd = () => this._onVoiceEnd();
    this.music = new MusicDirector({
      theme: 'pastoral',
      seed: 1337,
      render: (note) => this._renderNote(note),
    });
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  /** Create the AudioContext. Call from a user gesture handler. */
  init() {
    if (this.started || this.failed) return this.started;
    const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx) {
      this.failed = true;
      console.warn('[audio] Web Audio unavailable — the multiverse will be silent.');
      return false;
    }
    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.graph = buildMixGraph(this.ctx, this.ctx.destination, {
        volumes: this._volumes(),
        reverb: { seconds: 3.6, decay: 2.4, brightness: 0.5, send: 0.3 },
        compressor: { threshold: -15, ratio: 3 },
      });
      this._buildBeds();
      this.music.start(this.ctx.currentTime);
      this.started = true;
      return true;
    } catch (err) {
      this.failed = true;
      console.error('[audio] initialisation failed', err);
      return false;
    }
  }

  async resume() {
    if (!this.ctx) this.init();
    if (!this.ctx) return false;
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }

  _volumes() {
    const s = this.settings;
    return {
      master: s ? s.get('masterVolume') : 0.85,
      music: s ? s.get('musicVolume') : 0.6,
      ambience: s ? s.get('ambienceVolume') : 0.7,
      sfx: s ? s.get('sfxVolume') : 0.8,
      voice: s ? s.get('voiceVolume') : 1,
      ui: 0.9,
    };
  }

  applySettings() {
    if (!this.graph) return;
    const v = this._volumes();
    const now = this.ctx.currentTime;
    const ramp = (param, value) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(clamp(value, 0, 1.5), now, 0.05);
    };
    ramp(this.graph.master.gain, this.muted ? 0 : v.master);
    ramp(this.graph.buses.music.gain, v.music);
    ramp(this.graph.buses.ambience.gain, v.ambience);
    ramp(this.graph.buses.sfx.gain, v.sfx);
    ramp(this.graph.buses.voice.gain, v.voice);
    this.voice.volume = v.voice;
    if (this.settings && !this.settings.get('narration')) this.stopSpeaking();
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.applySettings();
    if (this.muted) this.stopSpeaking();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  dispose() {
    try {
      this.voice.cancel();
      for (const bed of Object.values(this.beds)) bed.dispose();
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.started = false;
  }

  /* ---------------------------------------------------------------- *
   * Ambience
   * ---------------------------------------------------------------- */

  _buildBeds() {
    const dest = this.graph.buses.ambience;
    this.beds = {
      wind: createAmbienceBed(this.ctx, dest, { color: 'pink', filterFreq: 620, q: 0.7, modulation: 0.5, seed: 11 }),
      water: createAmbienceBed(this.ctx, dest, { color: 'white', filterFreq: 1800, q: 0.5, modulation: 0.2, seed: 22 }),
      rain: createAmbienceBed(this.ctx, dest, { color: 'white', filterFreq: 3400, q: 0.4, modulation: 0.15, seed: 33 }),
      interior: createAmbienceBed(this.ctx, dest, { color: 'brown', filterFreq: 320, q: 1.2, modulation: 0.05, seed: 44 }),
      night: createAmbienceBed(this.ctx, dest, { color: 'pink', filterFreq: 260, q: 1.0, modulation: 0.35, seed: 55 }),
      underwater: createAmbienceBed(this.ctx, dest, { color: 'brown', filterFreq: 180, q: 2.0, modulation: 0.1, seed: 66 }),
      deep: createAmbienceBed(this.ctx, dest, { color: 'brown', filterFreq: 90, q: 3.0, modulation: 0.08, seed: 77 }),
      machine: createAmbienceBed(this.ctx, dest, { color: 'pink', filterFreq: 420, q: 6.0, modulation: 0.02, seed: 88 }),
      static: createAmbienceBed(this.ctx, dest, { color: 'white', filterFreq: 5200, q: 0.6, modulation: 0.4, seed: 99 }),
    };
  }

  /** Called whenever the world context changes (biome, weather, depth…). */
  setEnvironment(patch) {
    Object.assign(this.environment, patch);
    if (!this.started) return;
    const e = this.environment;
    const lyricish = {
      wind: 0.05 + e.wind * (0.5 + e.altitude * 0.4) + (1 - e.night) * 0.05,
      water: clamp01(e.nearWaterfall * 0.9 + (e.biome === 'lake' ? 0.4 : 0) + (e.biome === 'abyss' ? 0.25 : 0)),
      rain: clamp01(e.rain * 0.8),
      interior: clamp01(e.interior * 0.9),
      night: clamp01(e.night * 0.7),
      underwater: clamp01(e.underwater * 0.9),
      deep: clamp01(e.underwater * e.altitude * 0.8),
      machine: clamp01(e.interior * 0.4 + (e.biome === 'backrooms' ? 0.5 : 0)),
      static: clamp01(e.biome === 'midnight' ? 0.35 : 0),
    };
    for (const [name, level] of Object.entries(lyricish)) {
      this.beds[name]?.setLevel(level, 1.4);
    }
    // Water and rain need low-pass movement so they read as distance.
    this.beds.water?.setFilter(e.nearWaterfall > 0.4 ? 2600 : 1400);
    this.beds.rain?.setFilter(e.underwater > 0.5 ? 700 : 3400);
  }

  /* ---------------------------------------------------------------- *
   * Music
   * ---------------------------------------------------------------- */

  setMusicTheme(themeId, { modifiers = [], immediate = true } = {}) {
    this.music.setTheme(themeId, { modifiers, immediate });
  }

  setMusicIntensity(value) {
    this.music.setIntensity(value);
  }

  _renderNote({ freq, velocity, instrument, time, duration }) {
    if (!this.started) return;
    const recipeFor = MUSIC_RENDERERS[instrument];
    if (!recipeFor) return;
    const layers = recipeFor(freq, velocity, duration);
    const delay = Math.max(0, time - this.ctx.currentTime);
    renderRecipe(this.ctx, this.graph.buses.music, { layers }, this.ctx.currentTime + delay, { noiseCache: this.noiseCache });
  }

  /* ---------------------------------------------------------------- *
   * SFX
   * ---------------------------------------------------------------- */

  /**
   * Play a one-shot effect. `pan` in [-1,1], `gain` multiplier, `rate`
   * transposes noise playback (pitch variation per instance).
   */
  play(id, { gain = 1, pan = 0, rate = 1, detune = 0, minInterval = 0.02 } = {}) {
    if (!this.started || this.muted) return false;
    const recipe = SFX[id];
    if (!recipe) {
      console.warn(`[audio] unknown sfx "${id}"`);
      return false;
    }
    const now = this.ctx.currentTime;
    if (minInterval > 0) {
      const last = this.sfxCooldowns.get(id) ?? -Infinity;
      if (now - last < minInterval) return false;
      this.sfxCooldowns.set(id, now);
    }
    if (this.activeSfx >= this.maxConcurrentSfx) return false;
    const layerCopy = recipe.layers.map((layer) => ({ ...layer, pan: clamp((layer.pan ?? 0) + pan, -1, 1) }));
    if (detune) for (const layer of layerCopy) layer.detune = (layer.detune ?? 0) + detune;
    if (rate !== 1) for (const layer of layerCopy) if (layer.kind === 'noise') layer.rate = (layer.rate ?? 1) * rate;

    const tree = { layers: layerCopy.map((l) => ({ ...l, gain: (l.gain ?? 0.5) * gain })) };
    const end = renderRecipe(this.ctx, this.graph.buses.sfx, tree, now, { noiseCache: this.noiseCache });
    this.activeSfx++;
    const lifetime = Math.max(50, (recipeDuration(tree) + 0.4) * 1000);
    setTimeout(() => {
      this.activeSfx = Math.max(0, this.activeSfx - 1);
    }, lifetime);
    return end;
  }

  /**
   * Positional playback. `position` is a plain {x,y,z}; the listener basis is
   * updated by the game each frame from the active camera.
   */
  playAt(id, position, { gain = 1, rate = 1, refDistance = 12, maxDistance = 900, reverb = 0 } = {}) {
    if (!this.started) return false;
    const dx = position.x - this.listener.x;
    const dy = position.y - this.listener.y;
    const dz = position.z - this.listener.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > maxDistance) return false;
    const attenuation = refDistance / (refDistance + distance * distance * 0.02 + distance * 0.35);
    const inv = 1 / Math.max(0.0001, distance);
    const pan = clamp((dx * this.listener.rightX + dz * this.listener.rightZ) * inv, -1, 1);
    const occlusion = 1 - clamp01(Math.max(0, this.environment.underwater - 0) * 0.5);
    return this.play(id, {
      gain: gain * clamp(attenuation, 0, 1) * occlusion,
      pan,
      rate: lerp(0.94, 1.06, clamp01(distance / maxDistance)),
      minInterval: 0.08,
    });
  }

  /** Update the listener used for positional audio (plain numbers). */
  setListener({ x = 0, y = 0, z = 0, rightX = 1, rightZ = 0, forwardX = 0, forwardZ = -1 } = {}) {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    this.listener.rightX = rightX;
    this.listener.rightZ = rightZ;
    this.listener.forwardX = forwardX;
    this.listener.forwardZ = forwardZ;
    if (this.ctx?.listener && this.ctx.listener.positionX) {
      try {
        const t = this.ctx.currentTime;
        this.ctx.listener.positionX.setTargetAtTime(x, t, 0.05);
        this.ctx.listener.positionY.setTargetAtTime(y, t, 0.05);
        this.ctx.listener.positionZ.setTargetAtTime(z, t, 0.05);
        this.ctx.listener.forwardX.setTargetAtTime(forwardX, t, 0.05);
        this.ctx.listener.forwardZ.setTargetAtTime(forwardZ, t, 0.05);
      } catch {
        /* older browsers use setPosition — not worth supporting */
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Voice / commentary
   * ---------------------------------------------------------------- */

  /**
   * Speak a line. priority: 0 = ambient chatter (dropped when busy),
   * 1 = normal (queued), 2 = critical (interrupts).
   */
  narrate(text, { mood = 'calm', character = 'archivist', speaker = null, priority = 1, subtitle = true } = {}) {
    if (!text) return false;
    if (this.muted || (this.settings && !this.settings.get('narration'))) {
      if (subtitle && this.settings?.get('subtitles') !== false) {
        this.onSubtitle?.({ text, speaker, duration: estimateDuration(text, mood), mood, silent: true });
      }
      return false;
    }
    if (priority === 0 && (this.speaking || this.commentaryQueue.length)) return false;
    const item = { text, mood, character, speaker, priority, subtitle };
    if (priority >= 2) {
      this.commentaryQueue.length = 0;
      this.stopSpeaking();
    }
    if (this.speaking) {
      if (this.commentaryQueue.length > 3) this.commentaryQueue.shift();
      this.commentaryQueue.push(item);
      return false;
    }
    this._speakItem(item);
    return true;
  }

  _speakItem(item) {
    const params = moodParams(item.mood);
    const usePlatform = this.voice.available && this.settings?.get('narration') !== false;
    const duration = estimateDuration(item.text, item.mood);
    this.speaking = true;
    this.currentSpeaker = item.speaker || item.character;
    if (item.subtitle && this.settings?.get('subtitles') !== false) {
      this.onSubtitle?.({
        text: item.text,
        speaker: item.speaker,
        duration,
        mood: item.mood,
        silent: !usePlatform,
      });
    }
    this._duckTo(0.45, 0.5);
    if (usePlatform) {
      this.voice.speak(item.text, {
        mood: item.mood,
        character: item.character,
        volume: this._volumes().voice,
        onEnd: () => this._onVoiceEnd(),
      });
      // Safety net: some platforms never fire onend.
      setTimeout(() => {
        if (this.speaking && this.currentSpeaker === (item.speaker || item.character)) this._onVoiceEnd();
      }, (duration + 3) * 1000);
    } else {
      const alienDuration = speakAlienFallback(this, item.text, { mood: item.mood, character: item.character });
      setTimeout(() => this._onVoiceEnd(), alienDuration * 1000 + 200);
    }
    this._spokenAt = performance.now?.() ?? Date.now();
    this._lastItem = item;
    void params;
  }

  _onVoiceEnd() {
    this.speaking = false;
    this.currentSpeaker = null;
    this._duckTo(1, 1.2);
    const next = this.commentaryQueue.shift();
    if (next) setTimeout(() => this._speakItem(next), 260);
  }

  stopSpeaking() {
    this.voice.cancel();
    this.commentaryQueue.length = 0;
    if (this.speaking) this._onVoiceEnd();
  }

  _duckTo(value, seconds) {
    if (!this.graph) return;
    const now = this.ctx.currentTime;
    this.duck = value;
    this.graph.buses.music.gain.setTargetAtTime(this._volumes().music * value, now, seconds / 3);
    this.graph.buses.ambience.gain.setTargetAtTime(this._volumes().ambience * lerp(1, value, 0.5), now, seconds / 3);
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update() {
    if (!this.started) return;
    this.music.update(this.ctx.currentTime);
    // Distant thunder during storms, at a human-irregular interval.
    const e = this.environment;
    if (e.rain > 0.4) {
      const now = this.ctx.currentTime;
      if (now - this.lastThunder > 14 + this.rng.float() * 26) {
        this.lastThunder = now;
        this.play('thunder', { gain: 0.35 + this.rng.float() * 0.4, pan: this.rng.range(-0.7, 0.7) });
      }
    }
  }

  get list() {
    return SFX_IDS;
  }
}

/* ---------------------------------------------------------------------- *
 * Music instrument renderers (frequency + velocity -> synthesis layers)
 * ---------------------------------------------------------------------- */

function withDuration(layers, duration) {
  return layers.map((layer) => {
    const scale = clamp01(duration / 3.2);
    return {
      ...layer,
      attack: Math.min(layer.attack ?? 0.01, 0.4 + scale),
      hold: (layer.hold ?? 0) * lerp(0.4, 1.2, scale),
      decay: (layer.decay ?? 0.2) * lerp(0.6, 1.4, scale),
      release: (layer.release ?? 0.4) * lerp(0.7, 1.5, scale),
    };
  });
}

export const MUSIC_RENDERERS = {
  pad: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'osc', waveform: 'triangle', freq, attack: 2.2, decay: 2.4, release: 3.2, gain: 0.07 * velocity,
          hold: 2.0, unison: 3, spread: 9, filter: { type: 'lowpass', freq: 850, freqEnd: 1500, q: 0.8 },
        },
        { kind: 'osc', waveform: 'sine', freq: freq * 1.4983, attack: 2.8, decay: 2.4, release: 3.4, gain: 0.026 * velocity, hold: 2.0, detune: 5 },
      ],
      duration
    ),
  bell: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'fm', waveform: 'sine', freq, modFreq: freq * 2.757, modDepth: freq * 1.3, attack: 0.004, decay: 1.6,
          release: 2.4, gain: 0.045 * velocity, filter: { type: 'highpass', freq: 420 },
        },
        { kind: 'osc', waveform: 'sine', freq: freq * 2.02, attack: 0.006, decay: 1.0, release: 1.8, gain: 0.016 * velocity },
      ],
      duration
    ),
  pluck: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'osc', waveform: 'sawtooth', freq, attack: 0.004, decay: 1.0, release: 1.3, gain: 0.05 * velocity,
          filter: { type: 'lowpass', freq: 4200, freqEnd: 480, q: 3.4 },
        },
        { kind: 'osc', waveform: 'triangle', freq: freq * 0.5, attack: 0.005, decay: 0.9, release: 1.1, gain: 0.018 * velocity },
      ],
      duration
    ),
  bass: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'osc', waveform: 'sine', freq, attack: 0.7, decay: 1.4, release: 2.2, gain: 0.1 * velocity, hold: 1.0,
          sub: { freq: freq * 0.5, gain: 0.45 }, filter: { type: 'lowpass', freq: 300, q: 1.4 },
        },
      ],
      duration
    ),
  choir: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'osc', waveform: 'sine', freq, attack: 1.5, decay: 1.6, release: 2.4, gain: 0.03 * velocity, hold: 1.2,
          unison: 4, spread: 18, filter: { type: 'bandpass', freq: freq * 2.2, q: 1.2 },
        },
        {
          kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: freq * 3.1, q: 3.2 }, attack: 1.6, decay: 1.4,
          release: 2.2, gain: 0.01 * velocity, duration: 4,
        },
      ],
      duration
    ),
  shimmer: (freq, velocity, duration) =>
    withDuration(
      [{ kind: 'osc', waveform: 'sine', freq, attack: 3.0, decay: 3.2, release: 4.0, gain: 0.016 * velocity, hold: 2.8, unison: 2, spread: 24 }],
      duration
    ),
  drone: (freq, velocity, duration) =>
    withDuration(
      [
        {
          kind: 'osc', waveform: 'sawtooth', freq, attack: 3.6, decay: 3.6, release: 4.6, gain: 0.045 * velocity, hold: 5.0,
          filter: { type: 'lowpass', freq: 460, freqEnd: 680, q: 1.5 }, unison: 2, spread: 6,
        },
      ],
      duration
    ),
  drum: (freq, velocity) => [
    { kind: 'osc', waveform: 'sine', freq: 132, freqEnd: 44, attack: 0.002, decay: 0.34, release: 0.3, gain: 0.14 * velocity, sub: { freq: 44, gain: 0.4 } },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2200, q: 0.8 }, attack: 0.001, decay: 0.08, release: 0.08, gain: 0.04 * velocity, duration: 0.2 },
  ],
  tick: (freq, velocity) => [
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 5400, q: 5 }, attack: 0.001, decay: 0.05, release: 0.04, gain: 0.04 * velocity, duration: 0.12 },
  ],
  sub: (freq, velocity, duration) =>
    withDuration([{ kind: 'osc', waveform: 'sine', freq, attack: 2.0, decay: 2.4, release: 3.2, gain: 0.065 * velocity, hold: 2.6 }], duration),
  glass: (freq, velocity, duration) =>
    withDuration(
      [
        { kind: 'osc', waveform: 'sine', freq, attack: 0.002, decay: 0.85, release: 1.5, gain: 0.028 * velocity, filter: { type: 'highpass', freq: 900 } },
        { kind: 'osc', waveform: 'sine', freq: freq * 3.01, attack: 0.002, decay: 0.55, release: 1.0, gain: 0.011 * velocity },
      ],
      duration
    ),
};

/** Alien vocoder fallback: returns the duration so the caller can time it. */
function speakAlienFallback(engine, text, { mood, character }) {
  const params = moodParams(mood);
  const syllables = Math.max(1, Math.round(text.length / 3.6));
  const speed = character === 'god' ? 0.6 : 1;
  const duration = (syllables * 0.18) / (params.rate * speed);
  return Math.min(60, duration);
}

export { estimateDuration, midiToFreq };
