import { MOBS } from '../entities/registry';
export type Category = 'Building' | 'Natural' | 'Functional' | 'Equipment' | 'Food' | 'Otherworld' | 'Spawn Eggs' | 'Procedural';
export interface BlockDef {
  id: number; name: string; color: string; top?: string; category: Category;
  texture: 'grass' | 'stone' | 'dirt' | 'wood' | 'plank' | 'leaf' | 'brick' | 'ore' | 'plain' | 'glass' | 'tnt' | 'glow' | 'tool' | 'food' | 'mushroom' | 'bone' | 'metal' | 'rune' | 'egg';
  solid: boolean; hardness: number; resistance: number;
  drop?: number; emissive?: boolean; tool?: 'pickaxe' | 'axe' | 'sword' | 'igniter';
  speed?: number; durability?: number; nutrition?: number; armor?: number;
  roughness?: number; metallic?: number; spawn?: string; note?: number;
  portal?: boolean; mirror?: boolean; procedural?: boolean;
}
const defs: Omit<BlockDef, 'id'>[] = [
  { name: 'Air', color: '#ffffff', category: 'Natural', texture: 'plain', solid: false, hardness: 0, resistance: 0 },
  { name: 'Meadow Grass', color: '#786048', top: '#769750', category: 'Natural', texture: 'grass', solid: true, hardness: .65, resistance: 1, drop: 2 },
  { name: 'Earth', color: '#806046', category: 'Natural', texture: 'dirt', solid: true, hardness: .55, resistance: 1 },
  { name: 'Limestone', color: '#92978c', category: 'Building', texture: 'stone', solid: true, hardness: 1.6, resistance: 4 },
  { name: 'River Sand', color: '#d9cb9b', category: 'Natural', texture: 'dirt', solid: true, hardness: .5, resistance: .6 },
  { name: 'Cedar Log', color: '#685039', top: '#b59868', category: 'Natural', texture: 'wood', solid: true, hardness: 1.3, resistance: 2 },
  { name: 'Cedar Leaves', color: '#486e3d', category: 'Natural', texture: 'leaf', solid: true, hardness: .2, resistance: .2 },
  { name: 'Cedar Planks', color: '#b19160', category: 'Building', texture: 'plank', solid: true, hardness: 1, resistance: 2 },
  { name: 'Cut Stone', color: '#999e95', category: 'Building', texture: 'brick', solid: true, hardness: 1.6, resistance: 4 },
  { name: 'Clear Glass', color: '#add9d2', category: 'Building', texture: 'glass', solid: true, hardness: .35, resistance: .3 },
  { name: 'Snow', color: '#e0e9e3', category: 'Natural', texture: 'dirt', solid: true, hardness: .3, resistance: .4 },
  { name: 'Copper Ore', color: '#8b948b', top: '#c58958', category: 'Natural', texture: 'ore', solid: true, hardness: 2.2, resistance: 4 },
  { name: 'Iron Ore', color: '#858e89', top: '#c2a18a', category: 'Natural', texture: 'ore', solid: true, hardness: 2.5, resistance: 4 },
  { name: 'Coal Ore', color: '#8b9189', top: '#3b3f3c', category: 'Natural', texture: 'ore', solid: true, hardness: 1.8, resistance: 3, drop: 45 },
  { name: 'Gold Ore', color: '#85938a', top: '#e5bc55', category: 'Natural', texture: 'ore', solid: true, hardness: 2.8, resistance: 5 },
  { name: 'Azure Ore', color: '#647e81', top: '#69d9dc', category: 'Natural', texture: 'ore', solid: true, hardness: 3.2, resistance: 5 },
  { name: 'Terracotta', color: '#b77656', category: 'Building', texture: 'plain', solid: true, hardness: 1, resistance: 2 },
  { name: 'Red Brick', color: '#ad6d57', category: 'Building', texture: 'brick', solid: true, hardness: 1.5, resistance: 3 },
  { name: 'Birch Log', color: '#d8d4bd', top: '#baa87a', category: 'Natural', texture: 'wood', solid: true, hardness: 1.2, resistance: 2 },
  { name: 'Birch Planks', color: '#d6c59a', category: 'Building', texture: 'plank', solid: true, hardness: 1, resistance: 2 },
  { name: 'Cherry Leaves', color: '#c28d99', category: 'Natural', texture: 'leaf', solid: true, hardness: .2, resistance: .2 },
  { name: 'Mossy Stone', color: '#7d8b67', category: 'Building', texture: 'brick', solid: true, hardness: 1.5, resistance: 3 },
  { name: 'Basalt', color: '#4d5257', category: 'Building', texture: 'stone', solid: true, hardness: 2.4, resistance: 6 },
  { name: 'Crafting Bench', color: '#9f7750', top: '#c7a473', category: 'Functional', texture: 'plank', solid: true, hardness: 1.3, resistance: 2 },
  { name: 'Furnace', color: '#676d6b', category: 'Functional', texture: 'brick', solid: true, hardness: 2, resistance: 6 },
  { name: 'Obsidian', color: '#36303f', category: 'Otherworld', texture: 'stone', solid: true, hardness: 6, resistance: 99 },
  { name: 'Rift Portal', color: '#aa6cde', category: 'Otherworld', texture: 'glow', solid: false, hardness: .5, resistance: 99, emissive: true },
  { name: 'TNT', color: '#c5684c', top: '#d69c74', category: 'Functional', texture: 'tnt', solid: true, hardness: .2, resistance: .2 },
  { name: 'Amber Lantern', color: '#d4b371', category: 'Functional', texture: 'glow', solid: true, hardness: .5, resistance: .4, emissive: true },
  { name: 'Storage Chest', color: '#a77c44', top: '#bc8d50', category: 'Functional', texture: 'plank', solid: true, hardness: 1.2, resistance: 2 },
  { name: 'Crimson Rock', color: '#7e3f40', category: 'Otherworld', texture: 'stone', solid: true, hardness: 1.1, resistance: 2 },
  { name: 'Magma', color: '#f28b40', category: 'Otherworld', texture: 'glow', solid: true, hardness: 1.5, resistance: 3, emissive: true },
  { name: 'Soul Sand', color: '#665454', category: 'Otherworld', texture: 'dirt', solid: true, hardness: .6, resistance: 1 },
  { name: 'Pale Endstone', color: '#c6c69f', category: 'Otherworld', texture: 'stone', solid: true, hardness: 2, resistance: 5 },
  { name: 'Violet Crystal', color: '#b28ad2', category: 'Otherworld', texture: 'glow', solid: true, hardness: 2, resistance: 3, emissive: true },
  { name: 'Celestite', color: '#74c9ca', category: 'Otherworld', texture: 'glow', solid: true, hardness: 2, resistance: 3, emissive: true },
  { name: 'Packed Ice', color: '#99c5d1', category: 'Natural', texture: 'glass', solid: true, hardness: .65, resistance: 1 },
  { name: 'Sandstone', color: '#cebd8d', category: 'Building', texture: 'brick', solid: true, hardness: 1.4, resistance: 3 },
  { name: 'Gravel', color: '#908b80', category: 'Natural', texture: 'stone', solid: true, hardness: .5, resistance: 1 },
  { name: 'Forest Moss', color: '#637b42', category: 'Natural', texture: 'leaf', solid: true, hardness: .4, resistance: .5 },
  { name: 'White Wool', color: '#e4dfcb', category: 'Building', texture: 'plain', solid: true, hardness: .4, resistance: .5 },
  { name: 'Sage Wool', color: '#87966e', category: 'Building', texture: 'plain', solid: true, hardness: .4, resistance: .5 },
  { name: 'Ochre Wool', color: '#c7a34e', category: 'Building', texture: 'plain', solid: true, hardness: .4, resistance: .5 },
  { name: 'Midnight Wool', color: '#445369', category: 'Building', texture: 'plain', solid: true, hardness: .4, resistance: .5 },
  { name: 'Bedrock', color: '#3e4545', category: 'Natural', texture: 'stone', solid: true, hardness: 9999, resistance: 9999 },
  { name: 'Coal', color: '#414746', category: 'Equipment', texture: 'plain', solid: false, hardness: 0, resistance: 0 },
  { name: 'Iron Ingot', color: '#c8d0c8', category: 'Equipment', texture: 'plain', solid: false, hardness: 0, resistance: 0 },
  { name: 'Gold Ingot', color: '#e1bc62', category: 'Equipment', texture: 'plain', solid: false, hardness: 0, resistance: 0 },
  { name: 'Wooden Pickaxe', color: '#c49962', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'pickaxe', speed: 2, durability: 65 },
  { name: 'Stone Pickaxe', color: '#a1aaa2', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'pickaxe', speed: 3.5, durability: 160 },
  { name: 'Iron Pickaxe', color: '#d1dbd6', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'pickaxe', speed: 5.5, durability: 420 },
  { name: 'Azure Pickaxe', color: '#6fd8d3', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'pickaxe', speed: 9, durability: 1300 },
  { name: 'Iron Axe', color: '#c4d0cc', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'axe', speed: 5, durability: 350 },
  { name: 'Iron Sword', color: '#d1d9d5', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'sword', speed: 7, durability: 450 },
  { name: 'Firestarter', color: '#b9b8a1', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, tool: 'igniter', durability: 100 },
  { name: 'Orchard Apple', color: '#cb6453', category: 'Food', texture: 'food', solid: false, hardness: 0, resistance: 0, nutrition: 5 },
  { name: 'Fresh Bread', color: '#d3aa66', category: 'Food', texture: 'food', solid: false, hardness: 0, resistance: 0, nutrition: 7 },
  { name: 'Raw Meat', color: '#c88778', category: 'Food', texture: 'food', solid: false, hardness: 0, resistance: 0, nutrition: 2 },
  { name: 'Cooked Meat', color: '#ab7850', category: 'Food', texture: 'food', solid: false, hardness: 0, resistance: 0, nutrition: 9 },
  { name: 'Stick', color: '#ae8e5f', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0 },
  { name: 'Iron Helmet', color: '#b8c5c0', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, armor: 2 },
  { name: 'Iron Chestplate', color: '#b8c5c0', category: 'Equipment', texture: 'tool', solid: false, hardness: 0, resistance: 0, armor: 5 },
  { name: 'Rose Quartz', color: '#d1a4b0', category: 'Otherworld', texture: 'glow', solid: true, hardness: 2, resistance: 3, emissive: true },
  { name: 'Copper Block', color: '#b17d58', category: 'Building', texture: 'brick', solid: true, hardness: 2.5, resistance: 5 },
];
export const CONTENT = {
  MYCELIUM: 64, MUSHROOM_RED: 65, MUSHROOM_BROWN: 66, MUSHROOM_STEM: 67, TOXIC_SOIL: 68, BONE: 69, SCULK: 70,
  DEEPSLATE: 71, ANCIENT_FRAME: 72, SIFT_GRASS: 73, SIFT_CRIMSON: 74, CHROMIUM: 75, SIFT_LOG: 76,
  SIFT_LEAF: 77, MIRROR: 78, NOTE_C: 79, NOTE_E: 80, NOTE_G: 81, NOTE_B: 82, SIFT_PORTAL: 83,
  RIFT_KEY: 84, BLACKSTONE: 85, WARPED_STEM: 86, WARPED_CANOPY: 87, CRIMSON_STEM: 88, CRIMSON_CANOPY: 89,
  PURPUR: 90, CHORUS: 91, END_FRAME: 92, CORAL: 93, KELP: 94, MARBLE: 95,
  MUD: 96, CLAY: 97, RED_SAND: 98, CACTUS: 99, AZALEA: 100, AMETHYST: 101, MANGROVE: 102, MANGROVE_LEAF: 103,
  SLATE_BRICK: 104, SOUL_LANTERN: 105, SCULK_LANTERN: 106, BASALT_PILLAR: 107, RIFT_STONE: 108,
  NOTE_KEY: 109, TORNADO_TOTEM: 110, ENDER_PEARL: 111,
} as const;
const terrain = (name: string, color: string, texture: BlockDef['texture'], extra: Partial<Omit<BlockDef,'id'>> = {}): Omit<BlockDef,'id'> => ({ name, color, texture, category: 'Natural', solid: true, hardness: 1.2, resistance: 2, ...extra });
defs.push(
  terrain('Mycelium', '#826484', 'grass', { top: '#9988a3' }),
  terrain('Scarlet Mushroom Cap', '#be645b', 'mushroom'), terrain('Umber Mushroom Cap', '#987b5b', 'mushroom'), terrain('Mushroom Stem', '#d4ccb6', 'wood'),
  terrain('Toxic Loam', '#607b52', 'grass', { top: '#92b455' }), terrain('Fossil Bone', '#ddd3b2', 'bone'), terrain('Sculk', '#143f48', 'glow', { emissive: true, category: 'Otherworld' }),
  terrain('Deepslate', '#454a53', 'stone', { hardness: 3 }), terrain('Ancient Portal Frame', '#486463', 'rune', { resistance: 99, category: 'Otherworld' }),
  terrain('Sift Moss', '#617b62', 'grass', { top: '#91aa78', category: 'Otherworld' }), terrain('Sift Scarlet Moss', '#78514d', 'grass', { top: '#bd7775', category: 'Otherworld' }),
  terrain('Chromium', '#b9ccd0', 'metal', { metallic: .96, roughness: .16, category: 'Otherworld' }), terrain('Siftwood', '#665860', 'wood', { top: '#d5b4a1', category: 'Otherworld' }),
  terrain('Siftwood Leaves', '#b26376', 'leaf', { category: 'Otherworld' }), terrain('Silver Mirror', '#b7d5d7', 'metal', { mirror: true, metallic: 1, roughness: .02, category: 'Functional' }),
  ...['C', 'E', 'G', 'B'].map((note, i) => terrain(`Resonance Note ${note}`, ['#84b7aa','#c3ad6b','#8ea4d2','#bd8abc'][i], 'rune', { note: i, category: 'Functional', emissive: true })),
  terrain('Sift Rift', '#67e0c4', 'glow', { solid: false, portal: true, emissive: true, category: 'Otherworld', resistance: 99 }),
  terrain('Rift Igniter', '#a6ded2', 'tool', { solid: false, tool: 'igniter', category: 'Equipment', durability: 200 }),
  terrain('Blackstone', '#393d46', 'stone', { category: 'Otherworld' }), terrain('Warped Stem', '#3f7876', 'wood', { category: 'Otherworld' }),
  terrain('Warped Canopy', '#4aa39a', 'mushroom', { category: 'Otherworld' }), terrain('Crimson Stem', '#724c5c', 'wood', { category: 'Otherworld' }), terrain('Crimson Canopy', '#b15b65', 'mushroom', { category: 'Otherworld' }),
  terrain('Purpur Brick', '#a287ac', 'brick', { category: 'Otherworld' }), terrain('Chorus Stem', '#745b86', 'wood', { category: 'Otherworld' }), terrain('End Portal Frame', '#9fa478', 'rune', { category: 'Otherworld', resistance: 99 }),
  terrain('Rose Coral', '#cd8c98', 'mushroom'), terrain('Kelp', '#508f5a', 'leaf'), terrain('White Marble', '#cdd3c7', 'stone', { category: 'Building', roughness: .3 }),
  terrain('Mangrove Mud', '#605c4e', 'dirt'), terrain('River Clay', '#9eaaa4', 'dirt'), terrain('Red Desert Sand', '#c69565', 'dirt'), terrain('Cactus', '#748d47', 'wood'),
  terrain('Flowering Azalea', '#a884b5', 'leaf'), terrain('Amethyst', '#a291d2', 'glow', { emissive: true }), terrain('Mangrove Log', '#6b4a39', 'wood'), terrain('Mangrove Leaves', '#637b47', 'leaf'),
  terrain('Deepslate Brick', '#505963', 'brick', { category: 'Building' }), terrain('Soul Lantern', '#88d7dc', 'glow', { emissive: true, category: 'Functional' }), terrain('Sculk Light', '#5dbfae', 'glow', { emissive: true, category: 'Functional' }),
  terrain('Polished Basalt Pillar', '#657078', 'metal', { metallic: .4, roughness: .3 }), terrain('Riftstone', '#799b93', 'rune', { category: 'Otherworld' }),
  terrain('Resonance Guide', '#d0c49e', 'tool', { solid: false, category: 'Equipment' }), terrain('Stormcaller Totem', '#829dab', 'rune', { solid: false, category: 'Equipment' }),
  terrain('Ender Pearl', '#608c89', 'glow', { solid: false, category: 'Equipment', emissive: true }),
);
// Stable, append-only IDs keep procedural content and existing saves compatible.
const woods = [['Oak','#9c784d','#688948'],['Spruce','#735d43','#496b49'],['Acacia','#ba8252','#9f9c55'],['Cherry','#ccaa96','#dfa6b8'],['Willow','#877450','#86a07b'],['Ebony','#494350','#66745e'],['Maple','#a8754c','#bc884b'],['Silverwood','#b7c6c2','#a5cbd0']];
for (const [name, wood, leaf] of woods) defs.push(terrain(`${name} Log`, wood, 'wood'), terrain(`${name} Planks`, wood, 'plank', { category: 'Building' }), terrain(name==='Cherry'?'Cherry Blossom Leaves':`${name} Leaves`, leaf, 'leaf'));
const pigments = [['Ivory','#e7dfca'],['Coral','#cf8a75'],['Saffron','#d4b55e'],['Mint','#90b993'],['Cerulean','#729fb7'],['Orchid','#ae86bb'],['Slate','#677785'],['Charcoal','#484b51'],['Rose','#bd7e99'],['Terracotta','#b37959'],['Olive','#8b935b'],['Teal','#5d9690']];
for (const [name, color] of pigments) for (const [suffix, texture] of [['Wool','plain'],['Concrete','stone'],['Brick','brick'],['Glazed Tile','rune']] as const) defs.push(terrain(`${name} ${suffix}`, color, texture, { category: 'Building', roughness: suffix === 'Glazed Tile' ? .18 : .85 }));
export const PROCEDURAL_START = defs.length;
const minerals = [['Aetherite','#9ecac9'],['Sunstone','#d8b37b'],['Moonsteel','#a5b1ca'],['Bloodstone','#a86778'],['Verdigris','#79aa93'],['Luminite','#b4acd2'],['Pyrite','#b7a06c'],['Frostglass','#9fc5de'],['Rosemetal','#c3a4b0'],['Ashenite','#99938d'],['Stormsilver','#8fa6ab'],['Mossjade','#9bb786']];
for (let i = 0; i < minerals.length; i++) {
  const [name, color] = minerals[i];
  defs.push(terrain(`${name} Ore`, '#737d7b', 'ore', { top: color, category: 'Procedural', procedural: true, hardness: 2 + i % 4 * .3 }));
  for (const [suffix, texture] of [['Block','metal'],['Bricks','brick'],['Carved Stone','rune'],['Crystal','glow']] as const) defs.push(terrain(`${name} ${suffix}`, color, texture, { category: 'Procedural', procedural: true, emissive: texture === 'glow', metallic: texture === 'metal' ? .8 : .1, roughness: .32 }));
  for (const tool of ['pickaxe','sword','axe'] as const) defs.push(terrain(`${name} ${tool[0].toUpperCase()}${tool.slice(1)}`, color, 'tool', { solid: false, category: 'Procedural', procedural: true, tool, speed: 4 + i * .4, durability: 300 + i * 60 }));
  defs.push(terrain(`${name} Fruit`, color, 'food', { solid: false, category: 'Food', nutrition: 4 + i % 6, procedural: true }));
}
export const SPAWN_EGG_START = defs.length;
for (const [spawn, mob] of Object.entries(MOBS)) if (!mob.seaLife) defs.push(terrain(`${mob.name} Spawn Egg`, mob.body, 'egg', { top: mob.accent, solid: false, category: 'Spawn Eggs', spawn }));
export const EXTRA_START = defs.length;
defs.push(
  terrain('Grass Tuft', '#6f9a52', 'leaf', { solid: false, hardness: .05, resistance: 0 }),
  terrain('Wildflowers', '#c98ab5', 'leaf', { solid: false, hardness: .05, resistance: 0 }),
  terrain('Fallen Leaves', '#a8843f', 'leaf', { solid: false, hardness: .05, resistance: 0 }),
  terrain('Pebbles', '#8d8d84', 'stone', { solid: false, hardness: .1, resistance: .2 }),
  terrain('Torch', '#e8b34e', 'glow', { solid: false, hardness: .1, resistance: .2, emissive: true, category: 'Functional' }),
  terrain('Pyramid Brick', '#d8c08a', 'brick', { category: 'Building', hardness: 1.8, resistance: 5 }),
  terrain('Tomb Lantern', '#7de3d4', 'glow', { emissive: true, category: 'Functional', hardness: .5, resistance: 1 }),
  terrain('Golden Sarcophagus', '#d8b45e', 'metal', { metallic: .85, roughness: .3, category: 'Functional', hardness: 2.5, resistance: 6 }),
  terrain('Obsidian Brick', '#2c2636', 'brick', { category: 'Building', hardness: 5, resistance: 60 }),
  terrain('Volcanic Ash', '#4a4440', 'dirt', { hardness: .6, resistance: 1 }),
  terrain('Crystal Cluster', '#9fd8e8', 'glow', { emissive: true, hardness: 1.4, resistance: 2 }),
  terrain('Ancient Pot', '#b07a4e', 'plain', { category: 'Functional', hardness: .6, resistance: 1 }),
  terrain('Pink Coral', '#e87fa0', 'leaf', { category: 'Natural', hardness: .4, resistance: .5 }),
  terrain('Blue Coral', '#4fb6e6', 'leaf', { category: 'Natural', hardness: .4, resistance: .5 }),
  terrain('Purple Coral', '#a27be0', 'leaf', { category: 'Natural', hardness: .4, resistance: .5 }),
  terrain('Tube Worm', '#c94a4a', 'leaf', { solid: false, category: 'Natural', hardness: .05, resistance: 0 }),
  terrain('Lava', '#ff6a1a', 'glow', { category: 'Otherworld', emissive: true, hardness: 1, resistance: 2 }),
);
export const EXTRA = { GRASS_TUFT: EXTRA_START, WILDFLOWERS: EXTRA_START + 1, FALLEN_LEAVES: EXTRA_START + 2, PEBBLES: EXTRA_START + 3, TORCH: EXTRA_START + 4, PYRAMID_BRICK: EXTRA_START + 5, TOMB_LANTERN: EXTRA_START + 6, SARCOPHAGUS: EXTRA_START + 7, OBSIDIAN_BRICK: EXTRA_START + 8, VOLCANIC_ASH: EXTRA_START + 9, CRYSTAL_CLUSTER: EXTRA_START + 10, ANCIENT_POT: EXTRA_START + 11, CORAL_PINK: EXTRA_START + 12, CORAL_BLUE: EXTRA_START + 13, CORAL_PURPLE: EXTRA_START + 14, TUBE_WORM: EXTRA_START + 15, LAVA: EXTRA_START + 16 } as const;
defs[26] = { ...defs[26], name: 'Portal Keystone', portal: true };
export const ATLAS_COLS = 32;
export const ATLAS_ROWS = 32;
export const BLOCKS: BlockDef[] = defs.map((d, id) => ({ ...d, id }));
export const CATEGORIES: Category[] = ['Building', 'Natural', 'Functional', 'Equipment', 'Food', 'Otherworld', 'Spawn Eggs', 'Procedural'];
export const block = (id: number): BlockDef => BLOCKS[id] || BLOCKS[0];
export const placeable = (id: number) => id > 0 && (block(id).solid || block(id).portal);
export const maxStack = (id: number) => block(id).durability || block(id).armor ? 1 : 64;