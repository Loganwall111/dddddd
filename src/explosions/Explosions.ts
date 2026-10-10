import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { blockMesh } from '../blocks/textures';
import { block } from '../blocks/registry';
import type { VoxelWorld } from '../world/World';
import type { GameAudio } from '../audio/Audio';
import type { EntitySystem } from '../entities/Entities';

interface Charge { mesh: Mesh; material: StandardMaterial; remaining: number; tick: number }
export class ExplosionSystem {
  private charges: Charge[] = [];
  private pending: { x: number; y: number; z: number; power: number }[] = [];
  private particles: ParticleSystem;
  private smoke: ParticleSystem;
  private light: PointLight;
  private rings: { mesh: Mesh; life: number }[] = [];
  onBlast?: (position: Vector3, radius: number) => void;
  onDebris?: (position: Vector3, blockId: number, count: number, power: number) => void;
  constructor(private scene: Scene, private world: VoxelWorld, private material: PBRMaterial, private audio: GameAudio, private entities: EntitySystem) {
    const tex = new DynamicTexture('original-explosion-particle', 16, scene, false), ctx = tex.getContext();
    ctx.clearRect(0, 0, 16, 16); ctx.fillStyle = '#fff'; ctx.fillRect(2, 2, 12, 12); tex.update(); tex.hasAlpha = true;
    this.particles = new ParticleSystem('pooled-blast-debris', 600, scene); this.particles.particleTexture = tex;
    this.particles.color1 = new Color4(1, .62, .2, 1); this.particles.color2 = new Color4(.5, .45, .36, 1); this.particles.colorDead = new Color4(.24, .23, .22, 0);
    this.particles.minSize = .12; this.particles.maxSize = .7; this.particles.minLifeTime = .4; this.particles.maxLifeTime = 1.8;
    this.particles.direction1 = new Vector3(-6, -2, -6); this.particles.direction2 = new Vector3(6, 8, 6); this.particles.gravity = new Vector3(0, -8, 0);
    this.particles.minEmitPower = .7; this.particles.maxEmitPower = 1.6; this.particles.emitRate = 0; this.particles.start();
    this.smoke = new ParticleSystem('blast-smoke-column', 300, scene); this.smoke.particleTexture = tex;
    this.smoke.color1 = new Color4(.32, .3, .28, .85); this.smoke.color2 = new Color4(.55, .5, .45, .7); this.smoke.colorDead = new Color4(.2, .2, .2, 0);
    this.smoke.minSize = .8; this.smoke.maxSize = 2.6; this.smoke.minLifeTime = 1.2; this.smoke.maxLifeTime = 3;
    this.smoke.direction1 = new Vector3(-1, 4, -1); this.smoke.direction2 = new Vector3(1, 9, 1); this.smoke.gravity = new Vector3(0, 2, 0);
    this.smoke.emitRate = 0; this.smoke.start();
    this.light = new PointLight('explosion-flash', Vector3.Zero(), scene); this.light.diffuse = new Color3(1, .6, .25); this.light.range = 32; this.light.intensity = 0;
  }
  prime(x: number, y: number, z: number, fuse = 3) {
    if (this.world.getBlock(x, y, z) !== 27 || this.charges.length >= 32) return;
    this.world.setBlock(x, y, z, 0);
    const own = new StandardMaterial('primed-tnt', this.scene); own.diffuseTexture = this.material.albedoTexture; own.specularColor = Color3.Black();
    const mesh = blockMesh(27, this.scene, own, .96); mesh.position.set(x + .5, y + .5, z + .5);
    this.charges.push({ mesh, material: own, remaining: fuse, tick: 0 });
    this.audio.play('fuse');
  }
  detonate(position: Vector3) {
    const radius = 4.6;
    this.particles.emitter = position.clone(); this.particles.manualEmitCount = 140;
    this.smoke.emitter = position.clone().add(new Vector3(0, 1, 0)); this.smoke.manualEmitCount = 40;
    const ringMat = new StandardMaterial('shockwave', this.scene);
    ringMat.emissiveColor = new Color3(1, .75, .4); ringMat.alpha = .7; ringMat.disableLighting = true; ringMat.backFaceCulling = false;
    const ring = MeshBuilder.CreateTorus('blast-shockwave', { diameter: 1, thickness: .22, tessellation: 32 }, this.scene);
    ring.position.copyFrom(position); ring.material = ringMat; ring.isPickable = false;
    this.rings.push({ mesh: ring, life: 0 }); ringMat.dispose;
    this.onDebris?.(position.clone(), 3, 16, 7);
    this.light.position.copyFrom(position); this.light.intensity = 12;
    this.audio.play('explosion'); this.entities.blast(position, 7); this.onBlast?.(position, 7);
    for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) for (let dz = -5; dz <= 5; dz++) {
      const distance = Math.hypot(dx, dy, dz); if (distance > radius) continue;
      const x = Math.floor(position.x) + dx, y = Math.floor(position.y) + dy, z = Math.floor(position.z) + dz;
      this.pending.push({ x, y, z, power: (radius - distance) * 4.5 });
    }
  }
  update(dt: number) {
    this.light.intensity *= Math.exp(-dt * 9);
    for (const r of [...this.rings]) {
      r.life += dt;
      const s = 1 + r.life * 26;
      r.mesh.scaling.set(s, s, s);
      (r.mesh.material as StandardMaterial).alpha = Math.max(0, .7 - r.life * 1.8);
      if (r.life > .45) { (r.mesh.material as StandardMaterial).dispose(); r.mesh.dispose(); this.rings = this.rings.filter(x => x !== r); }
    }
    for (const c of [...this.charges]) {
      c.remaining -= dt; c.tick -= dt;
      const flash = Math.sin(c.remaining * (c.remaining < 1 ? 35 : 16)) > 0;
      c.material.emissiveColor.setAll(flash ? .9 : .12); c.mesh.scaling.setAll(1 + Math.sin(c.remaining * 20) * .035);
      if (c.tick <= 0) { this.audio.play('fuse', .3); c.tick = Math.max(.1, c.remaining / 5); }
      if (c.remaining <= 0) { this.detonate(c.mesh.position.clone()); c.mesh.dispose(); c.material.dispose(); this.charges = this.charges.filter(charge => charge !== c); }
    }
    // A bounded destruction budget keeps chain reactions from monopolizing a frame.
    for (let budget = 0; budget < 120 && this.pending.length; budget++) {
      const p = this.pending.shift()!, id = this.world.getBlock(p.x, p.y, p.z);
      if (!id || p.y <= 0) continue;
      if (id === 27) this.prime(p.x, p.y, p.z, .2 + Math.random() * .6);
      else if (block(id).resistance < p.power) {
        this.world.setBlock(p.x, p.y, p.z, 0);
        if (Math.random() < .025) this.entities.drop({ id: block(id).drop || id, count: 1 }, new Vector3(p.x + .5, p.y + .5, p.z + .5));
      }
    }
  }
  dispose() { this.charges.forEach(c => { c.mesh.dispose(); c.material.dispose(); }); this.rings.forEach(r => { (r.mesh.material as StandardMaterial).dispose(); r.mesh.dispose(); }); this.rings = []; this.particles.dispose(); this.smoke.dispose(); this.light.dispose(); this.pending = []; }
}