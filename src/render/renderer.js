/**
 * THE MULTIVERSE — render/renderer.js
 * ==================================================================
 * THE RENDER FACADE. Owns the WebGLRenderer, the camera, the shadow rig and
 * the post-processing chain, and exposes one method — `render(dt, context)` —
 * to the game loop.
 *
 * Notable pieces:
 *  • A player-following shadow camera: the sun's shadow frustum is re-fitted
 *    around the player every frame, which is what makes a 4 km draw distance
 *    affordable without cascades.
 *  • PMREM environment capture from the sky dome, refreshed as the day turns,
 *    so PBR materials reflect the actual colour of the actual sky.
 *  • Adaptive resolution + effect tiers (quality.js).
 *  • Screenshot + FPS sampling for the UI.
 */
import {
  ACESFilmicToneMapping,
  Color,
  LinearSRGBColorSpace,
  NoToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
} from 'three';
import { Sky as ThreeSky } from 'three/addons/objects/Sky.js';
import { PostProcessing } from './post.js';
import { createAdaptiveController, createPerfMonitor, TIERS } from './quality.js';
import { clamp } from '../core/math.js';

export class Renderer {
  constructor({ canvas, settings, quality, textures, seed = 1337 }) {
    this.settings = settings;
    this.textures = textures;
    this.seed = seed;
    this.quality = { ...quality };

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // the composer's SMAA/FXAA does this better
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(new Color(0x0b1220), 1);
    this.renderer.shadowMap.enabled = !!this.quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.info.autoReset = false;

    this.pixelRatioCap = this.quality.pixelRatioCap ?? 1.5;
    this.renderScale = this.quality.renderScale ?? 1;

    this.camera = new PerspectiveCamera(settings?.get('fov') ?? 78, 1, 0.15, 26000);
    this.camera.position.set(0, 12, 24);

    // The renderer owns the scene: everything built during boot (sky, valley,
    // realities) hangs off it, so it must exist before any of them do.
    this.scene = new Scene();
    this.scene.name = 'multiverse';
    this.sky = null;
    this.post = null;
    this.postEnabled = true;
    this.environmentTarget = null;
    this.pmrem = new PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this.envScene = new Scene();
    this.envTimer = 0;
    this.envInterval = 18;

    this.perf = createPerfMonitor(150);
    this.adaptive = createAdaptiveController({
      targetMs: this.quality.targetFrameMs ?? 1000 / 60,
      minScale: 0.5,
      maxScale: 1,
    });
    this.adaptiveEnabled = this.quality.autoQuality !== false && (settings?.get('autoQuality') ?? true);

    this.frame = 0;
    this.size = new Vector2(1, 1);
    this._statsAccum = 0;
    this._onStats = null;
  }

  /** Bind the scene, sky and post chain once they exist. */
  attach({ scene, sky, onStats }) {
    if (scene) this.scene = scene;
    this.sky = sky;
    this._onStats = onStats;
    if (this.quality.postAA !== 'none' && this.quality.bloom !== undefined) {
      this.postEnabled = true;
      this.post = new PostProcessing({
        renderer: this.renderer,
        scene,
        camera: this.camera,
        quality: this.quality,
        settings: this.settings,
        textures: this.textures,
      });
    }
    this.resize();
    this.captureEnvironment();
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Sizing
   * ---------------------------------------------------------------- */

  resize(width = window.innerWidth, height = window.innerHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    const scale = clamp(this.renderScale, 0.35, 2);
    const drawWidth = Math.max(320, Math.floor(width * dpr * scale));
    const drawHeight = Math.max(240, Math.floor(height * dpr * scale));

    this.size.set(width, height);
    this.renderer.setPixelRatio(1); // we control the buffer size directly
    this.renderer.setSize(width, height, true);
    this.renderer.domElement.width = drawWidth;
    this.renderer.domElement.height = drawHeight;
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.renderer.setViewport(0, 0, drawWidth, drawHeight);

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.post?.setSize(width, height, 1);
    return this;
  }

  setFov(fov) {
    this.camera.fov = clamp(fov, 40, 130);
    this.camera.updateProjectionMatrix();
  }

  /** Apply a settings change (quality toggles rebuild the composer). */
  applyQuality(quality) {
    const needsRebuild =
      quality.postAA !== this.quality.postAA ||
      quality.bloom !== this.quality.bloom ||
      quality.ssao !== this.quality.ssao ||
      quality.ssr !== this.quality.ssr ||
      quality.dof !== this.quality.dof ||
      quality.motionBlur !== this.quality.motionBlur ||
      quality.godrays !== this.quality.godrays;

    this.quality = { ...quality };
    this.pixelRatioCap = quality.pixelRatioCap ?? this.pixelRatioCap;
    this.renderer.shadowMap.enabled = !!quality.shadows;
    this.renderer.toneMapping = quality.toneMapping === false ? NoToneMapping : ACESFilmicToneMapping;

    if (needsRebuild && this.scene) {
      this.post?.dispose();
      this.post = new PostProcessing({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        quality: this.quality,
        settings: this.settings,
        textures: this.textures,
      });
      this.postEnabled = true;
    }
    this.resize();
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Shadows: a single light, re-fitted around the player each frame
   * ---------------------------------------------------------------- */

  updateShadowFrustum(playerPosition, sunDirection) {
    if (!this.sky?.sunLight) return;
    const light = this.sky.sunLight;
    const extent = clamp(this.quality.shadowDistance ?? 150, 40, 400);
    light.shadow.camera.left = -extent;
    light.shadow.camera.right = extent;
    light.shadow.camera.top = extent;
    light.shadow.camera.bottom = -extent;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = extent * 4 + 600;
    light.shadow.camera.updateProjectionMatrix();

    // Snap the shadow centre to texel-sized steps: no crawling shadows.
    const texelSize = (extent * 2) / (this.quality.shadowMapSize ?? 2048);
    const snap = (v) => Math.round(v / texelSize) * texelSize;
    const target = new Vector3(snap(playerPosition.x), snap(playerPosition.y), snap(playerPosition.z));
    light.target.position.copy(target);
    light.position.copy(target).addScaledVector(sunDirection, extent * 2.2);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();

    if (this.sky.sun2Light) {
      const extent2 = extent * 1.6;
      void extent2;
    }
  }

  /* ---------------------------------------------------------------- *
   * Environment (PBR reflections of the actual sky)
   * ---------------------------------------------------------------- */

  captureEnvironment() {
    if (!this.sky) return null;
    try {
      // Render a copy of the sky dome into a PMREM cube for IBL.
      if (!this._envSky) {
        this._envSky = new ThreeSky();
        this._envSky.scale.setScalar(60000);
        this.envScene.add(this._envSky);
      }
      const u = this.sky.sky.material.uniforms;
      const e = this._envSky.material.uniforms;
      e.turbidity.value = u.turbidity.value;
      e.rayleigh.value = u.rayleigh.value;
      e.mieCoefficient.value = u.mieCoefficient.value;
      e.mieDirectionalG.value = u.mieDirectionalG.value;
      e.sunPosition.value.copy(u.sunPosition.value);
      if (e.showSunDisc) e.showSunDisc.value = 0;
      const previous = this.environmentTarget;
      this.environmentTarget = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 1000);
      this.scene.environment = this.environmentTarget.texture;
      this.scene.environmentIntensity = clamp(this.quality.envIntensity ?? 0.85, 0, 2);
      previous?.dispose();
      return this.environmentTarget;
    } catch (err) {
      console.warn('[renderer] environment capture failed', err);
      return null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Frame
   * ---------------------------------------------------------------- */

  /**
   * @param {number} dt seconds
   * @param {object} context gameplay state (see PostProcessing.render)
   */
  render(dt, context = {}) {
    this.frame++;
    const started = performance.now();

    this.envTimer += dt;
    if (this.envTimer > this.envInterval) {
      this.envTimer = 0;
      this.captureEnvironment();
    }

    this.renderer.info.reset();
    if (this.post && this.postEnabled !== false) {
      this.post.render(dt, context);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    const frameMs = performance.now() - started;
    this.perf.push(frameMs, dt);

    if (this.adaptiveEnabled) {
      const changed = this.adaptive.update(frameMs, dt);
      if (changed) {
        this.renderScale = this.adaptive.scale;
        // Degrade a *copy* and hand it to applyQuality, which is the only
        // thing that knows how to rebuild the post chain. Mutating
        // `this.quality` in place would describe the change to nobody: the
        // expensive passes are baked into the composer at construction, so
        // turning them off in a plain object looks like it works and does not.
        const next = { ...this.quality };
        this.adaptive.applyTo(next);
        this.applyQuality(next);
        this._onStats?.({ type: 'quality', tier: this.adaptive.tierName, scale: this.renderScale });
      }
    }

    this._statsAccum += dt;
    if (this._statsAccum > 0.5) {
      this._statsAccum = 0;
      this._onStats?.({
        type: 'frame',
        fps: this.perf.fps,
        frameMs: this.perf.frameMs,
        worstMs: this.perf.worstMs,
        tier: this.adaptive.tierName,
        scale: this.renderScale,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        programs: this.renderer.info.programs?.length ?? 0,
        textures: this.renderer.info.memory.textures,
        geometries: this.renderer.info.memory.geometries,
      });
    }
  }

  /**
   * Render an arbitrary scene with an arbitrary camera, bypassing the post
   * chain. Used by the opening cinematic and the menu backdrop, which have
   * their own scene graphs.
   */
  renderScene(scene, camera) {
    this.renderer.info.reset();
    this.renderer.render(scene, camera);
  }

  /** Screen-space UV of a world position (for god rays / lens flare / UI). */
  projectToScreen(position, out = new Vector2()) {
    const v = position.clone().project(this.camera);
    out.set((v.x + 1) / 2, (v.y + 1) / 2);
    return { uv: out, visible: v.z < 1 && Math.abs(v.x) < 1.4 && Math.abs(v.y) < 1.4 };
  }

  screenshot(type = 'image/png') {
    try {
      return this.renderer.domElement.toDataURL(type);
    } catch (err) {
      console.warn('[renderer] screenshot failed (canvas may be tainted)', err);
      return null;
    }
  }

  get info() {
    return this.renderer.info;
  }

  dispose() {
    this.post?.dispose();
    this.environmentTarget?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}

export { TIERS };
