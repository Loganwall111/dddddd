import { BlockId, BLOCKS, isBlock } from "../blocks/blocks";

export interface ItemStack {
  id: BlockId;
  count: number;
}

export const HOTBAR_SIZE = 9;
export const INV_ROWS = 3;
export const INV_COLS = 9;
export const INV_SIZE = HOTBAR_SIZE + INV_ROWS * INV_COLS; // 36

export class Inventory {
  slots: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  selectedHotbar: number = 0;
  // Crafting grid (always 3x3 for simplicity) + result
  craftSlots: (ItemStack | null)[] = new Array(9).fill(null);
  craftResult: ItemStack | null = null;
  // Creative inventory has all items by category; we just enable infinite access for creative mode.

  getSelected(): ItemStack | null { return this.slots[this.selectedHotbar]; }
  setSelectedSlot(i: number) { this.selectedHotbar = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE; }

  addItem(id: BlockId, count = 1): boolean {
    const def = BLOCKS[id]; if (!def) return false;
    // first add to existing stacks
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < def.stackMax) {
        const add = Math.min(def.stackMax - s.count, count);
        s.count += add; count -= add;
        if (count <= 0) return true;
      }
    }
    // fill empty slots
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        const add = Math.min(def.stackMax, count);
        this.slots[i] = { id, count: add };
        count -= add;
        if (count <= 0) return true;
      }
    }
    return count <= 0;
  }

  removeOne(idx: number) {
    const s = this.slots[idx]; if (!s) return;
    s.count--;
    if (s.count <= 0) this.slots[idx] = null;
  }
  countOf(id: BlockId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }
  tryConsume(id: BlockId, n = 1): boolean {
    if (this.countOf(id) < n) return false;
    let remain = n;
    for (let i = 0; i < this.slots.length && remain > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, remain);
        s.count -= take; remain -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  // Give starting items for game mode
  initCreative() {
    // empty — creative uses infinite palette, but hotbar has some quick picks
    this.slots = new Array(INV_SIZE).fill(null);
    const picks: BlockId[] = [
      BlockId.Grass, BlockId.Dirt, BlockId.Stone, BlockId.Wood, BlockId.Planks,
      BlockId.Cobblestone, BlockId.Glass, BlockId.Brick, BlockId.TNT,
    ];
    for (let i = 0; i < picks.length; i++) this.slots[i] = { id: picks[i], count: BLOCKS[picks[i]].stackMax };
  }
  initSurvival() {
    this.slots = new Array(INV_SIZE).fill(null);
    // No starting items (or give a small starter kit)
  }

  serialize(): SerializedInventory {
    return {
      selected: this.selectedHotbar,
      slots: this.slots.map(s => s ? [s.id, s.count] : null),
    };
  }
  load(data: SerializedInventory) {
    this.selectedHotbar = data.selected ?? 0;
    this.slots = data.slots.map(s => s ? { id: s[0], count: s[1] } : null);
    while (this.slots.length < INV_SIZE) this.slots.push(null);
  }

  // ---- Crafting ----
  // Recompute the craft result based on current craftSlots (shapeless multiset match).
  updateCraftResult() {
    this.craftResult = null;
    for (const recipe of RECIPES) {
      if (this.matches(recipe)) {
        this.craftResult = { id: recipe.output.id, count: recipe.output.count };
        return;
      }
    }
  }

  private matches(recipe: Recipe): boolean {
    const need = new Map<BlockId, number>();
    for (const ing of recipe.ingredients) need.set(ing.id, (need.get(ing.id)||0)+ing.count);
    const have = new Map<BlockId, number>();
    let placed = 0;
    for (const s of this.craftSlots) { if (s) { have.set(s.id, (have.get(s.id)||0)+s.count); placed += s.count; } }
    let needed = 0;
    for (const [, v] of need) needed += v;
    if (placed !== needed) return false; // exact match, no extra items
    for (const [k, v] of need) if ((have.get(k)||0) !== v) return false;
    return true;
  }

  // Take the craft result, consuming one "set" of ingredients.
  takeCraftResult(): ItemStack | null {
    if (!this.craftResult) return null;
    const recipe = RECIPES.find(r => r.output.id === this.craftResult!.id && r.output.count === this.craftResult!.count && this.matches(r));
    if (!recipe) return null;
    // consume ingredients
    const need = new Map<BlockId, number>();
    for (const ing of recipe.ingredients) need.set(ing.id, (need.get(ing.id)||0)+ing.count);
    for (const [k, v] of need) {
      let rem = v;
      for (let i = 0; i < this.craftSlots.length && rem > 0; i++) {
        const s = this.craftSlots[i]; if (!s || s.id !== k) continue;
        const take = Math.min(s.count, rem);
        s.count -= take; rem -= take;
        if (s.count <= 0) this.craftSlots[i] = null;
      }
    }
    const result = { ...this.craftResult };
    this.updateCraftResult();
    return result;
  }

  // Return craft grid items to the main inventory (when closing the UI)
  returnCraftGrid() {
    for (let i = 0; i < this.craftSlots.length; i++) {
      const s = this.craftSlots[i];
      if (s) { this.addItem(s.id, s.count); this.craftSlots[i] = null; }
    }
  }

  // Programmatic shapeless craft against an explicit input list.
  craft(inputs: (ItemStack | null)[], recipe: Recipe): ItemStack | null {
    return craftRecipe(inputs, recipe);
  }
}

export interface SerializedInventory {
  selected: number;
  slots: ([number, number] | null)[];
}

export interface Recipe {
  ingredients: { id: BlockId; count: number }[];
  output: { id: BlockId; count: number };
  name: string;
  size?: 2 | 3; // grid size required
}

// Programmatic/shapeless craft against an arbitrary input array (used by tests
// and future automation). Consumes ingredients in place and returns the output.
export function craftRecipe(inputs: (ItemStack | null)[], recipe: Recipe): ItemStack | null {
  const need = new Map<BlockId, number>();
  for (const ing of recipe.ingredients) need.set(ing.id, (need.get(ing.id) || 0) + ing.count);
  const have = new Map<BlockId, number>();
  for (const s of inputs) if (s) have.set(s.id, (have.get(s.id) || 0) + s.count);
  for (const [k, v] of need) if ((have.get(k) || 0) < v) return null;
  for (const [k, v] of need) {
    let rem = v;
    for (let i = 0; i < inputs.length && rem > 0; i++) {
      const s = inputs[i]; if (!s || s.id !== k) continue;
      const take = Math.min(s.count, rem);
      s.count -= take; rem -= take;
      if (s.count <= 0) inputs[i] = null;
    }
  }
  return { id: recipe.output.id, count: recipe.output.count };
}

export const RECIPES: Recipe[] = [
  { name: "Oak Planks", ingredients: [{ id: BlockId.Wood, count: 1 }], output: { id: BlockId.Planks, count: 4 } },
  { name: "Stick", ingredients: [{ id: BlockId.Planks, count: 2 }], output: { id: BlockId.Stick, count: 4 } },
  { name: "Crafting Table", ingredients: [{ id: BlockId.Planks, count: 4 }], output: { id: BlockId.CraftingTable, count: 1 }, size: 2 },
  { name: "Wooden Pickaxe", ingredients: [{ id: BlockId.Planks, count: 3 }, { id: BlockId.Stick, count: 2 }], output: { id: BlockId.PickaxeWood, count: 1 }, size: 3 },
  { name: "Wooden Sword", ingredients: [{ id: BlockId.Planks, count: 2 }, { id: BlockId.Stick, count: 1 }], output: { id: BlockId.SwordWood, count: 1 }, size: 3 },
  { name: "Stone Pickaxe", ingredients: [{ id: BlockId.Cobblestone, count: 3 }, { id: BlockId.Stick, count: 2 }], output: { id: BlockId.PickaxeStone, count: 1 }, size: 3 },
  { name: "Iron Pickaxe", ingredients: [{ id: BlockId.IronIngot, count: 3 }, { id: BlockId.Stick, count: 2 }], output: { id: BlockId.PickaxeIron, count: 1 }, size: 3 },
  { name: "Iron Sword", ingredients: [{ id: BlockId.IronIngot, count: 2 }, { id: BlockId.Stick, count: 1 }], output: { id: BlockId.SwordIron, count: 1 }, size: 3 },
  { name: "Furnace", ingredients: [{ id: BlockId.Cobblestone, count: 8 }], output: { id: BlockId.Furnace, count: 1 }, size: 3 },
  { name: "Chest", ingredients: [{ id: BlockId.Planks, count: 8 }], output: { id: BlockId.Chest, count: 1 }, size: 3 },
  { name: "Torch", ingredients: [{ id: BlockId.CoalOre, count: 1 }, { id: BlockId.Stick, count: 1 }], output: { id: BlockId.Torch, count: 4 }, size: 2 },
  { name: "Diamond Pickaxe", ingredients: [{ id: BlockId.DiamondOre, count: 3 }, { id: BlockId.Stick, count: 2 }], output: { id: BlockId.PickaxeDiamond, count: 1 }, size: 3 },
  { name: "TNT", ingredients: [{ id: BlockId.Sand, count: 4 }, { id: BlockId.CoalOre, count: 5 }], output: { id: BlockId.TNT, count: 1 }, size: 3 },
  { name: "Bricks", ingredients: [{ id: BlockId.Clay, count: 4 }], output: { id: BlockId.Brick, count: 4 }, size: 2 },
];

// ---- Smelting recipes (used by the Furnace) ----
export interface SmeltRecipe { input: BlockId; output: BlockId; count: number; name: string; }
export const SMELT_RECIPES: SmeltRecipe[] = [
  { input: BlockId.IronOre, output: BlockId.IronIngot, count: 1, name: "Iron Ingot" },
  { input: BlockId.GoldOre, output: BlockId.GoldIngot, count: 1, name: "Gold Ingot" },
  { input: BlockId.Sand, output: BlockId.Glass, count: 1, name: "Glass" },
  { input: BlockId.Cobblestone, output: BlockId.Stone, count: 1, name: "Stone" },
  { input: BlockId.Clay, output: BlockId.Brick, count: 1, name: "Brick" },
];

// Fuel burn times in seconds of smelt progress they provide
export const FUEL_TIMES: Partial<Record<BlockId, number>> = {
  [BlockId.CoalOre]: 40,
  [BlockId.Wood]: 15,
  [BlockId.Planks]: 10,
  [BlockId.Stick]: 5,
  [BlockId.Bookshelf]: 15,
};
export const SMELT_TIME = 8; // seconds to smelt one item

// Creative tab categories
export const CREATIVE_TABS: { id: string; label: string; items: BlockId[] }[] = [
  { id: "building", label: "Building", items: [
    BlockId.Grass, BlockId.Dirt, BlockId.Stone, BlockId.Cobblestone, BlockId.StoneBricks, BlockId.MossyCobble,
    BlockId.Sand, BlockId.Sandstone, BlockId.Gravel, BlockId.Clay,
    BlockId.Wood, BlockId.Planks, BlockId.BirchLog, BlockId.SpruceLog, BlockId.Leaves, BlockId.BirchLeaves, BlockId.SpruceLeaves,
    BlockId.Brick, BlockId.NetherBrick, BlockId.Wool, BlockId.Glass, BlockId.Snow, BlockId.Ice,
    BlockId.IronBlock, BlockId.GoldBlock, BlockId.DiamondBlock, BlockId.Obsidian, BlockId.Bedrock,
  ]},
  { id: "natural", label: "Natural", items: [
    BlockId.CoalOre, BlockId.IronOre, BlockId.GoldOre, BlockId.DiamondOre, BlockId.EmeraldOre, BlockId.RedstoneOre, BlockId.Quartz,
    BlockId.Cactus, BlockId.Pumpkin, BlockId.Melon, BlockId.Mushroom, BlockId.MushroomBrown, BlockId.TallGrass, BlockId.Flower, BlockId.FlowerYellow, BlockId.Bookshelf,
  ]},
  { id: "functional", label: "Functional", items: [
    BlockId.CraftingTable, BlockId.Furnace, BlockId.Chest, BlockId.Bed, BlockId.Torch, BlockId.Glowstone, BlockId.TNT, BlockId.Portal,
  ]},
  { id: "nether", label: "Nether", items: [
    BlockId.Netherrack, BlockId.SoulSand, BlockId.Glowstone, BlockId.Quartz, BlockId.NetherBrick, BlockId.Lava,
  ]},
  { id: "end", label: "End", items: [
    BlockId.EndStone, BlockId.EndPortalFrame,
  ]},
  { id: "tools", label: "Tools", items: [
    BlockId.PickaxeWood, BlockId.PickaxeStone, BlockId.PickaxeIron, BlockId.PickaxeDiamond,
    BlockId.SwordWood, BlockId.SwordIron, BlockId.Apple, BlockId.Bread, BlockId.Stick,
    BlockId.IronIngot, BlockId.GoldIngot, BlockId.Coal, BlockId.Diamond, BlockId.Emerald,
  ]},
];
