import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Culling/ray';
import { PlayerController } from '../src/player/Player';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { createWorld } from '../src/persistence/storage';
import type { VoxelWorld } from '../src/world/World';

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera('test-player', new Vector3(0, 5, 0), scene);
  const world = {
    isLoaded: () => true,
    solid: (x: number, y: number, z: number) => y < 1 || x >= 3 && x < 4 && z < 2 && y < 6,
    getBlock: (x: number, y: number, z: number) => y < 1 || x >= 3 && x < 4 && z < 2 && y < 6 ? 3 : 0,
  } as unknown as VoxelWorld;
  const save = createWorld('Physics', 'test', 'survival', 'flat', 'normal');
  const player = new PlayerController(camera, world, save, DEFAULT_SETTINGS);
  player.position.set(.5, 5, .5); player.active = true;
  return { engine, scene, player, dispose: () => { scene.dispose(); engine.dispose(); } };
}

test('gravity lands the AABB on terrain without penetration', () => {
  const f = fixture();
  for (let i = 0; i < 240; i++) f.player.update(1 / 60);
  assert.ok(f.player.position.y > .99 && f.player.position.y < 1.06);
  assert.equal(f.player.collides(f.player.position.x, f.player.position.y, f.player.position.z), false);
  f.dispose();
});

test('jump produces upward movement and the player returns safely', () => {
  const f = fixture(); for (let i = 0; i < 180; i++) f.player.update(1 / 60);
  f.player.grounded = true; f.player.keyDown('Space'); f.player.update(1 / 60); f.player.keys.clear();
  for (let i = 0; i < 12; i++) f.player.update(1 / 60);
  assert.ok(f.player.position.y > 1.5);
  for (let i = 0; i < 180; i++) f.player.update(1 / 60);
  assert.ok(f.player.position.y > .99 && f.player.position.y < 1.06);
  f.dispose();
});

test('horizontal movement cannot pass through a tall wall', () => {
  const f = fixture(); for (let i = 0; i < 180; i++) f.player.update(1 / 60);
  f.player.keyDown('KeyD'); for (let i = 0; i < 180; i++) f.player.update(1 / 60);
  assert.ok(f.player.position.x < 2.72); assert.ok(f.player.position.x > 2.5);
  f.dispose();
});

test('voxel traversal returns the correct outward placement normal', () => {
  const f = fixture(); f.player.position.set(.5, 1, .5); f.player.yaw = Math.PI / 2; f.player.pitch = 0; f.player.updateCamera();
  const target = f.player.target(); assert.ok(target); assert.equal(target.x, 3); assert.deepEqual(target.normal, [-1, 0, 0]);
  f.dispose();
});