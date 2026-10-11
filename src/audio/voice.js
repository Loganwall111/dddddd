/**
 * THE MULTIVERSE — audio/voice.js
 * ==================================================================
 * THE VOICE OF THE GAME. The Archivist, the god Simolysis and the archetypes
 * that step out of the televisions all speak with the platform speech
 * synthesiser when one exists. When it does not — or when the player mutes
 * narration — a synthesised "alien" vocoder voice takes over, built from
 * syllable-sized formant bursts so every line still *sounds* spoken.
 *
 * The syllabifier and the mood table are pure functions, so the test suite
 * checks that every line in lore.js can be pronounced.
 */
import { clamp } from '../core/math.js';

/** Mood -> prosody. `archivist` is calm and wrong; `god` is huge and slow. */
export const MOODS = {
  reverent: { pitch: 0.85, rate: 0.9, gain: 0.95, pause: 0.35, alien: { base: 96, spread: 14, jitter: 0.25 } },
  awe: { pitch: 1.0, rate: 0.86, gain: 1.0, pause: 0.42, alien: { base: 132, spread: 26, jitter: 0.3 } },
  wonder: { pitch: 1.05, rate: 0.95, gain: 0.95, pause: 0.3, alien: { base: 148, spread: 30, jitter: 0.22 } },
  warm: { pitch: 1.0, rate: 1.0, gain: 0.9, pause: 0.26, alien: { base: 118, spread: 20, jitter: 0.18 } },
  dread: { pitch: 0.72, rate: 0.82, gain: 1.0, pause: 0.5, alien: { base: 72, spread: 10, jitter: 0.4 } },
  epic: { pitch: 0.9, rate: 0.88, gain: 1.0, pause: 0.4, alien: { base: 108, spread: 22, jitter: 0.24 } },
  calm: { pitch: 0.95, rate: 0.98, gain: 0.9, pause: 0.25, alien: { base: 124, spread: 12, jitter: 0.16 } },
  urgent: { pitch: 1.1, rate: 1.15, gain: 1.0, pause: 0.15, alien: { base: 160, spread: 36, jitter: 0.35 } },
  god: { pitch: 0.55, rate: 0.76, gain: 1.0, pause: 0.6, alien: { base: 58, spread: 8, jitter: 0.15 } },
  ghost: { pitch: 1.35, rate: 0.8, gain: 0.7, pause: 0.5, alien: { base: 210, spread: 44, jitter: 0.5 } },
};

export function moodParams(mood) {
  return MOODS[mood] || MOODS.calm;
}

const VOWELS = 'aeiouy';

/**
 * Split text into pronounceable syllables (rough, but good enough to drive a
 * vocoder). Deterministic and allocation-light: lore lines are long.
 */
export function syllabify(text) {
  const out = [];
  const words = String(text).toLowerCase().match(/[a-z']+|\d+/g) || [];
  for (const word of words) {
    if (/^\d+$/.test(word)) {
      out.push(word);
      continue;
    }
    let current = '';
    let seenVowel = false;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const isVowel = VOWELS.includes(ch);
      const next = word[i + 1];
      const nextIsVowel = next ? VOWELS.includes(next) : false;
      // split before a consonant cluster that is followed by another vowel
      if (!isVowel && seenVowel && nextIsVowel && current.length >= 2) {
        out.push(current);
        current = '';
        seenVowel = false;
      }
      current += ch;
      if (isVowel) seenVowel = true;
    }
    if (current) out.push(current);
  }
  return out;
}

/** Estimated spoken duration (seconds) for text at a given mood. */
export function estimateDuration(text, mood = 'calm') {
  const params = moodParams(mood);
  const chars = String(text).length;
  const base = chars / (13.5 * params.rate); // ~13.5 chars/sec at rate 1
  const pauses = (String(text).match(/[.,;:—]/g) || []).length * params.pause;
  return Math.max(1.1, base + pauses);
}

/**
 * Speak text with the platform synthesiser. Returns a promise resolving when
 * the utterance ends (or immediately if synthesis is unavailable).
 */
export class VoiceSynth {
  constructor({ enabled = true, volume = 1, preferVoice = null } = {}) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.synth = enabled ? synth : null;
    this.volume = volume;
    this.preferVoice = preferVoice;
    this.available = !!synth;
    this.voices = [];
    this.current = null;
    this.onStart = null;
    this.onEnd = null;
    this.onBoundary = null;
    if (this.available) this.refreshVoices();
  }

  refreshVoices() {
    if (!this.available) return [];
    try {
      this.voices = this.synth.getVoices() || [];
    } catch {
      this.voices = [];
    }
    return this.voices;
  }

  /** Pick the most "documentary" voice we can find for the Archivist. */
  pickVoice({ character = 'archivist' } = {}) {
    if (!this.voices.length) this.refreshVoices();
    if (!this.voices.length) return null;
    const prefs =
      character === 'god'
        ? ['Google UK English Male', 'Daniel', 'Microsoft David', 'Alex', 'Fred']
        : ['Google UK English Male', 'Daniel', 'Samantha', 'Microsoft Zira', 'Karen', 'Moira'];
    const english = this.voices.filter((v) => /^en/i.test(v.lang || ''));
    for (const name of prefs) {
      const found = english.find((v) => (v.name || '').includes(name));
      if (found) return found;
    }
    return english[0] || this.voices[0];
  }

  speak(text, { mood = 'calm', character = 'archivist', volume = this.volume, onStart, onEnd, onBoundary } = {}) {
    const params = moodParams(mood);
    if (!this.available || !text) {
      onEnd?.();
      return { duration: estimateDuration(text, mood), spoke: false };
    }
    this.cancel();
    const utter = new SpeechSynthesisUtterance(String(text));
    const voice = this.pickVoice({ character });
    if (voice) utter.voice = voice;
    utter.pitch = clamp(params.pitch * (character === 'god' ? 0.85 : 1), 0, 2);
    utter.rate = clamp(params.rate, 0.1, 2);
    utter.volume = clamp(volume * params.gain, 0, 1);
    utter.onstart = () => {
      this.current = utter;
      onStart?.();
      this.onStart?.(text);
    };
    utter.onend = () => {
      this.current = null;
      onEnd?.();
      this.onEnd?.(text);
    };
    utter.onerror = () => {
      this.current = null;
      onEnd?.();
      this.onEnd?.(text);
    };
    if (onBoundary) utter.onboundary = (ev) => onBoundary(ev);
    try {
      this.synth.speak(utter);
    } catch (err) {
      console.warn('[voice] speech synthesis failed', err);
      onEnd?.();
      return { duration: estimateDuration(text, mood), spoke: false };
    }
    return { duration: estimateDuration(text, mood), spoke: true };
  }

  cancel() {
    if (!this.available) return;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    this.current = null;
  }

  get speaking() {
    return !!this.current;
  }
}

/**
 * The alien vocoder. Renders a line as a sequence of syllable bursts on a
 * destination bus — used when speech synthesis is missing and for non-human
 * speakers (Simolysis at low pitch, the ascended at high pitch).
 *
 * Returns the total duration so the caller can keep subtitles in sync.
 */
export function speakAlien(ctx, destination, text, { mood = 'god', gain = 0.5, pan = 0 } = {}) {
  const params = moodParams(mood);
  const syllables = syllabify(text);
  const beat = 0.16 / params.rate;
  let t = ctx.currentTime + 0.05;
  for (let i = 0; i < syllables.length; i++) {
    const syllable = syllables[i];
    const vowels = (syllable.match(/[aeiouy]+/g) || ['a']).join('');
    const vowelIndex = 'aeiouy'.indexOf(vowels[0]);
    const target = params.alien.base * (1 + (vowelIndex >= 0 ? vowelIndex * 0.06 : 0));
    const dur = clamp(syllable.length * 0.055 + 0.07, 0.08, 0.4) / params.rate;
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan + (Math.random() - 0.5) * 0.2, -1, 1);
    // formant-ish: a buzzy source through a resonant bandpass sweeping
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(target * (0.92 + Math.random() * params.alien.jitter), t);
    osc.frequency.linearRampToValueAtTime(
      target * (1.04 + Math.random() * params.alien.jitter),
      t + dur * 0.75
    );
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(target * 3.4, t);
    filter.frequency.linearRampToValueAtTime(target * 2.1, t + dur * 0.8);
    filter.Q.value = 4.5;
    const noise = ctx.createBufferSource();
    if (!speakAlien._buffer || speakAlien._buffer.sampleRate !== ctx.sampleRate) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let s = 0; s < length; s++) data[s] = (Math.random() * 2 - 1) * 0.35;
      speakAlien._buffer = buffer;
    }
    noise.buffer = speakAlien._buffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.25;
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + dur + 0.02);
    noise.stop(t + dur + 0.02);
    t += dur + (syllable.endsWith(' ') ? beat : beat * 0.35);
  }
  return t - ctx.currentTime;
}
