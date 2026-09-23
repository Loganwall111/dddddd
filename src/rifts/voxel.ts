/* RIFTBOUND — voxel core: blocks, procedural atlas, terrain (prime + rainbow), chunk meshing, DDA raycast.
   All assets are procedurally generated in-repo — no external art. */

export const CX = 16; // chunk size x
export const CY = 48; // chunk height
export const CZ = 16; // chunk size z
export const WATER_PRIME = 12;
export const WATER_RAINBOW = 8;

// ── block ids ──
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAF: 6,
  WATER: 7,
  PLANK: 8,
  CRYSTAL: 9, // glowing rift crystal
  P_GRASS: 10, // rainbow grass
  P_DIRT: 11, // rainbow dirt
  FRAME: 12, // dark portal frame stone
  CORAL: 13, // pastel crystal flora
} as const;

export interface BlockDef {
  name: string;
  solid: boolean;
  transparent: boolean;
  glow: boolean;
  tiles: [number, number, number]; // top, side, bottom page indices
}

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: { name: "Grass", solid: true, transparent: false, glow: false, tiles: [0, 1, 2] },
  [B.DIRT]: { name: "Dirt", solid: true, transparent: false, glow: false, tiles: [2, 2, 2] },
  [B.STONE]: { name: "Stone", solid: true, transparent: false, glow: false, tiles: [3, 3, 3] },
  [B.SAND]: { name: "Sand", solid: true, transparent: false, glow: false, tiles: [4, 4, 4] },
  [B.LOG]: { name: "Log", solid: true, transparent: false, glow: false, tiles: [5, 6, 5] },
  [B.LEAF]: { name: "Leaves", solid: true, transparent: true, glow: false, tiles: [7, 7, 7] },
  [B.WATER]: { name: "Water", solid: false, transparent: true, glow: false, tiles: [8, 8, 8] },
  [B.PLANK]: { name: "Planks", solid: true, transparent: false, glow: false, tiles: [9, 9, 9] },
  [B.CRYSTAL]: { name: "Rift Crystal", solid: true, transparent: false, glow: true, tiles: [10, 10, 10] },
  [B.P_GRASS]: { name: "Dream Grass", solid: true, transparent: false, glow: false, tiles: [11, 12, 2] },
  [B.P_DIRT]: { name: "Dream Dirt", solid: true, transparent: false, glow: false, tiles: [13, 13, 13] },
  [B.FRAME]: { name: "Gate Stone", solid: true, transparent: false, glow: false, tiles: [14, 14, 14] },
  [B.CORAL]: { name: "Dream Crystals", solid: true, transparent: true, glow: true, tiles: [15, 15, 15] },
};

export const HOTBAR_BLOCKS: number[] = [B.GRASS, B.DIRT, B.STONE, B.PLANK, B.LOG, B.LEAF, B.SAND, B.CRYSTAL];

/* ── tiny deterministic noise ── */
export function hash2(x: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const u = s(xf), v = s(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x: number, z: number, seed: number, oct: number): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, z * f, seed + i * 101) * amp;
    amp *= 0.5; f *= 2.07;
  }
  return v;
}
function noise3(x: number, y: number, z: number, seed: number): number {
  // cheap value noise 3d via layered 2d
  return vnoise(x + y * 57.31, z + y * 23.7, seed) * 0.5 + vnoise(z + y * 31.7, x + y * 17.9, seed + 7) * 0.5;
}

type RGBAQuad = [number, number, number, number];

/* ── procedural 16px pixel-atlas (8×2 grid of 16px tiles) ── */
export function makeAtlas(): { texture: { data: RGBAQuad[]; w: number; h: number } } {
  const w = 8 * 16, h = 2 * 16;
  const data: RGBAQuad[] = [];
  for (let i = 0; i < w * h; i++) data.push([0, 0, 0, 255]);
  const px = (tile: number, x: number, y: number, r: number, g: number, b: number) => {
    const tx = (tile % 8) * 16 + x, ty = Math.floor(tile / 8) * 16 + y;
    data[ty * w + tx] = [r, g, b, 255];
  };
  const R = (a: number, b: number, r: () => number) => Math.floor(a + r() * (b - a));

  const fillNoise = (tile: number, r0: number, r1: number, g0: number, g1: number, b0: number, b1: number, seed: number) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = hash2(x + seed, y + seed * 2, seed * 3);
      px(tile, x, y, R(r0, r1, () => n), R(g0, g1, () => n), R(b0, b1, () => n));
    }
  };

  fillNoise(0, 88, 128, 152, 196, 74, 104, 11); // grass top
  // grass side: dirt with green fringe
  fillNoise(1, 112, 140, 82, 104, 54, 72, 22);
  for (let x = 0; x < 16; x++) {
    const d = 2 + Math.floor(hash2(x, 0, 99) * 3);
    for (let y = 0; y < d; y++) px(1, x, y, R(88, 122, () => hash2(x, y, 5)), R(150, 188, () => hash2(x, y, 6)), R(72, 98, () => hash2(x, y, 7)));
  }
  fillNoise(2, 112, 140, 82, 104, 54, 72, 33); // dirt
  fillNoise(3, 118, 142, 120, 144, 122, 146, 44); // stone
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x, y, 45) > 0.86) px(3, x, y, 96, 98, 102);
  fillNoise(4, 214, 232, 202, 220, 158, 178, 55); // sand
  fillNoise(5, 168, 186, 178, 194, 128, 148, 66); // log top (rings)
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const dd = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (Math.floor(dd) % 2 === 0) px(5, x, y, R(150, 168, () => 0), R(160, 176, () => 0), R(112, 130, () => 0));
  }
  fillNoise(6, 92, 118, 74, 96, 48, 66, 77); // log side
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x * 3, y, 78) > 0.8) px(6, x, y, 60, 48, 34);
  fillNoise(7, 44, 74, 104, 148, 52, 84, 88); // leaves (dappled)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x, y, 89) > 0.75) px(7, x, y, 30, 58, 38);
  fillNoise(8, 52, 74, 116, 148, 178, 214, 98); // water
  fillNoise(9, 168, 190, 132, 152, 88, 108, 111); // planks
  for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) px(9, x, y, 128, 102, 64);
  // crystal: white-pink glow
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hash2(x, y, 121);
    const core = (Math.abs(x - 7.5) + Math.abs(y - 7.5)) < 6;
    if (core) px(10, x, y, 255, R(214, 244, () => n), R(226, 250, () => n));
    else px(10, x, y, R(214, 240, () => n), R(140, 170, () => n), R(190, 216, () => n));
  }
  // rainbow: dream grass (mint pink) / dirt (lavender)
  fillNoise(11, 196, 224, 148, 176, 196, 222, 131);
  for (let x = 0; x < 16; x++) {
    const d = 2 + Math.floor(hash2(x, 1, 132) * 3);
    for (let y = 0; y < d; y++) px(12, x, y, 204, R(152, 176, () => hash2(x, y, 133)), 200);
  }
  fillNoise(13, 186, 206, 162, 182, 202, 222, 141);
  fillNoise(14, 52, 66, 54, 68, 70, 88, 151); // gate stone (dark, subtle blue)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x, y, 152) > 0.88) px(14, x, y, 34, 38, 52);
  fillNoise(15, 128, 168, 232, 252, 214, 240, 161); // dream crystals (teal-white glow)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x * 2, y * 2, 162) > 0.7) px(15, x, y, 240, 255, 250);

  return { texture: { data, w, h } };
}

/* ── chunk storage ── */
export class Chunk {
  blocks: Uint8Array;
  dirty = true;
  constructor(public cx: number, public cz: number) {
    this.blocks = new Uint8Array(CX * CY * CZ);
  }
  idx(x: number, y: number, z: number): number { return (y * CZ + z) * CX + x; }
  get(x: number, y: number, z: number): number {
    if (y < 0) return B.STONE;
    if (y >= CY) return B.AIR;
    return this.blocks[this.idx(x, y, z)];
  }
  set(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= CY) return;
    this.blocks[this.idx(x, y, z)] = v;
    this.dirty = true;
  }
}

export type Dim = "prime" | "rainbow";

/* floating dream-island layout (rainbow dimension): deterministic per 256×256 cell */
export function islandsNear(x0: number, z0: number, x1: number, z1: number, seed: number): { x: number; z: number; y: number; r: number }[] {
  const out: { x: number; z: number; y: number; r: number }[] = [];
  const c0 = Math.floor(Math.min(x0, z0) / 256) - 1, c1 = Math.floor(Math.max(x1, z1) / 256) + 1;
  for (let cx = c0; cx <= c1; cx++) for (let cz = c0; cz <= c1; cz++) {
    const n = 1 + Math.floor(hash2(cx, cz, seed + 300) * 2);
    for (let i = 0; i < n; i++) {
      const ix = cx * 256 + hash2(cx * 7 + i, cz * 3, seed + 301) * 256;
      const iz = cz * 256 + hash2(cz * 5 + i, cx * 9, seed + 302) * 256;
      if (ix < x0 - 20 || ix > x1 + 20 || iz < z0 - 20 || iz > z1 + 20) continue;
      out.push({ x: ix, z: iz, y: 26 + hash2(cx + i, cz - i, seed + 303) * 16, r: 3 + hash2(cx, cz + i, seed + 304) * 3.5 });
    }
  }
  return out;
}

/* ── terrain generation into a chunk ── */
export function generateChunk(c: Chunk, dim: Dim, seed: number): void {
  const x0 = c.cx * CX, z0 = c.cz * CZ;
  const wl = dim === "prime" ? WATER_PRIME : WATER_RAINBOW;

  for (let lx = 0; lx < CX; lx++) {
    for (let lz = 0; lz < CZ; lz++) {
      const x = x0 + lx, z = z0 + lz;
      let h: number;
      if (dim === "prime") {
        h = Math.floor(14 + fbm2(x * 0.02, z * 0.02, seed, 4) * 10 + fbm2(x * 0.005, z * 0.005, seed + 5, 2) * 7);
      } else {
        h = Math.floor(10 + fbm2(x * 0.024, z * 0.024, seed + 40, 3) * 5);
      }
      const top: number = dim === "prime" ? (h <= wl ? B.SAND : B.GRASS) : B.P_GRASS;
      for (let y = 0; y <= h; y++) {
        let b: number = dim === "prime" ? (y >= h - 2 ? B.DIRT : B.STONE) : B.P_DIRT;
        if (y === h) b = top;
        c.blocks[c.idx(lx, y, lz)] = b;
      }
      // caves (prime only)
      if (dim === "prime") {
        for (let y = 3; y < h - 2; y++) {
          if (noise3(x * 0.06, y * 0.07, z * 0.06, seed + 80) > 0.78) c.blocks[c.idx(lx, y, lz)] = B.AIR;
        }
      }
      // water
      for (let y = h + 1; y <= wl; y++) c.blocks[c.idx(lx, y, lz)] = B.WATER;
      // trees
      if (h > wl && (dim === "prime" ? top === B.GRASS : dim === "rainbow" && h > wl + 1)) {
        const th = hash2(x, z, seed + 200);
        if (dim === "prime" && th < 0.006) {
          const thh = 4 + Math.floor(hash2(x, z, seed + 201) * 2);
          for (let y = h + 1; y <= h + thh; y++) c.set(lx, y, lz, B.LOG);
          for (let dy = -1; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            const y = h + thh + dy, xx = lx + dx, zz = lz + dz;
            if (dx * dx + dz * dz + dy * dy * 2 > 5.5) continue;
            if (xx < 0 || zz < 0 || xx >= CX || zz >= CZ || y >= CY) continue;
            if (c.get(xx, y, zz) === B.AIR) c.set(xx, y, zz, B.LEAF);
          }
        } else if (dim === "rainbow" && th < 0.01) {
          const thh = 3 + Math.floor(hash2(x, z, seed + 202) * 3);
          for (let y = h + 1; y <= h + thh; y++) c.set(lx, y, lz, B.CORAL);
        }
      }
    }
  }

  // floating dream islands (rainbow)
  if (dim === "rainbow") {
    const isl = islandsNear(x0, z0, x0 + CX, z0 + CZ, seed);
    for (const is of isl) {
      const r = Math.ceil(is.r);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > is.r) continue;
        const gx = Math.round(is.x) + dx, gz = Math.round(is.z) + dz;
        const lx = gx - x0, lz = gz - z0;
        if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
        const depth = Math.floor(is.r - d) + 2;
        for (let dy = 0; dy < depth; dy++) {
          const y = Math.floor(is.y) - dy;
          if (y < 1 || y >= CY - 2) continue;
          const b = dy === 0 ? B.P_GRASS : B.P_DIRT;
          if (c.get(lx, y, lz) === B.AIR) c.set(lx, y, lz, b);
        }
        // crystal sprout
        if (Math.abs(dx) < 1 && Math.abs(dz) < 1 && hash2(gx, gz, seed + 305) < 0.5) {
          const y = Math.floor(is.y) + 1;
          if (y < CY - 1) c.set(lx, y, lz, B.CORAL);
        }
      }
    }
  }
}

/* ── meshing ── */
export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.72 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.72 },
  { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.5 },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], shade: 0.84 },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], shade: 0.84 },
];

function tileUV(tile: number, x: number, y: number, uvs: number[]): void {
  const tx = tile % 8, ty = Math.floor(tile / 8);
  uvs.push(tx / 8 + x * 0.0015, 1 - (ty + 1) / 2 + (1 - y) * 0.0015);
}

export function buildChunkMesh(c: Chunk, getNeighbor: (x: number, y: number, z: number) => number, dim: Dim): { solid: MeshData; water: MeshData; glow: MeshData } {
  const solid: MeshData = { positions: [], uvs: [], colors: [], indices: [] };
  const water: MeshData = { positions: [], uvs: [], colors: [], indices: [] };
  const glow: MeshData = { positions: [], uvs: [], colors: [], indices: [] };
  const x0 = c.cx * CX, z0 = c.cz * CZ;

  const addFace = (m: MeshData, tile: number, shade: number, corners: number[][], ox: number, oy: number, oz: number, waterDrop: boolean) => {
    const base = m.positions.length / 3;
    for (const cn of corners) {
      let y = oy + cn[1];
      if (waterDrop && cn[1] === 1) y -= 0.12;
      m.positions.push(ox + cn[0], y, oz + cn[2]);
      const s = shade * (0.92 + hash2(cn[0] * 13 + cn[1] * 7 + cn[2] * 3, tile * 5, 7) * 0.08);
      m.colors.push(s, s, s);
    }
    tileUV(tile, 0, 1, m.uvs); tileUV(tile, 1, 1, m.uvs); tileUV(tile, 1, 0, m.uvs); tileUV(tile, 0, 0, m.uvs);
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let lx = 0; lx < CX; lx++) for (let lz = 0; lz < CZ; lz++) for (let y = 0; y < CY; y++) {
    const b = c.blocks[c.idx(lx, y, lz)];
    if (b === B.AIR) continue;
    const def = BLOCKS[b];
    const isWater = b === B.WATER;
    const m = isWater ? water : def.glow ? glow : solid;
    const wx = x0 + lx, wz = z0 + lz;
    for (const f of FACES) {
      const nb = isWater
        ? getNeighbor(wx + f.dir[0], y + f.dir[1], wz + f.dir[2])
        : getNeighbor(wx + f.dir[0], y + f.dir[1], wz + f.dir[2]);
      const nbDef = BLOCKS[nb];
      if (isWater) {
        if (nb !== B.AIR) continue;
      } else {
        if (nb !== B.AIR && !(nbDef.transparent && nb !== b)) continue;
        if (nbDef.transparent && nbDef.glow) continue;
      }
      const tile = f.dir[1] === 1 ? def.tiles[0] : f.dir[1] === -1 ? def.tiles[2] : def.tiles[1];
      addFace(m, tile, f.shade, f.corners, wx, y, wz, isWater);
    }
  }
  void dim;
  return { solid, water, glow };
}

/* ── DDA voxel raycast ── */
export function raycastVoxel(
  getBlock: (x: number, y: number, z: number) => number,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX) : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : Infinity;
  let nx = 0, ny = 0, nz = 0;
  let t = 0;
  for (let i = 0; i < 256 && t < maxDist; i++) {
    const b = getBlock(x, y, z);
    if (b !== B.AIR && b !== B.WATER) return { x, y, z, nx, ny, nz };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
  }
  return null;
}
