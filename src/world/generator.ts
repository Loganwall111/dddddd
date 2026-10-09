import { BlockId } from "../blocks/blocks";
import { ChunkData, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, chunkIndex, createEmptyChunk } from "./chunk";
import { fbm2D, fbm3D, hash2 } from "./noise";

export type WorldType = "normal" | "amplified" | "flat" | "superflat";
export type DimensionId = "overworld" | "nether" | "end";

export interface GeneratorConfig {
  seed: number;
  worldType: WorldType;
  dimension: DimensionId;
}

// Simple biome identification based on temperature/moisture noise.
export enum Biome {
  Plains, Forest, Desert, Taiga, Swamp, Mountains, Ocean, Mushroom, Snow, Beach, BirchForest,
  NetherWastes, SoulSandValley, BasaltDeltas,
  EndHighlands, EndMidlands, EndBarrens,
}

function getBiome(cfg: GeneratorConfig, wx: number, wz: number, height: number): Biome {
  if (cfg.dimension === "nether") {
    const t = fbm2D(wx * 0.01, wz * 0.01, cfg.seed + 400, 2);
    if (t < 0.4) return Biome.SoulSandValley;
    if (t > 0.7) return Biome.BasaltDeltas;
    return Biome.NetherWastes;
  }
  if (cfg.dimension === "end") {
    return Biome.EndHighlands;
  }
  // overworld
  const temp = fbm2D(wx * 0.003, wz * 0.003, cfg.seed + 100, 3);
  const moist = fbm2D(wx * 0.004 + 500, wz * 0.004 + 500, cfg.seed + 200, 3);
  if (height < SEA_LEVEL - 2) return Biome.Ocean;
  if (height > SEA_LEVEL + 28) return Biome.Mountains;
  if (temp < 0.25) return Biome.Snow;
  if (temp > 0.7 && moist < 0.35) return Biome.Desert;
  if (moist > 0.65 && temp > 0.4) return Biome.Swamp;
  if (moist > 0.42 && moist < 0.62 && temp > 0.45 && temp < 0.7) return Biome.BirchForest;
  if (moist > 0.45) return Biome.Forest;
  if (temp < 0.4) return Biome.Taiga;
  return Biome.Plains;
}

// Determine terrain height for a given (worldX, worldZ) column
function heightAt(cfg: GeneratorConfig, wx: number, wz: number): number {
  if (cfg.dimension === "nether") {
    // cavernous nether: roof and floor
    const base = 64;
    const n = fbm2D(wx * 0.02, wz * 0.02, cfg.seed, 4);
    const floor = 20 + Math.floor(n * 30);
    return floor;
  }
  if (cfg.dimension === "end") {
    const n = fbm2D(wx * 0.01, wz * 0.01, cfg.seed + 700, 3);
    const n2 = fbm2D(wx * 0.05, wz * 0.05, cfg.seed + 701, 2);
    // main island radius
    const d = Math.sqrt(wx * wx + wz * wz);
    if (d < 40) return 55 + Math.floor(n * 18);
    if (d < 50) return 40 + Math.floor(n2 * 14);
    // outer islands: small scattered
    const o = fbm2D(wx * 0.01, wz * 0.01, cfg.seed + 800, 2);
    if (o > 0.78) return 50 + Math.floor(n2 * 20 - d * 0.05);
    return 0;
  }
  if (cfg.worldType === "flat" || cfg.worldType === "superflat") {
    return SEA_LEVEL + 4;
  }
  // overworld height
  const cont = fbm2D(wx * 0.002, wz * 0.002, cfg.seed, 4); // continent shape
  const detail = fbm2D(wx * 0.02, wz * 0.02, cfg.seed + 1, 4);
  const hill = fbm2D(wx * 0.08, wz * 0.08, cfg.seed + 2, 3) * 0.3;
  let h = SEA_LEVEL - 8 + cont * 40 + detail * 14 + hill * 8;
  if (cfg.worldType === "amplified") h += detail * 30;
  return Math.max(SEA_LEVEL - 20, Math.floor(h));
}

// Cave density field
function caveDensity(cfg: GeneratorConfig, wx: number, wy: number, wz: number): boolean {
  if (cfg.dimension !== "overworld" && cfg.dimension !== "nether") return false;
  if (wy < 2) return false;
  if (cfg.dimension === "nether") {
    const n = fbm3D(wx * 0.03, wy * 0.04, wz * 0.03, cfg.seed + 900, 2);
    return n > 0.55;
  }
  // overworld caves only matter underground
  if (wy > SEA_LEVEL + 6) return false;
  const n1 = fbm3D(wx * 0.05, wy * 0.08, wz * 0.05, cfg.seed + 300, 2);
  if (n1 > 0.62 && wy < SEA_LEVEL - 4) return true;
  if (wy > 4) {
    const n2 = fbm3D(wx * 0.1, wy * 0.15, wz * 0.1, cfg.seed + 301, 2);
    if (n2 > 0.7) return true;
  }
  return false;
}

function oreChance(cfg: GeneratorConfig, wx: number, wy: number, wz: number, oreSeed: number, threshold: number): boolean {
  const n = fbm3D(wx * 0.2, wy * 0.2, wz * 0.2, oreSeed, 2);
  return n > threshold;
}

// Determines if a tree should grow at a given grass column.
function shouldTree(cfg: GeneratorConfig, wx: number, wz: number, biome: Biome): boolean {
  if (cfg.dimension !== "overworld") return false;
  if (biome !== Biome.Forest && biome !== Biome.Plains && biome !== Biome.Taiga && biome !== Biome.BirchForest) return false;
  const r = hash2(wx, wz, cfg.seed + 1000);
  if (biome === Biome.Forest) return r < 0.12;
  if (biome === Biome.Taiga) return r < 0.10;
  if (biome === Biome.BirchForest) return r < 0.11;
  return r < 0.006;
}
function shouldFlora(cfg: GeneratorConfig, wx: number, wz: number, biome: Biome): "flower" | "grass" | "cactus" | "none" {
  if (cfg.dimension !== "overworld") return "none";
  const r = hash2(wx, wz, cfg.seed + 1100);
  if (biome === Biome.Desert) return r < 0.02 ? "cactus" : "none";
  if (biome === Biome.Plains) {
    if (r < 0.05) return "flower";
    if (r < 0.3) return "grass";
  }
  if (biome === Biome.Forest || biome === Biome.BirchForest) {
    if (r < 0.03) return "flower";
    if (r < 0.45) return "grass";
  }
  if (biome === Biome.Swamp) {
    if (r < 0.02) return "flower";
    if (r < 0.3) return "grass";
  }
  if (biome === Biome.Snow) {
    if (r < 0.06) return "grass";
  }
  return "none";
}

export function generateChunk(cfg: GeneratorConfig, chunk: ChunkData): void {
  const { cx, cz, dim } = chunk;
  if (dim !== cfg.dimension) return;
  const blocks = chunk.blocks;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      const height = heightAt(cfg, wx, wz);
      const biome = getBiome(cfg, wx, wz, height);

      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        const idx = chunkIndex(lx, ly, lz);
        let b: BlockId = BlockId.Air;

        if (cfg.dimension === "nether") {
          if (ly === 0) b = BlockId.Bedrock;
          else if (ly < height - 4) b = BlockId.Netherrack;
          else if (ly < height) b = BlockId.Netherrack;
          else if (ly < 32) b = BlockId.Lava; // lava sea
          else if (ly > 120) b = BlockId.Bedrock;
          // soul sand patches
          if (biome === Biome.SoulSandValley && b === BlockId.Netherrack && ly >= height - 3) b = BlockId.SoulSand;
          if (biome === Biome.BasaltDeltas) {
            // use quartz as basalt substitute (visually different)
            if (b === BlockId.Netherrack && ly < height - 4 && hash2(wx + ly, wz, cfg.seed+1200) < 0.15) b = BlockId.Quartz;
          }
          // glowstone clusters
          if (b === BlockId.Air && ly > 32 && ly < 110) {
            const g = hash2(wx*13+ly*7, wz*17, cfg.seed+1300);
            if (g < 0.004) b = BlockId.Glowstone;
          }
          // quartz ore
          if (b === BlockId.Netherrack && oreChance(cfg,wx,ly,wz,cfg.seed+1350,0.82)) b = BlockId.Quartz;
        } else if (cfg.dimension === "end") {
          if (height === 0) { b = BlockId.Air; }
          else if (ly < height - 3) b = BlockId.EndStone;
          else if (ly < height) b = BlockId.EndStone;
          else b = BlockId.Air;
        } else {
          // overworld
          if (ly === 0) b = BlockId.Bedrock;
          else if (ly < height - 4) {
            b = BlockId.Stone;
            // ores
            if (ly < 20 && oreChance(cfg,wx,ly,wz,cfg.seed+2000,0.92)) b = BlockId.DiamondOre;
            else if (ly < 32 && oreChance(cfg,wx,ly,wz,cfg.seed+2100,0.90)) b = BlockId.GoldOre;
            else if (ly < 48 && oreChance(cfg,wx,ly,wz,cfg.seed+2200,0.88)) b = BlockId.IronOre;
            else if (ly < 64 && oreChance(cfg,wx,ly,wz,cfg.seed+2300,0.85)) b = BlockId.CoalOre;
            else if (ly < 20 && oreChance(cfg,wx,ly,wz,cfg.seed+2400,0.93)) b = BlockId.RedstoneOre;
            else if (ly < 32 && oreChance(cfg,wx,ly,wz,cfg.seed+2500,0.94)) b = BlockId.EmeraldOre;
          }
          else if (ly < height) {
            // dirt/sand/gravel layers; deserts get sandstone beneath the sand
            if (biome === Biome.Desert || biome === Biome.Beach) b = (height - ly <= 4) ? BlockId.Sand : BlockId.Sandstone;
            else b = BlockId.Dirt;
          }
          else if (ly === height) {
            if (biome === Biome.Desert || biome === Biome.Beach) b = BlockId.Sand;
            else if (biome === Biome.Snow || (biome === Biome.Mountains && height > SEA_LEVEL + 36)) b = BlockId.Snow;
            else if (biome === Biome.Ocean) b = BlockId.Sand;
            else b = BlockId.Grass;
          }
          else if (ly <= SEA_LEVEL) b = (biome === Biome.Snow && ly === SEA_LEVEL) ? BlockId.Ice : BlockId.Water;
          else b = BlockId.Air;
          // carve caves
          if (b === BlockId.Stone && caveDensity(cfg,wx,ly,wz)) b = BlockId.Air;
          else if (b === BlockId.Dirt && caveDensity(cfg,wx,ly,wz)) b = BlockId.Air;
          // lava pockets in deep caves
          if (b === BlockId.Air && ly < 12 && hash2(wx*3+ly,wz*5,cfg.seed+2600) < 0.02) b = BlockId.Lava;
        }
        blocks[idx] = b;
      }

      // surface decorations (trees, flora) — overworld only
      if (cfg.dimension === "overworld") {
        const topY = height;
        if (topY > SEA_LEVEL && topY < CHUNK_HEIGHT - 10) {
          const topBlock = blocks[chunkIndex(lx, topY, lz)];
          if (topBlock === BlockId.Grass || topBlock === BlockId.Sand || topBlock === BlockId.Snow) {
            if (shouldTree(cfg, wx, wz, biome)) {
              placeTree(chunk, lx, topY + 1, lz, biome);
            } else {
              const f = shouldFlora(cfg, wx, wz, biome);
              if (f === "flower") {
                const fv = hash2(wx, wz, cfg.seed+1400);
                blocks[chunkIndex(lx, topY+1, lz)] = fv < 0.4 ? BlockId.Flower : fv < 0.8 ? BlockId.FlowerYellow : BlockId.Mushroom;
              }
              else if (f === "grass") blocks[chunkIndex(lx, topY+1, lz)] = BlockId.TallGrass;
              else if (f === "cactus") placeCactus(chunk, lx, topY+1, lz);
              // mushrooms prefer shade: forests & swamps
              else if ((biome === Biome.Forest || biome === Biome.Swamp || biome === Biome.BirchForest) && hash2(wx, wz, cfg.seed+1450) < 0.012) {
                blocks[chunkIndex(lx, topY+1, lz)] = hash2(wx, wz, cfg.seed+1451) < 0.5 ? BlockId.Mushroom : BlockId.MushroomBrown;
              }
            }
          }
        }
        // pumpkin & melon patches, rare
        if (topY > SEA_LEVEL && hash2(wx, wz, cfg.seed+1500) < 0.0008) {
          if (blocks[chunkIndex(lx, topY, lz)] === BlockId.Grass)
            blocks[chunkIndex(lx, topY+1, lz)] = BlockId.Pumpkin;
        }
        if (topY > SEA_LEVEL && (biome === Biome.Forest || biome === Biome.Plains) && hash2(wx, wz, cfg.seed+1520) < 0.0006) {
          if (blocks[chunkIndex(lx, topY, lz)] === BlockId.Grass)
            blocks[chunkIndex(lx, topY+1, lz)] = BlockId.Melon;
        }
      }

      // Nether: scattered glowstone on ceiling
      if (cfg.dimension === "nether") {
        // glowstone clusters already set above
      }

      // End: chorus plants / void below 40
    }
  }

  // Second pass: place small ruined structures in the overworld (one candidate per chunk region)
  if (cfg.dimension === "overworld") placeStructures(cfg, chunk);

  chunk.generated = true;
  chunk.dirty = true;
}

// Deterministic placement of small ruins within a chunk (kept fully inside chunk bounds).
function placeStructures(cfg: GeneratorConfig, chunk: ChunkData) {
  const wx = chunk.cx * CHUNK_SIZE;
  const wz = chunk.cz * CHUNK_SIZE;
  // ~1 structure per 4 chunks
  if (hash2(chunk.cx, chunk.cz, cfg.seed + 5000) > 0.25) return;
  const lx = 3 + Math.floor(hash2(chunk.cx, chunk.cz, cfg.seed + 5001) * 8);
  const lz = 3 + Math.floor(hash2(chunk.cz, chunk.cx, cfg.seed + 5002) * 8);
  const gx = wx + lx, gz = wz + lz;
  const h = heightAt(cfg, gx, gz);
  if (h <= SEA_LEVEL + 1 || h > SEA_LEVEL + 30) return; // only on land, not in mountains
  // Require roughly flat ground for the footprint
  const h2 = heightAt(cfg, gx + 4, gz), h3 = heightAt(cfg, gx, gz + 4), h4 = heightAt(cfg, gx + 4, gz + 4);
  if (Math.max(h, h2, h3, h4) - Math.min(h, h2, h3, h4) > 1) return;

  const kind = hash2(gx, gz, cfg.seed + 5003);
  if (kind < 0.6) placeRuin(chunk, lx, h, lz);
  else placeObelisk(chunk, lx, h, lz);
}

function inBounds(x: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
}

// A ruined stone-brick hut with a chest-like glowstone lamp inside.
function placeRuin(chunk: ChunkData, lx: number, ly: number, lz: number) {
  const w = 5, d = 5, wallH = 3;
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      const x = lx + dx, z = lz + dz;
      if (!inBounds(x, z)) return;
      // floor
      setLocal(chunk, x, ly, z, hash2(x, z, 7778) < 0.3 ? BlockId.MossyCobble : BlockId.StoneBricks);
      const isWall = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1;
      if (isWall) {
        for (let dy = 1; dy <= wallH; dy++) {
          // door gap on one side, and random damage
          const isDoor = dx === 2 && dz === 0 && dy <= 2;
          if (isDoor) continue;
          if (hash2(x + dy, z, 7777) < 0.2 && dy > 1) continue; // broken walls
          setLocal(chunk, x, ly + dy, z, hash2(x + dy, z, 7779) < 0.25 ? BlockId.MossyCobble : BlockId.StoneBricks);
        }
      } else {
        // clear interior air
        for (let dy = 1; dy <= wallH; dy++) setLocal(chunk, x, ly + dy, z, BlockId.Air);
      }
    }
  }
  // lamp inside
  setLocal(chunk, lx + 2, ly + 1, lz + 2, BlockId.Glowstone);
}

// A tall mossy obelisk landmark.
function placeObelisk(chunk: ChunkData, lx: number, ly: number, lz: number) {
  if (!inBounds(lx, lz)) return;
  const hgt = 5 + Math.floor(hash2(lx, lz, 8888) * 4);
  for (let dy = 1; dy <= hgt; dy++) {
    setLocal(chunk, lx, ly + dy, lz, dy === hgt ? BlockId.Glowstone : BlockId.Stone);
  }
  // base
  for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    if (inBounds(lx + ox, lz + oz)) setLocal(chunk, lx + ox, ly + 1, lz + oz, BlockId.Cobblestone);
  }
}

function setLocal(chunk: ChunkData, x: number, y: number, z: number, id: BlockId) {
  if (!inBounds(x, z) || y < 0 || y >= CHUNK_HEIGHT) return;
  chunk.blocks[chunkIndex(x, y, z)] = id;
}

function placeTree(chunk: ChunkData, lx: number, ly: number, lz: number, biome: Biome) {
  const isPine = biome === Biome.Taiga || biome === Biome.Mountains;
  const isBirch = biome === Biome.BirchForest;
  const trunkLog = isPine ? BlockId.SpruceLog : isBirch ? BlockId.BirchLog : BlockId.Wood;
  const leaf = isPine ? BlockId.SpruceLeaves : isBirch ? BlockId.BirchLeaves : BlockId.Leaves;
  const trunkHeight = isPine ? 6 + Math.floor(Math.random()*2) : isBirch ? 5 + Math.floor(Math.random()*2) : 4 + Math.floor(Math.random()*2);
  // trunk
  for (let i = 0; i < trunkHeight; i++) {
    if (ly + i < CHUNK_HEIGHT) chunk.blocks[chunkIndex(lx, ly + i, lz)] = trunkLog;
  }
  if (isPine) {
    // spruce: triangular leaves
    for (let layer = 0; layer < 4; layer++) {
      const r = 2 - Math.floor(layer/2);
      const yy = ly + trunkHeight - 1 + layer - 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && Math.random() < 0.5) continue;
        const x = lx+dx, z = lz+dz, y = yy;
        if (x>=0&&x<CHUNK_SIZE&&z>=0&&z<CHUNK_SIZE&&y<CHUNK_HEIGHT&&y>=0) {
          if (chunk.blocks[chunkIndex(x,y,z)] === BlockId.Air) chunk.blocks[chunkIndex(x,y,z)] = leaf;
        }
      }
    }
  } else if (isBirch) {
    // birch: compact bright canopy
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 2; dy++) {
      const ax = lx+dx, az = lz+dz, ay = ly + trunkHeight + dy - 1;
      if (dx*dx + dz*dz + (dy===2?2:0) > 5) continue;
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && Math.random() < 0.6) continue;
      if (ax>=0&&ax<CHUNK_SIZE&&az>=0&&az<CHUNK_SIZE&&ay<CHUNK_HEIGHT&&ay>=0) {
        if (chunk.blocks[chunkIndex(ax,ay,az)] === BlockId.Air) chunk.blocks[chunkIndex(ax,ay,az)] = leaf;
      }
    }
  } else {
    // oak: blob canopy
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) {
      const ax = lx+dx, az = lz+dz, ay = ly + trunkHeight + dy;
      if (dx*dx + dz*dz + (dy<0?2:dy*dy) > 6) continue;
      if (ax>=0&&ax<CHUNK_SIZE&&az>=0&&az<CHUNK_SIZE&&ay<CHUNK_HEIGHT&&ay>=0) {
        if (chunk.blocks[chunkIndex(ax,ay,az)] === BlockId.Air) chunk.blocks[chunkIndex(ax,ay,az)] = leaf;
      }
    }
  }
}

function placeCactus(chunk: ChunkData, lx: number, ly: number, lz: number) {
  for (let i = 0; i < 3; i++) {
    if (ly+i >= CHUNK_HEIGHT) break;
    chunk.blocks[chunkIndex(lx, ly+i, lz)] = BlockId.Cactus;
  }
}

// Generate the chunks that a given block column belongs to (useful for cross-chunk trees etc.).
// For simplicity we restrict tree placement to single chunk for now.
export function generateChunkByCoords(cfg: GeneratorConfig, cx: number, cz: number, dim: string): ChunkData {
  const c = createEmptyChunk(cx, cz, dim);
  generateChunk(cfg, c);
  return c;
}
