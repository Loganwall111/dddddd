/**
 * THE MULTIVERSE — render/cinematic.js
 * ==================================================================
 * THE OPENING, IN PICTURES.
 *
 * A self-contained stage that renders the pre-life sequence: atom dust in an
 * empty universe, the first burst of energy radiating outward, a field of
 * galaxies, the blue world that is about to end, the rock that ends it, the
 * LODEMUS lattice holding a person as light — and then the same stage keeps
 * running behind the main menu as a slow flight through everything.
 *
 * The stage owns its own scene, camera and timeline. The game simply calls
 * stage.update(dt) and draws it (via Renderer.renderScene) until the player
 * presses PLAY.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp, clamp01, damp, lerp, remap, smoothstep } from '../core/math.js';
import { Rng } from '../core/rand.js';
import { createSpriteMaterial } from './shaders.js';

export const INTRO_PHASES = ['title', 'dust', 'burst', 'galaxies', 'earth', 'meteor', 'machine', 'plug', 'simolysis', 'menu'];

/* ------------------------------------------------------------------ *
 * Shaders used only by the opening
 * ------------------------------------------------------------------ */

const BURST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uExpand;
  uniform float uSeed;
  attribute float aDelay;
  attribute float aSpeed;
  attribute float aSize;
  varying float vAlpha;
  varying float vLife;

  void main() {
    float t = max(0.0, uTime - aDelay);
    float life = clamp(t / 6.0, 0.0, 1.0);
    vLife = life;
    vec3 dir = normalize(position + vec3(0.0001));
    float radius = aSpeed * uExpand * pow(life, 0.72);
    vec3 pos = dir * radius;
    // a little turbulence so the shock front is not a perfect ball
    pos.x += sin(aSeed * 31.0 + uTime * 1.7) * radius * 0.035;
    pos.y += cos(aSeed * 17.0 + uTime * 1.3) * radius * 0.035;
    pos.z += sin(aSeed * 47.0 + uTime * 1.1) * radius * 0.035;
    vAlpha = (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.06, life);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (300.0 / max(1.0, -mv.z)) * (0.4 + life);
  }
`;

const BURST_FRAG = /* glsl */ `
  uniform vec3 uColorHot;
  uniform vec3 uColorCool;
  varying float vAlpha;
  varying float vLife;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 2.4);
    vec3 color = mix(uColorHot, uColorCool, vLife);
    gl_FragColor = vec4(color * (1.6 + vLife * 0.6), glow * vAlpha);
  }
`;

const SHELL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 2.6);
    float ripple = 0.85 + 0.15 * sin(vNormal.x * 22.0 + uTime * 3.0);
    gl_FragColor = vec4(uColor * (0.6 + fresnel * 2.2) * ripple, fresnel * uOpacity);
  }
`;

const GALAXY_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uArm;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float radius = length(uv) * 2.0;
    float angle = atan(uv.y, uv.x);
    // logarithmic spiral arms
    float spiral = sin(angle * 2.0 + log(max(radius, 0.04)) * 3.4 - uTime * 0.12 + uSeed);
    float arms = pow(0.5 + 0.5 * spiral, 3.0);
    float core = exp(-radius * radius * 9.0);
    float disk = exp(-radius * 2.2) * (0.35 + arms * 1.5);
    float grain = hash(floor(vUv * 220.0));
    float dust = 0.75 + 0.25 * grain;
    vec3 color = mix(uArm, uCore, clamp(core * 2.0, 0.0, 1.0));
    float alpha = clamp((core * 1.6 + disk) * dust, 0.0, 1.5) * smoothstep(1.0, 0.35, radius);
    gl_FragColor = vec4(color * alpha * 1.4, alpha);
  }
`;

const GALAXY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    pos.x += sin(uTime * 0.12 + aPhase) * 4.0;
    pos.y += cos(uTime * 0.09 + aPhase * 1.3) * 4.0;
    pos.z += sin(uTime * 0.07 + aPhase * 0.7) * 4.0;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = uSize * aScale * (260.0 / max(1.0, dist));
    vAlpha = clamp(1.6 - dist / 260.0, 0.0, 1.0) * (0.35 + 0.65 * aScale);
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 3.0);
    gl_FragColor = vec4(uColor, glow * vAlpha * uOpacity);
  }
`;

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

export class CinematicStage {
  constructor({ textures, quality = {}, seed = 1337 } = {}) {
    this.textures = textures;
    this.quality = quality;
    this.seed = seed >>> 0;
    this.rng = new Rng(seed);
    this.scene = null;
    this.meteorTrail = [];
    this.machineRings = [];
    this.time = 0;
    this.phase = 'title';
    this.phaseTime = 0;
    this.handheld = { x: 0, y: 0, z: 0 };
    this.build();
  }

  build() {
    this.scene = this._makeScene();
    this.camera = this._makeCamera();
    const rng = this.rng;

    /* ---------------------------- dust ---------------------------- */
    const dustCount = clamp(Math.round((this.quality.particles ?? 1) * 90000), 4000, 220000);
    const dustGeometry = new BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustScales = new Float32Array(dustCount);
    const dustPhases = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      const radius = 30 + Math.pow(rng.float(), 2.2) * 900;
      const theta = rng.angle();
      const phi = Math.acos(rng.range(-1, 1));
      dustPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      dustPositions[i * 3 + 1] = Math.cos(phi) * radius * 0.7;
      dustPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      dustScales[i] = lerp(0.2, 1.4, Math.pow(rng.float(), 3));
      dustPhases[i] = rng.float() * Math.PI * 2;
    }
    dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('aScale', new BufferAttribute(dustScales, 1));
    dustGeometry.setAttribute('aPhase', new BufferAttribute(dustPhases, 1));
    this.dustUniforms = {
      uTime: { value: 0 },
      uSize: { value: 26 },
      uColor: { value: new Color(0xd8e6ff) },
      uOpacity: { value: 0 },
    };
    this.dust = new Points(
      dustGeometry,
      new ShaderMaterial({
        uniforms: this.dustUniforms,
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    /* ---------------------------- burst ---------------------------- */
    const burstCount = clamp(Math.round((this.quality.particles ?? 1) * 24000), 2000, 40000);
    const burstGeometry = new BufferGeometry();
    const burstPositions = new Float32Array(burstCount * 3);
    const burstDelay = new Float32Array(burstCount);
    const burstSpeed = new Float32Array(burstCount);
    const burstSize = new Float32Array(burstCount);
    for (let i = 0; i < burstCount; i++) {
      const theta = rng.angle();
      const phi = Math.acos(rng.range(-1, 1));
      burstPositions[i * 3] = Math.sin(phi) * Math.cos(theta);
      burstPositions[i * 3 + 1] = Math.cos(phi);
      burstPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
      burstDelay[i] = Math.pow(rng.float(), 0.6) * 1.6;
      burstSpeed[i] = lerp(60, 1800, Math.pow(rng.float(), 1.6));
      burstSize[i] = lerp(2, 12, Math.pow(rng.float(), 2));
    }
    burstGeometry.setAttribute('position', new BufferAttribute(burstPositions, 3));
    burstGeometry.setAttribute('aDelay', new BufferAttribute(burstDelay, 1));
    burstGeometry.setAttribute('aSpeed', new BufferAttribute(burstSpeed, 1));
    burstGeometry.setAttribute('aSize', new BufferAttribute(burstSize, 1));
    this.burstUniforms = {
      uTime: { value: -1 },
      uExpand: { value: 1 },
      uSeed: { value: rng.float() * 100 },
      uColorHot: { value: new Color(0xffffff) },
      uColorCool: { value: new Color(0x7fb0ff) },
    };
    this.burst = new Points(
      burstGeometry,
      new ShaderMaterial({
        uniforms: this.burstUniforms,
        vertexShader: BURST_VERT,
        fragmentShader: BURST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      })
    );
    this.burst.frustumCulled = false;
    this.burst.visible = false;
    this.scene.add(this.burst);

    // the flash: a huge additive sphere at the origin
    this.flashUniforms = { uColor: { value: new Color(0xffffff) }, uOpacity: { value: 0 }, uTime: { value: 0 } };
    this.flashShell = new Mesh(
      new SphereGeometry(1, 32, 24),
      new ShaderMaterial({
        uniforms: this.flashUniforms,
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      })
    );
    this.flashShell.scale.setScalar(24);
    this.flashShell.visible = false;
    this.scene.add(this.flashShell);
    this.burstLight = new PointLight(0xffffff, 0, 4000, 1.4);
    this.scene.add(this.burstLight);

    /* --------------------------- galaxies --------------------------- */
    this.galaxies = new Group();
    const galaxySprite = new SpriteMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const galaxyTexture = this.textures?.nebula?.() ?? null;
    if (galaxyTexture) galaxySprite.map = galaxyTexture;
    const galaxyCount = clamp(Math.round((this.quality.particles ?? 1) * 90), 24, 160);
    for (let i = 0; i < galaxyCount; i++) {
      const sprite = new Sprite(galaxySprite);
      const radius = lerp(900, 5200, Math.pow(rng.float(), 0.7));
      const theta = rng.angle();
      const phi = Math.acos(rng.range(-0.85, 0.85));
      sprite.position.set(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius * 0.8,
        Math.sin(phi) * Math.sin(theta) * radius
      );
      const size = lerp(260, 1500, Math.pow(rng.float(), 1.4));
      sprite.scale.setScalar(size);
      sprite.material = galaxySprite.clone();
      const tint = new Color().setHSL(rng.range(0.5, 0.82), rng.range(0.3, 0.8), rng.range(0.55, 0.85));
      sprite.material.color.copy(tint);
      sprite.material.opacity = 0.55;
      sprite.userData = { spin: rng.range(-0.4, 0.4), phase: rng.float() * 100 };
      this.galaxies.add(sprite);
    }

    // A hero galaxy: a real spiral drawn with a shader, so it reads as a disc.
    this.heroGalaxy = new Mesh(
      new RingGeometry(1, 220, 96, 1),
      new ShaderMaterial({
        uniforms: {
          uCore: { value: new Color(0xffe9c0) },
          uArm: { value: new Color(0x6fa8ff) },
          uTime: { value: 0 },
          uSeed: { value: rng.float() * 10 },
        },
        vertexShader: GALAXY_VERT,
        fragmentShader: GALAXY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      })
    );
    this.heroGalaxy.rotation.x = -1.05;
    this.heroGalaxy.position.set(1400, 900, -2600);
    this.heroGalaxy.visible = false;
    this.scene.add(this.heroGalaxy);

    /* ---------------------------- earth ---------------------------- */
    this.earthGroup = new Group();
    this.earthGroup.visible = false;
    const planetPalette = ['#2d6fb0', '#0d3f6b', '#7fc4e8'];
    const planetTexture = this.textures?.planet?.(3, { palette: planetPalette }) ?? null;
    const cloudsTexture = this.textures?.surface ? this.textures.surface('snow', { seed: 99 }).map : null;
    this.earth = new Mesh(
      new SphereGeometry(300, 96, 64),
      new MeshStandardMaterial({
        map: planetTexture,
        roughness: 0.82,
        metalness: 0.02,
        emissive: new Color(0x0a1b2e),
        emissiveIntensity: 0.25,
      })
    );
    this.earthGroup.add(this.earth);
    const cloudLayer = new Mesh(
      new SphereGeometry(303, 64, 48),
      new MeshStandardMaterial({
        map: cloudsTexture,
        transparent: true,
        opacity: 0.42,
        roughness: 1,
        depthWrite: false,
      })
    );
    cloudLayer.rotation.z = 0.3;
    this.cloudLayer = cloudLayer;
    this.earthGroup.add(cloudLayer);
    const atmosphere = new Mesh(
      new SphereGeometry(330, 48, 32),
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color(0x6fb4ff) }, uOpacity: { value: 1 }, uTime: { value: 0 } },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
      })
    );
    this.atmosphere = atmosphere;
    this.earthGroup.add(atmosphere);
    const sun = new PointLight(0xfff2d8, 9000, 8000, 1.2);
    sun.position.set(-1400, 600, 1600);
    this.earthGroup.add(sun);
    this.earthLight = sun;
    this.earthGroup.position.set(0, 0, 0);
    this.scene.add(this.earthGroup);

    /* --------------------------- meteor --------------------------- */
    this.meteorGroup = new Group();
    this.meteorGroup.visible = false;
    const meteorRock = new Mesh(
      new SphereGeometry(26, 24, 18),
      new MeshStandardMaterial({ color: 0x2b2320, roughness: 0.95, emissive: 0xff5a1e, emissiveIntensity: 0.7 })
    );
    // deform into a rock
    {
      const position = meteorRock.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const scale = 1 + (this.rng.float() - 0.5) * 0.42;
        position.setXYZ(i, position.getX(i) * scale, position.getY(i) * scale, position.getZ(i) * scale);
      }
      meteorRock.geometry.computeVertexNormals();
    }
    this.meteorGroup.add(meteorRock);
    this.meteor = meteorRock;
    const trail = createSpriteMaterial(this.textures?.sprite?.('glow', { size: 256 }) ?? null, {
      color: 0xffa050,
      opacity: 0.85,
      additive: true,
      emissive: 2,
    });
    this.trailMaterial = trail;
    for (let i = 0; i < 90; i++) {
      const sprite = new Sprite(trail.clone());
      const t = i / 90;
      sprite.position.set(t * 700, Math.sin(t * 6) * 12, Math.cos(t * 4) * 8);
      sprite.scale.setScalar(lerp(120, 24, t));
      this.meteorTrail.push(sprite);
      this.meteorGroup.add(sprite);
    }
    const meteorLight = new PointLight(0xff7a30, 4000, 3000, 1.6);
    this.meteorGroup.add(meteorLight);
    this.meteorLight = meteorLight;
    this.meteorGroup.position.set(-2600, 900, -1800);
    this.scene.add(this.meteorGroup);

    /* --------------------------- machine --------------------------- */
    this.machineGroup = new Group();
    this.machineGroup.visible = false;
    const latticeMaterial = new MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.5, blending: AdditiveBlending, wireframe: true });
    for (let i = 0; i < 5; i++) {
      const ring = new Mesh(new TorusGeometry(40 + i * 16, 0.6, 6, 64), latticeMaterial);
      ring.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
      this.machineGroup.add(ring);
      this.machineRings.push(ring);
    }
    const core = new Mesh(
      new SphereGeometry(14, 32, 24),
      new MeshStandardMaterial({ color: 0xdff6ff, emissive: 0x9fe8ff, emissiveIntensity: 3, roughness: 0.2, transparent: true, opacity: 0.9 })
    );
    this.machineGroup.add(core);
    this.machineCore = core;
    const machineLight = new PointLight(0x9fe8ff, 3000, 1200, 2);
    this.machineGroup.add(machineLight);
    this.machineLight = machineLight;
    this.machineGroup.position.set(0, 0, -400);
    this.scene.add(this.machineGroup);

    /* ------------------------- starfield ------------------------- */
    const starSprite = createSpriteMaterial(this.textures?.stars?.() ?? null, { color: 0xffffff, opacity: 0.9, additive: true });
    this.starMaterial = starSprite;
    const starCount = clamp(Math.round((this.quality.particles ?? 1) * 9000), 800, 30000);
    const starGeometry = new BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starOpacities = new Float32Array(starCount);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = lerp(3000, 9000, Math.pow(this.rng.float(), 0.5));
      const theta = this.rng.angle();
      const phi = Math.acos(this.rng.range(-1, 1));
      starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = Math.cos(phi) * radius;
      starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      starSizes[i] = lerp(20, 140, Math.pow(this.rng.float(), 4));
      starOpacities[i] = lerp(0.2, 1, Math.pow(this.rng.float(), 2));
      const tint = new Color().setHSL(this.rng.range(0.5, 0.7), this.rng.range(0, 0.5), this.rng.range(0.7, 1));
      starColors[i * 3] = tint.r;
      starColors[i * 3 + 1] = tint.g;
      starColors[i * 3 + 2] = tint.b;
    }
    starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aSize', new BufferAttribute(starSizes, 1));
    starGeometry.setAttribute('aOpacity', new BufferAttribute(starOpacities, 1));
    starGeometry.setAttribute('aColor', new BufferAttribute(starColors, 3));
    this.stars = new Points(starGeometry, starSprite);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.camera.position.set(0, 6, 220);
    this.camera.lookAt(0, 0, 0);
  }

  _makeScene() {
    return new Scene();
  }

  _makeCamera() {
    return new PerspectiveCamera(58, 16 / 9, 0.1, 22000);
  }

  /* ---------------------------------------------------------------- *
   * Timeline
   * ---------------------------------------------------------------- */

  setPhase(phase, { time = 0 } = {}) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.phaseTime = time;
    switch (phase) {
      case 'title':
        this.dust.visible = true;
        this.burst.visible = false;
        this.flashShell.visible = false;
        this.earthGroup.visible = false;
        this.meteorGroup.visible = false;
        this.machineGroup.visible = false;
        this.heroGalaxy.visible = false;
        this.camera.position.set(0, 6, 220);
        break;
      case 'dust':
        this.dust.visible = true;
        this.dustUniforms.uOpacity.value = 1;
        this.dustUniforms.uSize.value = 34;
        this.burst.visible = false;
        this.camera.position.set(0, 0, 60);
        break;
      case 'burst':
        this.burst.visible = true;
        this.flashShell.visible = true;
        this.burstUniforms.uTime.value = 0;
        this.camera.position.set(0, 0, 150);
        break;
      case 'galaxies':
        this.heroGalaxy.visible = true;
        this.burst.visible = false;
        this.flashShell.visible = false;
        this.dustUniforms.uOpacity.value = 0.6;
        this.camera.position.set(600, 400, 1600);
        break;
      case 'earth':
        this.earthGroup.visible = true;
        this.earthGroup.position.set(0, 0, 0);
        this.camera.position.set(0, 260, 1500);
        break;
      case 'meteor':
        this.earthGroup.visible = true;
        this.meteorGroup.visible = true;
        this.camera.position.set(-900, 500, 900);
        break;
      case 'machine':
        this.machineGroup.visible = true;
        this.machineGroup.visible = true;
        this.earthGroup.visible = false;
        this.meteorGroup.visible = false;
        this.camera.position.set(0, 40, 320);
        break;
      case 'plug':
        this.machineGroup.visible = true;
        this.camera.position.set(0, 10, 120);
        break;
      case 'simolysis':
        this.machineGroup.visible = true;
        this.dustUniforms.uOpacity.value = 1;
        this.dustUniforms.uSize.value = 48;
        this.camera.position.set(0, 0, 90);
        break;
      case 'menu':
        this.machineGroup.visible = true;
        this.heroGalaxy.visible = true;
        this.dust.visible = true;
        this.dustUniforms.uOpacity.value = 0.75;
        this.camera.position.set(0, 0, 420);
        this.camera.lookAt(0, 0, 0);
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, { phase = null, phaseTime = null, lookAt = null } = {}) {
    this.time += dt;
    if (phase && phase !== this.phase) this.setPhase(phase, { time: phaseTime ?? 0 });
    this.phaseTime += dt;

    const t = this.time;

    // handheld camera drift: never perfectly still
    this.handheld.x = Math.sin(t * 0.31) * 6 + Math.sin(t * 0.87) * 2;
    this.handheld.y = Math.cos(t * 0.23) * 4 + Math.sin(t * 1.13) * 1.5;
    this.handheld.z = Math.sin(t * 0.17) * 5;

    this.dustUniforms.uTime.value = t;
    this.dust.rotation.y += dt * 0.004;
    this.stars.rotation.y += dt * 0.002;

    for (const sprite of this.galaxies.children) {
      sprite.rotation.z += dt * 0.02 * sprite.userData.spin;
      const base = sprite.scale.x;
      sprite.material.rotation = sprite.userData.phase + t * 0.02;
      sprite.scale.setScalar(base * (1 + Math.sin(t * 0.4 + sprite.userData.phase) * 0.01));
    }
    this.heroGalaxy.material.uniforms.uTime.value = t;

    switch (this.phase) {
      case 'title': {
        this.camera.position.z = damp(this.camera.position.z, 160, 0.6, dt);
        this.dustUniforms.uOpacity.value = clamp01(this.phaseTime / 3) * 0.7;
        break;
      }
      case 'dust': {
        this.camera.position.z = damp(this.camera.position.z, 24, 0.35, dt);
        this.dustUniforms.uSize.value = damp(this.dustUniforms.uSize.value, 46, 0.4, dt);
        this.dustUniforms.uColor.value.lerp(new Color(0xffe6c0), dt * 0.05);
        break;
      }
      case 'burst': {
        const local = Math.max(0, this.phaseTime - 0.4);
        this.burstUniforms.uTime.value = local;
        this.burstUniforms.uExpand.value = 1;
        this.flashUniforms.uTime.value = t;
        const flash = Math.max(0, 1 - local / 3.2);
        this.flashUniforms.uOpacity.value = flash * 1.6;
        this.flashShell.scale.setScalar(24 + local * 1400);
        this.burstLight.intensity = flash * 24000;
        this.camera.position.z = damp(this.camera.position.z, -220, 0.5, dt);
        break;
      }
      case 'galaxies': {
        this.camera.position.x = 600 + Math.sin(t * 0.05) * 400;
        this.camera.position.y = 400 + Math.cos(t * 0.04) * 260;
        this.camera.position.z = damp(this.camera.position.z, -600, 0.15, dt);
        for (const sprite of this.galaxies.children) {
          const fade = clamp01(this.phaseTime / 4);
          sprite.material.opacity = 0.55 * fade;
        }
        break;
      }
      case 'earth': {
        this.camera.position.set(Math.sin(t * 0.05) * 200, 260 + Math.cos(t * 0.07) * 60, damp(this.camera.position.z, 1180, 0.3, dt));
        this.earth.rotation.y += dt * 0.02;
        this.cloudLayer.rotation.y += dt * 0.028;
        this.atmosphere.material.uniforms.uTime.value = t;
        break;
      }
      case 'meteor': {
        const impact = this.phaseTime * 190;
        this.meteorGroup.position.set(-2600 + impact, 900 - impact * 0.42, -1800 + impact * 0.55);
        this.meteorGroup.lookAt(0, 0, 0);
        this.meteor.rotation.x += dt * 0.4;
        this.meteor.rotation.z += dt * 0.25;
        this.meteorLight.intensity = 3000 + Math.sin(t * 12) * 800;
        for (let i = 0; i < this.meteorTrail.length; i++) {
          const sprite = this.meteorTrail[i];
          sprite.position.x = -i * 9;
          sprite.scale.setScalar(lerp(120, 20, (i / this.meteorTrail.length + (t * 0.4) % 1) % 1));
        }
        this.earth.rotation.y += dt * 0.02;
        break;
      }
      case 'machine': {
        this.camera.position.z = damp(this.camera.position.z, 140, 0.5, dt);
        this.camera.position.x = Math.sin(t * 0.12) * 60;
        this.camera.position.y = 40 + Math.cos(t * 0.16) * 30;
        this.machineGroup.rotation.y += dt * 0.22;
        for (const ring of this.machineRings ?? []) {
          ring.rotation.x += dt * 0.1;
          ring.rotation.y += dt * 0.14;
        }
        this.machineCore.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06);
        this.machineLight.intensity = 2400 + Math.sin(t * 2.2) * 800;
        break;
      }
      case 'plug': {
        this.camera.position.z = damp(this.camera.position.z, 46, 0.5, dt);
        this.camera.position.y = damp(this.camera.position.y, 6, 0.4, dt);
        this.machineGroup.rotation.y += dt * 0.35;
        for (let i = 0; i < 6; i++) {
          const ring = this.machineRings?.[i % (this.machineRings?.length ?? 1)];
          if (ring) ring.rotation.z += dt * (0.2 + i * 0.05);
        }
        this.flashUniforms.uOpacity.value = damp(this.flashUniforms.uOpacity.value, 0, 2, dt);
        break;
      }
      case 'simolysis': {
        this.camera.position.z = damp(this.camera.position.z, -60, 0.35, dt);
        this.dustUniforms.uOpacity.value = 1;
        this.dustUniforms.uColor.value.lerp(new Color(0xffffff), dt * 0.2);
        this.dustUniforms.uSize.value = damp(this.dustUniforms.uSize.value, 60, 0.4, dt);
        this.machineGroup.rotation.y += dt * 0.1;
        break;
      }
      case 'menu':
      default: {
        // A slow orbit around the lattice; the menu sits on top of it.
        const radius = 520 + Math.sin(t * 0.05) * 60;
        this.camera.position.set(Math.sin(t * 0.03) * radius * 0.35, Math.sin(t * 0.02) * 120, radius);
        const target = lookAt ?? { x: 0, y: 0, z: 0 };
        this.camera.lookAt(target.x ?? target[0] ?? 0, target.y ?? target[1] ?? 0, target.z ?? target[2] ?? 0);
        this.machineGroup.rotation.y += dt * 0.03;
        break;
      }
    }

    // Everything but the menu gets the handheld drift for a documentary feel.
    if (this.phase !== 'menu') {
      this.camera.position.x += this.handheld.x * dt * 0.6;
      this.camera.position.y += this.handheld.y * dt * 0.6;
      this.camera.position.z += this.handheld.z * dt * 0.6;
      const target = this._phaseLookTarget();
      this.camera.lookAt(target.x, target.y, target.z);
    }
    return this;
  }

  _phaseLookTarget() {
    switch (this.phase) {
      case 'earth':
        return { x: 0, y: 0, z: 0 };
      case 'meteor':
        return { x: -300, y: 120, z: -200 };
      case 'machine':
      case 'plug':
      case 'simolysis':
        return { x: 0, y: 0, z: -400 };
      case 'galaxies':
        return { x: 1400, y: 900, z: -2600 };
      default:
        return { x: 0, y: 0, z: 0 };
    }
  }

  /** A single, enormous push-in used when the player finally presses PLAY. */
  shockwave() {
    this.flashUniforms.uOpacity.value = 1.4;
    this.flashShell.scale.setScalar(20);
    this.burstUniforms.uTime.value = 0;
    this.burst.visible = true;
    this.phase = 'burst';
    this.phaseTime = 0;
    this.burstLight.intensity = 18000;
  }

  dispose() {
    this.scene.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
      else child.material?.dispose?.();
    });
  }
}
