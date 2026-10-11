/**
 * Engine tests — the parts of the game that decide whether it is *playable*:
 * the player controller, the camera rig, the fixed-step loop, the
 * interaction cone, landmark discovery, input mapping, and the settings/save
 * plumbing that surrounds all of it.
 *
 * These are deliberately browser-free: the engine modules are written so the
 * simulation can be stepped in Node, which is how we verify physics without a
 * GPU in the sandbox.
 */
import { test } from '../tools/runner.mjs';
import './dom-shim.mjs';

const { Player, PLAYER_TUNING, surfaceTraction, visibilityFor } = await import('../src/engine/player.js');
const { CameraRig } = await import('../src/engine/camera.js');
const { GameLoop, stepLoop, FIXED_STEP } = await import('../src/engine/loop.js');
const { InteractionSystem, LandmarkRegistry } = await import('../src/engine/interact.js');
const { InputSystem, DEFAULT_BINDINGS } = await import('../src/engine/input.js');
const { placeName, minorName, COMMENTARY, INTRO, LOADING_TIPS, MENU } = await import('../src/engine/text.js');

/* ------------------------------------------------------------------ *
 * Fakes
 * ------------------------------------------------------------------ */

/** A flat world at y = 0, with an optional water level and a hill. */
function flatField({ height = 0, hill = null } = {}) {
  return {
    options: { worldRadius: 4000 },
    heightAt(x, z) {
      if (hill) {
        const d = Math.hypot(x - hill.x, z - hill.z);
        if (d < hill.radius) return height + (1 - d / hill.radius) * hill.height;
      }
      return height;
    },
    normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
      out.x = 0;
      out.y = 1;
      out.z = 0;
      return out;
    },
  };
}

/** A movement controller that always walks forward. */
function walkingInput() {
  return {
    moveVector: () => ({ x: 0, z: 1, magnitude: 1 }),
    lookDelta: () => ({ yaw: 0.01, pitch: 0 }),
    isDown: () => false,
    wasPressed: () => false,
  };
}

function makePlayer(field, spawn = { x: 0, y: 2, z: 0 }) {
  const player = new Player({ field, spawn });
  const events = [];
  player.onFootstep = (kind) => events.push(['footstep', kind]);
  player.onSplash = (kind) => events.push(['splash', kind]);
  player.onStateChange = (next, previous) => events.push(['state', `${previous}->${next}`]);
  return { player, events };
}

function simulate(player, seconds, ctx = {}, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) player.update(dt, ctx);
  return player;
}

/* ------------------------------------------------------------------ *
 * Player — gravity, landing, walking
 * ------------------------------------------------------------------ */

test('the player falls, lands on the ground and stops falling', (h) => {
  const field = flatField({ height: 12 });
  const { player } = makePlayer(field, { x: 0, y: 40, z: 0 });
  h.eq(player.state, 'air');
  simulate(player, 3, { waterLevel: -10 });
  h.close(player.position.y, 12, 0.4, `expected to rest on the ground, got ${player.position.y}`);
  h.eq(player.state, 'ground');
  h.close(player.velocity.y, 0, 0.001);
  h.ok(player.grounded);
});

test('walking moves the player forward at roughly the walk speed', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 0, y: 0.05, z: 0 });
  simulate(player, 1, { input: walkingInput(), waterLevel: -100 });
  // yaw starts at 0, so "forward" is +z.
  h.gt(player.position.z, 3, `expected to travel forward, z=${player.position.z}`);
  h.inRange(player.speed, 3, PLAYER_TUNING.walkSpeed + 0.5, `speed ${player.speed}`);
});

test('jumping leaves the ground and comes back down', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 0, y: 0.05, z: 0 });
  simulate(player, 0.5, { waterLevel: -100 });
  const groundY = player.position.y;
  // press jump for exactly one frame
  player.update(1 / 60, {
    waterLevel: -100,
    input: {
      moveVector: () => ({ x: 0, z: 0, magnitude: 0 }),
      lookDelta: () => ({ yaw: 0, pitch: 0 }),
      isDown: (a) => a === 'jump',
      wasPressed: (a) => a === 'jump',
    },
  });
  h.gt(player.velocity.y, 0, 'jump should produce upward velocity');
  simulate(player, 0.35, { waterLevel: -100 });
  h.gt(player.position.y - groundY, 0.6, `the player should be airborne, dy=${(player.position.y - groundY).toFixed(2)}`);
  simulate(player, 2.5, { waterLevel: -100 });
  h.close(player.position.y, groundY, 0.35, 'the player should land again');
});

test('coyote time still allows a jump shortly after walking off a ledge', (h) => {
  const field = flatField({ height: 0, hill: { x: 0, z: 0, radius: 6, height: 3 } });
  const { player } = makePlayer(field, { x: 0, y: 3.2, z: 0 });
  simulate(player, 0.4, { input: walkingInput(), waterLevel: -100 });
  // Walk off the hill, then jump within the coyote window.
  const jump = {
    moveVector: () => ({ x: 0, z: 1, magnitude: 1 }),
    lookDelta: () => ({ yaw: 0, pitch: 0 }),
    isDown: () => false,
    wasPressed: (a) => a === 'jump',
  };
  let jumped = false;
  for (let i = 0; i < 60 && !jumped; i++) {
    player.update(1 / 60, { input: jump, waterLevel: -100 });
    if (player.velocity.y > 1) jumped = true;
  }
  h.ok(jumped, 'a buffered jump inside the coyote window should fire');
});

test('steep ground makes the player slide instead of climbing', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 0, y: 0.05, z: 0 });
  simulate(player, 0.4, { input: walkingInput(), waterLevel: -100 });
  // Force a cliff normal (a 60° face) and let the slide logic act.
  field.normalAt = (x, z, out = { x: 0, y: 1, z: 0 }) => {
    out.x = 0.85;
    out.y = 0.5;
    out.z = 0;
    return out;
  };
  const before = player.velocity.x;
  simulate(player, 0.3, { input: walkingInput(), waterLevel: -100 });
  h.gt(player.velocity.x, before - 0.01, 'a steep face should push the player down the fall line');
});

/* ------------------------------------------------------------------ *
 * Player — water
 * ------------------------------------------------------------------ */

test('the player floats: buoyancy keeps an idle body near the surface', (h) => {
  const field = flatField({ height: -40 });
  const { player } = makePlayer(field, { x: 0, y: -1.5, z: 0 });
  simulate(player, 5, { waterLevel: 0 });
  h.eq(player.state, 'water');
  h.inRange(player.position.y, -3.4, 0.6, `buoyancy should hold the player at the surface, y=${player.position.y}`);
});

test('breath drains underwater and death follows', (h) => {
  const field = flatField({ height: -60 });
  const { player } = makePlayer(field, { x: 0, y: -20, z: 0 });
  player.update(1 / 60, { waterLevel: 0 });
  h.eq(player.state, 'water');
  const drain = (t) => simulate(player, t, { waterLevel: 0 });
  drain(6);
  h.lt(player.breath, 1, 'breath should fall while submerged');
  h.gt(player.breath, 0.3, `but not instantly, breath=${player.breath.toFixed(3)}`);
  drain(20);
  h.close(player.breath, 0, 1e-6, 'breath should be exhausted after ~18s under');
  drain(16);
  h.eq(player.state, 'dead', `expected drowning to kill, breath=${player.breath.toFixed(3)} health=${player.health.toFixed(3)}`);
});

test('entering water fires a splash event exactly once', (h) => {
  const field = flatField({ height: -30 });
  const { player, events } = makePlayer(field, { x: 0, y: 6, z: 0 });
  simulate(player, 4, { waterLevel: 0 });
  const splashes = events.filter((e) => e[0] === 'splash');
  h.gte(splashes.length, 1, 'a splash should have been reported');
  h.eq(splashes[0][1], 'enter');
});

/* ------------------------------------------------------------------ *
 * Player — abilities
 * ------------------------------------------------------------------ */

test('ghost mode ignores the ground entirely', (h) => {
  const field = flatField({ height: 30 });
  const { player } = makePlayer(field, { x: 0, y: 5, z: 0 });
  player.ghost = true;
  simulate(player, 2, { waterLevel: -100 });
  h.eq(player.state, 'ghost');
  h.lt(player.position.y, 30, 'a ghost should pass through the hill rather than stand on it');
});

test('flight mode holds altitude instead of falling', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 0, y: 200, z: 0 });
  player.abilities.fly = true;
  player.flying = true;
  simulate(player, 3, { waterLevel: -100 });
  h.eq(player.state, 'flight');
  h.gt(player.position.y, 120, `flight should resist gravity, y=${player.position.y}`);
});

/* ------------------------------------------------------------------ *
 * Camera
 * ------------------------------------------------------------------ */

test('the camera rig sits at eye height in first person', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 5, y: 0.05, z: -3 });
  const rig = new CameraRig({ fov: 78 });
  simulate(player, 0.5, { waterLevel: -100 });
  rig.update(1 / 60, player, { mode: 'first', groundHeight: (x, z) => 0, shake: 0 });
  h.close(rig.position.x, player.position.x, 0.2);
  h.close(rig.position.z, player.position.z, 0.2);
  h.close(rig.position.y, player.position.y + player.eyeHeight, 0.25);
});

test('trauma decays to zero, and shake cannot be negative', (h) => {
  const field = flatField();
  const { player } = makePlayer(field, { x: 0, y: 0, z: 0 });
  const rig = new CameraRig();
  rig.addTrauma(1);
  h.close(rig.trauma, 1, 1e-6);
  for (let i = 0; i < 120; i++) rig.update(1 / 60, player, { shake: 1 });
  h.close(rig.trauma, 0, 1e-3, `trauma should decay, got ${rig.trauma}`);
});

test('third-person mode keeps the camera out of the ground', (h) => {
  const field = flatField({ height: 0 });
  const { player } = makePlayer(field, { x: 0, y: 0.05, z: 0 });
  const rig = new CameraRig();
  rig.setMode('third');
  for (let i = 0; i < 90; i++) {
    rig.update(1 / 60, player, { groundHeight: (x, z) => 0, thirdPersonBlocked: true });
  }
  h.gte(rig.position.y, 0.5, `the spring arm should respect the floor, y=${rig.position.y}`);
});

test('forward and right vectors are orthonormal and unit length', (h) => {
  const rig = new CameraRig();
  rig.yaw = 1.1;
  rig.pitch = -0.3;
  const forward = rig.forward();
  const right = rig.right();
  h.close(Math.hypot(forward.x, forward.y, forward.z), 1, 1e-6);
  h.close(Math.hypot(right.x, right.y, right.z), 1, 1e-6);
  h.close(forward.x * right.x + forward.z * right.z, 0, 1e-6);
});

/* ------------------------------------------------------------------ *
 * Loop
 * ------------------------------------------------------------------ */

test('the fixed-step loop runs the simulation at a stable rate', (h) => {
  let fixed = 0;
  const loop = new GameLoop({ onFixed: () => fixed++, onFrame: () => {} });
  loop.start();
  loop.lastTimestamp = 0;
  loop.tick(1 / 60 * 1000);
  h.eq(fixed, 1, 'one frame of 1/60s should produce exactly one fixed step');
  // A full second of 60 Hz frames is exactly 60 steps of simulation.
  for (let i = 2; i <= 60; i++) loop.tick(loop.lastTimestamp + 1000 / 60);
  h.inRange(fixed, 59, 61, `60 frames at 60 Hz should be ~60 steps, got ${fixed}`);
  h.close(loop.time, 1, 0.03, `simulated time should track wall time, got ${loop.time}`);
  loop.stop();
});

test('a single long frame is capped at MAX_SUBSTEPS and flagged for catch-up', (h) => {
  let fixed = 0;
  const loop = new GameLoop({ onFixed: () => fixed++, onFrame: () => {} });
  loop.start();
  loop.lastTimestamp = 0;
  loop.tick(500); // half a second in one frame, without tripping MAX_FRAME
  h.eq(fixed, 5, `half a second must not run 30 steps in one frame, ran ${fixed}`);
  h.eq(loop.catchUpFrames, 1);
  loop.stop();
});

test('a huge stall is clamped rather than simulated in one jump', (h) => {
  let fixed = 0;
  const loop = new GameLoop({ onFixed: () => fixed++, onFrame: () => {} });
  loop.start();
  loop.lastTimestamp = 0;
  loop.tick(60000); // a minute-long tab switch
  h.lte(fixed, 5, `a 60s stall must not run 3600 steps, ran ${fixed}`);
  h.eq(loop.droppedFrames, 1);
  loop.stop();
});

test('pausing stops fixed steps and timeScale scales them', (h) => {
  let fixed = 0;
  const loop = new GameLoop({ onFixed: () => fixed++, onFrame: () => {} });
  loop.start();
  loop.setPaused(true);
  loop.lastTimestamp = 0;
  loop.tick(1000);
  h.eq(fixed, 0, 'a paused loop must not simulate');
  loop.setPaused(false);
  loop.timeScale = 0.5;
  loop.lastTimestamp = 0;
  for (let i = 0; i < 60; i++) loop.tick(loop.lastTimestamp + 1000 / 60);
  h.inRange(fixed, 29, 31, `half speed over one second should be ~30 steps, got ${fixed}`);
  loop.timeScale = 0;
  fixed = 0;
  for (let i = 0; i < 60; i++) loop.tick(loop.lastTimestamp + 1000 / 60);
  h.eq(fixed, 0, 'timeScale 0 freezes the simulation');
  loop.stop();
});

test('stepLoop drives a deterministic number of steps', (h) => {
  const loop = new GameLoop({ onFixed: () => {}, onFrame: () => {} });
  const steps = stepLoop(loop, 1);
  h.eq(steps, Math.round(1 / FIXED_STEP));
  h.close(loop.time, 1, 1e-6);
});

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

test('the interaction cone only offers what the player is looking at', (h) => {
  const system = new InteractionSystem({ maxDistance: 6, coneAngle: 0.72 });
  system.register({ id: 'ahead', position: { x: 0, y: 0, z: 4 }, label: 'ahead' });
  system.register({ id: 'behind', position: { x: 0, y: 0, z: -4 }, label: 'behind' });
  const eye = { x: 0, y: 1.7, z: 0 };
  const forward = { x: 0, y: -0.05, z: 1 };
  system.update(1 / 60, eye, forward, {});
  h.ok(system.current, 'something should be offered');
  h.eq(system.current.id, 'ahead');
  h.eq(system.prompt().label, 'ahead');
});

test('interaction prefers the closer, better-aligned target when several overlap', (h) => {
  const system = new InteractionSystem({ maxDistance: 8, coneAngle: 0.5 });
  system.register({ id: 'far', position: { x: 0, y: 0, z: 7 }, priority: 0 });
  system.register({ id: 'near', position: { x: 0.4, y: 0, z: 2 }, priority: 0 });
  system.update(1 / 60, { x: 0, y: 1, z: 0 }, { x: 0.05, y: -0.3, z: 0.95 }, {});
  h.eq(system.current.id, 'near');
});

test('a target whose requirement is unsatisfied is invisible to the system', (h) => {
  const system = new InteractionSystem({ maxDistance: 10 });
  let unlocked = false;
  let triggered = false;
  system.register({
    id: 'locked-door',
    position: { x: 0, y: 0, z: 3 },
    requires: () => unlocked,
    onInteract: () => {
      triggered = true;
      return 'opened';
    },
  });
  system.update(1 / 60, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, {});
  h.eq(system.current, null, 'a locked target should not be offered');
  h.eq(system.trigger({}), null);
  h.eq(triggered, false);
  unlocked = true;
  system.update(1 / 60, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, {});
  h.eq(system.current?.id, 'locked-door');
  h.eq(system.trigger({}), 'opened');
  h.eq(triggered, true);
});

test('unregistering a focused target clears the prompt', (h) => {
  const system = new InteractionSystem();
  system.register({ id: 'frag', position: { x: 0, y: 0, z: 2 } });
  system.update(1 / 60, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, {});
  h.eq(system.current.id, 'frag');
  system.unregister('frag');
  h.eq(system.current, null);
  h.eq(system.prompt(), null);
});

/* ------------------------------------------------------------------ *
 * Landmarks
 * ------------------------------------------------------------------ */

test('landmarks can be discovered once and serialise cleanly', (h) => {
  const registry = new LandmarkRegistry();
  registry.add('valley', { id: 'fall-1', name: 'The Omunaor Falls', x: 100, z: 0 });
  registry.add('valley', { id: 'peak-1', name: 'The Vessispire', x: -400, z: 250 });
  h.eq(registry.discoveredCount('valley'), 0);
  const found = registry.discover('valley', 'fall-1');
  h.ok(found);
  h.eq(registry.discover('valley', 'fall-1'), null, 'discovering twice should be a no-op');
  h.eq(registry.discoveredCount('valley'), 1);
  const nearest = registry.nearest('valley', { x: 90, z: 10 });
  h.eq(nearest.landmark.id, 'fall-1');
  h.close(nearest.distance, Math.hypot(10, 10), 1e-6);
  const bearing = registry.bearing({ x: 0, z: 0 }, { x: 0, z: 10 });
  h.close(bearing, 0, 1e-6);
  const state = registry.serialize();
  const restored = new LandmarkRegistry();
  restored.add('valley', { id: 'fall-1', name: 'x', x: 1, z: 1 });
  restored.deserialize(state);
  h.eq(restored.discoveredCount('valley'), 1);
});

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

test('every default binding maps to a real action and a real key code', (h) => {
  const system = new InputSystem({ canvas: globalThis.document.createElement('canvas') });
  for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
    h.ok(codes.length > 0, `${action} has no keys`);
    h.isArray(system.bindings[action]);
  }
  h.deepEq(system._actionsForKey('Space'), ['jump', 'ascend']);
  h.deepEq(system._actionsForKey('KeyW'), ['forward']);
  h.deepEq(system._actionsForKey('F12'), []);
  system.detach();
});

test('movement intent is normalised to at most one unit', (h) => {
  const system = new InputSystem({ canvas: globalThis.document.createElement('canvas') });
  const down = new Set(['KeyW', 'KeyD']);
  system.isDown = (action) => down.has(bindingKey(action));
  const move = system.moveVector();
  h.close(Math.hypot(move.x, move.z), 1, 1e-6, `diagonal movement should be unit length, got ${Math.hypot(move.x, move.z)}`);
  system.detach();
});

test('mouse look respects sensitivity and inversion', (h) => {
  const system = new InputSystem({ canvas: globalThis.document.createElement('canvas') });
  system.sensitivity = 1;
  system.mouse.dx = 100;
  system.mouse.dy = -50;
  const normal = system.lookDelta();
  h.lt(normal.yaw, 0, 'moving the mouse right should turn right (negative yaw in our convention)');
  h.gt(normal.pitch, 0, 'moving the mouse up should look up');
  system.invertY = true;
  const inverted = system.lookDelta();
  h.close(inverted.pitch, -normal.pitch, 1e-6);
  system.sensitivity = 2;
  const faster = system.lookDelta();
  h.close(Math.abs(faster.yaw), Math.abs(normal.yaw) * 2, 1e-9);
  system.detach();
});

test('binding conflicts are detectable for the rebinding UI', (h) => {
  const system = new InputSystem({ canvas: globalThis.document.createElement('canvas') });
  h.eq(system.conflicting('jump', 'KeyW'), 'forward');
  h.eq(system.conflicting('jump', 'F12'), null);
  system.setBinding('forward', ['KeyI']);
  h.deepEq(system.bindings.forward, ['KeyI']);
  system.detach();
});

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

test('place names are deterministic and readable', (h) => {
  const a = placeName(1234);
  const b = placeName(1234);
  h.eq(a, b);
  h.notEq(placeName(1234), placeName(4321));
  h.gt(a.length, 3);
  h.ok(/^[A-Z]/.test(a), `place names should start with a capital, got ${a}`);
  h.ok(minorName(7).length >= 4);
});

test('the intro covers every phase in order, with narration in each', (h) => {
  const phases = INTRO.map((beat) => beat.phase);
  h.deepEq(phases, ['title', 'dust', 'burst', 'galaxies', 'earth', 'meteor', 'machine', 'plug', 'simolysis', 'menu']);
  let last = -1;
  for (const beat of INTRO) {
    h.gt(beat.at, last, 'beats must be ordered');
    last = beat.at;
    h.gt(beat.text.length, 40, `narration for ${beat.phase} is too short to be spoken`);
    h.ok(/[.!?]$/.test(beat.text.trim()), `narration for ${beat.phase} should end with punctuation`);
  }
});

test('commentary pools are non-empty and well-formed', (h) => {
  const pools = Object.entries(COMMENTARY);
  h.gt(pools.length, 20, 'the Archivist should have plenty to say');
  for (const [key, lines] of pools) {
    h.isArray(lines, `${key} should be an array`);
    h.gt(lines.length, 0, `${key} is empty`);
    for (const line of lines) {
      h.gt(String(line).trim().length, 10, `${key} has a stub line`);
      h.ok(!/\{\{|\}\}|TODO|FIXME|Lorem/i.test(line), `${key} contains placeholder text: ${line}`);
    }
  }
  h.gt(LOADING_TIPS.length, 8);
  h.gt(MENU.items.length, 4);
  h.ok(MENU.items.some((item) => item.id === 'play'));
  h.ok(MENU.items.some((item) => item.id === 'settings'));
  h.ok(MENU.items.some((item) => item.id === 'quit'));
});

/* ------------------------------------------------------------------ *
 * Helpers used by the world
 * ------------------------------------------------------------------ */

test('surface traction only ever reduces grip, within sensible bounds', (h) => {
  for (const biome of ['meadow', 'beach', 'wetland', 'alpine', 'crystal']) {
    for (const wetness of [0, 0.5, 1]) {
      const value = surfaceTraction(biome, wetness);
      h.inRange(value, 0.7, 1.05, `${biome}@${wetness} gave ${value}`);
    }
  }
  h.gt(surfaceTraction('meadow', 0), surfaceTraction('wetland', 1));
});

test('visibility shrinks in interior and void realities', (h) => {
  h.gt(visibilityFor({ id: 'valley' }, 'clear'), 1000);
  h.lt(visibilityFor({ id: 'backrooms' }, 'clear'), 60);
  h.lt(visibilityFor({ id: 'void' }, 'clear'), 2000);
  h.lt(visibilityFor({ id: 'valley' }, 'mist'), visibilityFor({ id: 'valley' }, 'clear'));
});

function bindingKey(action) {
  const map = { forward: 'KeyW', right: 'KeyD', back: 'KeyS', left: 'KeyA', jump: 'Space' };
  return map[action] ?? action;
}
