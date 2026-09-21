// FlipRenderer — the screen-space fluid rendering pipeline for FLIP mode.
//
//   1. scene    : scene -> sceneRT (HalfFloat color + depth texture)   [depth pass]
//   2. fluid    : ray-surface search through the 3D fluid texture      [volume pass]
//                 front/back hit + Beer-Lambert extinction, premultiplied
//   3. blurH    : bilateral blur, horizontal  (removes particle bumps)
//   4. blurV    : bilateral blur, vertical
//   5. composite: transparent refraction (coverage-gradient UV offset),
//                 depth-based light extinction, Fresnel rim from the depth
//                 pass normal, procedural sky.  -> canvas
//
// Everything is plain TSL (three/tsl) fragment nodes on fullscreen quads,
// rendered explicitly in order — no PassNode ordering assumptions.

import * as THREE from "three";
import { ExternalTexture } from "three/webgpu";
import {
  screenUV, texture, texture3D, uniform, float, vec2, vec3, vec4,
  oneMinus, abs, pow, exp, smoothstep, mix,
  normalize, select,
  cameraNear, cameraFar, cameraWorldMatrix,
  perspectiveDepthToViewZ,
} from "three/tsl";

export interface FlipRenderSettings {
  refraction: number;   // 0..3   background distortion strength
  extinction: number;   // 0..3   Beer-Lambert absorption of the background
  blur: number;         // 0..3   bilateral blur radius multiplier
  fresnelPow: number;   // 1..8   Fresnel exponent
  fresnelInt: number;   // 0..2   Fresnel rim intensity
}

export const DEFAULT_FLIP_RENDER: FlipRenderSettings = {
  refraction: 1.0, extinction: 1.35, blur: 1.0, fresnelPow: 3.0, fresnelInt: 0.9,
};

const STEPS = 40;            // ray-surface search slices
const MAX_DIST = 240;        // max march distance (m)
const DEN_THRESH = 0.004;    // density considered "fluid"
const FAR = 1999;            // camera.far is 2000; anything beyond = background

type N = THREE.Node;

/** Fullscreen triangle that covers the NDC screen with one primitive. */
function makeTriangleGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0, 3, -1, 0, -1, 3, 0,
  ]), 3));
  return g;
}

function makeScreenMaterial(fragmentNode: N): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial();
  m.fragmentNode = fragmentNode as never;
  m.depthTest = false;
  m.depthWrite = false;
  return m;
}

function makeScreenScene(mat: THREE.MeshBasicMaterial): { scene: THREE.Scene; mesh: THREE.Mesh; cam: THREE.OrthographicCamera } {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(makeTriangleGeometry(), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, mesh, cam };
}

export class FlipRenderer {
  private renderer: THREE.WebGLRenderer | THREE.WebGPURenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private extFluid: ExternalTexture;

  private sceneRT: THREE.RenderTarget | null = null;
  private sceneDepth: THREE.DepthTexture | null = null;
  private fluidRT: THREE.RenderTarget | null = null;
  private blurRT1: THREE.RenderTarget | null = null;
  private blurRT2: THREE.RenderTarget | null = null;

  private fluidScreen: { scene: THREE.Scene; mesh: THREE.Mesh; cam: THREE.OrthographicCamera };
  private blurHScreens: { scene: THREE.Scene; mesh: THREE.Mesh; cam: THREE.OrthographicCamera };
  private blurVScreens: { scene: THREE.Scene; mesh: THREE.Mesh; cam: THREE.OrthographicCamera };
  private compositeScreen: { scene: THREE.Scene; mesh: THREE.Mesh; cam: THREE.OrthographicCamera };

  // TSL uniforms
  private uOrigin = uniform(new THREE.Vector3(-60, -20, -60));
  private uInv = uniform(new THREE.Vector3(1 / 120, 1 / 120, 1 / 120));
  private uTanHalf = uniform(0.5);
  private uTexel = uniform(new THREE.Vector2(1 / 1920, 1 / 1080));
  private uTime = uniform(0);

  private uRefract = uniform(1.0);
  private uExtinct = uniform(1.35);
  private uBlur = uniform(1.0);
  private uFresnelPow = uniform(3.0);
  private uFresnelInt = uniform(0.9);
  private uDepthNormal = uniform(0.9);

  private settings: FlipRenderSettings = { ...DEFAULT_FLIP_RENDER };
  private ready = false;

  constructor(
    renderer: THREE.WebGLRenderer | THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    fluidTexture: GPUTexture,
    gridOrigin: [number, number, number],
    gridSize: number,
    settings?: Partial<FlipRenderSettings>,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.extFluid = new ExternalTexture(fluidTexture);
    this.uOrigin.value.set(gridOrigin[0], gridOrigin[1], gridOrigin[2]);
    this.uInv.value.set(1 / gridSize, 1 / gridSize, 1 / gridSize);
    this.settings = { ...DEFAULT_FLIP_RENDER, ...settings };

    // graphs are built in setSize() — they capture the render targets
    this.fluidScreen = makeScreenScene(makeScreenMaterial(vec4(0, 0, 0, 1)));
    this.blurHScreens = makeScreenScene(makeScreenMaterial(vec4(0, 0, 0, 1)));
    this.blurVScreens = makeScreenScene(makeScreenMaterial(vec4(0, 0, 0, 1)));
    this.compositeScreen = makeScreenScene(makeScreenMaterial(vec4(0, 0, 0, 1)));
  }

  /** (Re)build the TSL graphs after the render targets exist / change. */
  private rebuildGraphs(): void {
    (this.fluidScreen.mesh.material as THREE.MeshBasicMaterial).fragmentNode = this.buildFluidNode() as never;
    (this.blurHScreens.mesh.material as THREE.MeshBasicMaterial).fragmentNode = this.buildBlurNode(true) as never;
    (this.blurVScreens.mesh.material as THREE.MeshBasicMaterial).fragmentNode = this.buildBlurNode(false) as never;
    (this.compositeScreen.mesh.material as THREE.MeshBasicMaterial).fragmentNode = this.buildCompositeNode() as never;
  }

  get isReady(): boolean { return this.ready; }

  setSize(w: number, h: number): void {
    const pr = Math.min(2, (this.renderer as THREE.WebGLRenderer).getPixelRatio?.() ?? 1);
    const W = Math.max(2, Math.floor(w * pr));
    const H = Math.max(2, Math.floor(h * pr));
    this.uTexel.value.set(1 / W, 1 / H);

    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType, depthBuffer: false, samples: 0,
    };
    this.sceneRT?.dispose();
    this.sceneRT = new THREE.RenderTarget(W, H, { ...opts, depthBuffer: true });
    // FloatType -> depth32float, which is the only depth format WebGPU can sample
    this.sceneDepth = new THREE.DepthTexture(W, H, THREE.FloatType);
    this.sceneRT.depthTexture = this.sceneDepth;
    this.fluidRT = new THREE.RenderTarget(W, H, opts);
    this.blurRT1 = new THREE.RenderTarget(W, H, opts);
    this.blurRT2 = new THREE.RenderTarget(W, H, opts);
    this.rebuildGraphs();
    this.ready = true;
  }

  update(time: number): void {
    this.uTime.value = time;
    this.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    this.uRefract.value = this.settings.refraction;
    this.uExtinct.value = this.settings.extinction;
    this.uBlur.value = this.settings.blur;
    this.uFresnelPow.value = this.settings.fresnelPow;
    this.uFresnelInt.value = this.settings.fresnelInt;
  }

  setSettings(p: Partial<FlipRenderSettings>): void {
    Object.assign(this.settings, p);
  }

  /** Render the full pipeline: scene -> fluid -> blur x2 -> composite -> canvas. */
  render(): void {
    if (!this.ready || !this.sceneRT || !this.fluidRT || !this.blurRT1 || !this.blurRT2) return;
    const r = this.renderer;

    // 1. depth pass: scene color + depth
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);

    // 2. fluid volume (premultiplied color + coverage alpha)
    r.setRenderTarget(this.fluidRT);
    r.render(this.fluidScreen.scene, this.fluidScreen.cam);

    // 3+4. bilateral blur H -> V
    r.setRenderTarget(this.blurRT1);
    r.render(this.blurHScreens.scene, this.blurHScreens.cam);
    r.setRenderTarget(this.blurRT2);
    r.render(this.blurVScreens.scene, this.blurVScreens.cam);

    // 5. final composite to the canvas
    r.setRenderTarget(null);
    r.render(this.compositeScreen.scene, this.compositeScreen.cam);
  }

  dispose(): void {
    this.sceneRT?.dispose();
    this.sceneDepth?.dispose();
    this.fluidRT?.dispose();
    this.blurRT1?.dispose();
    this.blurRT2?.dispose();
    for (const s of [this.fluidScreen, this.blurHScreens, this.blurVScreens, this.compositeScreen]) {
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.geometry.dispose();
    }
    this.ready = false;
  }

  /* ============================ TSL node graph ============================ */

  /** View-space ray direction for the current fragment (perspective). */
  private rayDirView(): N {
    const ndc = screenUV.mul(2.0).sub(1.0);
    const aspect = this.uTexel.y.div(this.uTexel.x); // W/H
    return vec3(
      ndc.x.mul(this.uTanHalf).mul(aspect),
      ndc.y.mul(this.uTanHalf),
      float(-1.0),
    ).normalize();
  }

  /** Linear (orthographic) view distance of the scene surface at a UV offset. */
  private sceneDist(dUV: N = screenUV.sub(screenUV)): N {
    if (!this.sceneRT || !this.sceneDepth) return float(MAX_DIST);
    const depthRaw = texture(this.sceneDepth, dUV).r;
    const viewZ = perspectiveDepthToViewZ(depthRaw, cameraNear, cameraFar);
    return -viewZ;
  }

  /** World position of a point at distance d along the view ray. */
  private rayWorldPos(d: N): N {
    const dir = this.rayDirView();
    const vp = vec4(dir.x.mul(d), dir.y.mul(d), dir.z.mul(d), float(1.0));
    return cameraWorldMatrix.mul(vp).xyz;
  }

  /** Sample the 3D fluid volume at a world position -> vec4(water, heat, cold, depthW). */
  private sampleFluid(wp: N): N {
    const gc = wp.sub(this.uOrigin).mul(this.uInv); // 0..1 across the grid
    return texture3D(this.extFluid as never, gc) as N;
  }

  /**
   * Ray-surface search: first/last distance along the view ray where the fluid
   * density crosses the threshold. Stateless TSL: a min/max fold over STEPS
   * conditional samples.
   */
  private rayFluidExtents(distMax: N): { front: N; back: N } {
    let front: N = float(MAX_DIST + 1);
    let back: N = float(0);
    for (let i = 0; i < STEPS; i++) {
      const t = float(i / (STEPS - 1)).mul(distMax);
      const f = this.sampleFluid(this.rayWorldPos(t));
      const dens = f.r.add(f.b); // water body + cold/ice/steam body
      const hit = dens.greaterThan(float(DEN_THRESH));
      front = front.min(select(hit, t, float(MAX_DIST + 1)));
      back = back.max(select(hit, t, float(0)));
    }
    return { front, back: back.max(front) };
  }

  private buildFluidNode(): N {
    const distMax = this.sceneDist().min(float(MAX_DIST));
    const { front, back } = this.rayFluidExtents(distMax);

    // shading at the front hit + slab thickness along the ray
    const hit = this.sampleFluid(this.rayWorldPos(front));
    const pathLen = back.sub(front).max(float(0.5));
    const wpDeep = this.sampleFluid(this.rayWorldPos(front.add(pathLen.mul(0.5))));
    const densAvg = hit.r.add(hit.b).add(wpDeep.r.add(wpDeep.b)).mul(0.5);

    // Beer-Lambert: optical depth of the fluid slab
    const sigma = densAvg.mul(22.0);
    const T = exp(sigma.mul(-this.uExtinct).mul(pathLen.mul(0.06)));
    // rays that never crossed the fluid (front stayed at MAX_DIST+1) must
    // contribute nothing — otherwise the clamped edge cell would ghost
    const hasHit = front.lessThan(float(MAX_DIST));
    const coverage = oneMinus(T).clamp(float(0.0), float(1.0)).mul(select(hasHit, float(1.0), float(0.0)));

    // color: water blue, cold/ice white-blue, heat glow
    const waterCol = vec3(0.05, 0.22, 0.42);
    const cold = hit.b;
    const heat = hit.g.mul(24.0);
    const heatGlow = smoothstep(0.05, 1.2, heat).mul(vec3(1.0, 0.34, 0.05));
    const col = waterCol
      .add(vec3(0.55, 0.75, 0.9).mul(cold.mul(3.0)))
      .add(heatGlow);
    const premul = col.mul(coverage);

    return vec4(premul, coverage);
  }

  /** Bilateral (alpha-preserving) 9-tap blur. horizontal=true -> x axis. */
  private buildBlurNode(horizontal: boolean): N {
    const srcRT = horizontal ? this.fluidRT : this.blurRT1;
    const axis = horizontal ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    const sigma2 = this.uBlur.mul(2.0).mul(2.0).add(float(0.5));
    const center = texture((srcRT?.texture) as never, screenUV) as N;

    let accRGB: N = vec4(0, 0, 0, 0);
    let accA: N = float(0);
    let wacc: N = float(0);
    for (let k = -4; k <= 4; k++) {
      const p = texture((srcRT?.texture) as never, screenUV.add(axis.mul(float(k)))) as N;
      const edge = oneMinus(abs(p.a.sub(center.a)).mul(5.0).min(float(1.0))); // bilateral edge stop
      const w = exp(float(k * k).mul(float(-1.0).div(sigma2))).mul(edge);
      accRGB = accRGB.add(p.mul(w));      // premultiplied color
      accA = accA.add(p.a.mul(w));        // alpha with the same weights
      wacc = wacc.add(w);
    }
    const rgb = accRGB.div(wacc.max(float(1e-5)));
    return vec4(rgb.r, rgb.g, rgb.b, accA.div(wacc.max(float(1e-5))));
  }

  private buildCompositeNode(): N {
    const distMax = this.sceneDist().min(float(MAX_DIST));
    const { front, back } = this.rayFluidExtents(distMax);
    const pathLen = back.sub(front).max(float(0.5));
    const hit = this.sampleFluid(this.rayWorldPos(front));
    const sigma = hit.r.add(hit.b).mul(22.0);
    // depth-based extinction of the background behind the fluid slab
    // (1.0 where the ray never hit fluid — the clamped edge cell is junk)
    const bgExtinction = exp(sigma.mul(pathLen.mul(0.06)).mul(-this.uExtinct))
      .mul(select(front.greaterThan(float(MAX_DIST)), float(0.0), float(1.0)));

    // ---- refraction: UV offset from the blurred fluid coverage gradient ----
    const blurTex = (this.blurRT2?.texture) as never;
    const aC = texture(blurTex, screenUV).a;
    const aL = texture(blurTex, screenUV.sub(vec2(this.uTexel.x, 0))).a;
    const aR = texture(blurTex, screenUV.add(vec2(this.uTexel.x, 0))).a;
    const aD = texture(blurTex, screenUV.sub(vec2(0, this.uTexel.y))).a;
    const aU = texture(blurTex, screenUV.add(vec2(0, this.uTexel.y))).a;
    const grad = vec2(aR.sub(aL), aU.sub(aD)).mul(0.5);
    const refUV = screenUV.add(grad.mul(this.uRefract).mul(float(0.03))
      .mul(aC.mul(4.0).min(float(1.0))));

    // ---- refracted scene color ----
    const sceneCol = texture((this.sceneRT?.texture) as never, refUV) as N;

    // ---- Fresnel rim from the depth-pass surface normal (central differences) ----
    const dL = this.sceneDist(screenUV.sub(vec2(this.uTexel.x, 0)));
    const dR = this.sceneDist(screenUV.add(vec2(this.uTexel.x, 0)));
    const dD = this.sceneDist(screenUV.sub(vec2(0, this.uTexel.y)));
    const dU = this.sceneDist(screenUV.add(vec2(0, this.uTexel.y)));
    const nrm = normalize(vec3(
      dL.sub(dR).mul(this.uDepthNormal),
      1.0,
      dD.sub(dU).mul(this.uDepthNormal),
    ));
    const cosT = abs(nrm.z); // nrm is normalized: |Nz|/|N|
    const fresnel = pow(oneMinus(cosT.clamp(float(0.0), float(1.0))), this.uFresnelPow);
    const rim = fresnel.mul(this.uFresnelInt).mul(aC);

    // ---- blurred fluid (premultiplied) + fresnel tint ----
    const fluidCol = texture(blurTex, screenUV).rgb;
    const fresCol = vec3(0.55, 0.78, 0.95).mul(rim)
      .mul(vec3(1.0, 1.0, 1.0).add(hit.g.mul(vec3(14.0, 4.0, 0.5))));

    // ---- procedural sky where the scene is the background ----
    const isFarF = select(distMax.greaterThan(float(FAR)), float(1.0), float(0.0));
    const sky = mix(vec3(0.74, 0.83, 0.9), vec3(0.36, 0.56, 0.78), screenUV.y.pow(float(0.8)));
    const bg = mix(sceneCol, sky, isFarF);

    // ---- final ----
    const outCol = bg.mul(bgExtinction.clamp(float(0.05), float(1.0)))
      .add(fluidCol)
      .add(fresCol);
    return vec4(outCol, float(1.0));
  }
}
