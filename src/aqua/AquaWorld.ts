// AquaWorld — the unified simulation orchestrator.
// PBF water + Rapier rigid bodies + force fields + weather + destruction,
// all stepped on a fixed timestep and coupled every frame:
//   SPH -> bodies (displacement impulses, sampled drag)
//   bodies -> SPH (analytic sphere proxies)
//   water level -> buoyancy, flood loading, fire suppression
//   erosion -> terrain mesh, ocean foam, collider rebuilds

import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d-compat";
import { FluidSolver, type SphContext, type SphFx, type SphPush } from "./sph";
import { FlipEngine, DEFAULT_FLIP_SETTINGS, type FlipSettings } from "./flip/FlipEngine";
import type { FlipRenderer, FlipRenderSettings } from "./flip/FlipRenderer";
const FLIP_RENDER_DEFAULTS: FlipRenderSettings = {
  refraction: 1.0, extinction: 1.35, blur: 1.0, fresnelPow: 3.0, fresnelInt: 0.9,
};
import { AerosolSystem } from "./aerosols";
import { LabAudio } from "./labAudio";
import {
  makeCompositeMaterial, makeDiskMaterial, makeFluidPointsMaterial,
  makeFunnelMaterial, makeOceanMaterial, makePortalMaterial, makeSkyMaterial,
} from "./shaders";
import { FLUIDS, FLUID_LIST, SOLIDS } from "./materials";
import { Rng, clamp, lerp } from "./rng";
import { allocId } from "./fields";
import type {
  BlackHoleField, BodyProxy, FireSource, GravityWell, PortalPair, VortexField,
} from "./fields";
import { DAM_X, SEA_LEVEL, Terrain, WORLD_SIZE, riverZ } from "./terrain";
import { makeFacadeTexture, planCity, type SegmentSpec } from "./city";

export type ToolId =
  | "hose" | "push" | "demolish" | "ignite" | "water" | "debris"
  | "boat" | "car" | "portal" | "blackhole" | "whirlpool" | "inspect";
export type ScenarioId =
  | "dam" | "flood" | "storm" | "whirlpool" | "blackhole" | "portal"
  | "tsunami" | "meteor" | "freeze" | "quake" | "reset";
export type CameraMode = "orbit" | "fly" | "follow";
export type VizMode = "fluid" | "velocity" | "pressure" | "temperature";
export type WeatherId = "clear" | "rain" | "storm" | "snow";

export interface LabStats {
  fps: number; simMs: number; particles: number; bodies: number;
  volume: number; maxSpeed: number; meanSpeed: number; tier: number;
  flood: number; ambient: number; wind: number; calls: number; tris: number;
  quality: string;
}

export interface AquaCallbacks {
  onStats: (s: LabStats) => void;
  onLog: (msg: string, kind: string) => void;
  onSelect: (info: string | null) => void;
}

interface BodyRec {
  id: number;
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  kind: string;
  radius: number;
  volume: number;
  dragK: number;
  age: number;
  wasSub: number;
  fixed: boolean;
  dead: boolean;
}

interface SegmentRec extends BodyRec {
  spec: SegmentSpec;
  health: number;
  maxHealth: number;
  building: number;
  dynamic: boolean;
}

interface VortexVis { field: VortexField; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; h: number }
interface HoleVis { field: BlackHoleField; group: THREE.Group; diskMat: THREE.ShaderMaterial }
interface PortalVis { pair: PortalPair; groupA: THREE.Group; groupB: THREE.Group; matA: THREE.ShaderMaterial; matB: THREE.ShaderMaterial }

const STEP = 1 / 60;
const SPH_CAP = 7000;
const TIERS = [
  { limit: 6500, iters: 3, pr: 2.0, rain: 1500, aero: 1.0 },
  { limit: 2600, iters: 2, pr: 1.5, rain: 1000, aero: 0.7 },
  { limit: 1400, iters: 2, pr: 1.1, rain: 500, aero: 0.4 },
];

export class AquaWorld {
  private canvas: HTMLCanvasElement;
  private cb: AquaCallbacks;
  private dead = false;
  private renderer!: THREE.WebGLRenderer | WebGPURenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private rt!: THREE.WebGLRenderTarget;
  private compScene = new THREE.Scene();
  private compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compMat = makeCompositeMaterial();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private flashLight!: THREE.PointLight;
  private fireLights: THREE.PointLight[] = [];
  private skyMat = makeSkyMaterial();
  private oceanMat!: THREE.ShaderMaterial;
  private reservoirMat!: THREE.ShaderMaterial;
  private reservoirMesh!: THREE.Mesh;
  private floodMesh!: THREE.Mesh;
  private floodMat!: THREE.MeshStandardMaterial;
  private riverMat!: THREE.MeshStandardMaterial;
  private terrain!: Terrain;
  private rapier!: RAPIER.World;
  private groundCollider: RAPIER.Collider | null = null;
  private groundBody: RAPIER.RigidBody | null = null;
  private solver!: FluidSolver;
  private sphCtx!: SphContext;
  private points!: THREE.Points;
  private pointsMat = makeFluidPointsMaterial();
  private smoke = new AerosolSystem(2600, false);
  private glow = new AerosolSystem(1600, true);
  private audio = new LabAudio();
  private rng = new Rng(Date.now() & 0xffffff);

  private bodies: BodyRec[] = [];
  private segments: SegmentRec[] = [];
  private proxies: BodyProxy[] = [];
  private wells: GravityWell[] = [];
  private vortices: VortexVis[] = [];
  private holes: HoleVis[] = [];
  private portals: PortalVis[] = [];
  private fires: FireSource[] = [];
  private pendingPortalA: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;

  private cityGroup = new THREE.Group();
  private fieldGroup = new THREE.Group();
  private facadeMats: THREE.MeshStandardMaterial[] = [];
  private solidMats = new Map<string, THREE.MeshStandardMaterial>();
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // simulation state
  private time = 0;
  private timeScale = 1;
  private paused = false;
  private stepRequested = false;
  private gravityScale = 1;
  private ambientC = 18;
  private floodLevel = -50;
  private floodTarget = -50;
  private seaLevel = SEA_LEVEL;
  private seaTarget = SEA_LEVEL;
  private reservoirLevel = 9;
  private damBreached = false;
  private breachX = DAM_X;
  private windSpeed = 4;
  private windTarget = 4;
  private windDir = 0.7;
  private stormAmt = 0;
  private stormTarget = 0;
  private rainRate = 0;
  private rainTarget = 0;
  private snowRate = 0;
  private snowTarget = 0;
  private weather: WeatherId = "clear";
  private quakeT = 0;
  private freezeT = 0;
  private freezeActive = false;
  private lightningT = 5;
  private boltLife = 0;
  private bolt!: THREE.Line;
  private trauma = 0;
  private lensing = true;
  private tool: ToolId = "hose";
  private fluidKey = "water";
  private viz: VizMode = "fluid";
  private camMode: CameraMode = "orbit";
  private selected: BodyRec | null = null;
  private selectBox: THREE.BoxHelper | null = null;

  // camera state
  private orbit = { tx: -10, ty: 8, tz: -10, yaw: 0.7, pitch: 0.55, dist: 110 };
  private fly = { x: -40, y: 40, z: 60, yaw: 2.6, pitch: -0.4 };
  private keys = new Set<string>();

  // rain / snow
  private rainDrops = 1500;
  private rainPos!: Float32Array;
  private rainVel!: Float32Array;
  private rainGeo = new THREE.BufferGeometry();
  private snowN = 900;
  private snowPos!: Float32Array;
  private snowGeo = new THREE.BufferGeometry();

  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private fpsEma = 60;
  private simMs = 0;
  private statT = 0;
  private tier = 1;
  private baseTier = 1;
  private tierT = 0;
  private colliderT = 0;
  private supportT = 0;
  private erosionT = 0;
  private fx: SphFx[] = [];
  private push: SphPush[] = [];
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  // FLIP / WebGPU engine (extreme mode)
  private flipMode = false;
  private flipEngine: FlipEngine | null = null;
  private flipRender: FlipRenderer | null = null;
  private flipSettings: FlipSettings = { ...DEFAULT_FLIP_SETTINGS };
  private flipRenderSettings: FlipRenderSettings = { ...FLIP_RENDER_DEFAULTS };
  private hiddenInFlip: THREE.Object3D[] = [];
  private skyMesh: THREE.Mesh | null = null;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private dragging = false;
  private dragButton = 0;
  private dragMoved = 0;
  private lastPX = 0;
  private lastPY = 0;
  private toolHeld = false;
  private toolPoint = new THREE.Vector3();
  private toolHasPoint = false;
  private touches = new Map<number, { x: number; y: number }>();
  private pinchD = 0;

  constructor(canvas: HTMLCanvasElement, cb: AquaCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
  }

  /* ============================== INIT ============================== */

  async init(): Promise<void> {
    await RAPIER.init();
    if (this.dead) return;
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x05070a);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2000);
    this.scene.add(this.cityGroup);
    this.scene.add(this.fieldGroup);
    this.scene.fog = new THREE.FogExp2(0x8aa5b5, 0.0016);

    // lights
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.position.set(60, 95, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -135;
    this.sun.shadow.camera.right = 135;
    this.sun.shadow.camera.top = 135;
    this.sun.shadow.camera.bottom = -135;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a42, 0.75);
    this.scene.add(this.hemi);
    this.flashLight = new THREE.PointLight(0xbfe0ff, 0, 400, 1.6);
    this.scene.add(this.flashLight);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7733, 0, 60, 1.8);
      this.scene.add(l);
      this.fireLights.push(l);
    }

    // sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.skyMesh = sky;

    // terrain
    this.terrain = new Terrain(20260921);
    this.terrain.mesh.updateMatrixWorld(true);
    this.scene.add(this.terrain.mesh);

    // ocean
    this.oceanMat = makeOceanMaterial(this.terrain.foamTexture);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(760, 760, 150, 150), this.oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = this.seaLevel;
    ocean.frustumCulled = false;
    this.scene.add(ocean);
    (this as { oceanMesh?: THREE.Mesh }).oceanMesh = ocean;

    // flood plane (land area only)
    this.floodMat = new THREE.MeshStandardMaterial({
      color: 0x14425a, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.0,
    });
    this.floodMesh = new THREE.Mesh(new THREE.PlaneGeometry(172, WORLD_SIZE), this.floodMat);
    this.floodMesh.rotation.x = -Math.PI / 2;
    this.floodMesh.position.set(-34, this.floodLevel, 0);
    this.floodMesh.visible = false;
    this.scene.add(this.floodMesh);

    // reservoir plane
    this.reservoirMat = makeOceanMaterial(this.terrain.foamTexture);
    this.reservoirMat.uniforms.uDeep.value = new THREE.Color(0.02, 0.14, 0.2);
    this.reservoirMesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 24, 24, 8), this.reservoirMat);
    this.reservoirMesh.rotation.x = -Math.PI / 2;
    this.reservoirMesh.position.set((DAM_X - 116) / 2, this.reservoirLevel, -62);
    this.scene.add(this.reservoirMesh);

    // river ribbon
    const flowTex = makeFlowTexture();
    this.riverMat = new THREE.MeshStandardMaterial({
      color: 0x1a5a70, transparent: true, opacity: 0.85, roughness: 0.15,
      map: flowTex,
    });
    const ribbon = this.buildRiverRibbon();
    this.scene.add(ribbon);

    // physics world
    this.rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.rapier.timestep = STEP;
    this.buildGroundCollider();

    // city
    this.facadeMats = [0, 1, 2].map((v) => new THREE.MeshStandardMaterial({
      map: makeFacadeTexture(v, 777), roughness: 0.85, metalness: 0.05,
    }));
    this.buildCity();

    // fluid solver
    this.solver = new FluidSolver(SPH_CAP, 4242);
    this.sphCtx = this.makeSphContext();
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPH_CAP * 3), 3));
    pgeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(SPH_CAP * 3), 3));
    pgeo.setAttribute("aData", new THREE.BufferAttribute(new Float32Array(SPH_CAP * 3), 3));
    pgeo.setDrawRange(0, 0);
    this.points = new THREE.Points(pgeo, this.pointsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);
    this.scene.add(this.smoke.points);
    this.scene.add(this.glow.points);

    // lightning bolt
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({
      color: 0xcfe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);

    this.initRainSnow();
    this.buildVegetation();

    // composite
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    quad.frustumCulled = false;
    this.compScene.add(quad);
    this.resize();

    // initial life: waterfall + spillway + vehicles
    this.spawnBoat(74, 0, 26, 0.4);
    this.spawnBoat(88, 0, -34, -0.3);
    this.spawnCar(-16, 7, 12, 0);
    this.spawnCar(8, 7, -8, 1.57);
    this.spawnCar(-40, 7, 30, 0);
    this.spawnCar(8, 7, -60, 0);

    this.attachInput();
    this.log("AQUA LAB online — PBF fluids + rigid bodies coupled. Pick a tool, or trigger a scenario.", "sys");
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private makeSphContext(): SphContext {
    return {
      dt: STEP,
      time: 0,
      gravityX: 0, gravityY: -9.81, gravityZ: 0,
      ambientC: this.ambientC,
      windX: 0, windY: 0, windZ: 0, windDrag: 0.12,
      terrainHeight: (x, z) => this.terrain.height(x, z),
      wells: this.wells,
      vortices: this.vortices.map((v) => v.field),
      holes: this.holes.map((h) => h.field),
      portals: this.portals.map((p) => p.pair),
      proxies: this.proxies,
      fires: this.fires,
      fx: this.fx,
      push: this.push,
      quality: { iterations: 2, maxVel: 42, xsph: 0.09, activeLimit: 2600 },
    };
  }

  /* ============================== GROUND ============================== */

  private buildGroundCollider(): void {
    const tri = this.terrain.colliderTrimesh();
    this.groundBody = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.groundCollider = this.rapier.createCollider(
      RAPIER.ColliderDesc.trimesh(tri.vertices, tri.indices).setFriction(1.0),
      this.groundBody,
    );
  }

  private rebuildGroundCollider(): void {
    if (!this.groundBody || !this.groundCollider) return;
    const tri = this.terrain.colliderTrimesh();
    this.rapier.removeCollider(this.groundCollider, true);
    this.groundCollider = this.rapier.createCollider(
      RAPIER.ColliderDesc.trimesh(tri.vertices, tri.indices).setFriction(1.0),
      this.groundBody,
    );
  }

  /* ============================== CITY ============================== */

  private solidMat(name: string): THREE.MeshStandardMaterial {
    let m = this.solidMats.get(name);
    if (!m) {
      const def = SOLIDS[name] ?? SOLIDS.concrete;
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.color[0], def.color[1], def.color[2]),
        roughness: 0.9, metalness: name === "steel" ? 0.6 : 0.0,
      });
      this.solidMats.set(name, m);
    }
    return m;
  }

  private buildCity(): void {
    const plan = planCity(4242);
    // roads
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.95 });
    for (const r of plan.roads) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x, 6.06, r.z);
      m.receiveShadow = true;
      this.cityGroup.add(m);
    }
    let building = 0;
    let lastTag = "";
    for (const s of plan.segments) {
      if (s.tag !== lastTag && (s.tag === "dam" || s.tag === "bridge" || s.tag === "pillar")) {
        building += 1000;
        lastTag = s.tag;
      }
      this.addSegment(s, s.tag === "tower" || s.tag === "house" ? building++ : building, s.tag === "dam" || s.tag === "bridge");
    }
  }

  private addSegment(s: SegmentSpec, building: number, structural: boolean): SegmentRec {
    const def = SOLIDS[s.mat] ?? SOLIDS.concrete;
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, s.y, s.z));
    this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(s.sx / 2, s.sy / 2, s.sz / 2)
        .setDensity(def.density).setFriction(def.friction).setRestitution(def.restitution),
      body,
    );
    let mesh: THREE.Object3D;
    if (s.tag === "tower" || s.tag === "house" || s.tag === "bridge") {
      mesh = new THREE.Mesh(this.boxGeo, this.facadeMats[s.facade % 3]);
    } else {
      mesh = new THREE.Mesh(this.boxGeo, this.solidMat(s.mat));
    }
    mesh.scale.set(s.sx, s.sy, s.sz);
    mesh.position.set(s.x, s.y, s.z);
    (mesh as THREE.Mesh).castShadow = true;
    (mesh as THREE.Mesh).receiveShadow = true;
    if (s.tag === "house") {
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(s.sx, s.sz) * 0.72, 2.2, 4),
        this.solidMat("brick"));
      roof.position.y = s.sy / 2 + 1.0;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      mesh.add(roof);
    }
    this.cityGroup.add(mesh);
    const rec: SegmentRec = {
      id: allocId(), body, mesh, kind: s.tag,
      radius: 0.5 * Math.sqrt(s.sx * s.sx + s.sy * s.sy + s.sz * s.sz) * 0.62,
      volume: s.sx * s.sy * s.sz, dragK: 40, age: 0, wasSub: 0, fixed: true, dead: false,
      spec: s, health: def.strength * (s.sx * s.sy * s.sz) * 0.12, maxHealth: 0,
      building: structural ? -building - 1 : building, dynamic: false,
    };
    rec.maxHealth = rec.health;
    mesh.userData.rec = rec;
    this.bodies.push(rec);
    this.segments.push(rec);
    return rec;
  }

  private buildVegetation(): void {
    const rng = new Rng(99);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const leafGeo = new THREE.ConeGeometry(2.4, 6, 7);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d4a22, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 60);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 60);
    const m = new THREE.Matrix4();
    let placed = 0;
    let guard = 0;
    while (placed < 60 && guard++ < 800) {
      const x = rng.range(-115, 30);
      const z = rng.range(-110, 110);
      if (x > -70 && x < 36 && Math.abs(z) < 50) continue;
      if (Math.abs(z - riverZ(x)) < 9) continue;
      const h = this.terrain.height(x, z);
      if (h < 2 || h > 26) continue;
      const s = rng.range(0.7, 1.5);
      m.makeScale(s, s, s);
      m.setPosition(x, h + 1.5 * s, z);
      trunks.setMatrixAt(placed, m);
      m.setPosition(x, h + (3 + 2.6) * s, z);
      leaves.setMatrixAt(placed, m);
      placed++;
    }
    trunks.count = placed;
    leaves.count = placed;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(leaves);
  }

  private buildRiverRibbon(): THREE.Mesh {
    const pts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let vi = 0;
    for (let x = DAM_X + 1; x <= 60; x += 4) {
      const zc = riverZ(x);
      const bed = 3 - clamp((x - DAM_X) / (55 - DAM_X), 0, 1) * 8;
      const y = Math.max(bed + 1.6, -0.4);
      // perpendicular in xz
      const zc2 = riverZ(x + 2);
      const dx = 2; const dz = zc2 - zc;
      const len = Math.sqrt(dx * dx + dz * dz);
      const nx = -dz / len; const nz = dx / len;
      const w = 4.2;
      pts.push(x + nx * w, y, zc + nz * w, x - nx * w, y, zc - nz * w);
      uvs.push((x - DAM_X) / 8, 0, (x - DAM_X) / 8, 1);
      if (vi > 0) {
        const a = (vi - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      vi++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.riverMat);
    mesh.renderOrder = 4;
    return mesh;
  }

  /* ============================== BODIES ============================== */

  private solidDefOf(kind: string): { density: number; friction: number; restitution: number } {
    const d = SOLIDS[kind] ?? SOLIDS.concrete;
    return { density: d.density, friction: d.friction, restitution: d.restitution };
  }

  private spawnBox(x: number, y: number, z: number, sx: number, sy: number, sz: number,
    mat: string, kind: string, vx = 0, vy = 0, vz = 0): BodyRec {
    const def = this.solidDefOf(mat);
    const body = this.rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.05).setAngularDamping(0.4));
    this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
        .setDensity(def.density).setFriction(def.friction).setRestitution(def.restitution),
      body);
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    const mesh = new THREE.Mesh(this.boxGeo, this.solidMat(mat));
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const rec: BodyRec = {
      id: allocId(), body, mesh, kind,
      radius: 0.5 * Math.sqrt(sx * sx + sy * sy + sz * sz) * 0.62,
      volume: sx * sy * sz, dragK: 60, age: 0, wasSub: 0, fixed: false, dead: false,
    };
    mesh.userData.rec = rec;
    this.bodies.push(rec);
    return rec;
  }

  private spawnBall(x: number, y: number, z: number, r: number, mat: string, kind: string,
    vx = 0, vy = 0, vz = 0, ccd = false): BodyRec {
    const def = this.solidDefOf(mat);
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.02).setAngularDamping(0.2);
    if (ccd) desc.setCcdEnabled(true);
    const body = this.rapier.createRigidBody(desc);
    this.rapier.createCollider(
      RAPIER.ColliderDesc.ball(r).setDensity(def.density).setFriction(def.friction).setRestitution(def.restitution),
      body);
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), this.solidMat(mat));
    mesh.castShadow = true;
    this.scene.add(mesh);
    const rec: BodyRec = {
      id: allocId(), body, mesh, kind, radius: r,
      volume: (4 / 3) * Math.PI * r * r * r, dragK: 60, age: 0, wasSub: 0, fixed: false, dead: false,
    };
    mesh.userData.rec = rec;
    this.bodies.push(rec);
    return rec;
  }

  spawnBoat(x: number, y: number, z: number, yaw: number): BodyRec {
    const body = this.rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.4).setAngularDamping(1.2));
    this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(3.2, 0.9, 1.3).setDensity(320).setFriction(0.4).setRestitution(0.2), body);
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.6 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xb03030, roughness: 0.6 });
    const hull = new THREE.Mesh(this.boxGeo, hullMat);
    hull.scale.set(6.4, 1.8, 2.6);
    hull.castShadow = true;
    const cabin = new THREE.Mesh(this.boxGeo, trimMat);
    cabin.scale.set(2.2, 1.4, 1.8);
    cabin.position.set(-1.2, 1.5, 0);
    cabin.castShadow = true;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 6), trimMat);
    mast.position.set(1.4, 2.6, 0);
    g.add(hull, cabin, mast);
    g.rotation.y = yaw;
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.scene.add(g);
    const rec: BodyRec = {
      id: allocId(), body, mesh: g, kind: "boat", radius: 3.2,
      volume: 6.4 * 1.8 * 2.6, dragK: 90, age: 0, wasSub: 0, fixed: false, dead: false,
    };
    g.userData.rec = rec;
    hull.userData.rec = rec;
    cabin.userData.rec = rec;
    this.bodies.push(rec);
    return rec;
  }

  spawnCar(x: number, y: number, z: number, yaw: number): BodyRec {
    const body = this.rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(1.0));
    this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(2.1, 0.7, 0.95).setDensity(750).setFriction(0.8).setRestitution(0.25), body);
    const palette = [0xc23b2e, 0x2e6fc2, 0xd8a928, 0x3fa34d, 0x7a7f85, 0x6633aa];
    const paint = new THREE.MeshStandardMaterial({
      color: palette[Math.floor(this.rng.next() * palette.length)], roughness: 0.35, metalness: 0.5,
    });
    const g = new THREE.Group();
    const lower = new THREE.Mesh(this.boxGeo, paint);
    lower.scale.set(4.2, 0.9, 1.9);
    lower.position.y = 0.75;
    lower.castShadow = true;
    const cabin = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.2, metalness: 0.4 }));
    cabin.scale.set(2.2, 0.7, 1.7);
    cabin.position.set(-0.2, 1.5, 0);
    cabin.castShadow = true;
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
    }
    g.add(lower, cabin);
    g.rotation.y = yaw;
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.scene.add(g);
    const rec: BodyRec = {
      id: allocId(), body, mesh: g, kind: "car", radius: 2.4,
      volume: 12, dragK: 60, age: 0, wasSub: 0, fixed: false, dead: false,
    };
    g.userData.rec = rec;
    lower.userData.rec = rec;
    this.bodies.push(rec);
    return rec;
  }

  private removeBody(rec: BodyRec): void {
    if (rec.dead) return;
    rec.dead = true;
    try {
      this.rapier.removeRigidBody(rec.body);
    } catch { /* already removed */ }
    this.scene.remove(rec.mesh);
    this.cityGroup.remove(rec.mesh);
    if (this.selected === rec) this.select(null);
  }

  /** Fracture a fixed segment into a live rigid body. */
  private detachSegment(seg: SegmentRec, ix: number, iy: number, iz: number): void {
    const s = seg.spec;
    const def = this.solidDefOf(s.mat);
    const pos = seg.body.translation();
    this.rapier.removeRigidBody(seg.body);
    const body = this.rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.05).setAngularDamping(0.5));
    this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(s.sx / 2, s.sy / 2, s.sz / 2)
        .setDensity(def.density).setFriction(def.friction).setRestitution(def.restitution),
      body);
    body.applyImpulse({ x: ix, y: iy, z: iz }, true);
    seg.body = body;
    seg.fixed = false;
    seg.dynamic = true;
    seg.kind = "debris";
    this.smoke.burst(pos.x, pos.y, pos.z, Math.floor(10 * this.aeroMul()), {
      speed: 5, up: 3, life: 1.6, size: 2.2, grow: 2, r: 0.62, g: 0.6, b: 0.58, alpha: 0.5, grav: 1.2, drag: 1.6,
    });
    this.audio.crack();
  }

  damageAt(x: number, y: number, z: number, radius: number, amount: number): void {
    for (const seg of this.segments) {
      if (seg.dynamic || seg.dead) continue;
      const p = seg.body.translation();
      const d = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2);
      if (d < radius + seg.radius) {
        seg.health -= amount * (1 - (d / (radius + seg.radius)) * 0.7);
        if (seg.health <= 0) {
          const dir = Math.max(d, 1);
          this.detachSegment(seg,
            ((p.x - x) / dir) * amount * 0.4,
            amount * 0.5,
            ((p.z - z) / dir) * amount * 0.4);
          if (seg.spec.tag === "dam") this.onDamDamage();
          else if (seg.spec.tag === "tower" || seg.spec.tag === "bridge") {
            this.log(`STRUCTURAL FAILURE — ${seg.spec.tag} segment collapsed.`, "warn");
          }
        }
      }
    }
  }

  private supportCheck(): void {
    // A segment whose support below is gone becomes dynamic (progressive collapse).
    const alive = new Map<string, boolean>();
    for (const s of this.segments) {
      if (!s.dynamic && !s.dead) alive.set(`${s.building}:${s.spec.level}`, true);
    }
    for (const s of this.segments) {
      if (s.dynamic || s.dead || s.spec.level === 0) continue;
      if (s.spec.tag !== "tower") continue;
      if (!alive.get(`${s.building}:${s.spec.level - 1}`)) {
        s.health -= s.maxHealth * 0.5;
        if (s.health <= 0) {
          this.detachSegment(s, (this.rng.next() - 0.5) * 400, 100, (this.rng.next() - 0.5) * 400);
          this.log("PROGRESSIVE COLLAPSE — upper floors lost support.", "warn");
        }
      }
    }
  }

  /* ============================== WATER LEVEL ============================== */

  waterLevelAt(x: number, z: number): number {
    let lvl = this.seaLevel;
    if (this.floodLevel > lvl && this.terrain.height(x, z) < this.floodLevel) lvl = this.floodLevel;
    if (this.reservoirLevel > lvl && x > -116 && x < DAM_X && z > -74 && z < -50) lvl = this.reservoirLevel;
    return lvl;
  }

  private onDamDamage(): void {
    const intact = this.segments.some((s) => s.spec.tag === "dam" && !s.dynamic && !s.dead);
    if (!intact && !this.damBreached) {
      this.damBreached = true;
      this.log("DAM BREACHED — reservoir draining through the canyon. Flash flood downstream!", "alert");
      this.audio.explosion(1);
      this.trauma = Math.min(1, this.trauma + 0.5);
    } else if (!this.damBreached) {
      this.log("Dam integrity compromised.", "warn");
    }
  }

  /* ============================== FIELDS ============================== */

  spawnVortex(x: number, y: number, z: number, radius: number, swirl: number): void {
    if (this.vortices.length >= 4) {
      const old = this.vortices.shift()!;
      this.fieldGroup.remove(old.mesh);
      old.mat.dispose();
    }
    const field: VortexField = {
      kind: "vortex", id: allocId(), x, y, z,
      radius, swirl, inward: swirl * 0.35, vertical: -6, axisY: 1,
    };
    const mat = makeFunnelMaterial();
    const h = Math.max(6, radius * 0.8);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.12, h, 40, 6, true), mat);
    mesh.position.set(x, y - h / 2 + 1, z);
    this.fieldGroup.add(mesh);
    this.vortices.push({ field, mesh, mat, h });
    this.wells.push({ kind: "well", id: field.id, x, y: y - 2, z, strength: swirl * 1.2, radius: radius * 1.4, softening: 4 });
    this.log(`Whirlpool formed — ${radius.toFixed(0)}m vortex. Watch the velocity field.`, "sys");
  }

  spawnBlackHole(x: number, y: number, z: number, horizon = 3): void {
    if (this.holes.length >= 3) {
      const old = this.holes.shift()!;
      this.fieldGroup.remove(old.group);
    }
    const field: BlackHoleField = {
      kind: "blackhole", id: allocId(), x, y, z,
      mass: 2600 * horizon, horizon, diskRadius: horizon * 7,
    };
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(horizon, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const diskMat = makeDiskMaterial();
    const disk = new THREE.Mesh(new THREE.RingGeometry(horizon * 1.5, field.diskRadius, 64, 6), diskMat);
    disk.rotation.x = -Math.PI / 2;
    const glowTex = makeGlowTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x8877ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.setScalar(horizon * 9);
    group.add(sphere, disk, sprite);
    group.position.set(x, y, z);
    this.fieldGroup.add(group);
    this.holes.push({ field, group, diskMat });
    this.log("SINGULARITY — event horizon stable. Lensing engaged. Do not feed it the city.", "alert");
    this.audio.portal();
  }

  placePortal(click: { x: number; y: number; z: number; nx: number; ny: number; nz: number }): void {
    if (!this.pendingPortalA) {
      this.pendingPortalA = click;
      this.log("Portal entrance fixed. Click again to place the exit.", "sys");
      return;
    }
    if (this.portals.length >= 2) {
      const old = this.portals.shift()!;
      this.fieldGroup.remove(old.groupA, old.groupB);
    }
    const a = this.pendingPortalA;
    this.pendingPortalA = null;
    // exit hovers above the clicked point and pours downward
    const pair: PortalPair = {
      id: allocId(),
      ax: a.x + a.nx * 1.2, ay: a.y + a.ny * 1.2, az: a.z + a.nz * 1.2,
      anx: a.nx, any: a.ny, anz: a.nz,
      bx: click.x, by: click.y + 7, bz: click.z,
      bnx: 0, bny: -1, bnz: 0,
      radius: 3.2,
    };
    const matA = makePortalMaterial(0.08);
    const matB = makePortalMaterial(0.55);
    const mkGroup = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, mat: THREE.ShaderMaterial) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(pair.radius, 48), mat);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(pair.radius, 0.18, 10, 48),
        new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
      g.add(disc, rim);
      g.position.set(px, py, pz);
      this.tmpV.set(nx, ny, nz);
      g.lookAt(px + nx, py + ny, pz + nz);
      return g;
    };
    const groupA = mkGroup(pair.ax, pair.ay, pair.az, pair.anx, pair.any, pair.anz, matA);
    const groupB = mkGroup(pair.bx, pair.by, pair.bz, pair.bnx, pair.bny, pair.bnz, matB);
    this.fieldGroup.add(groupA, groupB);
    this.portals.push({ pair, groupA, groupB, matA, matB });
    this.log("WORMHOLE LINKED — matter, momentum and water now transit the pair.", "sys");
    this.audio.portal();
  }

  addFire(x: number, y: number, z: number, radius: number, fuel: number): void {
    if (this.fires.length >= 12) this.fires.shift();
    this.fires.push({ id: allocId(), x, y, z, radius, fuel, maxFuel: fuel });
  }

  explosion(x: number, y: number, z: number, radius: number, power: number, crater = 0): void {
    // rigid bodies
    for (const b of this.bodies) {
      if (b.fixed || b.dead) continue;
      const p = b.body.translation();
      const dx = p.x - x; const dy = p.y - y; const dz = p.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) {
        const k = power * (1 - d / radius) * b.body.mass() * 0.02;
        b.body.applyImpulse({
          x: (dx / Math.max(d, 1)) * k,
          y: k * 0.9 + k * 0.3,
          z: (dz / Math.max(d, 1)) * k,
        }, true);
      }
    }
    // fluid kick
    const s = this.solver;
    for (let i = 0; i < s.n; i++) {
      const dx = s.px[i] - x; const dy = s.py[i] - y; const dz = s.pz[i] - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) {
        const k = power * 0.12 * (1 - d / radius);
        s.vx[i] += (dx / Math.max(d, 0.5)) * k;
        s.vy[i] += (dy / Math.max(d, 0.5)) * k + k * 0.4;
        s.vz[i] += (dz / Math.max(d, 0.5)) * k;
        s.temp[i] += k * 4;
      }
    }
    this.damageAt(x, y, z, radius, power * 0.6);
    if (crater > 0) {
      this.terrain.dent(x, z, radius * 0.7, -crater);
      this.terrain.refreshFoamTexture();
      this.terrain.refreshMesh();
      this.rebuildGroundCollider();
      this.terrain.colliderDirty = false;
    }
    const am = this.aeroMul();
    this.glow.burst(x, y + 1, z, Math.floor(40 * am), {
      speed: radius * 0.8, up: radius * 0.5, life: 0.7, size: 3, grow: 1.5,
      r: 1, g: 0.75, b: 0.4, alpha: 0.9, grav: 2, drag: 2.5,
    });
    this.smoke.burst(x, y + 2, z, Math.floor(46 * am), {
      speed: radius * 0.5, up: radius * 0.4, life: 2.6, size: 3.4, grow: 2.4,
      r: 0.25, g: 0.23, b: 0.22, alpha: 0.6, grav: -2.5, drag: 1.4,
    });
    this.flashLight.position.set(x, y + 4, z);
    this.flashLight.intensity = 9000;
    this.trauma = Math.min(1, this.trauma + power * 0.002);
    this.audio.explosion(power * 0.01);
  }

  /* ============================== STEP ============================== */

  private aeroMul(): number {
    return TIERS[this.tier].aero;
  }

  private step(): void {
    const t0 = performance.now();
    this.time += STEP;

    // --- weather / environment dynamics ---
    this.updateEnvironment(STEP);

    // --- rebuild proxies from bodies ---
    this.proxies.length = 0;
    for (const b of this.bodies) {
      if (b.dead) continue;
      const p = b.body.translation();
      const v = b.fixed ? null : b.body.linvel();
      const mass = b.fixed ? 0 : b.body.mass();
      this.proxies.push({
        id: b.id, x: p.x, y: p.y, z: p.z, radius: b.radius,
        vx: v ? v.x : 0, vy: v ? v.y : 0, vz: v ? v.z : 0,
        invMass: mass > 0 ? 1 / mass : 0,
      });
    }

    // --- continuous emitters (SPH only; FLIP pours via tools/spawn boxes) ---
    if (!this.flipMode) this.runEmitters(STEP);

    // --- fluid ---
    if (this.flipMode && this.flipEngine) {
      this.stepFlip(STEP);
    } else {
    const ctx = this.sphCtx;
    ctx.dt = STEP;
    ctx.time = this.time;
    ctx.gravityY = -9.81 * this.gravityScale;
    ctx.ambientC = this.ambientC;
    ctx.windX = Math.cos(this.windDir) * this.windSpeed;
    ctx.windZ = Math.sin(this.windDir) * this.windSpeed;
    ctx.windY = 0;
    ctx.windDrag = 0.1;
    (ctx.vortices as VortexField[]).length = 0;
    for (const v of this.vortices) (ctx.vortices as VortexField[]).push(v.field);
    (ctx.holes as BlackHoleField[]).length = 0;
    for (const h of this.holes) (ctx.holes as BlackHoleField[]).push(h.field);
    (ctx.portals as PortalPair[]).length = 0;
    for (const p of this.portals) (ctx.portals as PortalPair[]).push(p.pair);
    this.fx.length = 0;
    this.push.length = 0;
    const tier = TIERS[this.tier];
    ctx.quality.iterations = tier.iters;
    ctx.quality.activeLimit = tier.limit;
    this.solver.step(ctx);
    this.solver.cullDistant(this.camera.position.x, this.camera.position.y, this.camera.position.z, 190, tier.limit);
    this.applyWaterBodies(STEP);
    this.consumeFx();
    this.applyPush();
    }

    // --- bodies: buoyancy, fields, portals, capture ---
    this.stepBodies(STEP);

    // --- rapier ---
    this.rapier.timestep = STEP;
    this.rapier.step();

    // --- structures ---
    this.supportT += STEP;
    if (this.supportT > 0.5) {
      this.supportT = 0;
      this.supportCheck();
      this.floodLoading();
    }

    // --- fires ---
    this.stepFires(STEP);

    // --- erosion sampling ---
    this.erosionT += STEP;
    if (this.erosionT > 0.4) {
      this.erosionT = 0;
      this.erodeFromFlow();
    }

    // --- terrain collider maintenance ---
    this.colliderT += STEP;
    if (this.terrain.colliderDirty && this.colliderT > 2.5) {
      this.colliderT = 0;
      this.terrain.colliderDirty = false;
      this.terrain.refreshFoamTexture();
      this.terrain.refreshMesh();
      this.rebuildGroundCollider();
    }

    // --- cleanup dead ---
    if (this.bodies.length > 0) {
      for (let i = this.bodies.length - 1; i >= 0; i--) {
        const b = this.bodies[i];
        if (b.dead) { this.bodies.splice(i, 1); continue; }
        if (!b.fixed) {
          const p = b.body.translation();
          if (p.y < -45 || Math.abs(p.x) > 400 || Math.abs(p.z) > 400) this.removeBody(b);
        }
      }
      // debris cap: recycle oldest debris
      let debris = 0;
      for (const b of this.bodies) if (b.kind === "debris" && !b.fixed) debris++;
      const cap = this.tier === 0 ? 240 : 150;
      if (debris > cap) {
        for (const b of this.bodies) {
          if (b.kind === "debris" && !b.fixed) { this.removeBody(b); break; }
        }
      }
      for (let i = this.segments.length - 1; i >= 0; i--) {
        if (this.segments[i].dead) this.segments.splice(i, 1);
      }
    }

    this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  private updateEnvironment(dt: number): void {
    // weather easing
    this.stormAmt = lerp(this.stormAmt, this.stormTarget, Math.min(1, dt * 0.8));
    this.rainRate = lerp(this.rainRate, this.rainTarget, Math.min(1, dt * 1.2));
    this.snowRate = lerp(this.snowRate, this.snowTarget, Math.min(1, dt * 1.2));
    this.windSpeed = lerp(this.windSpeed, this.windTarget, Math.min(1, dt * 0.6));
    this.windDir += dt * 0.01;
    // sea + flood
    this.seaLevel = lerp(this.seaLevel, this.seaTarget, Math.min(1, dt * 0.5));
    if (this.weather === "rain" || this.weather === "storm") {
      this.floodTarget = Math.max(this.floodTarget, 7.4);
    } else if (this.floodTarget > -50 && this.floodTarget < 7.5) {
      this.floodTarget = Math.max(-50, this.floodTarget - dt * 0.35); // drainage
    }
    // whirlpools drain floodwater
    if (this.vortices.length > 0 && this.floodTarget > -20) {
      this.floodTarget -= dt * 0.4 * this.vortices.length;
    }
    this.floodLevel = lerp(this.floodLevel, this.floodTarget, Math.min(1, dt * 0.55));
    // reservoir drainage after breach
    if (this.damBreached && this.reservoirLevel > 0.6) {
      this.reservoirLevel = Math.max(0.6, this.reservoirLevel - dt * 0.22);
    }
    // freeze scenario
    if (this.freezeActive) {
      this.freezeT -= dt;
      this.ambientC = lerp(this.ambientC, -30, Math.min(1, dt * 0.4));
      if (this.freezeT <= 0) {
        this.freezeActive = false;
        this.log("Thaw — ambient temperature recovering.", "sys");
      }
    } else if (this.weather === "snow") {
      this.ambientC = lerp(this.ambientC, -6, Math.min(1, dt * 0.3));
    } else {
      this.ambientC = lerp(this.ambientC, 18, Math.min(1, dt * 0.1));
    }
    // quake
    if (this.quakeT > 0) {
      this.quakeT -= dt;
      this.trauma = Math.min(1, this.trauma + dt * 2);
      const s = this.solver;
      for (let i = 0; i < s.n; i += 3) {
        s.vx[i] += (this.rng.next() - 0.5) * 30 * dt;
        s.vz[i] += (this.rng.next() - 0.5) * 30 * dt;
      }
      if (this.rng.next() < dt * 3) {
        for (const b of this.bodies) {
          if (!b.fixed && !b.dead && b.body.translation().y < 30) {
            b.body.applyImpulse({ x: (this.rng.next() - 0.5) * 60, y: 30, z: (this.rng.next() - 0.5) * 60 }, false);
          }
        }
        const seg = this.segments[Math.floor(this.rng.next() * this.segments.length)];
        if (seg && !seg.dynamic) {
          seg.health -= seg.maxHealth * 0.08;
          if (seg.health <= 0) this.detachSegment(seg, 0, 50, 0);
        }
      }
    }
    // lightning
    if (this.weather === "storm") {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 3 + this.rng.next() * 6;
        this.strike();
      }
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
  }

  private runEmitters(dt: number): void {
    const s = this.solver;
    const limit = TIERS[this.tier].limit;
    // waterfall (mountain spring into the reservoir)
    s.emit(-110, 13.5, -62, 2.5, -2, (this.rng.next() - 0.5), 0, this.ambientC, 1.4, Math.floor(90 * dt) + 1, limit);
    if (this.fx.length < 200 && this.rng.next() < dt * 20) {
      this.fx.push({ kind: "mist", x: -108, y: 9.5, z: -62 + (this.rng.next() - 0.5) * 3, s: 2 });
    }
    // spillway trickle below the dam (or raging torrent after breach)
    if (!this.damBreached) {
      s.emit(DAM_X + 2.5, 5, -62, 4, -1, 0, 0, this.ambientC, 1.2, Math.floor(24 * dt) + 1, limit);
    } else if (this.reservoirLevel > 3) {
      const n = Math.floor(420 * dt) + 2;
      s.emit(this.breachX + 2, this.reservoirLevel - 1.5, -62, 13, -2, 0, 0, this.ambientC, 3.2, n, limit);
      this.floodTarget = Math.max(this.floodTarget, 4.2);
    }
    // rain injection
    if (this.rainRate > 0.05 && s.n < limit) {
      const n = Math.min(Math.floor(160 * this.rainRate * dt) + 1, 8);
      for (let k = 0; k < n; k++) {
        const x = this.rng.range(-110, 45);
        const z = this.rng.range(-110, 110);
        const gy = Math.max(this.terrain.height(x, z), this.waterLevelAt(x, z));
        if (gy > 0.5) s.emit(x, gy + 0.4, z, 0, -4, 0, 0, this.ambientC, 0.5, 1, limit);
      }
    }
    // hose tool
    if (this.toolHeld && this.tool === "hose" && this.toolHasPoint) {
      const dir = this.tmpV.copy(this.toolPoint).sub(this.camera.position).normalize();
      const f = FLUIDS[this.fluidKey] ?? FLUIDS.water;
      const temp = f.id === 3 ? 1100 : f.id === 5 ? -180 : this.ambientC;
      const n = Math.floor(300 * dt) + 2;
      s.emit(this.toolPoint.x, this.toolPoint.y + 0.5, this.toolPoint.z,
        dir.x * 20, dir.y * 20 + 3, dir.z * 20, f.id, temp, 0.8, n, limit);
      this.audio.splash(6);
    }
  }

  /** Slow SPH particles inside bulk water bodies (ocean / flood / reservoir). */
  private applyWaterBodies(dt: number): void {
    const s = this.solver;
    for (let i = 0; i < s.n; i++) {
      const x = s.px[i]; const y = s.py[i]; const z = s.pz[i];
      const wl = this.waterLevelAt(x, z);
      if (y < wl - 0.4 && y > wl - 14) {
        const k = 1 - Math.min(0.85, 2.2 * dt);
        s.vx[i] *= k; s.vy[i] *= k; s.vz[i] *= k;
        s.vy[i] += 1.5 * dt; // slight buoyancy toward the surface
        const sp = Math.abs(s.vy[i]);
        if (sp > 5) s.foam[i] = Math.min(1, s.foam[i] + dt * 2);
      }
    }
    if (s.impactSum > 30) this.audio.splash(s.impactSum * 0.05);
    s.impactSum = 0;
  }

  private consumeFx(): void {
    const am = this.aeroMul();
    for (const e of this.fx) {
      if (e.kind === "steam") {
        this.smoke.spawn({
          x: e.x, y: e.y, z: e.z, vx: (this.rng.next() - 0.5) * 2, vy: 2.5, vz: (this.rng.next() - 0.5) * 2,
          life: 1.6, size: 1.2 * e.s, grow: 2, r: 0.85, g: 0.9, b: 0.92,
          alpha: 0.4 * am + 0.1, grav: -1.5, drag: 1.2,
        });
      } else if (e.kind === "mist") {
        this.smoke.spawn({
          x: e.x, y: e.y, z: e.z, vx: (this.rng.next() - 0.5) * 3, vy: 1, vz: (this.rng.next() - 0.5) * 3,
          life: 0.9, size: 0.9 * e.s, grow: 1.6, r: 0.75, g: 0.86, b: 0.9,
          alpha: 0.35 * am + 0.08, grav: 0.5, drag: 1.8,
        });
      } else if (e.kind === "smoke") {
        this.smoke.spawn({
          x: e.x, y: e.y, z: e.z, vx: 0, vy: 3, vz: 0,
          life: 2.2, size: 1.4, grow: 2.2, r: 0.2, g: 0.19, b: 0.2,
          alpha: 0.5, grav: -2, drag: 1.2,
        });
      } else if (e.kind === "ember") {
        this.glow.spawn({
          x: e.x, y: e.y, z: e.z, vx: (this.rng.next() - 0.5) * 4, vy: 4, vz: (this.rng.next() - 0.5) * 4,
          life: 0.8, size: 0.5, grow: 0.2, r: 1, g: 0.45, b: 0.1,
          alpha: 0.9, grav: 2, drag: 1,
        });
      } else if (e.kind === "flash") {
        this.glow.spawn({
          x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0,
          life: 0.35, size: 2 * e.s, grow: 1.2, r: 0.7, g: 0.8, b: 1,
          alpha: 0.8, grav: 0, drag: 0,
        });
      }
    }
  }

  private applyPush(): void {
    if (this.push.length === 0) return;
    const byId = new Map<number, BodyRec>();
    for (const b of this.bodies) if (!b.fixed && !b.dead) byId.set(b.id, b);
    for (const p of this.push) {
      const b = byId.get(p.proxy);
      if (!b) continue;
      const m = p.ix * p.ix + p.iy * p.iy + p.iz * p.iz;
      if (m < 1e-8) continue;
      if (b.body.isSleeping() && m < 4) continue;
      b.body.applyImpulse({ x: p.ix * 8, y: p.iy * 8, z: p.iz * 8 }, true);
    }
  }

  private stepBodies(dt: number): void {
    for (const b of this.bodies) {
      if (b.fixed || b.dead) continue;
      b.age += dt;
      const p = b.body.translation();
      const sleeping = b.body.isSleeping();
      const wl = this.waterLevelAt(p.x, p.z);
      const sub = clamp((wl - (p.y - b.radius)) / (2 * b.radius), 0, 1);
      const moving = sub > 0.01 || !sleeping;
      if (!moving && b.age > 2) continue;

      b.body.resetForces(false);
      const v = b.body.linvel();

      if (sub > 0) {
        if (sleeping) b.body.wakeUp();
        // buoyancy: full displaced weight; rapier gravity provides the sinking side
        const fb = 1025 * 9.81 * this.gravityScale * b.volume * sub;
        b.body.addForce({ x: 0, y: fb, z: 0 }, false);
        // drag toward local fluid velocity
        const wv = { x: 0, y: 0, z: 0 };
        const w = this.solver.sampleVelocity(p.x, p.y, p.z, wv);
        const k = b.dragK * sub * b.volume * (0.4 + Math.min(1, w * 0.2));
        b.body.addForce({ x: (wv.x - v.x) * k, y: (wv.y - v.y) * k * 0.6, z: (wv.z - v.z) * k }, false);
        // flood current follows terrain gradient
        const gx = (this.terrain.height(p.x + 1.5, p.z) - this.terrain.height(p.x - 1.5, p.z)) / 3;
        const gz = (this.terrain.height(p.x, p.z + 1.5) - this.terrain.height(p.x, p.z - 1.5)) / 3;
        b.body.addForce({ x: -gx * sub * b.volume * 3000, y: 0, z: -gz * sub * b.volume * 3000 }, false);
        const av = b.body.angvel();
        b.body.setAngvel({ x: av.x * (1 - dt * sub * 2), y: av.y * (1 - dt * sub), z: av.z * (1 - dt * sub * 2) }, false);
        // splash on entry
        if (b.wasSub < 0.2 && sub > 0.35 && v.y < -4) {
          this.audio.splash(-v.y * 2);
          this.smoke.burst(p.x, wl + 0.5, p.z, Math.floor(8 * this.aeroMul()), {
            speed: 4, up: 4, life: 0.8, size: 1.2, grow: 1.4,
            r: 0.8, g: 0.9, b: 0.92, alpha: 0.5, grav: 4, drag: 1.5,
          });
          // shove nearby fluid aside (displacement)
          const s = this.solver;
          for (let i = 0; i < s.n; i += 2) {
            const dx = s.px[i] - p.x; const dz = s.pz[i] - p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < b.radius * b.radius * 4 && Math.abs(s.py[i] - wl) < 3) {
              const d = Math.max(Math.sqrt(d2), 0.5);
              s.vx[i] += (dx / d) * -v.y * 0.3;
              s.vz[i] += (dz / d) * -v.y * 0.3;
            }
          }
        }
        // boat wake
        if (b.kind === "boat") {
          const sp = Math.sqrt(v.x * v.x + v.z * v.z);
          if (sp > 2.5 && this.rng.next() < dt * sp * 2) {
            this.smoke.spawn({
              x: p.x - v.x * 0.4, y: wl + 0.3, z: p.z - v.z * 0.4,
              vx: -v.x * 0.1, vy: 0.8, vz: -v.z * 0.1,
              life: 1.1, size: 1, grow: 2, r: 0.85, g: 0.92, b: 0.93,
              alpha: 0.4, grav: 0.5, drag: 1.5,
            });
          }
        }
      }
      b.wasSub = sub;

      // wind on exposed bodies
      const wx = Math.cos(this.windDir) * this.windSpeed;
      const wz = Math.sin(this.windDir) * this.windSpeed;
      if (Math.abs(wx) + Math.abs(wz) > 6) {
        b.body.addForce({ x: wx * b.volume * 1.5 * (1 - sub * 0.7), y: 0, z: wz * b.volume * 1.5 * (1 - sub * 0.7) }, false);
      }

      // vortices + wells + black holes
      for (const vv of this.vortices) {
        const f = vv.field;
        const dx = p.x - f.x; const dz = p.z - f.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < f.radius && d > 0.5) {
          const fall = 1 - d / f.radius;
          const m = b.body.mass();
          b.body.addForce({
            x: ((-dz / d) * f.swirl - (dx / d) * f.inward) * fall * m * 0.4,
            y: f.vertical * fall * m * 0.3,
            z: ((dx / d) * f.swirl - (dz / d) * f.inward) * fall * m * 0.4,
          }, false);
        }
      }
      for (const w of this.wells) {
        const dx = w.x - p.x; const dy = w.y - p.y; const dz = w.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz + w.softening;
        const d = Math.sqrt(d2);
        if (d < w.radius && d > 0.5) {
          const m = b.body.mass();
          const s = (w.strength / d2) * (1 - d / w.radius) * m;
          b.body.addForce({ x: (dx / d) * s, y: (dy / d) * s, z: (dz / d) * s }, false);
        }
      }
      for (const hv of this.holes) {
        const f = hv.field;
        const dx = f.x - p.x; const dy = f.y - p.y; const dz = f.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz + 4;
        const d = Math.sqrt(d2);
        if (d < f.horizon * 1.2) {
          this.glow.burst(p.x, p.y, p.z, 12, {
            speed: 6, up: 2, life: 0.5, size: 1.5, grow: 1,
            r: 0.6, g: 0.5, b: 1, alpha: 0.9, grav: 0, drag: 1,
          });
          this.log(`${b.kind.toUpperCase()} crossed the event horizon.`, "alert");
          this.removeBody(b);
          break;
        }
        const m = b.body.mass();
        const s = (f.mass / d2) * m * 0.12;
        b.body.addForce({ x: (dx / d) * s, y: (dy / d) * s, z: (dz / d) * s }, true);
      }
      if (b.dead) continue;

      // portals
      for (const pv of this.portals) {
        const pt = pv.pair;
        for (const side of [0, 1]) {
          const cx = side === 0 ? pt.ax : pt.bx;
          const cy = side === 0 ? pt.ay : pt.by;
          const cz = side === 0 ? pt.az : pt.bz;
          const nx = side === 0 ? pt.anx : pt.bnx;
          const ny = side === 0 ? pt.any : pt.bny;
          const nz = side === 0 ? pt.anz : pt.bnz;
          const ox = p.x - cx; const oy = p.y - cy; const oz = p.z - cz;
          const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
          const along = ox * nx + oy * ny + oz * nz;
          // crossing detected by proximity + velocity toward plane
          const vn = v.x * nx + v.y * ny + v.z * nz;
          if (dist < pt.radius && Math.abs(along) < 1.2 && vn < -0.5) {
            const tx = side === 0 ? pt.bx : pt.ax;
            const tyy = side === 0 ? pt.by : pt.ay;
            const tz = side === 0 ? pt.bz : pt.az;
            const tnx = side === 0 ? pt.bnx : pt.anx;
            const tny = side === 0 ? pt.bny : pt.any;
            const tnz = side === 0 ? pt.bnz : pt.anz;
            // rotate velocity from entrance frame to exit frame
            const q = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(nx, ny, nz), new THREE.Vector3(tnx, tny, tnz));
            const vel = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(q);
            b.body.setTranslation({ x: tx + tnx * 1.5, y: tyy + tny * 1.5, z: tz + tnz * 1.5 }, true);
            b.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
            this.audio.portal();
            break;
          }
        }
      }

      // meteor impact
      if (b.kind === "meteor") {
        const gy = this.terrain.height(p.x, p.z);
        if (p.y < gy + 3 || b.age > 14) {
          this.log("IMPACT — meteor struck the surface. Crater formed, fires ignited.", "alert");
          this.explosion(p.x, Math.max(p.y, gy + 1), p.z, 20, 320, 4.5);
          for (let k = 0; k < 3; k++) {
            this.addFire(p.x + (this.rng.next() - 0.5) * 16, gy + 1, p.z + (this.rng.next() - 0.5) * 16, 3.5, 40);
          }
          this.removeBody(b);
        }
      }
    }
  }

  private floodLoading(): void {
    // Floodwater loads structures; saturated soil weakens foundations.
    if (this.floodLevel < -20 && this.seaLevel < 0.5) return;
    for (const s of this.segments) {
      if (s.dynamic || s.dead || s.spec.level !== 0) continue;
      const p = s.body.translation();
      const wl = this.waterLevelAt(p.x, p.z);
      const depth = wl - (p.y - s.spec.sy / 2);
      if (depth > 1.5) {
        s.health -= depth * 1.2;
        if (s.health <= 0) {
          this.detachSegment(s, 0, 100, 0);
          this.log(`FOUNDATION FAILURE — ${s.spec.tag} undermined by floodwater.`, "warn");
        }
      }
    }
  }

  private stepFires(dt: number): void {
    const s = this.solver;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      // count water particles inside (suppression)
      let wet = 0;
      const samples = Math.min(160, s.n);
      for (let k = 0; k < samples; k++) {
        const j = Math.floor(this.rng.next() * s.n);
        const dx = s.px[j] - f.x; const dy = s.py[j] - f.y; const dz = s.pz[j] - f.z;
        if (dx * dx + dy * dy + dz * dz < f.radius * f.radius) wet++;
      }
      const suppress = samples > 0 ? wet / samples : 0;
      f.fuel -= dt * (0.8 + suppress * 60);
      if (f.fuel <= 0) {
        this.smoke.burst(f.x, f.y, f.z, 10, {
          speed: 2, up: 3, life: 1.5, size: 1.5, grow: 2, r: 0.5, g: 0.52, b: 0.55,
          alpha: 0.5, grav: -2, drag: 1.2,
        });
        if (suppress > 0.02) this.log("Fire suppressed by water — steam vented.", "sys");
        this.fires.splice(i, 1);
        continue;
      }
      const am = this.aeroMul();
      if (this.rng.next() < dt * 30 * am) {
        this.glow.spawn({
          x: f.x + (this.rng.next() - 0.5) * f.radius, y: f.y, z: f.z + (this.rng.next() - 0.5) * f.radius,
          vx: (this.rng.next() - 0.5) * 2, vy: 3 + this.rng.next() * 3, vz: (this.rng.next() - 0.5) * 2,
          life: 0.5 + this.rng.next() * 0.4, size: 0.9, grow: 0.4,
          r: 1, g: 0.35 + this.rng.next() * 0.3, b: 0.08, alpha: 0.9, grav: -3, drag: 1,
        });
      }
      if (this.rng.next() < dt * 8 * am) {
        this.smoke.spawn({
          x: f.x, y: f.y + 2, z: f.z, vx: 0, vy: 4, vz: 0,
          life: 2.4, size: 1.6, grow: 2.4, r: 0.16, g: 0.15, b: 0.15,
          alpha: 0.55, grav: -2.5, drag: 1,
        });
      }
    }
    // assign fire lights to the two largest fires
    const sorted = [...this.fires].sort((a, b2) => b2.fuel - a.fuel);
    for (let l = 0; l < this.fireLights.length; l++) {
      const f = sorted[l];
      if (f) {
        this.fireLights[l].position.set(f.x, f.y + 2, f.z);
        this.fireLights[l].intensity = 300 + Math.sin(this.time * 23 + l * 9) * 120;
      } else {
        this.fireLights[l].intensity = 0;
      }
    }
  }

  private erodeFromFlow(): void {
    const s = this.solver;
    if (s.n === 0) return;
    let touched = 0;
    const samples = Math.min(260, s.n);
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(this.rng.next() * s.n);
      const sp2 = s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i];
      if (sp2 > 25) {
        const th = this.terrain.height(s.px[i], s.pz[i]);
        if (s.py[i] < th + 1.2) {
          this.terrain.dent(s.px[i], s.pz[i], 1.6, -0.012);
          touched++;
        }
      }
      if (k % 4 === 0) this.terrain.stampWet(s.px[i], s.pz[i], 0.25, 1);
    }
    if (touched > 40) this.terrain.colliderDirty = true;
  }

  private strike(): void {
    const cx = this.orbit.tx + (this.rng.next() - 0.5) * 120;
    const cz = this.orbit.tz + (this.rng.next() - 0.5) * 120;
    const gy = Math.max(this.terrain.height(cx, cz), this.waterLevelAt(cx, cz));
    // bolt polyline
    const pos = this.bolt.geometry.getAttribute("position") as THREE.BufferAttribute;
    let x = cx; let z = cz;
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      pos.setXYZ(i, x + (this.rng.next() - 0.5) * (1 - t) * 14, gy + 90 * (1 - t), z + (this.rng.next() - 0.5) * (1 - t) * 14);
      x += (this.rng.next() - 0.5) * 6;
      z += (this.rng.next() - 0.5) * 6;
    }
    pos.needsUpdate = true;
    this.boltLife = 0.16;
    (this.bolt.material as THREE.LineBasicMaterial).opacity = 1;
    this.compMat.uniforms.uFlash.value = 1;
    this.skyMat.uniforms.uFlash.value = 1;
    this.flashLight.position.set(cx, gy + 30, cz);
    this.flashLight.intensity = 12000;
    const dist = Math.sqrt((cx - this.camera.position.x) ** 2 + (cz - this.camera.position.z) ** 2);
    this.audio.thunder(Math.min(2500, (dist / 340) * 1000));
    this.explosion(cx, gy + 1, cz, 5, 26, 0);
    if (this.rng.next() < 0.5) this.addFire(cx, gy + 0.5, cz, 2.5, 25);
  }

  /* ============================== SCENARIOS ============================== */

  runScenario(id: ScenarioId): void {
    switch (id) {
      case "dam": {
        this.log("Scenario: DAM BREAK — full structural load on the monoliths.", "sys");
        this.damageAt(DAM_X, 6, -62, 14, 4000);
        break;
      }
      case "flood": {
        this.floodTarget = 10.5;
        this.setWeather("rain");
        this.log("Scenario: MEGAFLOOD — storm drains overwhelmed, streets filling.", "alert");
        break;
      }
      case "storm": {
        this.setWeather("storm");
        this.log("Scenario: SUPERSTORM — seek high ground.", "alert");
        break;
      }
      case "whirlpool": {
        this.spawnVortex(72, this.seaLevel, 8, 16, 26);
        break;
      }
      case "blackhole": {
        this.spawnBlackHole(88, 26, -6, 3);
        break;
      }
      case "portal": {
        // entrance under the waterfall, exit pouring over the plaza
        this.pendingPortalA = { x: -108, y: 8.6, z: -62, nx: 0, ny: 1, nz: 0 };
        this.placePortal({ x: -4, y: 6, z: 12, nx: 0, ny: 1, nz: 0 });
        this.log("Scenario: PORTAL RIVER — the falls now pour onto the plaza.", "sys");
        break;
      }
      case "tsunami": {
        this.seaTarget = 2.6;
        this.floodTarget = Math.max(this.floodTarget, 8.6);
        const s = this.solver;
        const limit = TIERS[this.tier].limit;
        for (let z = -70; z <= 70; z += 2.2) {
          for (let y = 0; y <= 6; y += 2.2) {
            s.emit(104, y, z, -26, 1, 0, 1, this.ambientC, 1.6, 2, limit);
          }
        }
        this.log("TSUNAMI — wave train inbound from the east. Surge +2.6m.", "alert");
        this.audio.explosion(0.8);
        window.setTimeout(() => { if (!this.dead) { this.seaTarget = SEA_LEVEL; this.floodTarget = -50; } }, 30000);
        break;
      }
      case "meteor": {
        const m = this.spawnBall(78, 130, -30, 3, "rock", "meteor", -30, -35, 4, true);
        void m;
        this.log("Scenario: IMPACT EVENT — kinetic kill vehicle inbound.", "alert");
        break;
      }
      case "freeze": {
        this.freezeActive = true;
        this.freezeT = 45;
        this.log("Scenario: DEEP FREEZE — ambient dropping to −30°C. Water will ice over.", "sys");
        break;
      }
      case "quake": {
        this.quakeT = 8;
        this.log("EARTHQUAKE — magnitude 7.8. Structures under seismic load.", "alert");
        this.audio.thunder(0);
        break;
      }
      case "reset": {
        this.resetWorld();
        break;
      }
    }
  }

  private resetWorld(): void {
    for (const b of [...this.bodies]) {
      if (!b.fixed || (b as SegmentRec).dynamic) this.removeBody(b);
    }
    // restore fractured segments by rebuilding the city group dynamics
    for (const s of [...this.segments]) {
      if (s.dynamic && !s.dead) {
        this.removeBody(s);
      }
    }
    // re-add any destroyed segments as fixed
    const plan = planCity(4242);
    const existing = new Set(this.segments.filter((s) => !s.dead).map((s) => `${s.spec.x},${s.spec.y},${s.spec.z}`));
    let bi = 5000;
    for (const spec of plan.segments) {
      if (!existing.has(`${spec.x},${spec.y},${spec.z}`)) {
        this.addSegment(spec, bi++, spec.tag === "dam" || spec.tag === "bridge");
      }
    }
    this.solver.clear();
    this.fires.length = 0;
    this.vortices.length = 0;
    this.wells.length = 0;
    this.holes.length = 0;
    this.portals.length = 0;
    this.fieldGroup.clear();
    this.floodTarget = -50;
    this.floodLevel = -50;
    this.damBreached = false;
    this.reservoirLevel = 9;
    this.setWeather("clear");
    this.spawnBoat(74, 0, 26, 0.4);
    this.spawnCar(-16, 7, 12, 0);
    this.log("World reset — seed restored, structures rebuilt, reservoir refilled.", "sys");
  }

  /* ============================== FLIP / WEBGPU ENGINE ============================== */

  /**
   * Switch to the FLIP (WebGPU) engine. One-way per session: a canvas can only
   * ever hold one context type, so a fresh canvas is created for the WebGPU
   * renderer. Exit the lab to get back to the SPH (WebGL) world.
   */
  async setEngine(mode: "sph" | "flip"): Promise<void> {
    if (mode === "flip") await this.enterFlipMode();
  }

  private async enterFlipMode(): Promise<void> {
    if (this.flipMode || this.dead) return;
    const nav = navigator as Navigator & { gpu?: { requestAdapter?: (o?: object) => Promise<unknown> } };
    if (!nav.gpu?.requestAdapter) {
      this.log("FLIP needs WebGPU — this browser doesn't expose navigator.gpu. Staying on SPH.", "err");
      return;
    }
    let adapter: unknown = null;
    try { adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" }); } catch { /* no adapter */ }
    if (!adapter) {
      this.log("No WebGPU adapter found — staying on SPH.", "err");
      return;
    }

    // 1. fresh canvas for the WebGPU context
    const c2 = document.createElement("canvas");
    c2.className = this.canvas.className;
    c2.style.cssText = this.canvas.style.cssText;
    const oldCanvas = this.canvas;
    this.canvas.replaceWith(c2);
    this.canvas = c2;
    this.detachInput();
    this.attachInput();

    // 2. release the WebGL context held by the old canvas
    try {
      const gl = (this.renderer.getContext?.() as WebGLRenderingContext | null) ?? null;
      const lose = gl?.getExtension?.("WEBGL_lose_context") as { loseContext?: () => void } | null;
      lose?.loseContext?.();
    } catch { /* ignore */ }
    this.renderer.dispose();

    // 3. WebGPU renderer (constructor lives in the three/webgpu chunk)
    let wgpu: WebGPURenderer | null = null;
    try {
      const webgpuMod = await import("three/webgpu");
      wgpu = new webgpuMod.WebGPURenderer({ canvas: c2, antialias: false });
      wgpu.toneMapping = THREE.NoToneMapping;
      await wgpu.init();
      const device = (wgpu.backend as unknown as { device?: GPUDevice | null }).device ?? null;
      if (!device) throw new Error("WebGPU device unavailable");

      this.renderer = wgpu;
      const w = c2.clientWidth || window.innerWidth;
      const h = c2.clientHeight || window.innerHeight;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);

      this.flipEngine = new FlipEngine(device, this.flipSettings);
      // lazy chunk: three/webgpu + three/tsl only load when FLIP mode is entered
      const flipMod = await import("./flip/FlipRenderer");
      this.flipRender = new flipMod.FlipRenderer(
        wgpu, this.scene, this.camera, this.flipEngine.fluidTexture,
        [this.flipEngine.originX, this.flipEngine.originY, this.flipEngine.originZ],
        this.flipEngine.n * this.flipEngine.h, this.flipRenderSettings,
      );
      this.flipRender.setSize(w, h);

      // hide visuals that depend on WebGL-only (ShaderMaterial / SPH) pipelines
      this.hiddenInFlip.length = 0;
      const hide = (o: THREE.Object3D | null | undefined) => {
        if (!o || !o.visible) return;
        o.visible = false;
        this.hiddenInFlip.push(o);
      };
      hide((this as { oceanMesh?: THREE.Mesh }).oceanMesh);
      hide(this.reservoirMesh);
      hide(this.points);
      hide(this.smoke.points);
      hide(this.glow.points);
      hide(this.fieldGroup);
      hide(this.skyMesh);

      // terrain material uses onBeforeCompile (WebGL only) -> swap a clean clone
            const tm = this.terrain.material.clone();
      (tm as unknown as { onBeforeCompile: unknown }).onBeforeCompile = null;
      (tm as unknown as { customProgramCacheKey: unknown }).customProgramCacheKey = () => "aqua-terrain-flip";
      this.terrain.mesh.material = tm;

      this.flipMode = true;
      this.resize();
      oldCanvas.remove();
      this.flipSpawnFluid("water");
      this.log(
        "FLIP ENGINE online — 3D MAC grid, hybrid FLIP/PIC, red-black Gauss-Seidel pressure, " +
        "screen-space refraction / extinction / Fresnel. Buildings are visual-only here; " +
        "exit the lab to return to SPH.",
        "sys",
      );
    } catch (err) {
      // renderer may be alive but fluid pipeline failed: render scene directly
      this.flipMode = wgpu !== null;
      this.flipEngine = null;
      this.flipRender = null;
      this.log(`FLIP init failed: ${(err as Error).message}`, "err");
      if (this.flipMode) {
        this.hiddenInFlip.length = 0;
        const hide = (o: THREE.Object3D | null | undefined) => {
          if (!o || !o.visible) return;
          o.visible = false;
          this.hiddenInFlip.push(o);
        };
        hide((this as { oceanMesh?: THREE.Mesh }).oceanMesh);
        hide(this.reservoirMesh);
        hide(this.points);
        hide(this.smoke.points);
        hide(this.glow.points);
        hide(this.fieldGroup);
        hide(this.skyMesh);
                const tm = this.terrain.material.clone();
        (tm as unknown as { onBeforeCompile: unknown }).onBeforeCompile = null;
        (tm as unknown as { customProgramCacheKey: unknown }).customProgramCacheKey = () => "aqua-terrain-flip";
        this.terrain.mesh.material = tm;
        this.resize();
        oldCanvas.remove();
      } else {
        // nothing survived — surface the failure
        oldCanvas.remove();
        this.cb.onLog("FLIP mode unavailable on this device.", "err");
      }
    }
  }

  /** One FLIP sub-step: engine + coupling params from the live world. */
  private stepFlip(dt: number): void {
    const e = this.flipEngine;
    if (!e) return;
    const t0 = performance.now();

    // dynamic rigid bodies -> collision spheres for the particle kernel
    const bodies: { x: number; y: number; z: number; radius: number; vx: number; vy: number; vz: number }[] = [];
    for (const b of this.bodies) {
      if (b.fixed || b.dead || bodies.length >= 16) continue;
      const p = b.body.translation();
      const v = b.body.linvel();
      bodies.push({ x: p.x, y: p.y, z: p.z, radius: b.radius, vx: v.x, vy: v.y, vz: v.z });
    }

    // hose / blob tools pour FLIP fluid at the pick point
    if (this.toolHeld && (this.tool === "hose" || this.tool === "water") && this.toolHasPoint) {
      const f = FLUIDS[this.fluidKey] ?? FLUIDS.water;
      const [fid, temp] = this.flipFluidId(f.id);
      const hp = this.toolPoint;
      e.spawnBox(hp.x - 2, hp.y + 0.5, hp.z - 2, hp.x + 2, hp.y + 4.5, hp.z + 2, fid, temp, 220, 0.42);
      this.audio.splash(6);
    }

    e.step(dt, this.time, {
      gravityX: 0, gravityY: -9.81 * this.gravityScale, gravityZ: 0,
      windX: Math.cos(this.windDir) * this.windSpeed, windY: 0,
      windZ: Math.sin(this.windDir) * this.windSpeed, windDrag: 0.1,
      ambientC: this.ambientC,
      camX: this.camera.position.x, camY: this.camera.position.y, camZ: this.camera.position.z,
      terrainHeight: (x, z) => this.terrain.height(x, z),
      bodies,
      wells: this.wells,
      vortices: this.vortices.map((v) => v.field),
      holes: this.holes.map((h) => h.field),
    });

    this.simMs = this.simMs * 0.9 + (e.stats.ms + (performance.now() - t0)) * 0.1;
  }

  /** SPH fluid id -> [FLIP fluid id, temperature °C]. FLIP space: 0 water, 1 oil, 2 steam, 3 ice, 4+ lava. */
  private flipFluidId(id: number): [number, number] {
    switch (id) {
      case 0: case 1: return [0, this.ambientC];
      case 2: return [1, this.ambientC];
      case 3: return [4, 1000];
      case 5: return [3, -18];
      default: return [0, this.ambientC];
    }
  }

  /** Spawn a bulk FLIP fluid box (lab action buttons). */
  flipSpawnFluid(kind: "water" | "lava" | "oil" | "ice" | "steam" | "clear"): void {
    const e = this.flipEngine;
    if (!e) return;
    switch (kind) {
      case "water":
        e.spawnBox(-16, 6, -16, 16, 20, 16, 0, this.ambientC, 110000, 0.55);
        this.log("FLIP: 110k water particles released into the basin.", "sys");
        break;
      case "lava":
        e.spawnBox(-46, 2, 18, -34, 9, 30, 4, 1000, 24000, 0.5);
        this.log("FLIP: magma flow — watch it sink, cool and glow.", "sys");
        break;
      case "oil":
        e.spawnBox(24, 4, -38, 36, 9, -26, 1, this.ambientC, 21000, 0.55);
        this.log("FLIP: crude oil released — it rides on the water.", "sys");
        break;
      case "ice":
        e.spawnBox(-10, 4, -10, 10, 12, 10, 3, -18, 42000, 0.5);
        this.log("FLIP: glacial ice calved into the basin.", "sys");
        break;
      case "steam":
        e.spawnBox(-6, 8, -6, 6, 18, 6, 2, 140, 13000, 0.5);
        this.log("FLIP: steam plume rising on buoyancy.", "sys");
        break;
      case "clear":
        e.clearParticles();
        this.log("FLIP: particle field cleared.", "sys");
        break;
    }
  }

  setFlipSettings(p: Partial<FlipSettings>): void {
    const g = p.grid;
    if (g !== undefined && g !== this.flipSettings.grid) {
      // grid resolution needs a fresh engine — applied on next FLIP entry
      this.flipSettings.grid = g;
      this.log(`FLIP grid ${g} queued — applied on the next FLIP entry.`, "sys");
      return;
    }
    this.flipSettings = { ...this.flipSettings, ...p };
    this.flipEngine?.setSettings(p);
  }

  setFlipRender(p: Partial<FlipRenderSettings>): void {
    this.flipRenderSettings = { ...this.flipRenderSettings, ...p };
    this.flipRender?.setSettings(p);
  }

  /* ============================== WEATHER / RAIN ============================== */

  private initRainSnow(): void {
    this.rainPos = new Float32Array(this.rainDrops * 6);
    this.rainVel = new Float32Array(this.rainDrops * 4);
    for (let i = 0; i < this.rainDrops; i++) {
      this.rainVel[i * 4] = (Math.random() - 0.5) * 220;
      this.rainVel[i * 4 + 1] = Math.random() * 70;
      this.rainVel[i * 4 + 2] = (Math.random() - 0.5) * 220;
      this.rainVel[i * 4 + 3] = 42 + Math.random() * 14;
    }
    this.rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    const rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({
      color: 0x9fc4d8, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    rain.frustumCulled = false;
    rain.renderOrder = 12;
    this.scene.add(rain);
    (this as { rainObj?: THREE.Object3D }).rainObj = rain;

    this.snowPos = new Float32Array(this.snowN * 3);
    for (let i = 0; i < this.snowN; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 220;
      this.snowPos[i * 3 + 1] = Math.random() * 60;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 220;
    }
    this.snowGeo.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3));
    const snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({
      color: 0xe8f2ff, size: 0.4, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    snow.frustumCulled = false;
    this.scene.add(snow);
    (this as { snowObj?: THREE.Object3D }).snowObj = snow;
  }

  private updateRainSnow(dt: number): void {
    const rainObj = (this as { rainObj?: THREE.Object3D }).rainObj;
    const snowObj = (this as { snowObj?: THREE.Object3D }).snowObj;
    const active = Math.floor(TIERS[this.tier].rain * Math.min(1, this.rainRate));
    if (rainObj) rainObj.visible = active > 10;
    if (snowObj) snowObj.visible = this.snowRate > 0.05;
    if (active > 10) {
      const cx = this.orbit.tx; const cz = this.orbit.tz;
      const wx = Math.cos(this.windDir) * this.windSpeed;
      const wz = Math.sin(this.windDir) * this.windSpeed;
      for (let i = 0; i < active; i++) {
        let x = this.rainVel[i * 4];
        let y = this.rainVel[i * 4 + 1];
        let z = this.rainVel[i * 4 + 2];
        const sp = this.rainVel[i * 4 + 3];
        y -= sp * dt;
        x += wx * dt * 0.55;
        z += wz * dt * 0.55;
        const gy = this.terrain.height(cx + x, cz + z);
        if (y < gy) {
          x = (Math.random() - 0.5) * 220;
          y = 60 + Math.random() * 10;
          z = (Math.random() - 0.5) * 220;
          if (Math.random() < 0.002) this.terrain.stampWet(cx + x, cz + z, 0.1, 1);
        }
        this.rainVel[i * 4] = x; this.rainVel[i * 4 + 1] = y; this.rainVel[i * 4 + 2] = z;
        this.rainPos[i * 6] = cx + x;
        this.rainPos[i * 6 + 1] = y;
        this.rainPos[i * 6 + 2] = cz + z;
        this.rainPos[i * 6 + 3] = cx + x - wx * 0.028;
        this.rainPos[i * 6 + 4] = y + sp * 0.028;
        this.rainPos[i * 6 + 5] = cz + z - wz * 0.028;
      }
      this.rainGeo.setDrawRange(0, active * 2);
      (this.rainGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    if (snowObj?.visible) {
      const cx = this.orbit.tx; const cz = this.orbit.tz;
      for (let i = 0; i < this.snowN; i++) {
        let y = this.snowPos[i * 3 + 1] - (2 + (i % 5) * 0.5) * dt;
        let x = this.snowPos[i * 3] + Math.sin(this.time * 2 + i) * dt * 2;
        if (y < this.terrain.height(cx + x, cz + this.snowPos[i * 3 + 2])) {
          y = 55 + Math.random() * 8;
          x = (Math.random() - 0.5) * 220;
          this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 220;
        }
        this.snowPos[i * 3] = x;
        this.snowPos[i * 3 + 1] = y;
      }
      (this.snowGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      if (snowObj) {
        snowObj.position.set(cx, 0, cz);
      }
    }
  }

  /* ============================== INPUT / TOOLS ============================== */

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", this.onContextMenu);
    c.addEventListener("touchstart", this.onTouchStart, { passive: false });
    c.addEventListener("touchmove", this.onTouchMove, { passive: false });
    c.addEventListener("touchend", this.onTouchEnd);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
  }

  /** Remove canvas-bound input listeners (window listeners stay). */
  private detachInput(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContextMenu);
    c.removeEventListener("touchstart", this.onTouchStart);
    c.removeEventListener("touchmove", this.onTouchMove);
    c.removeEventListener("touchend", this.onTouchEnd);
  }

  private onResize = (): void => this.resize();

  private onContextMenu = (e: Event): void => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    this.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      this.setPaused(!this.paused);
    } else if (e.code === "KeyV") {
      const modes: CameraMode[] = ["orbit", "fly", "follow"];
      this.setCameraMode(modes[(modes.indexOf(this.camMode) + 1) % 3]);
    } else if (e.code === "Escape") {
      this.select(null);
      this.pendingPortalA = null;
    } else if (e.code === "Backspace" && this.selected) {
      this.removeBody(this.selected);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private setNdc(e: PointerEvent | Touch): void {
    const r = this.canvas.getBoundingClientRect();
    const cx = (e as PointerEvent).clientX ?? (e as Touch).clientX;
    const cy = (e as PointerEvent).clientY ?? (e as Touch).clientY;
    this.pointerNdc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  private pickSurface(): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hitT = this.raycaster.intersectObject(this.terrain.mesh, false)[0];
    // water plane fallback
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Math.max(this.seaLevel, this.floodLevel > -20 ? this.floodLevel : -100));
    const wp = new THREE.Vector3();
    const hitW = this.raycaster.ray.intersectPlane(plane, wp);
    if (hitT) {
      const n = hitT.face?.normal ?? new THREE.Vector3(0, 1, 0);
      if (hitW && hitW.y > hitT.point.y + 0.5 && wp.distanceTo(this.camera.position) < hitT.distance) {
        return { x: wp.x, y: wp.y, z: wp.z, nx: 0, ny: 1, nz: 0 };
      }
      return { x: hitT.point.x, y: hitT.point.y, z: hitT.point.z, nx: n.x, ny: n.y, nz: n.z };
    }
    if (hitW) return { x: wp.x, y: wp.y, z: wp.z, nx: 0, ny: 1, nz: 0 };
    return null;
  }

  private pickBody(): BodyRec | null {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const b of this.bodies) {
      if (!b.dead) b.mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.rec) return o.userData.rec as BodyRec;
        o = o.parent;
      }
    }
    return null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    this.setNdc(e);
    this.dragging = true;
    this.dragButton = e.button;
    this.dragMoved = 0;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    if (e.button === 0) {
      if (this.camMode === "fly") {
        // click (no drag) fires the tool at screen center on pointer-up
        return;
      }
      this.fireTool();
      this.toolHeld = true;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.setNdc(e);
    if (!this.dragging) {
      const hit = this.pickSurface();
      if (hit) {
        this.toolPoint.set(hit.x, hit.y, hit.z);
        this.toolHasPoint = true;
      }
      return;
    }
    const dx = e.clientX - this.lastPX;
    const dy = e.clientY - this.lastPY;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);

    if (this.dragButton === 2 || this.dragButton === 1 || (this.dragButton === 0 && this.camMode === "fly")) {
      // camera drag
      if (this.camMode === "orbit" || this.camMode === "follow") {
        if (this.dragButton === 1 || this.keys.has("ShiftLeft")) {
          const s = this.orbit.dist * 0.0012;
          const yaw = this.orbit.yaw;
          this.orbit.tx -= (dx * Math.cos(yaw) - dy * Math.sin(yaw) * 0) * s;
          this.orbit.tz -= (-dx * Math.sin(yaw)) * s * -1;
          this.orbit.ty = clamp(this.orbit.ty + dy * s, -10, 120);
          this.orbit.tx = clamp(this.orbit.tx, -140, 140);
          this.orbit.tz = clamp(this.orbit.tz, -140, 140);
        } else {
          this.orbit.yaw -= dx * 0.005;
          this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.005, 0.05, 1.5);
        }
      } else {
        this.fly.yaw -= dx * 0.004;
        this.fly.pitch = clamp(this.fly.pitch - dy * 0.004, -1.4, 1.4);
      }
    } else if (this.dragButton === 0) {
      const hit = this.pickSurface();
      if (hit) {
        this.toolPoint.set(hit.x, hit.y, hit.z);
        this.toolHasPoint = true;
      }
      if (this.tool === "push" && hit) this.pushAt(hit.x, hit.y, hit.z, 60);
    }
  };

  private onPointerUp = (): void => {
    if (this.dragButton === 0 && this.camMode === "fly" && this.dragMoved < 6) {
      // click in fly mode: cast from screen center
      this.pointerNdc.set(0, 0);
      this.fireTool();
    }
    this.dragging = false;
    this.toolHeld = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const k = 1 + Math.sign(e.deltaY) * 0.1;
    if (this.camMode === "fly") {
      const sp = this.keys.has("ShiftLeft") ? 3 : 1;
      this.fly.x -= Math.sin(this.fly.yaw) * Math.cos(this.fly.pitch) * e.deltaY * 0.05 * sp;
      this.fly.z -= Math.cos(this.fly.yaw) * Math.cos(this.fly.pitch) * e.deltaY * 0.05 * sp;
      this.fly.y += Math.sin(this.fly.pitch) * e.deltaY * 0.05 * sp;
    } else {
      this.orbit.dist = clamp(this.orbit.dist * k, 8, 420);
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.audio.unlock();
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (this.touches.size === 1) {
      const t = e.changedTouches[0];
      this.setNdc(t);
      this.fireTool();
      this.toolHeld = true;
    } else if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      this.toolHeld = false;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchD > 0) this.orbit.dist = clamp(this.orbit.dist * (this.pinchD / d), 8, 420);
      this.pinchD = d;
    } else if (this.touches.size === 1) {
      const t = e.changedTouches[0];
      this.setNdc(t);
      const hit = this.pickSurface();
      if (hit) {
        this.toolPoint.set(hit.x, hit.y, hit.z);
        this.toolHasPoint = true;
        if (this.tool === "push") this.pushAt(hit.x, hit.y, hit.z, 60);
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier);
    if (this.touches.size === 0) this.toolHeld = false;
    this.pinchD = 0;
  };

  private fireTool(): void {
    const hit = this.pickSurface();
    const limit = TIERS[this.tier].limit;
    const s = this.solver;
    switch (this.tool) {
      case "inspect": {
        const b = this.pickBody();
        this.select(b);
        break;
      }
      case "hose":
        if (hit) {
          this.toolPoint.set(hit.x, hit.y, hit.z);
          this.toolHasPoint = true;
        }
        break;
      case "push":
        if (hit) this.pushAt(hit.x, hit.y, hit.z, 220);
        break;
      case "demolish":
        if (hit) {
          this.damageAt(hit.x, hit.y, hit.z, 7, 1500);
          this.terrain.dent(hit.x, hit.z, 3, -0.4);
          this.terrain.colliderDirty = true;
          this.audio.crack();
        }
        break;
      case "ignite":
        if (hit) {
          this.addFire(hit.x, hit.y + 0.5, hit.z, 3, 35);
          this.log("Ignition — fuel + oxygen + heat. Water suppresses it.", "sys");
        }
        break;
      case "water":
        if (hit) {
          const f = FLUIDS[this.fluidKey] ?? FLUIDS.water;
          if (this.flipMode && this.flipEngine) {
            const [fid, temp] = this.flipFluidId(f.id);
            this.flipEngine.spawnBox(hit.x - 3, hit.y + 1, hit.z - 3, hit.x + 3, hit.y + 7, hit.z + 3, fid, temp, 3000, 0.5);
          } else {
            const temp = f.id === 3 ? 1100 : f.id === 5 ? -180 : this.ambientC;
            s.emit(hit.x, hit.y + 3, hit.z, 0, 0, 0, f.id, temp, 3.5, 130, limit);
          }
        }
        break;
      case "debris":
        if (hit) {
          for (let k = 0; k < 5; k++) {
            this.spawnBox(hit.x + (this.rng.next() - 0.5) * 6, hit.y + 8 + k * 2, hit.z + (this.rng.next() - 0.5) * 6,
              1.5, 1.5, 1.5, ["concrete", "wood", "steel"][k % 3], "debris");
          }
        }
        break;
      case "boat":
        if (hit) {
          const wl = Math.max(this.waterLevelAt(hit.x, hit.z), this.terrain.height(hit.x, hit.z) + 2);
          this.spawnBoat(hit.x, wl + 1.5, hit.z, this.rng.next() * 6);
        }
        break;
      case "car":
        if (hit) this.spawnCar(hit.x, hit.y + 2, hit.z, this.rng.next() * 6);
        break;
      case "portal":
        if (hit) this.placePortal(hit);
        break;
      case "blackhole":
        if (hit) this.spawnBlackHole(hit.x, clamp(hit.y + 14, 10, 60), hit.z, 2.5);
        break;
      case "whirlpool":
        if (hit) {
          const wl = this.waterLevelAt(hit.x, hit.z);
          this.spawnVortex(hit.x, Math.max(wl, hit.y), hit.z, 10, 16);
        }
        break;
    }
  }

  private pushAt(x: number, y: number, z: number, power: number): void {
    for (const b of this.bodies) {
      if (b.fixed || b.dead) continue;
      const p = b.body.translation();
      const dx = p.x - x; const dy = p.y - y; const dz = p.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 9) {
        const k = power * (1 - d / 9) * b.body.mass() * 0.004;
        b.body.applyImpulse({ x: (dx / Math.max(d, 1)) * k, y: k * 0.5 + 2, z: (dz / Math.max(d, 1)) * k }, true);
      }
    }
    const s = this.solver;
    for (let i = 0; i < s.n; i++) {
      const dx = s.px[i] - x; const dy = s.py[i] - y; const dz = s.pz[i] - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 9) {
        const k = power * 0.02 * (1 - d / 9);
        s.vx[i] += (dx / Math.max(d, 0.5)) * k;
        s.vy[i] += (dy / Math.max(d, 0.5)) * k + k * 0.3;
        s.vz[i] += (dz / Math.max(d, 0.5)) * k;
      }
    }
  }

  /* ============================== SELECTION ============================== */

  select(b: BodyRec | null): void {
    this.selected = b;
    if (this.selectBox) {
      this.scene.remove(this.selectBox);
      this.selectBox = null;
    }
    if (!b || b.dead) {
      this.cb.onSelect(null);
      return;
    }
    this.selectBox = new THREE.BoxHelper(b.mesh, 0x7fe8ff);
    this.scene.add(this.selectBox);
    const p = b.body.translation();
    const v = b.fixed ? { x: 0, y: 0, z: 0 } : b.body.linvel();
    const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const seg = b as SegmentRec;
    const hp = seg.maxHealth ? ` HP ${(100 * seg.health / seg.maxHealth).toFixed(0)}%` : "";
    const mass = b.fixed ? "∞" : `${b.body.mass().toFixed(0)}kg`;
    this.cb.onSelect(
      `${b.kind.toUpperCase()} #${b.id}${hp}\n` +
      `mass ${mass} · speed ${sp.toFixed(1)} m/s\n` +
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}\n` +
      `submerged ${(100 * b.wasSub).toFixed(0)}%`,
    );
  }

  /* ============================== FRAME ============================== */

  private frame(t: number): void {
    const frameDt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;

    // fixed-step accumulator
    if (!this.paused || this.stepRequested) {
      this.acc += (this.paused ? STEP : frameDt * this.timeScale);
      let steps = 0;
      while (this.acc >= STEP && steps < 4) {
        this.step();
        this.acc -= STEP;
        steps++;
        if (this.paused) break;
      }
      if (steps === 4) this.acc = 0;
      this.stepRequested = false;
    }

    // camera
    this.updateCamera(frameDt);

    // visuals sync
    this.syncVisuals(frameDt);

    // render
    const under = this.camera.position.y < this.waterLevelAt(this.camera.position.x, this.camera.position.z);
    if (this.flipMode) {
      // FLIP pipeline: scene -> fluid -> bilateral blur x2 -> composite
      if (this.flipRender) {
        this.flipRender.update(this.time);
        this.flipRender.render();
      } else {
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      // SPH pipeline: scene -> RT -> composite -> screen
      const bh = this.holes;
      for (let i = 0; i < 3; i++) {
        const u = (this.compMat.uniforms.uLens.value as THREE.Vector4[])[i];
        const h = bh[i];
        if (h && this.lensing) {
          this.tmpV.set(h.field.x, h.field.y, h.field.z).project(this.camera);
          const dist = this.camera.position.distanceTo(this.tmpV2.set(h.field.x, h.field.y, h.field.z));
          const facing = this.tmpV.z < 1;
          u.set((this.tmpV.x * 0.5 + 0.5), (this.tmpV.y * 0.5 + 0.5),
            clamp((h.field.horizon * 7) / Math.max(dist, 1), 0.02, 0.5),
            facing ? clamp(h.field.mass / 5000, 0.3, 1.6) : 0);
        } else {
          u.set(0, 0, 0, 0);
        }
      }
      this.compMat.uniforms.uTime.value = this.time;
      this.compMat.uniforms.uAspect.value = this.canvas.width / Math.max(1, this.canvas.height);
      this.compMat.uniforms.uUnderwater.value = lerp(
        this.compMat.uniforms.uUnderwater.value as number, under ? 1 : 0, Math.min(1, frameDt * 6));
      this.compMat.uniforms.uFlash.value = lerp(this.compMat.uniforms.uFlash.value as number, 0, Math.min(1, frameDt * 7));
      this.skyMat.uniforms.uFlash.value = this.compMat.uniforms.uFlash.value;

      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.compScene, this.compCam);
    }

    // audio mix
    const flowEnergy = this.flipMode && this.flipEngine
      ? this.flipEngine.stats.meanSpeed * 8 + this.flipEngine.stats.maxSpeed * 1.5
      : this.solver.meanSpeed * Math.min(1, this.solver.n / 800) * 10;
    this.audio.update(flowEnergy + this.rainRate * 8, this.windSpeed, under);

    // auto quality tier
    this.tierT += frameDt;
    if (this.tierT > 2) {
      this.tierT = 0;
      if (this.fpsEma < 34 && this.tier < 2) {
        this.tier++;
        this.applyTier();
        this.log(`Performance governor: simulation tier ${this.tier} (graceful degradation).`, "warn");
      } else if (this.fpsEma > 55 && this.tier > this.baseTier) {
        this.tier--;
        this.applyTier();
      }
    }

    // stats
    this.statT += frameDt;
    if (this.statT > 0.25) {
      this.statT = 0;
      const fe = this.flipEngine && this.flipMode ? this.flipEngine : null;
      this.cb.onStats({
        fps: Math.round(this.fpsEma),
        simMs: this.simMs,
        particles: fe ? fe.stats.alive : this.solver.n,
        bodies: this.bodies.filter((b) => !b.fixed && !b.dead).length,
        volume: fe ? fe.stats.alive * 0.063 : this.solver.volumeM3,
        maxSpeed: fe ? fe.stats.maxSpeed : this.solver.maxSpeed,
        meanSpeed: fe ? fe.stats.meanSpeed : this.solver.meanSpeed,
        tier: this.tier,
        flood: this.floodLevel,
        ambient: this.ambientC,
        wind: this.windSpeed,
        calls: this.renderer.info.render.calls,
        tris: this.renderer.info.render.triangles,
        quality: this.baseTier === 0 ? "EXTREME" : "BALANCED",
      });
    }
  }

  private updateCamera(dt: number): void {
    if (this.camMode === "orbit" || this.camMode === "follow") {
      if (this.camMode === "follow" && this.selected && !this.selected.dead) {
        const p = this.selected.body.translation();
        this.orbit.tx = lerp(this.orbit.tx, p.x, Math.min(1, dt * 4));
        this.orbit.ty = lerp(this.orbit.ty, p.y + 2, Math.min(1, dt * 4));
        this.orbit.tz = lerp(this.orbit.tz, p.z, Math.min(1, dt * 4));
      }
      // WASD pans the target
      const sp = this.orbit.dist * 0.5 * dt;
      const yaw = this.orbit.yaw;
      if (this.keys.has("KeyW")) { this.orbit.tx -= Math.sin(yaw) * sp; this.orbit.tz -= Math.cos(yaw) * sp; }
      if (this.keys.has("KeyS")) { this.orbit.tx += Math.sin(yaw) * sp; this.orbit.tz += Math.cos(yaw) * sp; }
      if (this.keys.has("KeyA")) { this.orbit.tx -= Math.cos(yaw) * sp; this.orbit.tz += Math.sin(yaw) * sp; }
      if (this.keys.has("KeyD")) { this.orbit.tx += Math.cos(yaw) * sp; this.orbit.tz -= Math.sin(yaw) * sp; }
      if (this.keys.has("KeyE")) this.orbit.ty += sp;
      if (this.keys.has("KeyQ")) this.orbit.ty -= sp;
      const cp = Math.cos(this.orbit.pitch);
      const spt = Math.sin(this.orbit.pitch);
      const cy = Math.cos(this.orbit.yaw);
      const sy = Math.sin(this.orbit.yaw);
      this.camera.position.set(
        this.orbit.tx + this.orbit.dist * cp * sy,
        this.orbit.ty + this.orbit.dist * spt,
        this.orbit.tz + this.orbit.dist * cp * cy,
      );
      this.camera.lookAt(this.orbit.tx, this.orbit.ty, this.orbit.tz);
    } else {
      const sp = (this.keys.has("ShiftLeft") ? 60 : 22) * dt;
      const yaw = this.fly.yaw;
      const pitch = this.fly.pitch;
      const fx = -Math.sin(yaw) * Math.cos(pitch);
      const fz = -Math.cos(yaw) * Math.cos(pitch);
      const fy = Math.sin(pitch);
      if (this.keys.has("KeyW")) { this.fly.x += fx * sp; this.fly.y += fy * sp; this.fly.z += fz * sp; }
      if (this.keys.has("KeyS")) { this.fly.x -= fx * sp; this.fly.y -= fy * sp; this.fly.z -= fz * sp; }
      if (this.keys.has("KeyA")) { this.fly.x -= -fz * sp; this.fly.z -= fx * sp; }
      if (this.keys.has("KeyD")) { this.fly.x += -fz * sp; this.fly.z += fx * sp; }
      if (this.keys.has("KeyE") || this.keys.has("Space")) this.fly.y += sp;
      if (this.keys.has("KeyQ")) this.fly.y -= sp;
      this.camera.position.set(this.fly.x, this.fly.y, this.fly.z);
      this.camera.rotation.set(0, 0, 0);
      this.camera.rotateY(yaw);
      this.camera.rotateX(pitch);
    }
    // trauma shake
    if (this.trauma > 0.01) {
      const sh = this.trauma * this.trauma * 2.2;
      this.camera.position.x += (Math.random() - 0.5) * sh;
      this.camera.position.y += (Math.random() - 0.5) * sh;
      this.camera.position.z += (Math.random() - 0.5) * sh;
      if (this.quakeT > 0) {
        this.camera.position.x += Math.sin(this.time * 31) * sh * 0.6;
        this.camera.position.z += Math.cos(this.time * 27) * sh * 0.6;
      }
    }
  }

  private syncVisuals(dt: number): void {
    // bodies -> meshes
    for (const b of this.bodies) {
      if (b.dead || b.fixed) continue;
      const p = b.body.translation();
      const r = b.body.rotation();
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.selectBox && this.selected && !this.selected.dead) this.selectBox.update();

    // SPH -> points
    this.syncFluidPoints();

    // water visuals
    const ocean = (this as { oceanMesh?: THREE.Mesh }).oceanMesh;
    if (ocean) ocean.position.y = this.seaLevel;
    this.oceanMat.uniforms.uTime.value = this.time;
    this.oceanMat.uniforms.uStorm.value = this.stormAmt;
    this.oceanMat.uniforms.uSeaLevel.value = this.seaLevel;
    this.oceanMat.uniforms.uCamPos.value.copy(this.camera.position);
    this.oceanMat.uniforms.uIce.value = clamp((2 - this.ambientC) / 12, 0, 1);
    this.reservoirMesh.position.y = this.reservoirLevel;
    this.reservoirMesh.visible = this.reservoirLevel > 3.4;
    this.reservoirMat.uniforms.uTime.value = this.time * 0.6;
    this.reservoirMat.uniforms.uSeaLevel.value = this.reservoirLevel;
    this.reservoirMat.uniforms.uCamPos.value.copy(this.camera.position);
    this.reservoirMat.uniforms.uIce.value = this.oceanMat.uniforms.uIce.value;
    this.floodMesh.position.y = this.floodLevel;
    this.floodMesh.visible = this.floodLevel > -20;
    this.riverMat.map!.offset.x -= dt * (0.25 + this.stormAmt * 0.5 + (this.damBreached ? 1.2 : 0));

    // sky + fog + lights
    this.skyMat.uniforms.uTime.value = this.time;
    this.skyMat.uniforms.uStorm.value = this.stormAmt;
    const under = this.camera.position.y < this.waterLevelAt(this.camera.position.x, this.camera.position.z);
    const fog = this.scene.fog as THREE.FogExp2;
    if (under) {
      fog.color.setHex(0x062a30);
      fog.density = lerp(fog.density, 0.02, Math.min(1, dt * 5));
    } else if (this.stormAmt > 0.3) {
      fog.color.setHex(0x3a4550);
      fog.density = lerp(fog.density, 0.0032, Math.min(1, dt * 2));
    } else {
      fog.color.setHex(0x8aa5b5);
      fog.density = lerp(fog.density, 0.0016, Math.min(1, dt * 2));
    }
    this.oceanMat.uniforms.uFogColor.value.copy(fog.color);
    this.sun.intensity = lerp(2.6, 0.65, this.stormAmt);
    this.hemi.intensity = lerp(0.75, 0.4, this.stormAmt);
    this.flashLight.intensity = lerp(this.flashLight.intensity, 0, Math.min(1, dt * 9));

    // fields visuals
    for (const v of this.vortices) {
      v.mat.uniforms.uTime.value = this.time;
      v.mesh.rotation.y -= dt * 3;
      const wl = this.waterLevelAt(v.field.x, v.field.z);
      v.mesh.position.y = wl - v.h / 2 + 1;
      if (this.rng.next() < dt * 20 * this.aeroMul()) {
        const a = this.rng.next() * Math.PI * 2;
        const r = v.field.radius * (0.4 + this.rng.next() * 0.6);
        this.smoke.spawn({
          x: v.field.x + Math.cos(a) * r, y: wl + 0.5, z: v.field.z + Math.sin(a) * r,
          vx: -Math.sin(a) * 6, vy: 1, vz: Math.cos(a) * 6,
          life: 1, size: 1.2, grow: 1.5, r: 0.8, g: 0.9, b: 0.92,
          alpha: 0.4, grav: 1, drag: 1.5,
        });
      }
    }
    for (const h of this.holes) {
      h.diskMat.uniforms.uTime.value = this.time;
      h.group.rotation.y += dt * 0.4;
    }
    for (const p of this.portals) {
      p.matA.uniforms.uTime.value = this.time;
      p.matB.uniforms.uTime.value = this.time;
    }

    // aerosols
    const wx = Math.cos(this.windDir) * this.windSpeed;
    const wz = Math.sin(this.windDir) * this.windSpeed;
    this.smoke.update(this.paused ? 0 : dt * this.timeScale, wx, 0, wz);
    this.glow.update(this.paused ? 0 : dt * this.timeScale, wx, 0, wz);

    // rain / snow
    if (!this.paused) this.updateRainSnow(dt * this.timeScale);
    this.terrain.updateWet(dt, this.rainRate > 0.1);
    this.terrain.maint(dt);

    // bolt fade
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      (this.bolt.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.boltLife / 0.16);
    }
  }

  private syncFluidPoints(): void {
    const s = this.solver;
    const pos = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = this.points.geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const dat = this.points.geometry.getAttribute("aData") as THREE.BufferAttribute;
    const n = s.n;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i, s.px[i], s.py[i], s.pz[i]);
      const sp = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i]);
      let r: number; let g: number; let b: number;
      if (this.viz === "velocity") {
        const t = clamp(sp / 20, 0, 1);
        r = t < 0.5 ? t * 2 : 1;
        g = t < 0.5 ? t * 1.6 : 1.6 - t;
        b = t < 0.5 ? 1 - t : 0.2;
      } else if (this.viz === "pressure") {
        const t = clamp((s.densC[i] + 0.2) / 1.0, 0, 1);
        r = 0.3 + t * 0.9; g = 0.2 + t * 0.35; b = 0.9 - t * 0.6;
      } else if (this.viz === "temperature") {
        const t = clamp(s.temp[i] / 120, 0, 1);
        r = 0.2 + t; g = 0.35 + t * 0.3; b = 1 - t * 0.85;
        if (s.temp[i] > 500) { r = 1; g = 0.9; b = 0.6; }
      } else {
        const f = FLUID_LIST[s.fluid[i]] ?? FLUID_LIST[0];
        r = f.color[0]; g = f.color[1]; b = f.color[2];
        if (s.temp[i] > 500) { r = 1; g = 0.42; b = 0.1; }
      }
      col.setXYZ(i, r, g, b);
      const foamIce = s.ice[i] > 0.03 ? -s.ice[i] : s.foam[i];
      dat.setXYZ(i, 0.72 + s.foam[i] * 0.35, 0.82, foamIce);
    }
    this.points.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    dat.needsUpdate = true;
  }

  /* ============================== PUBLIC CONTROLS ============================== */

  setTool(t: ToolId): void {
    this.tool = t;
    this.pendingPortalA = null;
  }
  setFluid(f: string): void {
    this.fluidKey = f;
  }
  setViz(v: VizMode): void {
    this.viz = v;
  }
  setCameraMode(m: CameraMode): void {
    if (m === "fly") {
      this.fly.x = this.camera.position.x;
      this.fly.y = this.camera.position.y;
      this.fly.z = this.camera.position.z;
    }
    if (m === "follow" && this.selected) {
      const p = this.selected.body.translation();
      this.orbit.tx = p.x; this.orbit.ty = p.y; this.orbit.tz = p.z;
      this.orbit.dist = 24;
    }
    this.camMode = m;
  }
  setTimeScale(ts: number): void {
    this.timeScale = ts;
  }
  setPaused(p: boolean): void {
    this.paused = p;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  stepOnce(): void {
    this.stepRequested = true;
  }
  setWeather(w: WeatherId): void {
    this.weather = w;
    if (w === "clear") { this.rainTarget = 0; this.snowTarget = 0; this.stormTarget = 0; this.windTarget = 4; this.seaTarget = SEA_LEVEL; }
    else if (w === "rain") { this.rainTarget = 1; this.snowTarget = 0; this.stormTarget = 0.25; this.windTarget = 9; this.seaTarget = SEA_LEVEL; }
    else if (w === "storm") { this.rainTarget = 1; this.snowTarget = 0; this.stormTarget = 1; this.windTarget = 24; this.seaTarget = 0.8; }
    else { this.rainTarget = 0; this.snowTarget = 1; this.stormTarget = 0.15; this.windTarget = 6; this.seaTarget = SEA_LEVEL; }
  }
  setExtreme(on: boolean): void {
    this.baseTier = on ? 0 : 1;
    this.tier = this.baseTier;
    this.applyTier();
    this.log(on ? "EXTREME MODE — maximum fluid resolution, cinematic rendering." : "Balanced mode.", "sys");
  }
  setGravity(g: number): void {
    this.gravityScale = g;
    this.rapier.gravity.y = -9.81 * g;
  }
  setAmbientC(c: number): void {
    this.ambientC = c;
    this.freezeActive = false;
  }
  setWind(w: number): void {
    this.windTarget = w;
  }
  setFloodTarget(f: number): void {
    this.floodTarget = f;
  }
  setLensing(on: boolean): void {
    this.lensing = on;
  }
  setSound(on: boolean): void {
    this.audio.setEnabled(on);
  }

  private applyTier(): void {
    const t = TIERS[this.tier];
    const dpr = Math.min(window.devicePixelRatio || 1, t.pr);
    this.renderer.setPixelRatio(dpr);
    this.resize();
  }

  resize(): void {
    if (this.dead || !this.renderer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(Math.floor(w * pr), Math.floor(h * pr), {
      type: THREE.HalfFloatType,
      samples: this.tier === 2 ? 0 : 4,
      depthBuffer: true,
    });
    this.compMat.uniforms.tDiffuse.value = this.rt.texture;
    const hPx = Math.floor(h * pr);
    this.pointsMat.uniforms.uPixelRatio.value = pr;
    this.pointsMat.uniforms.uScale.value = hPx * 0.5;
    this.smoke.setPixelRatio(pr, hPx);
    this.glow.setPixelRatio(pr, hPx);
    if (this.flipMode && this.flipRender) this.flipRender.setSize(w, h);
  }

  /* ============================== DIAGNOSTICS ============================== */

  runDiagnostics(): void {
    this.log("Running engine self-tests…", "sys");
    // 1. determinism
    const a = new Rng("lab-seed");
    const b = new Rng("lab-seed");
    let det = true;
    for (let i = 0; i < 100; i++) if (a.next() !== b.next()) det = false;
    this.log(`[${det ? "PASS" : "FAIL"}] Deterministic RNG — 100/100 draws identical.`, det ? "ok" : "err");
    // 2. fluid conservation on a scratch solver
    try {
      const scratch = new FluidSolver(320, 7);
      scratch.emitBox(-4, 2, -4, 4, 8, 4, 0.62, 0, 20, 320);
      const before = scratch.n;
      const fx: SphFx[] = [];
      const push: SphPush[] = [];
      const qctx: SphContext = {
        dt: 1 / 60, time: 0, gravityX: 0, gravityY: -9.81, gravityZ: 0, ambientC: 20,
        windX: 0, windY: 0, windZ: 0, windDrag: 0,
        terrainHeight: () => 0,
        wells: [], vortices: [], holes: [], portals: [], proxies: [], fires: [],
        fx, push, quality: { iterations: 2, maxVel: 42, xsph: 0.09, activeLimit: 320 },
      };
      for (let i = 0; i < 24; i++) scratch.step(qctx);
      let nan = false;
      for (let i = 0; i < scratch.n; i++) {
        if (!isFinite(scratch.px[i] + scratch.py[i] + scratch.pz[i])) nan = true;
      }
      const conserved = scratch.n === before && !nan;
      this.log(`[${conserved ? "PASS" : "FAIL"}] Fluid conservation — ${before}→${scratch.n} particles, ` +
        `maxV ${scratch.maxSpeed.toFixed(1)} m/s, NaN: ${nan}.`, conserved ? "ok" : "err");
    } catch (err) {
      this.log(`[FAIL] Fluid conservation — ${(err as Error).message}`, "err");
    }
    // 3. portal transport on a scratch solver
    try {
      const scratch = new FluidSolver(8, 9);
      const fx: SphFx[] = [];
      const push: SphPush[] = [];
      const qctx: SphContext = {
        dt: 1 / 60, time: 0, gravityX: 0, gravityY: 0, gravityZ: 0, ambientC: 20,
        windX: 0, windY: 0, windZ: 0, windDrag: 0,
        terrainHeight: () => -50,
        wells: [], vortices: [], holes: [],
        portals: [{
          id: 1, ax: 0, ay: 5, az: 0, anx: 0, any: 1, anz: 0,
          bx: 40, by: 10, bz: 0, bnx: 0, bny: -1, bnz: 0, radius: 3,
        }],
        proxies: [], fires: [], fx, push,
        quality: { iterations: 2, maxVel: 42, xsph: 0.09, activeLimit: 8 },
      };
      scratch.emit(0, 6.5, 0, 0, -30, 0, 0, 20, 0.01, 1, 8);
      for (let i = 0; i < 12; i++) scratch.step(qctx);
      const dx = scratch.px[0] - 40;
      const ok = scratch.n === 1 && Math.abs(dx) < 6;
      this.log(`[${ok ? "PASS" : "FAIL"}] Portal transport — particle emerged at ` +
        `(${scratch.px[0].toFixed(1)}, ${scratch.py[0].toFixed(1)}, ${scratch.pz[0].toFixed(1)}).`, ok ? "ok" : "err");
    } catch (err) {
      this.log(`[FAIL] Portal transport — ${(err as Error).message}`, "err");
    }
    // 4. isolated rigid-body drop test (collision accuracy)
    try {
      const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      w.timestep = STEP;
      const gb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const tri = this.terrain.colliderTrimesh();
      w.createCollider(RAPIER.ColliderDesc.trimesh(tri.vertices, tri.indices).setFriction(1.0), gb);
      const bb = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 40, 0));
      w.createCollider(RAPIER.ColliderDesc.ball(1).setDensity(1000), bb);
      for (let i = 0; i < 150; i++) w.step();
      const restY = bb.translation().y;
      const expect = this.terrain.height(0, 0) + 1;
      const ok = Math.abs(restY - expect) < 1.6;
      this.log(`[${ok ? "PASS" : "FAIL"}] Collision accuracy — ball rests at ${restY.toFixed(2)}m ` +
        `(expected ${expect.toFixed(2)}m).`, ok ? "ok" : "err");
      w.free();
    } catch (err) {
      this.log(`[FAIL] Collision accuracy — ${(err as Error).message}`, "err");
    }
    this.log("Self-tests complete.", "sys");
  }

  private log(msg: string, kind: string): void {
    this.cb.onLog(msg, kind);
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContextMenu);
    c.removeEventListener("touchstart", this.onTouchStart);
    c.removeEventListener("touchmove", this.onTouchMove);
    c.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    try {
      this.rapier?.free();
    } catch { /* already freed */ }
    this.audio.dispose();
    this.terrain?.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.flipRender?.dispose();
    this.flipRender = null;
    this.flipEngine?.dispose();
    this.flipEngine = null;
    this.rt?.dispose();
    this.renderer?.dispose();
  }
}

/* ============================== texture helpers ============================== */

function makeFlowTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 32;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 128, 32);
  const rng = new Rng(5);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(220,240,245,${0.08 + rng.next() * 0.2})`;
    const w = 8 + rng.next() * 26;
    g.fillRect(rng.next() * 128, rng.next() * 32, w, 1 + rng.next() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(180,170,255,0.45)");
  grad.addColorStop(1, "rgba(120,110,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}


