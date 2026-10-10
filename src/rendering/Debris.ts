import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import { block } from '../blocks/registry';

interface Chunk { mesh: Mesh; velocity: Vector3; spin: Vector3; life: number; maxLife: number }

export class DebrisSystem {
  private pool: Chunk[] = [];
  private materials = new Map<string, StandardMaterial>();
  enabled = true;
  constructor(private scene: Scene, private world: VoxelWorld) {}
  private materialFor(hex: string) {
    let mat = this.materials.get(hex);
    if (!mat) { mat = new StandardMaterial(`debris-${hex}`, this.scene); mat.diffuseColor = Color3.FromHexString(hex); mat.specularColor = Color3.Black(); this.materials.set(hex, mat); }
    return mat;
  }
  burst(position: Vector3, blockId: number, count = 7, power = 4.5) {
    if (!this.enabled) return;
    const def = block(blockId);
    const hex = def.top && def.texture !== 'ore' ? def.top : def.color;
    for (let i = 0; i < count; i++) {
      if (this.pool.length >= 130) { const old = this.pool.shift()!; old.mesh.dispose(); }
      const size = 0.08 + Math.random() * 0.08;
      const mesh = MeshBuilder.CreateBox('block-debris', { size }, this.scene);
      mesh.position.copyFrom(position).addInPlace(new Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      mesh.material = this.materialFor(hex); mesh.isPickable = false;
      this.pool.push({ mesh, velocity: new Vector3((Math.random() - 0.5) * power * 2, Math.random() * power + 1.5, (Math.random() - 0.5) * power * 2), spin: new Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 0, maxLife: 1.8 + Math.random() * 1.2 });
    }
  }
  mobBurst(position: Vector3, body: string, accent: string) {
    if (!this.enabled) return;
    for (let i = 0; i < 8; i++) {
      if (this.pool.length >= 130) { const old = this.pool.shift()!; old.mesh.dispose(); }
      const mesh = MeshBuilder.CreateBox('ragdoll-chunk', { width: 0.16, height: 0.16, depth: 0.16 }, this.scene);
      mesh.position.copyFrom(position).addInPlace(new Vector3(0, 0.9, 0));
      mesh.material = this.materialFor(i % 3 === 0 ? accent : body); mesh.isPickable = false;
      this.pool.push({ mesh, velocity: new Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 4, (Math.random() - 0.5) * 7), spin: new Vector3(Math.random() * 12, Math.random() * 12, 0), life: 0, maxLife: 2.2 });
    }
  }
  update(dt: number) {
    for (const c of [...this.pool]) {
      c.life += dt;
      c.velocity.y -= 19 * dt;
      const next = c.mesh.position.add(c.velocity.scale(dt));
      if (this.world.isLoaded(next.x, next.z) && this.world.solid(next.x, next.y - 0.08, next.z)) {
        next.y = Math.floor(next.y - 0.08) + 1.1;
        c.velocity.y *= -0.38; c.velocity.x *= 0.7; c.velocity.z *= 0.7; c.spin.scaleInPlace(0.6);
        if (Math.abs(c.velocity.y) < 0.8) c.velocity.y = 0;
      }
      c.mesh.position.copyFrom(next);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt;
      if (c.life > c.maxLife - 0.5) c.mesh.scaling.setAll(Math.max(0.01, (c.maxLife - c.life) * 2));
      if (c.life >= c.maxLife || c.mesh.position.y < -30) { c.mesh.dispose(); this.pool = this.pool.filter(p => p !== c); }
    }
  }
  dispose() { for (const c of this.pool) c.mesh.dispose(); this.pool = []; for (const m of this.materials.values()) m.dispose(); }
}
