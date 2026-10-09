import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, TransformNode, ShadowGenerator } from "@babylonjs/core";
import { BLOCKS, BlockId } from "../blocks/blocks";
import { CHUNK_HEIGHT } from "../world/chunk";
import { MobSkinPack, remapBoxUVs } from "./skins";

export type MobKind = "zombie" | "pig" | "cow" | "sheep" | "chicken" | "skeleton" | "bear";

export interface MobDef {
  kind: MobKind;
  name: string;
  hostile: boolean;
  health: number;
  speed: number;
  bodyColor: Color3;
  headColor: Color3;
  legColor: Color3;
  scale: number;
  damage: number;
}

export const MOB_DEFS: Record<MobKind, MobDef> = {
  zombie:   { kind: "zombie",   name: "Zombie",   hostile: true,  health: 20, speed: 2.2, bodyColor: new Color3(0.2,0.5,0.3),  headColor: new Color3(0.25,0.55,0.35), legColor: new Color3(0.15,0.35,0.2), scale: 1.0, damage: 3 },
  skeleton: { kind: "skeleton", name: "Skeleton", hostile: true,  health: 20, speed: 2.4, bodyColor: new Color3(0.85,0.85,0.85), headColor: new Color3(0.9,0.9,0.9),    legColor: new Color3(0.75,0.75,0.75), scale: 1.0, damage: 2 },
  pig:      { kind: "pig",      name: "Pig",      hostile: false, health: 10, speed: 1.6, bodyColor: new Color3(0.95,0.6,0.55),  headColor: new Color3(0.95,0.65,0.6),  legColor: new Color3(0.9,0.55,0.5),  scale: 0.8, damage: 0 },
  cow:      { kind: "cow",      name: "Cow",      hostile: false, health: 10, speed: 1.4, bodyColor: new Color3(0.5,0.3,0.2),    headColor: new Color3(0.55,0.35,0.25), legColor: new Color3(0.4,0.25,0.15), scale: 1.1, damage: 0 },
  sheep:    { kind: "sheep",    name: "Sheep",    hostile: false, health: 8,  speed: 1.5, bodyColor: new Color3(0.9,0.9,0.9),    headColor: new Color3(0.85,0.85,0.85), legColor: new Color3(0.8,0.8,0.8),   scale: 0.95, damage: 0 },
  chicken:  { kind: "chicken",  name: "Chicken",  hostile: false, health: 4,  speed: 1.8, bodyColor: new Color3(0.95,0.95,0.95), headColor: new Color3(1.0,0.95,0.95),  legColor: new Color3(0.9,0.6,0.2),   scale: 0.5, damage: 0 },
  bear:     { kind: "bear",     name: "Polar Bear", hostile: false, health: 30, speed: 2.0, bodyColor: new Color3(0.9,0.94,0.94), headColor: new Color3(0.92,0.96,0.96), legColor: new Color3(0.86,0.9,0.9), scale: 1.25, damage: 6 },
};

export class Mob {
  kind: MobKind;
  def: MobDef;
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  legs: Mesh[] = [];
  health: number;
  position: Vector3;
  velocity = new Vector3(0,0,0);
  yaw: number;
  targetYaw: number;
  wanderTimer = 0;
  attackCooldown = 0;
  hurtFlash = 0;
  dead = false;

  constructor(scene: Scene, kind: MobKind, pos: Vector3, shadows?: ShadowGenerator, skins?: MobSkinPack) {
    this.kind = kind;
    this.def = MOB_DEFS[kind];
    this.health = this.def.health;
    this.position = pos.clone();
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;

    this.root = new TransformNode(`mob_${kind}`, scene);
    this.root.position.copyFrom(pos);
    const s = this.def.scale;

    const matFor = (part: "body" | "head" | "legs", fallback: Color3): StandardMaterial => {
      if (skins) return skins.material(kind, part);
      return this.makeMat(fallback, scene);
    };
    const uv = (m: Mesh, part: "body" | "head" | "legs") => {
      if (skins) remapBoxUVs(m, skins.tileOf(kind, part), skins.atlasW, skins.atlasH);
    };

    // Body
    this.body = MeshBuilder.CreateBox("body", { width: 0.6*s, height: 0.5*s, depth: 0.9*s }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.6*s;
    uv(this.body, "body");
    this.body.material = matFor("body", this.def.bodyColor);

    // Head
    this.head = MeshBuilder.CreateBox("head", { size: 0.45*s }, scene);
    this.head.parent = this.root;
    this.head.position.set(0, 0.95*s, 0.45*s);
    uv(this.head, "head");
    this.head.material = matFor("head", this.def.headColor);

    // Legs
    for (let i = 0; i < 4; i++) {
      const leg = MeshBuilder.CreateBox(`leg${i}`, { width: 0.15*s, height: 0.5*s, depth: 0.15*s }, scene);
      leg.parent = this.root;
      const lx = (i % 2 === 0 ? -0.2 : 0.2) * s;
      const lz = (i < 2 ? -0.3 : 0.3) * s;
      leg.position.set(lx, 0.25*s, lz);
      uv(leg, "legs");
      leg.material = matFor("legs", this.def.legColor);
      this.legs.push(leg);
    }
    for (const m of [this.body, this.head, ...this.legs]) {
      m.isPickable = false;
      if (shadows) shadows.addShadowCaster(m);
    }
  }

  private makeMat(color: Color3, scene: Scene): StandardMaterial {
    const m = new StandardMaterial("mobmat", scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(0.05,0.05,0.05);
    return m;
  }

  provoked = false;

  hurt(amount: number, knockback?: Vector3): boolean {
    this.health -= amount;
    this.hurtFlash = 0.3;
    if (this.kind === "bear" || this.kind === "zombie" || this.kind === "skeleton") this.provoked = true;
    if (knockback) this.velocity = this.velocity.add(knockback);
    if (this.health <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt: number, scene: Scene, playerPos: Vector3, isNight: boolean,
         getBlock: (x:number,y:number,z:number) => BlockId, onAttackPlayer?: (dmg:number) => void) {
    if (this.dead) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // flash red when hurt
    const flash = this.hurtFlash > 0;
    (this.body.material as StandardMaterial).emissiveColor = flash ? new Color3(0.6,0,0) : Color3.Black();

    const toPlayer = playerPos.subtract(this.position);
    const distToPlayer = toPlayer.length();

    // AI
    const chase = (this.def.hostile && isNight && distToPlayer < 16) || (this.provoked && distToPlayer < 20);
    if (chase) {
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      // move toward player
      const dir = new Vector3(Math.sin(this.targetYaw), 0, Math.cos(this.targetYaw));
      this.velocity.x = dir.x * this.def.speed;
      this.velocity.z = dir.z * this.def.speed;
      // attack
      if (distToPlayer < 1.4 && this.attackCooldown <= 0) {
        if (onAttackPlayer) onAttackPlayer(this.def.damage);
        this.attackCooldown = 1.0;
      }
      // jump if blocked
      this.maybeJump(getBlock);
    } else {
      // wander
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 3;
        if (Math.random() < 0.4) {
          this.velocity.x = 0; this.velocity.z = 0;
        } else {
          this.targetYaw = Math.random() * Math.PI * 2;
        }
      }
      // smooth turn
      let dy = this.targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 3);
      const moving = Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01;
      if (moving || this.wanderTimer > 1.5) {
        this.velocity.x = Math.sin(this.yaw) * this.def.speed * 0.6;
        this.velocity.z = Math.cos(this.yaw) * this.def.speed * 0.6;
        this.maybeJump(getBlock);
      } else {
        this.velocity.x *= 0.8; this.velocity.z *= 0.8;
      }
    }

    // gravity
    this.velocity.y -= 22 * dt;

    // integrate with simple collision
    this.moveAndCollide(dt, getBlock);

    // apply to mesh
    this.root.position.copyFrom(this.position);
    this.root.rotation.y = this.yaw;

    // leg animation
    const moving = Math.abs(this.velocity.x) > 0.05 || Math.abs(this.velocity.z) > 0.05;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = moving ? Math.sin(t * 8 + i * Math.PI) * 0.5 : 0;
    }
  }

  private maybeJump(getBlock: (x:number,y:number,z:number) => BlockId) {
    const aheadX = Math.floor(this.position.x + Math.sin(this.yaw) * 0.7);
    const aheadZ = Math.floor(this.position.z + Math.cos(this.yaw) * 0.7);
    const footY = Math.floor(this.position.y);
    const ahead = getBlock(aheadX, footY, aheadZ);
    const aheadDef = BLOCKS[ahead];
    if (aheadDef && aheadDef.solid && this.isOnGround(getBlock)) {
      this.velocity.y = 7.5;
    }
  }

  private isOnGround(getBlock: (x:number,y:number,z:number) => BlockId): boolean {
    const below = getBlock(Math.floor(this.position.x), Math.floor(this.position.y - 0.05), Math.floor(this.position.z));
    const def = BLOCKS[below];
    return !!def && def.solid;
  }

  private moveAndCollide(dt: number, getBlock: (x:number,y:number,z:number) => BlockId) {
    const p = this.position;
    const v = this.velocity;
    const r = 0.3 * this.def.scale;
    const h = 1.2 * this.def.scale;

    const solidAt = (x:number,y:number,z:number) => {
      const b = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      const def = BLOCKS[b];
      return !!def && def.solid;
    };

    // Y
    p.y += v.y * dt;
    if (v.y < 0 && solidAt(p.x, p.y, p.z)) { p.y = Math.floor(p.y) + 1; v.y = 0; }
    if (v.y > 0 && solidAt(p.x, p.y + h, p.z)) { p.y = Math.floor(p.y + h) - h - 0.001; v.y = 0; }
    // X
    p.x += v.x * dt;
    if (solidAt(p.x + Math.sign(v.x)*r, p.y + 0.1, p.z) || solidAt(p.x + Math.sign(v.x)*r, p.y + h*0.5, p.z)) {
      p.x = v.x > 0 ? Math.floor(p.x + r) - r - 0.001 : Math.floor(p.x - r) + 1 + r + 0.001;
      v.x = 0;
    }
    // Z
    p.z += v.z * dt;
    if (solidAt(p.x, p.y + 0.1, p.z + Math.sign(v.z)*r) || solidAt(p.x, p.y + h*0.5, p.z + Math.sign(v.z)*r)) {
      p.z = v.z > 0 ? Math.floor(p.z + r) - r - 0.001 : Math.floor(p.z - r) + 1 + r + 0.001;
      v.z = 0;
    }
    if (p.y < -30) this.dead = true;
  }

  dispose() {
    this.root.dispose(false, true);
  }
}
