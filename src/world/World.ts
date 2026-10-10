import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelMaterial } from '../blocks/textures';
import TerrainWorker from './terrain.worker?worker&inline';
import type { GenConfig } from './generator';
import { SIZE, HEIGHT, blockIndex, surfaceHeight } from './generator';
import type { MeshArrays } from './mesher';
import { DIMENSIONS,type DimensionId, type WorldSave } from '../core/types';
import { seedNumber } from './noise';
import { block } from '../blocks/registry';

interface Special {x:number;y:number;z:number;id:number}
interface Chunk { cx: number; cz: number; data: Uint16Array; mesh: Mesh; glass?:Mesh; revision: number; specials:Special[] }
interface WorkerResult extends MeshArrays { cx: number; cz: number; epoch: number; revision: number; data: Uint16Array; specials:Special[]; glass:MeshArrays|null; error?: string }
export class VoxelWorld {
  readonly chunks = new Map<string, Chunk>();
  config: GenConfig;
  renderDistance = 4;
  onMesh?: (mesh: Mesh, added: boolean) => void;
  onError?: (message: string) => void;
  onRemove?: (id: number, x: number, y: number, z: number) => void;
  private workers: { worker: Worker; busy: boolean }[] = [];
  private queue: { cx: number; cz: number }[] = [];
  private queued = new Set<string>();
  private inFlight = new Set<string>();
  private revisions = new Map<string, number>();
  private editBuckets = new Map<string, Record<string, number>>();
  private epoch = 0;
  private center = { x: Number.NaN, z: Number.NaN };
  private disposed = false;

  constructor(private scene: Scene, private material: VoxelMaterial, public save: WorldSave) {
    this.config = { seed: seedNumber(save.seed), dimension: save.dimension, preset: save.preset, generationVersion: save.generationVersion || 1, season: save.season, siftUnlocked:save.portalKeys?.includes('ancient-city')||false };
    this.indexEdits();
    for (let i = 0; i < 2; i++) {
      const entry = { worker: new TerrainWorker(), busy: false };
      entry.worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        entry.busy = false;
        const result = event.data, key = `${result.cx},${result.cz}`;
        if (result.epoch === this.epoch) {
          this.inFlight.delete(key);
          if (result.error) this.onError?.(result.error);
          else if (result.revision === (this.revisions.get(key) || 0)) this.applyChunk(result);
          else this.enqueue(result.cx, result.cz, true);
        }
        this.dispatch();
      };
      entry.worker.onerror = () => { entry.busy = false; this.onError?.('Terrain worker failed. Please reload this world.'); };
      this.workers.push(entry);
    }
  }
  private indexEdits() {
    this.editBuckets.clear();
    for (const [key, id] of Object.entries(this.save.edits[this.config.dimension] || {})) {
      const [x, , z] = key.split(',').map(Number), chunk = `${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`;
      if (!this.editBuckets.has(chunk)) this.editBuckets.set(chunk, {});
      this.editBuckets.get(chunk)![key] = id;
    }
  }
  private enqueue(cx: number, cz: number, first = false) {
    const key = `${cx},${cz}`;
    if (this.queued.has(key) || this.inFlight.has(key)) return;
    this.queued.add(key);
    if (first) this.queue.unshift({ cx, cz }); else this.queue.push({ cx, cz });
  }
  private dispatch() {
    if (this.disposed) return;
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.length) continue;
      const task = this.queue.shift()!, key = `${task.cx},${task.cz}`;
      this.queued.delete(key); this.inFlight.add(key); slot.busy = true;
      const nearby: Record<string, number> = {};
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const edits = this.editBuckets.get(`${task.cx + dx},${task.cz + dz}`);
        if (!edits) continue;
        for (const [coord, id] of Object.entries(edits)) {
          const [x, , z] = coord.split(',').map(Number);
          if (x >= task.cx * SIZE - 1 && x <= task.cx * SIZE + SIZE && z >= task.cz * SIZE - 1 && z <= task.cz * SIZE + SIZE) nearby[coord] = id;
        }
      }
      slot.worker.postMessage({ ...task, config: this.config, edits: nearby, revision: this.revisions.get(key) || 0, epoch: this.epoch });
    }
  }
  private applyChunk(result: WorkerResult) {
    const key = `${result.cx},${result.cz}`;
    if (Math.abs(result.cx - this.center.x) > this.renderDistance + 1 || Math.abs(result.cz - this.center.z) > this.renderDistance + 1) return;
    const previous = this.chunks.get(key);
    if (previous) this.disposeChunk(previous);
    const mesh = new Mesh(`chunk:${key}`, this.scene), data = new VertexData();
    data.positions = result.positions; data.normals = result.normals; data.uvs = result.uvs; data.colors = result.colors; data.indices = result.indices;
    if (result.positions.length) data.applyToMesh(mesh);
    else mesh.setEnabled(false);
    mesh.material = this.material; mesh.position.set(result.cx * SIZE, 0, result.cz * SIZE);
    mesh.receiveShadows = true; mesh.isPickable = false; mesh.freezeWorldMatrix();
    let glass:Mesh|undefined;
    if(result.glass?.positions.length){glass=new Mesh(`glass:${key}`,this.scene);const g=new VertexData();g.positions=result.glass.positions;g.normals=result.glass.normals;g.uvs=result.glass.uvs;g.colors=result.glass.colors;g.indices=result.glass.indices;g.applyToMesh(glass);glass.position.copyFrom(mesh.position);glass.material=this.material.glassMaterial;glass.isPickable=false;glass.freezeWorldMatrix();this.onMesh?.(glass,true);}
    this.chunks.set(key, { cx: result.cx, cz: result.cz, data: result.data, mesh, glass, revision: result.revision, specials:result.specials });
    this.onMesh?.(mesh, true);
  }
  stream(x: number, z: number, force = false) {
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
    if (this.center.x === cx && this.center.z === cz && !force) { this.dispatch(); return; }
    this.center = { x: cx, z: cz };
    this.queue = this.queue.filter(task => Math.abs(task.cx - cx) <= this.renderDistance && Math.abs(task.cz - cz) <= this.renderDistance);
    this.queued = new Set(this.queue.map(task => `${task.cx},${task.cz}`));
    const needed: { cx: number; cz: number; distance: number }[] = [];
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
      if (dx * dx + dz * dz > (this.renderDistance + .5) ** 2) continue;
      if (!this.chunks.has(`${cx + dx},${cz + dz}`)) needed.push({ cx: cx + dx, cz: cz + dz, distance: dx * dx + dz * dz });
    }
    needed.sort((a, b) => a.distance - b.distance).forEach(task => this.enqueue(task.cx, task.cz));
    for (const [key, chunk] of this.chunks) if (Math.abs(chunk.cx - cx) > this.renderDistance + 1 || Math.abs(chunk.cz - cz) > this.renderDistance + 1) {
      this.disposeChunk(chunk); this.chunks.delete(key);
    }
    this.dispatch();
  }
  isLoaded(x: number, z: number) { return this.chunks.has(`${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`); }
  getBlock(x: number, y: number, z: number): number {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0) return this.config.dimension === 'end' || this.config.dimension === 'sky' ? 0 : 44;
    if (y >= HEIGHT) return 0;
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE), chunk = this.chunks.get(`${cx},${cz}`);
    if (chunk) return chunk.data[blockIndex(x - cx * SIZE, y, z - cz * SIZE)];
    return 0;
  }
  solid(x: number, y: number, z: number) { return block(this.getBlock(x, y, z)).solid; }
  fluidAt(x:number,y:number,z:number){const level=DIMENSIONS[this.config.dimension].water;return y<level&&y>0&&surfaceHeight(x,z,this.config)<level&&!this.solid(x,y,z);}
  setBlock(x: number, y: number, z: number, id: number) {
    if (y < 1 || y >= HEIGHT || !this.isLoaded(x, z)) return false;
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE), key = `${cx},${cz}`, chunk = this.chunks.get(key)!;
    const previous = this.getBlock(x, y, z);
    if (previous === id) return false;
    if (previous) this.onRemove?.(previous, x, y, z);
    const edits = this.save.edits[this.config.dimension] ||= {};
    edits[`${x},${y},${z}`] = id;
    if (!this.editBuckets.has(key)) this.editBuckets.set(key, {});
    this.editBuckets.get(key)![`${x},${y},${z}`] = id;
    chunk.data[blockIndex(x - cx * SIZE, y, z - cz * SIZE)] = id;
    this.invalidate(cx, cz);
    if (x - cx * SIZE === 0) this.invalidate(cx - 1, cz);
    if (x - cx * SIZE === SIZE - 1) this.invalidate(cx + 1, cz);
    if (z - cz * SIZE === 0) this.invalidate(cx, cz - 1);
    if (z - cz * SIZE === SIZE - 1) this.invalidate(cx, cz + 1);
    return true;
  }
  private invalidate(cx: number, cz: number) {
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key)) return;
    this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
    this.enqueue(cx, cz, true);
  }
  ground(x: number, z: number, below = HEIGHT - 1): number {
    if (below === HEIGHT - 1 && (this.config.dimension === 'nether' || this.config.dimension === 'crystal') && this.config.generationVersion !== 1) below = 80;
    if (!this.isLoaded(x, z)) return surfaceHeight(x, z, this.config) + 1;
    for (let y = Math.min(HEIGHT - 1, Math.floor(below)); y >= 0; y--) if (this.solid(x, y, z)) return y + 1;
    return -15;
  }
  changeDimension(dimension: DimensionId) {
    this.epoch++; this.config = { ...this.config, dimension }; this.save.dimension = dimension;
    this.indexEdits();
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear(); this.queue = []; this.queued.clear(); this.inFlight.clear(); this.revisions.clear();
    this.center = { x: Number.NaN, z: Number.NaN };
  }
  updateSeason() {
    if (this.config.season === this.save.season) return;
    this.config.season = this.save.season;
    if (this.config.generationVersion === 1) return;
    for (const chunk of this.chunks.values()) this.invalidate(chunk.cx, chunk.cz);
  }
  unlockSift(){this.config.siftUnlocked=true;for(const chunk of this.chunks.values())this.invalidate(chunk.cx,chunk.cz);}
  async waitForSpawn(x: number, z: number, onProgress: (percent: number) => void, cancelled: () => boolean = () => false) {
    this.stream(x, z, true);
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE), start = performance.now();
    while (!this.disposed) {
      if (cancelled()) throw new Error('Terrain loading cancelled.');
      let loaded = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (this.chunks.has(`${cx + dx},${cz + dz}`)) loaded++;
      onProgress(loaded / 9);
      if (loaded === 9) return;
      if (performance.now() - start > 30000) throw new Error('Terrain generation timed out. Try reloading with a lower render distance.');
      await new Promise(resolve => setTimeout(resolve, 65));
    }
    throw new Error('World closed while loading.');
  }
  dispose() {
    this.disposed = true; this.workers.forEach(slot => slot.worker.terminate());
    this.chunks.forEach(chunk => this.disposeChunk(chunk)); this.chunks.clear();
  }
  private disposeChunk(chunk:Chunk){this.onMesh?.(chunk.mesh,false);chunk.mesh.dispose();if(chunk.glass){this.onMesh?.(chunk.glass,false);chunk.glass.dispose();}}
}