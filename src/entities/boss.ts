import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, TransformNode, ParticleSystem, Color4, Texture } from "@babylonjs/core";

// A dragon-like aerial boss for the End dimension. It circles the central
// island, periodically dives at the player to deal damage, and can be wounded
// by melee strikes when it swoops close.
export class DragonBoss {
  scene: Scene;
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  wings: Mesh[] = [];
  health: number;
  maxHealth: number;
  center: Vector3;
  angle = 0;
  state: "circle" | "dive" | "rise" = "circle";
  stateTimer = 0;
  diveTarget = new Vector3();
  position = new Vector3(0, 70, 0);
  velocity = new Vector3();
  dead = false;
  onDamagePlayer?: (dmg: number) => void;
  onDefeat?: () => void;
  attackCooldown = 0;
  private hitFlash = 0;
  private trail?: ParticleSystem;

  constructor(scene: Scene, center: Vector3, health = 200) {
    this.scene = scene;
    this.center = center.clone();
    this.health = health;
    this.maxHealth = health;

    this.root = new TransformNode("dragon", scene);
    const dark = new Color3(0.08, 0.05, 0.12);

    this.body = MeshBuilder.CreateBox("dbody", { width: 1.4, height: 1.0, depth: 3.2 }, scene);
    this.body.parent = this.root;
    this.body.material = this.mat(dark);

    this.head = MeshBuilder.CreateBox("dhead", { size: 1.0 }, scene);
    this.head.parent = this.root;
    this.head.position.set(0, 0.2, 2.1);
    this.head.material = this.mat(new Color3(0.12, 0.07, 0.16));

    // glowing eyes
    const eyeL = MeshBuilder.CreateBox("eyeL", { size: 0.16 }, scene);
    eyeL.parent = this.head; eyeL.position.set(-0.25, 0.1, 0.45);
    const eyeM = new StandardMaterial("eye", scene); eyeM.emissiveColor = new Color3(0.9, 0.2, 0.9); eyeM.disableLighting = true;
    eyeL.material = eyeM;
    const eyeR = eyeL.clone("eyeR"); eyeR.position.x = 0.25;

    // wings (thin boxes that flap)
    for (const side of [-1, 1]) {
      const w = MeshBuilder.CreateBox("wing", { width: 3.4, height: 0.08, depth: 1.6 }, scene);
      w.parent = this.root;
      w.position.set(side * 2.0, 0.4, 0);
      w.material = this.mat(new Color3(0.1, 0.06, 0.14));
      this.wings.push(w);
    }
    for (const m of [this.body, this.head, ...this.wings]) m.isPickable = false;

    // purple trail particles
    this.trail = new ParticleSystem("dragontrail", 200, scene);
    this.trail.particleTexture = this.makeGlowTex();
    this.trail.emitter = this.position;
    this.trail.color1 = new Color4(0.6, 0.2, 0.9, 0.8);
    this.trail.color2 = new Color4(0.4, 0.1, 0.7, 0.6);
    this.trail.colorDead = new Color4(0.2, 0.05, 0.4, 0);
    this.trail.minSize = 0.3; this.trail.maxSize = 0.8;
    this.trail.emitRate = 60;
    this.trail.gravity = new Vector3(0, -1, 0);
    this.trail.minLifeTime = 0.4; this.trail.maxLifeTime = 0.8;
    this.trail.start();
  }

  private makeGlowTex(): Texture {
    const c = document.createElement("canvas");
    c.width = 16; c.height = 16;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
    const tex = new Texture(c as any, this.scene, false, false);
    tex.hasAlpha = true;
    return tex;
  }

  private mat(color: Color3): StandardMaterial {
    const m = new StandardMaterial("dmat", this.scene);
    m.diffuseColor = color;
    m.emissiveColor = color.scale(0.3);
    m.specularColor = new Color3(0.2, 0.2, 0.2);
    return m;
  }

  hurt(amount: number): boolean {
    if (this.dead) return false;
    this.health -= amount;
    this.hitFlash = 0.25;
    if (this.health <= 0) {
      this.dead = true;
      this.trail?.stop();
      const r = this.root;
      setTimeout(() => r.dispose(false, true), 1200);
      if (this.onDefeat) this.onDefeat();
      return true;
    }
    return false;
  }

  update(dt: number, playerPos: Vector3) {
    if (this.dead) {
      // fall and fade
      this.velocity.y -= 20 * dt;
      this.position.addInPlace(this.velocity.scale(dt));
      this.root.position.copyFrom(this.position);
      this.root.rotation.z += dt * 2;
      return;
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const flash = this.hitFlash > 0;
    (this.body.material as StandardMaterial).emissiveColor = flash ? new Color3(0.9, 0.2, 0.2) : new Color3(0.08, 0.05, 0.12).scale(0.3);

    const radius = 24;
    const baseHeight = this.center.y + 26;

    if (this.state === "circle") {
      this.angle += dt * 0.5;
      const target = new Vector3(
        this.center.x + Math.cos(this.angle) * radius,
        baseHeight + Math.sin(this.angle * 2) * 3,
        this.center.z + Math.sin(this.angle) * radius
      );
      this.moveTo(target, dt, 12);
      this.stateTimer += dt;
      // dive every ~8s
      if (this.stateTimer > 8) {
        this.stateTimer = 0;
        this.state = "dive";
        this.diveTarget.copyFrom(playerPos);
      }
    } else if (this.state === "dive") {
      const target = this.diveTarget.add(new Vector3(0, 1, 0));
      this.moveTo(target, dt, 26);
      // damage player if close
      if (this.position.subtract(playerPos).length() < 2.4 && this.attackCooldown <= 0) {
        if (this.onDamagePlayer) this.onDamagePlayer(6);
        this.attackCooldown = 1.2;
      }
      if (this.position.subtract(target).length() < 2.5) {
        this.state = "rise";
      }
    } else { // rise
      const target = new Vector3(this.position.x, baseHeight, this.position.z);
      this.moveTo(target, dt, 18);
      if (Math.abs(this.position.y - baseHeight) < 2) {
        this.state = "circle";
        // re-sync angle to current position
        this.angle = Math.atan2(this.position.z - this.center.z, this.position.x - this.center.x);
      }
    }

    this.root.position.copyFrom(this.position);
    // face direction of travel
    const forward = this.velocity.lengthSquared() > 0.01 ? this.velocity.normalize() : new Vector3(0, 0, 1);
    this.root.rotation.y = Math.atan2(forward.x, forward.z);
    this.root.rotation.x = -Math.asin(Math.max(-1, Math.min(1, forward.y))) * 0.5;
    // flap wings
    const t = performance.now() / 1000;
    const flap = Math.sin(t * 6) * 0.5;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
  }

  private moveTo(target: Vector3, dt: number, speed: number) {
    const dir = target.subtract(this.position);
    const dist = dir.length();
    if (dist < 0.001) { this.velocity.set(0, 0, 0); return; }
    const desired = dir.normalize().scale(Math.min(speed, dist * 3));
    // smooth velocity
    this.velocity = Vector3.Lerp(this.velocity, desired, Math.min(1, dt * 3));
    this.position.addInPlace(this.velocity.scale(dt));
  }

  // Sphere test for player melee hits.
  intersectsRay(origin: Vector3, dir: Vector3, reach: number): boolean {
    const to = this.position.subtract(origin);
    const t = Vector3.Dot(to, dir);
    if (t < 0 || t > reach + 3) return false;
    const closest = origin.add(dir.scale(t));
    return closest.subtract(this.position).length() < 3.2;
  }

  dispose() {
    this.trail?.dispose();
    this.root.dispose(false, true);
  }
}
