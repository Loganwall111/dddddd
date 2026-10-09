import { BlockId, BLOCKS } from "../blocks/blocks";
import { WorldManager } from "../world/worldManager";
import { CHUNK_HEIGHT } from "../world/chunk";
import { ParticleSystem, Color4, Texture, Vector3, Scene, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";

export interface ExplosionOpts {
  power: number;     // radius
  fire: boolean;
  source: Vector3;
}

// Perform a TNT-style explosion in the world.
export function detonateTNT(world: WorldManager, scene: Scene, wx: number, wy: number, wz: number, power = 4): void {
  const center = new Vector3(wx + 0.5, wy + 0.5, wz + 0.5);
  // Remove the TNT block itself
  world.setBlockWorld(wx, wy, wz, BlockId.Air);

  // Flash mesh (quick billboard)
  const flash = MeshBuilder.CreateSphere("flash", { diameter: power * 1.2 }, scene);
  flash.position = center.clone();
  const fm = new StandardMaterial("flashmat", scene);
  fm.emissiveColor = new Color3(1, 0.85, 0.4);
  fm.disableLighting = true;
  flash.material = fm;

  // Compute destroyed blocks: raycast from center in many directions, attenuating by blast resistance
  const rays = 256;
  const destroyed: { x:number; y:number; z:number; b: BlockId }[] = [];
  for (let i = 0; i < rays; i++) {
    // distribute directions uniformly-ish
    const phi = Math.acos(1 - 2*((i + 0.5)/rays));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const dx = Math.sin(phi)*Math.cos(theta);
    const dy = Math.cos(phi);
    const dz = Math.sin(phi)*Math.sin(theta);
    let intensity = (0.7 + 0.6*Math.random()) * power;
    let x = wx, y = wy, z = wz;
    const maxSteps = Math.ceil(power * 1.6);
    for (let step = 0; step < maxSteps && intensity > 0; step++) {
      x = Math.floor(wx + dx * (step+1) + 0.5);
      y = Math.floor(wy + dy * (step+1) + 0.5);
      z = Math.floor(wz + dz * (step+1) + 0.5);
      if (y < 0 || y >= CHUNK_HEIGHT) break;
      const b = world.getBlockWorld(x, y, z);
      if (b === BlockId.Air) { intensity -= 0.225; continue; }
      const def = BLOCKS[b];
      if (!def) { intensity -= 0.3; continue; }
      const res = Math.max(0.01, def.blastResistance / 5);
      if (intensity - res > 0) {
        destroyed.push({ x, y, z, b });
        // chain reaction
        if (b === BlockId.TNT) {
          // trigger TNT later
          const bx = x, by = y, bz = z;
          setTimeout(() => detonateTNT(world, scene, bx, by, bz, power), 350 + Math.random()*200);
        }
      }
      intensity -= res + 0.3;
    }
  }
  // Apply destruction
  const air = BlockId.Air;
  for (const d of destroyed) world.setBlockWorld(d.x, d.y, d.z, air);
  // 30% of destroyed blocks drop as items — for Phase 1 we simply spawn a few pickup particles
  spawnExplosionParticles(scene, center, power);
  // Camera shake applied by caller (player)
  setTimeout(() => { flash.dispose(); try { fm.dispose(); } catch(e){} }, 180);
}

function spawnExplosionParticles(scene: Scene, center: Vector3, power: number) {
  // Simple particle system
  const ps = new ParticleSystem("explosion", 400, scene);
  ps.particleTexture = makeParticleTexture(scene);
  ps.emitter = center;
  ps.minEmitBox = new Vector3(-1,-1,-1);
  ps.maxEmitBox = new Vector3(1,1,1);
  ps.color1 = new Color4(1, 0.9, 0.4, 1);
  ps.color2 = new Color4(1, 0.5, 0.1, 1);
  ps.colorDead = new Color4(0.2, 0.2, 0.2, 0);
  ps.minSize = 0.2; ps.maxSize = 1.0;
  ps.emitRate = 400;
  ps.gravity = new Vector3(0, -9, 0);
  ps.direction1 = new Vector3(-power*0.5,power,-power*0.5);
  ps.direction2 = new Vector3(power*0.5,power*2,power*0.5);
  ps.minEmitPower = 2; ps.maxEmitPower = 8;
  ps.targetStopDuration = 0.5;
  ps.start();
  setTimeout(() => ps.dispose(), 2200);

  // Smoke
  const smoke = new ParticleSystem("smoke", 200, scene);
  smoke.particleTexture = makeParticleTexture(scene);
  smoke.emitter = center;
  smoke.color1 = new Color4(0.2,0.2,0.2,0.8);
  smoke.color2 = new Color4(0.4,0.4,0.4,0.6);
  smoke.colorDead = new Color4(0.1,0.1,0.1,0);
  smoke.minSize = 1.0; smoke.maxSize = 2.5;
  smoke.emitRate = 100;
  smoke.gravity = new Vector3(0, 2, 0);
  smoke.minEmitPower = 1; smoke.maxEmitPower = 3;
  smoke.targetStopDuration = 1.0;
  smoke.start();
  setTimeout(() => smoke.dispose(), 4000);
}

function makeParticleTexture(scene: Scene): Texture {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 16;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(8,8,1,8,8,8);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,16,16);
  const tex = new Texture(c as any, scene, false, false);
  tex.hasAlpha = true;
  return tex;
}
