/**
 * THE MULTIVERSE — world/creatures.js
 * ==================================================================
 * BESTIARY MACHINERY. Every animal in the game is built at runtime from the
 * codex entry in lore.js: body segments, legs, heads, jaws, tentacles, wings,
 * shells, glow sacs — then animated with procedural gaits (no imported
 * animations, no skeletal files).
 *
 * Included:
 *   • Creature       — mesh rig + gait animation + health/state
 *   • CreatureAI     — herbivore herds, pack hunters, migratory leviathans,
 *                      followers, observers, static titans
 *   • Population     — streaming spawn/despawn around the player by biome
 *
 * Physics note: creatures walk the same height field the player does, so
 * hooves land on the terrain you can see.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
  CapsuleGeometry,
  ConeGeometry,
  DoubleSide,
} from 'three';
import { clamp, clamp01, damp, dampAngle, lerp, smoothstep } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { speciesById } from '../lore.js';

/* ------------------------------------------------------------------ *
 * Shared materials (created once per world, not per animal)
 * ------------------------------------------------------------------ */

export class CreatureMaterials {
  constructor(textures, seed = 1337) {
    this.textures = textures;
    this.cache = new Map();
    this.seed = seed;
  }

  skin(color, { roughness = 0.72, metalness = 0.04, emissive = null, emissiveIntensity = 0.4, surface = 'flesh' } = {}) {
    const key = `${color}:${roughness}:${surface}:${emissive}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const set = this.textures.surface(surface, { seed: this.seed + color });
    const material = new MeshStandardMaterial({
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      color,
      roughness,
      metalness,
      emissive: emissive ?? new Color(0x000000),
      emissiveIntensity,
      envMapIntensity: 0.5,
      dithering: true,
    });
    this.cache.set(key, material);
    return material;
  }

  glow(color, intensity = 1.4) {
    const key = `glow:${color}:${intensity}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const material = new MeshStandardMaterial({
      color,
      emissive: new Color(color),
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
    });
    this.cache.set(key, material);
    return material;
  }

  dispose() {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
  }
}

/* ------------------------------------------------------------------ *
 * Body plans per species
 * ------------------------------------------------------------------ */

const PLANS = {
  grazer: {
    segments: 7, segmentRadius: 0.85, segmentLength: 0.9, legs: 6, legLength: 2.9, legThickness: 0.24,
    neck: 1.5, head: 0.85, headShapes: ['long'], tail: 1.4, scale: 1, glowSacs: 2, horns: 2, eyes: 2,
    bodyColor: 0x8a7f5f, bellyColor: 0xc9bd93, gait: 'walk', sound: 'creature.grazer', height: 5,
  },
  strider: {
    segments: 6, segmentRadius: 0.7, segmentLength: 1.1, legs: 4, legLength: 6.4, legThickness: 0.3,
    neck: 3.2, head: 0.7, headShapes: ['beak'], tail: 2.2, scale: 1, glowSacs: 0, horns: 3, eyes: 4,
    bodyColor: 0x6f7b86, bellyColor: 0xa8b6c0, gait: 'stalk', sound: 'creature.strider', height: 9,
  },
  bloomback: {
    segments: 8, segmentRadius: 1.05, segmentLength: 0.85, legs: 8, legLength: 1.9, legThickness: 0.28,
    neck: 1.1, head: 0.72, headShapes: ['round'], tail: 1.1, scale: 1, glowSacs: 5, horns: 0, eyes: 2,
    bodyColor: 0x5e6b4a, bellyColor: 0x8fa06a, gait: 'trudge', sound: 'creature.bloomback', height: 4.4,
  },
  skitterjaw: {
    segments: 5, segmentRadius: 0.38, segmentLength: 0.45, legs: 6, legLength: 0.95, legThickness: 0.12,
    neck: 0.35, head: 0.42, headShapes: ['jaw'], tail: 0.8, scale: 1, glowSacs: 1, horns: 0, eyes: 4,
    bodyColor: 0x4a3b3a, bellyColor: 0x8c6d5f, gait: 'skitter', sound: 'creature.skitterjaw', height: 1.4,
  },
  lusca: {
    segments: 10, segmentRadius: 1.9, segmentLength: 1.6, legs: 0, legLength: 0, legThickness: 0,
    neck: 0, head: 1.6, headShapes: ['whale'], tail: 3.4, scale: 1, glowSacs: 12, horns: 0, eyes: 2,
    bodyColor: 0x2b4d63, bellyColor: 0x7fb6cf, gait: 'swim', sound: 'creature.whale', height: 8, aquatic: true,
  },
  skywhale: {
    segments: 12, segmentRadius: 3.2, segmentLength: 2.6, legs: 0, legLength: 0, legThickness: 0,
    neck: 0, head: 2.6, headShapes: ['whale'], tail: 5.5, scale: 1, glowSacs: 16, horns: 0, eyes: 2,
    bodyColor: 0x516a86, bellyColor: 0xcfe0f0, gait: 'fly', sound: 'creature.whale', height: 16, aerial: true,
  },
  eye: {
    segments: 1, segmentRadius: 0.9, segmentLength: 0.4, legs: 8, legLength: 1.9, legThickness: 0.1,
    neck: 0, head: 1.0, headShapes: ['eye'], tail: 0, scale: 1, glowSacs: 1, horns: 0, eyes: 1,
    bodyColor: 0xd8d0c0, bellyColor: 0xf2ece0, gait: 'tentacle', sound: 'creature.eye', height: 2.6,
  },
  mothlight: {
    segments: 2, segmentRadius: 0.2, segmentLength: 0.24, legs: 4, legLength: 0.2, legThickness: 0.04,
    neck: 0, head: 0.14, headShapes: ['round'], tail: 0.1, scale: 1, glowSacs: 4, horns: 0, eyes: 2,
    bodyColor: 0xf0e0b0, bellyColor: 0xfff6d8, gait: 'fly', sound: 'creature.moth', height: 0.5, aerial: true,
    wings: 4,
  },
  titanroot: {
    segments: 9, segmentRadius: 2.4, segmentLength: 2.2, legs: 12, legLength: 8, legThickness: 0.9,
    neck: 0, head: 0.8, headShapes: ['pod'], tail: 0, scale: 1, glowSacs: 3, horns: 0, eyes: 0,
    bodyColor: 0x3c4a34, bellyColor: 0x5c6b4a, gait: 'still', sound: 'creature.titanroot', height: 24, rooted: true,
  },
  attendant: {
    segments: 3, segmentRadius: 0.5, segmentLength: 0.5, legs: 3, legLength: 1.6, legThickness: 0.08,
    neck: 0.7, head: 0.5, headShapes: ['mask'], tail: 0, scale: 1, glowSacs: 3, horns: 2, eyes: 2,
    bodyColor: 0xcdd6e0, bellyColor: 0xf0f6ff, gait: 'drift', sound: 'creature.attendant', height: 3.2,
  },
  ant: {
    segments: 4, segmentRadius: 0.4, segmentLength: 0.5, legs: 6, legLength: 1.4, legThickness: 0.1,
    neck: 0.2, head: 0.4, headShapes: ['jaw'], tail: 0.3, scale: 1, glowSacs: 0, horns: 2, eyes: 2,
    bodyColor: 0x33251c, bellyColor: 0x5c4632, gait: 'skitter', sound: 'creature.ant', height: 1.1,
  },
};

/** A living, animatable creature. */
export class Creature {
  constructor({ speciesId, rng, materials, field, position, scale = 1, seedExtra = 0 }) {
    this.species = speciesById(speciesId);
    this.plan = PLANS[speciesId] || PLANS.grazer;
    this.rng = rng ?? new Rng(1);
    this.materials = materials;
    this.field = field;
    this.scale = scale * (this.plan.scale ?? 1) * this.rng.range(0.85, 1.2);
    this.id = `c-${speciesId}-${Math.round((position?.x ?? 0) * 7)}-${Math.round((position?.z ?? 0) * 13)}-${seedExtra}`;

    this.root = new Group();
    this.root.name = `creature-${this.species.id}`;
    this.bones = { legs: [], segments: [], neck: null, head: null, jaw: null, tail: [], wings: [], tentacles: [] };
    this.velocity = new Vector3();
    this.forward = new Vector3(0, 0, 1);
    this.speed = 0;
    this.targetSpeed = 0;
    this.state = 'idle';
    this.health = 1;
    this.alertness = 0;
    this.metPlayer = false;
    this.animTime = this.rng.float() * 10;
    this.gaitPhase = this.rng.float() * Math.PI * 2;
    this.lookTarget = new Vector3();
    this.wanderAngle = this.rng.angle();
    this.talking = false;
    this.discovered = false;
    this.dead = false;
    this.lifetime = 0;

    this._build();
    if (position) {
      this.root.position.set(position.x, this._groundHeight(position.x, position.z), position.z);
    }
    this.homeX = this.root.position.x;
    this.homeZ = this.root.position.z;
  }

  _groundHeight(x, z) {
    if (!this.field) return 0;
    return this.field.heightAt(x, z);
  }

  _build() {
    const plan = this.plan;
    const rng = this.rng;
    const bodyMat = this.materials.skin(plan.bodyColor, {
      roughness: plan.aquatic ? 0.35 : 0.72,
      metalness: plan.aquatic ? 0.12 : 0.04,
      surface: plan.aquatic ? 'coral' : 'flesh',
    });
    const bellyMat = this.materials.skin(plan.bellyColor, { roughness: 0.8, surface: 'flesh' });
    const glowMat = this.materials.glow(this.species.luminance > 0.5 ? 0x9fe8ff : 0xffd8a0, 1.1 + rng.float());

    // ---- spine: tapered segments ----
    let offset = 0;
    for (let i = 0; i < plan.segments; i++) {
      const t = i / Math.max(1, plan.segments - 1);
      const radius = plan.segmentRadius * lerp(1.15, 0.6, t) * this.scale;
      const geometry = new SphereGeometry(radius, 10, 8);
      geometry.scale(1, 0.82, plan.segmentLength / Math.max(0.1, plan.segmentRadius));
      const mesh = new Mesh(geometry, i % 3 === 0 ? bellyMat : bodyMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, radius * 0.92, offset);
      this.root.add(mesh);
      this.bones.segments.push(mesh);
      offset += plan.segmentLength * this.scale * 0.85;
    }
    this.bodyLength = offset;
    const midIndex = Math.floor(plan.segments * 0.4);
    const midSegment = this.bones.segments[Math.max(0, Math.min(plan.segments - 1, midIndex))];
    const bodyRadius = plan.segmentRadius * this.scale;

    // ---- glow sacs: bioluminescence along the spine ----
    for (let i = 0; i < plan.glowSacs; i++) {
      const t = (i + 0.5) / Math.max(1, plan.glowSacs);
      const radius = bodyRadius * lerp(0.2, 0.1, t) * this.scale;
      const sac = new Mesh(new SphereGeometry(radius, 8, 6), glowMat);
      sac.position.set(
        (rng.float() - 0.5) * bodyRadius * 1.4,
        bodyRadius * (1.15 + rng.float() * 0.2),
        lerp(0, offset, t)
      );
      this.root.add(sac);
      if (i === 0 && this.species.luminance > 0.6) {
        const light = new PointLight(0x9fe8ff, 0.6, 18, 2);
        light.position.copy(sac.position);
        this.root.add(light);
        this.glowLight = light;
      }
    }

    // ---- neck + head ----
    const neckBase = new Vector3(0, bodyRadius * 0.9, offset);
    if (plan.neck > 0) {
      const neckMesh = new Mesh(new CylinderGeometry(bodyRadius * 0.35, bodyRadius * 0.5, plan.neck * this.scale, 8), bodyMat);
      neckMesh.castShadow = true;
      neckMesh.position.set(0, neckBase.y + (plan.neck * this.scale) / 2, neckBase.z);
      neckMesh.rotation.x = -0.35;
      this.root.add(neckMesh);
      this.bones.neck = neckMesh;
    }
    const headRadius = plan.head * this.scale;
    const headGroup = new Group();
    headGroup.position.set(0, neckBase.y + (plan.neck * this.scale) * 0.9, neckBase.z + (plan.neck > 0 ? plan.neck * this.scale * 0.3 : 0));
    this.root.add(headGroup);
    this.bones.head = headGroup;

    for (const shape of plan.headShapes) {
      if (shape === 'long') {
        const skull = new Mesh(new CapsuleGeometry(headRadius * 0.55, headRadius * 1.5, 6, 8), bodyMat);
        skull.rotation.x = Math.PI / 2;
        skull.castShadow = true;
        headGroup.add(skull);
      } else if (shape === 'beak') {
        const skull = new Mesh(new ConeGeometry(headRadius * 0.5, headRadius * 2.6, 7), bodyMat);
        skull.rotation.x = Math.PI / 2;
        skull.castShadow = true;
        headGroup.add(skull);
      } else if (shape === 'jaw') {
        const skull = new Mesh(new BoxGeometry(headRadius * 1.4, headRadius * 1.1, headRadius * 1.9), bodyMat);
        skull.castShadow = true;
        headGroup.add(skull);
        const jaw = new Group();
        jaw.position.set(0, -headRadius * 0.4, headRadius * 0.2);
        const jawMesh = new Mesh(new BoxGeometry(headRadius * 1.2, headRadius * 0.4, headRadius * 1.7), bellyMat);
        jawMesh.position.z = headRadius * 0.7;
        jaw.add(jawMesh);
        headGroup.add(jaw);
        this.bones.jaw = jaw;
      } else if (shape === 'whale') {
        const skull = new Mesh(new SphereGeometry(headRadius * 1.3, 12, 10), bodyMat);
        skull.scale.set(1, 0.9, 1.8);
        skull.castShadow = true;
        headGroup.add(skull);
      } else if (shape === 'eye') {
        const sclera = new Mesh(new SphereGeometry(headRadius, 18, 14), this.materials.glow(0xf5f2e8, 0.25));
        headGroup.add(sclera);
        const iris = new Mesh(new SphereGeometry(headRadius * 0.55, 16, 12), this.materials.glow(0x3a2f2a, 0.2));
        iris.position.z = headRadius * 0.62;
        headGroup.add(iris);
        const pupil = new Mesh(new SphereGeometry(headRadius * 0.26, 12, 10), this.materials.glow(0x090909, 0.1));
        pupil.position.z = headRadius * 0.82;
        headGroup.add(pupil);
        this.bones.eye = { iris, pupil, sclera };
      } else if (shape === 'round' || shape === 'mask' || shape === 'pod') {
        const skull = new Mesh(new IcosahedronGeometry(headRadius, shape === 'pod' ? 0 : 1), bodyMat);
        skull.castShadow = true;
        headGroup.add(skull);
      }
    }

    // ---- eyes ----
    const eyeCount = Math.min(6, plan.eyes);
    for (let i = 0; i < eyeCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(i / 2);
      const eye = new Mesh(
        new SphereGeometry(headRadius * 0.19, 10, 8),
        this.materials.glow(row === 0 ? 0x1a1a22 : 0xffcc66, row === 0 ? 0.3 : 1.4)
      );
      eye.position.set(side * headRadius * 0.62, headRadius * (0.2 - row * 0.3), headRadius * 0.62);
      headGroup.add(eye);
      if (row > 0) {
        const glint = new PointLight(0xffcc66, 0.2, 6, 2);
        glint.position.copy(eye.position);
        headGroup.add(glint);
      }
    }

    // ---- jaws / mandibles for predators ----
    if (plan.gait === 'skitter' || plan.gait === 'stalk') {
      for (let s = -1; s <= 1; s += 2) {
        const mandible = new Mesh(new ConeGeometry(headRadius * 0.2, headRadius * 1.2, 5), bellyMat);
        mandible.position.set(s * headRadius * 0.4, -headRadius * 0.3, headRadius * 0.9);
        mandible.rotation.x = Math.PI / 2.4;
        headGroup.add(mandible);
      }
    }

    // ---- horns / crests ----
    for (let i = 0; i < plan.horns; i++) {
      const horn = new Mesh(new ConeGeometry(headRadius * 0.16, headRadius * (1.1 + i * 0.3), 6), bellyMat);
      horn.position.set(
        (i % 2 === 0 ? 1 : -1) * headRadius * 0.4,
        headRadius * (0.7 + i * 0.1),
        headRadius * 0.1 - i * headRadius * 0.2
      );
      horn.rotation.z = (i % 2 === 0 ? -0.4 : 0.4) + this.rng.range(-0.15, 0.15);
      headGroup.add(horn);
    }

    // ---- legs (or tentacles) ----
    const legCount = plan.legs;
    for (let i = 0; i < legCount; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(i / 2);
      const rows = Math.max(1, Math.ceil(legCount / 2));
      const z = lerp(bodyRadius * 1.2, offset - bodyRadius * 0.6, row / Math.max(1, rows - 1));
      const legGroup = new Group();
      legGroup.position.set(s * bodyRadius * 0.8, bodyRadius * 0.6, z);
      this.root.add(legGroup);

      const upperLength = plan.legLength * this.scale * 0.55;
      const lowerLength = plan.legLength * this.scale * 0.55;
      const thickness = plan.legThickness * this.scale;

      const upper = new Mesh(new CapsuleGeometry(thickness, upperLength, 4, 6), bodyMat);
      upper.position.y = -upperLength / 2;
      upper.castShadow = true;
      legGroup.add(upper);

      const knee = new Group();
      knee.position.y = -upperLength;
      legGroup.add(knee);
      const lower = new Mesh(new CapsuleGeometry(thickness * 0.82, lowerLength, 4, 6), bodyMat);
      lower.position.y = -lowerLength / 2;
      lower.castShadow = true;
      knee.add(lower);

      const foot = new Group();
      foot.position.y = -lowerLength;
      knee.add(foot);
      const hoof = new Mesh(new SphereGeometry(thickness * 1.2, 6, 5), bellyMat);
      hoof.scale.set(1, 0.6, 1.5);
      foot.add(hoof);

      this.bones.legs.push({
        group: legGroup,
        upper,
        knee,
        lower,
        foot,
        side: s,
        row,
        phase: (row / rows) * Math.PI + (s > 0 ? 0 : Math.PI),
        restAngle: -0.25,
        upperLength,
        lowerLength,
        isTentacle: plan.gait === 'tentacle',
      });
      void z;
    }

    // ---- tail ----
    if (plan.tail > 0) {
      let parent = this.root;
      let tailLength = plan.tail * this.scale;
      const links = Math.max(2, Math.round(tailLength / 0.6));
      for (let i = 0; i < links; i++) {
        const group = new Group();
        group.position.set(0, plan.segmentRadius * 0.7 * this.scale, i === 0 ? -plan.segmentRadius * 0.4 : -tailLength / links);
        parent.add(group);
        const radius = bodyRadius * lerp(0.42, 0.1, i / links);
        const mesh = new Mesh(new SphereGeometry(radius, 8, 6), bodyMat);
        mesh.castShadow = true;
        group.add(mesh);
        this.bones.tail.push(group);
        parent = group;
      }
    }

    // ---- wings (moths, flying things) ----
    for (let i = 0; i < (plan.wings ?? 0); i++) {
      const s = i % 2 === 0 ? 1 : -1;
      const wing = new Mesh(
        new SphereGeometry(bodyRadius * 2.6, 10, 8),
        new MeshStandardMaterial({
          color: 0xffe6b0,
          emissive: 0xffcf80,
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.55,
          side: DoubleSide,
          roughness: 0.6,
        })
      );
      wing.scale.set(1.5, 0.06, 1);
      wing.position.set(s * bodyRadius * 1.4, bodyRadius * 0.8, offset * 0.4 - i * 0.12);
      this.root.add(wing);
      this.bones.wings.push({ mesh: wing, side: s, phase: i * 0.6 });
    }

    // ---- sensor / mouth glow ----
    if (this.species.luminance >= 0.7) {
      const aura = new Mesh(
        new SphereGeometry(bodyRadius * 3.4, 12, 10),
        new MeshStandardMaterial({
          color: 0x9fe8ff,
          emissive: 0x6fd8ff,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.075,
          depthWrite: false,
        })
      );
      this.root.add(aura);
      this.aura = aura;
    }

    this.root.scale.setScalar(1);
    this.root.traverse((child) => {
      if (child.isMesh) child.frustumCulled = true;
    });
  }

  /* ---------------------------------------------------------------- *
   * Simulation
   * ---------------------------------------------------------------- */

  update(dt, { playerPosition = null, groundQuery = null, time = 0, stormy = false } = {}) {
    this.lifetime += dt;
    this.animTime += dt * (0.6 + this.speed * 0.4);
    const plan = this.plan;

    // ---- gait animation ----
    const stride = plan.gait === 'walk' ? 1.4 : plan.gait === 'stalk' ? 1.1 : plan.gait === 'skitter' ? 3.2 : 1.6;
    const moveAmount = clamp01(this.speed / Math.max(0.6, this.maxSpeed ?? 4));
    this.gaitPhase += dt * stride * (0.5 + moveAmount * 1.6);

    for (let i = 0; i < this.bones.legs.length; i++) {
      const leg = this.bones.legs[i];
      const phase = this.gaitPhase + leg.phase + (i % 2) * Math.PI;
      if (leg.isTentacle) {
        // Tentacles: curl and reach in a travelling wave.
        const wave = Math.sin(phase * 0.9) * 0.5 + Math.sin(phase * 1.7 + i) * 0.2;
        leg.group.rotation.x = wave * 0.5;
        leg.group.rotation.z = Math.cos(phase * 0.7 + i) * 0.3;
        leg.knee.rotation.x = 0.5 + Math.sin(phase * 1.2 + i * 0.7) * 0.35;
      } else if (plan.gait === 'still' || plan.gait === 'drift') {
        leg.group.rotation.x = Math.sin(this.animTime * 0.4 + i) * 0.03;
        leg.knee.rotation.x = 0.1;
      } else {
        const swing = Math.sin(phase) * (0.18 + moveAmount * 0.62);
        const lift = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * (0.1 + moveAmount * 0.5);
        leg.group.rotation.x = swing;
        leg.group.rotation.z = leg.side * (0.06 + lift * 0.14);
        leg.knee.rotation.x = leg.restAngle + lift * 0.9 + 0.2 * moveAmount;
      }
    }

    // ---- body: bob, sway, pitch with the ground ----
    const bob = Math.sin(this.gaitPhase * 2) * 0.06 * moveAmount * (plan.gait === 'skitter' ? 1.6 : 1);
    const sway = Math.cos(this.gaitPhase) * 0.05 * moveAmount;
    this.root.position.y += bob * dt * 6;
    for (let i = 0; i < this.bones.segments.length; i++) {
      const seg = this.bones.segments[i];
      const t = i / Math.max(1, this.bones.segments.length - 1);
      seg.position.x = sway * t;
      seg.rotation.y = Math.sin(this.gaitPhase * 2 + t * 3) * 0.05 * moveAmount;
    }

    // ---- tail whip ----
    for (let i = 0; i < this.bones.tail.length; i++) {
      const link = this.bones.tail[i];
      const t = i / Math.max(1, this.bones.tail.length);
      link.rotation.y = Math.sin(this.animTime * 1.6 - t * 2.2) * (0.12 + moveAmount * 0.28);
      link.rotation.x = Math.sin(this.animTime * 1.1 - t * 1.6) * 0.08;
    }

    // ---- head: look at the player when curious or threatened ----
    if (this.bones.head) {
      const head = this.bones.head;
      let lookX = 0;
      let lookY = 0;
      if (playerPosition && (this.metPlayer || this.plan.gait === 'tentacle')) {
        const local = this.root.worldToLocal(new Vector3().copy(playerPosition));
        const angle = Math.atan2(local.x, local.z);
        lookY = clamp(angle, -0.9, 0.9) * (0.4 + this.alertness * 0.6);
        const distance = local.length();
        lookX = clamp(Math.atan2(local.y - this.root.position.y, Math.max(0.5, distance)) * 0.5, -0.6, 0.6);
      }
      head.rotation.y = damp(head.rotation.y, lookY, 3, dt);
      head.rotation.x = damp(head.rotation.x, lookX - (plan.gait === 'walk' ? 0.05 : 0), 3, dt);
    }
    if (this.bones.jaw) {
      this.bones.jaw.rotation.x = 0.12 + Math.max(0, Math.sin(this.animTime * 2.4)) * 0.22 * (this.talking ? 1 : this.alertness);
    }
    for (const wing of this.bones.wings) {
      wing.mesh.rotation.z = wing.side * (0.4 + Math.sin(this.animTime * 9 + wing.phase) * 0.7);
      wing.mesh.rotation.y = Math.sin(this.animTime * 9 + wing.phase) * 0.3;
    }
    if (this.aura) {
      this.aura.scale.setScalar(1 + Math.sin(this.animTime * 1.3) * 0.06);
    }
    if (this.glowLight) {
      this.glowLight.intensity = 0.4 + (stormy ? 0.2 : 0) + Math.sin(this.animTime * 2.1) * 0.15;
    }

    // ---- world glue: stand on the ground, unless aquatic/aerial ----
    if (!plan.aquatic && !plan.aerial && !plan.rooted) {
      const x = this.root.position.x;
      const z = this.root.position.z;
      const ground = groundQuery ? groundQuery(x, z) : this._groundHeight(x, z);
      this.root.position.y = damp(this.root.position.y, ground, 8, dt);
      // pitch to match the slope ahead
      const ahead = groundQuery ? groundQuery(x + this.forward.x * 2, z + this.forward.z * 2) : this._groundHeight(x + this.forward.x * 2, z + this.forward.z * 2);
      const targetPitch = clamp(Math.atan2(ahead - ground, 2), -0.5, 0.5);
      this.root.rotation.x = damp(this.root.rotation.x, -targetPitch, 3, dt);
    } else if (plan.rooted) {
      this.root.rotation.z = Math.sin(this.animTime * 0.35) * 0.02;
    }
    this.maxSpeed = this.maxSpeed ?? 4;
    void time;
  }

  /** Face and move toward a direction (radians). */
  moveToward(angle, speed, dt) {
    this.root.rotation.y = dampAngle(this.root.rotation.y, angle, 4, dt);
    this.forward.set(Math.sin(angle), 0, Math.cos(angle));
    this.targetSpeed = speed;
    this.speed = damp(this.speed, this.targetSpeed, 2.4, dt);
    this.root.position.x += this.forward.x * this.speed * dt;
    this.root.position.z += this.forward.z * this.speed * dt;
  }

  /** Turn to look at a point without moving. */
  faceTowards(position, dt, rate = 3) {
    const dx = position.x - this.root.position.x;
    const dz = position.z - this.root.position.z;
    this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(dx, dz), rate, dt);
  }

  get position() {
    return this.root.position;
  }

  get eyeHeight() {
    return this.plan.height * 0.75 * this.scale;
  }

  /** Distance from the creature's centre to a point. */
  distanceTo(position) {
    return Math.hypot(
      position.x - this.root.position.x,
      position.y - this.root.position.y,
      position.z - this.root.position.z
    );
  }

  dispose() {
    this.root.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        // materials are shared and disposed by CreatureMaterials
      }
    });
    this.root.parent?.remove(this.root);
  }
}

/* ------------------------------------------------------------------ *
 * AI
 * ------------------------------------------------------------------ */

export const BEHAVIOURS = {
  /** Herbivore: grazes in a herd, drifts, flees from the player. */
  herd(creature, ctx) {
    const { dt, player, herd, rng } = ctx;
    const toPlayer = player ? creature.distanceTo(player) : Infinity;
    creature.metPlayer = toPlayer < 60;
    const flee = toPlayer < 14;
    const alert = toPlayer < 26;

    creature.alertness = damp(creature.alertness, alert ? 1 : 0.15, 1.6, dt);

    if (flee) {
      const angle = Math.atan2(creature.position.x - player.x, creature.position.z - player.z);
      creature.moveToward(angle, creature.plan.aquatic ? 1.6 : 5.2, dt);
      creature.state = 'flee';
      return;
    }

    // Grazing in place with a slow wander.
    creature.wanderAngle += (rng.float() - 0.5) * 0.5 * dt;
    let cohesion = { x: 0, z: 0 };
    if (herd && herd.length > 1) {
      let count = 0;
      for (const other of herd) {
        if (other === creature) continue;
        const d = creature.distanceTo(other.position);
        if (d < 60) {
          cohesion.x += other.position.x;
          cohesion.z += other.position.z;
          count++;
        }
      }
      if (count > 0) {
        cohesion.x /= count;
        cohesion.z /= count;
        const dx = cohesion.x - creature.position.x;
        const dz = cohesion.z - creature.position.z;
        if (Math.hypot(dx, dz) > 24) {
          creature.wanderAngle = Math.atan2(dx, dz) + (rng.float() - 0.5) * 0.3;
        }
      }
    }
    const grazing = (creature.animTime % 12) > 7;
    const speed = grazing ? 0 : 1.1;
    creature.moveToward(creature.wanderAngle, speed, dt);
    creature.state = grazing ? 'graze' : 'wander';
  },

  /** Solitary climber: patrols cliff faces, largely indifferent. */
  solitary(creature, ctx) {
    const { dt, player, rng, field } = ctx;
    const toPlayer = player ? creature.distanceTo(player) : Infinity;
    creature.metPlayer = toPlayer < 80;
    creature.alertness = damp(creature.alertness, toPlayer < 40 ? 0.7 : 0.2, 1, dt);
    if (rng.float() < 0.004 && field) {
      // Re-pick a heading along a contour of the cliff.
      creature.wanderAngle = rng.angle();
      creature.gaitOverride = rng.pick(['walk', 'stop', 'climb']);
    }
    const speed = creature.gaitOverride === 'stop' ? 0 : creature.gaitOverride === 'climb' ? 1.8 : 2.4;
    creature.moveToward(creature.wanderAngle, speed, dt);
    creature.state = creature.gaitOverride ?? 'walk';
  },

  /** Pack predator: hunts smaller creatures, stalks the player. */
  pack(creature, ctx) {
    const { dt, player, pack, prey, rng } = ctx;
    const toPlayer = player ? creature.distanceTo(player) : Infinity;
    creature.metPlayer = toPlayer < 90;
    const aggro = creature.species.aggression;

    let target = null;
    let targetDistance = Infinity;
    if (prey) {
      for (const candidate of prey) {
        if (candidate === creature || candidate.dead) continue;
        const d = creature.distanceTo(candidate.position);
        if (d < 90 && d < targetDistance && candidate.species.id !== creature.species.id) {
          target = candidate;
          targetDistance = d;
        }
      }
    }
    if (player && toPlayer < 34 && aggro > 0.4 && (!target || toPlayer < targetDistance)) {
      target = player;
      targetDistance = toPlayer;
    }

    creature.alertness = damp(creature.alertness, target ? 1 : 0.4, 2, dt);
    if (target) {
      const angle = Math.atan2(target.x - creature.position.x, target.z - creature.position.z);
      // Circle the target at a distance, then dash in.
      const orbit = creature.distanceTo(target) < 12 ? 0.6 : 0;
      creature.moveToward(angle + Math.sin(creature.animTime * 0.6) * orbit, 6.4, dt);
      creature.state = 'hunt';
      if (targetDistance < 3.2 && target.health !== undefined && creature.attackCooldown <= 0) {
        target.health = Math.max(0, target.health - 0.22 * aggro);
        creature.attackCooldown = 1.4;
        ctx.onAttack?.(creature, target);
      }
    } else {
      // Pack cohesion + patrol
      creature.wanderAngle += (rng.float() - 0.5) * 0.8 * dt;
      if (pack && pack.length > 1) {
        const leader = pack[0];
        if (leader !== creature) {
          const d = creature.distanceTo(leader.position);
          if (d > 26) creature.wanderAngle = Math.atan2(leader.position.x - creature.position.x, leader.position.z - creature.position.z);
        }
      }
      creature.moveToward(creature.wanderAngle, 2.2, dt);
      creature.state = 'patrol';
    }
    creature.attackCooldown = Math.max(0, (creature.attackCooldown ?? 0) - dt);
  },

  /** Leviathan: long migrations through water or air, singing. */
  migratory(creature, ctx) {
    const { dt, rng, time } = ctx;
    creature.wanderAngle += Math.sin(time * 0.05 + creature.animTime * 0.02) * 0.12 * dt;
    const vertical = Math.sin(time * 0.08 + creature.animTime * 0.05) * 0.4;
    creature.moveToward(creature.wanderAngle, 7 + Math.sin(time * 0.1) * 2.5, dt);
    if (creature.plan.aerial) {
      const target = 260 + vertical * 160;
      creature.root.position.y = damp(creature.root.position.y, target, 0.4, dt);
    } else {
      creature.root.position.y = damp(creature.root.position.y, -8 + vertical * 6, 0.6, dt);
    }
    creature.alertness = 0.2;
    if (rng.float() < 0.002) ctx.onCall?.(creature);
    creature.state = 'migrate';
  },

  /** The eyes that walk: they observe, approach slowly, never blink. */
  observer(creature, ctx) {
    const { dt, player } = ctx;
    if (!player) {
      creature.moveToward(creature.wanderAngle, 0.6, dt);
      return;
    }
    const distance = creature.distanceTo(player);
    creature.metPlayer = distance < 60;
    creature.faceTowards(player, dt, 1.2);
    // Slowly close to exactly nine metres — never more, never less.
    const want = 9;
    if (distance > want + 1.5) {
      const angle = Math.atan2(player.x - creature.position.x, player.z - creature.position.z);
      creature.moveToward(angle, 1.5, dt);
      creature.state = 'approach';
    } else if (distance < want - 1.5) {
      const angle = Math.atan2(creature.position.x - player.x, creature.position.z - player.z);
      creature.moveToward(angle, 1.1, dt);
      creature.state = 'retreat';
    } else {
      creature.speed = damp(creature.speed, 0, 2, dt);
      creature.state = 'observe';
    }
  },

  /** The attendant: follows at nine metres, always. */
  follower(creature, ctx) {
    const { dt, player } = ctx;
    if (!player) return;
    const distance = creature.distanceTo(player);
    creature.metPlayer = distance < 70;
    if (distance > 11) {
      const angle = Math.atan2(player.x - creature.position.x, player.z - creature.position.z);
      creature.moveToward(angle, distance > 30 ? 8.5 : 3.2, dt);
      creature.state = 'follow';
    } else {
      creature.speed = damp(creature.speed, 0, 3, dt);
      creature.faceTowards(player, dt, 1.5);
      creature.state = 'attend';
    }
  },

  /** Swarm: moths orbit lights and the player. */
  swarm(creature, ctx) {
    const { dt, player, time } = ctx;
    const anchor = player ?? creature.root.position;
    const angle = creature.wanderAngle + time * 0.6;
    const radius = 6 + Math.sin(creature.animTime * 1.3) * 2.5;
    const targetX = anchor.x + Math.cos(angle) * radius;
    const targetZ = anchor.z + Math.sin(angle) * radius;
    const targetY = anchor.y + 2.4 + Math.sin(creature.animTime * 2.1) * 1.1;
    const angleTo = Math.atan2(targetX - creature.position.x, targetZ - creature.position.z);
    creature.moveToward(angleTo, 2.6, dt);
    creature.root.position.y = damp(creature.root.position.y, targetY, 1.5, dt);
    creature.state = 'swarm';
  },

  /** Trees that watch you. */
  static_(creature, ctx) {
    const { dt, player } = ctx;
    if (player && creature.distanceTo(player) < 40) {
      creature.faceTowards(player, dt, 0.4);
      creature.alertness = damp(creature.alertness, 0.6, 0.5, dt);
    }
    creature.speed = 0;
    creature.state = 'rooted';
  },
};

/* ------------------------------------------------------------------ *
 * Population streaming
 * ------------------------------------------------------------------ */

const SPAWN_TABLE = {
  meadow: ['grazer', 'bloomback', 'mothlight'],
  forest: ['bloomback', 'skitterjaw', 'mothlight', 'grazer'],
  jungle: ['bloomback', 'skitterjaw', 'grazer', 'mothlight'],
  wetland: ['grazer', 'mothlight', 'lusca'],
  cliff: ['strider', 'skitterjaw'],
  highland: ['strider', 'grazer'],
  alpine: ['strider'],
  crystal: ['strider', 'attendant', 'mothlight'],
  beach: ['grazer', 'mothlight'],
  abyssRim: ['skitterjaw', 'titanroot'],
  sky: ['skywhale', 'mothlight'],
};

export class Population {
  constructor({ scene, field, materials, quality, seed = 1337, waterLevel = 0 }) {
    this.scene = scene;
    this.field = field;
    this.materials = materials;
    this.quality = quality;
    this.seed = seed >>> 0;
    this.waterLevel = waterLevel;
    this.rng = new Rng(seed ^ 0xc0de);
    this.creatures = [];
    this.groups = new Map(); // herd/pack id -> members
    this.maxCreatures = Math.round(clamp((quality.creatureDensity ?? 1) * 42, 6, 120));
    this.spawnRadius = quality.creatureRadius ?? 420;
    this.despawnRadius = this.spawnRadius * 1.45;
    this.lastSpawnCheck = 0;
    this.speciesSeen = new Set();
    this.onSpawn = null;
    this.onDespawn = null;
    this.onAttack = null;
    this.onCall = null;
    this.clock = 0;
  }

  /** Which species can live at a point. */
  speciesAt(x, z, height) {
    const info = this.field.biomeAt(x, z);
    let table = SPAWN_TABLE[info.biome.id] || SPAWN_TABLE.meadow;
    if (height > 260) table = SPAWN_TABLE.alpine;
    else if (height < 1) table = SPAWN_TABLE.wetland;
    return { table, biome: info.biome };
  }

  update(dt, { playerPosition, time = 0, weather = null } = {}) {
    this.clock += dt;

    // ---- spawn new life around the player ----
    this.lastSpawnCheck -= dt;
    if (this.lastSpawnCheck <= 0) {
      this.lastSpawnCheck = 1.1;
      this._spawnAround(playerPosition);
    }

    // ---- despawn the far away ----
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const creature = this.creatures[i];
      const distance = creature.distanceTo(playerPosition);
      if (distance > this.despawnRadius) {
        this._remove(creature, i);
      }
    }

    // ---- group up for AI queries ----
    this.groups.clear();
    for (const creature of this.creatures) {
      const key = creature.familyKey ?? creature.species.id;
      if (creature.plan.gait === 'fly' || creature.plan.herdish) {
        if (!this.groups.has(key)) this.groups.set(key, []);
        this.groups.get(key).push(creature);
      }
    }

    // ---- simulate ----
    const prey = this.creatures.filter((c) => c.plan.gait === 'walk' || c.plan.gait === 'skitter' || c.plan.gait === 'trudge');
    for (const creature of this.creatures) {
      const group = this.groups.get(creature.familyKey ?? creature.species.id) ?? [];
      const behaviour = this._behaviourFor(creature);
      behaviour(creature, {
        dt,
        player: playerPosition,
        herd: group,
        pack: group,
        prey,
        rng: creature.rng,
        field: this.field,
        time: this.clock,
        onAttack: this.onAttack,
        onCall: this.onCall,
      });
      creature.update(dt, {
        playerPosition,
        groundQuery: (x, z) => this.field.heightAt(x, z),
        stormy: weather?.state === 'storm',
      });

      // Keep aquatic creatures in water, land creatures out of it.
      if (creature.plan.aquatic) {
        const ground = this.field.heightAt(creature.position.x, creature.position.z);
        if (ground > this.waterLevel - 2) {
          // beached: turn back toward deeper water
          creature.wanderAngle += Math.PI * 0.5 * dt;
        } else {
          creature.root.position.y = damp(creature.root.position.y, Math.max(ground + 3, this.waterLevel - 6), 1.2, dt);
        }
      } else if (creature.plan.aerial) {
        // Nothing should be flying through a cliff: lift any flyer that has
        // ended up inside the terrain back into the air above it.
        const ground = this.field.heightAt(creature.position.x, creature.position.z);
        const clearance = (creature.plan.height ?? 2) * 1.6 + 3;
        if (creature.root.position.y < ground + clearance) {
          // Climb smoothly toward the ceiling, but never linger below it: a
          // flyer inside a cliff is a flyer you can hear and not see.
          const lifted = Math.max(creature.root.position.y, ground + clearance * 0.55);
          creature.root.position.y = damp(lifted, ground + clearance, 2.4, dt);
          creature.wanderAngle += Math.PI * 0.35 * dt;
        }
      } else if (!creature.plan.rooted) {
        if (this.field.isWater(creature.position.x, creature.position.z)) {
          creature.wanderAngle += Math.PI * 1.2 * dt;
        }
      }
    }
    void time;
  }

  _behaviourFor(creature) {
    const behaviour = creature.species.behavior;
    switch (behaviour) {
      case 'herd':
        return BEHAVIOURS.herd;
      case 'solitary':
        return BEHAVIOURS.solitary;
      case 'pack':
        return BEHAVIOURS.pack;
      case 'leviathan':
      case 'migratory':
        return BEHAVIOURS.migratory;
      case 'observer':
        return BEHAVIOURS.observer;
      case 'follower':
        return BEHAVIOURS.follower;
      case 'swarm':
        return BEHAVIOURS.swarm;
      case 'static':
      case 'world':
        return BEHAVIOURS.static_;
      default:
        return BEHAVIOURS.herd;
    }
  }

  _spawnAround(playerPosition, attempts = 26) {
    if (this.creatures.length >= this.maxCreatures) return 0;
    let spawned = 0;
    for (let i = 0; i < attempts; i++) {
      if (this.creatures.length >= this.maxCreatures) break;
      const angle = this.rng.angle();
      const radius = lerp(this.spawnRadius * 0.45, this.spawnRadius, Math.sqrt(this.rng.float()));
      const x = playerPosition.x + Math.cos(angle) * radius;
      const z = playerPosition.z + Math.sin(angle) * radius;
      const height = this.field.heightAt(x, z);
      const { table, biome } = this.speciesAt(x, z, height);
      const speciesId = this.rng.pick(table);
      const species = speciesById(speciesId);
      if (!species) continue;
      const density = (biome.creatureDensity ?? 1) * (species.rarity ?? 0.5);
      if (this.rng.float() > clamp01(density)) continue;
      // Avoid stacking creatures on top of each other.
      if (this.creatures.some((c) => c.distanceTo({ x, y: height, z }) < 14)) continue;
      this.spawn(speciesId, { x, y: height, z });
      spawned++;
    }
    return spawned;
  }

  spawn(speciesId, position, { scale = 1, herdSize = 1 } = {}) {
    const species = speciesById(speciesId);
    const familyKey = `${speciesId}-${Math.round(position.x / 220)}-${Math.round(position.z / 220)}`;

    // Herds and packs spawn as a small cluster with a shared identity.
    const members = Math.max(1, Math.min(6, herdSize || (species.behavior === 'herd' ? this.rng.int(2, 5) : species.behavior === 'pack' ? this.rng.int(2, 3) : 1)));
    const made = [];
    for (let i = 0; i < members; i++) {
      const offset = i === 0 ? { x: 0, z: 0 } : { x: this.rng.range(-14, 14), z: this.rng.range(-14, 14) };
      const x = position.x + offset.x;
      const z = position.z + offset.z;
      const height = this.field.heightAt(x, z);
      const creature = new Creature({
        speciesId,
        rng: this.rng.fork(i * 17 + speciesId.length),
        materials: this.materials,
        field: this.field,
        position: { x, y: height, z },
        scale,
        seedExtra: this.creatures.length,
      });
      creature.familyKey = familyKey;
      creature.plan.herdish = species.behavior === 'herd' || species.behavior === 'pack';
      creature.wanderAngle = this.rng.angle();
      this.scene.add(creature.root);
      this.creatures.push(creature);
      if (!this.speciesSeen.has(speciesId)) {
        this.speciesSeen.add(speciesId);
        this.onSpawn?.(creature, true);
      } else {
        this.onSpawn?.(creature, false);
      }
      if (species.behavior === 'pack') {
        for (const leg of creature.bones.legs) leg.restAngle = -0.35;
      }
      made.push(creature);
    }
    return made;
  }

  _remove(creature, index) {
    this.scene.remove(creature.root);
    creature.dispose();
    this.creatures.splice(index ?? this.creatures.indexOf(creature), 1);
    this.onDespawn?.(creature);
  }

  /** Nearest creature to a point (used by scanning and dialogue hooks). */
  nearest(position, { maxDistance = 60, filter = null } = {}) {
    let best = null;
    let bestD = maxDistance;
    for (const creature of this.creatures) {
      const d = creature.distanceTo(position);
      if (d < bestD && (!filter || filter(creature))) {
        bestD = d;
        best = creature;
      }
    }
    return best ? { creature: best, distance: bestD } : null;
  }

  /** Spawn a specific animal regardless of biome (scripted moments). */
  spawnAt(speciesId, position, options) {
    return this.spawn(speciesId, position, options);
  }

  get count() {
    return this.creatures.length;
  }

  /** How many of each species are currently alive (for the codex UI). */
  census() {
    const counts = {};
    for (const creature of this.creatures) {
      counts[creature.species.id] = (counts[creature.species.id] || 0) + 1;
    }
    return counts;
  }

  clear() {
    for (const creature of [...this.creatures]) {
      this.scene.remove(creature.root);
      creature.dispose();
    }
    this.creatures.length = 0;
  }
}
