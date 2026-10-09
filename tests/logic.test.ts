// Unit tests for pure game logic. Run with: npx tsx tests/logic.test.ts
import assert from "node:assert/strict";
import { hash2, valueNoise2D, fbm2D, valueNoise3D, fbm3D } from "../src/world/noise";
import { BlockId, BLOCKS } from "../src/blocks/blocks";
import { Inventory, RECIPES, craftRecipe } from "../src/inventory/inventory";
import { FurnaceSystem, } from "../src/crafting/furnace";
import { SMELT_TIME } from "../src/inventory/inventory";
import { createEmptyChunk, getBlock, setBlock, CHUNK_SIZE, CHUNK_HEIGHT } from "../src/world/chunk";
import { generateChunk } from "../src/world/generator";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("noise");
test("hash2 is deterministic and bounded", () => {
  const a = hash2(3, 7, 42), b = hash2(3, 7, 42);
  assert.equal(a, b);
  assert.ok(a >= 0 && a <= 1);
});
test("valueNoise2D deterministic and in [0,1]", () => {
  for (let i = 0; i < 50; i++) {
    const v = valueNoise2D(i * 0.37, i * 0.91, 123);
    assert.ok(v >= 0 && v <= 1);
    assert.equal(v, valueNoise2D(i * 0.37, i * 0.91, 123));
  }
});
test("fbm2D stays in [0,1]", () => {
  for (let i = 0; i < 20; i++) {
    const v = fbm2D(i * 1.3, i * 0.7, 7, 4);
    assert.ok(v >= -0.0001 && v <= 1.0001);
  }
});
test("valueNoise3D/fbm3D deterministic", () => {
  assert.equal(valueNoise3D(1.5, 2.5, 3.5, 9), valueNoise3D(1.5, 2.5, 3.5, 9));
  assert.equal(fbm3D(4.2, 5.2, 6.2, 9), fbm3D(4.2, 5.2, 6.2, 9));
});

console.log("blocks registry");
test("all enumerated block ids have definitions", () => {
  for (const key of Object.keys(BlockId)) {
    const id = (BlockId as any)[key];
    if (typeof id !== "number") continue;
    if (id === 0) continue; // air
    assert.ok(BLOCKS[id], `missing def for BlockId.${key} (${id})`);
    assert.ok(BLOCKS[id].name, `missing name for BlockId.${key}`);
    assert.ok(BLOCKS[id].textures, `missing textures for BlockId.${key}`);
  }
});

console.log("chunk storage");
test("set/get block within bounds", () => {
  const c = createEmptyChunk(0, 0, "overworld");
  setBlock(c, 3, 64, 5, BlockId.Stone);
  assert.equal(getBlock(c, 3, 64, 5), BlockId.Stone);
});
test("out-of-bounds read returns air, write is ignored", () => {
  const c = createEmptyChunk(0, 0, "overworld");
  assert.equal(getBlock(c, -1, 0, 0), BlockId.Air);
  assert.equal(getBlock(c, 0, CHUNK_HEIGHT + 5, 0), BlockId.Air);
  setBlock(c, CHUNK_SIZE, 0, 0, BlockId.Stone); // should not throw
});

console.log("terrain generation");
test("generated overworld chunk has bedrock floor and stone", () => {
  const c = createEmptyChunk(0, 0, "overworld");
  generateChunk({ seed: 1337, worldType: "normal", dimension: "overworld" }, c);
  // bedrock at y=0 across the chunk
  assert.equal(getBlock(c, 0, 0, 0), BlockId.Bedrock);
  assert.equal(getBlock(c, 8, 0, 8), BlockId.Bedrock);
  // deep underground should be stone somewhere
  let foundStone = false;
  for (let y = 2; y < 40 && !foundStone; y++) {
    for (let x = 0; x < CHUNK_SIZE && !foundStone; x++)
      for (let z = 0; z < CHUNK_SIZE && !foundStone; z++)
        if (getBlock(c, x, y, z) === BlockId.Stone) foundStone = true;
  }
  assert.ok(foundStone, "expected stone underground");
  // top of the world is air
  assert.equal(getBlock(c, 8, CHUNK_HEIGHT - 1, 8), BlockId.Air);
});
test("generation is deterministic for same seed", () => {
  const cfg = { seed: 999, worldType: "normal" as const, dimension: "overworld" as const };
  const a = createEmptyChunk(2, 3, "overworld");
  const b = createEmptyChunk(2, 3, "overworld");
  generateChunk(cfg, a); generateChunk(cfg, b);
  for (let i = 0; i < a.blocks.length; i += 97) {
    assert.equal(a.blocks[i], b.blocks[i], `block mismatch at ${i}`);
  }
});
test("different seeds produce different terrain", () => {
  const a = createEmptyChunk(2, 3, "overworld");
  const b = createEmptyChunk(2, 3, "overworld");
  generateChunk({ seed: 1, worldType: "normal", dimension: "overworld" }, a);
  generateChunk({ seed: 2, worldType: "normal", dimension: "overworld" }, b);
  let diff = 0;
  for (let i = 0; i < a.blocks.length; i++) if (a.blocks[i] !== b.blocks[i]) diff++;
  assert.ok(diff > 0, "expected terrain differences between seeds");
});
test("nether chunk generates netherrack", () => {
  const c = createEmptyChunk(0, 0, "nether");
  generateChunk({ seed: 5, worldType: "normal", dimension: "nether" }, c);
  let found = false;
  for (let y = 1; y < 50 && !found; y++)
    if (getBlock(c, 8, y, 8) === BlockId.Netherrack) found = true;
  assert.ok(found, "expected netherrack in nether");
});
test("end chunk generates end stone on the main island", () => {
  const c = createEmptyChunk(0, 0, "end");
  generateChunk({ seed: 5, worldType: "normal", dimension: "end" }, c);
  let found = false;
  for (let y = 1; y < CHUNK_HEIGHT && !found; y++)
    if (getBlock(c, 8, y, 8) === BlockId.EndStone) found = true;
  assert.ok(found, "expected end stone at end island center");
});

console.log("inventory");
test("addItem stacks and respects max stack", () => {
  const inv = new Inventory();
  assert.ok(inv.addItem(BlockId.Dirt, 100));
  assert.equal(inv.countOf(BlockId.Dirt), 100);
  // 100 dirt = 64 + 36 across slots
  assert.ok(inv.slots[0]!.count <= 64);
});
test("tryConsume removes correct amount", () => {
  const inv = new Inventory();
  inv.addItem(BlockId.Planks, 10);
  assert.ok(inv.tryConsume(BlockId.Planks, 4));
  assert.equal(inv.countOf(BlockId.Planks), 6);
  assert.ok(!inv.tryConsume(BlockId.Planks, 100));
  assert.equal(inv.countOf(BlockId.Planks), 6); // unchanged on failure
});
test("crafting planks from wood works", () => {
  const inv = new Inventory();
  const recipe = RECIPES.find(r => r.name === "Oak Planks")!;
  const inputs = [{ id: BlockId.Wood, count: 1 }];
  const out = inv.craft(inputs as any, recipe);
  assert.ok(out);
  assert.equal(out!.id, BlockId.Planks);
  assert.equal(out!.count, 4);
});
test("crafting fails without ingredients", () => {
  const inv = new Inventory();
  const recipe = RECIPES.find(r => r.name === "Oak Planks")!;
  const out = inv.craft([] as any, recipe);
  assert.equal(out, null);
});
test("craft grid multiset match + take result", () => {
  const inv = new Inventory();
  inv.craftSlots[0] = { id: BlockId.Wood, count: 1 };
  inv.updateCraftResult();
  assert.ok(inv.craftResult, "expected planks result from 1 wood");
  assert.equal(inv.craftResult!.id, BlockId.Planks);
  const taken = inv.takeCraftResult();
  assert.ok(taken);
  assert.equal(inv.craftSlots[0], null, "wood consumed");
});
test("craft grid rejects extra items", () => {
  const inv = new Inventory();
  inv.craftSlots[0] = { id: BlockId.Wood, count: 1 };
  inv.craftSlots[1] = { id: BlockId.Dirt, count: 1 };
  inv.updateCraftResult();
  assert.equal(inv.craftResult, null);
});

console.log("furnace");
test("furnace smelts iron ore with coal fuel over time", () => {
  const f = new FurnaceSystem();
  const st = f.get(0, 0, 0);
  st.input = { id: BlockId.IronOre, count: 1 };
  st.fuel = { id: BlockId.CoalOre, count: 1 };
  // simulate time
  for (let t = 0; t < SMELT_TIME + 1; t += 0.5) f.update(0.5);
  assert.ok(st.output, "expected output after smelting");
  assert.equal(st.output!.id, BlockId.IronIngot);
  assert.equal(st.input, null, "input consumed");
});
test("furnace does not smelt without fuel", () => {
  const f = new FurnaceSystem();
  const st = f.get(1, 1, 1);
  st.input = { id: BlockId.IronOre, count: 1 };
  for (let t = 0; t < SMELT_TIME + 1; t += 0.5) f.update(0.5);
  assert.equal(st.output, null);
});
test("furnace does not smelt non-smeltable input", () => {
  const f = new FurnaceSystem();
  const st = f.get(2, 2, 2);
  st.input = { id: BlockId.Dirt, count: 1 };
  st.fuel = { id: BlockId.CoalOre, count: 1 };
  for (let t = 0; t < SMELT_TIME + 1; t += 0.5) f.update(0.5);
  assert.equal(st.output, null);
});
test("furnace consumes fuel and stops when exhausted", () => {
  const f = new FurnaceSystem();
  const st = f.get(3, 3, 3);
  st.input = { id: BlockId.Sand, count: 64 };
  st.fuel = { id: BlockId.Stick, count: 1 }; // 5 seconds of burn
  f.update(6); // burn all fuel
  assert.equal(st.fuel, null, "fuel consumed");
  const progressAtStop = st.progress;
  f.update(5); // no fuel left -> progress decays or stays, no new smelt beyond one
  assert.ok(st.progress <= progressAtStop + 0.001 || st.output, "no progress without fuel");
});

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
