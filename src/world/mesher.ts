import { block, ATLAS_COLS, ATLAS_ROWS } from '../blocks/registry';
import { HEIGHT, PAD, SIZE, paddedIndex } from './generator';

export interface MeshArrays { positions: Float32Array; normals: Float32Array; uvs: Float32Array; colors: Float32Array; indices: Uint32Array }
export function meshChunk(data: Uint16Array | Uint8Array, layer: 'all' | 'opaque' | 'glass' = 'all'): MeshArrays {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const get = (x: number, y: number, z: number) => x < -1 || x >= PAD - 1 || z < -1 || z >= PAD - 1 || y < 0 || y >= HEIGHT ? 0 : data[paddedIndex(x + 1, y, z + 1)];
  const dims = [SIZE, HEIGHT, SIZE];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, width = dims[u], height = dims[v];
    const mask = new Uint16Array(width * height), cell = [0,0,0], normal = [0,0,0]; normal[axis] = sign;
    const shade = axis === 1 ? sign > 0 ? 1 : .57 : axis === 0 ? sign > 0 ? .87 : .77 : sign > 0 ? .91 : .81;
    for (let slice = 0; slice < dims[axis]; slice++) {
      cell[axis] = slice;
      for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
        cell[u] = i; cell[v] = j;
        const id = get(cell[0], cell[1], cell[2]);
        const neighbor = get(cell[0] + normal[0], cell[1] + normal[1], cell[2] + normal[2]);
        const included=layer==='all'||(layer==='glass'?id===9:id!==9);
        mask[j * width + i] = id && included && !block(id).portal && (!neighbor || block(neighbor).portal || neighbor===9&&id!==9) ? id : 0;
      }
      for (let j = 0; j < height; j++) for (let i = 0; i < width;) {
        const id = mask[j * width + i];
        if (!id) { i++; continue; }
        let w = 1, h = 1;
        while (i + w < width && mask[j * width + i + w] === id) w++;
        rows: while (j + h < height) {
          for (let k = 0; k < w; k++) if (mask[(j + h) * width + i + k] !== id) break rows;
          h++;
        }
        const first = positions.length / 3, tile = id * 2 + (axis === 1 && sign > 0 ? 1 : 0);
        const corners = [[0,0],[w,0],[w,h],[0,h]];
        for (let c = 0; c < 4; c++) {
          const point = [0,0,0]; point[axis] = slice + (sign > 0 ? 1 : 0); point[u] = i + corners[c][0]; point[v] = j + corners[c][1];
          positions.push(...point); normals.push(...normal);
          uvs.push((tile % ATLAS_COLS + .5) / ATLAS_COLS, 1 - (Math.floor(tile / ATLAS_COLS) + .5) / ATLAS_ROWS);
          const probe = [...point]; probe[axis] = slice + sign;
          probe[u] = i + (corners[c][0] === 0 ? -1 : w); probe[v] = j + (corners[c][1] === 0 ? 0 : h - 1);
          const sideA = block(get(probe[0], probe[1], probe[2])).solid ? 1 : 0;
          probe[u] = i + (corners[c][0] === 0 ? 0 : w - 1); probe[v] = j + (corners[c][1] === 0 ? -1 : h);
          const sideB = block(get(probe[0], probe[1], probe[2])).solid ? 1 : 0;
          const light = block(id).emissive ? 1 : shade * (1 - (sideA + sideB) * .12);
          colors.push(light, light, light, 1);
        }
        if (sign > 0) indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
        else indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        for (let y = 0; y < h; y++) mask.fill(0, (j + y) * width + i, (j + y) * width + i + w);
        i += w;
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}