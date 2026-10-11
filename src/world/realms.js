/**
 * THE MULTIVERSE — world/realms.js
 * ==================================================================
 * EVERY REALITY. The valley is the hub; this module builds the others and
 * gives each one its own physics, spawn table, score and sense of dread:
 *
 *   void        endless white, geometry that appears when you look away
 *   backrooms   infinite procedural rooms with a persistent floor plan
 *   maze        an endless labyrinth with exit tiles that lie
 *   fractal     a raymarched mandelbox cathedral, computed live
 *   singularity a black hole with an accretion disk and time dilation
 *   midnight    streets of televisions that open doors at midnight
 *   heaven      the ascended: lighter physics, everyone is a ghost
 *   microverse  inside a giant water drop, ants the size of buses
 *   colossus    walking on the back of the Great One
 *   cities      the Floating Concordance, eyes on patrol, wormholes drifting
 *   deep        the compiled abyss, whales and bioluminescent trenches
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp, clamp01, damp, lerp, remap } from '../core/math.js';
import { Rng, hash2 } from '../core/rand.js';
import { createBlackHoleMaterial, createFractalMaterial, createSpriteMaterial } from '../render/shaders.js';
import { Colossus, FloatingConcordance, GiantDroplet, Wormhole } from './marvels.js';
import { ARCHETYPES, BROADCASTS } from '../lore.js';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function emissiveMaterial(textures, kind, color, intensity = 1.2, options = {}) {
  const set = textures.surface(kind, { seed: 2000 + kind.length });
  return new MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    color,
    emissive: new Color(color),
    emissiveIntensity: intensity,
    roughness: options.roughness ?? 0.6,
    metalness: options.metalness ?? 0.05,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? 0,
  });
}

function spritePoints(textures, count, { spread = 100, height = 100, color = 0xffffff, size = 30, sprite = 'mote', additive = true, seed = 1 } = {}) {
  const rng = new Rng(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rng.range(-spread, spread);
    positions[i * 3 + 1] = rng.range(0, height);
    positions[i * 3 + 2] = rng.range(-spread, spread);
    sizes[i] = size * rng.range(0.4, 1.6);
    opacities[i] = rng.range(0.2, 0.9);
    const c = new Color(color).offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.1, 0.1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new BufferAttribute(opacities, 1));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  const material = createSpriteMaterial(textures.sprite(sprite, { size: 128 }), { color: 0xffffff, opacity: 1, additive });
  if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  else material.uniforms.uPixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material, count, positions, rng };
}

/** Pick one of the archetypal figures that step out of the televisions. */
export function pickArchetype(rng) {
  return rng.pick(ARCHETYPES);
}

/* ------------------------------------------------------------------ *
 * Realm builders
 * ------------------------------------------------------------------ */

export const REALM_BUILDERS = {
  /* ------------------------------ VOID ------------------------------ */
  void({ scene, textures, quality, seed }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x11);
    const floorMaterial = new MeshStandardMaterial({ color: 0xf2f2f5, roughness: 0.7, metalness: 0 });
    const floor = new Mesh(new PlaneGeometry(4000, 4000, 1, 1), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // Activities: soft geometry that appears behind you when you look away.
    const shapes = [];
    const shapeMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdfe8ff,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 12; i++) {
      const kind = rng.int(0, 2);
      const geometry =
        kind === 0
          ? new TorusGeometry(rng.range(3, 9), rng.range(0.4, 1.4), 12, 48)
          : kind === 1
            ? new IcosahedronGeometry(rng.range(3, 10), 1)
            : new CylinderGeometry(rng.range(2, 6), rng.range(2, 6), rng.range(8, 24), 12);
      const mesh = new Mesh(geometry, shapeMaterial.clone());
      mesh.position.set(rng.range(-90, 90), rng.range(4, 40), rng.range(-90, 90));
      mesh.castShadow = true;
      group.add(mesh);
      shapes.push({ mesh, active: false, spawnTimer: rng.range(4, 20) });
    }
    scene.add(group);
    return {
      group,
      physics: { gravity: 0.25, friction: 0.02, jumpScale: 0.9 },
      spawnTable: [],
      update(dt, ctx) {
        for (const shape of shapes) {
          // Only show a shape while it is *behind* the player's view.
          const toShape = shape.mesh.position.clone().sub(ctx.playerPosition);
          const facing = toShape.normalize().dot(ctx.cameraForward);
          shape.mesh.visible = facing < -0.15;
          shape.mesh.rotation.y += dt * 0.2;
          shape.spawnTimer -= dt;
          if (shape.spawnTimer <= 0) {
            shape.spawnTimer = rng.range(8, 26);
            shape.mesh.position.set(
              ctx.playerPosition.x + rng.range(-70, 70),
              rng.range(3, 34),
              ctx.playerPosition.z + rng.range(-70, 70)
            );
          }
        }
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ---------------------------- BACKROOMS ---------------------------- */
  backrooms({ scene, textures, quality, seed }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x22);
    const cell = 8;
    const wallSet = textures.surface('carpet', { seed: 2400 });
    const carpetSet = textures.surface('carpet', { seed: 2401 });
    const wallMaterial = new MeshStandardMaterial({
      map: textures.surface('carpet', { seed: 2402 }).map,
      color: 0xcfc48f,
      roughness: 0.95,
    });
    const floorMaterial = new MeshStandardMaterial({
      map: carpetSet.map,
      normalMap: carpetSet.normalMap,
      color: 0xa89a72,
      roughness: 0.98,
    });
    const ceilingMaterial = new MeshStandardMaterial({ color: 0xd8d2b0, roughness: 0.85, emissive: 0x2a2820, emissiveIntensity: 0.5 });
    const lightMaterial = new MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xfff4c0, emissiveIntensity: 2.4 });

    const wallGeometry = new BoxGeometry(cell, 3.2, 0.4);
    const wallGeometryZ = new BoxGeometry(0.4, 3.2, cell);
    const floorGeometry = new PlaneGeometry(cell * 64, cell * 64, 1, 1);
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const ceiling = new Mesh(floorGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.2;
    group.add(ceiling);

    const walls = [];
    const lights = [];
    const reused = quality.backroomWalls ?? 900;

    const buildCell = (cx, cz) => {
      // Deterministic per-cell floor plan: corridors and rooms.
      const hash = hash2(cx, cz);
      const hasWallX = (hash & 3) === 0;
      const hasWallZ = (hash & 12) === 4;
      const doorway = (hash >> 4) % 3 === 0;
      return { hasWallX, hasWallZ, doorway, hash };
    };

    const renderAround = (position) => {
      // Recycle pooled wall instances around the player.
      walls.length = 0;
      const baseX = Math.floor(position.x / cell);
      const baseZ = Math.floor(position.z / cell);
      void reused;
      for (const wall of wallMeshes) wall.visible = false;
      let cursor = 0;
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const cx = baseX + dx;
          const cz = baseZ + dz;
          const info = buildCell(cx, cz);
          if (info.hasWallX && !info.doorway) {
            const mesh = wallMeshes[cursor++];
            if (mesh) {
              mesh.visible = true;
              mesh.position.set((cx + 0.5) * cell, 1.6, cz * cell);
              mesh.rotation.y = 0;
              mesh.scale.set(1, 1, 1);
            }
          }
          if (info.hasWallZ && !info.doorway) {
            const mesh = wallMeshes[cursor++];
            if (mesh) {
              mesh.visible = true;
              mesh.position.set(cx * cell, 1.6, (cz + 0.5) * cell);
              mesh.rotation.y = Math.PI / 2;
            }
          }
          // Ceiling lights every few cells
          if ((info.hash & 7) === 1) {
            const light = lightPool[lightsCursor++ % lightPool.length];
            light.visible = true;
            light.position.set((cx + 0.5) * cell, 3.1, (cz + 0.5) * cell);
          }
        }
      }
      for (let i = lightsCursor; i < lightsCursor + lightPool.length; i++) lightPool[i % lightPool.length].visible = false;
    };

    const wallMeshes = [];
    for (let i = 0; i < 340; i++) {
      const mesh = new Mesh(i % 2 === 0 ? wallGeometry : wallGeometryZ, wallMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      group.add(mesh);
      wallMeshes.push(mesh);
    }
    const lightPool = [];
    let lightsCursor = 0;
    for (let i = 0; i < 26; i++) {
      const fixture = new Mesh(new BoxGeometry(1.6, 0.12, 0.5), lightMaterial);
      fixture.visible = false;
      group.add(fixture);
      lightPool.push(fixture);
    }
    // The hum: one real light that follows the player, plus fog.
    const humLight = new PointLight(0xfff0b0, 12, 26, 2);
    humLight.position.y = 2.9;
    group.add(humLight);

    scene.add(group);
    let lastCell = { x: null, z: null };
    let hum = 0;
    return {
      group,
      physics: { gravity: 1, friction: 1, oxygen: 'stale' },
      spawnTable: ['skitterjaw'],
      update(dt, ctx) {
        const cx = Math.floor(ctx.playerPosition.x / cell);
        const cz = Math.floor(ctx.playerPosition.z / cell);
        if (cx !== lastCell.x || cz !== lastCell.z) {
          lastCell = { x: cx, z: cz };
          renderAround(ctx.playerPosition);
        }
        hum += dt;
        // The hum changes pitch, and something moves when it does.
        const pitch = 60 + Math.sin(hum * 0.35) * 4;
        humLight.intensity = 10 + Math.sin(hum * 2.4) * 1.4;
        group.position.x = Math.round(ctx.playerPosition.x / cell) * cell - ctx.playerPosition.x;
        group.position.z = Math.round(ctx.playerPosition.z / cell) * cell - ctx.playerPosition.z;
        const floorMesh = group.children[0];
        const ceilMesh = group.children[1];
        floorMesh.position.set(ctx.playerPosition.x - group.position.x, 0, ctx.playerPosition.z - group.position.z);
        ceilMesh.position.set(ctx.playerPosition.x - group.position.x, 3.2, ctx.playerPosition.z - group.position.z);
        ctx.onSense?.({ humPitch: pitch, humPhase: Math.sin(hum * 0.35) });
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ------------------------------- MAZE ------------------------------- */
  maze({ scene, textures, quality, seed }) {
    const group = new Group();
    const cell = 6;
    const wallHeight = 5.4;
    const wallSet = textures.surface('marble', { seed: 2600 });
    const wallMaterial = new MeshStandardMaterial({
      map: wallSet.map,
      normalMap: wallSet.normalMap,
      color: 0x3a3f6a,
      emissive: 0x101a3a,
      emissiveIntensity: 0.5,
      roughness: 0.55,
      metalness: 0.1,
    });
    const floorMaterial = new MeshStandardMaterial({ color: 0x14162c, roughness: 0.8, metalness: 0.2 });
    const floor = new Mesh(new PlaneGeometry(360, 360, 1, 1), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const wallGeometry = new BoxGeometry(cell, wallHeight, 1.2);
    const pool = [];
    for (let i = 0; i < 520; i++) {
      const mesh = new Mesh(wallGeometry, wallMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      group.add(mesh);
      pool.push(mesh);
    }
    const exitMaterial = new MeshStandardMaterial({ color: 0x8fd6ff, emissive: 0x6fd8ff, emissiveIntensity: 2.2 });
    const exitTiles = [];
    for (let i = 0; i < 6; i++) {
      const tile = new Mesh(new PlaneGeometry(cell * 0.7, cell * 0.7), exitMaterial);
      tile.rotation.x = -Math.PI / 2;
      tile.position.y = 0.04;
      tile.visible = false;
      group.add(tile);
      exitTiles.push(tile);
    }

    // Deterministic maze: walls where the hash says so, with carved corridors.
    const isWall = (x, y) => {
      const h = hash2(x * 73856093, y * 19349663);
      const cellHash = hash2(Math.floor(x / 4), Math.floor(y / 4));
      if ((cellHash & 15) === 0) return false; // an open room
      return ((h >> 3) & 3) !== 0;
    };

    scene.add(group);
    let lastKey = '';
    let time = 0;
    return {
      group,
      physics: { gravity: 1, friction: 1 },
      spawnTable: ['skitterjaw', 'attendant'],
      update(dt, ctx) {
        time += dt;
        const baseX = Math.floor(ctx.playerPosition.x / cell);
        const baseZ = Math.floor(ctx.playerPosition.z / cell);
        const key = `${baseX},${baseZ}`;
        if (key !== lastKey) {
          lastKey = key;
          let cursor = 0;
          for (let dz = -12; dz <= 12; dz++) {
            for (let dx = -12; dx <= 12; dx++) {
              const gx = baseX + dx;
              const gz = baseZ + dz;
              if (!isWall(gx, gz)) continue;
              // Carve doorways so the maze is navigable.
              if (((gx * 3 + gz * 5) % 11) === 0) continue;
              const mesh = pool[cursor++];
              if (!mesh) continue;
              mesh.visible = true;
              mesh.position.set(gx * cell, wallHeight / 2, gz * cell);
              mesh.rotation.y = (gx + gz) % 2 === 0 ? 0 : Math.PI / 2;
              mesh.scale.set(1, 1 + Math.sin(time + gx) * 0.02, 1);
            }
          }
          for (let i = cursor; i < pool.length; i++) pool[i].visible = false;
          // Exit tiles appear in dead ends — and some lead deeper on purpose.
          for (let i = 0; i < exitTiles.length; i++) {
            const tile = exitTiles[i];
            let placed = false;
            for (let tries = 0; tries < 24 && !placed; tries++) {
              const dx = Math.round((hash2(baseX + tries * 7, baseZ + i * 31) % 21) - 10);
              const dz = Math.round((hash2(baseZ + tries * 13, baseX + i * 17) % 21) - 10);
              const gx = baseX + dx;
              const gz = baseZ + dz;
              if (isWall(gx, gz)) continue;
              tile.position.set(gx * cell, 0.04, gz * cell);
              tile.visible = true;
              tile.userData.realmHop = (hash2(gx, gz) & 1) === 1;
              placed = true;
            }
            if (!placed) tile.visible = false;
          }
        }
        // Walls breathe at four beats per minute.
        const breathe = 1 + Math.sin(time * (Math.PI * 2 * 4) / 60) * 0.015;
        for (const mesh of pool) if (mesh.visible) mesh.scale.y = breathe;
        group.position.set(0, 0, 0);
      },
      exitTiles,
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ----------------------------- FRACTAL ----------------------------- */
  fractal({ scene, textures, quality, seed }) {
    const group = new Group();
    const material = createFractalMaterial({
      colorA: 0xff56c8,
      colorB: 0x6f4bff,
      colorC: 0x2a0b3f,
      steps: clamp(quality.cloudSteps ? quality.cloudSteps + 16 : 48, 24, 80),
      iterations: quality.fractalIterations ?? 5,
    });
    const shell = new Mesh(new SphereGeometry(220, 42, 28), material);
    shell.frustumCulled = false;
    group.add(shell);

    const floorMaterial = new MeshStandardMaterial({ color: 0x2a0b3f, emissive: 0x3b1055, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2 });
    const floor = new Mesh(new PlaneGeometry(600, 600, 1, 1), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const pillars = [];
    const pillarMaterial = new MeshStandardMaterial({ color: 0x3b1055, emissive: 0x7a2fff, emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < 18; i++) {
      const height = lerp(20, 120, (i % 7) / 6);
      const pillar = new Mesh(new BoxGeometry(lerp(4, 12, (i % 5) / 4), height, lerp(4, 12, (i % 3) / 2)), pillarMaterial);
      const angle = (i / 18) * Math.PI * 2;
      pillar.position.set(Math.cos(angle) * lerp(40, 140, (i % 9) / 8), height / 2, Math.sin(angle) * lerp(40, 150, (i % 11) / 10));
      pillar.castShadow = true;
      group.add(pillar);
      pillars.push(pillar);
    }

    const motes = spritePoints(textures, 1400, { spread: 180, height: 160, color: 0xff8ae0, size: 22, seed: seed ^ 0x33 });
    group.add(motes.points);
    scene.add(group);
    return {
      group,
      physics: { gravity: 0.6, friction: 0.6 },
      spawnTable: ['attendant'],
      update(dt, ctx) {
        material.uniforms.uTime.value += dt;
        // The camera's position in the shell's local space drives the raymarch.
        const local = ctx.cameraPosition.clone().sub(group.position);
        material.uniforms.uCameraLocal.value.copy(local);
        for (let i = 0; i < motes.count; i++) {
          const i3 = i * 3;
          motes.positions[i3 + 1] += dt * (0.6 + (i % 5) * 0.2);
          if (motes.positions[i3 + 1] > 160) motes.positions[i3 + 1] = 0;
        }
        motes.geometry.attributes.position.needsUpdate = true;
        motes.points.position.copy(group.position);
        group.position.x = ctx.playerPosition.x - 0;
        group.position.z = ctx.playerPosition.z;
        floor.position.set(0, 0, 0);
        for (const pillar of pillars) pillar.rotation.y += dt * 0.05;
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* --------------------------- SINGULARITY --------------------------- */
  singularity({ scene, textures, quality, seed }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x44);
    const blackHole = new Mesh(new SphereGeometry(140, 48, 36), createBlackHoleMaterial({ spin: 1.4, intensity: 1.2, horizon: 1 }));
    blackHole.rotation.x = 0.42;
    group.add(blackHole);

    const disk = new Mesh(
      new RingGeometry(150, 620, 128, 8),
      new MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.5, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    disk.rotation.x = -Math.PI / 2 + 0.4;
    group.add(disk);

    const light = new PointLight(0xff9a4c, 400, 3000, 1.6);
    group.add(light);

    const debris = [];
    const debrisMaterial = new MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.9, metalness: 0.2 });
    for (let i = 0; i < 160; i++) {
      const rock = new Mesh(new IcosahedronGeometry(rng.range(2, 16), 0), debrisMaterial);
      const angle = rng.angle();
      const radius = rng.range(220, 1400);
      rock.position.set(Math.cos(angle) * radius, rng.range(-220, 220), Math.sin(angle) * radius);
      rock.userData = { angle, radius, speed: rng.range(0.03, 0.16), height: rock.position.y, spin: rng.range(-0.6, 0.6) };
      group.add(rock);
      debris.push(rock);
    }
    // A frozen lens of starlight being eaten.
    const stars = spritePoints(textures, 900, { spread: 900, height: 900, color: 0xdfe8ff, size: 30, seed: seed ^ 0x55 });
    group.add(stars.points);

    scene.add(group);
    return {
      group,
      physics: { gravity: 2.4, friction: 0.4, timeDilation: 1 },
      // Moths ride the light of the accretion disk; nothing else survives here.
      spawnTable: ['mothlight'],
      blackHole,
      update(dt, ctx) {
        blackHole.material.uniforms.uTime.value += dt;
        disk.rotation.z += dt * 0.06;
        for (const rock of debris) {
          const d = rock.userData;
          d.angle += (d.speed / Math.max(0.4, d.radius / 400)) * dt;
          d.radius = Math.max(160, d.radius - dt * 6);
          d.height *= 1 - dt * 0.05;
          rock.position.set(Math.cos(d.angle) * d.radius, d.height, Math.sin(d.angle) * d.radius);
          rock.rotation.x += dt * d.spin;
          if (d.radius <= 162) {
            d.radius = 1400;
            d.height = (Math.random() - 0.5) * 440;
          }
        }
        // Time dilation: the further into the well, the slower the realm ages.
        const distance = ctx.playerPosition.distanceTo(group.position);
        const dilation = clamp(distance / 900, 0.35, 1);
        ctx.setTimeDilation?.(dilation);
        // Screen-space lens centre follows the hole.
        ctx.onGravity?.({
          worldPosition: group.position,
          radius: clamp(remap(distance, 200, 1200, 0.5, 0.08), 0.05, 0.5),
          strength: clamp01(remap(distance, 100, 900, 0.6, 0.05)),
        });
        stars.points.position.set(0, 0, 0);
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ----------------------------- MIDNIGHT ----------------------------- */
  midnight({ scene, textures, quality, seed, materials }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x66);
    const asphaltSet = textures.surface('concrete', { seed: 3100 });
    const roadMaterial = new MeshStandardMaterial({ map: asphaltSet.map, normalMap: asphaltSet.normalMap, color: 0x2a2c34, roughness: 0.9 });
    const road = new Mesh(new PlaneGeometry(300, 3000, 1, 1), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);

    const kerbMaterial = new MeshStandardMaterial({ color: 0x50525c, roughness: 0.8 });
    for (let side = -1; side <= 1; side += 2) {
      const kerb = new Mesh(new BoxGeometry(200, 0.4, 0.6), kerbMaterial);
      kerb.position.set(side * 26, 0.2, 0);
      group.add(kerb);
    }

    // Buildings as dark silhouettes with lit windows.
    const windowMaterial = new MeshStandardMaterial({ color: 0x141824, emissive: 0xffb060, emissiveIntensity: 0.7, roughness: 0.6 });
    const facadeMaterial = new MeshStandardMaterial({ color: 0x1a1d28, roughness: 0.85 });
    const blocks = [];
    for (let i = 0; i < 60; i++) {
      const height = rng.range(20, 90);
      const width = rng.range(16, 44);
      const depth = rng.range(16, 40);
      const block = new Mesh(new BoxGeometry(width, height, depth), rng.bool(0.35) ? windowMaterial : facadeMaterial);
      const side = rng.bool() ? 1 : -1;
      block.position.set(side * rng.range(46, 130), height / 2, rng.range(-1400, 1400));
      block.castShadow = true;
      block.receiveShadow = true;
      group.add(block);
      blocks.push(block);
    }

    // Televisions: the stars of this realm. Every TV is a doorway.
    const tvs = [];
    const tvScreenMaterial = new MeshStandardMaterial({ color: 0x0a0a12, emissive: 0x7fd8ff, emissiveIntensity: 0.7, roughness: 0.3 });
    const tvShellMaterial = new MeshStandardMaterial({ color: 0x22242c, roughness: 0.6, metalness: 0.2 });
    for (let i = 0; i < 34; i++) {
      const tv = new Group();
      const shell = new Mesh(new BoxGeometry(2.4, 1.9, 2.0), tvShellMaterial);
      const screen = new Mesh(new PlaneGeometry(1.9, 1.4), tvScreenMaterial.clone());
      screen.position.z = 1.02;
      tv.add(shell, screen);
      const stand = new Mesh(new CylinderGeometry(0.2, 0.3, 1.6, 8), tvShellMaterial);
      stand.position.y = -1.7;
      tv.add(stand);
      tv.position.set(rng.range(-24, 24), 2.6, rng.range(-1200, 1200));
      tv.rotation.y = rng.range(-0.6, 0.6) + Math.PI;
      group.add(tv);
      const broadcast = BROADCASTS[i % BROADCASTS.length];
      tvs.push({
        node: tv,
        screen,
        broadcast,
        active: false,
        timer: rng.range(6, 60),
        archetype: null,
      });
    }

    const streetLightMaterial = new MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd890, emissiveIntensity: 1.6 });
    const streetLights = [];
    for (let i = 0; i < 30; i++) {
      const pole = new Mesh(new CylinderGeometry(0.12, 0.16, 8, 6), kerbMaterial);
      const head = new Mesh(new SphereGeometry(0.4, 8, 6), streetLightMaterial);
      head.position.y = 8;
      pole.add(head);
      pole.position.set(rng.bool() ? -34 : 34, 4, rng.range(-1300, 1300));
      group.add(pole);
      streetLights.push(pole);
    }

    const rain = spritePoints(textures, 4000, { spread: 120, height: 90, color: 0xbcd8ff, size: 16, sprite: 'rain', additive: false, seed: seed ^ 0x77 });
    rain.points.material.uniforms.uOpacity.value = 0.55;
    group.add(rain.points);

    // The motionless audience: figures that step out of the screens.
    const figures = [];
    scene.add(group);
    let time = 0;
    return {
      group,
      physics: { gravity: 1, friction: 1, scanlines: 0.6 },
      spawnTable: ['mothlight'],
      update(dt, ctx) {
        time += dt;
        // Rain follows the camera and falls.
        rain.points.position.set(ctx.playerPosition.x, ctx.playerPosition.y, ctx.playerPosition.z);
        for (let i = 0; i < rain.count; i++) {
          const i3 = i * 3;
          rain.positions[i3 + 1] -= dt * 60;
          if (rain.positions[i3 + 1] < -10) {
            rain.positions[i3 + 1] = 90;
            rain.positions[i3] = rng.range(-120, 120);
            rain.positions[i3 + 2] = rng.range(-120, 120);
          }
        }
        rain.geometry.attributes.position.needsUpdate = true;

        // TVs wake, broadcast, and try to finish a sentence.
        for (const tv of tvs) {
          const distance = tv.node.position.distanceTo(ctx.playerPosition);
          if (distance > 90) continue;
          tv.timer -= dt;
          const material = tv.screen.material;
          const staticLevel = tv.active ? 0.2 : 0.75;
          material.emissiveIntensity = damp(material.emissiveIntensity, tv.active ? 3.2 : 0.8, 2, dt);
          material.emissive.setRGB(
            lerp(0.2, 0.6, staticLevel),
            lerp(0.4, 0.9, staticLevel),
            lerp(0.7, 1.0, staticLevel)
          );
          if (!tv.active && tv.timer <= 0 && distance < 46) {
            tv.active = true;
            tv.timer = 12 + rng.float() * 12;
            ctx.onBroadcast?.(tv);
          }
          if (tv.active && tv.timer < 6 && !tv.spoke) {
            tv.spoke = true;
            ctx.onTVSpeech?.(tv);
          }
          if (tv.active && tv.timer <= 0) {
            tv.active = false;
            tv.spoke = false;
            tv.timer = 14 + rng.float() * 30;
          }
        }
        ctx.onSense?.({ timeOfNight: time });
      },
      tvs,
      figures,
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ------------------------------ HEAVEN ------------------------------ */
  heaven({ scene, textures, quality, seed }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x88);
    const cloudMaterial = new MeshStandardMaterial({
      color: 0xfff4d8,
      emissive: 0xffe9b0,
      emissiveIntensity: 0.85,
      roughness: 0.9,
      transparent: true,
      opacity: 0.95,
    });
    const platforms = [];
    for (let i = 0; i < 22; i++) {
      const radius = rng.range(14, 46);
      const platform = new Mesh(new SphereGeometry(radius, 20, 14), cloudMaterial);
      platform.scale.set(1, 0.28, 1);
      platform.position.set(rng.range(-320, 320), rng.range(-40, 220), rng.range(-320, 320));
      platform.receiveShadow = true;
      group.add(platform);
      platforms.push(platform);
    }

    const hosts = spritePoints(textures, 700, { spread: 260, height: 220, color: 0xfff0c0, size: 46, seed: seed ^ 0x99, sprite: 'glow' });
    group.add(hosts.points);

    // A procession of the ascended: tall, slow, made of light.
    const ascended = [];
    const ascMaterial = new MeshStandardMaterial({
      color: 0xfff6d8,
      emissive: 0xffe9b0,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < 26; i++) {
      const figure = new Group();
      const body = new Mesh(new CapsuleGeometry(0.5, 2.2, 6, 10), ascMaterial);
      body.position.y = 1.6;
      const head = new Mesh(new SphereGeometry(0.34, 12, 10), ascMaterial);
      head.position.y = 3.1;
      figure.add(body, head);
      figure.position.set(rng.range(-140, 140), rng.range(-20, 120), rng.range(-140, 140));
      const light = new PointLight(0xfff0c0, 3, 40, 2);
      light.position.y = 2.4;
      figure.add(light);
      group.add(figure);
      ascended.push({ figure, phase: rng.float() * Math.PI * 2, speed: rng.range(0.06, 0.16) });
    }
    const sun = new PointLight(0xfff8e0, 120, 900, 1.4);
    sun.position.set(0, 400, 0);
    group.add(sun);

    scene.add(group);
    return {
      group,
      physics: { gravity: 0.15, friction: 0.4, ghostOnly: true },
      spawnTable: ['attendant', 'mothlight'],
      update(dt, ctx) {
        for (const host of ascended) {
          host.phase += dt * host.speed;
          const t = host.phase;
          host.figure.position.x += Math.sin(t) * dt * 2;
          host.figure.position.z += Math.cos(t * 0.7) * dt * 2;
          host.figure.position.y += Math.sin(t * 1.3) * dt * 1.2;
          host.figure.rotation.y = t;
        }
        for (let i = 0; i < hosts.count; i++) {
          const i3 = i * 3;
          hosts.positions[i3 + 1] += dt * (0.4 + (i % 7) * 0.1);
          if (hosts.positions[i3 + 1] > 220) hosts.positions[i3 + 1] = -20;
        }
        hosts.points.position.set(ctx.playerPosition.x, 0, ctx.playerPosition.z);
        hosts.geometry.attributes.position.needsUpdate = true;
        ctx.onSense?.({ ascension: true });
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ---------------------------- MICROVERSE ---------------------------- */
  microverse({ scene, textures, quality, seed, population, materials }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0xaa);
    const droplet = new GiantDroplet({ scene, textures, rng, position: new Vector3(0, 60, 0), radius: 220 });
    group.add(droplet.group);

    // Water film floor inside the drop.
    const filmMaterial = new MeshStandardMaterial({
      color: 0x9fe6ff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.08,
      metalness: 0.0,
      envMapIntensity: 1.4,
    });
    const film = new Mesh(new PlaneGeometry(900, 900, 1, 1), filmMaterial);
    film.rotation.x = -Math.PI / 2;
    film.position.y = -160;
    group.add(film);

    // Motes: the microscopic life, scaled up.
    const motes = spritePoints(textures, 2600, { spread: 200, height: 200, color: 0xdff6ff, size: 26, seed: seed ^ 0xbb });
    group.add(motes.points);

    // Giant ants patrol in lines.
    const ants = [];
    if (population) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const spawned = population.spawnAt('ant', { x: Math.cos(angle) * 60, y: -150, z: Math.sin(angle) * 60 }, { scale: 6, herdSize: 3 });
        for (const ant of spawned) ants.push({ creature: ant, angle });
      }
    }

    scene.add(group);
    return {
      group,
      physics: { gravity: 0.5, friction: 0.7, scaleFactor: 0.25 },
      spawnTable: ['ant'],
      update(dt, ctx) {
        // Motes drift on the droplet's own currents.
        for (let i = 0; i < motes.count; i++) {
          const i3 = i * 3;
          const t = ctx.time * 0.3 + i;
          motes.positions[i3] += Math.sin(t) * dt * 6;
          motes.positions[i3 + 1] += Math.cos(t * 0.8) * dt * 5;
          motes.positions[i3 + 2] += Math.sin(t * 1.3) * dt * 6;
        }
        motes.geometry.attributes.position.needsUpdate = true;
        // Ant colonies march in slow circles.
        for (const ant of ants) {
          ant.angle += dt * 0.12;
          const target = { x: Math.cos(ant.angle) * 90, y: -120, z: Math.sin(ant.angle) * 90 };
          if (ant.creature) {
            ant.creature.faceTowards(target, dt, 1.2);
            ant.creature.moveToward(Math.atan2(target.x - ant.creature.position.x, target.z - ant.creature.position.z), 3, dt);
          }
        }
        ctx.onSense?.({ surfaceTension: droplet.contains(ctx.cameraPosition) });
      },
      droplet,
      dispose() {
        scene.remove(group);
        droplet.dispose();
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ----------------------------- COLOSSUS ----------------------------- */
  colossus({ scene, textures, quality, seed, population }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0xcc);
    const colossus = new Colossus({ scene, textures, rng, position: { x: 0, y: 400, z: 0 }, length: 2600 });
    group.add(colossus.group);

    // Wind over the fur, and weather-sized clouds far below.
    const motes = spritePoints(textures, 1800, { spread: 500, height: 400, color: 0xffd8b0, size: 32, seed: seed ^ 0xdd });
    motes.points.position.set(0, 300, 0);
    group.add(motes.points);

    if (population) {
      for (let i = 0; i < 4; i++) {
        population.spawnAt('strider', { x: rng.range(-300, 300), y: 500, z: rng.range(-900, 900) }, { scale: 2.2 });
      }
      population.spawnAt('skywhale', { x: 600, y: 300, z: 400 }, { scale: 1.4 });
    }

    scene.add(group);
    return {
      group,
      physics: { gravity: 0.9, friction: 0.9, movingGround: true },
      spawnTable: ['strider', 'skywhale'],
      colossus,
      update(dt, ctx) {
        colossus.update(dt, ctx.time);
        for (let i = 0; i < motes.count; i++) {
          const i3 = i * 3;
          motes.positions[i3] += dt * 12;
          if (motes.positions[i3] > 500) motes.positions[i3] = -500;
          motes.positions[i3 + 1] -= dt * 2;
          if (motes.positions[i3 + 1] < 250) motes.positions[i3 + 1] = 700;
        }
        motes.geometry.attributes.position.needsUpdate = true;
        // The player walks on a living surface.
        ctx.registerGroundProvider?.((x, z) => colossus.surfaceHeightAt({ x, y: ctx.playerPosition.y, z }));
      },
      dispose() {
        scene.remove(group);
        colossus.dispose();
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ------------------------------ CITIES ------------------------------ */
  cities({ scene, textures, quality, seed, population, rng }) {
    const group = new Group();
    const localRng = new Rng(seed ^ 0xee);
    const concordance = new FloatingConcordance({
      scene: groupScene(scene, group),
      textures,
      rng: localRng,
      count: quality.cityIslands ?? 10,
      centre: { x: 0, y: 240, z: 0 },
      spread: 900,
    });
    group.add(concordance.group);

    // Wormholes drifting past the balconies.
    const wormholes = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      const wormhole = new Wormhole({
        scene: groupScene(scene, group),
        textures,
        rng: localRng,
        position: new Vector3(Math.cos(angle) * 520, 260 + i * 60, Math.sin(angle) * 520),
        radius: 34 + i * 8,
      });
      group.add(wormhole.group);
      wormholes.push(wormhole);
    }

    // The eyes that walk keep the peace on the promenades.
    if (population) {
      for (let i = 0; i < 7; i++) {
        const island = concordance.islands[i % Math.max(1, concordance.islands.length)];
        if (!island) break;
        population.spawnAt('eye', { x: island.anchor.x, y: island.anchor.y + 4, z: island.anchor.z }, { scale: 1.2 });
      }
    }

    scene.add(group);
    return {
      group,
      physics: { gravity: 0.8, friction: 0.8 },
      spawnTable: ['eye', 'mothlight', 'skywhale'],
      concordance,
      wormholes,
      update(dt, ctx) {
        concordance.update(dt, ctx.time, ctx.playerPosition);
        for (const wormhole of wormholes) {
          const effect = wormhole.update(dt, ctx.time, ctx.playerPosition);
          if (effect.pull > 0.05) {
            ctx.onGravity?.({
              worldPosition: wormhole.group.position,
              radius: 0.22,
              strength: effect.pull * 0.8,
            });
            if (effect.swallowed) ctx.onSwallowed?.(wormhole);
          }
        }
        // Islands can be walked on.
        ctx.registerGroundProvider?.((x, z) => {
          const height = concordance.surfaceHeightAt({ x, y: ctx.playerPosition.y, z });
          return height;
        });
      },
      dispose() {
        scene.remove(group);
        for (const wormhole of wormholes) wormhole.dispose();
        concordance.dispose();
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },

  /* ------------------------------- DEEP ------------------------------- */
  deep({ scene, textures, quality, seed, population }) {
    const group = new Group();
    const rng = new Rng(seed ^ 0x123);
    const floorMaterial = new MeshStandardMaterial({
      map: textures.surface('coral', { seed: 4000 }).map,
      color: 0x1d4a52,
      roughness: 0.9,
      emissive: 0x0a2a30,
      emissiveIntensity: 0.5,
    });
    const floor = new Mesh(new PlaneGeometry(2400, 2400, 64, 64), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -120;
    const position = floor.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const ridge = Math.sin(x * 0.02) * Math.cos(y * 0.017) * 22 + Math.sin((x + y) * 0.05) * 6;
      position.setZ(i, ridge - Math.abs(y) * 0.02);
    }
    floor.geometry.computeVertexNormals();
    floor.receiveShadow = true;
    group.add(floor);

    // Bioluminescent growths that light up when you speak.
    const growths = [];
    const glowMaterial = new MeshStandardMaterial({
      color: 0x2ee6d0,
      emissive: 0x2ee6d0,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 90; i++) {
      const growth = new Mesh(new IcosahedronGeometry(rng.range(1.2, 5), 0), glowMaterial);
      growth.position.set(rng.range(-600, 600), rng.range(-118, -80), rng.range(-600, 600));
      group.add(growth);
      growths.push({ mesh: growth, base: growth.position.y, phase: rng.float() * Math.PI * 2 });
    }

    // Suspended particulate: the ocean is thick with life.
    const motes = spritePoints(textures, 3000, { spread: 320, height: 260, color: 0x9fe8ff, size: 18, seed: seed ^ 0x234 });
    group.add(motes.points);

    if (population) {
      for (let i = 0; i < 3; i++) {
        population.spawnAt('lusca', { x: rng.range(-200, 200), y: -60, z: rng.range(-200, 200) }, { scale: 1.6 });
      }
    }

    scene.add(group);
    return {
      group,
      physics: { gravity: 0.85, friction: 0.6, underwater: true },
      spawnTable: ['lusca', 'mothlight'],
      update(dt, ctx) {
        for (const growth of growths) {
          growth.phase += dt * 0.8;
          growth.mesh.position.y = growth.base + Math.sin(growth.phase) * 0.6;
          const intensity = ctx.speaking ? 2.6 : 1.1 + Math.sin(growth.phase * 1.7) * 0.3;
          growth.mesh.material.emissiveIntensity = damp(growth.mesh.material.emissiveIntensity, intensity, 2, dt);
        }
        for (let i = 0; i < motes.count; i++) {
          const i3 = i * 3;
          motes.positions[i3] += Math.sin(ctx.time * 0.4 + i) * dt * 2;
          motes.positions[i3 + 1] += dt * (1.2 + (i % 5) * 0.3);
          if (motes.positions[i3 + 1] > 140) motes.positions[i3 + 1] = -120;
        }
        motes.geometry.attributes.position.needsUpdate = true;
        motes.points.position.set(ctx.playerPosition.x, 0, ctx.playerPosition.z);
        ctx.onSense?.({ trenchLight: true });
      },
      dispose() {
        scene.remove(group);
        group.traverse((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      },
    };
  },
};

/**
 * Islands and wormholes add themselves to a scene, so we hand them a shim
 * whose removal is a no-op — the realm owns and disposes the real group.
 */
function groupScene(scene, group) {
  return {
    add: (object) => group.add(object),
    remove: (object) => group.remove(object),
    fog: scene.fog,
    environment: scene.environment,
  };
}

/* ------------------------------------------------------------------ *
 * Archetype figures (used by midnight, and by scripted hauntings)
 * ------------------------------------------------------------------ */

export function buildArchetypeFigure(archetype, materials, rng, { scale = 1 } = {}) {
  const tint = new Color(archetype.tint ?? 0xffffff);
  const skin = materials.skin(0x6b5a4a, { roughness: 0.7 });
  const coat = new MeshStandardMaterial({
    color: tint.clone().multiplyScalar(0.35),
    emissive: tint,
    emissiveIntensity: 0.24,
    roughness: 0.75,
    metalness: 0.08,
  });
  const group = new Group();
  const bones = { legs: [], arms: [], head: null, torso: null };

  const torso = new Mesh(new CapsuleGeometry(0.34, 0.72, 6, 10), coat);
  torso.position.y = 1.28;
  torso.castShadow = true;
  group.add(torso);
  bones.torso = torso;

  const head = new Mesh(new SphereGeometry(0.2, 14, 10), skin);
  head.position.y = 1.05;
  torso.add(head);
  bones.head = head;

  for (let side = -1; side <= 1; side += 2) {
    const leg = new Group();
    leg.position.set(side * 0.16, -0.32, 0);
    torso.add(leg);
    const thigh = new Mesh(new CapsuleGeometry(0.11, 0.4, 4, 8), coat);
    thigh.position.y = -0.2;
    leg.add(thigh);
    const shin = new Mesh(new CapsuleGeometry(0.09, 0.42, 4, 8), coat);
    shin.position.y = -0.62;
    leg.add(shin);
    bones.legs.push({ group: leg, phase: side > 0 ? 0 : Math.PI });

    const arm = new Group();
    arm.position.set(side * 0.4, 0.34, 0);
    torso.add(arm);
    const upper = new Mesh(new CapsuleGeometry(0.08, 0.34, 4, 8), coat);
    upper.position.y = -0.17;
    arm.add(upper);
    const fore = new Mesh(new CapsuleGeometry(0.07, 0.34, 4, 8), skin);
    fore.position.y = -0.5;
    arm.add(fore);
    bones.arms.push({ group: arm, phase: side > 0 ? Math.PI : 0 });
  }

  group.scale.setScalar(scale);
  group.userData.archetype = archetype;
  return {
    archetype,
    group,
    bones,
    animTime: rng.float() * 10,
    update(dt, { walking = 0, talking = false, lookingAt = null } = {}) {
      this.animTime += dt;
      const speed = 4.4 * walking;
      for (const leg of bones.legs) {
        leg.group.rotation.x = Math.sin(this.animTime * speed + leg.phase) * 0.5 * walking;
      }
      for (const arm of bones.arms) {
        arm.group.rotation.x = Math.sin(this.animTime * speed + arm.phase) * 0.35 * walking + (talking ? Math.sin(this.animTime * 3) * 0.12 : 0);
      }
      torso.position.y = 1.28 + Math.sin(this.animTime * speed * 2) * 0.03 * walking;
      if (lookingAt) {
        const local = group.parent ? group.parent.worldToLocal(lookingAt.clone()) : lookingAt;
        const angle = Math.atan2(local.x - group.position.x, local.z - group.position.z);
        group.rotation.y = damp(group.rotation.y, angle, 2.5, dt);
        head.rotation.y = Math.sin(this.animTime * 0.7) * 0.1;
      }
      if (bones.head) bones.head.rotation.x = talking ? Math.sin(this.animTime * 5) * 0.08 : 0;
    },
  };
}

export const REALM_IDS = Object.keys(REALM_BUILDERS);
