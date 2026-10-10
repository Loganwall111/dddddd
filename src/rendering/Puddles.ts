import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import { DIMENSIONS } from '../core/types';

export class PuddleSystem {
  private puddles: Mesh[] = [];
  private material: PBRMaterial;
  private wetness = 0;
  private center = new Vector3(Number.NaN, 0, 0);
  enabled = true;
  constructor(scene: Scene, private world: VoxelWorld) {
    this.material = new PBRMaterial('rain-puddle-mirror', scene);
    this.material.albedoColor.set(0.13, 0.2, 0.22); this.material.metallic = 1; this.material.roughness = 0.05;
    this.material.alpha = 0.85; this.material.environmentIntensity = 1.1;
    for (let i = 0; i < 14; i++) {
      const mesh = MeshBuilder.CreateDisc(`rain-puddle-${i}`, { radius: 1.1 + (i % 5) * 0.55, tessellation: 20 }, scene);
      mesh.rotation.x = Math.PI / 2; mesh.material = this.material; mesh.isPickable = false; mesh.setEnabled(false);
      this.puddles.push(mesh);
    }
  }
  private relayout(player: Vector3) {
    this.center.copyFrom(player);
    for (let i = 0; i < this.puddles.length; i++) {
      const angle = (i / this.puddles.length) * Math.PI * 2 + this.center.x * 0.01;
      const radius = 6 + (i * 37 % 20);
      const x = player.x + Math.cos(angle) * radius, z = player.z + Math.sin(angle) * radius;
      if (!this.world.isLoaded(x, z)) { this.puddles[i].setEnabled(false); continue; }
      const ground = this.world.ground(x, z);
      if (ground < DIMENSIONS[this.world.config.dimension].water + 0.3 || ground > 90) { this.puddles[i].setEnabled(false); continue; }
      this.puddles[i].position.set(x, ground + 0.045, z);
      this.puddles[i].setEnabled(this.wetness > 0.03);
    }
  }
  update(dt: number, player: Vector3, raining: boolean) {
    const target = this.enabled && raining ? 1 : 0;
    const speed = target > this.wetness ? 0.25 : 0.1;
    this.wetness += Math.max(-speed * dt, Math.min(speed * dt, target - this.wetness));
    if (!Number.isFinite(this.center.x) || Vector3.Distance(this.center, player) > 14) this.relayout(player);
    for (const p of this.puddles) if (p.position.y > 0) p.setEnabled(this.wetness > 0.03);
    this.material.alpha = 0.85 * this.wetness;
    this.material.roughness = 0.05 + (1 - this.wetness) * 0.3;
  }
  dispose() { for (const p of this.puddles) p.dispose(); this.material.dispose(); }
}
