import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Texture } from "@babylonjs/core";
import { BLOCKS, BlockId } from "../blocks/blocks";

export interface DropItem {
  mesh: Mesh;
  id: BlockId;
  count: number;
  velocity: Vector3;
  onGround: boolean;
  age: number;
  magnet: boolean;
}

// Visual floating item drops with gravity, bobbing, and magnet pickup.
export class DropSystem {
  scene: Scene;
  drops: DropItem[] = [];
  getBlockBelow: (x:number,y:number,z:number) => BlockId;
  onPickup?: (id: BlockId, count: number) => void;
  iconAtlas: Texture | null = null;

  constructor(scene: Scene, getBlockBelow: (x:number,y:number,z:number) => BlockId) {
    this.scene = scene;
    this.getBlockBelow = getBlockBelow;
  }

  spawn(x: number, y: number, z: number, id: BlockId, count = 1) {
    const def = BLOCKS[id];
    const size = 0.3;
    const mesh = MeshBuilder.CreateBox("drop", { size }, this.scene);
    const mat = new StandardMaterial("dropmat", this.scene);
    mat.diffuseColor = this.colorFor(id);
    mat.emissiveColor = this.colorFor(id).scale(0.25);
    mat.specularColor = new Color3(0.2,0.2,0.2);
    mesh.material = mat;
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.isPickable = false;
    this.drops.push({
      mesh, id, count,
      velocity: new Vector3((Math.random()-0.5)*3, 4 + Math.random()*2, (Math.random()-0.5)*3),
      onGround: false, age: 0, magnet: false,
    });
  }

  private colorFor(id: BlockId): Color3 {
    const c = BLOCKS[id]?.color;
    if (c) return new Color3(c[0], c[1], c[2]);
    // map common blocks to representative colors
    switch (id) {
      case BlockId.Grass: return new Color3(0.35,0.6,0.25);
      case BlockId.Dirt: return new Color3(0.55,0.4,0.25);
      case BlockId.Stone: case BlockId.Cobblestone: return new Color3(0.5,0.5,0.5);
      case BlockId.Sand: return new Color3(0.9,0.85,0.6);
      case BlockId.Wood: return new Color3(0.45,0.32,0.18);
      case BlockId.Planks: return new Color3(0.7,0.55,0.35);
      case BlockId.Leaves: return new Color3(0.25,0.55,0.2);
      case BlockId.CoalOre: return new Color3(0.2,0.2,0.2);
      case BlockId.IronOre: return new Color3(0.8,0.7,0.6);
      case BlockId.GoldOre: return new Color3(0.95,0.85,0.3);
      case BlockId.DiamondOre: return new Color3(0.4,0.9,0.9);
      case BlockId.Glass: return new Color3(0.8,0.9,1.0);
      case BlockId.Brick: return new Color3(0.7,0.35,0.28);
      case BlockId.Snow: return new Color3(0.95,0.97,1.0);
      case BlockId.Glowstone: return new Color3(1.0,0.85,0.4);
      case BlockId.TNT: return new Color3(0.8,0.2,0.15);
      default: return new Color3(0.7,0.7,0.7);
    }
  }

  update(dt: number, playerPos: Vector3) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      // despawn after 90s
      if (d.age > 90) { this.removeAt(i); continue; }

      // magnet toward player when close
      const toPlayer = playerPos.subtract(d.mesh.position);
      const distSq = toPlayer.lengthSquared();
      if (distSq < 4) d.magnet = true;
      if (d.magnet) {
        const dir = toPlayer.normalize();
        d.velocity = dir.scale(8);
        if (distSq < 0.6) {
          if (this.onPickup) this.onPickup(d.id, d.count);
          this.removeAt(i);
          continue;
        }
      } else {
        // gravity
        d.velocity.y -= 20 * dt;
      }
      // integrate
      const newPos = d.mesh.position.add(d.velocity.scale(dt));
      // simple ground collision
      const below = this.getBlockBelow(Math.floor(newPos.x), Math.floor(newPos.y - 0.2), Math.floor(newPos.z));
      const belowDef = BLOCKS[below];
      if (!d.magnet && belowDef && belowDef.solid && d.velocity.y < 0 && newPos.y - 0.2 <= Math.floor(newPos.y - 0.2) + 1) {
        // landed
        newPos.y = Math.floor(newPos.y - 0.2) + 1 + 0.15;
        d.velocity.y = 0;
        d.velocity.x *= 0.6; d.velocity.z *= 0.6;
        d.onGround = true;
      }
      d.mesh.position.copyFrom(newPos);
      // bob and spin
      if (d.onGround) {
        d.mesh.position.y += Math.sin(d.age * 3 + i) * 0.03;
        d.mesh.rotation.y += dt * 2;
      } else {
        d.mesh.rotation.y += dt * 4;
        d.mesh.rotation.x += dt * 2;
      }
    }
  }

  private removeAt(i: number) {
    this.drops[i].mesh.dispose();
    this.drops.splice(i, 1);
  }

  clear() {
    for (const d of this.drops) d.mesh.dispose();
    this.drops = [];
  }
}
