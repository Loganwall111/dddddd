import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import HorizonWorker from './horizon.worker?worker&inline';
import type { HorizonRequest } from './horizon.worker';
import type { GenConfig } from './generator';
import type { MeshArrays } from './mesher';
export type WaterGeometry=Pick<MeshArrays,'positions'|'normals'|'uvs'|'indices'>;

export class Horizon {
  private worker = new HorizonWorker();
  private mesh: Mesh | null = null;
  private key = '';
  private busy = false;
  private latest: HorizonRequest | null = null;
  private dimension = '';
  private id = 0;
  onMesh?: (mesh: Mesh, add: boolean) => void;
  onWater?:(data:WaterGeometry)=>void;
  constructor(scene: Scene, private material: PBRMaterial) {
    this.worker.onmessage = (event: MessageEvent<MeshArrays & { id: number; dimension: string;water:WaterGeometry }>) => {
      this.busy = false;
      if (event.data.dimension === this.dimension) {
        if (this.mesh) { this.onMesh?.(this.mesh, false); this.mesh.dispose(); }
        const mesh = new Mesh('distant-voxel-horizon', scene), vertex = new VertexData();
        vertex.positions = event.data.positions; vertex.normals = event.data.normals; vertex.uvs = event.data.uvs;
        vertex.colors = event.data.colors; vertex.indices = event.data.indices; vertex.applyToMesh(mesh);
        mesh.material = this.material; mesh.isPickable = false; mesh.freezeWorldMatrix();
        this.mesh = mesh; this.onMesh?.(mesh, true);
        this.onWater?.(event.data.water);
      }
      if (this.latest) this.dispatch();
    };
    this.worker.onerror = () => { this.busy = false; this.key = ''; };
  }
  update(x: number, z: number, radius: number, config: GenConfig) {
    const cx = Math.floor(x / 16) * 16, cz = Math.floor(z / 16) * 16;
    const key = `${cx},${cz}:${radius}:${config.dimension}:${config.season}`;
    if (key === this.key) return;
    if (this.dimension !== config.dimension && this.mesh) { this.onMesh?.(this.mesh, false); this.mesh.dispose(); this.mesh = null; }
    this.dimension = config.dimension; this.key = key;
    this.latest = { x: cx, z: cz, radius, config, id: ++this.id };
    if (!this.busy) this.dispatch();
  }
  private dispatch() { this.busy = true; this.worker.postMessage(this.latest); this.latest = null; }
  dispose() { this.worker.terminate(); if (this.mesh) { this.onMesh?.(this.mesh, false); this.mesh.dispose(); } }
}