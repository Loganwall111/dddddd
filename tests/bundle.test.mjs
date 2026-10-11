/**
 * The bundle boot test.
 * ==================================================================
 * Everything else in the suite tests modules in isolation. This one loads the
 * *actual built bundle* — the same file the browser loads — into a headless
 * page and lets it run.
 *
 * It cannot render: there is no GPU and no WebGL here, so `boot()` is
 * expected to stop at the renderer. What it proves is the part that must not
 * break: all sixty-five modules evaluate cleanly at import time, the entry
 * point constructs the game, the failure is caught and shown to the player as
 * a readable screen rather than a black page, and the telemetry beacon
 * reports what happened.
 *
 * Run `node tools/build.mjs` first; the test skips (loudly) if there is no
 * bundle to load.
 */
import { test } from '../tools/runner.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDomShim, makeElement, flushFrames } from './dom-shim.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'game', 'bundle.js');
const hasBundle = existsSync(bundlePath);

/** The canvas the page expects, wired to the shim's stub contexts. */
function makeCanvasStub() {
  const canvas = makeElement('canvas');
  canvas.id = 'game-canvas';
  canvas.width = 1280;
  canvas.height = 720;
  return canvas;
}

test('the built bundle loads, evaluates and reports its own failures', async (h) => {
  if (!hasBundle) {
    console.log('    (no game/bundle.js — run `node tools/build.mjs` first)');
    h.ok(true, 'skipped: nothing to load');
    return;
  }

  const source = readFileSync(bundlePath, 'utf8');
  h.gt(source.length, 200_000, 'the bundle looks too small to contain the game');
  h.ok(!/require_Plane|requireScene|requireTorus/.test(source), 'the bundle still contains a CommonJS shim');

  installDomShim();

  // Assemble the page the game expects.
  const canvas = makeCanvasStub();
  const uiRoot = makeElement('div');
  uiRoot.id = 'ui-root';
  const previousElements = { 'game-canvas': canvas, 'ui-root': uiRoot };
  document.getElementById = (id) => previousElements[id] ?? null;
  document.body.appendChild(canvas);
  document.body.appendChild(uiRoot);

  // Capture telemetry instead of sending it anywhere.
  const reports = [];
  globalThis.fetch = (url, options) => {
    reports.push({ url: String(url), body: String(options?.body ?? '') });
    return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  };

  // Let the page settle. boot() awaits animation frames between steps, so the
  // test drives time forward itself and watches how far the boot gets.
  await import(pathToFileURL(bundlePath).href);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 8));
  let frames = 0;
  for (let i = 0; i < 400; i++) {
    frames += flushFrames(2);
    await settle();
    if (globalThis.game?.phase && globalThis.game.phase !== 'boot') break;
    if (reports.some((report) => report.body.includes('boot-failure'))) break;
  }
  window.clearMultiverseTelemetry?.();
  // Resource hygiene: the game attaches a resize watcher and an animation
  // loop, and a test that leaves those running never lets Node exit.
  (globalThis.game ?? globalThis.window?.game)?.dispose?.();
  h.gt(frames, 0, 'the boot sequence never asked for a frame');

  // 1. No uncaught error escaped to the global handlers.
  const errors = reports.filter((report) => /"kind":"(error|rejection)"/.test(report.body));
  h.eq(errors.length, 0, `the page threw: ${errors.map((e) => e.body).join(' | ')}`);

  // 2. Something happened: either the game is running, or it failed loudly.
  const booted = reports.some((report) => report.body.includes('"kind":"boot"'));
  h.ok(booted, 'the entry point should have reported that it started');
  h.ok(reports.some((report) => report.url.includes('/__diag')), 'telemetry should post to /__diag');

  // 3. In this sandbox there is no GPU, so the honest expectation is that the
  //    page explains itself: either the game is running, or a loading screen
  //    has appeared and the failure is on screen instead of being swallowed.
  const running = typeof globalThis.game?.phase === 'string' && globalThis.game.phase !== 'boot';
  const classes = uiRoot.children.map((child) => child.className).join(' ');
  h.ok(running || classes.length > 0, 'the page should either be running or explain itself — never blank');
  h.ok(
    /loading|fatal|menu|codex/.test(classes) || running,
    `unexpected first screen: "${classes}"`,
  );
  const gpuMissing = reports.some((report) => report.body.includes('webgl-probe'));
  if (gpuMissing) console.log('    (no WebGL in this sandbox — the capability screen was shown, which is the branch under test)');

  // 3. The game object the console gets is real.
  const game = globalThis.game ?? globalThis.window?.game;
  h.ok(game, 'window.game should exist for debugging');
  h.eq(typeof game?.boot, 'function');
  h.eq(typeof game?.settings?.get, 'function', 'the debug handle should have live settings');
  const stamp = globalThis.window?.__MV_BUILD__;
  h.ok(!Number.isNaN(Date.parse(stamp)), `the build stamp should be a real date, got ${stamp}`);

  // 4. The boot finished: every system the game needs is up.
  h.eq(game.phase, 'intro', `expected the game to reach the intro, it is in "${game.phase}"`);
  for (const system of ['renderer', 'sky', 'textures', 'world', 'player', 'camera', 'hud', 'menu', 'codex', 'interaction', 'audio', 'input']) {
    h.ok(game[system], `boot left ${system} unbuilt`);
  }
  h.ok(game.world.field, 'the valley has no height field');
  h.ok(game.world.population, 'the valley has no population');
  h.ok(Number.isFinite(game.player.position.x), 'the player was not placed');
  h.ok(game.world.field.heightAt(game.player.position.x, game.player.position.z) < game.player.position.y, 'the player spawned inside the ground');

  // 5. Walk the game through its front end and into play.
  game.onIntroComplete();
  h.eq(game.phase, 'menu', 'finishing the intro should open the menu');
  game.handleMenuChoice('play');
  h.eq(game.phase, 'playing', 'PLAY should start the game');
  h.eq(game.menu.isOpen, false, 'the menu should close when play begins');

  const framesBefore = globalThis.__rafErrors?.length ?? 0;
  for (let i = 0; i < 60; i++) {
    flushFrames(2);
    await settle();
  }
  const frameErrors = (globalThis.__rafErrors ?? []).slice(framesBefore);
  h.eq(frameErrors.length, 0, `the frame loop threw: ${frameErrors.map((e) => e.message).join(' | ')}`);
  h.eq(game.phase, 'playing', `the game left play: "${game.phase}"`);
  h.ok(Number.isFinite(game.player.position.y), 'the player fell out of the world');
  h.ok(game.loop.frame > 100, `the loop should be running, frame=${game.loop.frame}`);
  h.ok(game.world.population.count >= 0, 'the population should be countable');
});

/**
 * A second pass over the same running game: this is where the realities get
 * exercised. Entering a reality rebuilds the scene graph, swaps the physics,
 * re-registers every interactable and re-tunes the weather, so it touches
 * more of the codebase at runtime than any other single action.
 *
 * It depends on the boot test above having left a game in play.
 */
test('every reality can be entered, lived in and walked out of', async (h) => {
  const game = globalThis.game ?? globalThis.window?.game;
  h.ok(game?.phase === 'playing', 'this test needs the boot test to have run first');
  h.eq(typeof game.enterRealm, 'function', 'the game cannot enter realities');

  // Read the ids from the source rather than importing the module: importing
  // three a second time next to the bundle's inlined copy would give the test
  // a different class identity than the running game.
  const realmSource = readFileSync(path.join(root, 'src', 'world', 'realms.js'), 'utf8');
  const builderBlock = realmSource.slice(realmSource.indexOf('export const REALM_BUILDERS'));
  const REALM_IDS = [...builderBlock.matchAll(/^\s{2}([a-z][\w]*)\(\{/gm)].map((match) => match[1]);
  h.gt(REALM_IDS.length, 8, 'the multiverse should offer several realities');

  // Unlock everything: the chapter gates are not what this test is about.
  game.progress.set('chapter', 5);
  game.progress.set('realmsVisited', [...REALM_IDS]);

  const settle = () => new Promise((resolve) => setTimeout(resolve, 8));
  const errorsBefore = globalThis.__rafErrors?.length ?? 0;
  const visited = [];

  for (const id of REALM_IDS) {
    const started = Date.now();
    try {
      game.enterRealm(id, { transition: false, reason: 'test' });
    } catch (error) {
      h.ok(false, `entering "${id}" threw: ${error.message}`);
      continue;
    }
    // Simulate the reality: this is the code that would otherwise only ever
    // run when a player walked into it.
    for (let i = 0; i < 20; i++) {
      try {
        game.fixedUpdate(1 / 60);
      } catch (error) {
        h.ok(false, `"${id}" threw while simulating: ${error.message}`);
        break;
      }
    }
    // And draw it once, which is what catches a broken material or geometry.
    flushFrames(1);
    await settle();
    h.eq(game.world.realmId, id, `the world did not switch to "${id}"`);
    h.ok(Number.isFinite(game.player.position.y), `the player broke in "${id}"`);
    const elapsed = Date.now() - started;
    console.log(`    · ${id.padEnd(12)} built and simulated in ${elapsed}ms`);
    visited.push(id);
  }

  const errors = (globalThis.__rafErrors ?? []).slice(errorsBefore);
  h.eq(errors.length, 0, `the realities threw: ${errors.map((e) => e.message).join(' | ')}`);
  h.eq(visited.length, REALM_IDS.length, 'some realities could not be entered');

  // And home again, through the same door the player would use.
  await game.world.returnToValley();
  game.onRealmEntered('valley', 'return');
  for (let i = 0; i < 20; i++) game.fixedUpdate(1 / 60);
  flushFrames(2);
  await settle();
  h.eq(game.world.realmId, 'valley', 'the valley should be reachable again');
  h.ok(game.world.population, 'the valley lost its animals on the way home');
});
