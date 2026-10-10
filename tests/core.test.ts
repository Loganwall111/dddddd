import assert from 'node:assert/strict';
import test from 'node:test';
import { seedNumber, noise2, noise3 } from '../src/world/noise';
import { generateChunk, blockIndex, paddedIndex, SIZE, HEIGHT, PAD, surfaceHeight, type GenConfig } from '../src/world/generator';
import { meshChunk } from '../src/world/mesher';
import { BLOCKS, maxStack, CONTENT, ATLAS_COLS, ATLAS_ROWS, SPAWN_EGG_START, EXTRA_START } from '../src/blocks/registry';
import { addItem, consumeItem, countItem, initialInventory, moveStack } from '../src/inventory/inventory';
import { RECIPES, resolveRecipe, tickFurnace } from '../src/crafting/recipes';
import type { DimensionId, FurnaceState, Stack } from '../src/core/types';
import { validateWorld, createWorld, sanitizeCharacter } from '../src/persistence/storage';
import { MOBS } from '../src/entities/registry';
import { BIOMES, biomeAt, fluidHazard } from '../src/world/biomes';
import { advanceResonance, RESONANCE_SEQUENCE } from '../src/dimensions/portalRules';
import { generateChunk as legacyChunk } from '../src/world/legacyGenerator';

const config: GenConfig = { seed: seedNumber('QA-ALPINE-2026'), dimension: 'overworld', preset: 'normal' };

test('deterministic noise is bounded and continuous at lattice seams', () => {
  assert.equal(seedNumber('same'), seedNumber('same'));
  assert.notEqual(seedNumber('same'), seedNumber('different'));
  for (let i = -30; i < 30; i++) {
    const value = noise3(i * .123, i * -.31, i * .047, 39);
    assert.ok(value >= 0 && value <= 1);
    assert.ok(Math.abs(noise2(i - .00001, .6, 3) - noise2(i + .00001, .6, 3)) < .001);
  }
});

test('chunk generation is repeatable, correctly sized, and uses registered blocks', () => {
  const a = generateChunk(0, 0, config, {}), b = generateChunk(0, 0, config, {});
  assert.equal(a.data.length, SIZE * SIZE * HEIGHT);
  assert.equal(a.padded.length, PAD * PAD * HEIGHT);
  assert.deepEqual(a.data, b.data);
  for (const id of a.data) assert.ok(BLOCKS[id]);
});

test('neighbor padding and trees agree across positive and negative chunk seams', () => {
  for (const cx of [-1, 0]) {
    const left = generateChunk(cx, 0, config, {}), right = generateChunk(cx + 1, 0, config, {});
    for (let z = 0; z < SIZE; z++) for (let y = 0; y < HEIGHT; y++) {
      assert.equal(left.padded[paddedIndex(17, y, z + 1)], right.data[blockIndex(0, y, z)], `seam at ${cx}, ${y}, ${z}`);
      assert.equal(right.padded[paddedIndex(0, y, z + 1)], left.data[blockIndex(15, y, z)]);
    }
  }
});

test('destroyed and placed blocks override deterministic terrain on regeneration', () => {
  const y = surfaceHeight(4, 3, config);
  const { data } = generateChunk(0, 0, config, { [`4,${y},3`]: 0, '4,100,3': 27 });
  assert.equal(data[blockIndex(4, y, 3)], 0);
  assert.equal(data[blockIndex(4, 100, 3)], 27);
});

test('greedy meshing collapses a solid rectangular prism to six quads', () => {
  const padded = new Uint8Array(PAD * PAD * HEIGHT);
  for (let x = 1; x <= 4; x++) for (let y = 4; y < 8; y++) for (let z = 1; z <= 4; z++) padded[paddedIndex(x, y, z)] = 3;
  const mesh = meshChunk(padded);
  assert.equal(mesh.indices.length, 36);
  assert.equal(mesh.positions.length, 72);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.uvs.length / 2, mesh.positions.length / 3);
  assert.ok([...mesh.positions, ...mesh.normals, ...mesh.uvs].every(Number.isFinite));
});

test('greedy faces do not merge different materials', () => {
  const padded = new Uint8Array(PAD * PAD * HEIGHT);
  padded[paddedIndex(1, 10, 1)] = 1; padded[paddedIndex(2, 10, 1)] = 3;
  assert.equal(meshChunk(padded).indices.length, 60);
});

test('superflat height is constant at negative and distant coordinates', () => {
  for (const x of [-1000, -1, 0, 1000]) assert.equal(surfaceHeight(x, x * 2, { ...config, preset: 'flat' }), 30);
});

test('dimensions produce distinct, non-empty terrain', () => {
  const signatures = new Set<string>();
  for (const dimension of ['overworld','nether','end','crystal','sky','sift'] as DimensionId[]) {
    const { data } = generateChunk(0, 0, { ...config, dimension }, {});
    assert.ok(data.some(id => id > 0));
    let signature = 0;
    for (let i = 0; i < data.length; i++) signature = Math.imul(signature ^ data[i], 16777619);
    signatures.add(String(signature));
  }
  assert.equal(signatures.size, 6);
});

test('inventory handles stack caps, remainder, consumption, and split moves', () => {
  const slots: (Stack | null)[] = [{ id: 3, count: 60 }, null];
  assert.equal(addItem(slots, 3, 70), 2);
  assert.equal(countItem(slots, 3), 128);
  assert.equal(consumeItem(slots, 3, 129), false);
  assert.equal(consumeItem(slots, 3, 100), true);
  assert.equal(countItem(slots, 3), 28);
  moveStack(slots, 1, 0, true);
  assert.equal(slots[0]?.count, 14); assert.equal(slots[1]?.count, 14);
  assert.equal(maxStack(50), 1);
  assert.equal(initialInventory(true).length, 36);
});

test('every recipe can be resolved and has a unique ingredient signature', () => {
  const signatures = new Set<string>();
  for (const recipe of RECIPES) {
    const grid: (Stack | null)[] = [];
    for (const [id, count] of Object.entries(recipe.ingredients)) for (let i = 0; i < count; i++) grid.push({ id: Number(id), count: 1 });
    assert.ok(grid.length <= recipe.size * recipe.size);
    assert.equal(resolveRecipe(grid, recipe.size)?.result.id, recipe.result.id);
    signatures.add(JSON.stringify(recipe.ingredients));
    if (recipe.size === 3) assert.equal(resolveRecipe(grid, 2), null);
  }
  assert.equal(signatures.size, RECIPES.length);
});

test('invalid recipes produce nothing', () => {
  assert.equal(resolveRecipe([{ id: 3, count: 1 }, { id: 55, count: 1 }], 2), null);
  assert.equal(resolveRecipe([], 2), null);
});

test('furnace uses real input and fuel and produces iron after five seconds', () => {
  const furnace: FurnaceState = { input: { id: 12, count: 2 }, fuel: { id: 45, count: 1 }, output: null, burn: 0, progress: 0 };
  for (let i = 0; i < 100; i++) tickFurnace(furnace, .1);
  assert.equal(furnace.fuel, null);
  assert.equal(furnace.output?.id, 46);
  assert.ok((furnace.output?.count || 0) >= 1);
  assert.ok(furnace.burn > 0 && furnace.burn < 48);
  assert.ok((furnace.input?.count || 0) < 2);
});

test('furnace refuses incompatible output or absent fuel', () => {
  const blocked: FurnaceState = { input: { id: 12, count: 1 }, fuel: { id: 45, count: 1 }, output: { id: 47, count: 1 }, burn: 0, progress: 0 };
  tickFurnace(blocked, 6); assert.equal(blocked.fuel?.count, 1); assert.equal(blocked.output?.id, 47);
  blocked.output = null; blocked.fuel = null; tickFurnace(blocked, 6); assert.equal(blocked.output, null);
});

test('world exports round-trip and invalid imports are rejected', () => {
  const world = createWorld('QA World', 'test-seed', 'survival', 'normal', 'normal');
  world.edits.overworld = { '1,30,2': 0, '1,31,2': 27 };
  const restored = validateWorld(JSON.parse(JSON.stringify(world)));
  assert.notEqual(restored.id, world.id);
  assert.deepEqual(restored.edits, world.edits); assert.equal(restored.seed, world.seed);
  assert.throws(() => validateWorld({ version: 4 }));
  assert.throws(() => validateWorld({ ...world, player: { ...world.player, position: [NaN, 0, 0] } }));
});

test('expanded catalogue fits its atlas and preserves every original ID',()=>{
  assert.ok(BLOCKS.length>300);assert.ok(BLOCKS.length*2<=ATLAS_COLS*ATLAS_ROWS);
  assert.equal(BLOCKS[27].name,'TNT');assert.equal(BLOCKS[44].name,'Bedrock');assert.equal(BLOCKS[63].name,'Copper Block');
  assert.equal(BLOCKS[CONTENT.SIFT_PORTAL].name,'Sift Rift');assert.equal(BLOCKS[CONTENT.NOTE_C].note,0);
  assert.equal(new Set(BLOCKS.map(b=>b.name)).size,BLOCKS.length);
  for(const egg of BLOCKS.slice(SPAWN_EGG_START,EXTRA_START)){assert.ok(egg.spawn);assert.ok(MOBS[egg.spawn!]);assert.equal(egg.solid,false);}
});

test('16-bit chunks preserve IDs above 255 and portals have no cube faces',()=>{
  const id=SPAWN_EGG_START-7;assert.ok(id>255);
  const {data}=generateChunk(0,0,config,{'1,80,1':id});assert.equal(data[blockIndex(1,80,1)],id);
  const padded=new Uint16Array(PAD*PAD*HEIGHT);padded[paddedIndex(1,10,1)]=CONTENT.SIFT_PORTAL;assert.equal(meshChunk(padded).indices.length,0);
});

test('old worlds retain their original deterministic generation',()=>{
  const old=legacyChunk(-1,0,config,{}),current=generateChunk(-1,0,{...config,generationVersion:1},{});
  assert.deepEqual([...current.data],[...old.data]);
  const save=createWorld('Old World','old','creative','normal','normal');delete save.generationVersion;
  assert.equal(validateWorld(save).generationVersion,1);
});

test('winter creates snow and frozen shallows without replacing explicit edits',()=>{
  const winter=generateChunk(0,0,{...config,generationVersion:2,season:'Winter'},{'4,35,3':63});
  assert.ok(winter.data.some(id=>id===10));assert.equal(winter.data[blockIndex(4,35,3)],63);
  const summer=generateChunk(0,0,{...config,generationVersion:2,season:'Summer'},{});assert.notDeepEqual(winter.data,summer.data);
});

test('biome registry is varied and emergent cells remain deterministic',()=>{
  assert.ok(BIOMES.length>=32);const seen=new Set<string>();
  for(let x=-8000;x<=8000;x+=113)for(let z=-8000;z<=8000;z+=97){const a=biomeAt(x,z,config.seed,'overworld'),b=biomeAt(x,z,config.seed,'overworld');assert.deepEqual(a,b);seen.add(a.id);}
  assert.ok(seen.size>=BIOMES.length*0.75);assert.ok([...seen].some(id=>id.startsWith('emergent:')));
});

test('Nether has a ceiling and the End has true void gaps',()=>{
  const nether=generateChunk(0,0,{...config,dimension:'nether',generationVersion:2},{});
  assert.equal(nether.data[blockIndex(0,127,0)],44);assert.equal(nether.data[blockIndex(2,78,2)],0);
  const end=generateChunk(4,4,{...config,dimension:'end',generationVersion:2},{});assert.ok(end.data.every(id=>id===0));
});

test('ancient-city note order rejects mistakes and completes exactly once',()=>{
  let progress=0,completions=0;for(const note of RESONANCE_SEQUENCE){const next=advanceResonance(progress,note);progress=next.progress;completions+=Number(next.complete);}
  assert.equal(completions,1);assert.equal(progress,0);assert.equal(advanceResonance(2,3).progress,0);assert.equal(advanceResonance(3,0).progress,1);
});

test('Sift fluid and character data have real rules',()=>{
  assert.equal(fluidHazard('sift',0,0,1),4);assert.equal(fluidHazard('nether',0,0,1),6);
  const style=sanitizeCharacter({shirt:'#abcdef',skin:'javascript:alert(1)',name:'Nia',hairStyle:'long'});assert.equal(style.shirt,'#abcdef');assert.equal(style.name,'Nia');assert.ok(style.skin.startsWith('#'));assert.equal(style.hairStyle,'long');
});