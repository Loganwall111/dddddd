import { BlockId } from "../blocks/blocks";

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const SEA_LEVEL = 48;

export interface ChunkData {
  cx: number;
  cz: number;
  dim: string;            // dimension id
  // flat array: index = y*CHUNK_SIZE*CHUNK_SIZE + z*CHUNK_SIZE + x
  blocks: Uint16Array;
  dirty: boolean;         // mesh needs rebuild
  generated: boolean;
}

export function chunkIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
}

export function createEmptyChunk(cx: number, cz: number, dim: string): ChunkData {
  return {
    cx, cz, dim,
    blocks: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT),
    dirty: false,
    generated: false,
  };
}

export function getBlock(chunk: ChunkData, lx: number, ly: number, lz: number): BlockId {
  if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE) return BlockId.Air;
  return chunk.blocks[chunkIndex(lx, ly, lz)] as BlockId;
}
export function setBlock(chunk: ChunkData, lx: number, ly: number, lz: number, id: BlockId) {
  if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE) return;
  chunk.blocks[chunkIndex(lx, ly, lz)] = id;
  chunk.dirty = true;
}
