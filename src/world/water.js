/**
 * THE MULTIVERSE — world/water.js
 * ==================================================================
 * WATER. Everything wet in the valley:
 *
 *  • OCEANS, LAKES AND RIVERS — one flat-mirror water surface (three.js'
 *    Water implementation) at the water level. Reflections are *real*: the
 *    scene is re-rendered from the mirrored camera each frame, with the
 *    distortion, sun specular and fresnel of the classic geo-water shader.
 *  • CLIFF WATERFALLS — the gigantic falls the lore promises. Places are
 *    found by scanning the terrain for the sharpest drops off the valley
 *    shoulders, then sheets of flowing water are hung from the lip with
 *    spray, mist and mist-lit rainbows at the base.
 *  • UNDERWATER STATE — submersion detection drives fog, audio, tint and the
 *    player's breathing.
 */
import {
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  BufferGeometry,
  BufferAttribute,
  Vector3,
  DoubleSide,
  SphereGeometry,
  MeshBasicMaterial,
  AdditiveBlending,
} from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { clamp, clamp01, lerp } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { createSpriteMaterial, createWaterfallMaterial } from '../render/shaders.js';
import { WATER_LEVEL } from './terrain.js';
import { landmarkName } from '../lore.js';

export class WaterSystem {
  constructor({ scene, renderer, camera, sky, textures, quality, field, seed = 1337 }) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.sky = sky;
    this.textures = textures;
    this.quality = quality;
    this.field = field;
    this.seed = seed;
    this.rng = new Rng(seed ^ 0x9a7e);
    this.group = new Group();
    this.group.name = 'water';
    this.scene.add(this.group);

    this.waterLevel = WATER_LEVEL;
    this.underwater = 0;
    this.underwaterFog = new Color(0x0b3b4a);
    this.waterfalls = [];
    this.mistSystems = [];
    this.lastSplash = 0;

    this._buildSurface();
    this._buildWaterfalls();
  }

  /* ---------------------------------------------------------------- *
   * Surface
   * ---------------------------------------------------------------- */

  _buildSurface() {
    const normalMap = this.textures.waterNormal({ seed: this.seed + 3 }).normalMap;
    normalMap.wrapS = normalMap.wrapT = 1001; // RepeatWrapping
    normalMap.repeat.set(3, 3);

    const size = this.field.options.worldRadius * 3.2;
    const geometry = new PlaneGeometry(size, size, 1, 1);
    const reflectionSize = clamp(this.quality.reflectionSize ?? 512, 128, 2048);

    this.water = new Water(geometry, {
      textureWidth: reflectionSize,
      textureHeight: reflectionSize,
      waterNormals: normalMap,
      sunDirection: new Vector3(0.4, 0.7, -0.5).normalize(),
      sunColor: 0xfff4dc,
      waterColor: 0x0d3a4a,
      distortionScale: clamp(18 * (this.quality.waterQuality === 'low' ? 0.6 : 1), 4, 34),
      alpha: this.quality.waterQuality === 'ultra' ? 0.94 : 0.9,
      fog: true,
      clipBias: 0.0035,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.waterLevel;
    this.water.name = 'ocean';
    this.water.renderOrder = 2;
    this.water.receiveShadow = false;
    this.group.add(this.water);
    this.waterMaterial = this.water.material;
  }

  /* ---------------------------------------------------------------- *
   * Waterfalls
   * ---------------------------------------------------------------- */

  /**
   * Scan the valley shoulders for the sharpest drops and hang a waterfall
   * on each. Returns the list of placed falls (also used by the codex).
   */
  _buildWaterfalls(maxCount = 8) {
    const candidates = [];
    const radius = this.field.options.valleyRadius;
    const samples = 900;
    const rng = this.rng;
    for (let i = 0; i < samples; i++) {
      const angle = rng.angle();
      const dist = lerp(radius * 0.5, radius * 2.4, Math.sqrt(rng.float()));
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = this.field.heightAt(x, z);
      if (h < 55) continue;
      // Find the direction of steepest descent.
      let bestDrop = 0;
      let bestDir = null;
      for (let a = 0; a < 12; a++) {
        const theta = (a / 12) * Math.PI * 2;
        const dx = Math.cos(theta);
        const dz = Math.sin(theta);
        const target = this.field.heightAt(x + dx * 46, z + dz * 46);
        const drop = h - target;
        if (drop > bestDrop) {
          bestDrop = drop;
          bestDir = { x: dx, z: dz };
        }
      }
      if (!bestDir || bestDrop < 34) continue;
      // Require a pool or slope-out at the base so falls end somewhere.
      const baseX = x + bestDir.x * 150;
      const baseZ = z + bestDir.z * 150;
      const baseHeight = this.field.heightAt(baseX, baseZ);
      const fallHeight = h - baseHeight;
      if (fallHeight < 45) continue;
      let duplicate = false;
      for (const c of candidates) {
        if (Math.hypot(c.x - x, c.z - z) < 240) duplicate = true;
      }
      if (duplicate) continue;
      candidates.push({ x, z, height: h, baseX, baseZ, baseHeight, fallHeight, dir: bestDir, drop: bestDrop });
      if (candidates.length >= maxCount) break;
    }

    for (const candidate of candidates) {
      this._placeWaterfall(candidate);
    }
    return this.waterfalls;
  }

  _placeWaterfall({ x, z, height, baseX, baseZ, baseHeight, fallHeight, dir }) {
    const width = clamp(lerp(14, 46, this.rng.float()), 12, 52);
    const fall = clamp(fallHeight, 40, 320);
    const geometry = new PlaneGeometry(width, fall, 6, 24);
    const material = createWaterfallMaterial({
      speed: 0.7 + this.rng.float() * 0.5,
      height: fall,
      width,
      opacity: 0.9,
      flowMap: this.textures.flow(),
    });
    const sheet = new Mesh(geometry, material);
    sheet.name = `waterfall-${Math.round(x)}-${Math.round(z)}`;
    sheet.renderOrder = 3;
    // Stand the sheet up facing outward from the cliff.
    const mid = new Vector3((x + baseX) / 2, (height + baseHeight) / 2, (z + baseZ) / 2);
    sheet.position.copy(mid);
    sheet.rotation.y = Math.atan2(dir.x, dir.z);
    sheet.rotation.x = -0.06;
    sheet.frustumCulled = true;
    this.group.add(sheet);

    // Spray at the lip and mist rising from the plunge pool.
    const lipMist = this._makeMist({ x, y: height - 2, z }, { count: 900, radius: width * 0.9, height: 26, speed: 3.4, size: 70, opacity: 0.4 });
    const poolMist = this._makeMist({ x: baseX, y: baseHeight + 2, z: baseZ }, { count: 1500, radius: width * 1.8, height: 60, speed: 2.2, size: 120, opacity: 0.5 });
    this.mistSystems.push(lipMist, poolMist);

    // A rainbow at the base: a thin additive torus facing the sun.
    const rainbow = new Mesh(
      new SphereGeometry(width * 1.5, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new MeshBasicMaterial({
        color: 0xcfe9ff,
        transparent: true,
        opacity: 0.06,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      })
    );
    rainbow.position.set(baseX, baseHeight + 4, baseZ);
    rainbow.scale.set(1, 0.42, 1);
    this.group.add(rainbow);
    void rainbow;

    const landmark = {
      id: Math.round(x * 1000 + z),
      name: landmarkName(Math.round(x * 7 + z * 13)),
      x,
      z,
      baseX,
      baseZ,
      height: fall,
      width,
      sheet,
      material,
      mist: [lipMist, poolMist],
      discovered: false,
    };
    this.waterfalls.push(landmark);
    return landmark;
  }

  _makeMist(position, { count = 800, radius = 30, height = 40, speed = 2, size = 90, opacity = 0.4 } = {}) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const a = rng.angle();
      const r = Math.sqrt(rng.float()) * radius;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = rng.float() * height;
      positions[i * 3 + 2] = Math.sin(a) * r;
      sizes[i] = size * lerp(0.5, 1.6, rng.float());
      opacities[i] = opacity * lerp(0.3, 1, rng.float());
      colors[i * 3] = 0.92;
      colors[i * 3 + 1] = 0.96;
      colors[i * 3 + 2] = 1;
      velocities[i * 3] = (rng.float() - 0.5) * speed;
      velocities[i * 3 + 1] = speed * (0.4 + rng.float());
      velocities[i * 3 + 2] = (rng.float() - 0.5) * speed;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aOpacity', new BufferAttribute(opacities, 1));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    const material = createSpriteMaterial(this.textures.sprite('mote', { size: 128 }), {
      color: 0xffffff,
      opacity: 1,
      additive: true,
      emissive: 0.4,
    });
    if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    else material.uniforms.uPixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };
    const points = new Points(geometry, material);
    points.position.copy(position);
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, geometry, material, positions, velocities, count, height, origin: position.clone() };
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, cameraPosition, { timeOfDay = 0.4, sunDirection = null, sunColor = null, exposure = 1 } = {}) {
    // ---- reflection water ----
    const uniforms = this.waterMaterial.uniforms;
    uniforms.time.value += dt;
    if (sunDirection) uniforms.sunDirection.value.copy(sunDirection).normalize();
    if (sunColor) uniforms.sunColor.value.copy(sunColor);
    uniforms.eye.value?.copy?.(cameraPosition);
    // Fade roughness/detail with distance so far-off water stays calm and clean.
    const distanceToWater = Math.abs(cameraPosition.y - this.waterLevel);
    uniforms.distortionScale.value = clamp(lerp(10, 28, clamp01(1 - distanceToWater / 240)) * (this.quality.waterQuality === 'ultra' ? 1.2 : 1), 4, 36);
    void timeOfDay;
    void exposure;

    // ---- waterfalls ----
    for (const fall of this.waterfalls) {
      fall.material.uniforms.uTime.value += dt;
      fall.material.uniforms.uUnderwater.value = this.underwater;
    }

    // ---- mist ----
    for (const mist of this.mistSystems) {
      const positions = mist.positions;
      for (let i = 0; i < mist.count; i++) {
        const i3 = i * 3;
        positions[i3] += mist.velocities[i3] * dt;
        positions[i3 + 1] += mist.velocities[i3 + 1] * dt;
        positions[i3 + 2] += mist.velocities[i3 + 2] * dt;
        // recycle when the particle has risen past the plume
        if (positions[i3 + 1] > mist.height) {
          positions[i3 + 1] = 0;
          const a = this.rng.angle();
          const r = this.rng.float() * mist.height * 0.4;
          positions[i3] = Math.cos(a) * r;
          positions[i3 + 2] = Math.sin(a) * r;
        }
      }
      mist.geometry.attributes.position.needsUpdate = true;
    }

    // ---- submersion ----
    const headY = cameraPosition.y;
    const target = headY < this.waterLevel - 0.15 ? 1 : 0;
    this.underwater = lerp(this.underwater, target, clamp01(dt * 4));
    return this.underwater;
  }

  get isUnderwater() {
    return this.underwater > 0.5;
  }

  /** Nearest waterfall and its distance — drives audio and the codex. */
  nearestWaterfall(position) {
    let best = null;
    let bestD = Infinity;
    for (const fall of this.waterfalls) {
      const d = Math.hypot(fall.x - position.x, fall.z - position.z);
      if (d < bestD) {
        bestD = d;
        best = fall;
      }
    }
    return best ? { fall: best, distance: bestD } : null;
  }

  /** Proximity 0..1 used to blend the roar of the falls into the mix. */
  waterfallProximity(position, range = 260) {
    const nearest = this.nearestWaterfall(position);
    if (!nearest) return 0;
    return clamp01(1 - nearest.distance / range);
  }

  /** Splash effects when the player or a creature enters the water. */
  registerSplash(position, power = 1, onSplash = null) {
    const now = performance.now();
    if (now - this.lastSplash < 120) return null;
    this.lastSplash = now;
    const splash = this._makeMist(position, {
      count: Math.round(180 * power),
      radius: 3 * power,
      height: 6 * power,
      speed: 6 * power,
      size: 24,
      opacity: 0.7,
    });
    splash.life = 1.4;
    splash.age = 0;
    this.mistSystems.push(splash);
    onSplash?.(position, power);
    return splash;
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    for (const mist of this.mistSystems) {
      this.scene.remove(mist.points);
      mist.geometry.dispose();
      mist.material.dispose();
    }
    this.scene.remove(this.group);
  }
}
