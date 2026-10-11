/**
 * THE MULTIVERSE — world/world.js
 * ==================================================================
 * THE WORLD DIRECTOR. Owns the valley and every alternate reality, decides
 * which one is live, builds portals between them, and performs transitions
 * (which are genuinely dramatic: the frame tears, the machine speaks, the
 * new reality assembles itself around you).
 *
 * It also owns the "ground providers" — the plumbing that lets a player walk
 * on things that are not the height field (floating islands, the Great One's
 * back, cloud platforms).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp, clamp01, damp, lerp } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { createPortalMaterial, createSpriteMaterial } from '../render/shaders.js';
import { REALMS, TRUTHS, realmById } from '../lore.js';
import { TerrainField, ValleyTerrain, WATER_LEVEL } from './terrain.js';
import { WaterSystem } from './water.js';
import { FoliageSystem } from './foliage.js';
import { CreatureMaterials, Population } from './creatures.js';
import { REALM_BUILDERS } from './realms.js';
import { Colossus, FloatingConcordance, Wormhole } from './marvels.js';

/** A doorway between realities. */
export class Portal {
  constructor({ scene, textures, rng, position, targetRealm, label = '', radius = 3.4, colorA = 0x6ff0ff, colorB = 0xb96cff }) {
    this.scene = scene;
    this.targetRealm = targetRealm;
    this.label = label;
    this.radius = radius;
    this.rng = rng;
    this.group = new Group();
    this.group.position.copy(position);
    this.group.name = `portal-${targetRealm}`;

    const material = createPortalMaterial({ colorA, colorB, colorC: 0xfff0c0, radius, swirl: 1, noiseScale: 3.2, starfield: 0.4 });
    this.material = material;
    this.disc = new Mesh(new TorusGeometry(radius, radius * 0.16, 10, 48), material);
    this.disc.rotation.x = 0;
    this.group.add(this.disc);

    // A ring of standing stones, so the doorway has architecture.
    const stoneSet = textures.surface('rock', { seed: 7000 + targetRealm.length });
    const stoneMaterial = new MeshStandardMaterial({ map: stoneSet.map, normalMap: stoneSet.normalMap, color: 0x8d8377, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stone = new Mesh(new IcosahedronGeometry(radius * 0.22, 0), stoneMaterial);
      stone.position.set(Math.cos(angle) * radius * 1.25, Math.sin(angle) * radius * 1.25, 0);
      stone.rotation.set(rng.float() * 3, rng.float() * 3, rng.float() * 3);
      stone.castShadow = true;
      this.group.add(stone);
    }
    const light = new PointLight(colorA, 12, radius * 14, 2);
    this.group.add(light);
    this.light = light;
    this.time = 0;
    this.openness = 0;
    this.scene.add(this.group);
  }

  /** Is a point inside the doorway? */
  contains(position, tolerance = 1.4) {
    const local = this.group.worldToLocal(position.clone());
    return Math.abs(local.z) < tolerance * 1.6 && Math.hypot(local.x, local.y) < this.radius * 1.05;
  }

  update(dt, time, playerPosition) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    const distance = this.group.position.distanceTo(playerPosition);
    const target = distance < 26 ? 1 : 0.35;
    this.openness = damp(this.openness, target, 1.2, dt);
    this.material.uniforms.uOpenness.value = this.openness;
    this.disc.rotation.z += dt * 0.1;
    this.light.intensity = 8 + this.openness * 18 + Math.sin(this.time * 2.4) * 2;
    return { distance, inside: this.contains(playerPosition) && this.openness > 0.7 };
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }
}

/** A tiny shrine that holds an archive fragment. */
export class Fragment {
  constructor({ scene, textures, position, archive, rng }) {
    this.archive = archive;
    this.collected = false;
    this.group = new Group();
    this.group.position.copy(position);
    const material = new MeshStandardMaterial({
      color: 0xfff0c0,
      emissive: 0xffe6a8,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.92,
      roughness: 0.2,
      metalness: 0.4,
    });
    this.core = new Mesh(new IcosahedronGeometry(0.42, 0), material);
    this.group.add(this.core);
    const halo = new Mesh(
      new TorusGeometry(0.8, 0.03, 6, 32),
      new MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false })
    );
    this.group.add(halo);
    this.halo = halo;
    this.light = new PointLight(0xffe6a8, 4, 14, 2);
    this.group.add(this.light);
    this.spin = rng.float() * Math.PI * 2;
    this.scene = scene;
    scene.add(this.group);
  }

  update(dt, time, playerPosition) {
    if (this.collected) return { collected: true, distance: Infinity };
    this.spin += dt * 0.8;
    this.core.rotation.y = this.spin;
    this.core.rotation.x = Math.sin(this.spin * 0.6) * 0.4;
    this.halo.rotation.x = Math.PI / 2 + Math.sin(time) * 0.3;
    this.halo.rotation.z = time * 0.4;
    this.core.position.y = Math.sin(time * 1.4) * 0.24;
    this.light.intensity = 3 + Math.sin(time * 2.2) * 1.2;
    const distance = this.group.position.distanceTo(playerPosition);
    return { collected: false, distance, near: distance < 16 };
  }

  collect() {
    this.collected = true;
    this.group.visible = false;
    return this.archive;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }
}

/* ------------------------------------------------------------------ *
 * The world director
 * ------------------------------------------------------------------ */

export class World {
  constructor({ scene, renderer, camera, textures, quality, seed, progress, audio, materials }) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.textures = textures;
    this.quality = quality;
    this.seed = seed;
    this.progress = progress;
    this.audio = audio;
    this.rng = new Rng(seed ^ 0x4444);
    this.creatureMaterials = materials;

    this.realmId = 'valley';
    this.realm = null;
    this.realmData = null;
    this.valley = null;
    this.water = null;
    this.foliage = null;
    this.population = null;
    this.portals = [];
    this.fragments = [];
    this.groundProviders = [];
    this.colossus = null;
    this.concordance = null;
    this.wormholes = [];
    this.machine = null;
    this.time = 0;
    this.transition = null;
    this.transitionCallback = null;
    this.onRealmEntered = null;
    this.stats = { instances: 0, creatures: 0, portals: 0 };

    this.materials = materials ?? new CreatureMaterials(textures, seed);
  }

  /* ---------------------------------------------------------------- *
   * Valley (the hub world)
   * ---------------------------------------------------------------- */

  buildValley() {
    this.valley = new ValleyTerrain({
      scene: this.scene,
      textures: this.textures,
      quality: this.quality,
      seed: this.seed,
    });
    this.field = this.valley.field;

    this.population = new Population({
      scene: this.scene,
      field: this.field,
      materials: this.materials,
      quality: this.quality,
      seed: this.seed,
      waterLevel: WATER_LEVEL,
    });

    this.foliage = new FoliageSystem({
      scene: this.scene,
      textures: this.textures,
      quality: this.quality,
      field: this.field,
      seed: this.seed,
    });

    this.water = new WaterSystem({
      scene: this.scene,
      renderer: this.renderer,
      camera: this.camera,
      sky: null,
      textures: this.textures,
      quality: this.quality,
      field: this.field,
      seed: this.seed,
    });

    this._buildPortals();
    this._buildFragments();
    this._buildMachine();
    this._buildSkyMarvels();

    this.realmData = realmById('valley');
    return this;
  }

  /** The LODEMUS chassis: a structure in the valley that holds a truth. */
  _buildMachine() {
    const group = new Group();
    const rng = new Rng(this.seed ^ 0x77);
    // Place it on a flat spot near the valley floor.
    let best = { x: 0, z: 0, score: -Infinity };
    for (let i = 0; i < 300; i++) {
      const angle = rng.angle();
      const radius = rng.range(80, this.field.options.valleyRadius * 0.7);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const slope = this.field.slopeAt(x, z);
      const height = this.field.heightAt(x, z);
      const score = -slope * 10 - Math.abs(height - 22) * 0.05;
      if (score > best.score) best = { x, z, score, height };
    }
    const groundY = this.field.heightAt(best.x, best.z);
    group.position.set(best.x, groundY, best.z);

    const hullSet = this.textures.surface('metal', { seed: 9001 });
    const hull = new MeshStandardMaterial({ map: hullSet.map, normalMap: hullSet.normalMap, color: 0x93a0b0, roughness: 0.35, metalness: 0.85 });
    const glassSet = this.textures.surface('circuit', { seed: 9002 });
    const glass = new MeshStandardMaterial({
      map: glassSet.map,
      emissive: 0x2f8fd8,
      emissiveIntensity: 0.9,
      color: 0x101820,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.86,
    });

    const chassis = new Mesh(new IcosahedronGeometry(9, 2), hull);
    chassis.position.y = 7;
    chassis.scale.set(1.4, 0.8, 1.1);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    const column = new Mesh(new TorusGeometry(11, 0.8, 8, 40), hull);
    column.rotation.x = Math.PI / 2;
    column.position.y = 1.2;
    group.add(column);

    for (let i = 0; i < 5; i++) {
      const strut = new Mesh(new TorusGeometry(6 + i * 1.6, 0.24, 6, 32), hull);
      strut.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      strut.position.y = 7 + Math.sin(i) * 2;
      group.add(strut);
    }

    const window = new Mesh(new SphereGeometry(4.4, 24, 18), glass);
    window.position.set(0, 5.4, 7.2);
    window.scale.set(1, 0.7, 0.35);
    group.add(window);
    this.machineWindow = window;

    const hum = new PointLight(0x6fc8ff, 14, 40, 2);
    hum.position.set(0, 5.4, 7.2);
    group.add(hum);
    this.machineLight = hum;

    this.machine = { group, position: group.position.clone(), used: false };
    this.scene.add(group);
  }

  /** Sky leviathans, the Concordance on the horizon, wormholes over the sea. */
  _buildSkyMarvels() {
    const rng = new Rng(this.seed ^ 0x88);
    if (this.quality.cityIslands !== 0) {
      this.concordance = new FloatingConcordance({
        scene: this.scene,
        textures: this.textures,
        rng,
        count: this.quality.cityIslands ?? 9,
        centre: { x: 900, y: 760, z: -900 },
        spread: 1300,
      });
    }
    for (let i = 0; i < 2; i++) {
      const angle = rng.angle();
      const wormhole = new Wormhole({
        scene: this.scene,
        textures: this.textures,
        rng,
        position: new Vector3(Math.cos(angle) * 1500, 260 + i * 90, Math.sin(angle) * 1500),
        radius: 46 + i * 12,
        realmTarget: i === 0 ? 'singularity' : 'void',
      });
      this.wormholes.push(wormhole);
    }
    // The Great One drifts high above, visible from the valley floor.
    this.colossus = new Colossus({
      scene: this.scene,
      textures: this.textures,
      rng,
      position: { x: -1400, y: 1250, z: 1600 },
      length: 2400,
    });
  }

  _buildPortals() {
    const rng = new Rng(this.seed ^ 0x99);
    const realmTargets = REALMS.filter((r) => r.id !== 'valley');
    const count = Math.min(realmTargets.length, this.quality.portalCount ?? 8);
    for (let i = 0; i < count; i++) {
      const realm = realmTargets[i % realmTargets.length];
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const radius = rng.range(this.field.options.valleyRadius * 0.55, this.field.options.valleyRadius * 1.9);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      let y = this.field.heightAt(x, z) + 3.2;
      if (y < WATER_LEVEL + 3) y = WATER_LEVEL + 3.2;
      const portal = new Portal({
        scene: this.scene,
        textures: this.textures,
        rng,
        position: new Vector3(x, y, z),
        targetRealm: realm.id,
        label: realm.name,
        colorA: realm.palette.accent,
        colorB: realm.palette.sun,
      });
      this.portals.push(portal);
    }
    this.stats.portals = this.portals.length;
  }

  _buildFragments() {
    const rng = new Rng(this.seed ^ 0xaa);
    const archives = this.progress ? undefined : undefined;
    void archives;
    const count = this.quality.fragmentCount ?? 22;
    for (let i = 0; i < count; i++) {
      const angle = rng.angle();
      const radius = rng.range(60, this.field.options.worldRadius * 0.8);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.max(this.field.heightAt(x, z), WATER_LEVEL) + 1.6;
      const fragment = new Fragment({
        scene: this.scene,
        textures: this.textures,
        position: new Vector3(x, y, z),
        archive: null,
        rng,
      });
      fragment.index = i;
      this.fragments.push(fragment);
    }
  }

  /* ---------------------------------------------------------------- *
   * Reality switching
   * ---------------------------------------------------------------- */

  /** Ensure a realm's geometry exists (built lazily, kept for the session). */
  ensureRealm(id) {
    if (id === 'valley') return this.valley;
    if (!this._realmCache) this._realmCache = new Map();
    if (this._realmCache.has(id)) return this._realmCache.get(id);
    const builder = REALM_BUILDERS[id];
    if (!builder) return null;
    const built = builder({
      scene: this.scene,
      textures: this.textures,
      quality: this.quality,
      seed: this.seed ^ (id.length * 7919),
      rng: new Rng(this.seed ^ id.length),
      population: this.population,
      materials: this.materials,
    });
    this._realmCache.set(id, built);
    return built;
  }

  /** Which realities are currently visible? Only the live one. */
  setRealmVisibility(activeId) {
    const setVisible = (id, visible) => {
      if (id === 'valley') {
        this.valley?.streamer.group && (this.valley.streamer.group.visible = visible);
        this.foliage && (this.foliage.group.visible = visible);
        this.water && (this.water.group.visible = visible);
        if (this.concordance) this.concordance.group.visible = visible;
        if (this.colossus) this.colossus.group.visible = visible;
        for (const portal of this.portals) portal.group.visible = visible;
        for (const fragment of this.fragments) fragment.group.visible = visible && !fragment.collected;
        if (this.machine) this.machine.group.visible = visible;
        if (visible) this.population?.creatures.forEach((c) => (c.root.visible = true));
      } else {
        const realm = this._realmCache?.get(id);
        if (realm?.group) realm.group.visible = visible;
      }
    };
    for (const realm of REALMS) setVisible(realm.id, realm.id === activeId);
  }

  /** Enter a reality (with a transition if requested). */
  async enterRealm(id, { transition = true, reason = 'portal' } = {}) {
    if (id === this.realmId) return false;
    const realm = realmById(id);
    if (!realm) return false;
    const built = this.ensureRealm(id);
    if (!built) {
      this.audio?.narrate(`Reality ${id} refused to assemble.`, { mood: 'dread', priority: 2 });
      return false;
    }

    if (transition) {
      this.transition = { t: 0, duration: 2.4, phase: 'out', to: id, reason };
      await this._waitFor(1.0);
    }

    // Swap
    this.realmId = id;
    this.realmData = realm;
    this.realm = built;
    this.setRealmVisibility(id);
    this.groundProviders = [];
    this.progress?.set('realm', id);
    this.progress?.update((state) => {
      if (!state.realmsVisited.includes(id)) state.realmsVisited.push(id);
      state.stats.portalsEntered += 1;
    });

    if (transition) {
      this.transition = { t: 0, duration: 2.6, phase: 'in', to: id, reason };
      await this._waitFor(1.0);
      this.transition = null;
    }

    this.onRealmEntered?.(realm, reason);
    this.audio?.setMusicTheme(realm.music, { immediate: false });
    this.audio?.narrate(realm.entry, { mood: realm.id === 'heaven' ? 'wonder' : 'reverent', priority: 2, speaker: realm.name });
    return true;
  }

  _waitFor(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /** Return to the valley (used by ESC → "return to the first draft"). */
  async returnToValley() {
    return this.enterRealm('valley', { transition: true, reason: 'return' });
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, {
    playerPosition,
    cameraPosition,
    cameraForward,
    timeOfDay = 0.35,
    sun,
    speaking = false,
  } = {}) {
    this.time += dt;
    const realm = this.realmData ?? realmById('valley');
    const inValley = this.realmId === 'valley';

    if (inValley) {
      this.valley.update(playerPosition, dt, {
        wetness: this._wetness ?? 0,
        time: this.time,
      });
      this.foliage.update(playerPosition, dt, {
        time: this.time,
        windStrength: this._wind ?? 0.35,
        windX: 1,
        windZ: 0.35,
      });
      this.water.update(dt, cameraPosition, {
        timeOfDay,
        sunDirection: sun?.direction,
        sunColor: sun?.color,
      });
      this.population.update(dt, { playerPosition, time: this.time, weather: this._weather });
      for (const portal of this.portals) portal.update(dt, this.time, playerPosition);
      for (const fragment of this.fragments) {
        const info = fragment.update(dt, this.time, playerPosition);
        if (info.near && !fragment.collected) this.nearFragment = fragment;
      }
      if (this.concordance) this.concordance.update(dt, this.time, playerPosition);
      if (this.colossus) this.colossus.update(dt, this.time);
      for (const wormhole of this.wormholes) {
        this.lastWormholeEffect = wormhole.update(dt, this.time, playerPosition);
      }
      if (this.machine) {
        const distance = this.machine.position.distanceTo(playerPosition);
        const pulse = 0.6 + Math.sin(this.time * 1.2) * 0.4;
        if (this.machineLight) this.machineLight.intensity = 6 + pulse * 10 * clamp01(1 - distance / 300);
        if (this.machineWindow) this.machineWindow.material.emissiveIntensity = 0.5 + pulse * 0.8;
      }
      // Walkable ground: terrain plus islands.
      this._registerGroundProviders();
    } else if (this.realm) {
      this.realm.update?.(dt, {
        playerPosition,
        cameraPosition,
        cameraForward,
        time: this.time,
        speaking,
        onSense: (info) => {
          this.sense = { ...(this.sense ?? {}), ...info };
        },
        onGravity: (info) => {
          this.gravityEffect = info;
        },
        onSwallowed: (wormhole) => {
          this.pendingRealm = wormhole.realmTarget;
        },
        onBroadcast: (tv) => {
          this.audio?.playAt('tv.static', tv.node.position, { gain: 0.8 });
          this.activeBroadcast = tv;
        },
        onTVSpeech: (tv) => {
          this.audio?.narrate(tv.broadcast.text, {
            mood: tv.broadcast.kind === 'emergency' ? 'urgent' : 'calm',
            speaker: tv.broadcast.speaker,
            priority: 1,
          });
          this.activeBroadcast = tv;
        },
        registerGroundProvider: (fn) => this.groundProviders.push(fn),
        setTimeDilation: (value) => {
          this.timeDilation = value;
        },
      });
      this._registerGroundProviders();
      this.population.update(dt, { playerPosition, time: this.time });
    }

    // Population is shared across realities: keep its field provider correct.
    if (this.population && !inValley) {
      // Alternate realities have their own floors; creatures simply follow.
    }
    return this.realmData;
  }

  _registerGroundProviders() {
    if (this.groundProviders.length === 0) return;
    if (this.realmId === 'valley' && this.concordance) {
      const concordance = this.concordance;
      this.groundProviders.push((x, z, y) => concordance.surfaceHeightAt({ x, y, z }));
    }
    if (this.realmId === 'colossus' && this.colossus) {
      const colossus = this.colossus;
      this.groundProviders.push((x, z, y) => colossus.surfaceHeightAt({ x, y, z }));
    }
  }

  get isUnderwater() {
    return (this.water?.underwater ?? 0) > 0.5;
  }

  /** Ground height including any providers (islands, the Great One's back). */
  groundHeight(x, z, y) {
    let best = this.field ? this.field.heightAt(x, z) : 0;
    for (const provider of this.groundProviders) {
      const value = provider(x, z, y);
      if (value != null && Math.abs(value - y) < 60 && value > best) best = value;
    }
    return best;
  }

  /** Ambient context for audio/weather (called by the game loop). */
  environmentContext(playerPosition, weather) {
    this._weather = weather;
    this._wind = weather?.wind ?? 0.35;
    this._wetness = clamp01((weather?.rain ?? 0) * 0.9 + (this.water?.underwater ?? 0) * 0.4);
    const nearestFall = this.water?.waterfallProximity(playerPosition, 300) ?? 0;
    const underwater = this.water?.underwater ?? 0;
    const biome = this.field ? this.field.biomeAt(playerPosition.x, playerPosition.z).biome : null;
    return {
      biome: this.realmId === 'valley' ? biome?.id ?? 'meadow' : this.realmId === 'deep' ? 'abyss' : this.realmId,
      night: clamp01(1 - (this._daylight ?? 1)),
      altitude: clamp01((playerPosition.y - 20) / 400),
      underwater,
      nearWaterfall: nearestFall,
      rain: weather?.rain ?? 0,
      wind: weather?.wind ?? 0.35,
      interior: this.realmId === 'backrooms' || this.realmId === 'maze' ? 1 : 0,
    };
  }

  setDaylight(value) {
    this._daylight = value;
  }

  /** Portals the player is standing in, with requirement checks. */
  portalCheck(playerPosition, progress) {
    for (const portal of this.portals) {
      const info = portal.update(0, this.time, playerPosition);
      if (!info.inside) continue;
      const realm = realmById(portal.targetRealm);
      const requirements = realm.requirements ?? {};
      const locked =
        (requirements.chapter != null && (progress?.get('chapter') ?? 0) < requirements.chapter) ||
        (requirements.upgrade && !(progress?.get('upgrades')?.[requirements.upgrade] > 0)) ||
        (requirements.truth && !(progress?.get('truthsFound') ?? []).includes(requirements.truth));
      return { portal, realm, locked, requirements };
    }
    return null;
  }

  dispose() {
    this.valley?.dispose();
    this.foliage?.dispose();
    this.water?.dispose();
    this.population?.clear();
    for (const portal of this.portals) portal.dispose();
    for (const fragment of this.fragments) fragment.dispose();
    for (const wormhole of this.wormholes) wormhole.dispose();
    if (this._realmCache) for (const realm of this._realmCache.values()) realm.dispose?.();
    this.concordance?.dispose();
    this.colossus?.dispose();
    if (this.machine) {
      this.scene.remove(this.machine.group);
      this.machine.group.traverse((c) => {
        c.geometry?.dispose?.();
        c.material?.dispose?.();
      });
    }
  }
}
