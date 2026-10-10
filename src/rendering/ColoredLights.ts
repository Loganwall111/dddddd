import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import { block } from '../blocks/registry';
import type { WorldSave } from '../core/types';

interface Candidate { x: number; y: number; z: number; dist: number; color: Color3; range: number; flicker: boolean }

export class ColoredLights {
  private lights: PointLight[] = [];
  private scan = 0;
  private clock = 0;
  enabled = true;
  constructor(scene: Scene, private world: VoxelWorld, private save: WorldSave) {
    for (let i = 0; i < 8; i++) {
      const light = new PointLight(`colored-lantern-${i}`, Vector3.Zero(), scene);
      light.intensity = 0; light.range = 14; light.diffuse = new Color3(1, 0.8, 0.5);
      this.lights.push(light);
    }
  }
  private colorFor(id: number): { color: Color3; range: number; flicker: boolean } {
    const def = block(id);
    const hex = def.top && def.texture !== 'ore' ? def.top : def.color;
    const warm = id === 28 || id === 24;
    if (id === 31) return { color: new Color3(1, 0.32, 0.08), range: 15, flicker: true };
    if (id === 26) return { color: new Color3(0.66, 0.35, 1), range: 16, flicker: false };
    if (id >= 79 && id <= 82) return { color: Color3.FromHexString(hex), range: 12, flicker: false };
    return { color: Color3.FromHexString(hex), range: warm ? 14 : 12, flicker: warm };
  }
  update(dt: number, player: Vector3) {
    this.clock += dt; this.scan += dt;
    if (!this.enabled) { for (const l of this.lights) l.intensity = 0; return; }
    if (this.scan < 0.4) {
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        if (l.intensity > 0.01 && (l.metadata as boolean)) l.intensity = 2.1 + Math.sin(this.clock * 7 + i * 1.7) * 0.3;
      }
      return;
    }
    this.scan = 0;
    const candidates: Candidate[] = [];
    const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
    for (let dx = -14; dx <= 14; dx += 2) for (let dz = -14; dz <= 14; dz += 2) for (let dy = -4; dy <= 5; dy += 2) {
      const id = this.world.getBlock(px + dx, py + dy, pz + dz);
      if (!id || !block(id).emissive) continue;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 18) continue;
      const { color, range, flicker } = this.colorFor(id);
      candidates.push({ x: px + dx, y: py + dy, z: pz + dz, dist, color, range, flicker });
    }
    for (const [key, furnace] of Object.entries(this.save.furnaces)) {
      if (furnace.burn <= 0 || !key.startsWith(`${this.save.dimension}:`)) continue;
      const [x, y, z] = key.slice(this.save.dimension.length + 1).split(',').map(Number);
      const dist = Math.hypot(x - player.x, y - player.y, z - player.z);
      if (dist < 20) candidates.push({ x, y, z, dist, color: new Color3(1, 0.55, 0.2), range: 12, flicker: true });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i], c = candidates[i];
      if (!c) { light.intensity = 0; continue; }
      light.position.set(c.x + 0.5, c.y + 0.8, c.z + 0.5);
      light.diffuse.copyFrom(c.color); light.range = c.range;
      light.metadata = c.flicker;
      light.intensity = c.flicker ? 2.1 + Math.sin(this.clock * 7 + i) * 0.3 : 2.3;
    }
  }
  dispose() { for (const l of this.lights) l.dispose(); }
}
