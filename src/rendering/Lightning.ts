import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Weather } from '../core/types';

export class LightningSystem {
  onThunder?: (delay: number, intensity: number) => void;
  private bolt: Mesh | null = null;
  private material: StandardMaterial;
  private flash = 0;
  private nextStrike = 6;
  constructor(private scene: Scene) {
    this.material = new StandardMaterial('lightning-bolt', scene);
    this.material.emissiveColor = new Color3(0.85, 0.92, 1); this.material.disableLighting = true; this.material.fogEnabled = false;
  }
  get flashIntensity() { return this.flash; }
  private strike(player: Vector3) {
    const angle = Math.random() * Math.PI * 2, dist = 32 + Math.random() * 42;
    const x = player.x + Math.cos(angle) * dist, z = player.z + Math.sin(angle) * dist;
    const points: Vector3[] = [];
    for (let i = 0; i <= 12; i++) points.push(new Vector3(x + (Math.random() - 0.5) * (8 - i * 0.4), 95 - i * 6, z + (Math.random() - 0.5) * (8 - i * 0.4)));
    this.bolt?.dispose();
    this.bolt = MeshBuilder.CreateTube('storm-bolt', { path: points, radius: 0.32, tessellation: 6 }, this.scene);
    this.bolt.material = this.material; this.bolt.isPickable = false;
    this.flash = 1;
    setTimeout(() => { this.bolt?.dispose(); this.bolt = null; }, 170);
    this.onThunder?.(0.35 + dist / 70, Math.max(0.4, 1.2 - dist / 90));
    this.nextStrike = 4 + Math.random() * 9;
  }
  update(dt: number, weather: Weather, player: Vector3, alien: boolean, reducedMotion: boolean) {
    this.flash = Math.max(0, this.flash - dt * 4);
    if (weather !== 'storm' || alien) return;
    this.nextStrike -= dt;
    if (this.nextStrike <= 0 && !reducedMotion) this.strike(player);
    else if (this.nextStrike <= 0) { this.flash = 0.7; this.onThunder?.(0.8, 0.6); this.nextStrike = 5 + Math.random() * 9; }
  }
  dispose() { this.bolt?.dispose(); this.material.dispose(); }
}
