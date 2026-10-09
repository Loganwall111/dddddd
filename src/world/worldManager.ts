// WorldManager holds the chunk map, performs asynchronous terrain generation,
// and manages per-chunk Babylon meshes.
import { Scene, Mesh, StandardMaterial, Texture, Color3, Vector3, VertexData } from "@babylonjs/core";
import { BlockId, BLOCKS } from "../blocks/blocks";
import { ChunkData, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, chunkIndex, createEmptyChunk, getBlock, setBlock } from "./chunk";
import { buildChunkMesh, applyBuiltMesh, applyWaterMesh } from "./mesher";
import { GeneratorConfig, generateChunk, DimensionId, WorldType } from "./generator";
import { tileUV } from "../blocks/textureGen";

type ChunkKey = string;
function key(cx: number, cz: number, dim: string): ChunkKey { return `${dim}:${cx},${cz}`; }

export interface WorldSettings {
  name: string;
  seed: number;
  worldType: WorldType;
  gameMode: "creative" | "survival";
  created: number;
  lastPlayed: number;
}

// dimension-specific generator configs derived from world seed
export class WorldManager {
  scene: Scene;
  settings: WorldSettings;
  chunks = new Map<ChunkKey, ChunkData>();
  chunkMeshes = new Map<ChunkKey, { solid: Mesh; water: Mesh }>();
  activeDimension: DimensionId = "overworld";
  renderDistance: number = 8;
  solidMaterial: StandardMaterial;
  waterMaterial: StandardMaterial;
  // Mesh rebuild queue
  private dirtyQueue: ChunkKey[] = [];
  // Generation in progress flag
  private genCounter: number = 0;

  constructor(scene: Scene, settings: WorldSettings, solidMaterial: StandardMaterial, waterMaterial: StandardMaterial) {
    this.scene = scene;
    this.settings = settings;
    this.solidMaterial = solidMaterial;
    this.waterMaterial = waterMaterial;
  }

  getGenConfig(dim: DimensionId = this.activeDimension): GeneratorConfig {
    return { seed: this.settings.seed, worldType: this.settings.worldType, dimension: dim };
  }

  getChunk(cx: number, cz: number, dim: string = this.activeDimension): ChunkData | undefined {
    return this.chunks.get(key(cx, cz, dim));
  }

  ensureChunk(cx: number, cz: number, dim: string = this.activeDimension): ChunkData {
    const k = key(cx, cz, dim);
    let c = this.chunks.get(k);
    if (!c) {
      c = createEmptyChunk(cx, cz, dim);
      this.chunks.set(k, c);
    }
    return c;
  }

  // Generate a chunk synchronously (used when generating in batches from render loop).
  generateSync(cx: number, cz: number, dim: DimensionId = this.activeDimension): ChunkData {
    const c = this.ensureChunk(cx, cz, dim);
    if (!c.generated) {
      generateChunk(this.getGenConfig(dim), c);
      this.markDirty(cx, cz, dim);
    }
    return c;
  }

  // Block access in world coordinates
  getBlockWorld(wx: number, wy: number, wz: number, dim: string = this.activeDimension): BlockId {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const c = this.chunks.get(key(cx, cz, dim));
    if (!c) return BlockId.Air;
    return getBlock(c, lx, wy, lz);
  }

  setBlockWorld(wx: number, wy: number, wz: number, id: BlockId, dim: string = this.activeDimension): void {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const c = this.ensureChunk(cx, cz, dim);
    if (!c.generated) generateChunk(this.getGenConfig(dim as DimensionId), c);
    setBlock(c, lx, wy, lz, id);
    // mark neighbors dirty if on an edge
    if (lx === 0) this.markDirty(cx-1, cz, dim);
    if (lx === CHUNK_SIZE-1) this.markDirty(cx+1, cz, dim);
    if (lz === 0) this.markDirty(cx, cz-1, dim);
    if (lz === CHUNK_SIZE-1) this.markDirty(cx, cz+1, dim);
    this.markDirty(cx, cz, dim);
  }

  markDirty(cx: number, cz: number, dim: string) {
    const k = key(cx, cz, dim);
    const c = this.chunks.get(k);
    if (c) c.dirty = true;
    if (!this.dirtyQueue.includes(k)) this.dirtyQueue.push(k);
  }

  // Called from render loop to update chunks around player position
  update(playerWorldX: number, playerWorldZ: number, dim: string, maxGenPerFrame = 1, maxBuildsPerFrame = 2): number {
    const pcx = Math.floor(playerWorldX / CHUNK_SIZE);
    const pcz = Math.floor(playerWorldZ / CHUNK_SIZE);
    const r = this.renderDistance;

    // 1) Ensure chunks exist and generate missing ones in order of distance.
    // Generate up to N new chunks per frame.
    const want: { cx: number; cz: number; dist: number }[] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = pcx+dx, cz = pcz+dz;
      const dist = dx*dx + dz*dz;
      if (dist > r*r) continue;
      want.push({ cx, cz, dist });
    }
    want.sort((a,b)=>a.dist-b.dist);
    let generated = 0;
    for (const w of want) {
      const k = key(w.cx, w.cz, dim);
      let c = this.chunks.get(k);
      if (!c) {
        c = createEmptyChunk(w.cx, w.cz, dim);
        this.chunks.set(k, c);
      }
      if (!c.generated) {
        generateChunk(this.getGenConfig(dim as DimensionId), c);
        this.markDirty(w.cx, w.cz, dim);
        generated++;
        if (generated >= maxGenPerFrame) break;
      }
    }

    // 2) Rebuild dirty meshes (up to maxBuildsPerFrame per frame)
    let built = 0;
    // Prioritize dirty chunks within radius first
    const dirtySorted = this.dirtyQueue
      .map((k) => {
        const [d, rest] = k.split(":");
        const [cxs, czs] = rest.split(",");
        return { k, cx: parseInt(cxs), cz: parseInt(czs), dim: d };
      })
      .filter(c => c.dim === dim)
      .sort((a,b) => {
        const da = (a.cx-pcx)*(a.cx-pcx)+(a.cz-pcz)*(a.cz-pcz);
        const db = (b.cx-pcx)*(b.cx-pcx)+(b.cz-pcz)*(b.cz-pcz);
        return da - db;
      });
    for (const { k, cx, cz, dim: d } of dirtySorted) {
      if (built >= maxBuildsPerFrame) break;
      const c = this.chunks.get(k);
      if (!c || !c.generated) continue;
      this.rebuildMesh(cx, cz, d);
      c.dirty = false;
      this.dirtyQueue = this.dirtyQueue.filter(x => x !== k);
      built++;
    }

    // 3) Unload chunks outside render distance + buffer
    const unloadR = r + 2;
    for (const [k, c] of this.chunks) {
      const [d] = k.split(":");
      if (d !== dim) {
        const mm = this.chunkMeshes.get(k);
        if (mm) { mm.solid.isVisible = false; mm.water.isVisible = false; }
        continue;
      }
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx*dx + dz*dz > unloadR*unloadR) {
        const m = this.chunkMeshes.get(k);
        if (m) { m.solid.dispose(); m.water.dispose(); this.chunkMeshes.delete(k); }
        // keep chunk data in memory for quick return, but limit total loaded to ~(2r+5)^2
      }
    }
    // Hard cap on chunk count: dispose data beyond cap
    const cap = (r+4)*(r+4)*2;
    if (this.chunks.size > cap) {
      // remove furthest chunks (not in dim within r+3)
      const arr = [...this.chunks.entries()].map(([k,c])=>{
        const [d] = k.split(":");
        return {k,c,d};
      });
      arr.sort((a,b)=>{
        if (a.d !== dim) return -1;
        if (b.d !== dim) return 1;
        const da = (a.c.cx-pcx)**2+(a.c.cz-pcz)**2;
        const db = (b.c.cx-pcx)**2+(b.c.cz-pcz)**2;
        return db-da;
      });
      while (this.chunks.size > cap && arr.length) {
        const entry = arr.pop()!;
        if (entry.d === dim) {
          const dx = entry.c.cx-pcx, dz=entry.c.cz-pcz;
          if (dx*dx+dz*dz <= (r+3)*(r+3)) continue;
        }
        const m = this.chunkMeshes.get(entry.k);
        if (m) { m.solid.dispose(); m.water.dispose(); this.chunkMeshes.delete(entry.k); }
        this.chunks.delete(entry.k);
      }
    }

    // Update mesh visibility for current dimension (hide others)
    for (const [k, m] of this.chunkMeshes) {
      const [d] = k.split(":");
      const vis = d === dim;
      m.solid.isVisible = vis && m.solid.getTotalVertices() > 0;
      m.water.isVisible = vis && m.water.getTotalVertices() > 0;
    }

    return generated + built;
  }

  private keepMeshHidden(_k: string) { /* hidden by visibility toggle above */ }

  private rebuildMesh(cx: number, cz: number, dim: string) {
    const c = this.chunks.get(key(cx,cz,dim));
    if (!c) return;
    const built = buildChunkMesh(c, this);
    // Position meshes at world origin of chunk
    const wx = cx*CHUNK_SIZE, wz = cz*CHUNK_SIZE;
    let entry = this.chunkMeshes.get(key(cx,cz,dim));
    if (!entry) {
      const solid = new Mesh(`chunk:${dim}:${cx},${cz}`, this.scene);
      const water = new Mesh(`water:${dim}:${cx},${cz}`, this.scene);
      solid.position.set(wx, 0, wz);
      water.position.set(wx, 0, wz);
      solid.isPickable = false; water.isPickable = false;
      solid.receiveShadows = true;
      entry = { solid, water };
      this.chunkMeshes.set(key(cx,cz,dim), entry);
    }
    applyBuiltMesh(this.scene, entry.solid, built, this.solidMaterial);
    applyWaterMesh(this.scene, entry.water, built, this.waterMaterial);
  }

  // Raycast through block grid (DDA voxel traversal) to find first solid block
  raycast(origin: Vector3, dir: Vector3, maxDist: number, dim: string = this.activeDimension):
    { hit: boolean; wx:number; wy:number; wz:number; nx:number; ny:number; nz:number; dist:number; blockId: BlockId }
  {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / dx);
    const tDeltaY = Math.abs(1 / dy);
    const tDeltaZ = Math.abs(1 / dz);
    const voxelBoundaryX = x + (stepX > 0 ? 1 : 0);
    const voxelBoundaryY = y + (stepY > 0 ? 1 : 0);
    const voxelBoundaryZ = z + (stepZ > 0 ? 1 : 0);
    let tMaxX = dx !== 0 ? (voxelBoundaryX - origin.x) / dx : Infinity;
    let tMaxY = dy !== 0 ? (voxelBoundaryY - origin.y) / dy : Infinity;
    let tMaxZ = dz !== 0 ? (voxelBoundaryZ - origin.z) / dz : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let dist = 0;
    const maxSteps = Math.ceil(maxDist) * 4;
    for (let i = 0; i < maxSteps; i++) {
      const b = this.getBlockWorld(x, y, z, dim);
      const def = BLOCKS[b];
      if (def && b !== BlockId.Air && !def.liquid && def.solid) {
        return { hit: true, wx:x, wy:y, wz:z, nx, ny, nz, dist, blockId: b };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; dist = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; dist = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (dist > maxDist) return { hit: false, wx:x, wy:y, wz:z, nx,ny,nz, dist, blockId: BlockId.Air };
      if (y < 0 || y >= CHUNK_HEIGHT) return { hit: false, wx:x, wy:y, wz:z, nx,ny,nz, dist, blockId: BlockId.Air };
    }
    return { hit: false, wx:x, wy:y, wz:z, nx,ny,nz, dist: maxDist, blockId: BlockId.Air };
  }

  // Export modified blocks for saving (only those chunks whose blocks differ from generator? Too expensive; store all generated chunks' block data as we go)
  serializeModifiedChunks(): SerializedChunk[] {
    const out: SerializedChunk[] = [];
    for (const [, c] of this.chunks) {
      if (!c.generated) continue;
      // For now, save all generated chunks (compression friendly). A better
      // approach would diff against generator output. This is sufficient for
      // Phase 1 persistence.
      const blocks = new Uint8Array(c.blocks.length);
      let anyModified = false;
      for (let i = 0; i < c.blocks.length; i++) { blocks[i] = c.blocks[i] & 0xff; if (c.blocks[i]) anyModified = true; }
      if (anyModified) out.push({ cx: c.cx, cz: c.cz, dim: c.dim, blocks: b64fromArr(blocks) });
    }
    return out;
  }

  loadSerializedChunks(chunks: SerializedChunk[]) {
    for (const sc of chunks) {
      const c = this.ensureChunk(sc.cx, sc.cz, sc.dim);
      const data = arrFromB64(sc.blocks);
      for (let i = 0; i < c.blocks.length && i < data.length; i++) c.blocks[i] = data[i];
      c.generated = true;
      c.dirty = true;
      if (!this.dirtyQueue.includes(key(sc.cx, sc.cz, sc.dim))) this.dirtyQueue.push(key(sc.cx, sc.cz, sc.dim));
    }
  }

  dispose() {
    for (const [, m] of this.chunkMeshes) { m.solid.dispose(); m.water.dispose(); }
    this.chunkMeshes.clear();
    this.chunks.clear();
  }
}

export interface SerializedChunk { cx: number; cz: number; dim: string; blocks: string; }

function b64fromArr(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function arrFromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
