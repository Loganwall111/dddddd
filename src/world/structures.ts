import { CONTENT as B, EXTRA } from '../blocks/registry';
import { hash3 } from './noise';
import { biomeAt } from './biomes';
import { surfaceHeight, type GenConfig } from './generator';

type SetBlock = (x: number, y: number, z: number, id: number) => void;

// All mega-structures use wide deterministic grids so the world feels open, not packed.
export function structureCells(ox: number, oz: number, pad: number, spacing: number, radius: number) {
  const cells: { gx: number; gz: number }[] = [];
  for (let gx = Math.floor((ox - radius) / spacing); gx <= Math.floor((ox + pad + radius) / spacing); gx++)
    for (let gz = Math.floor((oz - radius) / spacing); gz <= Math.floor((oz + pad + radius) / spacing); gz++) cells.push({ gx, gz });
  return cells;
}

export function buildDesertPyramid(cx: number, baseY: number, cz: number, set: SetBlock, seed: number) {
  const half = 20;
  for (let layer = 0; layer < 20; layer++) {
    const r = half - layer;
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const edge = Math.abs(x) === r || Math.abs(z) === r || layer === 0;
      if (!edge && layer > 2 && layer < 15 && Math.abs(x) < r - 2 && Math.abs(z) < r - 2) continue;
      let id: number = B.MARBLE;
      if (layer === 0) id = EXTRA.PYRAMID_BRICK;
      else if ((x + z + layer) % 9 === 0) id = EXTRA.PYRAMID_BRICK;
      if (layer < 3 && Math.abs(x) < 2 && z === -r) id = 0;
      set(cx + x, baseY + layer, cz + z, id);
    }
  }
  // Entrance corridor + burial chamber with colored lights and tomb goods.
  for (let z = -half; z <= 2; z++) for (let y = 1; y <= 4; y++) { set(cx - 1, baseY + y, cz + z, 0); set(cx, baseY + y, cz + z, 0); set(cx + 1, baseY + y, cz + z, 0); }
  for (let x = -6; x <= 6; x++) for (let z = -4; z <= 6; z++) for (let y = 1; y <= 6; y++) {
    const wall = Math.abs(x) === 6 || Math.abs(z + (z < 1 ? 4 : -6)) === 0 || y === 6;
    if (x >= -6 && x <= 6 && z >= -4 && z <= 6) set(cx + x, baseY + y, cz + z, wall ? EXTRA.PYRAMID_BRICK : 0);
  }
  set(cx, baseY + 1, cz + 1, EXTRA.SARCOPHAGUS); set(cx, baseY + 2, cz + 1, EXTRA.TOMB_LANTERN);
  set(cx - 5, baseY + 2, cz - 3, EXTRA.TOMB_LANTERN); set(cx + 5, baseY + 2, cz - 3, EXTRA.TOMB_LANTERN);
  set(cx - 5, baseY + 2, cz + 5, 28); set(cx + 5, baseY + 2, cz + 5, 28);
  set(cx - 4, baseY + 1, cz + 4, 29); set(cx + 4, baseY + 1, cz + 4, 29);
  set(cx - 3, baseY + 1, cz - 2, EXTRA.ANCIENT_POT); set(cx + 3, baseY + 1, cz - 2, EXTRA.ANCIENT_POT);
  set(cx, baseY + 20, cz, EXTRA.TOMB_LANTERN);
  void seed;
}

export function buildObsidianMansion(cx: number, baseY: number, cz: number, set: SetBlock) {
  const w = 13, d = 9;
  for (let x = -w; x <= w; x++) for (let z = -d; z <= d; z++) {
    set(cx + x, baseY, cz + z, B.BLACKSTONE);
    for (let y = 1; y <= 8; y++) {
      const wall = Math.abs(x) === w || Math.abs(z) === d;
      const floorSlab = y === 4 && !wall;
      const door = y <= 3 && Math.abs(x) < 2 && z === -d;
      const window = (y === 2 || y === 6) && wall && (x + z) % 4 === 0;
      if (door) { set(cx + x, baseY + y, cz + z, 0); continue; }
      if (wall) set(cx + x, baseY + y, cz + z, window ? 9 : y > 4 ? B.ANCIENT_FRAME : EXTRA.OBSIDIAN_BRICK);
      else if (floorSlab) set(cx + x, baseY + y, cz + z, B.SLATE_BRICK);
      else if (y === 1 || y === 5) set(cx + x, baseY + y, cz + z, 0);
    }
    set(cx + x, baseY + 9, cz + z, EXTRA.OBSIDIAN_BRICK);
  }
  for (const [tx, ty, tz, id] of [[-w + 2, 2, 0, 31], [w - 2, 2, 0, 31], [0, 2, d - 2, 105], [0, 6, 0, 106], [-6, 6, -4, 28], [6, 6, 4, 28]] as const)
    set(cx + tx, baseY + ty, cz + tz, id);
  set(cx - 8, baseY + 1, cz + 5, 29); set(cx + 8, baseY + 1, cz + 5, 24);
  // Corner spires keep the silhouette readable from far away.
  for (const [sx, sz] of [[-w, -d], [w, -d], [-w, d], [w, d]]) for (let y = 9; y < 15; y++) { set(cx + sx, baseY + y, cz + sz, EXTRA.OBSIDIAN_BRICK); }
  set(cx - w, baseY + 15, cz - d, 34); set(cx + w, baseY + 15, cz + d, 35);
}

export function buildVolcano(cx: number, baseY: number, cz: number, radius: number, height: number, set: SetBlock, seed: number) {
  for (let y = 0; y <= height; y++) {
    const r = Math.max(2, Math.floor(radius * (1 - y / (height + 6))));
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x, z);
      if (d > r) continue;
      const crater = y > height - 5 && d < r * 0.45;
      if (crater) { set(cx + x, baseY + y, cz + z, y >= height - 2 ? 31 : 22); continue; }
      const lavaVein = hash3(cx + x, y, cz + z, seed) > 0.93 && y > height * 0.4;
      set(cx + x, baseY + y, cz + z, lavaVein ? 31 : d > r - 1.5 ? EXTRA.VOLCANIC_ASH : y % 4 === 0 ? 85 : 22);
    }
  }
  set(cx, baseY + height - 1, cz, 31);
}

export function buildGiantFossil(cx: number, baseY: number, cz: number, set: SetBlock, seed: number) {
  const len = 14 + Math.floor(hash3(cx, 7, cz, seed) * 10);
  const angle = hash3(cx, 9, cz, seed) * Math.PI;
  const dx = Math.cos(angle), dz = Math.sin(angle);
  for (let i = 0; i < len; i++) {
    const x = Math.round(cx + dx * i), z = Math.round(cz + dz * i), y = baseY + Math.round(Math.sin(i * 0.4) * 2);
    set(x, y, z, 69); set(x, y + 1, z, 69);
    if (i % 3 === 1) for (let s = -4; s <= 4; s++) { if (s === 0) continue; set(Math.round(x - dz * s), y + 4 - Math.abs(s), Math.round(z + dx * s), 69); }
  }
  set(Math.round(cx + dx * len), baseY + 2, Math.round(cz + dz * len), 69);
}

export function volcanoNear(x: number, z: number, seed: number, maxDist = 160): { x: number; z: number } | null {
  const spacing = 560;
  const gx = Math.round(x / spacing), gz = Math.round(z / spacing);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const ax = gx + dx, az = gz + dz;
    if (hash3(ax, 515, az, seed) > 0.45) continue;
    const vx = ax * spacing + 140, vz = az * spacing - 90;
    if (Math.hypot(x - vx, z - vz) < maxDist) return { x: vx, z: vz };
  }
  return null;
}

export function applyMegaStructures(ox: number, oz: number, pad: number, cfg: GenConfig, set: SetBlock) {
  if (cfg.dimension !== 'overworld' || cfg.preset === 'flat') return;
  const seed = cfg.seed;
  // Desert pyramids: rare, only where deserts actually exist.
  for (const { gx, gz } of structureCells(ox, oz, pad, 620, 30)) {
    if (hash3(gx, 771, gz, seed) > 0.3) continue;
    const x = gx * 620 + 210, z = gz * 620 - 140;
    if (Math.hypot(x, z) < 260) continue;
    const h = surfaceHeight(x, z, cfg);
    const b = biomeAt(x, z, seed, 'overworld', h);
    if (b.id !== 'desert' && b.id !== 'bones' && b.id !== 'badlands') continue;
    if (x + 22 < ox || x - 22 > ox + pad || z + 22 < oz || z - 22 > oz + pad) continue;
    buildDesertPyramid(x, h, z, set, seed);
  }
  // Obsidian mansions in dark / volcanic territory.
  for (const { gx, gz } of structureCells(ox, oz, pad, 840, 24)) {
    if (hash3(gx, 772, gz, seed) > 0.26) continue;
    const x = gx * 840 - 320, z = gz * 840 + 180;
    if (Math.hypot(x, z) < 320) continue;
    const h = surfaceHeight(x, z, cfg);
    const b = biomeAt(x, z, seed, 'overworld', h);
    if (b.id !== 'darkwood' && b.id !== 'volcanic' && b.id !== 'crag') continue;
    if (x + 18 < ox || x - 18 > ox + pad || z + 14 < oz || z - 14 > oz + pad) continue;
    buildObsidianMansion(x, h, z, set);
  }
  // Volcanoes rise from volcanic wastes.
  for (const { gx, gz } of structureCells(ox, oz, pad, 560, 44)) {
    if (hash3(gx, 515, gz, seed) > 0.45) continue;
    const x = gx * 560 + 140, z = gz * 560 - 90;
    if (Math.hypot(x - 2, z + 4) < 200) continue;
    const h = surfaceHeight(x, z, cfg);
    const b = biomeAt(x, z, seed, 'overworld', h);
    if (b.id !== 'volcanic') continue;
    if (x + 44 < ox || x - 44 > ox + pad || z + 44 < oz || z - 44 > oz + pad) continue;
    buildVolcano(x, Math.max(8, h - 6), z, 24 + Math.floor(hash3(gx, 3, gz, seed) * 10), 26 + Math.floor(hash3(gx, 5, gz, seed) * 10), set, seed);
  }
  // Colossal desert fossils.
  for (const { gx, gz } of structureCells(ox, oz, pad, 420, 20)) {
    if (hash3(gx, 773, gz, seed) > 0.34) continue;
    const x = gx * 420 + 90, z = gz * 420 + 260;
    const h = surfaceHeight(x, z, cfg);
    if (biomeAt(x, z, seed, 'overworld', h).id !== 'desert' && biomeAt(x, z, seed, 'overworld', h).id !== 'bones') continue;
    if (x + 20 < ox || x - 20 > ox + pad || z + 20 < oz || z - 20 > oz + pad) continue;
    buildGiantFossil(x, h, z, set, seed);
  }
}
