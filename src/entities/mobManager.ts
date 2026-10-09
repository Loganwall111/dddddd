import { Scene, Vector3, ShadowGenerator } from "@babylonjs/core";
import { BlockId } from "../blocks/blocks";
import { Mob, MobKind } from "./mobs";
import { buildMobSkins, MobSkinPack } from "./skins";
import { BlockId as BId, BLOCKS as BDEFS } from "../blocks/blocks";

export class MobManager {
  scene: Scene;
  mobs: Mob[] = [];
  getBlock: (x:number,y:number,z:number) => BlockId;
  getSurfaceY: (x:number,z:number) => number;
  spawnTimer = 0;
  maxMobs = 14;
  shadows?: ShadowGenerator;
  skins: MobSkinPack;

  constructor(scene: Scene, getBlock: (x:number,y:number,z:number) => BlockId, getSurfaceY: (x:number,z:number) => number, shadows?: ShadowGenerator) {
    this.scene = scene;
    this.getBlock = getBlock;
    this.getSurfaceY = getSurfaceY;
    this.shadows = shadows;
    this.skins = buildMobSkins(scene);
  }

  update(dt: number, playerPos: Vector3, isNight: boolean, onAttackPlayer?: (dmg:number) => void) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.mobs.length < this.maxMobs) {
      this.spawnTimer = 3;
      this.trySpawn(playerPos, isNight);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.update(dt, this.scene, playerPos, isNight, this.getBlock, onAttackPlayer);
      // despawn if too far or dead
      const dist = m.position.subtract(playerPos).length();
      if (m.dead || dist > 80) {
        m.dispose();
        this.mobs.splice(i, 1);
      }
    }
  }

  private trySpawn(playerPos: Vector3, isNight: boolean) {
    // spawn in a ring around the player
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 20;
    const x = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const z = Math.floor(playerPos.z + Math.sin(angle) * dist);
    const y = this.getSurfaceY(x, z);
    if (y <= 2) return;

    let kind: MobKind;
    const surface = this.getBlock(x, y - 1, z);
    const snowy = surface === BId.Snow || surface === BId.Ice;
    if (isNight) {
      kind = Math.random() < 0.6 ? "zombie" : "skeleton";
    } else if (snowy) {
      kind = Math.random() < 0.7 ? "bear" : "sheep";
    } else {
      const roll = Math.random();
      kind = roll < 0.3 ? "pig" : roll < 0.55 ? "cow" : roll < 0.8 ? "sheep" : "chicken";
    }
    this.mobs.push(new Mob(this.scene, kind, new Vector3(x + 0.5, y + 1, z + 0.5), this.shadows, this.skins));
  }

  // Deal damage to nearest mob in a direction (player attack)
  attackFrom(origin: Vector3, dir: Vector3, damage: number, reach = 3.5): Mob | null {
    let best: Mob | null = null;
    let bestT = reach;
    for (const m of this.mobs) {
      const center = m.position.add(new Vector3(0, 0.6 * m.def.scale, 0));
      const to = center.subtract(origin);
      const t = Vector3.Dot(to, dir);
      if (t < 0 || t > reach) continue;
      const closest = origin.add(dir.scale(t));
      if (closest.subtract(center).length() < 0.8 && t < bestT) { best = m; bestT = t; }
    }
    if (best) {
      const kb = dir.scale(6).add(new Vector3(0, 4, 0));
      best.hurt(damage, kb);
    }
    return best;
  }

  clear() {
    for (const m of this.mobs) m.dispose();
    this.mobs = [];
  }
}
