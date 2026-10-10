import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Target } from '../core/types';
import { hash3 } from '../world/noise';

export class BreakOverlay {
  private mesh: Mesh;
  private texture: DynamicTexture;
  private stage = -1;
  constructor(scene: Scene) {
    this.texture = new DynamicTexture('original-breaking-cracks', 64, scene, false, Texture.NEAREST_SAMPLINGMODE);
    this.texture.hasAlpha = true;
    const material = new StandardMaterial('block-breaking-feedback', scene);
    material.diffuseTexture = this.texture; material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true; material.emissiveColor = Color3.White(); material.specularColor = Color3.Black(); material.zOffset = -1;
    this.mesh = MeshBuilder.CreateBox('breaking-overlay', { size: 1.012 }, scene);
    this.mesh.material = material; this.mesh.isPickable = false; this.mesh.setEnabled(false);
  }
  update(target: Target | null, progress: number) {
    this.mesh.setEnabled(!!target && progress > .035);
    if (!target || progress <= .035) return;
    this.mesh.position.set(target.x + .5, target.y + .5, target.z + .5);
    const stage = Math.min(9, Math.floor(progress * 10));
    if (stage === this.stage) return;
    this.stage = stage;
    const ctx = this.texture.getContext(); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(22,28,22,.78)'; ctx.lineWidth = 1 + stage * .14;
    for (let branch = 0; branch < stage + 3; branch++) {
      const a = branch * 2.39; let x = 30, y = 33;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let step = 0; step <= stage / 2 + 1; step++) { x += Math.cos(a) * 6 + (hash3(branch, step, 0, 881) - .5) * 9; y += Math.sin(a) * 6 + (hash3(branch, step, 1, 881) - .5) * 9; ctx.lineTo(Math.round(x), Math.round(y)); }
      ctx.stroke();
    }
    this.texture.update(true);
  }
}