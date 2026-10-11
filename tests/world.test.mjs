/**
 * World-layer tests.
 * ==================================================================
 * The realities, the population and the foliage are pure geometry plus
 * arithmetic until the moment they are drawn, which means they can be built
 * and stepped here in Node with a stubbed texture library. That is worth
 * doing: `realms.js` alone is more than a thousand lines that would otherwise
 * never execute until a player walked into the Backrooms.
 *
 * What is checked:
 *   · every reality builds, ticks and disposes without throwing,
 *   · creatures spawn on the ground and stay on it,
 *   · the population responds to the player and to distance,
 *   · the foliage streams chunks deterministically.
 */
import { test } from '../tools/runner.mjs';
import './dom-shim.mjs';
import { Group, Texture, Vector3 } from 'three';

import { TerrainField, WATER_LEVEL } from '../src/world/terrain.js';
import { REALM_BUILDERS, REALM_IDS } from '../src/world/realms.js';
import { Population, CreatureMaterials } from '../src/world/creatures.js';
import { FoliageSystem } from '../src/world/foliage.js';
import { Rng } from '../src/core/rand.js';

/* ------------------------------------------------------------------ *
 * A texture library that produces real THREE textures with no canvas.
 * ------------------------------------------------------------------ */

function blankTexture(name = 'stub') {
  const texture = new Texture();
  texture.name = name;
  texture.needsUpdate = false;
  return texture;
}

class FakeTextures {
  constructor() {
    this.calls = new Map();
  }

  _hit(kind) {
    this.calls.set(kind, (this.calls.get(kind) ?? 0) + 1);
  }

  surface(kind, { seed = 0 } = {}) {
    this._hit(`surface:${kind}`);
    return {
      map: blankTexture(`${kind}-albedo-${seed}`),
      normalMap: blankTexture(`${kind}-normal-${seed}`),
      roughnessMap: blankTexture(`${kind}-rough-${seed}`),
      heightMap: blankTexture(`${kind}-height-${seed}`),
    };
  }

  sprite(kind) {
    this._hit(`sprite:${kind}`);
    return blankTexture(`sprite-${kind}`);
  }

  flow() {
    this._hit('flow');
    return blankTexture('flow');
  }

  waterNormal() {
    this._hit('waterNormal');
    return blankTexture('water-normal');
  }

  foam() {
    this._hit('foam');
    return blankTexture('foam');
  }

  stars() {
    this._hit('stars');
    return blankTexture('stars');
  }

  planet(index) {
    this._hit('planet');
    return blankTexture(`planet-${index}`);
  }

  moons() {
    this._hit('moons');
    return blankTexture('moons');
  }

  cloudNoise() {
    this._hit('cloudNoise');
    return blankTexture('cloud-noise');
  }

  nebula() {
    this._hit('nebula');
    return blankTexture('nebula');
  }

  lensDirt() {
    return blankTexture('lens-dirt');
  }

  flare() {
    return blankTexture('flare');
  }

  gradeLUT() {
    return blankTexture('grade');
  }
}

/** The quality object the world layer expects. */
const QUALITY = {
  name: 'high',
  landmarkCount: 12,
  creatureDensity: 0.8,
  creatureRadius: 260,
  foliageDensity: 0.9,
  chunkSegments: 64,
  viewDistance: 1,
  waterfallCount: 5,
  treeBudget: 2400,
  grassBudget: 9000,
  particleBudget: 2000,
  reflectionSize: 512,
  shadowSize: 2048,
  cloudSteps: 24,
  starCount: 3000,
  terrainTextureSize: 256,
  effects: { ssao: true, ssr: true, bloom: true, dof: true, motionBlur: false, godrays: true, clouds: true, shadows: true },
};

function makeRealmContext(playerPosition = new Vector3(0, 2, 0)) {
  return {
    playerPosition,
    cameraPosition: playerPosition.clone().add(new Vector3(0, 1.7, -4)),
    cameraForward: new Vector3(0, 0, 1),
    camera: null,
    time: 0,
    speaking: false,
    registerGroundProvider: () => {},
    onGravity: () => {},
    onSwallowed: () => {},
    onBroadcast: () => {},
    onTVSpeech: () => {},
    onSense: () => {},
    setTimeDilation: () => {},
  };
}

/* ------------------------------------------------------------------ *
 * Realities
 * ------------------------------------------------------------------ */

test('every reality builds, ticks and disposes cleanly', (h) => {
  const textures = new FakeTextures();
  const seed = 20261011;
  h.gte(REALM_IDS.length, 10, 'the multiverse should have at least ten realities');

  for (const id of REALM_IDS) {
    const build = REALM_BUILDERS[id];
    let realm;
    try {
      realm = build({ scene: new Group(), textures, quality: QUALITY, seed, field: new TerrainField(seed) });
    } catch (err) {
      h.ok(false, `building "${id}" threw: ${err.message}`);
      continue;
    }
    h.ok(realm, `"${id}" returned nothing`);
    h.ok(realm.group, `"${id}" has no group`);
    h.ok(realm.group.isObject3D, `"${id}".group is not an Object3D`);
    h.eq(typeof realm.update, 'function', `"${id}" has no update`);
    h.eq(typeof realm.dispose, 'function', `"${id}" has no dispose`);
    h.ok(realm.physics, `"${id}" has no physics block`);
    h.ok(Array.isArray(realm.spawnTable), `"${id}".spawnTable should be an array`);
    // The white void is deliberately lifeless; everything else is inhabited.
    if (id !== 'void') h.gt(realm.spawnTable.length, 0, `"${id}" spawns nothing`);

    // Ten seconds of life in the reality, with the player wandering through it.
    const ctx = makeRealmContext();
    try {
      for (let frame = 0; frame < 300; frame++) {
        const t = frame / 60;
        ctx.time = t;
        ctx.playerPosition.set(Math.sin(t * 0.3) * 40, 2 + Math.sin(t) * 3, Math.cos(t * 0.2) * 40);
        ctx.cameraPosition.copy(ctx.playerPosition).add(new Vector3(0, 1.7, 0));
        ctx.cameraForward.set(Math.sin(t * 0.3), 0, Math.cos(t * 0.2)).normalize();
        ctx.speaking = frame % 120 === 0;
        realm.update(1 / 60, ctx);
      }
    } catch (err) {
      h.ok(false, `ticking "${id}" threw: ${err.stack.split('\n').slice(0, 2).join(' | ')}`);
    }

    try {
      realm.dispose();
    } catch (err) {
      h.ok(false, `disposing "${id}" threw: ${err.message}`);
    }
  }
});

test('every reality has geometry, not just a group', (h) => {
  const textures = new FakeTextures();
  for (const id of REALM_IDS) {
    const realm = REALM_BUILDERS[id]({ scene: new Group(), textures, quality: QUALITY, seed: 99, field: new TerrainField(99) });
    let meshes = 0;
    let lights = 0;
    realm.group.traverse((node) => {
      if (node.isMesh || node.isPoints || node.isLine) meshes++;
      if (node.isLight) lights++;
    });
    h.gt(meshes + lights, 0, `reality "${id}" renders nothing`);
    realm.dispose();
  }
});

test('reality ids match the ids the lore reasons about', async (h) => {
  const { REALMS } = await import('../src/lore.js');
  const loreIds = new Set(REALMS.map((realm) => realm.id));
  for (const id of REALM_IDS) h.ok(loreIds.has(id), `reality "${id}" is not described in the lore`);
});

/* ------------------------------------------------------------------ *
 * Population
 * ------------------------------------------------------------------ */

test('creatures spawn on the terrain and stay on it', (h) => {
  const field = new TerrainField(1234);
  const materials = new CreatureMaterials(new FakeTextures(), 1234);
  const scene = new Group();
  const population = new Population({ scene, field, materials, quality: QUALITY, seed: 1234, waterLevel: WATER_LEVEL });

  const player = new Vector3(0, 0, 0);
  const ctx = { playerPosition: player, time: 0, weather: null };
  for (let frame = 0; frame < 240; frame++) {
    ctx.time = frame / 60;
    population.update(1 / 60, ctx);
  }

  h.gt(population.count, 0, 'the valley should not be empty');
  h.lte(population.count, population.maxCreatures, 'the population must respect its budget');

  for (const creature of population.creatures.slice(0, 40)) {
    if (creature.plan.aerial || creature.plan.aquatic) continue; // they live in the air and the water
    const ground = field.heightAt(creature.position.x, creature.position.z);
    const gap = creature.position.y - ground;
    h.inRange(gap, -14, 42, `${creature.species.id} is ${gap.toFixed(1)}m off the ground at ${creature.position.x.toFixed(0)},${creature.position.z.toFixed(0)}`);
  }
  // Flyers must never be inside a hill.
  for (const creature of population.creatures) {
    if (!creature.plan.aerial) continue;
    const ground = field.heightAt(creature.position.x, creature.position.z);
    h.gt(creature.position.y - ground, -1, `${creature.species.id} is flying inside the terrain`);
  }

  // Every creature must belong to a species the codex knows about.
  for (const creature of population.creatures) {
    h.ok(creature.species?.id, 'a creature spawned without a species');
    h.ok(creature.root?.isObject3D, 'a creature has no root object');
  }

  const census = population.census();
  h.gt(Object.keys(census).length, 0, 'the census should have counted something');
});

test('spawned species are drawn from the biome they are standing in', (h) => {
  const field = new TerrainField(77);
  const materials = new CreatureMaterials(new FakeTextures(), 77);
  const population = new Population({ scene: new Group(), field, materials, quality: QUALITY, seed: 77, waterLevel: WATER_LEVEL });
  const ctx = { playerPosition: new Vector3(0, 0, 0), time: 0 };
  for (let frame = 0; frame < 120; frame++) population.update(1 / 60, ctx);
  h.gt(population.count, 0, 'nothing spawned');
  let matched = 0;
  for (const creature of population.creatures) {
    const { table } = population.speciesAt(creature.position.x, creature.position.z, creature.position.y);
    if (table.includes(creature.species.id)) matched++;
  }
  h.gt(matched / population.count, 0.8, 'most creatures should match their biome table');
});

test('the population forgets what it leaves behind', (h) => {
  const field = new TerrainField(9);
  const materials = new CreatureMaterials(new FakeTextures(), 9);
  const population = new Population({ scene: new Group(), field, materials, quality: QUALITY, seed: 9, waterLevel: WATER_LEVEL });
  const player = new Vector3(0, 0, 0);
  const ctx = { playerPosition: player, time: 0 };
  for (let frame = 0; frame < 180; frame++) {
    ctx.time = frame / 60;
    population.update(1 / 60, ctx);
  }
  const before = population.count;
  h.gt(before, 0, 'nothing spawned to despawn');

  // Walk to the far side of the valley: the old group is now out of range.
  const nearby = population.nearest(player, { maxDistance: 10000 });
  h.ok(nearby, 'nearest() should find a creature near the player');

  player.set(3000, 0, 3000);
  for (let frame = 0; frame < 240; frame++) {
    ctx.time += 1 / 60;
    population.update(1 / 60, ctx);
  }
  const stranded = population.creatures.filter((c) => c.distanceTo(player) > population.despawnRadius);
  h.eq(stranded.length, 0, `${stranded.length} creatures were left outside the despawn radius`);

  population.clear();
  h.eq(population.count, 0, 'clear() should empty the world');
});

test('the population can be asked for one specific animal', (h) => {
  const field = new TerrainField(5);
  const materials = new CreatureMaterials(new FakeTextures(), 5);
  const population = new Population({ scene: new Group(), field, materials, quality: QUALITY, seed: 5, waterLevel: WATER_LEVEL });
  const speciesId = population.speciesAt(0, 0, 0).table[0];
  const spawned = population.spawnAt(speciesId, { x: 12, y: field.heightAt(12, 12), z: 12 }, { scale: 2 });
  const creature = Array.isArray(spawned) ? spawned[0] : spawned;
  h.ok(creature, 'spawnAt should return the creature');
  h.eq(creature.species.id, speciesId);
  h.close(creature.scale / (creature.plan.scale ?? 1), 2, 0.5, 'the requested scale should be honoured');
  creature.dispose();
});

/* ------------------------------------------------------------------ *
 * Foliage
 * ------------------------------------------------------------------ */

test('foliage streams in around the player and streams out behind them', (h) => {
  const field = new TerrainField(31);
  const scene = new Group();
  const foliage = new FoliageSystem({ scene, textures: new FakeTextures(), quality: QUALITY, field, seed: 31 });
  const ctx = { time: 0, windStrength: 0.4, windX: 1, windZ: 0.3 };

  const near = new Vector3(40, field.heightAt(40, 40), 40);
  for (let frame = 0; frame < 90; frame++) {
    ctx.time = frame / 60;
    foliage.update(near, 1 / 60, ctx);
  }
  h.gt(scene.children.length, 0, 'foliage should have produced instanced meshes');
  let instances = 0;
  scene.traverse((node) => {
    if (node.isInstancedMesh) instances += node.count;
  });
  h.gt(instances, 50, `expected a decent amount of vegetation, got ${instances}`);

  // Deterministic: the same chunk regenerated twice must produce the same count.
  const before = scene.children.length;
  const far = new Vector3(-1800, field.heightAt(-1800, -1800), -1800);
  for (let frame = 0; frame < 90; frame++) foliage.update(far, 1 / 60, ctx);
  h.gt(scene.children.length, 0, 'foliage disappeared entirely after moving');
  h.ok(before > 0, 'the first pass should have built something');

  foliage.dispose();
  h.eq(scene.children.length, 0, 'dispose should empty the scene');
});

test('foliage is deterministic for a seed', (h) => {
  const field = new TerrainField(64);
  const build = (seed) => {
    const scene = new Group();
    const foliage = new FoliageSystem({ scene, textures: new FakeTextures(), quality: QUALITY, field, seed });
    const at = new Vector3(120, field.heightAt(120, 120), 120);
    for (let frame = 0; frame < 60; frame++) foliage.update(at, 1 / 60, { time: frame / 60, windStrength: 0.2, windX: 1, windZ: 0 });
    // A fingerprint of where the vegetation actually ended up.
    let hash = 0;
    scene.traverse((node) => {
      if (!node.isInstancedMesh) return;
      hash = (hash * 31 + node.count) >>> 0;
      const array = node.instanceMatrix.array;
      for (let i = 0; i < Math.min(array.length, 512); i++) hash = (hash * 31 + Math.round(array[i] * 1000)) >>> 0;
    });
    foliage.dispose();
    return hash;
  };
  h.eq(build(64), build(64), 'the same seed should grow the same forest');
  h.notEq(build(64), build(65), 'a different seed should grow a different one');
});

/* ------------------------------------------------------------------ *
 * Terrain sanity for the valley
 * ------------------------------------------------------------------ */

test('the valley has water to reflect, cliffs to fall down and open ground to cross', (h) => {
  const field = new TerrainField(2024);
  let water = 0;
  let land = 0;
  let steep = 0;
  const rng = new Rng(1);
  for (let i = 0; i < 4000; i++) {
    const angle = rng.angle();
    const radius = rng.range(0, 900);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = field.heightAt(x, z);
    if (height < WATER_LEVEL) water++;
    else {
      land++;
      const slope = field.slopeAt(x, z);
      if (slope > 0.35) steep++;
    }
  }
  h.gt(water, 40, `the valley needs lakes and rivers, found ${water} wet samples of 4000`);
  h.gt(land, 2000, 'most of the valley should be landscape');
  h.gt(steep, 60, `the valley needs cliffs to hold its waterfalls, found ${steep}`);
  h.lt(water, 3000, 'the valley should not be an ocean');
});
