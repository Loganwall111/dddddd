/**
 * THE MULTIVERSE — render/sky.js
 * ==================================================================
 * THE SKY, WEATHER AND CELESTIAL MECHANICS.
 *
 *  • Atmospheric scattering via three's Preetham Sky model, driven by a
 *    time-of-day clock with *two* suns (the valley has a second, smaller star
 *    that arrives early "to be noticed" — a piece of lore that is also a
 *    beautiful lighting problem: two specular sources on water).
 *  • A raymarched volumetric cloud deck on a dome, lit by both suns.
 *  • Moons and neighbours that rise, set and cast their own light.
 *  • A nebula + starfield backdrop that fades in at night and takes over
 *    entirely in the void, the singularity and the intro's space sequence.
 *  • Weather state machine: clear → overcast → rain → storm, with lightning
 *    flashes that also drive the audio thunder.
 */
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  BufferGeometry,
  BufferAttribute,
  SphereGeometry,
  Vector2,
  Vector3,
  AdditiveBlending,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, clamp01, damp, lerp, mixHex, wrap } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { createCloudMaterial, createNebulaMaterial, createSpriteMaterial } from './shaders.js';

const TWO_SUN_COLOR = 0xffb98a;

export class SkySystem {
  constructor({ scene, renderer, textures, quality = {}, settings = null, seed = 1337, onLightning = null }) {
    this.scene = scene;
    this.renderer = renderer;
    this.textures = textures;
    this.quality = quality;
    this.settings = settings;
    this.seed = seed;
    this.rng = new Rng(seed ^ 0x5e1);
    this.onLightning = onLightning;

    this.timeOfDay = 0.28; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    this.dayLength = 22 * 60; // seconds for a full cycle (22 minutes)
    this.day = 1;
    this.timeScale = 1;
    this.paused = false;

    this.weather = {
      state: 'clear',
      target: 'clear',
      cloudCoverage: quality.cloudSteps > 24 ? 0.42 : 0.34,
      rain: 0,
      wind: 0.35,
      windDirection: new Vector2(1, 0.35).normalize(),
      lightningTimer: 8,
      fogDensity: 0.0016,
    };

    this.group = new Group();
    this.group.name = 'sky';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this._buildAtmosphere();
    this._buildCelestialBodies();
    this._buildStars();
    this._buildClouds();
    this._buildWeather();
    this.setTime(this.timeOfDay);
  }

  /* ---------------------------------------------------------------- *
   * Construction
   * ---------------------------------------------------------------- */

  _buildAtmosphere() {
    this.sky = new Sky();
    this.sky.scale.setScalar(60000);
    this.sky.material.uniforms.turbidity.value = 6.2;
    this.sky.material.uniforms.rayleigh.value = 1.7;
    this.sky.material.uniforms.mieCoefficient.value = 0.0035;
    this.sky.material.uniforms.mieDirectionalG.value = 0.78;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Sun A: the main light. Sun B: the small companion star.
    this.sunLight = new DirectionalLight(0xfff3d6, 3.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(this.quality.shadowMapSize ?? 2048, this.quality.shadowMapSize ?? 2048);
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.045;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 3200;
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.sun2Light = new DirectionalLight(TWO_SUN_COLOR, 0.55);
    this.sun2Light.castShadow = false;
    this.scene.add(this.sun2Light);
    this.sun2Light.target = this.sunLight.target;

    this.hemiLight = new HemisphereLight(0xbcd7f0, 0x4a5a44, 0.55);
    this.scene.add(this.hemiLight);
    this.ambient = new AmbientLight(0x8fa6c8, 0.16);
    this.scene.add(this.ambient);

    // The sun discs, drawn as sprites that always face the camera.
    const discGeometry = new SphereGeometry(1, 24, 16);
    this.sunDisc = new Mesh(discGeometry, new MeshBasicMaterial({ color: 0xfff4d0, fog: false, toneMapped: true }));
    this.sunDisc.scale.setScalar(320);
    this.sun2Disc = new Mesh(
      discGeometry,
      new MeshBasicMaterial({ color: TWO_SUN_COLOR, fog: false, transparent: true, opacity: 0.9 })
    );
    this.sun2Disc.scale.setScalar(150);
    this.group.add(this.sunDisc);
    this.group.add(this.sun2Disc);
  }

  _buildCelestialBodies() {
    const moonTextures = this.textures.moons();
    this.moons = [];
    const moonDefs = [
      { radius: 2100, distance: 42000, speed: 0.00042, phase: 0.2, texture: moonTextures[0], light: 0.32 },
      { radius: 900, distance: 52000, speed: -0.00061, phase: 3.3, texture: moonTextures[1], light: 0.16 },
    ];
    for (const def of moonDefs) {
      const mesh = new Mesh(
        new SphereGeometry(def.radius, 48, 32),
        new MeshStandardMaterial({
          map: def.texture,
          emissive: new Color(0x141a2c),
          emissiveMap: def.texture,
          emissiveIntensity: 0.55,
          roughness: 1,
          metalness: 0,
          fog: false,
        })
      );
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const light = new DirectionalLight(0xbcd0ff, 0);
      light.target = this.sunLight.target;
      this.scene.add(light);
      this.moons.push({ ...def, mesh, light, orbit: def.phase });
    }

    // Distant gas giants and a ringed world — the multiverse is crowded.
    const planetDefs = [
      { distance: 150000, radius: 12000, palette: ['#e8c98a', '#a9734a', '#f2e2bd'], tilt: 0.32, ring: true },
      { distance: 220000, radius: 9000, palette: ['#7ea8c4', '#2f5d7a', '#cfe6f2'], tilt: -0.5, ring: false },
    ];
    this.planets = [];
    planetDefs.forEach((def, index) => {
      const texture = this.textures.planet(index, { palette: def.palette });
      const mesh = new Mesh(
        new SphereGeometry(def.radius, 48, 32),
        new MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0, fog: false, emissive: 0x0a0a12, emissiveIntensity: 0.4 })
      );
      mesh.frustumCulled = false;
      mesh.rotation.z = def.tilt;
      this.group.add(mesh);
      let ring = null;
      if (def.ring) {
        const ringGeometry = new SphereGeometry(def.radius * 2.05, 64, 2);
        ring = new Mesh(
          ringGeometry,
          new MeshBasicMaterial({ color: 0xd9c9a8, transparent: true, opacity: 0.28, side: 2, fog: false })
        );
        ring.scale.set(1, 0.035, 1);
        ring.rotation.x = Math.PI * 0.42;
        mesh.add(ring);
      }
      this.planets.push({ ...def, mesh, ring });
    });
  }

  _buildStars() {
    const count = Math.round(clamp((this.quality.particles ?? 1) * 4200, 300, 9000));
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const rng = new Rng(this.seed ^ 0x57a2);
    const radius = 52000;
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const dir = rng.onSphere({ x: 0, y: 0, z: 0 });
      const r = radius * rng.range(0.85, 1);
      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = Math.abs(dir.y) * r * 0.92;
      positions[i * 3 + 2] = dir.z * r;
      const magnitude = Math.pow(rng.float(), 2.6);
      sizes[i] = lerp(18, 120, magnitude);
      opacities[i] = lerp(0.35, 1, magnitude);
      const temperature = rng.float();
      color.setHSL(lerp(0.58, 0.08, temperature), lerp(0.15, 0.5, rng.float()), lerp(0.6, 1));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aOpacity', new BufferAttribute(opacities, 1));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    const material = createSpriteMaterial(this.textures.stars(), { color: 0xffffff, opacity: 1, emissive: 1.4 });
    if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    else material.uniforms.uPixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };
    this.starField = new Points(geometry, material);
    this.starField.frustumCulled = false;
    this.starField.matrixAutoUpdate = false;
    this.group.add(this.starField);

    // Nebula backdrop (behind the stars, in front of nothing).
    const nebulaMaterial = createNebulaMaterial(this.textures, { tint: 0x8f7bff, intensity: 0 });
    this.nebula = new Mesh(new SphereGeometry(56000, 32, 24), nebulaMaterial);
    this.nebula.material.side = BackSide;
    this.nebula.frustumCulled = false;
    this.group.add(this.nebula);
  }

  _buildClouds() {
    const steps = this.quality.cloudSteps ?? 32;
    if (steps <= 0) {
      this.clouds = null;
      return;
    }
    const noiseSize = steps >= 48 ? 64 : steps >= 24 ? 48 : 32;
    const material = createCloudMaterial(
      { cloudNoise: this.textures.cloudNoise(noiseSize) },
      {
        coverage: this.weather.cloudCoverage,
        steps,
        lightSteps: steps >= 40 ? 5 : steps >= 24 ? 4 : 3,
        shellHeight: 1.6,
      }
    );
    this.clouds = new Mesh(new SphereGeometry(26000, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), material);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    this.group.add(this.clouds);
  }

  _buildWeather() {
    const rainCount = Math.round(clamp((this.quality.particles ?? 1) * 9000, 500, 14000));
    const makeField = (count, texture, size, color, additive) => {
      const positions = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const opacities = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      const rng = new Rng(this.seed ^ count);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = rng.range(-120, 120);
        positions[i * 3 + 1] = rng.range(0, 160);
        positions[i * 3 + 2] = rng.range(-120, 120);
        sizes[i] = size * rng.range(0.6, 1.4);
        opacities[i] = rng.range(0.35, 0.9);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
      geometry.setAttribute('aOpacity', new BufferAttribute(opacities, 1));
      geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
      const material = createSpriteMaterial(texture, { color: 0xffffff, opacity: 0, additive });
      if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    else material.uniforms.uPixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.visible = false;
      this.scene.add(points);
      return { points, material, positions, geometry, count, speeds: new Float32Array(count) };
    };

    const white = new Color(0xffffff);
    const rainColor = new Color(0xa8c8ff);
    this.rain = makeField(rainCount, this.textures.sprite('rain', { size: 128 }), 42, rainColor, false);
    this.snow = makeField(
      Math.round(rainCount * 0.45),
      this.textures.sprite('snow', { size: 128 }),
      26,
      white,
      false
    );
    for (let i = 0; i < this.rain.count; i++) this.rain.speeds[i] = 90 + this.rng.float() * 60;
    for (let i = 0; i < this.snow.count; i++) this.snow.speeds[i] = 6 + this.rng.float() * 8;

    // Lightning: a short, enormous flash from an arbitrary direction.
    this.lightningLight = new DirectionalLight(0xdce8ff, 0);
    this.lightningLight.position.set(0, 400, 0);
    this.scene.add(this.lightningLight);
    this.lightningTimer = 0;
    this.flash = 0;

    // Realm-driven fog, kept linear so distant cliffs stay readable.
    this.scene.fog = new Fog(new Color(0xbfd6e6), 400, 6000);
  }

  /* ---------------------------------------------------------------- *
   * Time of day
   * ---------------------------------------------------------------- */

  setTime(fraction) {
    this.timeOfDay = wrap(fraction, 1);
    return this.timeOfDay;
  }

  /**
   * Sun elevation for a given time of day. Returns [-1,1], where 1 is zenith.
   * The second sun runs slightly ahead — lore: "it arrives early to be noticed".
   */
  sunElevation(time = this.timeOfDay) {
    return Math.sin((time - 0.25) * Math.PI * 2);
  }

  get isNight() {
    return this.sunElevation() < -0.06;
  }

  get daylight() {
    return clamp01((this.sunElevation() + 0.14) / 0.42);
  }

  /* ---------------------------------------------------------------- *
   * Weather
   * ---------------------------------------------------------------- */

  setWeather(state, { immediate = false } = {}) {
    const presets = {
      clear: { coverage: 0.32, rain: 0, wind: 0.3, fog: 0.0009 },
      overcast: { coverage: 0.68, rain: 0, wind: 0.5, fog: 0.0016 },
      rain: { coverage: 0.78, rain: 0.75, wind: 0.7, fog: 0.0022 },
      storm: { coverage: 0.9, rain: 1, wind: 1.1, fog: 0.003 },
      mist: { coverage: 0.4, rain: 0, wind: 0.15, fog: 0.006 },
      ash: { coverage: 0.55, rain: 0, wind: 0.5, fog: 0.0026 },
      snow: { coverage: 0.72, rain: 0.85, wind: 0.55, fog: 0.0024 },
      blizzard: { coverage: 0.95, rain: 1, wind: 1.4, fog: 0.0075 },
      clear_night: { coverage: 0.24, rain: 0, wind: 0.25, fog: 0.0011 },
    };
    const preset = presets[state] || presets.clear;
    this.weather.target = state;
    this.weather.state = state;
    const blend = immediate ? 1 : 0;
    this.weather.cloudCoverage = lerp(this.weather.cloudCoverage, preset.coverage, blend || 0);
    this.weather.rainTarget = preset.rain;
    this.weather.windTarget = preset.wind;
    this.weather.fogTarget = preset.fog;
    if (immediate) {
      this.weather.cloudCoverage = preset.coverage;
      this.weather.rain = preset.rain;
      this.weather.wind = preset.wind;
      this.weather.fogDensity = preset.fog;
    } else {
      // Animate toward the target in update().
      this.weather.rainTarget ??= preset.rain;
    }
    this._weatherPreset = preset;
    return this;
  }

  /** Force a lightning strike (used by the storm and by the singularity). */
  strikeLightning({ power = 1 } = {}) {
    this.flash = Math.min(1.6, this.flash + 0.9 * power);
    this.lightningLight.intensity = 12 * power;
    const angle = this.rng.angle();
    this.lightningLight.position.set(Math.cos(angle) * 600, 500 + this.rng.range(0, 400), Math.sin(angle) * 600);
    this.onLightning?.(power);
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, cameraPosition = { x: 0, y: 0, z: 0 }, { realm = null, forcedWeather = null } = {}) {
    if (!this.paused) {
      this.timeOfDay = wrap(this.timeOfDay + (dt * this.timeScale) / this.dayLength, 1);
    }
    const palette = realm?.palette;

    // Weather easing
    const preset = this._weatherPreset || { coverage: 0.4, rain: 0, wind: 0.35, fog: 0.0016 };
    this.weather.cloudCoverage = damp(this.weather.cloudCoverage, preset.coverage, 0.35, dt);
    this.weather.rain = damp(this.weather.rain, forcedWeather ? forcedWeather.rain ?? preset.rain : preset.rain, 0.5, dt);
    this.weather.wind = damp(this.weather.wind, forcedWeather ? forcedWeather.wind ?? preset.wind : preset.wind, 0.35, dt);
    this.weather.fogDensity = damp(this.weather.fogDensity, forcedWeather ? forcedWeather.fog ?? preset.fog : preset.fog, 0.3, dt);

    // ---- sun geometry ----
    const elevation = this.sunElevation();
    const azimuth = (this.timeOfDay - 0.25) * Math.PI * 2 + Math.PI * 0.5;
    const sunDistance = 24000;
    const sunPos = new Vector3(
      Math.cos(azimuth) * Math.cos(elevation) * sunDistance,
      Math.sin(elevation) * sunDistance,
      Math.sin(azimuth) * Math.cos(elevation) * sunDistance
    );
    if (this.sky?.material?.uniforms?.sunPosition) {
      this.sky.material.uniforms.sunPosition.value.copy(sunPos);
    }
    this.sunLight.position.copy(sunPos).multiplyScalar(0.02);
    this.sunDisc.position.copy(sunPos).add(new Vector3(cameraPosition.x, 0, cameraPosition.z));
    this.sunDisc.scale.setScalar(lerp(420, 260, clamp01(elevation)));

    // The second sun lags behind, so the valley has two shadows to cast.
    const elevation2 = this.sunElevation(this.timeOfDay - 0.055);
    const azimuth2 = azimuth - 0.9;
    const sun2Pos = new Vector3(
      Math.cos(azimuth2) * Math.cos(elevation2) * sunDistance,
      Math.sin(elevation2) * sunDistance,
      Math.sin(azimuth2) * Math.cos(elevation2) * sunDistance
    );
    this.sun2Disc.position.copy(sun2Pos).add(new Vector3(cameraPosition.x, 0, cameraPosition.z));
    this.sun2Light.position.copy(sun2Pos).multiplyScalar(0.02);

    // ---- lighting levels across the day ----
    const day = this.daylight;
    const night = 1 - day;
    const sunset = Math.max(0, 1 - Math.abs(elevation) * 4.2);
    const warmColor = mixHex(0xfff3d6, 0xff9a52, clamp01(sunset));

    this.sunLight.color.setHex(warmColor);
    this.sunLight.intensity = lerp(0.02, 3.35, day) * lerp(1, 0.72, sunset * 0.5);
    this.sun2Light.intensity = lerp(0.0, 0.75, clamp01((this.sunElevation(this.timeOfDay - 0.055) + 0.1) / 0.4) * 0.8);
    this.sunDisc.visible = elevation > -0.08;
    this.sun2Disc.visible = elevation2 > -0.08;

    this.hemiLight.intensity = lerp(0.09, 0.6, day);
    this.hemiLight.color.setHex(mixHex(0x1b2740, 0xbcd7f0, day));
    this.hemiLight.groundColor.setHex(mixHex(0x0b1018, 0x4a5a44, day));
    this.ambient.intensity = lerp(0.05, 0.18, day);

    // Moons rise when the sun is gone.
    for (const moon of this.moons) {
      moon.orbit += dt * moon.speed * 3600;
      const elevation3 = Math.sin(moon.orbit) * 0.9 + 0.15;
      const azimuth3 = moon.orbit * 0.35;
      const position = new Vector3(
        Math.cos(azimuth3) * Math.cos(elevation3) * moon.distance,
        Math.sin(elevation3) * moon.distance,
        Math.sin(azimuth3) * Math.cos(elevation3) * moon.distance
      );
      moon.mesh.position.copy(position).add(new Vector3(cameraPosition.x, 0, cameraPosition.z));
      moon.mesh.rotation.y += dt * 0.004;
      moon.light.position.copy(position).multiplyScalar(0.001);
      moon.light.intensity = Math.max(0, clamp01(Math.sin(moon.orbit)) * night * moon.light);
      moon.mesh.visible = Math.sin(moon.orbit) > -0.2;
    }

    // Planets rotate slowly, because they can.
    for (const planet of this.planets) {
      planet.mesh.rotation.y += dt * 0.004;
      planet.mesh.position.set(Math.cos(planet.tilt) * planet.distance, planet.distance * 0.35, Math.sin(planet.tilt) * planet.distance);
      planet.mesh.position.x += cameraPosition.x;
      planet.mesh.position.z += cameraPosition.z;
    }

    // ---- starfield & nebula visibility ----
    const starOpacity = clamp01(night * 1.35);
    if (this.starField) {
      this.starField.position.set(cameraPosition.x, 0, cameraPosition.z);
      this.starField.material.uniforms.uOpacity.value = starOpacity;
      this.starField.visible = starOpacity > 0.01;
    }
    if (this.nebula) {
      this.nebula.position.set(cameraPosition.x, 0, cameraPosition.z);
      const intensity = clamp01(night * 1.1) * (this.quality.spaceBackdrop === false ? 0.4 : 1);
      this.nebula.material.uniforms.uIntensity.value = damp(
        this.nebula.material.uniforms.uIntensity.value,
        intensity,
        0.6,
        dt
      );
      this.nebula.visible = intensity > 0.01;
    }

    // ---- clouds ----
    if (this.clouds) {
      const uniforms = this.clouds.material.uniforms;
      uniforms.uTime.value += dt;
      uniforms.uCoverage.value = damp(uniforms.uCoverage.value, this.weather.cloudCoverage, 0.4, dt);
      uniforms.uSunDir.value.copy(sunPos).normalize();
      uniforms.uSun2Dir.value.copy(sun2Pos).normalize();
      uniforms.uSunColor.value.setHex(mixHex(0xfff6e2, 0xff8c50, clamp01(sunset)));
      uniforms.uSun2Color.value.setHex(palette?.sun ?? TWO_SUN_COLOR);
      uniforms.uSkyColor.value.setHex(palette?.sky ?? mixHex(0x0c1428, 0x9dc4e8, day));
      uniforms.uHorizonColor.value.setHex(palette?.fog ?? mixHex(0x141c30, 0xd8e6f2, day));
      uniforms.uGroundColor.value.setHex(mixHex(0x0a0e14, 0x63705f, day));
      uniforms.uWind.value.set(this.weather.wind * 0.0025, 0.00012, this.weather.wind * 0.0018);
      this.clouds.position.set(cameraPosition.x, 0, cameraPosition.z);
      this.clouds.visible = uniforms.uCoverage.value > 0.02;
      // Fog colour follows the sky, which is what makes distance read as air.
    }

    // ---- weather particles ----
    this._updatePrecipitation(dt, cameraPosition);

    // ---- lightning ----
    this.flash = damp(this.flash, 0, 7, dt);
    this.lightningLight.intensity = this.flash * 9;
    if (this.flash > 0.02) {
      this.lightningLight.position.set(cameraPosition.x + this.rng.range(-400, 400), 600, cameraPosition.z + this.rng.range(-400, 400));
    }
    if (this.weather.state === 'storm' && this.weather.rain > 0.5) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.range(6, 22);
        this.strikeLightning({ power: this.rng.range(0.6, 1.3) });
      }
    }

    // ---- fog ----
    if (this.scene.fog) {
      const fogColor = palette?.fog ?? mixHex(0x0a1020, 0xbfd6e6, day);
      this.scene.fog.color.setHex(fogColor);
      this.scene.fog.color.lerp(new Color(mixHex(0x0a1020, 0xffb98a, clamp01(sunset * 0.55))), clamp01(sunset * 0.35));
      if (this.scene.fog.isFogExp2) {
        this.scene.fog.density = damp(this.scene.fog.density, this.weather.fogDensity, 0.25, dt);
      } else {
        const density = this.weather.fogDensity;
        const visibility = clamp(1 / Math.max(0.00035, density), 600, 9000);
        this.scene.fog.near = damp(this.scene.fog.near, visibility * 0.12, 0.4, dt);
        this.scene.fog.far = damp(this.scene.fog.far, visibility, 0.4, dt);
      }
    }
  }

  _updatePrecipitation(dt, cameraPosition) {
    const rainStrength = this.weather.rain;
    const snowStrength = this.weather.target === 'snow' ? this.weather.rain : 0;
    this._driveField(this.rain, rainStrength, dt, cameraPosition, { drift: this.weather.wind * 26, fall: 1 });
    this._driveField(this.snow, Math.max(snowStrength, this.weather.state === 'snow' ? 0.6 : 0), dt, cameraPosition, {
      drift: this.weather.wind * 6,
      fall: 1,
    });
  }

  _driveField(field, strength, dt, cameraPosition, { drift = 0, fall = 1 } = {}) {
    if (!field) return;
    field.points.visible = strength > 0.02;
    field.material.uniforms.uOpacity.value = damp(field.material.uniforms.uOpacity.value, strength * 0.85, 1.5, dt);
    if (!field.points.visible) return;
    field.points.position.set(cameraPosition.x, cameraPosition.y - 1, cameraPosition.z);
    const positions = field.positions;
    const size = 120;
    for (let i = 0; i < field.count; i++) {
      const iy = i * 3 + 1;
      positions[iy] -= field.speeds[i] * dt * fall;
      positions[i * 3] += drift * dt;
      if (positions[iy] < -20) {
        positions[iy] += 180;
        positions[i * 3] = field.material ? this.rng.range(-size, size) : 0;
        positions[i * 3 + 2] = this.rng.range(-size, size);
      }
      if (positions[i * 3] > size) positions[i * 3] -= size * 2;
      if (positions[i * 3] < -size) positions[i * 3] += size * 2;
    }
    field.geometry.attributes.position.needsUpdate = true;
  }

  /** Weather presets for a realm, applied on entry. */
  applyRealmWeather(realm) {
    const table = {
      valley: 'clear',
      void: 'mist',
      backrooms: 'mist',
      maze: 'clear',
      fractal: 'mist',
      singularity: 'ash',
      midnight: 'rain',
      heaven: 'clear',
      microverse: 'mist',
      colossus: 'storm',
      cities: 'clear',
      deep: 'clear',
    };
    const state = table[realm?.id] || 'clear';
    this.setWeather(state, { immediate: false });
    if (realm?.gravity !== undefined && realm.gravity < 0.4) this.setWeather('mist', { immediate: false });
    return state;
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
      else child.material?.dispose?.();
    });
    for (const field of [this.rain, this.snow]) {
      if (!field) continue;
      this.scene.remove(field.points);
      field.geometry.dispose();
      field.material.dispose();
    }
    this.scene.remove(this.sunLight, this.sunLight.target, this.sun2Light, this.hemiLight, this.ambient, this.lightningLight);
    for (const moon of this.moons) this.scene.remove(moon.light);
    for (const body of [this.sunLight.target]) void body;
  }
}
