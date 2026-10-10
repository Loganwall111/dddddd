import type { DimensionId, WorldPreset } from '../core/types';
import { fbm, hash3, noise2, noise3 } from './noise';

// The version-one generator is retained so existing worlds keep their terrain.

export const SIZE = 16;
export const HEIGHT = 128;
export const PAD = 18;
export const SEA = 26;
export const blockIndex = (x: number, y: number, z: number) => (x * SIZE + z) * HEIGHT + y;
export const paddedIndex = (x: number, y: number, z: number) => (x * PAD + z) * HEIGHT + y;
export interface GenConfig { seed: number; dimension: DimensionId; preset: WorldPreset }
export interface Biome { id: string; name: string; top: number; soil: number; tree: number; foliage: number }
export const BIOMES: Biome[] = [
  { id: 'meadow', name: 'Alpine Meadow', top: 1, soil: 2, tree: 5, foliage: 6 },
  { id: 'forest', name: 'Cedar Highlands', top: 1, soil: 2, tree: 5, foliage: 6 },
  { id: 'desert', name: 'Amber Dunes', top: 4, soil: 37, tree: 0, foliage: 0 },
  { id: 'snow', name: 'Frostfell Peaks', top: 10, soil: 3, tree: 5, foliage: 6 },
  { id: 'cherry', name: 'Cherry Vale', top: 1, soil: 2, tree: 18, foliage: 20 },
  { id: 'marsh', name: 'Mosswater Fen', top: 39, soil: 2, tree: 18, foliage: 6 },
  { id: 'beach', name: 'Sunlit Shore', top: 4, soil: 4, tree: 0, foliage: 0 },
  { id: 'volcanic', name: 'Obsidian Badlands', top: 22, soil: 22, tree: 0, foliage: 0 },
];
export function surfaceHeight(x: number, z: number, cfg: GenConfig): number {
  const { seed, dimension, preset } = cfg;
  if (preset === 'flat' && dimension === 'overworld') return 30;
  const n = fbm(x * .012, z * .012, seed);
  if (dimension === 'nether') {
    const elevation = 12 + n * 31 + Math.pow(noise2(x * .023, z * .023, seed + 7), 4) * 44;
    const refuge = Math.max(0, 1 - Math.hypot(x - 2, z + 4) / 17);
    return Math.floor(elevation * (1 - refuge) + 34 * refuge);
  }
  if (dimension === 'crystal') {
    const elevation = 18 + n * 27 + Math.sin(x * .028) * 5;
    const refuge = Math.max(0, 1 - Math.hypot(x - 2, z + 4) / 12);
    return Math.floor(elevation * (1 - refuge) + 29 * refuge);
  }
  if (dimension === 'end' || dimension === 'sky') return Math.floor(57 + n * 15);
  const mountains = Math.max(0, fbm(x * .0045 + 10, z * .0045 - 12, seed + 815) - .43);
  const strength = preset === 'amplified' ? 200 : preset === 'extreme' ? 310 : 125;
  let h = 23 + n * 21 + mountains * strength;
  const river = Math.abs(z - Math.sin(x * .012) * 33 - 52);
  h -= Math.max(0, 1 - river / 27) * 23;
  if (preset === 'archipelago') h -= 13;
  const spawn = Math.max(0, 1 - Math.hypot(x - 2, z + 4) / 22);
  h = h * (1 - spawn) + 35 * spawn;
  return Math.max(7, Math.min(HEIGHT - 16, Math.floor(h)));
}
export function getBiome(x: number, z: number, cfg: GenConfig): Biome {
  if (cfg.dimension !== 'overworld') return { id: cfg.dimension, name: cfg.dimension === 'nether' ? 'Ember Wastes' : cfg.dimension === 'end' ? 'The Pale Expanse' : cfg.dimension === 'crystal' ? 'Luminous Hollows' : 'Celestial Highlands', top: cfg.dimension === 'nether' ? 30 : cfg.dimension === 'end' ? 33 : cfg.dimension === 'crystal' ? 22 : 1, soil: cfg.dimension === 'nether' ? 22 : cfg.dimension === 'end' ? 33 : 3, tree: 0, foliage: 0 };
  const h = surfaceHeight(x, z, cfg);
  if (h <= SEA + 1) return BIOMES[6];
  if (h > 72) return BIOMES[3];
  if (Math.hypot(x, z) < 100 || cfg.preset === 'flat') return BIOMES[0];
  const t = noise2(x * .003, z * .003, cfg.seed + 425);
  const m = noise2(x * .006, z * .006, cfg.seed + 183);
  if (t > .69) return BIOMES[2];
  if (t < .24) return BIOMES[3];
  if (m > .68) return BIOMES[4];
  if (m < .23) return BIOMES[7];
  if (m > .55 && h < 40) return BIOMES[5];
  return BIOMES[1];
}
export function islandDepth(x: number, z: number, seed: number): number {
  const central = 1 - Math.hypot(x, z) / 43;
  const cx = Math.round(x / 96) * 96, cz = Math.round(z / 96) * 96;
  const radius = 20 + hash3(cx, 0, cz, seed) * 18;
  return Math.max(central, 1 - Math.hypot(x - cx, z - cz) / radius);
}
export function generateChunk(cx: number, cz: number, cfg: GenConfig, edits: Record<string, number>): { padded: Uint8Array; data: Uint8Array } {
  const padded = new Uint8Array(PAD * PAD * HEIGHT);
  const ox = cx * SIZE - 1, oz = cz * SIZE - 1;
  const set = (x: number, y: number, z: number, id: number) => {
    const lx = x - ox, lz = z - oz;
    if (lx >= 0 && lx < PAD && lz >= 0 && lz < PAD && y >= 0 && y < HEIGHT) padded[paddedIndex(lx, y, lz)] = id;
  };
  const floating = cfg.dimension === 'end' || cfg.dimension === 'sky';
  for (let lx = 0; lx < PAD; lx++) for (let lz = 0; lz < PAD; lz++) {
    const x = ox + lx, z = oz + lz, h = surfaceHeight(x, z, cfg), biome = getBiome(x, z, cfg);
    const island = floating ? islandDepth(x, z, cfg.seed) : 1;
    if (island <= 0) continue;
    const bottom = floating ? h - Math.ceil(island * 23) : 0;
    for (let y = bottom; y <= h; y++) {
      let id = y === 0 ? 44 : y === h ? biome.top : y > h - 4 ? biome.soil : cfg.dimension === 'nether' ? 30 : cfg.dimension === 'end' ? 33 : 3;
      if (cfg.preset !== 'flat' && !floating && y > 5 && y < h - 5 && noise3(x * .066, y * .079, z * .066, cfg.seed + 888) > .715) id = 0;
      if (id === 3 && y < h - 5) {
        const ore = hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), cfg.seed + 51);
        if (ore > .975) id = y < 15 ? 15 : 14;
        else if (ore > .94) id = 12;
        else if (ore > .89) id = 13;
        else if (ore > .86) id = 11;
      }
      if (cfg.dimension === 'nether' && y === h && hash3(x, y, z, cfg.seed) > .89) id = 31;
      padded[paddedIndex(lx, y, lz)] = id;
    }
  }
  // Structure candidates are evaluated outside the chunk, so canopies never stop at seams.
  if (cfg.preset !== 'flat' || cfg.dimension !== 'overworld') {
    for (let gx = Math.floor((ox - 5) / 8); gx <= Math.floor((ox + PAD + 5) / 8); gx++) for (let gz = Math.floor((oz - 5) / 8); gz <= Math.floor((oz + PAD + 5) / 8); gz++) {
      const chance = hash3(gx, 97, gz, cfg.seed);
      const x = gx * 8 + 2 + Math.floor(hash3(gx, 3, gz, cfg.seed) * 5), z = gz * 8 + 2 + Math.floor(hash3(gx, 9, gz, cfg.seed) * 5);
      const h = surfaceHeight(x, z, cfg), biome = getBiome(x, z, cfg);
      if (Math.hypot(x - 2, z + 4) < 7) continue;
      if (cfg.dimension === 'overworld' && biome.tree && chance > .4 && h > SEA + 2) {
        const tall = biome.tree === 5, trunk = tall ? 7 + Math.floor(chance * 3) : 5;
        for (let y = 1; y <= trunk; y++) set(x, h + y, z, biome.tree);
        for (let dy = tall ? 3 : 3; dy <= trunk + 1; dy++) {
          const r = tall ? Math.max(0, Math.ceil((trunk + 1 - dy) / 2.3)) : dy === trunk + 1 ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy <= trunk) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
            set(x + dx, h + dy, z + dz, biome.foliage);
          }
        }
      }
      if (cfg.dimension === 'crystal' && chance > .52) {
        for (let dy = 1; dy < 4 + chance * 6; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dy < 5 || dx === 0 && dz === 0) set(x + dx, h + dy, z + dz, chance > .78 ? 34 : 35);
      }
      if (cfg.dimension === 'end' && chance > .89 && islandDepth(x, z, cfg.seed) > .1) {
        for (let dy = 1; dy < 18; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(x + dx, h + dy, z + dz, dy === 17 ? 34 : 25);
      }
    }
  }
  // A small, functional trail shelter anchors the starting landscape.
  if (cfg.dimension === 'overworld' && cfg.preset !== 'flat') {
    const bx = 13, bz = 6, bh = surfaceHeight(bx, bz, cfg);
    for (let x = bx - 3; x <= bx + 3; x++) for (let z = bz - 3; z <= bz + 3; z++) {
      for (let y = surfaceHeight(x, z, cfg); y <= bh; y++) set(x, y, z, 3);
      set(x, bh, z, 7);
      for (let y = 1; y <= 4; y++) {
        const wall = Math.abs(x - bx) === 3 || Math.abs(z - bz) === 3;
        const door = z === bz - 3 && Math.abs(x - bx) < 1 && y < 3;
        const window = y === 2 && ((Math.abs(x - bx) === 3 && z === bz) || (z === bz + 3 && x === bx));
        set(x, bh + y, z, wall && !door ? window ? 9 : 7 : 0);
      }
      set(x, bh + 5 + (3 - Math.abs(x - bx)), z, 22);
    }
    set(bx - 2, bh + 1, bz + 2, 23); set(bx - 1, bh + 1, bz + 2, 24);
    set(bx + 2, bh + 1, bz + 2, 29); set(bx, bh + 4, bz, 28);
  }
  if (cfg.preset !== 'flat') {
    const px = -13, pz = 9, ph = surfaceHeight(px, pz, cfg);
    for (let dx = -2; dx <= 2; dx++) for (let y = 0; y <= 5; y++) {
      set(px + dx, ph + y, pz, dx === -2 || dx === 2 || y === 0 || y === 5 ? 25 : 26);
      if (y === 0) for (let dz = -2; dz <= 2; dz++) set(px + dx, ph, pz + dz, 8);
    }
  }
  for (const [key, id] of Object.entries(edits)) {
    const [x, y, z] = key.split(',').map(Number);
    set(x, y, z, id);
  }
  const data = new Uint8Array(SIZE * SIZE * HEIGHT);
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    const start = paddedIndex(x + 1, 0, z + 1);
    data.set(padded.subarray(start, start + HEIGHT), blockIndex(x, 0, z));
  }
  return { padded, data };
}