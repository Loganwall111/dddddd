import { Color4, Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import { volcanoNear } from '../world/structures';
import { surfaceHeight } from '../world/generator';
import type { GameAudio } from '../audio/Audio';

export class VolcanoSystem {
  private smoke: ParticleSystem;
  private lava: ParticleSystem;
  private glow: PointLight;
  private erupting = 0;
  private nextCheck = 20;
  onToast?: (message: string) => void;

  constructor(scene: Scene, private world: VoxelWorld, private audio: GameAudio) {
    const tex = new DynamicTexture('volcano-particle-sprite', 32, scene, false);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,.78)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    tex.hasAlpha = true;

    this.smoke = new ParticleSystem('volcano-ash-plume', 400, scene);
    this.smoke.particleTexture = tex;
    this.smoke.emitter = Vector3.Zero();
    this.smoke.minEmitBox = new Vector3(-3, 0, -3);
    this.smoke.maxEmitBox = new Vector3(3, 2, 3);
    this.smoke.direction1 = new Vector3(-2, 9, -2);
    this.smoke.direction2 = new Vector3(2, 16, 2);
    this.smoke.minSize = 2;
    this.smoke.maxSize = 7;
    this.smoke.minLifeTime = 2.5;
    this.smoke.maxLifeTime = 6;
    this.smoke.color1 = new Color4(0.25, 0.22, 0.2, 0.75);
    this.smoke.color2 = new Color4(1, 0.4, 0.1, 0.9);
    this.smoke.colorDead = new Color4(0.2, 0.2, 0.2, 0);
    this.smoke.emitRate = 0;
    this.smoke.start();

    this.lava = new ParticleSystem('volcano-lava-sparks', 360, scene);
    this.lava.particleTexture = tex;
    this.lava.emitter = Vector3.Zero();
    this.lava.minEmitBox = new Vector3(-1.7, 0, -1.7);
    this.lava.maxEmitBox = new Vector3(1.7, 1.2, 1.7);
    this.lava.direction1 = new Vector3(-5, 10, -5);
    this.lava.direction2 = new Vector3(5, 24, 5);
    this.lava.minEmitPower = 4;
    this.lava.maxEmitPower = 11;
    this.lava.gravity = new Vector3(0, -16, 0);
    this.lava.minSize = 0.12;
    this.lava.maxSize = 0.48;
    this.lava.minLifeTime = 0.8;
    this.lava.maxLifeTime = 2.4;
    this.lava.color1 = new Color4(1, 0.92, 0.25, 1);
    this.lava.color2 = new Color4(1, 0.26, 0.035, 0.96);
    this.lava.colorDead = new Color4(0.22, 0.025, 0.006, 0);
    this.lava.emitRate = 0;
    this.lava.start();

    this.glow = new PointLight('volcano-lava-glow', Vector3.Zero(), scene);
    this.glow.diffuse = new Color3(1, 0.24, 0.045);
    this.glow.specular = new Color3(1, 0.42, 0.12);
    this.glow.range = 58;
    this.glow.intensity = 0;
  }

  /** Starts a visible lava-and-ash eruption, used by the cinematic volcanic-biome shot. */
  eruptAt(x: number, z: number, cinematic = false) {
    if (this.world.config.dimension !== 'overworld') return;
    const y = surfaceHeight(x, z, this.world.config) + 24;
    this.smoke.emitter = new Vector3(x, y, z);
    this.lava.emitter = new Vector3(x, y, z);
    this.glow.position.set(x, y + 2, z);
    this.erupting = Math.max(this.erupting, cinematic ? 15 : 22);
    this.nextCheck = cinematic ? 120 : 240 + Math.random() * 120;
    this.audio.thunder(0.18, cinematic ? 0.82 : 0.58);
    if (!cinematic) this.onToast?.('The volcano stirs. Ash rises on the horizon.');
  }

  update(dt: number, focus: Vector3) {
    this.nextCheck -= dt;
    if (this.erupting > 0) {
      this.erupting -= dt;
      this.smoke.emitRate = 90;
      this.lava.emitRate = this.erupting > 11 ? 210 : 105;
      this.glow.intensity = 4.4 + Math.sin(this.erupting * 9) * 1.25;
      if (Vector3.Distance(focus, this.glow.position) < 14 && Math.random() < dt * 0.8) {
        this.onToast?.('The eruption scorches the air. Fall back!');
      }
      if (this.erupting <= 0) {
        this.smoke.emitRate = 0;
        this.lava.emitRate = 0;
        this.glow.intensity = 0;
        this.nextCheck = 240 + Math.random() * 360;
      }
      return;
    }

    this.smoke.emitRate = 0;
    this.lava.emitRate = 0;
    this.glow.intensity = Math.max(0, this.glow.intensity - dt * 4);
    if (this.nextCheck > 0 || this.world.config.dimension !== 'overworld') return;
    this.nextCheck = 12;
    const vent = volcanoNear(focus.x, focus.z, this.world.config.seed, 170);
    if (!vent || !this.world.isLoaded(vent.x, vent.z) || Math.random() > 0.2) return;
    this.eruptAt(vent.x, vent.z);
  }

  dispose() {
    this.smoke.dispose();
    this.lava.dispose();
    this.glow.dispose();
  }
}
