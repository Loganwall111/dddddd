/**
 * Cross-module contract tests.
 * ==================================================================
 * `src/game.js` is the orchestrator: nearly two thousand lines that wire a
 * dozen systems together, and by far the most likely place for a rename in
 * one module to break a call in another. The bundle would still build —
 * `this.world.waterfallProximity(...)` is valid JavaScript even when the
 * method does not exist — so the failure would only appear as a black screen
 * in the browser.
 *
 * This file closes that gap without a GPU: every collaborating class is
 * imported (with a DOM shim), and each `this.<field>.<member>` access in the
 * orchestrator is checked against the real member set of the real object.
 *
 * It is a static audit rather than a simulation, so it is deliberately
 * conservative: anything it cannot resolve is skipped rather than guessed.
 */
import { test } from '../tools/runner.mjs';
import './dom-shim.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

/* ------------------------------------------------------------------ *
 * Everything the game is made of
 * ------------------------------------------------------------------ */

const { World, Portal, Fragment } = await import('../src/world/world.js');
const { TerrainField, TerrainStreamer, ValleyTerrain, BIOMES } = await import('../src/world/terrain.js');
const { WaterSystem } = await import('../src/world/water.js');
const { FoliageSystem } = await import('../src/world/foliage.js');
const { Population, Creature, CreatureMaterials } = await import('../src/world/creatures.js');
const { FloatingConcordance, Colossus, Wormhole, GiantDroplet } = await import('../src/world/marvels.js');
const { Renderer } = await import('../src/render/renderer.js');
const { SkySystem } = await import('../src/render/sky.js');
const { PostProcessing } = await import('../src/render/post.js');
const { TextureLibrary } = await import('../src/render/textures.js');
const { CinematicStage } = await import('../src/render/cinematic.js');
const { Player } = await import('../src/engine/player.js');
const { CameraRig } = await import('../src/engine/camera.js');
const { GameLoop } = await import('../src/engine/loop.js');
const { InputSystem } = await import('../src/engine/input.js');
const { InteractionSystem, LandmarkRegistry } = await import('../src/engine/interact.js');
const { Hud } = await import('../src/ui/hud.js');
const { Menu } = await import('../src/ui/menu.js');
const { Codex } = await import('../src/ui/codex.js');
const { IntroSequence } = await import('../src/ui/intro.js');
const { LoadingScreen } = await import('../src/ui/loading.js');
const { AudioEngine } = await import('../src/audio/audio.js');
const { Rng } = await import('../src/core/rand.js');
const { createSettings, memoryStorage } = await import('../src/settings.js');
const { createSaveSystem, createProgressTracker } = await import('../src/save.js');

/* ------------------------------------------------------------------ *
 * Member sets
 * ------------------------------------------------------------------ */

/**
 * Every member a value of this shape can be asked for: prototype members
 * (methods, getters) plus anything the defining module assigns to `this.`
 * anywhere in its own source — which is how constructor fields are found
 * without running a constructor we cannot run headless.
 */
function memberSet(sourceFile, ClassOrInstance) {
  const set = new Set();
  const isClass = typeof ClassOrInstance === 'function';
  const prototype = isClass ? ClassOrInstance.prototype : Object.getPrototypeOf(ClassOrInstance);
  for (const name of Object.getOwnPropertyNames(prototype)) set.add(name);
  if (isClass) {
    for (const name of Object.getOwnPropertyNames(ClassOrInstance)) {
      if (name !== 'prototype' && name !== 'length' && name !== 'name') set.add(name);
    }
  } else {
    // An instance: its own properties ARE its API (closures and fields alike).
    for (const name of Reflect.ownKeys(ClassOrInstance)) set.add(String(name));
  }
  try {
    const src = read(sourceFile);
    for (const match of src.matchAll(/this\.([A-Za-z_$][\w$]*)/g)) set.add(match[1]);
  } catch {
    /* a file we cannot read simply contributes nothing */
  }
  return set;
}

// Cheap, real instances — the ones that need no GPU and no DOM.
const field = new TerrainField(20261011);
const settings = createSettings({ storage: memoryStorage() });
const saves = createSaveSystem({ storage: memoryStorage() });
const progress = createProgressTracker(saves, 'auto', 4242);
const rng = new Rng(7);
const player = new Player({ field, spawn: { x: 0, y: 30, z: 0 } });
const input = new InputSystem({ canvas: globalThis.document.createElement('canvas') });
const landmarks = new LandmarkRegistry();
const interaction = new InteractionSystem();
const rig = new CameraRig();
const loop = new GameLoop({ onFixed: () => {}, onFrame: () => {} });

const CONTRACTS = {
  world: memberSet('src/world/world.js', World),
  field: memberSet('src/world/terrain.js', field),
  terrain: memberSet('src/world/terrain.js', ValleyTerrain),
  streamer: memberSet('src/world/terrain.js', TerrainStreamer),
  water: memberSet('src/world/water.js', WaterSystem),
  foliage: memberSet('src/world/foliage.js', FoliageSystem),
  population: memberSet('src/world/creatures.js', Population),
  materials: memberSet('src/world/creatures.js', CreatureMaterials),
  concordance: memberSet('src/world/marvels.js', FloatingConcordance),
  colossus: memberSet('src/world/marvels.js', Colossus),
  wormhole: memberSet('src/world/marvels.js', Wormhole),
  droplet: memberSet('src/world/marvels.js', GiantDroplet),
  renderer: memberSet('src/render/renderer.js', Renderer),
  sky: memberSet('src/render/sky.js', SkySystem),
  post: memberSet('src/render/post.js', PostProcessing),
  textures: memberSet('src/render/textures.js', TextureLibrary),
  cinematic: memberSet('src/render/cinematic.js', CinematicStage),
  player: memberSet('src/engine/player.js', player),
  camera: memberSet('src/engine/camera.js', rig),
  loop: memberSet('src/engine/loop.js', loop),
  input: memberSet('src/engine/input.js', input),
  interaction: memberSet('src/engine/interact.js', interaction),
  landmarks: memberSet('src/engine/interact.js', landmarks),
  hud: memberSet('src/ui/hud.js', Hud),
  menu: memberSet('src/ui/menu.js', Menu),
  codex: memberSet('src/ui/codex.js', Codex),
  intro: memberSet('src/ui/intro.js', IntroSequence),
  loading: memberSet('src/ui/loading.js', LoadingScreen),
  audio: memberSet('src/audio/audio.js', AudioEngine),
  rng: memberSet('src/core/rand.js', rng),
  settings: memberSet('src/settings.js', settings),
  saveSystem: memberSet('src/save.js', saves),
  progress: memberSet('src/save.js', progress),
};

/** Fields that are plain objects/arrays built in the orchestrator itself. */
const LOCAL_FIELDS = new Set([
  'timers', 'spawnPoint', 'seen', 'captionNode', 'root', 'quality', 'canvas', 'stats',
  'flags', 'counters', 'pending', 'scratch', 'vec', 'tmp', 'tmpVec',
]);

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

function filesUnder(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.js')) out.push(full);
    }
  };
  walk(path.join(root, dir));
  return out;
}

/** `this.<field>.<member>` — the shape a rename breaks. */
const ACCESS = /this\.([A-Za-z_$][\w$]*)\??\.([A-Za-z_$][\w$]*)/g;

function auditFile(file) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const missing = [];
  // A field the file assigns to itself shadows the contract map for that file:
  // e.g. LoadingScreen.progress is a number, not the save tracker.
  const own = new Set([...source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]));
  lines.forEach((line, index) => {
    if (/^\s*(\*|\/\/)/.test(line)) return;
    for (const match of line.matchAll(ACCESS)) {
      const [, fieldName, member] = match;
      if (own.has(fieldName)) continue;
      if (LOCAL_FIELDS.has(fieldName) || !CONTRACTS[fieldName]) continue;
      // `this.player.position.x.y` style chains resolve on the first match only
      if (!CONTRACTS[fieldName].has(member)) {
        missing.push({ line: index + 1, fieldName, member, text: line.trim().slice(0, 110) });
      }
    }
  });
  return missing;
}

test('every system the orchestrator reaches into actually exposes what it calls', (h) => {
  const files = ['src/game.js', ...filesUnder('src/ui'), ...filesUnder('src/world'), ...filesUnder('src/engine')];
  const problems = [];
  for (const file of files) {
    for (const issue of auditFile(file)) {
      problems.push(`${path.relative(root, file)}:${issue.line}  ${issue.fieldName}.${issue.member}  →  ${issue.text}`);
    }
  }
  if (problems.length) {
    console.log(`\n    ${problems.length} unresolved member access(es):`);
    for (const problem of problems.slice(0, 60)) console.log(`      ${problem}`);
  }
  h.eq(problems.length, 0, 'the orchestrator calls members that do not exist on the real objects');
});

test('the World exposes everything the orchestrator drives', (h) => {
  const required = [
    'buildValley', 'ensureRealm', 'setRealmVisibility', 'enterRealm', 'returnToValley',
    'update', 'groundHeight', 'portalCheck', 'environmentContext', 'setDaylight', 'dispose',
  ];
  const members = CONTRACTS.world;
  for (const name of required) h.ok(members.has(name), `World.${name} is missing`);
  h.ok(members.has('portals') || members.has('_portals'), 'World should hold portals');
  h.ok(members.has('fragments'), 'World should hold fragments');
  h.ok(members.has('machine'), 'World should hold the Lodemus machine');
});

test('the renderer, sky and post chain agree on their entry points', (h) => {
  for (const name of ['attach', 'resize', 'setFov', 'applyQuality', 'captureEnvironment', 'updateShadowFrustum', 'render', 'projectToScreen', 'screenshot', 'dispose']) {
    h.ok(CONTRACTS.renderer.has(name), `Renderer.${name} is missing`);
  }
  for (const name of ['setTime', 'sunElevation', 'setWeather', 'strikeLightning', 'update', 'applyRealmWeather', 'dispose']) {
    h.ok(CONTRACTS.sky.has(name), `SkySystem.${name} is missing`);
  }
  for (const name of ['render', 'applyRealmLook', 'setGlitch', 'pulse', 'setSunScreen', 'setSize', 'dispose']) {
    h.ok(CONTRACTS.post.has(name), `PostProcessing.${name} is missing`);
  }
});

test('the water system still answers the questions the valley asks it', (h) => {
  for (const name of ['update', 'isUnderwater', 'nearestWaterfall', 'waterfallProximity', 'registerSplash', 'dispose']) {
    h.ok(CONTRACTS.water.has(name), `WaterSystem.${name} is missing`);
  }
  for (const name of ['update', 'nearest', 'census', 'spawn', 'spawnAt', 'clear']) {
    h.ok(CONTRACTS.population.has(name), `Population.${name} is missing`);
  }
  for (const name of ['update', 'setMapData', 'drawMap', 'toast', 'showBanner']) {
    h.ok(CONTRACTS.hud.has(name), `Hud.${name} is missing`);
  }
});

test('the settings object answers every key the game reads', (h) => {
  // The game reads settings with string keys; a typo silently returns the
  // default, which is the kind of bug that never throws and never shows up.
  const source = read('src/game.js');
  const keys = new Set();
  for (const match of source.matchAll(/settings\.(?:get|set)\(\s*'([^']+)'/g)) keys.add(match[1]);
  const known = new Set(Object.keys(settings.state));
  const unknown = [...keys].filter((key) => !known.has(key));
  h.eq(unknown.length, 0, `unknown settings keys: ${unknown.join(', ')}`);
  h.gt(keys.size, 10, 'the orchestrator should be reading a healthy number of settings');
});

test('every reality the orchestrator enters exists in the builder table', async (h) => {
  const { REALM_IDS } = await import('../src/world/realms.js');
  const source = read('src/game.js');
  // Literal realm ids used by the orchestrator, e.g. enterRealm('backrooms')
  const used = new Set();
  for (const match of source.matchAll(/enterRealm\(\s*'([a-z-]+)'/g)) used.add(match[1]);
  for (const match of source.matchAll(/realmId === '([a-z-]+)'/g)) used.add(match[1]);
  // 'valley' is the frame story rather than a built reality, so it is legal.
  const realmSet = new Set([...REALM_IDS, 'valley', 'menu', 'intro']);
  const unknown = [...used].filter((id) => !realmSet.has(id));
  h.eq(unknown.length, 0, `unknown realm ids referenced by the game: ${unknown.join(', ')}`);
  h.gt(used.size, 6, 'the orchestrator should be entering several realities');
});

test('truth conditions in the game line up with the truths in the lore', async (h) => {
  const { TRUTHS } = await import('../src/lore.js');
  const { TRUTH_CHECKS } = await import('../src/game.js');
  const loreIds = new Set(TRUTHS.map((truth) => truth.id));
  h.isArray(TRUTH_CHECKS, 'game.js should export its truth conditions');
  h.gt(TRUTH_CHECKS.length, 5, 'expected a set of truth conditions');
  for (const check of TRUTH_CHECKS) {
    h.ok(loreIds.has(check.id), `TRUTH_CHECKS references unknown truth "${check.id}"`);
    h.eq(typeof check.check, 'function', `truth "${check.id}" has no test`);
  }
  const covered = new Set(TRUTH_CHECKS.map((check) => check.id));
  for (const id of loreIds) h.ok(covered.has(id), `truth "${id}" has no condition, so it can never be found`);
  h.ok(loreIds.size > 0, 'the lore should define truths');
});

test('interaction ids are unique, so two things never fight over a prompt', (h) => {
  const source = read('src/game.js');
  // Only ids inside interaction.register({...}) blocks share a namespace.
  const ids = [...source.matchAll(/interaction\.register\(\{[\s\S]{0,400}?id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicates = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  h.eq(duplicates.length, 0, `duplicate interaction ids in game.js: ${duplicates.join(', ')}`);
});
