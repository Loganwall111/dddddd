/**
 * THE MULTIVERSE — audio/sfx.js
 * ==================================================================
 * THE SOUND LIBRARY as pure data. Each entry is a list of synthesis layers
 * (oscillator / noise / FM) with envelopes and filter movement, rendered by
 * synth.renderRecipe(). Because it is data, the test suite can verify every
 * recipe has legal parameters before a single sample is produced.
 *
 * Naming convention: <category>.<event>
 */

const R = (layers, meta = {}) => ({ layers, ...meta });

export const SFX = {
  /* --------------------------- player --------------------------- */
  'foot.grass': R([
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 900, freqEnd: 400, q: 0.9 }, attack: 0.002, decay: 0.09, release: 0.05, gain: 0.35, duration: 0.4, pan: 0 },
    { kind: 'osc', waveform: 'sine', freq: 120, freqEnd: 70, attack: 0.001, decay: 0.05, release: 0.03, gain: 0.12 },
  ]),
  'foot.rock': R([
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 1600, q: 0.7 }, attack: 0.001, decay: 0.06, release: 0.04, gain: 0.3, duration: 0.3 },
    { kind: 'osc', waveform: 'triangle', freq: 320, freqEnd: 180, attack: 0.001, decay: 0.04, release: 0.03, gain: 0.1 },
  ]),
  'foot.water': R([
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2200, freqEnd: 700, q: 0.6 }, attack: 0.002, decay: 0.14, release: 0.1, gain: 0.42, duration: 0.6 },
    { kind: 'osc', waveform: 'sine', freq: 480, freqEnd: 220, attack: 0.002, decay: 0.08, release: 0.06, gain: 0.16 },
  ]),
  'foot.sand': R([
    { kind: 'noise', color: 'pink', filter: { type: 'highpass', freq: 2600, q: 0.4 }, attack: 0.004, decay: 0.16, release: 0.12, gain: 0.26, duration: 0.5 },
  ]),
  'foot.metal': R([
    { kind: 'osc', waveform: 'triangle', freq: 780, freqEnd: 520, attack: 0.001, decay: 0.18, release: 0.2, gain: 0.16 },
    { kind: 'osc', waveform: 'sine', freq: 1560, freqEnd: 1300, attack: 0.001, decay: 0.1, release: 0.12, gain: 0.07 },
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 3000 }, attack: 0.001, decay: 0.05, release: 0.04, gain: 0.18, duration: 0.2 },
  ]),
  'player.jump': R([
    { kind: 'osc', waveform: 'triangle', freq: 190, freqEnd: 420, glide: 0.16, attack: 0.004, decay: 0.14, release: 0.1, gain: 0.22 },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 700, freqEnd: 1600, q: 0.8 }, attack: 0.005, decay: 0.16, release: 0.12, gain: 0.16, duration: 0.5 },
  ]),
  'player.land': R([
    { kind: 'osc', waveform: 'sine', freq: 90, freqEnd: 45, attack: 0.002, decay: 0.2, release: 0.16, gain: 0.4, sub: { freq: 42, gain: 0.5 } },
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 800, freqEnd: 300 }, attack: 0.002, decay: 0.14, release: 0.1, gain: 0.2, duration: 0.4 },
  ]),
  'player.hurt': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 320, freqEnd: 90, glide: 0.3, attack: 0.002, decay: 0.3, release: 0.25, gain: 0.24, filter: { type: 'lowpass', freq: 2400, freqEnd: 400, q: 3 } },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 420, freqEnd: 180, q: 1.2 }, attack: 0.002, decay: 0.24, release: 0.2, gain: 0.2, duration: 1 },
  ]),
  'player.heal': R([
    { kind: 'osc', waveform: 'sine', freq: 440, freqEnd: 880, glide: 0.5, attack: 0.05, decay: 0.5, release: 0.5, gain: 0.16, unison: 2, spread: 12 },
    { kind: 'osc', waveform: 'sine', freq: 660, freqEnd: 1320, glide: 0.6, attack: 0.08, decay: 0.5, release: 0.6, gain: 0.1 },
  ]),
  'player.death': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 220, freqEnd: 30, glide: 2.2, attack: 0.01, decay: 1.6, release: 1.4, gain: 0.3, filter: { type: 'lowpass', freq: 1800, freqEnd: 120, q: 4 } },
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 900, freqEnd: 90 }, attack: 0.02, decay: 1.8, release: 1.6, gain: 0.26, duration: 3.5 },
  ]),
  'player.respawn': R([
    { kind: 'osc', waveform: 'sine', freq: 60, freqEnd: 480, glide: 1.1, attack: 0.3, decay: 0.8, release: 1.0, gain: 0.22, unison: 3, spread: 9 },
    { kind: 'osc', waveform: 'triangle', freq: 120, freqEnd: 960, glide: 1.3, attack: 0.4, decay: 0.9, release: 1.2, gain: 0.12 },
  ]),
  'ui.hover': R([{ kind: 'osc', waveform: 'sine', freq: 1180, freqEnd: 1420, attack: 0.001, decay: 0.05, release: 0.05, gain: 0.05 }], { gain: 0.4 }),
  'ui.click': R([
    { kind: 'osc', waveform: 'sine', freq: 880, freqEnd: 1320, attack: 0.001, decay: 0.07, release: 0.08, gain: 0.11 },
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 4000 }, attack: 0.001, decay: 0.03, release: 0.02, gain: 0.06, duration: 0.1 },
  ]),
  'ui.back': R([{ kind: 'osc', waveform: 'sine', freq: 720, freqEnd: 420, attack: 0.001, decay: 0.1, release: 0.12, gain: 0.1 }]),
  'ui.confirm': R([
    { kind: 'osc', waveform: 'triangle', freq: 520, freqEnd: 1040, attack: 0.005, decay: 0.2, release: 0.25, gain: 0.13 },
    { kind: 'osc', waveform: 'sine', freq: 780, freqEnd: 1560, attack: 0.01, decay: 0.25, release: 0.3, gain: 0.08 },
  ], { music: 'sting' }),
  'ui.error': R([
    { kind: 'osc', waveform: 'square', freq: 220, freqEnd: 160, attack: 0.002, decay: 0.14, release: 0.12, gain: 0.1, filter: { type: 'lowpass', freq: 1400, q: 1 } },
    { kind: 'osc', waveform: 'square', freq: 233, freqEnd: 150, attack: 0.002, decay: 0.15, release: 0.12, gain: 0.08 },
  ]),
  'menu.whoosh': R([
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 300, freqEnd: 4200, q: 0.7 }, attack: 0.02, decay: 0.5, release: 0.4, gain: 0.24, duration: 1.2 },
    { kind: 'osc', waveform: 'sine', freq: 90, freqEnd: 260, attack: 0.03, decay: 0.5, release: 0.4, gain: 0.14 },
  ]),

  /* --------------------------- world --------------------------- */
  'water.splash': R([
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 900, freqEnd: 2600, q: 0.5 }, attack: 0.002, decay: 0.3, release: 0.35, gain: 0.5, duration: 1.2 },
    { kind: 'osc', waveform: 'sine', freq: 160, freqEnd: 60, attack: 0.002, decay: 0.22, release: 0.3, gain: 0.3 },
  ]),
  'water.enter': R([
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 1200, freqEnd: 220 }, attack: 0.004, decay: 0.7, release: 0.6, gain: 0.5, duration: 1.6 },
    { kind: 'osc', waveform: 'sine', freq: 120, freqEnd: 40, glide: 0.6, attack: 0.004, decay: 0.6, release: 0.5, gain: 0.3, sub: { freq: 36, gain: 0.3 } },
  ]),
  'water.wade': R([
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 1400, freqEnd: 600, q: 0.6 }, attack: 0.01, decay: 0.3, release: 0.3, gain: 0.2, duration: 1.0 },
  ]),
  'waterfall.near': R([
    { kind: 'noise', color: 'white', filter: { type: 'lowpass', freq: 5200, freqEnd: 3600, q: 0.3 }, attack: 1.2, decay: 2.0, release: 2.4, gain: 0.22, duration: 3 },
    { kind: 'noise', color: 'pink', filter: { type: 'highpass', freq: 240, q: 0.2 }, attack: 1.4, decay: 2.0, release: 2.4, gain: 0.16, duration: 3 },
  ]),
  'world.thunder': R([
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 260, freqEnd: 90, q: 0.6 }, attack: 0.02, decay: 2.6, release: 2.2, gain: 0.6, duration: 5 },
    { kind: 'osc', waveform: 'sine', freq: 46, freqEnd: 27, glide: 2.2, attack: 0.05, decay: 2.4, release: 2.0, gain: 0.45, sub: { freq: 30, gain: 0.4 } },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 1800, freqEnd: 200, q: 0.4 }, attack: 0.001, decay: 0.9, release: 1.4, gain: 0.28, duration: 3 },
  ]),
  'wind.gust': R([
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 400, freqEnd: 1600, q: 0.5 }, attack: 1.4, decay: 2.2, release: 2.6, gain: 0.26, duration: 6 },
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 1800 }, attack: 2.0, decay: 2.2, release: 2.4, gain: 0.08, duration: 6 },
  ]),
  'portal.open': R([
    { kind: 'osc', waveform: 'sine', freq: 80, freqEnd: 1400, glide: 1.4, attack: 0.4, decay: 1.0, release: 1.4, gain: 0.22, unison: 4, spread: 14 },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 300, freqEnd: 5200, q: 1.4 }, attack: 0.5, decay: 1.2, release: 1.6, gain: 0.2, duration: 3 },
    { kind: 'osc', waveform: 'triangle', freq: 1600, freqEnd: 220, glide: 1.6, attack: 0.7, decay: 1.2, release: 1.6, gain: 0.08 },
  ]),
  'portal.enter': R([
    { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 6000, freqEnd: 200 }, attack: 0.05, decay: 1.1, release: 1.2, gain: 0.46, duration: 1.2 },
    { kind: 'osc', waveform: 'sawtooth', freq: 700, freqEnd: 60, glide: 1.0, attack: 0.02, decay: 1.0, release: 1.1, gain: 0.2, filter: { type: 'lowpass', freq: 3000, freqEnd: 240, q: 2 } },
  ]),
  'realm.arrive': R([
    { kind: 'osc', waveform: 'sine', freq: 1200, freqEnd: 300, glide: 0.9, attack: 0.004, decay: 0.9, release: 1.0, gain: 0.18 },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 4200, freqEnd: 400, q: 0.8 }, attack: 0.004, decay: 0.9, release: 1.0, gain: 0.24, duration: 2 },
  ]),
  'essence.pickup': R([
    { kind: 'osc', waveform: 'sine', freq: 880, freqEnd: 1760, glide: 0.18, attack: 0.004, decay: 0.3, release: 0.4, gain: 0.15, unison: 2, spread: 8 },
    { kind: 'osc', waveform: 'triangle', freq: 1320, freqEnd: 2640, glide: 0.22, attack: 0.006, decay: 0.3, release: 0.4, gain: 0.07 },
  ]),
  'discover.new': R([
    { kind: 'osc', waveform: 'sine', freq: 523, attack: 0.01, decay: 0.6, release: 0.8, gain: 0.13, hold: 0.04 },
    { kind: 'osc', waveform: 'sine', freq: 784, attack: 0.02, decay: 0.6, release: 0.8, gain: 0.1, offset: 0.09, hold: 0.04 },
    { kind: 'osc', waveform: 'sine', freq: 1046, attack: 0.02, decay: 0.7, release: 0.9, gain: 0.08, offset: 0.18, hold: 0.04 },
  ]),
  'level.up': R([
    { kind: 'osc', waveform: 'triangle', freq: 261, freqEnd: 261, attack: 0.02, decay: 1.4, release: 1.2, gain: 0.14, hold: 0.2, unison: 3, spread: 7 },
    { kind: 'osc', waveform: 'sine', freq: 392, attack: 0.05, decay: 1.2, release: 1.2, gain: 0.1, offset: 0.12, hold: 0.2 },
    { kind: 'osc', waveform: 'sine', freq: 523, attack: 0.06, decay: 1.2, release: 1.4, gain: 0.08, offset: 0.24, hold: 0.2 },
  ]),
  'upgrade.apply': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 180, freqEnd: 720, glide: 0.7, attack: 0.02, decay: 0.8, release: 0.9, gain: 0.16, filter: { type: 'lowpass', freq: 900, freqEnd: 4200, q: 2 } },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 900, freqEnd: 3600, q: 1 }, attack: 0.05, decay: 0.8, release: 0.9, gain: 0.14, duration: 2 },
  ]),
  'scan.pulse': R([
    { kind: 'osc', waveform: 'sine', freq: 1560, freqEnd: 1560, attack: 0.002, decay: 0.34, release: 0.4, gain: 0.1 },
    { kind: 'osc', waveform: 'sine', freq: 2340, freqEnd: 2340, attack: 0.002, decay: 0.26, release: 0.3, gain: 0.05 },
  ]),

  /* ------------------------- creatures ------------------------- */
  'creature.grazer': R([
    { kind: 'osc', waveform: 'sine', freq: 150, freqEnd: 96, glide: 1.2, attack: 0.18, decay: 1.0, release: 1.2, gain: 0.26, unison: 2, spread: 5 },
    { kind: 'osc', waveform: 'triangle', freq: 300, freqEnd: 190, glide: 1.2, attack: 0.22, decay: 1.0, release: 1.1, gain: 0.08 },
  ], { reverb: 0.5 }),
  'creature.strider': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 420, freqEnd: 210, glide: 0.8, attack: 0.06, decay: 0.9, release: 1.2, gain: 0.2, filter: { type: 'lowpass', freq: 3200, freqEnd: 700, q: 5 } },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2200, freqEnd: 500, q: 2 }, attack: 0.1, decay: 0.9, release: 1.0, gain: 0.12, duration: 2 },
  ], { reverb: 0.8 }),
  'creature.skitterjaw': R([
    { kind: 'fm', waveform: 'sawtooth', freq: 260, freqEnd: 120, glide: 0.5, modFreq: 87, modDepth: 620, attack: 0.01, decay: 0.5, release: 0.5, gain: 0.24, filter: { type: 'bandpass', freq: 1600, freqEnd: 600, q: 3 } },
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 2600 }, attack: 0.01, decay: 0.4, release: 0.4, gain: 0.16, duration: 1 },
  ], { reverb: 0.3 }),
  'creature.whale': R([
    { kind: 'osc', waveform: 'sine', freq: 64, freqEnd: 132, glide: 3.2, attack: 1.0, decay: 3.0, release: 3.6, gain: 0.3, unison: 3, spread: 6 },
    { kind: 'osc', waveform: 'sine', freq: 128, freqEnd: 264, glide: 3.4, attack: 1.2, decay: 3.0, release: 3.6, gain: 0.14 },
    { kind: 'osc', waveform: 'triangle', freq: 256, freqEnd: 528, glide: 3.6, attack: 1.4, decay: 3.0, release: 3.6, gain: 0.06 },
  ], { reverb: 1.4, duration: 8 }),
  'creature.eye': R([
    { kind: 'osc', waveform: 'sine', freq: 2200, freqEnd: 1800, attack: 0.2, decay: 0.8, release: 1.2, gain: 0.06, unison: 3, spread: 20 },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 5200, q: 6 }, attack: 0.3, decay: 0.8, release: 1.0, gain: 0.05, duration: 2 },
  ], { reverb: 0.9 }),
  'creature.moth': R([
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 3200, freqEnd: 2400, q: 2.4 }, attack: 0.02, decay: 0.4, release: 0.5, gain: 0.14, duration: 1 },
    { kind: 'osc', waveform: 'sine', freq: 3140, freqEnd: 2800, attack: 0.05, decay: 0.4, release: 0.5, gain: 0.04 },
  ], { reverb: 0.6 }),
  'creature.colossus': R([
    { kind: 'osc', waveform: 'sine', freq: 22, freqEnd: 16, glide: 6, attack: 2.0, decay: 6.0, release: 8.0, gain: 0.5, sub: { freq: 18, gain: 0.6 } },
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 120, freqEnd: 60 }, attack: 3.0, decay: 6.0, release: 8.0, gain: 0.3, duration: 12 },
  ], { reverb: 2.0, duration: 16 }),
  'creature.ant': R([
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 4200, freqEnd: 3200, q: 8 }, attack: 0.001, decay: 0.05, release: 0.05, gain: 0.14, duration: 0.2 },
    { kind: 'osc', waveform: 'square', freq: 1800, freqEnd: 1400, attack: 0.001, decay: 0.04, release: 0.04, gain: 0.05 },
  ]),

  /* ------------------------ sci-fi / machine ------------------------ */
  'lodemus.hum': R([
    { kind: 'osc', waveform: 'sine', freq: 55, attack: 2.0, decay: 2.0, release: 3.0, gain: 0.28, hold: 6, unison: 2, spread: 3 },
    { kind: 'osc', waveform: 'triangle', freq: 110.5, attack: 2.4, decay: 2.0, release: 3.0, gain: 0.1, hold: 6 },
    { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 420 }, attack: 2.6, decay: 2.0, release: 3.0, gain: 0.08, duration: 14 },
  ], { reverb: 1.6, duration: 16 }),
  'machine.start': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 30, freqEnd: 220, glide: 3.4, attack: 0.6, decay: 2.0, release: 2.4, gain: 0.3, filter: { type: 'lowpass', freq: 200, freqEnd: 3400, q: 3 } },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 200, freqEnd: 3000, q: 1.2 }, attack: 1.0, decay: 2.4, release: 2.4, gain: 0.2, duration: 6 },
  ], { reverb: 1.2, duration: 8 }),
  'energy.burst': R([
    { kind: 'noise', color: 'white', filter: { type: 'lowpass', freq: 9000, freqEnd: 200, q: 0.4 }, attack: 0.001, decay: 1.6, release: 2.4, gain: 0.6, duration: 3 },
    { kind: 'osc', waveform: 'sawtooth', freq: 60, freqEnd: 30, glide: 2.4, attack: 0.004, decay: 2.0, release: 2.6, gain: 0.42, filter: { type: 'lowpass', freq: 2400, freqEnd: 90, q: 2 } },
    { kind: 'osc', waveform: 'sine', freq: 1800, freqEnd: 90, glide: 1.4, attack: 0.002, decay: 1.2, release: 2.0, gain: 0.16 },
  ], { reverb: 2.4, duration: 5 }),
  'dust.ignite': R([
    { kind: 'osc', waveform: 'sine', freq: 30, freqEnd: 880, glide: 4.2, attack: 0.8, decay: 3.0, release: 3.0, gain: 0.2, unison: 4, spread: 10 },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 120, freqEnd: 6200, q: 0.9 }, attack: 1.2, decay: 3.0, release: 3.0, gain: 0.24, duration: 8 },
  ], { reverb: 2.6, duration: 10 }),
  'glitch.burst': R([
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2400, freqEnd: 800, q: 4 }, attack: 0.001, decay: 0.09, release: 0.06, gain: 0.34, duration: 0.3 },
    { kind: 'osc', waveform: 'square', freq: 1400, freqEnd: 320, attack: 0.001, decay: 0.08, release: 0.06, gain: 0.16 },
  ]),
  'tv.static': R([
    { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 900 }, attack: 0.05, decay: 2.2, release: 1.6, gain: 0.2, duration: 4 },
    { kind: 'osc', waveform: 'sawtooth', freq: 8000, freqEnd: 6000, attack: 0.1, decay: 2.0, release: 1.6, gain: 0.03 },
  ], { reverb: 0.5 }),
  'ghost.phase': R([
    { kind: 'osc', waveform: 'sine', freq: 320, freqEnd: 90, glide: 1.6, attack: 0.3, decay: 1.2, release: 1.6, gain: 0.16, unison: 3, spread: 22 },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 600, freqEnd: 240, q: 2 }, attack: 0.4, decay: 1.2, release: 1.8, gain: 0.12, duration: 3 },
  ], { reverb: 1.8 }),
  'ascend.flare': R([
    { kind: 'osc', waveform: 'sine', freq: 220, freqEnd: 3520, glide: 3.4, attack: 0.6, decay: 2.2, release: 2.6, gain: 0.2, unison: 5, spread: 16 },
    { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 800, freqEnd: 9000, q: 0.8 }, attack: 1.0, decay: 2.4, release: 2.6, gain: 0.16, duration: 6 },
  ], { reverb: 2.0, duration: 8 }),
  'blackhole.pull': R([
    { kind: 'osc', waveform: 'sine', freq: 40, freqEnd: 12, glide: 4.0, attack: 1.0, decay: 4.0, release: 5.0, gain: 0.5, sub: { freq: 24, gain: 0.6 } },
    { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 400, freqEnd: 60 }, attack: 1.4, decay: 4.0, release: 5.0, gain: 0.3, duration: 10 },
  ], { reverb: 3.0, duration: 12 }),
  'wormhole.suck': R([
    { kind: 'osc', waveform: 'sawtooth', freq: 900, freqEnd: 40, glide: 2.2, attack: 0.1, decay: 2.0, release: 2.0, gain: 0.3, filter: { type: 'lowpass', freq: 4000, freqEnd: 120, q: 6 } },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, freqEnd: 160, q: 1.6 }, attack: 0.3, decay: 2.2, release: 2.2, gain: 0.26, duration: 5 },
  ], { reverb: 1.2, duration: 6 }),
  'fractal.tone': R([
    { kind: 'osc', waveform: 'sine', freq: 220, attack: 0.02, decay: 1.4, release: 1.6, gain: 0.1, hold: 0.1, unison: 3, spread: 14 },
    { kind: 'osc', waveform: 'sine', freq: 330, attack: 0.03, decay: 1.4, release: 1.6, gain: 0.07, offset: 0.08, hold: 0.1 },
    { kind: 'osc', waveform: 'sine', freq: 495, attack: 0.04, decay: 1.4, release: 1.6, gain: 0.05, offset: 0.16, hold: 0.1 },
  ], { reverb: 2.2 }),
  'backrooms.hum': R([
    { kind: 'osc', waveform: 'square', freq: 120, attack: 0.5, decay: 1.0, release: 1.6, gain: 0.06, hold: 2, unison: 2, spread: 1.5 },
    { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2400, q: 4 }, attack: 0.6, decay: 1.0, release: 1.6, gain: 0.05, duration: 4 },
  ], { reverb: 0.4 }),
  'nexus.pulse': R([
    { kind: 'osc', waveform: 'sine', freq: 66, freqEnd: 66, attack: 0.9, decay: 1.6, release: 2.0, gain: 0.3, hold: 0.2, sub: { freq: 40, gain: 0.4 } },
  ], { reverb: 1.0 }),
};

export const SFX_IDS = Object.keys(SFX);

/** Validate a single layer's parameters (used by tests and by dev tooling). */
export function validateLayer(layer, id = '') {
  const problems = [];
  if (!layer || typeof layer !== 'object') return [`${id}: layer is not an object`];
  if (!['osc', 'noise', 'fm'].includes(layer.kind)) problems.push(`${id}: unknown kind "${layer.kind}"`);
  for (const key of ['gain', 'attack', 'decay', 'release', 'hold', 'offset', 'pan', 'duration', 'rate']) {
    if (layer[key] != null && !Number.isFinite(layer[key])) problems.push(`${id}: ${key} is not finite`);
  }
  if (layer.gain != null && (layer.gain < 0 || layer.gain > 4)) problems.push(`${id}: gain ${layer.gain} out of range`);
  if (layer.attack != null && layer.attack < 0) problems.push(`${id}: negative attack`);
  if (layer.kind !== 'noise' && layer.freq != null && (layer.freq <= 0 || layer.freq > 20000)) {
    problems.push(`${id}: frequency ${layer.freq} out of range`);
  }
  if (layer.freqEnd != null && (layer.freqEnd <= 0 || layer.freqEnd > 20000)) {
    problems.push(`${id}: freqEnd ${layer.freqEnd} out of range`);
  }
  if (layer.filter) {
    const f = layer.filter;
    if (f.type && !['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf'].includes(f.type)) {
      problems.push(`${id}: filter type "${f.type}"`);
    }
    if (f.freq != null && (f.freq < 20 || f.freq > 20000)) problems.push(`${id}: filter freq ${f.freq}`);
    if (f.q != null && (f.q <= 0 || f.q > 40)) problems.push(`${id}: filter Q ${f.q}`);
  }
  return problems;
}

/** Validate the whole library; returns an array of problems ([] = healthy). */
export function validateLibrary(library = SFX) {
  const problems = [];
  for (const [id, recipe] of Object.entries(library)) {
    if (!recipe || !Array.isArray(recipe.layers) || recipe.layers.length === 0) {
      problems.push(`${id}: recipe has no layers`);
      continue;
    }
    if (recipe.layers.length > 8) problems.push(`${id}: ${recipe.layers.length} layers is wasteful`);
    for (const layer of recipe.layers) problems.push(...validateLayer(layer, id));
  }
  return problems;
}
