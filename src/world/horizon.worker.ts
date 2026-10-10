import { getBiome, islandDepth, surfaceHeight, type GenConfig } from './generator';
import { ATLAS_COLS, ATLAS_ROWS } from '../blocks/registry';
import { DIMENSIONS } from '../core/types';
import { forestMultiplier } from './biomes';
import { hash3 } from './noise';

export interface HorizonRequest { x: number; z: number; radius: number; config: GenConfig; id: number }

globalThis.onmessage = (event: MessageEvent<HorizonRequest>) => {
  const { x: cx, z: cz, radius, config, id } = event.data;
  const step = 8, cells = 37, side = cells * 2 + 3;
  const heights = new Int16Array(side * side), bottoms = new Int16Array(side * side);
  const floating = config.dimension === 'end' || config.dimension === 'sky';
  const index = (x: number, z: number) => (x + cells + 1) * side + z + cells + 1;
  for (let gx = -cells - 1; gx <= cells + 1; gx++) for (let gz = -cells - 1; gz <= cells + 1; gz++) {
    const x = cx + gx * step + 4, z = cz + gz * step + 4;
    const depth = floating ? islandDepth(x, z, config.seed) : 1;
    const h = depth <= 0 ? -100 : Math.floor(surfaceHeight(x, z, config) / 2) * 2;
    heights[index(gx, gz)] = h;
    bottoms[index(gx, gz)] = floating ? h - Math.ceil(depth * 23) : 0;
  }

  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const waterPositions: number[] = [], waterNormals: number[] = [], waterUVs: number[] = [], waterIndices: number[] = [];
  const quad = (points: number[][], normal: number[], tile: number, light: number) => {
    const start = positions.length / 3;
    for (const p of points) {
      positions.push(...p); normals.push(...normal);
      uvs.push((tile % ATLAS_COLS + .5) / ATLAS_COLS, 1 - (Math.floor(tile / ATLAS_COLS) + .5) / ATLAS_ROWS);
      colors.push(light, light, light, 1);
    }
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, blockId: number, light = 0.86) => {
    const side = blockId * 2, top = side + 1;
    quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], [0,1,0], top, light);
    quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], [0,-1,0], side, light * .65);
    quad([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], [1,0,0], side, light * .87);
    quad([[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0]], [-1,0,0], side, light * .77);
    quad([[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1]], [0,0,1], side, light * .91);
    quad([[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]], [0,0,-1], side, light * .81);
  };

  for (let gx = -cells; gx <= cells; gx++) for (let gz = -cells; gz <= cells; gz++) {
    const level = DIMENSIONS[config.dimension].water;
    if (level > 0 && Math.min(heights[index(gx,gz)], heights[index(gx+1,gz)], heights[index(gx-1,gz)], heights[index(gx,gz+1)], heights[index(gx,gz-1)]) < level) {
      const x = cx + gx * step, z = cz + gz * step, first = waterPositions.length / 3;
      for (const [dx,dz] of [[0,step],[step,step],[step,0],[0,0]]) {
        waterPositions.push(x + dx, 0, z + dz); waterNormals.push(0,1,0); waterUVs.push((x + dx) / 128, (z + dz) / 128);
      }
      waterIndices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    }
    if (Math.hypot(gx * step, gz * step) < Math.max(16, (radius - 1.8) * 16)) continue;
    const x = cx + gx * step, z = cz + gz * step, h = heights[index(gx,gz)];
    if (h < 0) continue;
    const top = h + .65, bottom = bottoms[index(gx,gz)], biome = getBiome(x + 4, z + 4, config);
    quad([[x,top,z+step],[x+step,top,z+step],[x+step,top,z],[x,top,z]], [0,1,0], biome.top * 2 + 1, .94);
    const sideTile = biome.soil * 2;
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const neighbor = heights[index(gx + dx,gz + dz)], low = Math.max(bottom, neighbor + .65);
      if (low >= top) continue;
      if (dx === 1) quad([[x+step,low,z],[x+step,top,z],[x+step,top,z+step],[x+step,low,z+step]], [1,0,0], sideTile, .83);
      if (dx === -1) quad([[x,low,z+step],[x,top,z+step],[x,top,z],[x,low,z]], [-1,0,0], sideTile, .72);
      if (dz === 1) quad([[x+step,low,z+step],[x+step,top,z+step],[x,top,z+step],[x,low,z+step]], [0,0,1], sideTile, .87);
      if (dz === -1) quad([[x,low,z],[x,top,z],[x+step,top,z],[x+step,low,z]], [0,0,-1], sideTile, .77);
    }
    if (floating) quad([[x,bottom,z],[x+step,bottom,z],[x+step,bottom,z+step],[x,bottom,z+step]], [0,-1,0], sideTile, .5);
  }

  // Add low-polygon silhouettes outside the detailed chunk radius. This keeps forests visible
  // from cliffs and flight without pretending the coarse horizon contains exact tree geometry.
  if (config.dimension === 'overworld' && config.preset !== 'flat' && config.generationVersion !== 1) {
    const extent = cells * step;
    const detailedRadius = Math.max(16, (radius - 1.8) * 16);
    const minGX = Math.floor((cx - extent) / 9) - 1, maxGX = Math.ceil((cx + extent) / 9) + 1;
    const minGZ = Math.floor((cz - extent) / 9) - 1, maxGZ = Math.ceil((cz + extent) / 9) + 1;
    for (let gx = minGX; gx <= maxGX; gx++) for (let gz = minGZ; gz <= maxGZ; gz++) {
      const chance = hash3(gx, 97, gz, config.seed);
      const x = gx * 9 + 2 + Math.floor(hash3(gx, 3, gz, config.seed) * 5);
      const z = gz * 9 + 2 + Math.floor(hash3(gx, 9, gz, config.seed) * 5);
      const distance = Math.hypot(x - cx, z - cz);
      if (distance <= detailedRadius || distance > extent - 16 || Math.hypot(x - 2, z + 4) < 12 || Math.hypot(x - 21, z - 5) < 21) continue;
      const h = surfaceHeight(x, z, config), biome = getBiome(x, z, config);
      const density = biome.density * forestMultiplier(x, z, config.seed);
      if (!biome.tree || chance > density || h < DIMENSIONS.overworld.water + 1 || h >= 124) continue;

      const conifer = biome.tree === 5 || biome.tree === 115;
      const jungle = biome.id === 'jungle', savanna = biome.id === 'savanna';
      const trunkHeight = jungle ? 10 + Math.floor(hash3(gx, 6, gz, config.seed) * 4) : conifer ? 9 : savanna ? 4 : 5 + Math.floor(hash3(gx, 6, gz, config.seed) * 3);
      box(x + .25, h + 1, z + .25, x + .75, h + trunkHeight + 1, z + .75, biome.tree, .78);
      const topY = h + trunkHeight;
      const winterSnow = config.season === 'Winter' && biome.climate !== 'hot';
      if (savanna) {
        box(x - 3, topY + 1, z - 3, x + 4, topY + 2, z + 4, biome.foliage, .93);
      } else if (conifer) {
        const tiers = [
          { bottom: trunkHeight - 6, top: trunkHeight - 4, radius: 3 },
          { bottom: trunkHeight - 4, top: trunkHeight - 2, radius: 3 },
          { bottom: trunkHeight - 2, top: trunkHeight, radius: 2 },
          { bottom: trunkHeight, top: trunkHeight + 2, radius: 1 },
        ];
        for (let tier = 0; tier < tiers.length; tier++) {
          const layer = tiers[tier], leaf = winterSnow && tier === tiers.length - 1 ? 10 : biome.foliage;
          box(x - layer.radius, h + layer.bottom, z - layer.radius, x + layer.radius + 1, h + layer.top, z + layer.radius + 1, leaf, .88);
        }
      } else {
        const tiers = [
          { bottom: trunkHeight - 2, top: trunkHeight, radius: jungle ? 3 : 2 },
          { bottom: trunkHeight, top: trunkHeight + 2, radius: jungle ? 3 : 2 },
          { bottom: trunkHeight + 2, top: trunkHeight + 3, radius: 1 },
        ];
        for (let tier = 0; tier < tiers.length; tier++) {
          const layer = tiers[tier], leaf = winterSnow && tier === tiers.length - 1 ? 10 : biome.foliage;
          box(x - layer.radius, h + layer.bottom, z - layer.radius, x + layer.radius + 1, h + layer.top, z + layer.radius + 1, leaf, .88);
        }
      }
    }
  }

  const water = { positions: new Float32Array(waterPositions), normals: new Float32Array(waterNormals), uvs: new Float32Array(waterUVs), indices: new Uint32Array(waterIndices) };
  const data = { id, dimension: config.dimension, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), colors: new Float32Array(colors), indices: new Uint32Array(indices), water };
  globalThis.postMessage(data, { transfer: [data.positions.buffer, data.normals.buffer, data.uvs.buffer, data.colors.buffer, data.indices.buffer, water.positions.buffer, water.normals.buffer, water.uvs.buffer, water.indices.buffer] });
};
