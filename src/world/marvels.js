/**
 * THE MULTIVERSE — world/marvels.js
 * ==================================================================
 * THE IMPOSSIBLE THINGS. The parts of the multiverse that exist because the
 * lore says they must:
 *
 *   • THE FLOATING CONCORDANCE — six thousand islands that voted to stop
 *     touching the ground, carrying a city district each, linked by rope
 *     bridges, with waterfalls pouring off their undersides into nothing.
 *   • THE EYES THAT WALK — ambulatory witnesses patrolling the promenades
 *     (built from the creature rig, spawned here).
 *   • THE GREAT ONE — a creature the size of the concept of size, with fur
 *     ridges, older cities on its back, and a heartbeat you can hear from a
 *     kilometre away.
 *   • GIGANTIC WORMHOLES — drifting singularities that will absolutely suck
 *     you in if you stand too close.
 *   • GIGANTIC WATER DROPS — a single drop the size of a cathedral, held
 *     together by its own surface tension, with a world inside it.
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
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp, clamp01, damp, lerp } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { createPortalMaterial, createWaterfallMaterial } from '../render/shaders.js';
import { landmarkName } from '../lore.js';

/* ------------------------------------------------------------------ *
 * The Floating Concordance
 * ------------------------------------------------------------------ */

/**
 * Build a floating island: an inverted cone of rock (with a rocky underside
 * that no one sees until they fly under it), grass on top, a district of
 * buildings, waterfalls off the edges.
 */
export function buildFloatingIsland({ rng, textures, radius = 60, index = 0, buildings = true }) {
  const group = new Group();
  group.name = `island-${index}`;
  const rockSet = textures.surface('rock', { seed: 400 + index });
  const grassSet = textures.surface('grass', { seed: 700 + index });

  const rockMaterial = new MeshStandardMaterial({
    map: rockSet.map,
    normalMap: rockSet.normalMap,
    roughnessMap: rockSet.roughnessMap,
    roughness: 0.92,
    metalness: 0.03,
    color: 0x9a9086,
  });
  const topMaterial = new MeshStandardMaterial({
    map: grassSet.map,
    normalMap: grassSet.normalMap,
    roughness: 0.9,
    color: 0x8fbf62,
  });

  // --- underside: a jagged keel of rock ---
  const underside = new Mesh(
    new ConeGeometry(radius, radius * 2.1, Math.round(lerp(10, 22, rng.float())), 6),
    rockMaterial
  );
  underside.rotation.x = Math.PI;
  underside.position.y = -radius * 1.05 + 3;
  underside.castShadow = true;
  underside.receiveShadow = true;
  group.add(underside);

  // --- top: a gently domed disc ---
  const topGeometry = new BufferGeometry();
  {
    const segments = 26;
    const rings = 8;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const ringRadius = radius * t;
      for (let a = 0; a <= segments; a++) {
        const angle = (a / segments) * Math.PI * 2;
        const bump = 1 + Math.sin(angle * 3 + index) * 0.04 * (1 - t);
        const y = (1 - t * t) * radius * 0.16 + Math.sin(angle * 5 + r) * radius * 0.012 * (1 - t);
        positions.push(Math.cos(angle) * ringRadius * bump, y, Math.sin(angle) * ringRadius * bump);
        normals.push(0, 1, 0);
        uvs.push(a / segments * 6, t * 6);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < segments; a++) {
        const i0 = r * (segments + 1) + a;
        const i1 = i0 + 1;
        const i2 = i0 + segments + 1;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
    topGeometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    topGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    topGeometry.setIndex(indices);
    topGeometry.computeVertexNormals();
  }
  const top = new Mesh(topGeometry, topMaterial);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // --- buildings: stacked slabs with glowing windows ---
  const district = new Group();
  const buildingCount = Math.round(lerp(6, 22, rng.float()));
  const windowMaterial = new MeshStandardMaterial({
    color: 0x2a2f3a,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.9,
    roughness: 0.5,
  });
  const wallMaterial = new MeshStandardMaterial({
    map: textures.surface('concrete', { seed: 900 + index }).map,
    roughness: 0.8,
    color: 0xcfc6b8,
  });
  for (let b = 0; b < buildingCount; b++) {
    const angle = rng.angle();
    const dist = rng.range(radius * 0.12, radius * 0.8);
    const width = rng.range(6, 20);
    const depth = rng.range(6, 20);
    const floors = rng.int(2, 11);
    const height = floors * rng.range(3.2, 4.6);
    const building = new Mesh(new BoxGeometry(width, height, depth), rng.bool(0.35) ? windowMaterial : wallMaterial);
    building.position.set(Math.cos(angle) * dist, height / 2, Math.sin(angle) * dist);
    building.rotation.y = rng.angle();
    building.castShadow = true;
    building.receiveShadow = true;
    district.add(building);
    if (rng.bool(0.4)) {
      const roof = new Mesh(new BoxGeometry(width * 1.12, 0.6, depth * 1.12), wallMaterial);
      roof.position.set(building.position.x, height + 0.3, building.position.z);
      roof.rotation.y = building.rotation.y;
      district.add(roof);
    }
    if (rng.bool(0.25)) {
      const spire = new Mesh(new ConeGeometry(width * 0.3, height * 0.9, 6), wallMaterial);
      spire.position.set(building.position.x, height + height * 0.45, building.position.z);
      district.add(spire);
    }
  }
  if (buildings) group.add(district);

  // --- waterfalls pouring off the rim into the void ---
  const falls = [];
  const fallCount = Math.round(lerp(2, 5, rng.float()));
  for (let f = 0; f < fallCount; f++) {
    const angle = rng.angle();
    const width = rng.range(6, 15);
    const length = rng.range(radius * 1.6, radius * 4.5);
    const material = createWaterfallMaterial({
      speed: 0.9 + rng.float() * 0.6,
      height: length,
      width,
      opacity: 0.85,
      flowMap: textures.flow(),
    });
    const sheet = new Mesh(new PlaneGeometry(width, length, 4, 18), material);
    sheet.position.set(Math.cos(angle) * radius * 1.02, radius * 0.1 - length / 2, Math.sin(angle) * radius * 1.02);
    sheet.rotation.y = -angle + Math.PI / 2;
    group.add(sheet);
    falls.push({ sheet, material });
  }

  // --- a lantern-lit focal point: the district's beacon ---
  const beacon = new Mesh(new TorusGeometry(radius * 0.16, radius * 0.012, 8, 32), new MeshBasicMaterial({ color: 0x9fe8ff }));
  beacon.position.y = radius * 0.2;
  beacon.rotation.x = Math.PI / 2;
  group.add(beacon);
  const beaconLight = new PointLight(0x9fe8ff, 6, radius * 3, 2);
  beaconLight.position.y = radius * 0.22;
  group.add(beaconLight);

  return {
    group,
    radius,
    falls,
    beacon,
    anchor: new Vector3(),
    update(dt, time) {
      group.rotation.y += dt * 0.0025;
      for (const fall of falls) fall.material.uniforms.uTime.value += dt;
      beacon.rotation.z += dt * 0.25;
      const pulse = 0.7 + Math.sin(time * 0.8 + index) * 0.3;
      beaconLight.intensity = 4 + pulse * 4;
    },
  };
}

/**
 * The Concordance itself: a scattered archipelago of islands at several
 * altitudes, plus rope bridges between the closest pairs.
 */
export class FloatingConcordance {
  constructor({ scene, textures, rng, count = 14, centre = { x: 0, y: 620, z: 0 }, spread = 1400 }) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'concordance';
    this.scene.add(this.group);
    this.islands = [];
    this.bridges = [];
    this.rng = rng;

    for (let i = 0; i < count; i++) {
      const radius = lerp(26, 78, Math.sqrt(rng.float()));
      const angle = rng.angle();
      const distance = rng.range(0.25, 1) * spread;
      const island = buildFloatingIsland({ rng, textures, radius, index: i });
      island.group.position.set(
        centre.x + Math.cos(angle) * distance,
        centre.y + rng.range(-180, 220),
        centre.z + Math.sin(angle) * distance
      );
      island.anchor.copy(island.group.position);
      island.id = i;
      island.name = landmarkName(5000 + i * 37, { article: false });
      this.group.add(island.group);
      this.islands.push(island);
    }

    // Rope bridges between neighbouring islands.
    for (let i = 0; i < this.islands.length; i++) {
      for (let j = i + 1; j < this.islands.length; j++) {
        const a = this.islands[i];
        const b = this.islands[j];
        const distance = a.anchor.distanceTo(b.anchor);
        if (distance > 620 || distance < 40) continue;
        if (rng.float() > 0.35) continue;
        this.bridges.push(this._makeBridge(a, b, textures));
      }
    }
  }

  _makeBridge(a, b, textures) {
    const start = a.anchor.clone().add(new Vector3(0, a.radius * 0.14, 0));
    const end = b.anchor.clone().add(new Vector3(0, b.radius * 0.14, 0));
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const sag = Math.min(40, start.distanceTo(end) * 0.08);
    midpoint.y -= sag;
    const length = start.distanceTo(midpoint) + midpoint.distanceTo(end);

    const material = new MeshStandardMaterial({
      map: textures.surface('bark', { seed: 1300 + a.id }).map,
      color: 0xb0906a,
      roughness: 0.95,
    });
    const plank = new Mesh(new BoxGeometry(1.6, 0.35, length * 0.5), material);
    plank.position.copy(midpoint);
    plank.lookAt(end);
    plank.rotateX(Math.PI / 2);
    plank.castShadow = true;
    this.group.add(plank);
    return { plank, a, b };
  }

  get nearest() {
    return this.islands[0] ?? null;
  }

  /** The island the player is closest to (also their standing surface). */
  closestIsland(position) {
    let best = null;
    let bestD = Infinity;
    for (const island of this.islands) {
      const d = island.anchor.distanceTo(position);
      if (d < bestD) {
        bestD = d;
        best = island;
      }
    }
    return best;
  }

  /** Height of the island surface below a point, if any (for walking on them). */
  surfaceHeightAt(position, { maxDistance = 90 } = {}) {
    for (const island of this.islands) {
      const dx = position.x - island.anchor.x;
      const dz = position.z - island.anchor.z;
      const r = Math.hypot(dx, dz);
      if (r < island.radius && Math.abs(position.y - island.anchor.y) < maxDistance) {
        const elevation = (1 - (r / island.radius) ** 2) * island.radius * 0.16;
        return island.anchor.y + elevation;
      }
    }
    return null;
  }

  update(dt, time, playerPosition) {
    for (const island of this.islands) island.update(dt, time);
    // Islands drift very slowly; bridges follow their endpoints.
    for (const bridge of this.bridges) {
      const start = bridge.a.anchor.clone().add(new Vector3(0, bridge.a.radius * 0.14, 0));
      const end = bridge.b.anchor.clone().add(new Vector3(0, bridge.b.radius * 0.14, 0));
      bridge.plank.position.copy(start).add(end).multiplyScalar(0.5);
      bridge.plank.lookAt(end);
      bridge.plank.rotateX(Math.PI / 2);
    }
    void playerPosition;
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.scene.remove(this.group);
  }
}

/* ------------------------------------------------------------------ *
 * The Great One
 * ------------------------------------------------------------------ */

/**
 * A creature the size of everything. Not a mesh of a beast: a *landscape*
 * shaped like one — a hide of fur ridges you can walk on, older cities
 * between the folds, and a heartbeat that shakes the screen.
 */
export class Colossus {
  constructor({ scene, textures, rng, position = { x: 0, y: 900, z: 0 }, length = 2600 }) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'colossus';
    this.group.position.set(position.x, position.y, position.z);
    this.scene.add(this.group);
    this.length = length;
    this.time = 0;
    this.heartbeat = 0;
    this.onBeat = null;
    const furRng = rng;

    const hideSet = textures.surface('bark', { seed: 5150 });
    const hide = new MeshStandardMaterial({
      map: hideSet.map,
      normalMap: hideSet.normalMap,
      roughnessMap: hideSet.roughnessMap,
      color: 0x8a6a4e,
      roughness: 0.95,
      metalness: 0.02,
    });
    const fleshSet = textures.surface('flesh', { seed: 5151 });
    const flesh = new MeshStandardMaterial({
      map: fleshSet.map,
      normalMap: fleshSet.normalMap,
      color: 0xc08a7a,
      roughness: 0.8,
    });

    // --- body: a chain of enormous ellipsoids forming a spine ---
    const segments = 22;
    this.segments = [];
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const radius = lerp(150, 460, Math.sin(t * Math.PI) * 0.85 + 0.15);
      const length = lerp(60, 150, Math.sin(t * Math.PI) * 0.6 + 0.4);
      const geometry = new SphereGeometry(radius, 24, 16);
      geometry.scale(1, 0.86, length / radius);
      const mesh = new Mesh(geometry, i % 4 === 0 ? flesh : hide);
      mesh.position.set(0, Math.sin(t * Math.PI) * -60, (t - 0.5) * length * segments * 0.62);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.segments.push({ mesh, radius, t });
    }

    // --- fur ridges: walkable folds along the back ---
    const ridgeCount = 26;
    for (let i = 0; i < ridgeCount; i++) {
      const t = i / ridgeCount;
      const seg = this.segments[Math.min(this.segments.length - 1, Math.round(t * (segments - 1)))];
      const ridge = new Mesh(new CapsuleGeometry(lerp(18, 44, rng.float()), this.length * 0.1, 6, 10), hide);
      ridge.rotation.z = Math.PI / 2;
      ridge.rotation.y = rng.range(-0.2, 0.2);
      ridge.position.set(rng.range(-160, 160), seg.radius * 0.82, seg.mesh.position.z + rng.range(-90, 90));
      ridge.castShadow = true;
      this.group.add(ridge);
    }

    // --- older cities built by earlier riders ---
    this.cities = [];
    const cityCount = 3;
    for (let c = 0; c < cityCount; c++) {
      const t = 0.28 + c * 0.22;
      const seg = this.segments[Math.round(t * (segments - 1))];
      const city = new Group();
      city.position.set(rng.range(-120, 120), seg.radius * 0.86, seg.mesh.position.z);
      const towers = rng.int(6, 14);
      for (let b = 0; b < towers; b++) {
        const height = rng.range(30, 130);
        const tower = new Mesh(new CylinderGeometry(rng.range(8, 26), rng.range(10, 30), height, 8), hide);
        tower.position.set(rng.range(-110, 110), height / 2, rng.range(-110, 110));
        tower.castShadow = true;
        city.add(tower);
      }
      const glow = new PointLight(0xffc48a, 8, 500, 2);
      glow.position.y = 80;
      city.add(glow);
      this.group.add(city);
      this.cities.push(city);
    }

    // --- the eye: a lake-sized, slow-turning lens ---
    const eye = new Mesh(new SphereGeometry(190, 24, 18), new MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.25, metalness: 0.1 }));
    const headSeg = this.segments[this.segments.length - 1];
    eye.position.set(0, headSeg.radius * 0.35, headSeg.mesh.position.z + 220);
    this.group.add(eye);
    const iris = new Mesh(new SphereGeometry(110, 20, 14), new MeshStandardMaterial({ color: 0x5a3a2a, emissive: 0x2a1408, emissiveIntensity: 0.6 }));
    iris.position.copy(eye.position).add(new Vector3(0, 0, 170));
    this.group.add(iris);
    this.eye = { eye, iris };

    // A heartbeat you can hear from a kilometre away.
    this.beatLight = new PointLight(0xffb066, 0, 3000, 2);
    this.beatLight.position.set(0, 200, 0);
    this.group.add(this.beatLight);
    void furRng;
  }

  update(dt, time) {
    this.time += dt;
    // The Great One breathes: every segment rises and falls out of phase.
    for (const segment of this.segments) {
      const phase = this.time * 0.18 - segment.t * 4.2;
      segment.mesh.position.y = Math.sin(phase) * 12 + Math.sin(segment.t * Math.PI) * -60;
      segment.mesh.scale.y = 1 + Math.sin(phase * 1.3) * 0.012;
    }
    // Heartbeat: a slow, heavy thud roughly every 4.4 seconds.
    const cycle = (this.time % 4.4) / 4.4;
    const beat = cycle < 0.03 ? 1 - cycle / 0.03 : cycle > 0.08 && cycle < 0.11 ? 0.6 : 0;
    this.heartbeat = beat;
    this.beatLight.intensity = beat * 60;
    if (cycle < 0.02 && this._lastBeat !== Math.floor(this.time / 4.4)) {
      this._lastBeat = Math.floor(this.time / 4.4);
      this.onBeat?.(this.group.position.clone());
    }
    this.eye.iris.position.z = 170 + Math.sin(this.time * 0.07) * 40;
  }

  /** Standing height on the beast's back, for the colossus realm. */
  surfaceHeightAt(position, { tolerance = 520 } = {}) {
    const localZ = position.z - this.group.position.z;
    const localX = position.x - this.group.position.x;
    if (Math.abs(localX) > 420 || Math.abs(localZ) > this.length * 0.75) return null;
    const t = clamp01((localZ / (this.length * 0.75) + 1) / 2);
    const seg = this.segments[Math.round(t * (this.segments.length - 1))];
    if (!seg) return null;
    if (Math.abs(position.y - (this.group.position.y + seg.radius)) > tolerance) return null;
    return this.group.position.y + seg.mesh.position.y + seg.radius;
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.scene.remove(this.group);
  }
}

/* ------------------------------------------------------------------ *
 * Wormholes
 * ------------------------------------------------------------------ */

/**
 * A gigantic wormhole. Drops matter in, twists light, and pulls the player
 * toward an event horizon that is really a doorway to another reality.
 */
export class Wormhole {
  constructor({ scene, textures, rng, position, radius = 90, realmTarget = null }) {
    this.scene = scene;
    this.radius = radius;
    this.realmTarget = realmTarget;
    this.group = new Group();
    this.group.position.copy(position);
    this.scene.add(this.group);

    const material = createPortalMaterial({
      colorA: 0x6ff0ff,
      colorB: 0xb96cff,
      colorC: 0xfff0c0,
      radius,
      swirl: 1.4,
      noiseScale: 2.2,
      starfield: 0.6,
    });
    this.material = material;
    this.torus = new Mesh(new TorusGeometry(radius, radius * 0.06, 12, 64), material);
    this.torus.name = 'wormhole-ring';
    this.group.add(this.torus);

    // Inner throat: an additive sphere that swallows what falls in.
    const throat = new Mesh(
      new SphereGeometry(radius * 0.94, 32, 24),
      new MeshBasicMaterial({ color: 0x05010a, side: 1, transparent: true, opacity: 0.96 })
    );
    this.group.add(throat);
    this.throat = throat;

    // Debris spiralling in: a small instanced ring of rocks.
    this.debris = [];
    const debrisCount = 26;
    for (let i = 0; i < debrisCount; i++) {
      const rock = new Mesh(new IcosahedronGeometry(rng.range(1.5, 6), 0), new MeshStandardMaterial({ color: 0x5a4a48, roughness: 0.95 }));
      rock.userData = {
        angle: rng.angle(),
        radius: rng.range(radius * 1.2, radius * 3.4),
        speed: rng.range(0.05, 0.2) * (rng.bool() ? 1 : -1),
        height: rng.range(-radius, radius),
        spin: rng.range(-1, 1),
      };
      this.group.add(rock);
      this.debris.push(rock);
    }

    const light = new PointLight(0x9f7bff, 40, radius * 8, 2);
    this.group.add(light);
    this.light = light;
    this.time = 0;
    this.pull = 0;
  }

  update(dt, time, playerPosition) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uOpenness.value = 0.9;
    this.torus.rotation.z += dt * 0.05;
    this.torus.rotation.x = Math.sin(time * 0.1) * 0.12;
    this.throat.rotation.y -= dt * 0.04;
    const pulse = 0.85 + Math.sin(this.time * 0.9) * 0.15;
    this.light.intensity = 30 * pulse;

    for (const rock of this.debris) {
      const d = rock.userData;
      d.angle += d.speed * dt * (1 + this.pull * 3);
      d.radius = Math.max(this.radius * 1.05, d.radius - dt * 2 * (0.4 + this.pull * 6));
      d.height = d.height * (1 - dt * 0.06 * (1 + this.pull * 2));
      rock.position.set(Math.cos(d.angle) * d.radius, d.height, Math.sin(d.angle) * d.radius);
      rock.rotation.x += dt * d.spin;
      rock.rotation.y += dt * d.spin * 1.4;
      if (d.radius <= this.radius * 1.06) {
        d.radius = this.radius * 3.4;
        d.height = (Math.random() - 0.5) * this.radius * 2;
      }
    }

    // Pull on the player: inverse-square-ish, and it really moves them.
    if (playerPosition) {
      const dx = this.group.position.x - playerPosition.x;
      const dy = this.group.position.y - playerPosition.y;
      const dz = this.group.position.z - playerPosition.z;
      const distance = Math.hypot(dx, dy, dz);
      const influence = clamp01(1 - distance / (this.radius * 7));
      this.pull = damp(this.pull, influence * influence, 2, dt);
      return {
        pull: this.pull,
        direction: distance > 0.01 ? { x: dx / distance, y: dy / distance, z: dz / distance } : { x: 0, y: 0, z: 0 },
        distance,
        swallowed: distance < this.radius * 0.85,
      };
    }
    return { pull: 0, direction: { x: 0, y: 0, z: 0 }, distance: Infinity, swallowed: false };
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.scene.remove(this.group);
  }
}

/* ------------------------------------------------------------------ *
 * Giant water drops
 * ------------------------------------------------------------------ */

/**
 * A water droplet the size of a cathedral: a refractive shell over a whole
 * small world — sky, hills, and a squall of microscopic life scaling up.
 */
export class GiantDroplet {
  constructor({ scene, textures, rng, position, radius = 120 }) {
    this.scene = scene;
    this.radius = radius;
    this.group = new Group();
    this.group.position.copy(position);
    this.scene.add(this.group);

    const shell = new Mesh(
      new SphereGeometry(radius, 48, 36),
      new MeshStandardMaterial({
        color: 0xcfefff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.0,
        side: DoubleSide,
        envMapIntensity: 1.6,
        depthWrite: false,
      })
    );
    this.group.add(shell);
    this.shell = shell;

    // Surface tension: a rim of bright caustics at the waterline.
    const rim = new Mesh(
      new TorusGeometry(radius * 0.995, radius * 0.012, 8, 96),
      new MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.5, blending: AdditiveBlending })
    );
    rim.rotation.x = Math.PI / 2;
    this.group.add(rim);

    // The world inside: a tiny landscape on an inner surface.
    const inner = new Group();
    const moss = new MeshStandardMaterial({ map: textures.surface('moss', { seed: 606 }).map, roughness: 0.9, color: 0x7fbf7a });
    for (let i = 0; i < 40; i++) {
      const blob = new Mesh(new IcosahedronGeometry(rng.range(4, 18), 1), moss);
      const a = rng.angle();
      const phi = Math.acos(rng.range(-1, 1));
      const r = radius * rng.range(0.62, 0.92);
      blob.position.set(
        Math.sin(phi) * Math.cos(a) * r,
        Math.cos(phi) * r * 0.85,
        Math.sin(phi) * Math.sin(a) * r
      );
      inner.add(blob);
    }
    const innerLight = new PointLight(0xdff6ff, 26, radius * 4, 2);
    inner.add(innerLight);
    this.group.add(inner);
    this.inner = inner;
    this.rng = rng;
  }

  /** Inside the droplet? Used to swap scale, fog and music. */
  contains(position) {
    return this.group.position.distanceTo(position) < this.radius * 0.94;
  }

  update(dt, time) {
    this.shell.rotation.y += dt * 0.02;
    this.group.position.y += Math.sin(time * 0.35) * dt * 1.4;
    this.inner.rotation.y -= dt * 0.008;
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.scene.remove(this.group);
  }
}
