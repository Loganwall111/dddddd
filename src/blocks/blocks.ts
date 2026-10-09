// Block type registry. Each block has an id, name, and material properties.
// Face texture indices map to a texture atlas generated at runtime.

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Gravel = 5,
  Wood = 6,      // log (bark)
  Planks = 7,
  Leaves = 8,
  Water = 9,
  Bedrock = 10,
  Cobblestone = 11,
  CoalOre = 12,
  IronOre = 13,
  GoldOre = 14,
  DiamondOre = 15,
  Glass = 16,
  Brick = 17,
  Snow = 18,
  Ice = 19,
  Lava = 20,
  Obsidian = 21,
  Netherrack = 22,
  SoulSand = 23,
  Glowstone = 24,
  EndStone = 25,
  EndPortalFrame = 26,
  TNT = 27,
  Bookshelf = 28,
  CraftingTable = 29,
  Furnace = 30,
  Chest = 31,
  Torch = 32,
  Mushroom = 33,
  Cactus = 34,
  Pumpkin = 35,
  TallGrass = 36,
  Flower = 37,
  Portal = 38,         // nether portal
  Bed = 39,
  Wool = 40,
  Clay = 41,
  RedstoneOre = 42,
  EmeraldOre = 43,
  Quartz = 44,
  EndPortal = 45,      // active end portal surface (transports to the End)
  // biome & building variety
  BirchLog = 46,
  BirchLeaves = 47,
  SpruceLog = 48,
  SpruceLeaves = 49,
  StoneBricks = 50,
  MossyCobble = 51,
  IronBlock = 52,
  GoldBlock = 53,
  DiamondBlock = 54,
  NetherBrick = 55,
  Melon = 56,
  MushroomBrown = 57,
  FlowerYellow = 58,
  Sandstone = 59,
  // items-as-blocks placeholders for hotbar completeness
  PickaxeWood = 60,
  PickaxeStone = 61,
  PickaxeIron = 62,
  PickaxeDiamond = 63,
  SwordWood = 64,
  SwordIron = 65,
  Apple = 66,
  Bread = 67,
  Stick = 68,
  IronIngot = 69,
  GoldIngot = 70,
  Coal = 71,
  Diamond = 72,
  Emerald = 73,
}

export type BlockFace = "top" | "bottom" | "side" | "all";

export interface BlockDef {
  id: BlockId;
  name: string;
  solid: boolean;         // collidable + fills cube (mostly)
  opaque: boolean;        // culls neighbor faces
  transparent: boolean;   // alpha/discard/etc
  liquid: boolean;
  emissive: number;       // 0..1 light level
  hardness: number;       // seconds to break w/ fist; 0 = instant
  tool?: "pickaxe" | "axe" | "shovel" | "sword" | "none";
  toolTier?: number;      // min tool tier (0 wood,1 stone,2 iron,3 diamond)
  blastResistance: number;
  drops?: BlockId;        // default to self
  stackMax: number;
  // face indices into atlas: [top, bottom, side] or all 6 if "all" is set
  textures: Partial<Record<BlockFace, number>> & { all?: number };
  floatInCreative?: boolean; // non-block item icon (tools, food)
  color?: [number, number, number]; // tint multiplier, 0..1
}

export const BLOCKS: Record<number, BlockDef> = {};

function def(d: BlockDef) { BLOCKS[d.id] = d; return d; }

// Texture atlas index positions (each 16x16 tile, generated in code).
// Order matters! Must match generateBlockAtlas() in textureGen.ts
export const T = {
  grass_top: 0,
  grass_side: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  gravel: 5,
  wood_side: 6,
  wood_top: 7,
  planks: 8,
  leaves: 9,
  water: 10,
  bedrock: 11,
  cobble: 12,
  coal_ore: 13,
  iron_ore: 14,
  gold_ore: 15,
  diamond_ore: 16,
  glass: 17,
  brick: 18,
  snow: 19,
  ice: 20,
  lava: 21,
  obsidian: 22,
  netherrack: 23,
  soul_sand: 24,
  glowstone: 25,
  end_stone: 26,
  end_frame: 27,
  tnt_side: 28,
  tnt_top: 29,
  tnt_bottom: 30,
  bookshelf: 31,
  craft_top: 32,
  craft_side: 33,
  craft_front: 34,
  furnace_side: 35,
  furnace_front: 36,
  chest: 37,
  torch: 38,
  mushroom_red: 39,
  mushroom_brown: 40,
  cactus_side: 41,
  cactus_top: 42,
  pumpkin_side: 43,
  pumpkin_top: 44,
  tallgrass: 45,
  flower_rose: 46,
  flower_dandelion: 47,
  portal: 48,
  bed_top: 49,
  bed_side: 50,
  bed_end: 51,
  wool_white: 52,
  clay: 53,
  redstone_ore: 54,
  emerald_ore: 55,
  quartz: 56,
  end_portal: 57,
  birch_side: 91,
  birch_top: 92,
  birch_leaves: 93,
  spruce_side: 94,
  spruce_top: 95,
  spruce_leaves: 96,
  stone_bricks: 97,
  mossy_cobble: 98,
  iron_block: 99,
  gold_block: 100,
  diamond_block: 101,
  nether_brick: 102,
  melon_side: 103,
  melon_top: 104,
  sandstone: 105,
  // items
  item_coal: 106,
  item_diamond: 107,
  item_emerald: 108,
  item_pickaxe_wood: 80,
  item_pickaxe_stone: 81,
  item_pickaxe_iron: 82,
  item_pickaxe_diamond: 83,
  item_sword_wood: 84,
  item_sword_iron: 85,
  item_apple: 86,
  item_bread: 87,
  item_stick: 88,
  item_ingot_iron: 89,
  item_ingot_gold: 90,
};

// ---- Block definitions ----
def({ id: BlockId.Grass, name: "Grass Block", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.6, tool: "shovel", blastResistance: 0.6, stackMax: 64,
  textures: { top: T.grass_top, bottom: T.dirt, side: T.grass_side } });

def({ id: BlockId.Dirt, name: "Dirt", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.5, tool: "shovel", blastResistance: 0.5, stackMax: 64, textures: { all: T.dirt } });

def({ id: BlockId.Stone, name: "Stone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 1.5, tool: "pickaxe", toolTier: 0, blastResistance: 6, drops: BlockId.Cobblestone, stackMax: 64, textures: { all: T.stone } });

def({ id: BlockId.Sand, name: "Sand", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.5, tool: "shovel", blastResistance: 0.5, stackMax: 64, textures: { all: T.sand } });

def({ id: BlockId.Gravel, name: "Gravel", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.6, tool: "shovel", blastResistance: 0.6, stackMax: 64, textures: { all: T.gravel } });

def({ id: BlockId.Wood, name: "Oak Log", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "axe", blastResistance: 2, stackMax: 64, textures: { top: T.wood_top, bottom: T.wood_top, side: T.wood_side } });

def({ id: BlockId.Planks, name: "Oak Planks", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "axe", blastResistance: 3, stackMax: 64, textures: { all: T.planks } });

def({ id: BlockId.Leaves, name: "Oak Leaves", solid: true, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0.2, blastResistance: 0.2, stackMax: 64, textures: { all: T.leaves } });

def({ id: BlockId.Water, name: "Water", solid: false, opaque: false, transparent: true, liquid: true, emissive: 0.05,
  hardness: 100, blastResistance: 100, stackMax: 1, textures: { all: T.water }, color: [0.25, 0.45, 0.9] });

def({ id: BlockId.Bedrock, name: "Bedrock", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: -1, blastResistance: 3600000, stackMax: 64, textures: { all: T.bedrock } });

def({ id: BlockId.Cobblestone, name: "Cobblestone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "pickaxe", toolTier: 0, blastResistance: 6, stackMax: 64, textures: { all: T.cobble } });

def({ id: BlockId.CoalOre, name: "Coal Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 0, blastResistance: 3, stackMax: 64, drops: BlockId.Coal, textures: { all: T.coal_ore } });

def({ id: BlockId.IronOre, name: "Iron Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 1, blastResistance: 3, stackMax: 64, textures: { all: T.iron_ore } });

def({ id: BlockId.GoldOre, name: "Gold Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 2, blastResistance: 3, stackMax: 64, textures: { all: T.gold_ore } });

def({ id: BlockId.DiamondOre, name: "Diamond Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0.1,
  hardness: 3, tool: "pickaxe", toolTier: 2, blastResistance: 3, stackMax: 64, drops: BlockId.Diamond, textures: { all: T.diamond_ore } });

def({ id: BlockId.Glass, name: "Glass", solid: true, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0.3, blastResistance: 0.3, stackMax: 64, textures: { all: T.glass } });

def({ id: BlockId.Brick, name: "Bricks", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "pickaxe", blastResistance: 6, stackMax: 64, textures: { all: T.brick } });

def({ id: BlockId.Snow, name: "Snow", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.2, tool: "shovel", blastResistance: 0.2, stackMax: 64, textures: { all: T.snow } });

def({ id: BlockId.Ice, name: "Ice", solid: true, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0.5, tool: "pickaxe", blastResistance: 0.5, stackMax: 64, textures: { all: T.ice }, color: [0.65,0.8,1.0] });

def({ id: BlockId.Lava, name: "Lava", solid: false, opaque: false, transparent: false, liquid: true, emissive: 1,
  hardness: 100, blastResistance: 100, stackMax: 1, textures: { all: T.lava } });

def({ id: BlockId.Obsidian, name: "Obsidian", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 50, tool: "pickaxe", toolTier: 3, blastResistance: 1200, stackMax: 64, textures: { all: T.obsidian } });

def({ id: BlockId.Netherrack, name: "Netherrack", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.4, tool: "pickaxe", blastResistance: 0.4, stackMax: 64, textures: { all: T.netherrack } });

def({ id: BlockId.SoulSand, name: "Soul Sand", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.5, tool: "shovel", blastResistance: 0.5, stackMax: 64, textures: { all: T.soul_sand } });

def({ id: BlockId.Glowstone, name: "Glowstone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 1,
  hardness: 0.3, blastResistance: 0.3, stackMax: 64, textures: { all: T.glowstone } });

def({ id: BlockId.EndStone, name: "End Stone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", blastResistance: 9, stackMax: 64, textures: { all: T.end_stone } });

def({ id: BlockId.EndPortalFrame, name: "End Portal Frame", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0.5,
  hardness: -1, blastResistance: 3600000, stackMax: 64, textures: { top: T.end_frame, bottom: T.end_frame, side: T.end_frame } });

def({ id: BlockId.TNT, name: "TNT", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64,
  textures: { top: T.tnt_top, bottom: T.tnt_bottom, side: T.tnt_side } });

def({ id: BlockId.Bookshelf, name: "Bookshelf", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 1.5, tool: "axe", blastResistance: 1.5, stackMax: 64, textures: { top: T.planks, bottom: T.planks, side: T.bookshelf } });

def({ id: BlockId.CraftingTable, name: "Crafting Table", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2.5, tool: "axe", blastResistance: 2.5, stackMax: 64,
  textures: { top: T.craft_top, bottom: T.planks, side: T.craft_side } });

def({ id: BlockId.Furnace, name: "Furnace", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3.5, tool: "pickaxe", blastResistance: 6, stackMax: 64,
  textures: { top: T.furnace_side, bottom: T.furnace_side, side: T.furnace_side } });

def({ id: BlockId.Chest, name: "Chest", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2.5, tool: "axe", blastResistance: 2.5, stackMax: 64, textures: { all: T.chest } });

def({ id: BlockId.Torch, name: "Torch", solid: false, opaque: false, transparent: true, liquid: false, emissive: 1,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.torch } });

def({ id: BlockId.Mushroom, name: "Mushroom", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.mushroom_red } });

def({ id: BlockId.Cactus, name: "Cactus", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.4, blastResistance: 0.4, stackMax: 64, textures: { top: T.cactus_top, bottom: T.cactus_top, side: T.cactus_side } });

def({ id: BlockId.Pumpkin, name: "Pumpkin", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 1, tool: "axe", blastResistance: 1, stackMax: 64, textures: { top: T.pumpkin_top, bottom: T.pumpkin_top, side: T.pumpkin_side } });

def({ id: BlockId.TallGrass, name: "Tall Grass", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.tallgrass } });

def({ id: BlockId.Flower, name: "Flower", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.flower_rose } });

def({ id: BlockId.Portal, name: "Nether Portal", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0.8,
  hardness: -1, blastResistance: 3600000, stackMax: 1, textures: { all: T.portal } });
def({ id: BlockId.EndPortal, name: "End Portal", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0.8,
  hardness: -1, blastResistance: 3600000, stackMax: 1, textures: { all: T.end_portal } });

def({ id: BlockId.Bed, name: "Bed", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.2, blastResistance: 0.2, stackMax: 1, textures: { top: T.bed_top, bottom: T.planks, side: T.bed_side } });

def({ id: BlockId.Wool, name: "White Wool", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.8, blastResistance: 0.8, stackMax: 64, textures: { all: T.wool_white } });

def({ id: BlockId.Clay, name: "Clay", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.6, tool: "shovel", blastResistance: 0.6, stackMax: 64, textures: { all: T.clay } });

def({ id: BlockId.RedstoneOre, name: "Redstone Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 2, blastResistance: 3, stackMax: 64, textures: { all: T.redstone_ore } });

def({ id: BlockId.EmeraldOre, name: "Emerald Ore", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 2, blastResistance: 3, stackMax: 64, drops: BlockId.Emerald, textures: { all: T.emerald_ore } });

def({ id: BlockId.Quartz, name: "Nether Quartz", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.8, tool: "pickaxe", blastResistance: 0.8, stackMax: 64, textures: { all: T.quartz } });
def({ id: BlockId.BirchLog, name: "Birch Log", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "axe", blastResistance: 2, stackMax: 64, textures: { top: T.birch_top, bottom: T.birch_top, side: T.birch_side } });
def({ id: BlockId.BirchLeaves, name: "Birch Leaves", solid: true, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0.2, blastResistance: 0.2, stackMax: 64, textures: { all: T.birch_leaves } });
def({ id: BlockId.SpruceLog, name: "Spruce Log", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "axe", blastResistance: 2, stackMax: 64, textures: { top: T.spruce_top, bottom: T.spruce_top, side: T.spruce_side } });
def({ id: BlockId.SpruceLeaves, name: "Spruce Leaves", solid: true, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0.2, blastResistance: 0.2, stackMax: 64, textures: { all: T.spruce_leaves } });
def({ id: BlockId.StoneBricks, name: "Stone Bricks", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 1.5, tool: "pickaxe", toolTier: 0, blastResistance: 6, stackMax: 64, textures: { all: T.stone_bricks } });
def({ id: BlockId.MossyCobble, name: "Mossy Cobblestone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "pickaxe", toolTier: 0, blastResistance: 6, stackMax: 64, textures: { all: T.mossy_cobble } });
def({ id: BlockId.IronBlock, name: "Block of Iron", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 5, tool: "pickaxe", toolTier: 1, blastResistance: 6, stackMax: 64, textures: { all: T.iron_block } });
def({ id: BlockId.GoldBlock, name: "Block of Gold", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 3, tool: "pickaxe", toolTier: 2, blastResistance: 6, stackMax: 64, textures: { all: T.gold_block } });
def({ id: BlockId.DiamondBlock, name: "Block of Diamond", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0.1,
  hardness: 5, tool: "pickaxe", toolTier: 2, blastResistance: 6, stackMax: 64, textures: { all: T.diamond_block } });
def({ id: BlockId.NetherBrick, name: "Nether Bricks", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 2, tool: "pickaxe", toolTier: 0, blastResistance: 6, stackMax: 64, textures: { all: T.nether_brick } });
def({ id: BlockId.Melon, name: "Melon", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 1, tool: "axe", blastResistance: 1, stackMax: 64, textures: { top: T.melon_top, bottom: T.melon_top, side: T.melon_side } });
def({ id: BlockId.MushroomBrown, name: "Brown Mushroom", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.mushroom_brown } });
def({ id: BlockId.FlowerYellow, name: "Dandelion", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.flower_dandelion } });
def({ id: BlockId.Sandstone, name: "Sandstone", solid: true, opaque: true, transparent: false, liquid: false, emissive: 0,
  hardness: 0.8, tool: "pickaxe", toolTier: 0, blastResistance: 0.8, stackMax: 64, textures: { all: T.sandstone } });

// ---- Items (floatInCreative for inventory) ----
def({ id: BlockId.PickaxeWood, name: "Wooden Pickaxe", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_pickaxe_wood }, floatInCreative: true });
def({ id: BlockId.PickaxeStone, name: "Stone Pickaxe", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_pickaxe_stone }, floatInCreative: true });
def({ id: BlockId.PickaxeIron, name: "Iron Pickaxe", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_pickaxe_iron }, floatInCreative: true });
def({ id: BlockId.PickaxeDiamond, name: "Diamond Pickaxe", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_pickaxe_diamond }, floatInCreative: true });
def({ id: BlockId.SwordWood, name: "Wooden Sword", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_sword_wood }, floatInCreative: true });
def({ id: BlockId.SwordIron, name: "Iron Sword", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 1, textures: { all: T.item_sword_iron }, floatInCreative: true });
def({ id: BlockId.Apple, name: "Apple", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_apple }, floatInCreative: true });
def({ id: BlockId.Bread, name: "Bread", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_bread }, floatInCreative: true });
def({ id: BlockId.Stick, name: "Stick", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_stick }, floatInCreative: true });
def({ id: BlockId.IronIngot, name: "Iron Ingot", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_ingot_iron }, floatInCreative: true });
def({ id: BlockId.GoldIngot, name: "Gold Ingot", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_ingot_gold }, floatInCreative: true });
def({ id: BlockId.Coal, name: "Coal", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_coal }, floatInCreative: true });
def({ id: BlockId.Diamond, name: "Diamond", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_diamond }, floatInCreative: true });
def({ id: BlockId.Emerald, name: "Emerald", solid: false, opaque: false, transparent: true, liquid: false, emissive: 0,
  hardness: 0, blastResistance: 0, stackMax: 64, textures: { all: T.item_emerald }, floatInCreative: true });

// Helper: get face texture index
export function getFaceTex(block: BlockDef, face: "top" | "bottom" | "side"): number {
  if (block.textures.all !== undefined) return block.textures.all;
  const v = block.textures[face];
  if (v !== undefined) return v;
  return block.textures.side ?? block.textures.all ?? 0;
}

export function isBlock(item: BlockId): boolean {
  const b = BLOCKS[item];
  return !!b && !b.floatInCreative && item !== BlockId.Air;
}
