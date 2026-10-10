import { PROCEDURAL_START } from '../blocks/registry';
import { noise2 } from './noise';
import { mcMoist, mcRare, mcTemp, mcWeird } from './minecraftNoise';
import type { DimensionId } from '../core/types';

export interface Biome {
  id: string; name: string; top: number; soil: number; tree: number; foliage: number;
  density: number; feature?: 'mushrooms' | 'bones' | 'spires' | 'cactus' | 'crystals' | 'mangrove';
  climate: 'temperate' | 'cold' | 'hot' | 'alien'; water: string; toxic?: boolean;
}
const make = (id: string, name: string, top = 1, soil = 2, tree = 5, foliage = 6, density = .15, feature?: Biome['feature'], climate: Biome['climate'] = 'temperate', water = '#468b93'): Biome => ({ id, name, top, soil, tree, foliage, density, feature, climate, water });
export const BIOMES: Biome[] = [
  make('plains','Wildflower Plains',1,2,112,114,.07), make('woodland','Oak Woodland',1,2,112,114,.48),
  make('birch','Birch Grove',1,2,18,6,.38), make('taiga','Spruce Taiga',1,2,115,117,.42,undefined,'cold'),
  make('snow','Snowy Tundra',10,3,115,117,.06,undefined,'cold'), make('peaks','Frozen Peaks',10,3,0,0,0,'spires','cold'),
  make('desert','Golden Dunes',4,37,0,0,.12,'cactus','hot'), make('badlands','Painted Badlands',98,16,0,0,0,undefined,'hot'),
  make('savanna','Acacia Savanna',1,2,118,120,.1,undefined,'hot'), make('cherry','Cherry Blossom Valley',1,2,121,123,.25),
  make('mushroom','Mushroom Valley',64,2,0,0,.42,'mushrooms'), make('toxic','Toxic Riverlands',68,96,102,103,.15,'mangrove','temperate','#a3ba4e'),
  make('bones','Ancient Boneyard',4,38,0,0,.28,'bones','hot'), make('marsh','Mosswater Marsh',39,96,124,126,.2,'mangrove'),
  make('mangrove','Mangrove Delta',96,97,102,103,.48,'mangrove','hot'), make('jungle','Emerald Jungle',1,2,112,114,.68,undefined,'hot'),
  make('meadow','Highland Meadow',1,2,5,6,.08), make('volcanic','Volcanic Wastes',22,85,0,0,.1,'spires','hot'),
  make('lavender','Lavender Fields',1,2,18,100,.11), make('aspen','Golden Aspen Hills',1,2,18,132,.27),
  make('redwood','Ancient Cedar Forest',1,2,5,6,.6), make('ocean','Deep Ocean',38,3,0,0,0),
  make('beach','Sunlit Coast',4,4,0,0,0), make('reef','Coral Lagoon',4,97,0,0,0),
  make('glacier','Glacier Basin',36,3,0,0,0,'spires','cold'), make('crag','Windswept Crags',3,3,115,117,.05),
  make('darkwood','Dark Woodland',39,2,127,129,.7), make('crystal','Amethyst Fields',95,3,0,0,.24,'crystals'),
  make('clay','Clay Terraces',97,16,0,0,0), make('willow','Willow Wetlands',1,96,124,126,.25),
  make('autumn','Amber Maple Forest',1,2,130,132,.36), make('silver','Silverwood Glade',1,2,133,135,.32),
];
BIOMES[11].toxic = true;
const byId = (id: string) => BIOMES.find(b => b.id === id)!;
const dimensionBiomes: Record<Exclude<DimensionId,'overworld'>, Biome[]> = {
  nether: [make('nether-wastes','Nether Wastes',30,30,0,0,0,undefined,'alien'),make('crimson','Crimson Forest',30,85,88,89,.32,'mushrooms','alien'),make('warped','Warped Forest',85,30,86,87,.29,'mushrooms','alien'),make('soul','Soul Sand Valley',32,85,0,0,.25,'bones','alien'),make('basalt','Basalt Deltas',85,22,0,0,.4,'spires','alien')],
  end: [make('end','The Central End',33,33,0,0,.16,'spires','alien'),make('chorus','Chorus Highlands',33,33,91,90,.2,undefined,'alien'),make('end-barrens','End Barrens',33,33,0,0,0,undefined,'alien')],
  crystal: [make('hollows','Crystal Hollows',22,71,0,0,.52,'crystals','alien'),make('rose','Rose Quartz Grotto',95,71,0,0,.42,'crystals','alien')],
  sky: [make('sky','Skybound Meadows',1,3,133,135,.13),make('cloud-garden','Cloud Gardens',1,95,18,100,.25)],
  sift: [make('sift-green','The Verdant Deception',73,108,76,77,.19,undefined,'alien','#b088d0'),make('sift-red','Scarlet Sanctuary',74,108,76,77,.33,undefined,'alien','#bb8bb1'),make('sift-metal','Chromium Cathedral',75,107,0,0,.5,'spires','alien','#72bdbe'),make('sift-bone','The Quiet Remains',69,108,0,0,.22,'bones','alien','#b2c89b'),make('sift-fungi','Prismatic Understory',64,108,0,0,.5,'mushrooms','alien','#96b8d1')],
};
export function biomeAt(x: number, z: number, seed: number, dimension: DimensionId, height?: number): Biome {
  if (dimension !== 'overworld') {
    const list = dimensionBiomes[dimension];
    return list[Math.floor(noise2(x * .008, z * .008, seed + 489) * list.length * 1.6) % list.length];
  }
  if (height !== undefined && height < 24) return height < 16 ? BIOMES[21] : BIOMES[23];
  if (height !== undefined && height < 28) return BIOMES[22];
  if (height !== undefined && height > 83) return height > 95 ? byId('peaks') : byId('crag');
  if (Math.hypot(x, z) < 75) return BIOMES[0];
  // Smooth climate fields replace square Voronoi cells so borders follow organic noise contours.
  const temp = mcTemp(x, z, seed), moist = mcMoist(x, z, seed), weird = mcWeird(x, z, seed), rare = mcRare(x, z, seed);
  const wobble = noise2(x * 0.02, z * 0.02, seed + 8100) * 0.08;
  const t = temp + (wobble - 0.04), m = moist + (wobble - 0.04);
  let base: Biome;
  if (t < 0.3) {
    if (m > 0.62) base = byId('taiga');
    else if (t < 0.2 && m < 0.4) base = byId('glacier');
    else if (weird > 0.62) base = byId('crag');
    else base = byId('snow');
  } else if (t > 0.7) {
    if (rare > 0.72) base = byId('volcanic');
    else if (m < 0.32 && weird > 0.55) base = byId('bones');
    else if (m < 0.38) base = weird > 0.6 ? byId('badlands') : byId('desert');
    else if (m > 0.68) base = byId('jungle');
    else if (m > 0.5) base = byId('savanna');
    else base = byId('mangrove');
  } else if (m > 0.74) {
    if (rare > 0.66) base = byId('mushroom');
    else if (weird > 0.6) base = byId('toxic');
    else if (t > 0.55) base = byId('jungle');
    else base = byId('marsh');
  } else if (m < 0.3) {
    if (weird > 0.62) base = byId('clay');
    else if (t > 0.55) base = byId('savanna');
    else base = byId('meadow');
  } else {
    if (rare > 0.78) base = byId('crystal');
    else if (rare > 0.72 && m > 0.5) base = byId('darkwood');
    else if (weird > 0.7) base = byId('cherry');
    else if (weird > 0.62 && m > 0.55) base = byId('redwood');
    else if (weird < 0.32 && m > 0.45) base = byId('birch');
    else if (t > 0.58 && m < 0.5) base = byId('autumn');
    else if (t < 0.45 && m > 0.55) base = byId('silver');
    else if (m > 0.55) base = byId('woodland');
    else if (weird > 0.55) base = byId('lavender');
    else if (weird < 0.4) base = byId('aspen');
    else if (m > 0.42 && t < 0.55) base = byId('willow');
    else base = byId('plains');
  }
  // Rare seeded variants keep exploration surprising without square region borders.
  if (rare > 0.86 && base.climate === 'temperate') {
    const prefixes = ['Opaline','Whispering','Copper','Lost','Singing','Luminous','Velvet','Duskwoven','Celestial','Veiled','Honeyed','Forgotten'];
    const suffixes = ['Expanse','Gardens','Reach','Hollows','Steppe','Vale','Thicket','Wilds'];
    const qx = Math.floor(x / 256), qz = Math.floor(z / 256);
    const variant = Math.floor(noise2(qx * 0.37, qz * 0.37, seed + 9000) * 12) % 12;
    return { ...base, id: `emergent:${qx}:${qz}`, name: `${prefixes[variant]} ${suffixes[Math.floor(noise2(qx, qz, seed + 9001) * 8) % 8]}`, density: 0.05 + noise2(qx, qz, seed + 9002) * 0.5, ...(noise2(qx, qz, seed + 9003) > 0.55 ? { soil: PROCEDURAL_START + variant * 9 + 3, feature: 'crystals' as const } : {}) };
  }
  return base;
}
export function forestMultiplier(x: number, z: number, seed: number) {
  const f = noise2(x * 0.02, z * 0.02, seed + 4001);
  return f > 0.62 ? 1.9 : f > 0.5 ? 1.15 : f > 0.38 ? 0.55 : 0.18;
}
export function fluidHazard(dimension: DimensionId, x: number, z: number, seed: number) { return dimension === 'sift' ? 4 : dimension === 'nether' ? 6 : biomeAt(x,z,seed,dimension).toxic ? 2 : 0; }
