/**
 * THE MULTIVERSE — render/post.js
 * ==================================================================
 * THE FRAME FINISHER. A single ordered pass chain that turns three.js'
 * render into something that reads as a AAA frame:
 *
 *   RenderPass
 *     → GTAO (ground-truth ambient occlusion, quality-gated)
 *     → SSR (screen-space reflections, quality-gated)
 *     → God rays (radial shafts from the sun)
 *     → UnrealBloom (emissive bleed, threshold tuned to the sky)
 *     → Depth of field (bokeh with a golden-angle spiral kernel)
 *     → Motion blur / speed smear
 *     → Gravity lens (black holes, wormholes, portals pulling the frame)
 *     → Glitch (backrooms, midnight, damage, machine speak)
 *     → Grade (LUT + realm tint + vignette + chromatic + grain + distortion)
 *     → SMAA / FXAA
 *     → OutputPass (tone mapping + colour space) — always last
 *
 * Every stage is switchable at runtime and bounded in cost, and the whole
 * composer renders at a reduced internal resolution when the QualityManager
 * asks it to.
 */
import {
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { DOF_SHADER, GLITCH_SHADER, GODRAY_SHADER, GRADE_SHADER, GRAVITY_LENS_SHADER, MOTION_SHADER } from './shaders.js';
import { clamp, damp, lerp } from '../core/math.js';

export class PostProcessing {
  constructor({ renderer, scene, camera, quality, settings, textures }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.settings = settings;
    this.textures = textures;
    this.enabled = quality.postAA !== 'none' || quality.bloom || quality.ssao || quality.dof;

    this.composer = new EffectComposer(renderer, this._makeTarget());
    this.composer.setPixelRatio(renderer.getPixelRatio());

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // ---- ambient occlusion ----
    if (quality.ssao) {
      try {
        this.ssao = new GTAOPass(scene, camera, 512, 512);
        this.ssao.output = GTAOPass.OUTPUT.Default;
        this.ssao.updateGtaoMaterial({
          radius: 0.6,
          distanceExponent: 1.2,
          thickness: 1.1,
          scale: 1.1,
          samples: quality.aoSamples ?? 16,
          distanceFallOff: 1.0,
          screenSpaceRadius: false,
        });
        this.ssao.blendIntensity = 0.85;
        this.composer.addPass(this.ssao);
      } catch (err) {
        console.warn('[post] GTAO unavailable, continuing without AO', err);
        this.ssao = null;
      }
    }

    // ---- screen-space reflections ----
    if (quality.ssr) {
      try {
        this.ssr = new SSRPass({
          renderer,
          scene,
          camera,
          width: Math.round(window.innerWidth * 0.5),
          height: Math.round(window.innerHeight * 0.5),
          selects: null,
          groundReflector: null,
        });
        this.ssr.opacity = quality.ssrOpacity ?? 0.5;
        this.ssr.maxDistance = 400;
        this.ssr.thickness = 0.02;
        this.composer.addPass(this.ssr);
      } catch (err) {
        console.warn('[post] SSR unavailable', err);
        this.ssr = null;
      }
    }

    // ---- god rays ----
    if (quality.godrays) {
      this.godrays = new ShaderPass(GODRAY_SHADER);
      this.godrays.uniforms.uStrength.value = 0.55;
      this.godrays.uniforms.uSamples.value = 24;
      this.composer.addPass(this.godrays);
    }

    // ---- bloom ----
    if (quality.bloom) {
      const resolution = new Vector2(window.innerWidth, window.innerHeight);
      this.bloom = new UnrealBloomPass(resolution, quality.bloomStrength ?? 0.6, 0.72, 0.82);
      this.composer.addPass(this.bloom);
    }

    // ---- depth of field ----
    if (quality.dof) {
      try {
        this.bokeh = new BokehPass(scene, camera, {
          focus: 30,
          aperture: 0.00018,
          maxblur: 0.006,
        });
        this.composer.addPass(this.bokeh);
      } catch (err) {
        console.warn('[post] bokeh pass unavailable', err);
        this.bokeh = null;
      }
    }

    // ---- motion blur / radial speed smear ----
    if (quality.motionBlur) {
      // A capture pass right after the scene gives the motion pass a clean
      // previous frame to smear into the current one.
      this.previousTarget = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
      });
      this.capturePass = new CapturePass(this.previousTarget);
      this.composer.insertPass(this.capturePass, 1);
      this.motion = new ShaderPass(MOTION_SHADER);
      this.motion.uniforms.tPrev.value = this.previousTarget.texture;
      this.motion.uniforms.uAmount.value = 0;
      this.composer.addPass(this.motion);
    }

    // ---- gravity lensing ----
    this.gravity = new ShaderPass(GRAVITY_LENS_SHADER);
    this.gravity.uniforms.uStrength.value = 0;
    this.composer.addPass(this.gravity);

    // ---- glitch ----
    this.glitch = new ShaderPass(GLITCH_SHADER);
    this.glitch.uniforms.uAmount.value = 0;
    this.composer.addPass(this.glitch);

    // ---- grade ----
    this.grade = new ShaderPass(GRADE_SHADER);
    this.grade.uniforms.tLut.value = textures?.gradeLUT?.() ?? null;
    this.composer.addPass(this.grade);

    // ---- AA ----
    if (quality.postAA === 'smaa') {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    } else if (quality.postAA === 'fxaa') {
      this.fxaa = new FXAAPass();
      this.composer.addPass(this.fxaa);
    }

    // ---- tone mapping + color space ----
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    // Screen-space state driven by gameplay
    this.state = {
      gravityCenter: new Vector2(0.5, 0.5),
      gravityRadius: 0.3,
      gravityStrength: 0,
      gravitySpin: 0,
      glitchAmount: 0,
      scanlines: 0,
      rgbShift: 0,
      distortion: 0,
      tintStrength: 0,
      tint: new Vector3(1, 1, 1),
      exposure: 1,
      sunVisibility: 0,
      motionAmount: 0,
      radialSmear: 0,
      focusDistance: 24,
      focusRange: 26,
    };
  }

  _makeTarget() {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.quality.taa ? 2 : 0,
    });
    return target;
  }

  setSize(width, height, pixelRatio = this.renderer.getPixelRatio()) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloom?.setSize(width, height);
    this.ssao?.setSize?.(width, height);
    this.ssr?.setSize?.(Math.round(width * 0.5), Math.round(height * 0.5));
    this.smaa?.setSize?.(width, height);
    if (this.previousTarget) this.previousTarget.setSize(Math.round(width / 2), Math.round(height / 2));
  }

  /** Called every frame by the renderer facade. */
  render(dt, context = {}) {
    const quality = this.quality;
    const state = this.state;

    // ---- drive instance values from gameplay state ----
    state.glitchAmount = damp(state.glitchAmount, context.glitch ?? 0, 6, dt);
    state.distortion = damp(state.distortion, context.distortion ?? 0, 4, dt);
    state.gravityStrength = damp(state.gravityStrength, context.gravity?.strength ?? 0, 5, dt);
    state.motionAmount = damp(state.motionAmount, context.motionBlur ?? 0, 8, dt);
    state.exposure = damp(state.exposure, context.exposure ?? 1, 3, dt);

    if (this.glitch) {
      this.glitch.uniforms.uTime.value += dt;
      this.glitch.uniforms.uAmount.value = state.glitchAmount;
      this.glitch.uniforms.uScanlines.value = context.scanlines ?? 0;
      this.glitch.uniforms.uRgbShift.value = context.rgbShift ?? state.glitchAmount;
    }
    if (this.gravity) {
      this.gravity.uniforms.uTime.value += dt;
      this.gravity.uniforms.uCenter.value.copy(state.gravityCenter);
      this.gravity.uniforms.uRadius.value = state.gravityRadius;
      this.gravity.uniforms.uStrength.value = state.gravityStrength;
      this.gravity.uniforms.uSpin.value = state.gravitySpin;
      this.gravity.uniforms.uChromatic.value = clamp(state.gravityStrength * 0.35, 0, 1);
    }
    if (this.godrays) {
      this.godrays.uniforms.uSunPos.value.copy(context.sunScreen ?? state.gravityCenter);
      this.godrays.uniforms.uStrength.value = (context.godrayStrength ?? 0.5) * (context.sunVisible ?? 1);
      this.godrays.uniforms.uSunColor.value.set(context.sunColor ?? 1, context.sunColorG ?? 0.92, context.sunColorB ?? 0.78);
    }
    if (this.bokeh) {
      this.bokeh.uniforms.focus.value = damp(this.bokeh.uniforms.focus.value, state.focusDistance, 3, dt);
      this.bokeh.uniforms.maxblur.value = quality.dofMaxBlur ?? 0.006;
    }
    if (this.motion) {
      this.motion.uniforms.uAmount.value = state.motionAmount * 0.6;
      this.motion.uniforms.uRadial.value = state.radialSmear;
    }
    if (this.grade) {
      this.grade.uniforms.uTime.value += dt;
      this.grade.uniforms.uTint.value.copy(state.tint);
      this.grade.uniforms.uTintStrength.value = state.tintStrength;
      this.grade.uniforms.uDistortion.value = state.distortion;
      this.grade.uniforms.uExposure.value = state.exposure;
      this.grade.uniforms.uChromatic.value = quality.chromatic ? 0.0016 + state.glitchAmount * 0.006 : 0;
      this.grade.uniforms.uGrain.value = quality.grain ? 0.03 + state.glitchAmount * 0.05 : 0;
      this.grade.uniforms.uVignette.value = 0.32 + state.glitchAmount * 0.15;
    }

    this.composer.render(dt);
  }

  /** Realm-driven look changes (called on realm transitions). */
  applyRealmLook(realm) {
    const palette = realm?.palette || {};
    const tint = palette.accent != null ? hexToVec3(palette.accent) : null;
    if (tint) {
      this.state.tint.set(lerp(1, tint.x, 0.35), lerp(1, tint.y, 0.35), lerp(1, tint.z, 0.35));
      this.state.tintStrength = realm?.id === 'valley' ? 0.12 : 0.28;
    } else {
      this.state.tintStrength = 0;
    }
    switch (realm?.id) {
      case 'backrooms':
        this.setGlitch({ amount: 0.06, scanlines: 0.35, rgbShift: 0.5 });
        break;
      case 'midnight':
        this.setGlitch({ amount: 0.08, scanlines: 0.6, rgbShift: 1 });
        break;
      case 'singularity':
        this.setGlitch({ amount: 0.02, scanlines: 0, rgbShift: 0.2 });
        break;
      default:
        this.setGlitch({ amount: 0, scanlines: 0, rgbShift: 0 });
    }
  }

  setGlitch({ amount = 0, scanlines = 0, rgbShift = 0 }) {
    this._glitchTarget = { amount, scanlines, rgbShift };
    this.glitchTarget = { amount, scanlines, rgbShift };
  }

  /** One-shot dramatic distortion (machine speak, portal entry, death). */
  pulse({ glitch = 0.35, distortion = 0.6, duration = 0.6 } = {}) {
    this.state.glitchAmount = Math.max(this.state.glitchAmount, glitch);
    this.state.distortion = Math.max(this.state.distortion, distortion);
    this._pulseUntil = performance.now() + duration * 1000;
  }

  /** Screen-space position of the sun, for god rays and lens flares. */
  setSunScreen(uv, visible) {
    this.state.sunScreen = uv;
    this.state.sunVisibility = visible;
  }

  dispose() {
    this.composer.passes.forEach((pass) => pass.dispose?.());
    this.previousTarget?.dispose();
  }
}

/**
 * Copies the current frame into a persistent target without swapping the
 * composer's buffers — the "previous frame" the motion pass smears against.
 */
class CapturePass extends Pass {
  constructor(target) {
    super();
    this.target = target;
    this.needsSwap = false;
    this.material = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, opacity: { value: 1 } },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.target.setSize(Math.max(1, Math.round(width * 0.5)), Math.max(1, Math.round(height * 0.5)));
  }

  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.opacity.value = 1;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    this.fsQuad.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
    this.target.dispose();
  }
}

function hexToVec3(hex) {
  return new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}
