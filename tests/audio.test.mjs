import { test } from '../tools/runner.mjs';
import { buildMixGraph, degreeToFreq, degreeToSemitone, envelopeDuration, midiToFreq, noiseBuffer, SCALES, triad } from '../src/audio/synth.js';
import { SFX, SFX_IDS, validateLayer, validateLibrary } from '../src/audio/sfx.js';
import { MusicDirector, THEMES, themeWithModifier } from '../src/audio/music.js';
import { MOODS, estimateDuration, moodParams, syllabify } from '../src/audio/voice.js';
import { ARCHIVIST, ARCHETYPES, ARCHIVES, BROADCASTS, CONTROLS_HELP, PROLOGUE, REALMS, SIMOLYSIS, SPECIES, TRUTHS, UPGRADES, WHISPERS, INTRO_TOTAL, landmarkName, minorName } from '../src/lore.js';

/* --------------------------- mock audio context --------------------------- */

function mockParam(value = 0) {
  const calls = [];
  return {
    value,
    calls,
    setValueAtTime: (v, t) => calls.push(['set', v, t]),
    linearRampToValueAtTime: (v, t) => calls.push(['linear', v, t]),
    exponentialRampToValueAtTime: (v, t) => calls.push(['exp', v, t]),
    setTargetAtTime: (v, t, c) => calls.push(['target', v, t, c]),
    cancelScheduledValues: (t) => calls.push(['cancel', t]),
  };
}

function mockNode(kind) {
  const node = { kind, connections: [], disconnect: () => {}, connect: (n) => node.connections.push(n) };
  return node;
}

export function createMockContext(sampleRate = 48000) {
  const created = [];
  const track = (kind, extra = {}) => {
    const node = Object.assign(mockNode(kind), extra);
    created.push(node);
    return node;
  };
  const ctx = {
    sampleRate,
    currentTime: 0,
    state: 'running',
    created,
    destination: track('destination'),
    createGain: () => track('gain', { gain: mockParam(1) }),
    createDynamicsCompressor: () => track('compressor', { threshold: mockParam(), knee: mockParam(), ratio: mockParam(), attack: mockParam(), release: mockParam() }),
    createConvolver: () => track('convolver', { buffer: null }),
    createBiquadFilter: () => track('filter', { frequency: mockParam(1000), Q: mockParam(1), detune: mockParam(0), type: 'lowpass' }),
    createStereoPanner: () => track('panner', { pan: mockParam(0) }),
    createDelay: () => track('delay', { delayTime: mockParam(0) }),
    createOscillator: () => track('oscillator', { frequency: mockParam(440), detune: mockParam(0), type: 'sine', start: () => {}, stop: () => {} }),
    createBufferSource: () => track('bufferSource', { playbackRate: mockParam(1), loop: false, buffer: null, start: () => {}, stop: () => {} }),
    createBuffer: (channels, length) => ({
      numberOfChannels: channels,
      length,
      sampleRate: ctx.sampleRate,
      duration: length / ctx.sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(),
    close: () => {},
    listener: {
      positionX: mockParam(), positionY: mockParam(), positionZ: mockParam(),
      forwardX: mockParam(), forwardZ: mockParam(),
    },
  };
  return ctx;
}

/* --------------------------------- mixing --------------------------------- */

test('mix graph routes every bus through the compressor and master', (h) => {
  const ctx = createMockContext();
  const graph = buildMixGraph(ctx, ctx.destination, { volumes: { master: 0.7, music: 0.5, sfx: 0.9, voice: 1, ambience: 0.4 } });
  h.close(graph.master.gain.value, 0.7);
  h.close(graph.buses.music.gain.value, 0.5);
  h.close(graph.buses.sfx.gain.value, 0.9);
  h.close(graph.buses.voice.gain.value, 1);
  h.close(graph.buses.ambience.gain.value, 0.4);
  for (const name of ['music', 'ambience', 'sfx', 'voice', 'ui']) {
    h.ok(graph.buses[name].connections.includes(graph.comp), `${name} bus should feed the compressor`);
  }
  h.ok(graph.limiter.connections.includes(ctx.destination), 'a limiter must guard the output');
  h.ok(graph.comp.connections.includes(graph.duck), 'ducking stage sits before master');
});

test('mix graph clamps hostile volume values', (h) => {
  const ctx = createMockContext();
  const graph = buildMixGraph(ctx, ctx.destination, { volumes: { master: 55, music: -3, sfx: NaN } });
  h.inRange(graph.master.gain.value, 0, 1);
  h.inRange(graph.buses.music.gain.value, 0, 1);
  h.inRange(graph.buses.sfx.gain.value, 0, 1);
});

test('noise buffers are generated at the requested length and colour', (h) => {
  const ctx = createMockContext();
  const white = noiseBuffer(ctx, 0.5, { color: 'white' });
  h.close(white.length, ctx.sampleRate * 0.5, 2);
  h.eq(white.numberOfChannels, 2);
  const pink = noiseBuffer(ctx, 0.25, { color: 'pink' });
  h.close(pink.length, ctx.sampleRate * 0.25, 2);
  const brown = noiseBuffer(ctx, 0.25, { color: 'brown' });
  h.close(brown.length, ctx.sampleRate * 0.25, 2);
});

test('envelope duration matches the scheduled timeline', (h) => {
  h.close(envelopeDuration({ attack: 0.1, decay: 0.2, release: 0.3, hold: 0.4 }), 1.0, 1e-9);
  h.gt(envelopeDuration({ attack: 0.001, decay: 0.001, release: 0 }), 0);
});

/* ------------------------------ music theory ------------------------------ */

test('scale degrees map to the right semitones and octaves', (h) => {
  h.eq(degreeToSemitone('ionian', 0, 60), 60);
  h.eq(degreeToSemitone('ionian', 7, 60), 72, 'one octave up');
  h.eq(degreeToSemitone('ionian', -1, 60), 59, 'one step down');
  h.eq(degreeToSemitone('simolysis', 3, 0), 6);
  h.eq(degreeToSemitone('simolysis', 7, 0), 12);
  for (const name of Object.keys(SCALES)) {
    for (let d = -6; d <= 12; d++) {
      const s = degreeToSemitone(name, d, 60);
      h.inRange(s, 12, 108, `${name} degree ${d}`);
    }
  }
  h.close(midiToFreq(69), 440, 1e-9);
  h.close(midiToFreq(57), 220, 1e-9);
  const chord = triad('ionian', 0, 60);
  h.eq(chord.length, 3);
  h.close(chord[0], 261.6255653, 1e-3);
});

test('every sfx recipe in the library is legal', (h) => {
  const problems = validateLibrary(SFX);
  h.deepEq(problems, [], problems.join('\n'));
  h.gt(SFX_IDS.length, 40, 'a rich library');
  for (const id of SFX_IDS) {
    h.ok(/^[a-z]+(\.[a-z]+)+$/.test(id), `id "${id}" should be namespaced like category.event`);
  }
});

test('the validator actually rejects broken layers', (h) => {
  h.gt(validateLayer({ kind: 'osc', freq: -5 }, 'bad').length, 0);
  h.gt(validateLayer({ kind: 'nonsense' }, 'bad').length, 0);
  h.gt(validateLayer({ kind: 'osc', freq: 440, filter: { type: 'wobble' } }, 'bad').length, 0);
  h.gt(validateLayer({ kind: 'noise', gain: 99 }, 'bad').length, 0);
  h.deepEq(validateLayer({ kind: 'osc', freq: 440, gain: 0.5, attack: 0.01 }, 'ok'), []);
});

test('every realm has a theme with sane parameters', (h) => {
  for (const realm of REALMS) {
    const theme = THEMES[realm.music];
    h.ok(theme, `realm ${realm.id} references theme "${realm.music}"`);
    h.ok(SCALES[theme.scale], `theme scale ${theme.scale} exists`);
    h.inRange(theme.tempo, 30, 160);
    h.inRange(theme.rootMidi, 24, 84);
    h.ok(theme.chords.length > 0 && theme.chords.every((c) => Number.isInteger(c)));
    h.ok(theme.pads.length > 0, `${realm.music} needs a harmonic bed`);
  }
});

test('theme modifiers change tempo and tension, not identity', (h) => {
  const calm = themeWithModifier('pastoral');
  const danger = themeWithModifier('pastoral', ['danger']);
  h.gt(danger.tempo, calm.tempo);
  h.gt(danger.tension, calm.tension);
  h.eq(danger.scale, calm.scale);
  h.eq(themeWithModifier('nonexistent').scale, THEMES.pastoral.scale, 'unknown themes fall back');
});

test('music director is deterministic and schedules within the lookahead', (h) => {
  const collect = () => {
    const notes = [];
    const d = new MusicDirector({ theme: 'pastoral', seed: 4242, render: (n) => notes.push(n) });
    d.start(0);
    for (let t = 0; t < 40; t += 1 / 60) d.update(t);
    return { notes, d };
  };
  const a = collect();
  const b = collect();
  h.gt(a.notes.length, 30, 'the director should compose steadily');
  h.deepEq(
    a.notes.map((n) => [n.instrument, Math.round(n.freq * 1000), Math.round(n.time * 1000)]),
    b.notes.map((n) => [n.instrument, Math.round(n.freq * 1000), Math.round(n.time * 1000)]),
    'same seed, same score'
  );
  for (const note of a.notes) {
    h.inRange(note.freq, 20, 8000);
    h.inRange(note.velocity, 0, 1);
    h.ok(note.instrument, 'every note names an instrument');
  }
  const times = a.notes.map((n) => n.time);
  for (let i = 1; i < times.length; i++) h.gte(times[i], times[i - 1], 'notes are scheduled in order');
});

test('music director responds to intensity and theme changes', (h) => {
  const mk = (theme, intensity) => {
    const notes = [];
    const d = new MusicDirector({ theme, seed: 7, render: (n) => notes.push(n) });
    d.setIntensity(intensity);
    d.start(0);
    for (let t = 0; t < 30; t += 1 / 60) d.update(t);
    return notes;
  };
  const calm = mk('pastoral', 0.05);
  const tense = mk('pastoral', 0.95);
  h.gt(tense.length, calm.length, 'more tension, more notes');
  const abyss = mk('abyss', 0.3);
  h.notEq(abyss[0].freq, calm[0].freq, 'different realities sound different');
  const d = new MusicDirector({ theme: 'pastoral', seed: 1, render: () => {} });
  d.setTheme('midnight');
  h.eq(d.themeId, 'midnight');
  h.eq(d.theme.scale, THEMES.midnight.scale);
});

/* ---------------------------------- voice --------------------------------- */

test('syllabifier produces pronounceable pieces for every lore line', (h) => {
  const lines = [
    ...PROLOGUE.map((p) => p.text),
    ...ARCHIVIST.lines.boot,
    ...ARCHIVES.map((a) => a.text),
    ...WHISPERS,
    ...SIMOLYSIS.lines.first,
  ];
  for (const line of lines) {
    const syllables = syllabify(line);
    h.gt(syllables.length, 0, `"${line.slice(0, 30)}…" must be speakable`);
    for (const s of syllables) {
      h.ok(/^[a-z'0-9]+$/.test(s), `syllable "${s}" should be lowercase letters or digits`);
      h.lt(s.length, 12, `syllable "${s}" is too long to pronounce`);
    }
    h.lt(syllables.length, line.length, 'syllables should be coarser than characters');
  }
});

test('spoken duration grows with text length and shrinks with rate', (h) => {
  const short = estimateDuration('Dust.', 'calm');
  const long = estimateDuration('Dust, and then the vast unfurling of everything that had been waiting.', 'calm');
  h.gt(long, short);
  h.gt(estimateDuration('A measured sentence about the valley.', 'dread'), estimateDuration('A measured sentence about the valley.', 'urgent'));
  for (const m of Object.keys(MOODS)) {
    h.gt(estimateDuration('Something is said here.', m), 0.5);
  }
  h.deepEq(moodParams('not-a-mood'), MOODS.calm, 'unknown moods fall back to calm');
  for (const m of Object.keys(MOODS)) {
    h.inRange(moodParams(m).pitch, 0, 2);
    h.inRange(moodParams(m).rate, 0.1, 2);
  }
});

/* ---------------------------------- lore ---------------------------------- */

test('lore ids are unique and reference-valid', (h) => {
  const realmIds = new Set(REALMS.map((r) => r.id));
  h.eq(realmIds.size, REALMS.length, 'realm ids unique');
  for (const realm of REALMS) {
    for (const required of Object.keys(realm.requirements || {})) {
      h.ok(['chapter', 'upgrade', 'truth'].includes(required), `unknown requirement "${required}"`);
    }
    if (realm.requirements?.upgrade) h.ok(UPGRADES[realm.requirements.upgrade], `realm ${realm.id} requires a real upgrade`);
  }
  const truthIds = new Set(TRUTHS.map((t) => t.id));
  h.eq(truthIds.size, TRUTHS.length);
  for (const truth of TRUTHS) {
    if (truth.reward?.upgrade) h.ok(UPGRADES[truth.reward.upgrade], `truth ${truth.id} rewards a real upgrade`);
  }
  const speciesIds = new Set(SPECIES.map((s) => s.id));
  h.eq(speciesIds.size, SPECIES.length);
  const archiveIds = new Set(ARCHIVES.map((a) => a.id));
  h.eq(archiveIds.size, ARCHIVES.length);
  for (const a of ARCHIVES) h.ok(realmIds.has(a.realm), `archive ${a.id} tags a real realm`);
  const broadcastIds = new Set(BROADCASTS.map((b) => b.id));
  h.eq(broadcastIds.size, BROADCASTS.length);
  for (const a of ARCHETYPES) {
    h.ok(a.voice && Number.isFinite(a.voice.pitch) && Number.isFinite(a.voice.rate), `${a.id} has voice params`);
    for (const key of ['greet', 'idle', 'warning', 'farewell']) {
      h.ok(Array.isArray(a.lines[key]) && a.lines[key].length, `${a.id} needs "${key}" lines`);
    }
  }
  h.eq(SIMOLYSIS.lines.final.length, 2);
});

test('prologue beats are continuous, ordered and complete', (h) => {
  let expected = 0;
  for (const beat of PROLOGUE) {
    h.eq(beat.at, expected, `beat ${beat.id} should start where the previous ended`);
    h.gt(beat.duration, 4);
    expected += beat.duration;
    h.ok(['dust', 'ignition', 'expansion', 'death', 'lodemus', 'gift'].includes(beat.phase), `phase ${beat.phase}`);
    h.gt(beat.text.length, 30, 'narration should be a real sentence');
  }
  h.eq(INTRO_TOTAL, expected);
  h.gt(INTRO_TOTAL, 150, 'the opening cinematic should earn its name');
});

test('all spoken text is clean: no placeholders, balanced quotes', (h) => {
  const spoken = [];
  const add = (path, value) => {
    for (const text of [].concat(value)) if (typeof text === 'string') spoken.push([path, text]);
  };
  for (const beat of PROLOGUE) add(`PROLOGUE.${beat.id}`, beat.text);
  for (const [key, lines] of Object.entries(ARCHIVIST.lines)) add(`ARCHIVIST.${key}`, lines);
  for (const truth of TRUTHS) {
    add(`TRUTH.${truth.id}.title`, truth.title);
    add(`TRUTH.${truth.id}.body`, truth.body);
    add(`TRUTH.${truth.id}.hint`, truth.hint);
    add(`TRUTH.${truth.id}.completion`, truth.completion);
  }
  for (const [key, lines] of Object.entries(SIMOLYSIS.lines)) add(`SIMOLYSIS.${key}`, lines);
  for (const archive of ARCHIVES) {
    add(`ARCHIVE.${archive.id}.title`, archive.title);
    add(`ARCHIVE.${archive.id}.text`, archive.text);
  }
  for (const broadcast of BROADCASTS) add(`BROADCAST.${broadcast.id}`, broadcast.text);
  for (const archetype of ARCHETYPES) {
    for (const [key, lines] of Object.entries(archetype.lines)) add(`ARCHETYPE.${archetype.id}.${key}`, lines);
    add(`ARCHETYPE.${archetype.id}.role`, archetype.role);
  }
  add('WHISPERS', WHISPERS);
  for (const species of SPECIES) add(`SPECIES.${species.id}.note`, species.note);
  for (const [key, upgrade] of Object.entries(UPGRADES)) add(`UPGRADE.${key}`, upgrade.blurb);
  for (const realm of REALMS) {
    add(`REALM.${realm.id}.entry`, realm.entry);
    add(`REALM.${realm.id}.tagline`, realm.tagline);
  }

  const banned = [/lorem ipsum/i, /TODO/, /FIXME/, /\bXXX\b/, /\bplaceholder\b/i, /\{\{/];
  for (const [path, text] of spoken) {
    for (const pattern of banned) h.ok(!pattern.test(text), `${path} contains placeholder text: ${text}`);
    h.eq((text.match(/"/g) || []).length % 2, 0, `${path} has unbalanced double quotes: ${text}`);
    const smart = (text.match(/[“”]/g) || []).length;
    if (smart) h.eq(smart % 2, 0, `${path} has unbalanced smart quotes: ${text}`);
    h.ok(!/\s{2,}/.test(text), `${path} has a double space: ${text}`);
    h.ok(!text.trim().endsWith(' '), `${path} ends with a space`);
    const words = text.replace(/[^A-Za-z]/g, '').length;
    h.gt(words, path.includes('.title') ? 3 : 8, `${path} is too short to say: ${text}`);
  }
  h.gt(spoken.length, 150, 'the bible should be substantial');
});

test('controls help covers every core verb', (h) => {
  const keys = CONTROLS_HELP.map((c) => c.keys.toUpperCase());
  for (const verb of ['W A S D', 'SPACE', 'ESC', 'J', 'E', 'T']) {
    h.ok(keys.some((k) => k.includes(verb)), `missing control for ${verb}`);
  }
  for (const entry of CONTROLS_HELP) {
    h.gt(entry.action.length, 5);
    h.ok(!entry.action.endsWith('.'), 'help text should not end in a period');
  }
});

test('landmark names are deterministic, varied and readable', (h) => {
  h.eq(landmarkName(8412), landmarkName(8412));
  const names = new Set();
  for (let i = 0; i < 400; i++) names.add(landmarkName(i * 97));
  h.gt(names.size, 250, 'names should not repeat often');
  for (const name of names) {
    h.ok(/^The [A-Z][a-z]+ [A-Z][a-z]+$/.test(name), `"${name}" should look like a landmark name`);
  }
  h.eq(landmarkName(1, { article: false, kind: false }), landmarkName(1, { article: false, kind: false }));
  h.ok(/^[A-Z][a-z]+$/.test(minorName(5)));
});
