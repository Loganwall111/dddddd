// Endless Potential — core world engine.
// A first-person infinite procedural physics sandbox: chunked worlds that get
// stranger with distance (downtown -> waterfront -> the Dislocated -> the
// Impossible -> deep space), a PBF-SPH water system, Rapier rigid bodies,
// ragdolls, glass fracture, explosions, portals, gravity wells and black
// holes with screen-space gravitational lensing.
//
// Reuses the Aqua Lab physics modules (SPH solver, aerosols, audio, sky /
// ocean / composite shaders, fields) as its simulation core.

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { FluidSolver, type SphContext, type SphFx, type SphPush } from "../aqua/sph";
import { AerosolSystem } from "../aqua/aerosols";
import { LabAudio } from "../aqua/labAudio";
import { makeDiskMaterial, makePortalMaterial } from "../aqua/shaders";
import { SOLIDS } from "../aqua/materials";
import { Rng, clamp, lerp } from "../aqua/rng";
import {
  allocId,
  type GravityWell, type VortexField, type BlackHoleField,
  type PortalPair, type BodyProxy, type FireSource,
} from "../aqua/fields";

export type BiomeId = "downtown" | "suburbs" | "towns" | "farms" | "forest" | "waterfront" | "hills" | "mountains" | "desert" | "plateau" | "dislocated" | "impossible" | "space";
export type WeatherId = "clear" | "rain" | "storm";

export interface EndlessStats {
  fps: number; simMs: number; particles: number; bodies: number; chunks: number;
  tris: number; calls: number; biome: string; dist: number; x: number; y: number; z: number;
  hp: number; timeScale: number; flying: boolean; dead: boolean; blackholes: number;
}

export interface EndlessCallbacks {
  onStats: (s: EndlessStats) => void;
  onLog: (msg: string, kind: string) => void;
  onDeath: (cause: string) => void;
  onBiome: (name: string) => void;
}

export type ToolId = "pistol" | "smg" | "shotgun" | "rifle" | "rocket" | "grenade" | "dynamite" | "singularity" | "water" | "crates" | "glass" | "portal" | "ragdoll";

export const HOTBAR_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "Q", "X"];

export const HOTBAR: { id: ToolId; label: string; glyph: string }[] = [
  { id: "pistol", label: "Pistol", glyph: "▮" },
  { id: "smg", label: "SMG", glyph: "▬" },
  { id: "shotgun", label: "Shotgun", glyph: "▭" },
  { id: "rifle", label: "Rifle", glyph: "≡" },
  { id: "rocket", label: "Rocket", glyph: "➤" },
  { id: "grenade", label: "Grenade", glyph: "◍" },
  { id: "dynamite", label: "Dynamite", glyph: "◆" },
  { id: "water", label: "Water blob", glyph: "≋" },
  { id: "crates", label: "Crate stack", glyph: "▣" },
  { id: "glass", label: "Glass wall", glyph: "◫" },
  { id: "portal", label: "Portal", glyph: "◎" },
  { id: "ragdoll", label: "Ragdoll", glyph: "✚" },
];

export const BIOME_NAMES: Record<BiomeId, string> = {
  downtown: "DOWNTOWN — THE MEGACITY",
  suburbs: "THE SUBURBS",
  towns: "RIVERBEND TOWNS",
  farms: "THE FARMLANDS",
  forest: "THE PINEMIST FOREST",
  waterfront: "THE GREAT COAST",
  hills: "THE HIGHLANDS",
  mountains: "THE MOTHER MOUNTAINS",
  desert: "THE AMBER DESERT",
  plateau: "THE STONE PLATEAU",
  dislocated: "THE DISLOCATED — ANOTHER REALITY",
  impossible: "THE IMPOSSIBLE — ANOTHER REALITY",
  space: "DEEP SPACE — ANOTHER REALITY",
};

const STEP = 1 / 60;
const CHUNK = 64;
const CHUNK_RADIUS = 3;
const SPH_CAP = 7000;
const PLAYER_MASS = 80;
const GRAVITY = 22;

/* ------------------------------ noise ------------------------------ */

function hash2(x: number, y: number, seed: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, seed: number, oct = 4): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, seed + i * 101) * amp; amp *= 0.5; f *= 2; }
  return v / 0.9375;
}
function mod(n: number, m: number): number { return ((n % m) + m) % m; }

/* --------------------------- record types --------------------------- */

interface ChunkRec {
  cx: number; cz: number;
  group: THREE.Group;
  colliders: RAPIER.Collider[];
  buildingSegs: number;
  heightAt: (x: number, z: number) => number;
}
interface DynRec {
  id: number;
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  kind: string;
  radius: number;
  volume: number;
  age: number;
  dead: boolean;
  fuse?: number;
  wasSub: number;
  debris?: boolean;
}
interface SegmentRec {
  id: number;
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  health: number;
  maxHealth: number;
  sx: number; sy: number; sz: number;
  chunk: string;
  dead: boolean;
}
interface GlassRec {
  id: number;
  mesh: THREE.Mesh;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  dead: boolean;
}
interface BHRec {
  x: number; y: number; z: number;
  mass: number; horizon: number;
  field: BlackHoleField;
  disk: THREE.Mesh;
  glow: THREE.Sprite;
  sphere: THREE.Mesh;
  diskMat: THREE.ShaderMaterial;
  born: number;
}
interface PortalVis {
  pair: PortalPair;
  groupA: THREE.Group;
  groupB: THREE.Group;
  matA: THREE.ShaderMaterial;
  matB: THREE.ShaderMaterial;
}
interface NpcRec {
  body: RAPIER.RigidBody;
  group: THREE.Group;
  head: THREE.Object3D | null;
  kind: string;
  top: number;
  target: THREE.Vector3;
  speed: number;
  sayT: number;
  lineIdx: number;
  alive: boolean;
}

interface Ragdoll {
  group: THREE.Group;
  bodies: RAPIER.RigidBody[];
  meshes: THREE.Object3D[];
  joints: RAPIER.ImpulseJoint[];
  scale: number;
  dead: boolean;
}
interface GrateRec { x: number; z: number; }
interface Shard { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; }
interface Shockwave { mesh: THREE.Mesh; age: number; max: number; }
interface Bomb { rec: DynRec; }

const SOLIDS_TEX: Record<string, string | undefined> = {
  concrete: "concrete", brick: "brick", wood: "wood", asphalt: "asphalt", glass: "glass", dirt: "dirt",
};

/* --------------------------- the engine --------------------------- */

export type ScenarioId = "blackhole" | "meteor" | "quake" | "flood" | "storm" | "volcano" | "sewer" | "tornado" | "glassstorm";

export class EndlessWorld {
  private canvas: HTMLCanvasElement;
  private cb: EndlessCallbacks;
  private dead = false;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private rt!: THREE.WebGLRenderTarget;
  private compScene = new THREE.Scene();
  private compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compMat = makeAaaComposite();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private flashLight!: THREE.PointLight;
  private fireLights: THREE.PointLight[] = [];
  private skyMat = makeAaaSky();
  private oceanMat: THREE.ShaderMaterial | null = null;

  // AAA upgrade kit: sandbox, attract mode, planar reflections, visible SPH
  // water, live terrain height texture, bullet tracers.
  private sandbox = true;
  private dimension: "prime" | "other" = "prime";
  private attract = true;
  private attractT = 0;
  private reflRT: THREE.WebGLRenderTarget | null = null;
  private reflCam: THREE.PerspectiveCamera | null = null;
  private reflClip: THREE.Plane | null = null;
  private waterPts: THREE.Points | null = null;
  private waterGeo: THREE.BufferGeometry | null = null;
  private waterTex: THREE.Texture | null = null;
  private heightTex: THREE.DataTexture | null = null;
  private heightT = 0;
  private heightCX = 0;
  private heightCZ = 0;
  private mouseDown = false;
  private autoT = 0;
  private tracers: { line: THREE.Line; life: number }[] = [];
  private rocketMat: THREE.MeshStandardMaterial | null = null;
  private tex: Record<string, THREE.Texture> = {};
  private portalA: THREE.Group | null = null;
  private portalB: THREE.Group | null = null;
  private spaceGroup: THREE.Group | null = null;
  private npcs: NpcRec[] = [];
  private bubbleCache = new Map<string, THREE.Texture>();
  // first-person viewmodel + grab
  private viewmodel: THREE.Group | null = null;
  private weaponMesh: THREE.Group | null = null;
  private vmRecoil = 0;
  private vmBobT = 0;
  private grabbed: RAPIER.RigidBody | null = null;
  private grabFrom: "dyn" | "npc" | "ragdoll" | null = null;
  private bubbles: { spr: THREE.Sprite; ttl: number }[] = [];
  private npcLines: Record<string, string[]> = {
    city: [
      "That tower downtown — nobody will say what's inside.",
      "The sky feels thinner than it used to. Just me?",
      "Past the farmland the world starts changing. Careful out there.",
      "They say the mother mountains clear a thousand meters. I've never seen one.",
      "My kid swears she saw a second sun over the coast. I'm not arguing.",
    ],
    suburb: [
      "Quietest block on the planet, I'd say. City's ten minutes away.",
      "We plant tomatoes out back. The soil's rich this year.",
      "That ring of light downtown started showing up a year ago. Nobody explains it.",
      "Honest work, good coffee. I wouldn't trade it.",
    ],
    town: [
      "Market day's Saturday. Best bread on the whole route, I promise.",
      "The river floods twice a year. The church gets wettest first.",
      "You look like you've seen a lot of world. Mind the rain on the hills.",
      "My grandfather's mill is up on the plateau. The wind still turns it.",
    ],
    farm: [
      "Good year for the crops. The rain came right on time.",
      "Silo's full. If it wasn't, we'd be having thin soup all winter.",
      "You're a long way from town out here. Stay safe — the hills shift in rain.",
      "Cows don't like loud noises. Neither do I, frankly.",
    ],
    coast: [
      "Calm water today. You can see the whole coastline from the lighthouse.",
      "I still paint the lighthouse stripes every spring. Old keeper's habit.",
      "Fog comes in at dusk. If you hear bells, that's the harbor — not the fog.",
      "Fish are jumping. Best sign there is.",
    ],
  };
  private oceanMesh: THREE.Mesh | null = null;
  private stars: THREE.Points | null = null;

  private rapier!: RAPIER.World;
  private solver = new FluidSolver(SPH_CAP, 777);
  private smoke = new AerosolSystem(2600, false);
  private glow = new AerosolSystem(1400, true);
  private audio = new LabAudio();
  private rng: Rng;
  private worldSeed: number;

  // player
  private playerBody!: RAPIER.RigidBody;
  private playerCollider!: RAPIER.Collider;
  private charCtrl!: RAPIER.KinematicCharacterController;
  private pos = new THREE.Vector3(2, 9.5, 14);
  private vel = new THREE.Vector3();
  private grounded = false;
  private yaw = 0;
  private pitch = -0.08;
  private hp = 100;
  private alive = true;
  private flying = false;
  private lastSafe = new THREE.Vector3(2, 9.5, 14);
  private safeT = 0;
  private prevVy = 0;
  private trauma = 0;

  // world objects
  private chunks = new Map<string, ChunkRec>();
  private dyn: DynRec[] = [];
  private segments: SegmentRec[] = [];
  private glass: GlassRec[] = [];
  private blackholes: BHRec[] = [];
  private portals: PortalVis[] = [];
  private wells: GravityWell[] = [];
  private vortices: VortexField[] = [];
  private fires: FireSource[] = [];
  private grates: GrateRec[] = [];
  private launchpads: { x: number; y: number; z: number }[] = [];
  private shards: Shard[] = [];
  private shockwaves: Shockwave[] = [];
  private bombs: Bomb[] = [];
  private ragdolls: Ragdoll[] = [];
  private pendingPortal: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
  private spaceBuilt = false;
  private lastBiome: BiomeId | null = null;

  // environment
  private weather: WeatherId = "clear";
  private seaLevel = 0;
  private seaTarget = 0;
  private stormAmt = 0;
  private stormTarget = 0;
  private rainRate = 0;
  private rainTarget = 0;
  private ambientC = 18;
  private windSpeed = 4;
  private lightningT = 4;
  private bolt!: THREE.Line;
  private boltLife = 0;
  private rainPos!: Float32Array;
  private rainVel!: Float32Array;
  private rainGeo = new THREE.BufferGeometry();
  private rainLines!: THREE.LineSegments;
  private quakeT = 0;
  private floodT = 0;

  // time / quality
  private timeScale = 1;
  private paused = false;
  private tool: ToolId = "pistol";

  // shared scratch
  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private sunRaycaster = new THREE.Raycaster();
  private sunVis = 1;
  private sunOcc = false;
  private sunOccT = 0;
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private facadeMats: THREE.MeshStandardMaterial[] = [];
  private solidMats = new Map<string, THREE.MeshStandardMaterial>();
  private glassMat: THREE.MeshPhysicalMaterial;
  private debrisMat: THREE.MeshStandardMaterial;
  private crateMat: THREE.MeshStandardMaterial;

  // loop
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private fpsEma = 60;
  private simMs = 0;
  private statT = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, cb: EndlessCallbacks, worldSeed: number) {
    this.canvas = canvas;
    this.cb = cb;
    this.worldSeed = worldSeed >>> 0;
    this.rng = new Rng(this.worldSeed);
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0.3, roughness: 0.06, metalness: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x7a7a76, roughness: 0.9 });
    this.crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.8 });
  }

  /* ============================== INIT ============================== */

  async init(): Promise<void> {
    await RAPIER.init();
    if (this.dead) return;
    this.rng = new Rng(this.worldSeed);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x05070a);
    this.renderer.localClippingEnabled = true;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.25, 6000);
    this.scene.add(this.camera); // viewmodel parents to the camera
    this.loadTextures();
    this.scene.add(this.smoke.points);
    this.scene.add(this.glow.points);
    this.scene.fog = new THREE.FogExp2(0x8aa5b5, 0.0013);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.55;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a443c, 1.05);
    this.scene.add(this.hemi);
    this.flashLight = new THREE.PointLight(0xcfe4ff, 0, 500, 1.6);
    this.scene.add(this.flashLight);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7733, 0, 70, 1.8);
      this.scene.add(l);
      this.fireLights.push(l);
    }

    // sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // dimension portals (E near the ring to cross realities)
    this.buildPortals();
    // first-person hands + weapon art
    this.buildViewmodel();

    // ocean (local AAA shader: gerstner waves + planar reflections + sun glints)
    this.heightTex = new THREE.DataTexture(new Uint8Array(128 * 128), 128, 128, THREE.RedFormat);
    this.heightTex.needsUpdate = true;
    this.oceanMat = makeAaaOcean(this.heightTex);
    this.oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500, 120, 120), this.oceanMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.frustumCulled = false;
    this.scene.add(this.oceanMesh);

    // planar-reflection camera + render target (water mirrors the world)
    this.reflRT = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true });
    this.reflCam = new THREE.PerspectiveCamera(70, 1, 0.25, 6000);
    this.reflClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // visible SPH water: the solver's particles rendered as droplets
    this.waterTex = this.dropletTexture();
    this.waterGeo = new THREE.BufferGeometry();
    this.waterGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPH_CAP * 3), 3));
    this.waterGeo.setDrawRange(0, 0);
    this.waterPts = new THREE.Points(this.waterGeo, new THREE.PointsMaterial({
      map: this.waterTex, size: 0.85, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false, color: 0xcfe6f2,
    }));
    this.waterPts.frustumCulled = false;
    this.waterPts.renderOrder = 5;
    this.scene.add(this.waterPts);

    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.35, metalness: 0.85 });
    this.updateHeightTex();

    // lightning bolt
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({
      color: 0xcfe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);

    // rain
    const drops = 1300;
    this.rainPos = new Float32Array(drops * 6);
    this.rainVel = new Float32Array(drops * 4);
    for (let i = 0; i < drops; i++) {
      this.rainVel[i * 4] = (Math.random() - 0.5) * 240;
      this.rainVel[i * 4 + 1] = Math.random() * 70;
      this.rainVel[i * 4 + 2] = (Math.random() - 0.5) * 240;
      this.rainVel[i * 4 + 3] = 42 + Math.random() * 14;
    }
    this.rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rainLines = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({
      color: 0x9fc4d8, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    this.rainLines.frustumCulled = false;
    this.rainLines.renderOrder = 12;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // composite
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    quad.frustumCulled = false;
    this.compScene.add(quad);

    // facades — photographic masonry, three tones
    const facadeDefs = [
      { tex: "brick", tint: new THREE.Color(0.72, 0.55, 0.5) },
      { tex: "concrete", tint: new THREE.Color(0.78, 0.76, 0.72) },
      { tex: "brick", tint: new THREE.Color(0.85, 0.82, 0.78) },
    ];
    this.facadeMats = facadeDefs.map((fd) => {
      const m = new THREE.MeshStandardMaterial({ color: fd.tint.clone(), roughness: 0.85, metalness: 0.05 });
      const t = this.tex[fd.tex];
      if (t) {
        t.repeat.set(3, 6);
        this.whenTexLoaded(t, () => { m.map = t; m.needsUpdate = true; });
      }
      return m;
    });

    // physics
    this.rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.rapier.timestep = STEP;

    // player
    this.playerBody = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z));
    this.playerCollider = this.rapier.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.38).setFriction(0.2), this.playerBody);
    this.charCtrl = this.rapier.createCharacterController(0.05);
    this.charCtrl.enableAutostep(0.6, 0.5, true);
    this.charCtrl.enableSnapToGround(0.2);
    this.charCtrl.setMaxSlopeClimbAngle(1.05);
    this.charCtrl.setApplyImpulsesToDynamicBodies(true);
    this.charCtrl.setCharacterMass(PLAYER_MASS);

    this.resize();
    this.buildInitialChunks();
    this.buildSpace();
    this.attachInput();
    this.log(`UNIVERSE SEED 0x${this.worldSeed.toString(16).toUpperCase()} — walking into the infinite.`, "sys");
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ============================== BIOMES ============================== */

  private biomeAt(dist: number): BiomeId {
    if (this.dimension === "other") {
      // the strange dimension: everything weird lives here
      if (dist < 320) return "dislocated";
      if (dist < 950) return "impossible";
      return "space";
    }
    // the prime planet: a real world that gets wilder with distance, forever
    if (dist < 700) return "downtown";
    if (dist < 1400) return "suburbs";
    if (dist < 2200) return "towns";
    if (dist < 3400) return "farms";
    if (dist < 4800) return "forest";
    if (dist < 6500) return "waterfront";
    if (dist < 9500) return "hills";
    if (dist < 13500) return "mountains";
    if (dist < 17500) return "desert";
    if (dist < 22500) return "plateau";
    // endless variety beyond: repeating bands at planet scale
    const bands: BiomeId[] = ["mountains", "forest", "desert", "plateau", "hills", "waterfront"];
    return bands[Math.floor(dist / 5200) % bands.length];
  }

  /** Ground height at a world point (chunk-cached function or fallback). */
  heightAt(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(`${cx},${cz}`);
    if (c) return c.heightAt(x, z);
    return this.rawHeight(x, z, this.biomeAt(Math.hypot(x, z)), cx, cz);
  }

  private rawHeight(x: number, z: number, tier: BiomeId, cx: number, cz: number): number {
    const seed = this.worldSeed;
    if (tier === "space") return -9999;
    if (tier === "downtown") {
      // perfect city grid: 32m blocks, 8m roads
      const inRoadX = mod(x, 32) < 8;
      const inRoadZ = mod(z, 32) < 8;
      if (inRoadX || inRoadZ) return 6.0;
      return 7.0;
    }
    const d = Math.hypot(x, z);
    // one continuous macro swell for the whole planet — no seam cliffs,
    // and the land grows grander the farther you go (hills → 1000m peaks)
    const macro = fbm(x * 0.0006, z * 0.0006, seed + 67, 3) * (160 + d * 0.045);
    const cont = fbm(x * 0.003, z * 0.003, seed + 31, 3);
    const hills = fbm(x * 0.012, z * 0.012, seed + 37, 4);
    const env = (a: number, b: number) => smooth(clamp((d - a) / (b - a), 0, 1));
    if (tier === "suburbs") return 6 + hills * 1.2 + macro * 0.12;
    if (tier === "towns") return 5 + hills * 2.5 + macro * 0.3;
    if (tier === "farms") {
      let h = 4 + hills * 3 + macro * 0.4;
      // flattened field patches
      const ph = hash2(cx, cz, seed + 77);
      if (ph < 0.85) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 78) - 0.5) * 24 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz + 1, seed + 79) - 0.5) * 24 + 32;
        const dd = Math.hypot(x - px, z - pz);
        if (dd < 16) h = lerp(h, 4 + cont * 2, 1 - smooth(clamp(dd / 16, 0, 1)));
      }
      return h;
    }
    if (tier === "forest") return macro * 0.8 + hills * 22;
    if (tier === "waterfront") {
      let h = -4 + cont * 9 + hills * 5 + macro * 0.5;
      // gentle sand shelf where the water meets land
      h = lerp(h, 0.7, smooth(clamp((2.2 - h) / 6.0, 0, 1)));
      return h;
    }
    if (tier === "hills") return macro + hills * 26;
    if (tier === "mountains") {
      const mr = fbm(x * 0.0012, z * 0.0012, seed + 53, 4);
      const mRidge = (1 - Math.abs(mr)) ** 2.6;
      return macro + mRidge * 640 * env(9200, 11600) + hills * 14;
    }
    if (tier === "desert") {
      let h = macro * 0.55 + hills * 6;
      // flat-topped mesas
      const ph = hash2(cx, cz, seed + 83);
      if (ph < 0.4) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 84) - 0.5) * 20 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz + 2, seed + 85) - 0.5) * 20 + 32;
        const dd = Math.hypot(x - px, z - pz);
        const mh = 18 + hash2(cx, cz, seed + 86) * 46;
        if (dd < 14) {
          const t = 1 - smooth(clamp((dd - 8) / 6, 0, 1));
          h = lerp(h, h + mh, t);
        }
      }
      return h;
    }
    if (tier === "plateau") {
      let h = macro * 0.5 + 140 * env(20500, 22000) + hills * 8;
      const ph = hash2(cx, cz, seed + 95);
      if (ph < 0.3) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 96) - 0.5) * 26 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz + 3, seed + 97) - 0.5) * 26 + 32;
        const dd = Math.hypot(x - px, z - pz);
        if (dd < 16) h = lerp(h, h + 24, 1 - smooth(clamp(dd / 16, 0, 1)));
      }
      return h;
    }
    // other dimension: dislocated
    if (tier === "dislocated") {
      let h = 2 + cont * 14 + hills * 9;
      const r0 = fbm(x * 0.006, z * 0.006, seed + 43, 4);
      h += (1 - Math.abs(r0)) ** 2.4 * 42;
      const ph = hash2(cx, cz, seed + 71);
      if (ph < 0.5) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 72) - 0.5) * 30 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz, seed + 73) - 0.5) * 30 + 32;
        const dd = Math.hypot(x - px, z - pz);
        if (dd < 12) h = lerp(8, h, clamp(dd / 12, 0, 1));
      }
      return h;
    }
    // other dimension: impossible — jagged + spires + mountains
    let h = cont * 18 + hills * 11;
    const r0 = fbm(x * 0.006, z * 0.006, seed + 43, 4);
    h += (1 - Math.abs(r0)) ** 2.4 * 68;
    const sp = hash2(cx * 3 + 7, cz * 3 + 11, seed + 91);
    if (sp < 0.3) {
      const px = cx * CHUNK + (hash2(cx, cz, seed + 92) - 0.5) * 40 + 32;
      const pz = cz * CHUNK + (hash2(cx, cz, seed + 93) - 0.5) * 40 + 32;
      const dd = Math.hypot(x - px, z - pz);
      const spireH = 18 + hash2(cx, cz, seed + 94) * 26;
      if (dd < 7) h = Math.max(h, spireH * (1 - dd / 7) ** 1.4);
    }
    return h;
  }


  private terrainColor(tier: BiomeId): number {
    if (tier === "downtown") return 0xffffff;
    if (tier === "suburbs") return 0xffffff;
    if (tier === "towns") return 0xffffff;
    if (tier === "farms") return 0xffffff;
    if (tier === "forest") return 0x9fbf9f;
    if (tier === "waterfront") return 0xffffff;
    if (tier === "hills") return 0xbfd3a8;
    if (tier === "mountains") return 0xffffff;
    if (tier === "desert") return 0xffd9a8;
    if (tier === "plateau") return 0xd8c8b0;
    if (tier === "dislocated") return 0x9a86c0;
    if (tier === "impossible") return 0x8888a0;
    return 0x2b2b33;
  }

  /** Assign the photographic terrain texture for a biome (falls back to flat color). */
  private applyTerrainTex(mat: THREE.MeshStandardMaterial, tier: BiomeId): void {
    const map = (nm: string, rx: number, ry: number, tint?: THREE.Color) => {
      const t = this.tex[nm];
      if (!t) return;
      t.repeat.set(rx, ry);
      if (tint) mat.color.copy(tint);
      this.whenTexLoaded(t, () => { mat.map = t; mat.needsUpdate = true; });
    };
    if (tier === "downtown") map("asphalt", 4, 4);
    else if (tier === "suburbs") map("grass", 5, 5);
    else if (tier === "towns") map("dirt", 5, 5);
    else if (tier === "farms") map("farmland", 6, 6);
    else if (tier === "forest") map("grass", 6, 6);
    else if (tier === "waterfront") map("sand", 6, 6);
    else if (tier === "hills") map("grass", 7, 7);
    else if (tier === "mountains") map("rock", 5, 8);
    else if (tier === "desert") map("sand", 5, 5);
    else if (tier === "plateau") map("dirt", 5, 7);
    else if (tier === "dislocated") map("grass", 5, 5);
    else if (tier === "impossible") map("rock", 5, 6);
  }

  private whenTexLoaded(t: THREE.Texture, fn: () => void): void {
    if (t.image && (t.image as HTMLImageElement).width > 0) fn();
    else (t as unknown as { on(ev: string, cb: () => void): void }).on("load", fn);
  }

  private loadTextures(): void {
    const loader = new THREE.TextureLoader();
    const names = ["asphalt", "sidewalk", "brick", "concrete", "glass", "grass", "farmland", "rock", "dirt", "sand"]; // + plaster, wood when generated
    for (const nm of names) {
      const t = loader.load(`/textures/${nm}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      this.tex[nm] = t;
    }
  }

  /* ============================== CHUNKS ============================== */

  private buildInitialChunks(): void {
    const pcx = Math.floor(this.pos.x / CHUNK), pcz = Math.floor(this.pos.z / CHUNK);
    // Only the spawn chunk is built synchronously. A full initial disc of
    // city chunks (facade canvases, hundreds of colliders) takes many seconds
    // and freezes the page — instead updateChunks() streams the rest in over
    // the next ~20 frames, nearest first.
    this.buildChunk(pcx, pcz);
  }

  private heightfieldTrimesh(cx: number, cz: number, n: number, fn: (x: number, z: number) => number) {
    const verts: number[] = [];
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = x0 + (i / n) * CHUNK;
        const z = z0 + (j / n) * CHUNK;
        verts.push(x, fn(x, z), z);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + 1;
        const c = a + (n + 1);
        const d = c + 1;
        idx.push(a, c, b, c, d, b);
      }
    }
    return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
  }

  private buildChunk(cx: number, cz: number): void {
    const key = `${this.dimension}:${cx},${cz}`;
    if (this.chunks.has(key)) return;
    const group = new THREE.Group();
    const colliders: RAPIER.Collider[] = [];
    const centerD = Math.hypot(cx * CHUNK + 32, cz * CHUNK + 32);
    const tier = this.biomeAt(centerD);
    const seed = this.worldSeed;

    const heightAt = (x: number, z: number) => this.rawHeight(x, z, tier, cx, cz);
    const n = tier === "impossible" || tier === "dislocated" || tier === "mountains" || tier === "plateau" || tier === "hills" ? 24 : 16;
    const hm = this.heightfieldTrimesh(cx, cz, n, heightAt);

    // visual terrain (photographic textures per biome)
    if (tier !== "space") {
      const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, n, n);
      geo.rotateX(-Math.PI / 2);
      const pattr = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pattr.count; i++) {
        pattr.setY(i, heightAt(cx * CHUNK + pattr.getX(i), cz * CHUNK + pattr.getZ(i)));
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: this.terrainColor(tier), roughness: 0.95, metalness: 0.0,
        flatShading: tier === "impossible",
      });
      this.applyTerrainTex(mat, tier);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx * CHUNK, 0, cz * CHUNK);
      mesh.receiveShadow = true;
      mesh.castShadow = tier === "impossible";
      group.add(mesh);

      const gb = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const col = this.rapier.createCollider(
        RAPIER.ColliderDesc.trimesh(hm.verts, hm.idx).setFriction(1.0), gb);
      colliders.push(col);
    }

    if (tier === "downtown") this.buildCityChunk(cx, cz, group, colliders);
    else if (tier === "suburbs") this.buildSuburbsChunk(cx, cz, group, colliders);
    else if (tier === "towns") this.buildTownsChunk(cx, cz, group, colliders);
    else if (tier === "farms") this.buildFarmsChunk(cx, cz, group, colliders);
    else if (tier === "forest") this.buildForestChunk(cx, cz, group, colliders);
    else if (tier === "waterfront") this.buildCoastChunk(cx, cz, group, colliders);
    else if (tier === "hills") this.buildHillsChunk(cx, cz, group, colliders);
    else if (tier === "mountains") this.buildMountainsChunk(cx, cz, group, colliders);
    else if (tier === "desert") this.buildDesertChunk(cx, cz, group, colliders);
    else if (tier === "plateau") this.buildPlateauChunk(cx, cz, group, colliders);
    else if (tier === "dislocated") this.buildDislocatedChunk(cx, cz, group, colliders);
    else if (tier === "impossible") this.buildImpossibleChunk(cx, cz, group, colliders);

    this.scene.add(group);
    this.chunks.set(key, { cx, cz, group, colliders, buildingSegs: 0, heightAt });

    // grates for interactables list
    if (tier === "downtown") {
      for (let kx = 0; kx < 2; kx++) {
        for (let kz = 0; kz < 2; kz++) {
          const gx = (cx + kx) * 32 + 4;
          const gz = (cz + kz) * 32 + 4;
          if (gx >= cx * CHUNK && gx <= cx * CHUNK + CHUNK && gz >= cz * CHUNK && gz <= cz * CHUNK + CHUNK) {
            this.grates.push({ x: gx, z: gz });
          }
        }
      }
    }
    void seed;
  }

  /* -------------------------- downtown (city) -------------------------- */

  private solidMat(name: string): THREE.MeshStandardMaterial {
    let m = this.solidMats.get(name);
    if (!m) {
      const def = SOLIDS[name] ?? SOLIDS.concrete;
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.color[0], def.color[1], def.color[2]),
        roughness: 0.9, metalness: name === "steel" ? 0.6 : 0.0,
      });
      const texName = SOLIDS_TEX[name];
      if (texName) {
        const t = this.tex[texName];
        if (t) {
          t.repeat.set(2, 2);
          this.whenTexLoaded(t, () => { m!.map = t; m!.color.set(0xffffff); m!.needsUpdate = true; });
        }
      }
      this.solidMats.set(name, m);
    }
    return m;
  }

  private fixedCol(desc: RAPIER.ColliderDesc, x: number, y: number, z: number, colliders: RAPIER.Collider[]): void {
    const b = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const c = this.rapier.createCollider(desc, b);
    c.setTranslation({ x, y, z });
    colliders.push(c);
  }
  private fixedColR(desc: RAPIER.ColliderDesc, x: number, y: number, z: number, rot: { x: number; y: number; z: number; w: number }, colliders: RAPIER.Collider[]): void {
    const b = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const c = this.rapier.createCollider(desc, b);
    c.setTranslation({ x, y, z });
    c.setRotation(rot);
    colliders.push(c);
  }

  private buildCityChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // sewers under this chunk (tunnels along road centerlines x = 32k+4, z = 32k+4)
    this.buildSewer(cx, cz, group, colliders);

    // buildings per 32m block (the portal plaza block is kept clear)
    for (let bx = 0; bx < 2; bx++) {
      for (let bz = 0; bz < 2; bz++) {
        const cellX = x0 + bx * 32, cellZ = z0 + bz * 32;
        if (cellX === 96 && cellZ === 96) {
          this.buildPortalPlaza(group, colliders);
          continue;
        }
        const bh = hash2(cellX >> 5, cellZ >> 5, seed + 200);
        if (bh > 0.62) continue;
        this.buildBuilding(cellX + 8 + (hash2(bx, bz, seed + 201) - 0.5) * 6, cellZ + 8 + (hash2(bz, bx, seed + 202) - 0.5) * 6, group, colliders);
      }
    }

    // pedestrians on the sidewalks
    if (this.rng.next() < 0.8) this.spawnNpc(x0 + this.rng.range(6, 58), z0 + this.rng.range(6, 58), "city");
    if (this.rng.next() < 0.35) this.spawnNpc(x0 + this.rng.range(6, 58), z0 + this.rng.range(6, 58), "city");

    // cars on the roads
    const carN = this.rng.next() < 0.6 ? 2 : 1;
    for (let i = 0; i < carN; i++) {
      const along = Math.random() < 0.5;
      const lane = Math.random() < 0.5 ? 2.2 : -2.2;
      const t = Math.random() * CHUNK;
      const px = along ? x0 + t : (cx * 2 + 1) * 16 + 4 - 12 + lane;
      const pz = along ? (cz * 2 + 1) * 16 + 4 - 12 + lane : z0 + t;
      if (Math.hypot(px, pz) < 12) continue;
      this.spawnCar(px, 7.4, pz, along ? Math.random() * Math.PI : (Math.random() < 0.5 ? 0 : Math.PI), false);
    }

    // street props: lamps + trees
    for (let i = 0; i < 4; i++) {
      const px = x0 + 4 + (hash2(cx, cz + i, seed + 300) - 0.5) * 56;
      const pz = z0 + (hash2(cz, cx + i, seed + 301) < 0.5 ? 4 : 36) + (hash2(cx, i, seed + 302) - 0.5) * 56;
      if (Math.hypot(px, pz) < 10) continue;
      if (hash2(i, cx, seed + 303) < 0.5) this.addLamp(px, 6, pz, group, colliders);
      else this.addTree(px, 6.2, pz, group, colliders);
    }
  }

  private buildSewer(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.98 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x0d3946, transparent: true, opacity: 0.85, roughness: 0.1 });
    const addTunnel = (alongX: boolean, line: number) => {
      // line = the fixed coordinate of the road centerline (32k+4)
      if (alongX) {
        if (line < z0 - 1 || line > z0 + CHUNK + 1) return;
        const g = new THREE.Group();
        const floor = new THREE.Mesh(this.boxGeo, mat); floor.scale.set(64, 0.3, 4.4); floor.position.set(x0 + 32, -8.55, line); g.add(floor);
        const ceil = new THREE.Mesh(this.boxGeo, mat); ceil.scale.set(64, 0.3, 4.4); ceil.position.set(x0 + 32, -4.3, line); g.add(ceil);
        const wl = new THREE.Mesh(this.boxGeo, mat); wl.scale.set(64, 2.1, 0.25); wl.position.set(x0 + 32, -6.5, line - 2.2); g.add(wl);
        const wr = new THREE.Mesh(this.boxGeo, mat); wr.scale.set(64, 2.1, 0.25); wr.position.set(x0 + 32, -6.5, line + 2.2); g.add(wr);
        const wtr = new THREE.Mesh(this.boxGeo, waterMat); wtr.scale.set(63, 0.06, 4.0); wtr.position.set(x0 + 32, -8.32, line); g.add(wtr);
        group.add(g);
        const mk = (hx: number, hy: number, hz: number, y: number, lz: number) =>
          this.fixedCol(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9), x0 + 32, y, lz, colliders);
        mk(32, 0.15, 2.2, -8.4, line);
        mk(32, 0.15, 2.2, -4.45, line);
        mk(32, 1.0, 0.12, -6.5, line - 2.2);
        mk(32, 1.0, 0.12, -6.5, line + 2.2);
      } else {
        if (line < x0 - 1 || line > x0 + CHUNK + 1) return;
        const g = new THREE.Group();
        const floor = new THREE.Mesh(this.boxGeo, mat); floor.scale.set(4.4, 0.3, 64); floor.position.set(line, -8.55, z0 + 32); g.add(floor);
        const ceil = new THREE.Mesh(this.boxGeo, mat); ceil.scale.set(4.4, 0.3, 64); ceil.position.set(line, -4.3, z0 + 32); g.add(ceil);
        const wl = new THREE.Mesh(this.boxGeo, mat); wl.scale.set(0.25, 2.1, 64); wl.position.set(line - 2.2, -6.5, z0 + 32); g.add(wl);
        const wr = new THREE.Mesh(this.boxGeo, mat); wr.scale.set(0.25, 2.1, 64); wr.position.set(line + 2.2, -6.5, z0 + 32); g.add(wr);
        const wtr = new THREE.Mesh(this.boxGeo, waterMat); wtr.scale.set(4.0, 0.06, 63); wtr.position.set(line, -8.32, z0 + 32); g.add(wtr);
        group.add(g);
        const mk = (hx: number, hy: number, hz: number, y: number, lx: number) =>
          this.fixedCol(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9), lx, y, z0 + 32, colliders);
        mk(2.2, 0.15, 32, -8.4, line);
        mk(2.2, 0.15, 32, -4.45, line);
        mk(0.12, 1.0, 32, -6.5, line - 2.2);
        mk(0.12, 1.0, 32, -6.5, line + 2.2);
      }
    };
    // tunnels crossing this chunk: roads at 32k+4 for k covering the chunk
    const ka = Math.floor((x0 - 4) / 32), kb = Math.floor((z0 - 4) / 32);
    for (let k = ka; k <= ka + 2; k++) {
      addTunnel(true, k * 32 + 4);   // x-tunnels at z = k*32+4
      addTunnel(false, k * 32 + 4);  // z-tunnels at x = k*32+4
    }
    // grates (visual)
    const grateMat = new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.6, metalness: 0.5 });
    const grateGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.08, 20);
    for (let kx = ka; kx <= ka + 1; kx++) {
      for (let kz = kb; kz <= kb + 1; kz++) {
        const gx = kx * 32 + 4, gz = kz * 32 + 4;
        if (gx < x0 || gx > x0 + CHUNK || gz < z0 || gz > z0 + CHUNK) continue;
        const grate = new THREE.Mesh(grateGeo, grateMat);
        grate.position.set(gx, 6.04, gz);
        group.add(grate);
      }
    }
  }

  private buildBuilding(px: number, pz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    // skyline: tall near the center, lower at the edge of the megacity
    const d0 = Math.hypot(px, pz);
    const maxF = d0 < 150 ? 10 : d0 < 300 ? 7 : d0 < 500 ? 5 : 4;
    const floors = 2 + Math.floor(hash2(px | 0, pz | 0, seed + 400) * (maxF - 1));
    const w = 12 + hash2(pz | 0, px | 0, seed + 401) * 7;
    const d = 12 + hash2(px | 0, pz + 1, seed + 402) * 7;
    const h = 3.2;
    const hollow = hash2(px | 0, pz | 0, seed + 403) < 0.4;
    const facade = this.facadeMats[Math.floor(hash2(px | 0, pz | 0, seed + 404) * 3)];
    const style = Math.floor(hash2(px | 0, pz | 0, seed + 406) * 4); // architectural flavor
    const y0 = 7.0;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * h + h / 2;
      if (!hollow) {
        this.addSegment(px, y, pz, w, h, d, facade, 40 + f * 10, group, colliders);
      } else {
        // hollow interior: slab + 4 walls (front wall split at f=0 for a doorway)
        this.addSegment(px, y0 + f * h + 0.12, pz, w, 0.24, d, this.solidMat("concrete"), 30, group, colliders);
        if (f === 0) {
          const doorW = 3.0;
          const sideW = (w - doorW) / 2;
          this.addSegment(px - (doorW / 2 + sideW / 2), y, pz + d / 2 - 0.25, sideW, h, 0.5, facade, 30, group, colliders);
          this.addSegment(px + (doorW / 2 + sideW / 2), y, pz + d / 2 - 0.25, sideW, h, 0.5, facade, 30, group, colliders);
          this.addSegment(px, y0 + h - 0.5, pz + d / 2 - 0.25, doorW, 1.0, 0.5, facade, 20, group, colliders);
        } else {
          this.addSegment(px, y, pz + d / 2 - 0.25, w, h, 0.5, facade, 30, group, colliders);
        }
        this.addSegment(px, y, pz - d / 2 + 0.25, w, h, 0.5, facade, 30, group, colliders);
        this.addSegment(px - w / 2 + 0.25, y, pz, 0.5, h, d, facade, 30, group, colliders);
        this.addSegment(px + w / 2 - 0.25, y, pz, 0.5, h, d, facade, 30, group, colliders);
        // interior lamp strip
        const lamp = new THREE.Mesh(this.boxGeo, new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
        lamp.scale.set(1.2, 0.12, 0.12);
        lamp.position.set(px, y0 + f * h + h - 0.3, pz);
        group.add(lamp);
      }
      // windows (front face)
      if (style === 2) {
        // curtain-wall: one full glass band per floor
        const pane = new THREE.Mesh(this.boxGeo, this.glassMat);
        pane.scale.set(w * 0.8, h * 0.55, 0.06);
        pane.position.set(px, y + 0.15, pz + d / 2 + 0.02);
        group.add(pane);
        this.glass.push({
          id: allocId(), mesh: pane, x: px, y: y + 0.15, z: pz + d / 2, nx: 0, ny: 0, nz: 1, dead: false,
        });
      } else {
        const winN = 2 + Math.floor(hash2(f, px | 0, seed + 405) * (2 + (w > 15 ? 1 : 0)));
        for (let wi = 0; wi < winN; wi++) {
          const wx = px - w / 2 + (wi + 0.6) * (w / (winN + 0.2));
          const wy = y + 0.2;
          const pane = new THREE.Mesh(this.boxGeo, this.glassMat);
          pane.scale.set(1.5, 1.5, 0.06);
          pane.position.set(wx, wy, pz + d / 2 + 0.02);
          group.add(pane);
          this.glass.push({
            id: allocId(), mesh: pane, x: wx, y: wy, z: pz + d / 2, nx: 0, ny: 0, nz: 1, dead: false,
          });
        }
      }
      // style 1: dark accent bands on the side
      if (style === 1 && f % 2 === 0) {
        const band = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6 }));
        band.scale.set(0.08, h, d * 0.9);
        band.position.set(px - w / 2 - 0.04, y, pz);
        group.add(band);
      }
    }
    // rooftop equipment — every tower gets life on top
    const roofY = y0 + floors * h;
    if (floors >= 4) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 10), this.solidMat("steel"));
      tank.position.set(px - w * 0.22, roofY + 1.1, pz - d * 0.15);
      tank.castShadow = true;
      group.add(tank);
      const acN = 1 + Math.floor(hash2(px | 0, pz | 0, seed + 407) * 3);
      for (let ai = 0; ai < acN; ai++) {
        const ac = new THREE.Mesh(this.boxGeo, this.solidMat("concrete"));
        ac.scale.set(1.6, 1.0, 1.6);
        ac.position.set(px + w * 0.2 + ai * 2, roofY + 0.5, pz + d * 0.2);
        ac.castShadow = true;
        group.add(ac);
      }
    }
    if (hash2(px | 0, pz | 0, seed + 408) < 0.5 || floors >= 8) {
      const ant = new THREE.Mesh(this.boxGeo, this.solidMat("steel"));
      ant.scale.set(0.12, 3.4, 0.12);
      ant.position.set(px + w * 0.3, roofY + 1.7, pz - d * 0.3);
      group.add(ant);
      const blink = new THREE.Mesh(this.boxGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
      blink.scale.set(0.2, 0.2, 0.2);
      blink.position.set(px + w * 0.3, roofY + 3.5, pz - d * 0.3);
      group.add(blink);
    }
    // style 3: penthouse block
    if (style === 3) {
      const pent = new THREE.Mesh(this.boxGeo, facade);
      pent.scale.set(w * 0.45, h * 0.8, d * 0.45);
      pent.position.set(px, roofY + h * 0.4, pz);
      pent.castShadow = true;
      group.add(pent);
    }
  }

  private addSegment(x: number, y: number, z: number, sx: number, sy: number, sz: number,
    mat: THREE.Material, strength: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const col = this.rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setDensity(2400).setFriction(0.9), body);
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(col);
    const rec: SegmentRec = {
      id: allocId(), body, mesh, sx, sy, sz,
      health: strength, maxHealth: strength, chunk: "", dead: false,
    };
    this.segments.push(rec);
  }

  private addLamp(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(this.boxGeo, this.solidMat("steel"));
    pole.scale.set(0.14, 5.4, 0.14);
    pole.position.y = 2.7;
    pole.castShadow = true;
    const head = new THREE.Mesh(this.boxGeo, new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    head.scale.set(0.7, 0.24, 0.24);
    head.position.y = 5.35;
    g.add(pole, head);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(0.1, 2.7, 0.1).setFriction(0.6), x, y + 2.7, z, colliders);
  }

  private addTree(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), this.solidMat("wood"));
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5.4, 7), new THREE.MeshStandardMaterial({ color: 0x1d4a22, roughness: 1 }));
    leaves.position.y = 5.2;
    leaves.castShadow = true;
    g.add(trunk, leaves);
    g.position.set(x, y, z);
    const s = 0.8 + hash2(x | 0, z | 0, this.worldSeed + 500) * 0.7;
    g.scale.setScalar(s);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cylinder(1.2 * s, 0.35 * s).setFriction(0.8), x, y + 1.5 * s, z, colliders);
  }

  private buildPortalPlaza(group: THREE.Group, colliders: RAPIER.Collider[]): void {
    // open plaza around the ring at (112, 7, 112)
    const slab = new THREE.Mesh(this.boxGeo, this.solidMat("sidewalk"));
    slab.scale.set(26, 0.3, 26);
    slab.position.set(112, 6.85, 112);
    slab.receiveShadow = true;
    group.add(slab);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(13, 0.15, 13).setFriction(0.9), 112, 6.9, 112, colliders);
    // low benches ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.Mesh(this.boxGeo, this.solidMat("concrete"));
      b.scale.set(2.2, 0.7, 0.7);
      b.position.set(112 + Math.cos(a) * 8.5, 7.3, 112 + Math.sin(a) * 8.5);
      b.castShadow = true;
      group.add(b);
    }
    // corner light columns
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.addLamp(112 + sx * 11.5, 7, 112 + sz * 11.5, group, colliders);
    }
  }

  /* -------------------------- the Great Coast -------------------------- */

  private buildCoastChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    // pool water (SPH) where a basin exists
    const ph = hash2(cx, cz, seed + 55);
    if (ph < 0.55) {
      const px = cx * CHUNK + (hash2(cx, cz, seed + 56) - 0.5) * 34 + 32;
      const pz = cz * CHUNK + (hash2(cx, cz, seed + 57) - 0.5) * 34 + 32;
      this.solver.emitBox(px - 7, 4.0, pz - 7, px + 7, 5.2, pz + 7, 0.55, 0, 18, SPH_CAP);
      // fountain in the pool
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.8, 12), this.solidMat("concrete"));
      fb.position.set(px, 3.6, pz);
      group.add(fb);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(0.5, 0.4).setFriction(0.8), px, 3.8, pz, colliders);
    }
    // marina: boats + piers
    if (this.rng.next() < 0.5) {
      const px = cx * CHUNK + (this.rng.next() - 0.5) * 40 + 32;
      const pz = cz * CHUNK + (this.rng.next() - 0.5) * 40 + 32;
      const pier = new THREE.Mesh(this.boxGeo, this.solidMat("wood"));
      pier.scale.set(3, 0.4, 14);
      pier.position.set(px, 0.4, pz);
      pier.castShadow = true;
      group.add(pier);
      this.fixedCol(RAPIER.ColliderDesc.cuboid(1.5, 0.2, 7).setFriction(0.8), px, 0.4, pz, colliders);
      this.spawnBoat(px + 5, 0.6, pz, this.rng.next() * 6, false);
    }
    // palms along the shore
    for (let i = 0; i < 5; i++) {
      const px = cx * CHUNK + (hash2(cx, cz + i, seed + 450) - 0.5) * 56 + 32;
      const pz = cz * CHUNK + (hash2(cz, i, seed + 451) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "waterfront", cx, cz);
      if (gy < 0.4 || gy > 2.5) continue;
      this.addPalm(px, gy, pz, group, colliders);
    }
    // the lighthouse stands on the chunk's best headland
    if (hash2(cx, cz, seed + 452) < 0.25) {
      const lx = cx * CHUNK + (hash2(cx, cz, seed + 453) - 0.5) * 30 + 32;
      const lz = cz * CHUNK + (hash2(cz, cx, seed + 454) - 0.5) * 30 + 32;
      const ly = this.rawHeight(lx, lz, "waterfront", cx, cz);
      if (ly > 0.5) this.addLighthouse(lx, ly, lz, group, colliders);
    }
    // coastal NPC: fisher
    if (this.rng.next() < 0.4) this.spawnNpc(cx * CHUNK + this.rng.range(8, 56), cz * CHUNK + this.rng.range(8, 56), "coast");
  }

  private addPalm(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const lean = 0.12;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.03, 0.2 - i * 0.03, 1.8, 6), trunkMat);
      seg.position.set(i * i * 0.14 * lean, 0.9 + i * 1.65, 0);
      seg.rotation.z = -lean * i;
      seg.castShadow = true;
      g.add(seg);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d3a, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.9, 5.4, Math.sin(a) * 0.9);
      leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cylinder(0.5, 2.6).setFriction(0.8), x, y + 2.6, z, colliders);
  }

  private addLighthouse(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.8, 9, 12), white);
    tower.position.y = 4.5;
    tower.castShadow = true;
    g.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.5, 1.6, 12), red);
    band.position.y = 5.4;
    g.add(band);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 12), red);
    gallery.position.y = 9.2;
    g.add(gallery);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    lamp.position.y = 10.1;
    g.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 12), red);
    roof.position.y = 11.3;
    roof.castShadow = true;
    g.add(roof);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cylinder(1.6, 5.5).setFriction(0.8), x, y + 5.5, z, colliders);
  }

  /* -------------------------- the Suburbs -------------------------- */

  private addHouse(x: number, y: number, z: number, style: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const palettes = [
      { wall: 0xe8e4da, roof: 0x5a4a42 },
      { wall: 0xb5654d, roof: 0x3d3a40 },
      { wall: 0xcfd6dd, roof: 0x44586c },
      { wall: 0xd9c9a8, roof: 0x6a4a3a },
      { wall: 0x9db3c8, roof: 0x4a4440 },
    ];
    const pal = palettes[style % palettes.length];
    const w = 8 + (style % 3) * 2.5;
    const d = 8 + (style % 2) * 3;
    const h = 5.4 + (style % 3) * 1.7;
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: pal.wall, roughness: 0.92 }));
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roofH = 2.6 + (style % 2) * 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.79, roofH, 4),
      new THREE.MeshStandardMaterial({ color: pal.roof, roughness: 0.85 }));
    roof.position.y = h + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.8 }));
    door.scale.set(1.1, 2.2, 0.14);
    door.position.set(0, 1.1, d / 2 + 0.07);
    g.add(door);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.2, metalness: 0.6 });
    for (let wx = -1; wx <= 1; wx += 2) {
      const win = new THREE.Mesh(this.boxGeo, winMat);
      win.scale.set(1.7, 1.2, 0.1);
      win.position.set(wx * (w * 0.26), h * 0.55, d / 2 + 0.05);
      g.add(win);
    }
    // chimney on some
    if (style % 2 === 0) {
      const chim = new THREE.Mesh(this.boxGeo, this.solidMat("brick"));
      chim.scale.set(0.7, 2.4, 0.7);
      chim.position.set(w * 0.3, h + 1.2, -d * 0.25);
      g.add(chim);
    }
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.8), x, y + h / 2, z, colliders);
  }

  private buildSuburbsChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let lx = 0; lx < 2; lx++) {
      for (let lz = 0; lz < 2; lz++) {
        const hx = x0 + lx * 32 + 20, hz = z0 + lz * 32 + 20;
        const r = hash2(cx * 2 + lx, cz * 2 + lz, seed + 410);
        if (r > 0.8) continue;
        const gy = this.rawHeight(hx, hz, "suburbs", cx, cz);
        this.addHouse(hx, gy, hz, Math.floor(r * 5) * 3 + lx, group, colliders);
        const drive = new THREE.Mesh(this.boxGeo, this.solidMat("asphalt"));
        drive.scale.set(2.4, 0.08, 7);
        drive.position.set(hx - 6, gy + 0.06, hz + 6);
        group.add(drive);
      }
    }
    // street trees + lamps
    for (let i = 0; i < 6; i++) {
      const px = x0 + (hash2(cx, cz + i, seed + 420) - 0.5) * 56 + 32;
      const pz = z0 + (i % 2 === 0 ? 4 : 36) + (hash2(cz, i, seed + 421) - 0.5) * 56;
      const gy = this.rawHeight(px, pz, "suburbs", cx, cz);
      if (hash2(i, cx, seed + 422) < 0.6) this.addTree(px, gy, pz, group, colliders);
      else this.addLamp(px, gy, pz, group, colliders);
    }
    if (this.rng.next() < 0.45) {
      const px = x0 + this.rng.range(8, 56), pz = z0 + (this.rng.next() < 0.5 ? 4 : 36);
      this.spawnCar(px, this.rawHeight(px, pz, "suburbs", cx, cz) + 0.4, pz, this.rng.next() < 0.5 ? 0 : Math.PI, false);
    }
    // a suburbanite
    if (this.rng.next() < 0.55) this.spawnNpc(x0 + this.rng.range(10, 54), z0 + this.rng.range(10, 54), "suburb");
  }

  /* -------------------------- Riverbend Towns -------------------------- */

  private addShop(x: number, y: number, z: number, style: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const awnings = [0xc0392b, 0x2980b9, 0x27ae60, 0xd4a017, 0x8e44ad];
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.boxGeo, this.solidMat("concrete"));
    body.scale.set(11, 4.6, 9);
    body.position.y = 2.3;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(this.boxGeo, this.solidMat("brick"));
    roof.scale.set(11.6, 0.4, 9.6);
    roof.position.y = 4.8;
    g.add(roof);
    // storefront glass
    const glass = new THREE.Mesh(this.boxGeo, this.glassMat);
    glass.scale.set(8, 2.4, 0.1);
    glass.position.set(0, 1.6, 4.56);
    g.add(glass);
    // awning
    const awn = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: awnings[style % awnings.length], roughness: 0.9 }));
    awn.scale.set(8.6, 0.16, 1.8);
    awn.position.set(0, 3.1, 5.3);
    awn.rotation.x = 0.32;
    awn.castShadow = true;
    g.add(awn);
    // sign
    const sign = new THREE.Mesh(this.boxGeo, new THREE.MeshBasicMaterial({ color: awnings[(style + 1) % awnings.length] }));
    sign.scale.set(5, 0.8, 0.14);
    sign.position.set(0, 3.9, 4.6);
    g.add(sign);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(5.5, 2.3, 4.5).setFriction(0.8), x, y + 2.3, z, colliders);
  }

  private addChurch(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.9 });
    const nave = new THREE.Mesh(this.boxGeo, wall);
    nave.scale.set(9, 8, 16);
    nave.position.y = 4;
    nave.castShadow = true;
    g.add(nave);
    const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(9.4, 3.4, 4), new THREE.MeshStandardMaterial({ color: 0x54483e, roughness: 0.9 }));
    naveRoof.rotation.y = Math.PI / 4;
    naveRoof.scale.z = 1.9;
    naveRoof.position.y = 9.5;
    g.add(naveRoof);
    const tower = new THREE.Mesh(this.boxGeo, wall);
    tower.scale.set(4.4, 14, 4.4);
    tower.position.set(0, 7, 9.5);
    tower.castShadow = true;
    g.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 6.4, 4), new THREE.MeshStandardMaterial({ color: 0x54483e, roughness: 0.85 }));
    spire.rotation.y = Math.PI / 4;
    spire.position.y = 17;
    spire.castShadow = true;
    g.add(spire);
    const rose = new THREE.Mesh(this.boxGeo, this.glassMat);
    rose.scale.set(1.6, 1.6, 0.1);
    rose.position.set(0, 9.5, 11.76);
    g.add(rose);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(4.5, 4, 8).setFriction(0.8), x, y + 4, z, colliders);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(2.2, 7, 2.2).setFriction(0.8), x, y + 7, z + 9.5, colliders);
  }

  private buildTownsChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // shop rows along the east/west streets
    for (let bz = 0; bz < 2; bz++) {
      const cellZ = z0 + bz * 32;
      const row = hash2(cx, bz, seed + 430);
      if (row < 0.7) {
        const n = 2 + Math.floor(row * 2.5);
        for (let si = 0; si < n; si++) {
          const sx = x0 + 8 + si * 15, sz = cellZ + 20;
          const sy = this.rawHeight(sx, sz, "towns", cx, cz);
          this.addShop(sx, sy, sz, Math.floor(hash2(si, cx * 2 + bz, seed + 431) * 5), group, colliders);
        }
      }
    }
    // a church anchors some towns
    if (hash2(cx, cz, seed + 432) < 0.22) {
      const ex = x0 + 24, ez = z0 + 46;
      const ey = this.rawHeight(ex, ez, "towns", cx, cz);
      this.addChurch(ex, ey, ez, group, colliders);
    }
    // the town well
    if (this.rng.next() < 0.5) {
      const wx = x0 + this.rng.range(12, 52), wz = z0 + this.rng.range(12, 52);
      const wy = this.rawHeight(wx, wz, "towns", cx, cz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.35, 8, 16), this.solidMat("concrete"));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(wx, wy + 0.5, wz);
      ring.castShadow = true;
      group.add(ring);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(1.7, 0.5).setFriction(0.8), wx, wy + 0.4, wz, colliders);
    }
    // lamps + a couple of trees
    for (let i = 0; i < 4; i++) {
      const px = x0 + (hash2(cx, i, seed + 433) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(i, cz, seed + 434) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "towns", cx, cz);
      if (hash2(i, cx + cz, seed + 435) < 0.5) this.addLamp(px, gy, pz, group, colliders);
      else this.addTree(px, gy, pz, group, colliders);
    }
    if (this.rng.next() < 0.7) this.spawnNpc(x0 + this.rng.range(10, 54), z0 + this.rng.range(10, 54), "town");
    if (this.rng.next() < 0.4) this.spawnNpc(x0 + this.rng.range(10, 54), z0 + this.rng.range(10, 54), "town");
  }

  /* -------------------------- the Farmlands -------------------------- */

  private addBarn(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xa83226, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 });
    const body = new THREE.Mesh(this.boxGeo, red);
    body.scale.set(8, 5, 12);
    body.position.y = 2.5;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 3, 4), trim);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 1.6;
    roof.position.y = 6.5;
    g.add(roof);
    const door = new THREE.Mesh(this.boxGeo, trim);
    door.scale.set(3.4, 3.6, 0.2);
    door.position.set(0, 1.8, 6.1);
    g.add(door);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(4, 2.5, 6).setFriction(0.8), x, y + 2.5, z, colliders);
  }

  private addSilo(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 11, 12), steel);
    drum.position.y = 5.5;
    drum.castShadow = true;
    g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    dome.position.y = 11;
    g.add(dome);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cylinder(2.2, 6).setFriction(0.8), x, y + 6, z, colliders);
  }

  private buildFarmsChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // crop field (photographic farmland texture, flat patch)
    const fx = x0 + 24 + (hash2(cx, cz, seed + 440) - 0.5) * 20;
    const fz = z0 + 24 + (hash2(cz, cx, seed + 441) - 0.5) * 20;
    const fy = this.rawHeight(fx, fz, "farms", cx, cz);
    const ft = this.tex["farmland"];
    const fmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    if (ft) this.whenTexLoaded(ft, () => { fmat.map = ft; fmat.needsUpdate = true; });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), fmat);
    field.rotation.x = -Math.PI / 2;
    field.position.set(fx, fy + 0.18, fz);
    field.receiveShadow = true;
    group.add(field);
    // fence along two edges
    const fenceMat = this.solidMat("wood");
    for (let i = 0; i < 7; i++) {
      const post = new THREE.Mesh(this.boxGeo, fenceMat);
      post.scale.set(0.22, 1.3, 0.22);
      post.position.set(fx - 14 + i * 4.7, fy + 0.65, fz + 14);
      group.add(post);
    }
    // barn + silo compound
    if (hash2(cx, cz, seed + 442) < 0.6) {
      const bx = x0 + 52, bz = z0 + 12;
      const by = this.rawHeight(bx, bz, "farms", cx, cz);
      this.addBarn(bx, by, bz, group, colliders);
      this.addSilo(bx + 7, by, bz, group, colliders);
    }
    // hay bales
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const hx = x0 + 10 + hash2(cx, i, seed + 443) * 44;
      const hz = z0 + 40 + hash2(i, cz, seed + 444) * 14;
      const hy = this.rawHeight(hx, hz, "farms", cx, cz);
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10), hayMat);
      bale.rotation.z = Math.PI / 2;
      bale.rotation.y = hash2(cx, i, seed + 445) * Math.PI;
      bale.position.set(hx, hy + 0.9, hz);
      bale.castShadow = true;
      group.add(bale);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(1.1, 1.1).setFriction(0.9), hx, hy + 0.9, hz, colliders);
    }
    // a farmer
    if (this.rng.next() < 0.6) this.spawnNpc(x0 + this.rng.range(10, 54), z0 + this.rng.range(10, 54), "farm");
  }

  /* -------------------------- the Pinemist Forest -------------------------- */

  private buildForestChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const n = 12 + Math.floor(hash2(cx, cz, seed + 460) * 6);
    for (let i = 0; i < n; i++) {
      const px = x0 + (hash2(cx, i, seed + 461) - 0.5) * 58 + 32;
      const pz = z0 + (hash2(i, cz, seed + 462) - 0.5) * 58 + 32;
      const gy = this.rawHeight(px, pz, "forest", cx, cz);
      this.addTree(px, gy, pz, group, colliders);
    }
    // fallen log + boulder
    if (hash2(cx, cz, seed + 463) < 0.5) {
      const lx = x0 + (hash2(cx, cz, seed + 464) - 0.5) * 40 + 32;
      const lz = z0 + (hash2(cz, cx, seed + 465) - 0.5) * 40 + 32;
      const ly = this.rawHeight(lx, lz, "forest", cx, cz);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 6, 8), this.solidMat("wood"));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = hash2(cx, cz, seed + 466) * Math.PI;
      log.position.set(lx, ly + 0.7, lz);
      log.castShadow = true;
      group.add(log);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(0.8, 3).setFriction(0.9), lx, ly + 0.7, lz, colliders);
    }
  }

  /* -------------------------- the Highlands -------------------------- */

  private addBoulder(x: number, y: number, z: number, scale: number, seedN: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), this.solidMat("rock"));
    b.scale.set(scale, scale * (0.7 + hash2(x | 0, z | 0, seedN) * 0.5), scale);
    b.position.set(x, y + scale * 0.35, z);
    b.rotation.set(hash2(x, z, seedN + 1) * 3, hash2(z, x, seedN + 2) * 3, 0);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(scale * 0.6, scale * 0.4, scale * 0.6).setFriction(0.9), x, y + scale * 0.35, z, colliders);
  }

  private buildHillsChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let i = 0; i < 6; i++) {
      const px = x0 + (hash2(cx, i, seed + 470) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(i, cz, seed + 471) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "hills", cx, cz);
      this.addBoulder(px, gy, pz, 1.2 + hash2(i, cx, seed + 472) * 2.6, seed + 473, group, colliders);
    }
    for (let i = 0; i < 3; i++) {
      const px = x0 + (hash2(i, cx, seed + 474) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(cx, i, seed + 475) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "hills", cx, cz);
      this.addTree(px, gy, pz, group, colliders);
    }
  }

  /* -------------------------- the Mother Mountains -------------------------- */

  private buildMountainsChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // giant boulder fields under the peaks
    const n = 3 + Math.floor(hash2(cx, cz, seed + 480) * 4);
    for (let i = 0; i < n; i++) {
      const px = x0 + (hash2(cx, i, seed + 481) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(i, cz, seed + 482) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "mountains", cx, cz);
      this.addBoulder(px, gy, pz, 4 + hash2(i, cx, seed + 483) * 8, seed + 484, group, colliders);
    }
  }

  /* -------------------------- the Amber Desert -------------------------- */

  private addCactus(x: number, y: number, z: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.4, 8), mat);
    trunk.position.y = 1.7;
    trunk.castShadow = true;
    g.add(trunk);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.6, 8), mat);
    armL.position.set(-0.75, 2.2, 0);
    armL.rotation.z = 0.9;
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 8), mat);
    armR.position.set(0.7, 2.6, 0);
    armR.rotation.z = -0.9;
    g.add(armR);
    g.position.set(x, y, z);
    group.add(g);
    this.fixedCol(RAPIER.ColliderDesc.cylinder(0.8, 1.8).setFriction(0.8), x, y + 1.8, z, colliders);
  }

  private buildDesertChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let i = 0; i < 4; i++) {
      const px = x0 + (hash2(cx, i, seed + 490) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(i, cz, seed + 491) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "desert", cx, cz);
      this.addCactus(px, gy, pz, group, colliders);
    }
    for (let i = 0; i < 5; i++) {
      const px = x0 + (hash2(i, cx, seed + 492) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(cz, i, seed + 493) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "desert", cx, cz);
      this.addBoulder(px, gy, pz, 0.7 + hash2(i, cz, seed + 494) * 1.6, seed + 495, group, colliders);
    }
    // a buried ruin: half-collapsed arch
    if (hash2(cx, cz, seed + 496) < 0.3) {
      const rx = x0 + (hash2(cx, cz, seed + 497) - 0.5) * 30 + 32;
      const rz = z0 + (hash2(cz, cx, seed + 498) - 0.5) * 30 + 32;
      const ry = this.rawHeight(rx, rz, "desert", cx, cz);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.7, 8, 20, Math.PI), this.solidMat("concrete"));
      arch.position.set(rx, ry + 0.4, rz);
      arch.rotation.y = hash2(cx, cz, seed + 499) * Math.PI;
      arch.castShadow = true;
      group.add(arch);
    }
  }

  /* -------------------------- the Stone Plateau -------------------------- */

  private buildPlateauChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // standing stones (monoliths)
    const n = 2 + Math.floor(hash2(cx, cz, seed + 500) * 2);
    for (let i = 0; i < n; i++) {
      const px = x0 + (hash2(cx, i, seed + 501) - 0.5) * 50 + 32;
      const pz = z0 + (hash2(i, cz, seed + 502) - 0.5) * 50 + 32;
      const gy = this.rawHeight(px, pz, "plateau", cx, cz);
      const mono = new THREE.Mesh(this.boxGeo, this.solidMat("rock"));
      mono.scale.set(1.5, 6 + hash2(i, cx, seed + 503) * 4, 0.9);
      mono.position.set(px, gy + 3, pz);
      mono.rotation.set(0, hash2(cx, i, seed + 504) * Math.PI, (hash2(i, cz, seed + 505) - 0.5) * 0.3);
      mono.castShadow = true;
      group.add(mono);
      this.fixedCol(RAPIER.ColliderDesc.cuboid(0.8, 3.4, 0.5).setFriction(0.9), px, gy + 3, pz, colliders);
    }
    // an old windmill
    if (hash2(cx, cz, seed + 506) < 0.35) {
      const wx = x0 + (hash2(cx, cz, seed + 507) - 0.5) * 24 + 32;
      const wz = z0 + (hash2(cz, cx, seed + 508) - 0.5) * 24 + 32;
      const wy = this.rawHeight(wx, wz, "plateau", cx, cz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 10, 8), this.solidMat("concrete"));
      pole.position.y = 5;
      pole.castShadow = true;
      g.add(pole);
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), this.solidMat("steel"));
      hub.position.y = 10;
      g.add(hub);
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(this.boxGeo, this.solidMat("wood"));
        blade.scale.set(0.5, 4.4, 0.1);
        blade.position.y = 12.2;
        const holder = new THREE.Group();
        holder.add(blade);
        holder.rotation.z = (b / 4) * Math.PI * 2;
        holder.position.y = 10;
        g.add(holder);
      }
      g.position.set(wx, wy, wz);
      group.add(g);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(0.8, 5.5).setFriction(0.8), wx, wy + 5.5, wz, colliders);
    }
    for (let i = 0; i < 4; i++) {
      const px = x0 + (hash2(i, cx, seed + 509) - 0.5) * 56 + 32;
      const pz = z0 + (hash2(cz, i, seed + 510) - 0.5) * 56 + 32;
      const gy = this.rawHeight(px, pz, "plateau", cx, cz);
      this.addBoulder(px, gy, pz, 1 + hash2(i, cx, seed + 511) * 3, seed + 512, group, colliders);
    }
  }

  /* -------------------------- the Dislocated -------------------------- */

  private buildDislocatedChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    // floating staircase spiraling upward
    if (hash2(cx, cz, seed + 600) < 0.5) {
      const ox = cx * CHUNK + (hash2(cx, cz, seed + 601) - 0.5) * 30 + 32;
      const oz = cz * CHUNK + (hash2(cx, cz, seed + 602) - 0.5) * 30 + 32;
      const steps = 14 + Math.floor(hash2(cx, cz, seed + 603) * 10);
      const r0 = 7 + hash2(cx, cz, seed + 604) * 5;
      const mat = this.solidMat("concrete");
      for (let s = 0; s < steps; s++) {
        const a = s * 0.42;
        const step = new THREE.Mesh(this.boxGeo, mat);
        step.scale.set(2.6, 0.35, 1.4);
        const sx = ox + Math.cos(a) * (r0 - s * 0.22);
        const sz = oz + Math.sin(a) * (r0 - s * 0.22);
        const sy = 10 + s * 1.15;
        step.position.set(sx, sy, sz);
        step.rotation.y = -a;
        step.castShadow = true;
        group.add(step);
        this.fixedColR(RAPIER.ColliderDesc.cuboid(1.3, 0.18, 0.7).setFriction(1.0), sx, sy, sz,
          { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }, colliders);
      }
    }
    // floating platform with a pool of water in the sky
    if (hash2(cx, cz, seed + 610) < 0.45) {
      const px = cx * CHUNK + (hash2(cx, cz, seed + 611) - 0.5) * 24 + 32;
      const pz = cz * CHUNK + (hash2(cx, cz, seed + 612) - 0.5) * 24 + 32;
      const py = 22 + hash2(cx, cz, seed + 613) * 14;
      const plat = new THREE.Mesh(this.boxGeo, this.solidMat("steel"));
      plat.scale.set(16, 1.2, 16);
      plat.position.set(px, py, pz);
      plat.castShadow = true;
      group.add(plat);
      this.fixedCol(RAPIER.ColliderDesc.cuboid(8, 0.6, 8).setFriction(1.0), px, py, pz, colliders);
      this.solver.emitBox(px - 6, py + 0.7, pz - 6, px + 6, py + 1.6, pz + 6, 0.6, 0, 18, SPH_CAP);
    }
    // floating monoliths
    const monN = 1 + Math.floor(hash2(cx, cz, seed + 620) * 3);
    for (let i = 0; i < monN; i++) {
      const mx = cx * CHUNK + this.rng.range(8, 56);
      const mz = cz * CHUNK + this.rng.range(8, 56);
      const my = 16 + this.rng.range(0, 26);
      const mh = this.rng.range(6, 18);
      const mon = new THREE.Mesh(this.boxGeo, this.solidMat("rock"));
      mon.scale.set(2.5, mh, 2.5);
      mon.position.set(mx, my, mz);
      mon.rotation.set(0, this.rng.next() * 6, (this.rng.next() - 0.5) * 0.25);
      mon.castShadow = true;
      group.add(mon);
      this.fixedCol(RAPIER.ColliderDesc.cuboid(1.25, mh / 2, 1.25).setFriction(1.0), mx, my, mz, colliders);
    }
  }

  /* -------------------------- the Impossible -------------------------- */

  private buildImpossibleChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
    const seed = this.worldSeed;
    // giant glass monolith
    if (hash2(cx, cz, seed + 700) < 0.4) {
      const px = cx * CHUNK + 32, pz = cz * CHUNK + 32;
      const ph = 30 + hash2(cx, cz, seed + 701) * 24;
      const mono = new THREE.Mesh(this.boxGeo, this.glassMat);
      mono.scale.set(10, ph, 10);
      mono.position.set(px, ph / 2 + 2, pz);
      group.add(mono);
      this.fixedCol(RAPIER.ColliderDesc.cuboid(5, ph / 2, 5).setFriction(0.4), px, ph / 2 + 2, pz, colliders);
      // breakable panes around its base
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pane = new THREE.Mesh(this.boxGeo, this.glassMat);
        pane.scale.set(4.5, 5, 0.1);
        const wx = px + Math.cos(a) * 5.4, wz = pz + Math.sin(a) * 5.4;
        pane.position.set(wx, 4.5, wz);
        pane.rotation.y = -a + Math.PI / 2;
        group.add(pane);
        this.glass.push({
          id: allocId(), mesh: pane, x: wx, y: 4.5, z: wz,
          nx: Math.cos(a), ny: 0, nz: Math.sin(a), dead: false,
        });
      }
    }
    // launch pad (path to space)
    if (hash2(cx, cz, seed + 710) < 0.5) {
      const px = cx * CHUNK + 32, pz = cz * CHUNK + 32;
      const py = Math.max(this.rawHeight(px, pz, "impossible", cx, cz), 0);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 0.5, 24), this.solidMat("steel"));
      pad.position.set(px, py + 0.25, pz);
      group.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.25, 10, 32), new THREE.MeshBasicMaterial({ color: 0x7fe8ff }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, py + 0.6, pz);
      group.add(ring);
      this.fixedCol(RAPIER.ColliderDesc.cylinder(4, 0.25).setFriction(1.0), px, py + 0.25, pz, colliders);
      this.launchpads.push({ x: px, y: py + 1.5, z: pz });
    }
    // orbit rings
    if (hash2(cx, cz, seed + 720) < 0.35) {
      const px = cx * CHUNK + (hash2(cx, cz, seed + 721) - 0.5) * 30 + 32;
      const pz = cz * CHUNK + (hash2(cx, cz, seed + 722) - 0.5) * 30 + 32;
      const py = 26 + hash2(cx, cz, seed + 723) * 20;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.1, 12, 40), this.solidMat("steel"));
      ring.position.set(px, py, pz);
      ring.rotation.x = Math.PI / 2 + (hash2(cx, cz, seed + 724) - 0.5) * 0.7;
      ring.castShadow = true;
      group.add(ring);
      const q = ring.quaternion;
      this.fixedColR(RAPIER.ColliderDesc.cuboid(9.5, 1.1, 1.1).setFriction(0.9), px, py, pz,
        { x: q.x, y: q.y, z: q.z, w: q.w }, colliders);
    }
  }

  /* -------------------------- deep space -------------------------- */

  private buildSpace(): void {
    if (this.spaceBuilt) return;
    this.spaceBuilt = true;
    const g = new THREE.Group();
    g.name = "space";
    this.spaceGroup = g;

    // starfield
    const starN = 4200;
    const sp = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(4600 + this.rng.next() * 500);
      sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdde6ff, size: 2.6, sizeAttenuation: false }));
    this.stars.frustumCulled = false;
    g.add(this.stars);

    // sun
    const sun = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c0 }));
    sun.position.set(6200, 900, 3400);
    g.add(sun);

    const planets: [number, number, number, number, number, boolean][] = [
      [3200, 200, -800, 240, 0x3f8f8f, true],
      [2500, 30, 1300, 130, 0xa05a3a, false],
      [4300, 520, 1600, 380, 0x8f7f9f, true],
      [1900, -160, -2000, 100, 0x7fa8b8, false],
      [5400, 1000, -2800, 320, 0x6f5f9f, false],
    ];
    for (const [px, py, pz, r, color, ringed] of planets) {
      const tex = this.planetTexture(color, this.rng.next());
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.9, metalness: 0.0,
      }));
      m.position.set(px, py, pz);
      g.add(m);
      this.fixedCol(RAPIER.ColliderDesc.ball(r).setFriction(1.0), px, py, pz, []);
      if (ringed) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.35, r * 1.9, 64),
          new THREE.MeshBasicMaterial({ color: 0xcbb89a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
        ring.position.copy(m.position);
        ring.rotation.x = Math.PI / 2 - 0.35;
        g.add(ring);
      }
    }

    // space station platform (launch destination)
    const station = new THREE.Mesh(this.boxGeo, this.solidMat("steel"));
    station.scale.set(46, 3, 46);
    station.position.set(2500, 80, 0);
    g.add(station);
    this.fixedCol(RAPIER.ColliderDesc.cuboid(23, 1.5, 23).setFriction(1.0), 2500, 80, 0, []);
    const sring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.4, 12, 48), this.solidMat("steel"));
    sring.position.set(2500, 82, 0);
    sring.rotation.x = Math.PI / 2;
    g.add(sring);

    // asteroid belt
    const astMat = this.solidMat("rock");
    const astGeo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 46; i++) {
      const ax = 2200 + this.rng.range(0, 1800);
      const ay = 60 + this.rng.range(0, 380);
      const az = -900 + this.rng.range(0, 1700);
      const s = this.rng.range(1.2, 7);
      const m = new THREE.Mesh(astGeo, astMat);
      m.scale.setScalar(s);
      m.position.set(ax, ay, az);
      m.rotation.set(this.rng.next() * 3, this.rng.next() * 3, this.rng.next() * 3);
      g.add(m);
      const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(ax, ay, az)
        .setLinearDamping(0.0).setAngularDamping(0.0));
      this.rapier.createCollider(RAPIER.ColliderDesc.ball(s).setDensity(2600), body);
      body.setAngvel({ x: this.rng.range(-0.5, 0.5), y: this.rng.range(-0.5, 0.5), z: this.rng.range(-0.5, 0.5) }, true);
      this.dyn.push({
        id: allocId(), body, mesh: m, kind: "asteroid", radius: s, volume: s * s * s,
        age: 0, dead: false, wasSub: 0,
      });
    }

    // resident singularities
    this.spawnBlackHole(2800, 160, 500, 7, 52000, g);
    this.spawnBlackHole(4900, 320, -1200, 4, 30000, g);

    this.scene.add(g);
    g.visible = false; // only visible in the other dimension
  }

  private planetTexture(color: number, rnd: number): THREE.CanvasTexture {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const g = cv.getContext("2d")!;
    const c = new THREE.Color(color);
    g.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      const y = (hash2(i, (rnd * 999) | 0, 12) * 128) | 0;
      const band = 3 + ((hash2(i, 7, 33) * 12) | 0);
      const bright = (hash2(i, 3, 77) - 0.4) * 70;
      g.fillStyle = `rgba(${clamp((c.r * 255 + bright) | 0, 0, 255)},${clamp((c.g * 255 + bright) | 0, 0, 255)},${clamp((c.b * 255 + bright) | 0, 0, 255)},${0.12 + hash2(i, 5, 91) * 0.3})`;
      g.fillRect(0, y, 256, band);
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + hash2(i, 9, 13) * 0.1})`;
      g.beginPath();
      g.arc(hash2(i, 4, 17) * 256, hash2(i, 8, 23) * 128, 1 + hash2(i, 6, 29) * 7, 0, 7);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ============================== VEHICLES ============================== */

  private spawnCar(x: number, y: number, z: number, yaw: number, debris: boolean): DynRec {
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
    cabin.position.y = 1.5;
    g.add(lower, cabin);
    g.rotation.y = yaw;
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.8));
    this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(2.1, 0.65, 0.95).setDensity(750).setFriction(0.8).setRestitution(0.2), body);
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.scene.add(g);
    const rec: DynRec = {
      id: allocId(), body, mesh: g, kind: "car", radius: 2.4, volume: 12,
      age: 0, dead: false, wasSub: 0, debris,
    };
    this.dyn.push(rec);
    return rec;
  }

  private spawnBoat(x: number, y: number, z: number, yaw: number, debris: boolean): DynRec {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.6 });
    const hull = new THREE.Mesh(this.boxGeo, hullMat);
    hull.scale.set(5.6, 1.6, 2.4);
    hull.position.y = 0.8;
    hull.castShadow = true;
    const mast = new THREE.Mesh(this.boxGeo, hullMat);
    mast.scale.set(0.16, 4, 0.16);
    mast.position.set(1.2, 3, 0);
    g.add(hull, mast);
    g.rotation.y = yaw;
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z).setLinearDamping(0.4).setAngularDamping(1.1));
    this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(2.8, 0.8, 1.2).setDensity(320).setFriction(0.4).setRestitution(0.2), body);
    this.scene.add(g);
    const rec: DynRec = {
      id: allocId(), body, mesh: g, kind: "boat", radius: 3, volume: 5.6 * 1.6 * 2.4,
      age: 0, dead: false, wasSub: 0, debris,
    };
    this.dyn.push(rec);
    return rec;
  }

  private spawnCrates(x: number, y: number, z: number): void {
    for (let ix = 0; ix < 3; ix++) {
      for (let iz = 0; iz < 3; iz++) {
        for (let iy = 0; iy < 4; iy++) {
          if (ix + iz + iy > 4) continue;
          const m = new THREE.Mesh(this.boxGeo, this.crateMat);
          m.scale.set(1.1, 1.1, 1.1);
          m.position.set(x + (ix - 1) * 1.15, y + 0.55 + iy * 1.15, z + (iz - 1) * 1.15);
          m.castShadow = true;
          this.scene.add(m);
          const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(m.position.x, m.position.y, m.position.z).setLinearDamping(0.2).setAngularDamping(0.5));
          this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.55, 0.55).setDensity(500).setFriction(0.7).setRestitution(0.1), body);
          this.dyn.push({
            id: allocId(), body, mesh: m, kind: "crate", radius: 0.9, volume: 1.3,
            age: 0, dead: false, wasSub: 0, debris: true,
          });
        }
      }
    }
    this.log("Crate stack deployed — gravity will do the rest.", "sys");
  }

  /* ============================== BLACK HOLES ============================== */

  private spawnBlackHole(x: number, y: number, z: number, horizon: number, mass: number, group?: THREE.Group): BHRec {
    if (this.blackholes.length >= 4) {
      const old = this.blackholes.shift()!;
      this.scene.remove(old.disk, old.glow, old.sphere);
      old.disk.geometry.dispose();
      old.glow.material.dispose();
      old.sphere.geometry.dispose();
    }
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(horizon, 28, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    sphere.position.set(x, y, z);
    const diskMat = makeDiskMaterial();
    const disk = new THREE.Mesh(new THREE.RingGeometry(horizon * 1.4, horizon * 4.4, 72, 1), diskMat);
    disk.position.set(x, y, z);
    disk.rotation.x = -Math.PI / 2;
    const glowTex = this.glowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x9988ff, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(horizon * 11);
    glow.position.set(x, y, z);
    const target = group ?? this.scene;
    target.add(sphere, disk, glow);
    const rec: BHRec = {
      x, y, z, mass, horizon,
      field: { kind: "blackhole", id: allocId(), x, y, z, mass, horizon, diskRadius: horizon * 4.4 },
      disk, glow, sphere, diskMat, born: this.time,
    };
    this.blackholes.push(rec);
    return rec;
  }

  private glowTexture(): THREE.CanvasTexture {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(180,170,255,0.45)");
    grad.addColorStop(1, "rgba(120,110,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  /** Gravitational pull vector at a point (clamped). */
  private bhAccelAt(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    for (const bh of this.blackholes) {
      const dx = bh.x - x, dy = bh.y - y, dz = bh.z - z;
      const d2 = dx * dx + dy * dy + dz * dz + 4;
      const d = Math.sqrt(d2);
      const s = Math.min(320, (bh.mass * 2.2) / d2);
      out.x += (dx / d) * s;
      out.y += (dy / d) * s;
      out.z += (dz / d) * s;
    }
    return out;
  }

  /* ============================== PORTALS ============================== */

  private placePortal(click: { x: number; y: number; z: number; nx: number; ny: number; nz: number }): void {
    if (!this.pendingPortal) {
      this.pendingPortal = click;
      this.log("Portal entrance fixed. Click again to place the exit.", "sys");
      return;
    }
    if (this.portals.length >= 2) {
      const old = this.portals.shift()!;
      this.scene.remove(old.groupA, old.groupB);
      old.matA.dispose();
      old.matB.dispose();
    }
    const a = this.pendingPortal;
    this.pendingPortal = null;
    const pair: PortalPair = {
      id: allocId(),
      ax: a.x + a.nx * 1.2, ay: a.y + a.ny * 1.2, az: a.z + a.nz * 1.2,
      anx: a.nx, any: a.ny, anz: a.nz,
      bx: click.x, by: click.y + 7, bz: click.z,
      bnx: 0, bny: -1, bnz: 0,
      radius: 3.2,
    };
    const mkGroup = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, mat: THREE.ShaderMaterial) => {
      const gr = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(pair.radius, 48), mat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(pair.radius, 0.18, 10, 48), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
      gr.add(disc, rim);
      gr.position.set(px, py, pz);
      this.tmpV.set(nx, ny, nz);
      gr.lookAt(px + nx, py + ny, pz + nz);
      return gr;
    };
    const matA = makePortalMaterial(0.08);
    const matB = makePortalMaterial(0.55);
    const groupA = mkGroup(pair.ax, pair.ay, pair.az, pair.anx, pair.any, pair.anz, matA);
    const groupB = mkGroup(pair.bx, pair.by, pair.bz, pair.bnx, pair.bny, pair.bnz, matB);
    this.scene.add(groupA, groupB);
    this.portals.push({ pair, groupA, groupB, matA, matB });
    this.audio.portal();
    this.log("WORMHOLE LINKED — water, vehicles and debris will transit the pair.", "sys");
  }

  /* ============================== RAGDOLLS ============================== */

  private makeRagdoll(x: number, y: number, z: number, scale: number, clothHex?: number, skinHex?: number): Ragdoll {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: skinHex ?? 0xd8c4a8, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: clothHex ?? 0x2e6fc2, roughness: 0.9 });
    const cloth2 = new THREE.MeshStandardMaterial({ color: clothHex ?? 0xc23b2e, roughness: 0.9 });
    const bodies: RAPIER.RigidBody[] = [];
    const meshes: THREE.Object3D[] = [];
    const addPart = (geo: THREE.BufferGeometry, mat: THREE.Material, dx: number, dy: number, dz: number, density: number, colDesc: RAPIER.ColliderDesc) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(dx, dy, dz);
      m.scale.setScalar(scale);
      m.castShadow = true;
      g.add(m);
      const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x + dx * scale, y + dy * scale, z + dz * scale)
        .setLinearDamping(0.12).setAngularDamping(0.4));
      colDesc = colDesc.setDensity(density).setFriction(0.5);
      this.rapier.createCollider(colDesc, body);
      body.setLinvel({
        x: (this.rng.next() - 0.5) * 3,
        y: this.rng.next() * 2,
        z: (this.rng.next() - 0.5) * 3,
      }, true);
      bodies.push(body);
      meshes.push(m);
      return body;
    };
    const torso = addPart(new THREE.BoxGeometry(0.42, 0.62, 0.24), cloth, 0, 1.05, 0, 900,
      RAPIER.ColliderDesc.cuboid(0.21 * scale, 0.31 * scale, 0.12 * scale));
    const head = addPart(new THREE.SphereGeometry(0.21, 12, 10), skin, 0, 1.72, 0, 1100,
      RAPIER.ColliderDesc.ball(0.21 * scale));
    const armL = addPart(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), cloth2, -0.36, 1.15, 0, 800,
      RAPIER.ColliderDesc.capsule(0.21 * scale, 0.1 * scale));
    const armR = addPart(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), cloth2, 0.36, 1.15, 0, 800,
      RAPIER.ColliderDesc.capsule(0.21 * scale, 0.1 * scale));
    const legL = addPart(new THREE.CapsuleGeometry(0.12, 0.52, 4, 8), cloth, -0.13, 0.3, 0, 900,
      RAPIER.ColliderDesc.capsule(0.26 * scale, 0.12 * scale));
    const legR = addPart(new THREE.CapsuleGeometry(0.12, 0.52, 4, 8), cloth, 0.13, 0.3, 0, 900,
      RAPIER.ColliderDesc.capsule(0.26 * scale, 0.12 * scale));

    const joints: RAPIER.ImpulseJoint[] = [];
    const joint = (b1: RAPIER.RigidBody, a1: [number, number, number], b2: RAPIER.RigidBody, a2: [number, number, number], axis: [number, number, number]) => {
      const data = RAPIER.JointData.revolute(
        new RAPIER.Vector3(a1[0], a1[1], a1[2]),
        new RAPIER.Vector3(a2[0] * scale, a2[1] * scale, a2[2] * scale),
        new RAPIER.Vector3(axis[0], axis[1], axis[2]),
      );
      joints.push(this.rapier.createImpulseJoint(data, b1, b2, true));
    };
    joint(torso, [0, 0.31, 0], head, [0, -0.18, 0], [1, 0, 0]);
    joint(torso, [-0.24, 0.24, 0], armL, [0, 0.26, 0], [0, 0, 1]);
    joint(torso, [0.24, 0.24, 0], armR, [0, 0.26, 0], [0, 0, 1]);
    joint(torso, [-0.12, -0.31, 0], legL, [0, 0.34, 0], [0, 0, 1]);
    joint(torso, [0.12, -0.31, 0], legR, [0, 0.34, 0], [0, 0, 1]);

    this.scene.add(g);
    const rec: Ragdoll = { group: g, bodies, meshes, joints, scale, dead: false };
    this.ragdolls.push(rec);
    if (this.ragdolls.length > 10) {
      const old = this.ragdolls.shift()!;
      this.removeRagdoll(old);
    }
    return rec;
  }

  private removeRagdoll(r: Ragdoll): void {
    if (r.dead) return;
    r.dead = true;
    for (const j of r.joints) {
      try { this.rapier.removeImpulseJoint(j, true); } catch { /* gone */ }
    }
    for (const b of r.bodies) {
      try { this.rapier.removeRigidBody(b); } catch { /* gone */ }
    }
    this.scene.remove(r.group);
    r.meshes.forEach((m) => {
      const mesh = m as THREE.Mesh;
      mesh.geometry.dispose();
    });
  }

  /* ============================== EXPLOSIONS ============================== */

  private explode(x: number, y: number, z: number, radius: number, power: number, crater = 0): void {
    // rigid bodies
    for (const b of this.dyn) {
      if (b.dead) continue;
      const p = b.body.translation();
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius + b.radius) {
        const k = power * (1 - d / (radius + b.radius)) * b.body.mass() * 0.02;
        b.body.wakeUp();
        b.body.applyImpulse({
          x: (dx / Math.max(d, 0.5)) * k,
          y: k * 0.9 + k * 0.35,
          z: (dz / Math.max(d, 0.5)) * k,
        }, true);
      }
    }
    // ragdolls
    for (const r of this.ragdolls) {
      if (r.dead) continue;
      for (const b of r.bodies) {
        const p = b.translation();
        const d = Math.hypot(p.x - x, p.y - y, p.z - z);
        if (d < radius) {
          const k = power * (1 - d / radius) * b.mass() * 0.03;
          b.applyImpulse({
            x: ((p.x - x) / Math.max(d, 0.5)) * k,
            y: k,
            z: ((p.z - z) / Math.max(d, 0.5)) * k,
          }, true);
        }
      }
    }
    // people
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const t = npc.body.translation();
      const d = Math.hypot(t.x - x, t.y - y, t.z - z);
      if (d < radius) {
        const k = 1 - d / radius;
        this.ragdollNpc(npc, ((t.x - x) / Math.max(d, 0.5)) * 30 * k, 10 + 14 * k, ((t.z - z) / Math.max(d, 0.5)) * 30 * k);
      }
    }
    // SPH fluid kick + heat
    const s = this.solver;
    for (let i = 0; i < s.n; i++) {
      const dx = s.px[i] - x, dy = s.py[i] - y, dz = s.pz[i] - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) {
        const k = power * 0.1 * (1 - d / radius);
        s.vx[i] += (dx / Math.max(d, 0.5)) * k;
        s.vy[i] += (dy / Math.max(d, 0.5)) * k + k * 0.4;
        s.vz[i] += (dz / Math.max(d, 0.5)) * k;
        s.temp[i] += k * 5;
      }
    }
    // glass
    for (const gl of this.glass) {
      if (gl.dead) continue;
      const d = Math.hypot(gl.x - x, gl.y - y, gl.z - z);
      if (d < radius + 1.5) this.shatterGlass(gl);
    }
    // structures
    this.damageAt(x, y, z, radius, power * 0.6);
    // player
    if (this.alive) {
      const d = Math.hypot(this.pos.x - x, this.pos.y - y, this.pos.z - z);
      if (d < radius + 1.5) {
        const dmg = (1 - d / (radius + 1.5)) * power * 0.16;
        this.hp -= dmg;
        this.trauma = Math.min(1, this.trauma + 0.4);
        if (!this.flying) this.vel.y += (1 - d / radius) * 9;
        if (this.hp <= 0) this.die("obliterated by the blast");
      }
    }
    // world effects
    if (crater > 0) {
      this.terrainDent(x, z, radius * 0.7, crater);
    }
    const am = 1;
    this.glow.burst(x, y + 1, z, Math.floor(36 * am), {
      speed: radius * 0.8, up: radius * 0.5, life: 0.7, size: 3, grow: 1.5,
      r: 1, g: 0.75, b: 0.4, alpha: 0.9, grav: 2, drag: 2.5,
    });
    this.smoke.burst(x, y + 2, z, Math.floor(40 * am), {
      speed: radius * 0.5, up: radius * 0.4, life: 2.4, size: 3.2, grow: 2.4,
      r: 0.25, g: 0.23, b: 0.22, alpha: 0.6, grav: -2.5, drag: 1.4,
    });
    // fire
    this.fires.push({ id: allocId(), x, y: y + 0.5, z, radius: radius * 0.3, fuel: 14, maxFuel: 14 });
    if (this.fires.length > 12) this.fires.shift();
    // shockwave
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.4, z);
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, age: 0, max: radius * 1.7 });
    // light + audio
    this.flashLight.position.set(x, y + 4, z);
    this.flashLight.intensity = 12000;
    this.trauma = Math.min(1, this.trauma + power * 0.004);
    this.audio.explosion(power * 0.012);
    this.log(`DETONATION — ${power.toFixed(0)} kJ released at (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}).`, "alert");
  }

  private terrainDent(x: number, z: number, radius: number, depth: number): void {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(`${cx},${cz}`);
    if (!c) return;
    const oldFn = c.heightAt;
    const dents: { x: number; z: number; r: number; d: number }[] = [{ x, z, r: radius, d: depth }];
    c.heightAt = (px, pz) => {
      let h = oldFn(px, pz);
      for (const dd of dents) {
        const d = Math.hypot(px - dd.x, pz - dd.z);
        if (d < dd.r) h -= dd.d * (1 - d / dd.r) ** 2;
      }
      return h;
    };
    // (visual crater decal — the rapier trimesh keeps its original surface)
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.75, 20),
      new THREE.MeshBasicMaterial({ color: 0x141210, transparent: true, opacity: 0.75, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, c.heightAt(x, z) + 0.12, z);
    c.group.add(decal);
  }

  private damageAt(x: number, y: number, z: number, radius: number, amount: number): void {
    for (const seg of this.segments) {
      if (seg.dead) continue;
      const p = seg.body.translation();
      const d = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2);
      const reach = radius + Math.max(seg.sx, seg.sy, seg.sz) * 0.5;
      if (d < reach) {
        seg.health -= amount * (1 - (d / reach) * 0.7);
        if (seg.health <= 0) this.fractureSegment(seg, (p.x - x) / Math.max(d, 1), (p.z - z) / Math.max(d, 1));
      }
    }
  }

  private fractureSegment(seg: SegmentRec, dirX: number, dirZ: number): void {
    if (seg.dead) return;
    seg.dead = true;
    const p = seg.body.translation();
    try { this.rapier.removeRigidBody(seg.body); } catch { /* gone */ }
    this.scene.remove(seg.mesh);
    // debris: 2 chunks
    for (let i = 0; i < 2; i++) {
      const s = Math.min(seg.sx, seg.sz) * 0.55;
      const m = new THREE.Mesh(this.boxGeo, this.debrisMat);
      m.scale.set(seg.sx * (0.4 + i * 0.2), seg.sy * 0.6, seg.sz * (0.4 + i * 0.2));
      m.position.set(p.x + (i - 0.5) * 1.2, p.y - seg.sy * 0.2, p.z + (i - 0.5) * 0.8);
      m.castShadow = true;
      this.scene.add(m);
      const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(m.position.x, m.position.y, m.position.z)
        .setLinearDamping(0.1).setAngularDamping(0.3));
      this.rapier.createCollider(
        RAPIER.ColliderDesc.cuboid(m.scale.x / 2, m.scale.y / 2, m.scale.z / 2).setDensity(2200).setFriction(0.9), body);
      body.setLinvel({
        x: dirX * 6 + (this.rng.next() - 0.5) * 4,
        y: 4 + this.rng.next() * 5,
        z: dirZ * 6 + (this.rng.next() - 0.5) * 4,
      }, true);
      void s;
      this.dyn.push({
        id: allocId(), body, mesh: m, kind: "debris", radius: Math.max(m.scale.x, m.scale.z) * 0.6,
        volume: m.scale.x * m.scale.y * m.scale.z, age: 0, dead: false, wasSub: 0, debris: true,
      });
    }
    this.smoke.burst(p.x, p.y, p.z, 14, {
      speed: 5, up: 3, life: 1.6, size: 2, grow: 2, r: 0.6, g: 0.58, b: 0.55, alpha: 0.5, grav: 1.2, drag: 1.6,
    });
    this.audio.crack();
    this.log("STRUCTURAL FAILURE — a segment broke away and is falling.", "warn");
  }

  private shatterGlass(gl: GlassRec): void {
    if (gl.dead) return;
    gl.dead = true;
    (gl.mesh.parent as THREE.Object3D | null)?.remove(gl.mesh);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16), this.glassMat);
      m.position.set(gl.x, gl.y, gl.z);
      this.scene.add(m);
      this.shards.push({
        mesh: m,
        vx: gl.nx * 3 + (this.rng.next() - 0.5) * 7 + (this.pos.x - gl.x) * 0.08,
        vy: (this.rng.next() - 0.3) * 6,
        vz: gl.nz * 3 + (this.rng.next() - 0.5) * 7 + (this.pos.z - gl.z) * 0.08,
        life: 1.6,
      });
    }
    this.audio.crack();
  }

  /* ============================== INPUT ============================== */

  private onKey = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (this.attract) return; // menu mode: the world is a backdrop
    this.keys.add(e.code);
    if (e.code.startsWith("Digit")) {
      const d = e.code.slice(5);
      const n = d === "0" ? 9 : Number(d) - 1;
      if (n >= 0 && n < HOTBAR.length) {
        this.tool = HOTBAR[n].id;
        this.buildWeaponMesh(this.tool);
        this.cb.onLog(`Tool: ${HOTBAR[n].label}.`, "sys");
      }
    }
    if (e.code === "KeyQ" || e.code === "KeyX") {
      const n = e.code === "KeyQ" ? 10 : 11;
      if (n < HOTBAR.length) {
        this.tool = HOTBAR[n].id;
        this.buildWeaponMesh(this.tool);
        this.cb.onLog(`Tool: ${HOTBAR[n].label}.`, "sys");
      }
    }
    if (e.code === "KeyF") {
      this.flying = !this.flying;
      this.cb.onLog(this.flying ? "Flight engaged — space rises, shift descends." : "Flight disengaged. Gravity resumes its claim.", "sys");
    }
    if (e.code === "KeyR" && !this.alive) this.respawn();
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyT") this.cycleTimeScale(1);
    if (e.code === "KeyG") this.cycleTimeScale(-1);
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };

  private onPointerUp = (e: PointerEvent): void => {
    this.mouseDown = false;
    if (e.button === 2) this.releaseGrab();
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.paused || !this.alive) return;
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      this.mouseDown = true;
      this.autoT = 0;
      this.fireTool();
    } else if (e.button === 2) {
      this.grabNearest();
    }
  };
  private onPointerMove = (e: PointerEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * 0.0024;
    this.pitch = clamp(this.pitch - e.movementY * 0.0024, -1.45, 1.45);
    const r = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const hit = this.pickSurface();
    if (hit) {
    }
  };
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.cycleTimeScale(e.deltaY > 0 ? -1 : 1, true);
  };
  private onResize = (): void => this.resize();
  private onLockChange = (): void => {
    // Esc or a click outside the canvas releases the cursor: pause so the
    // UI layer can present the pause menu.
    if (document.pointerLockElement !== this.canvas && !this.paused && this.alive) {
      this.paused = true;
    }
  };

  private attachInput(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  private detachInput(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
  }

  private pickSurface(): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.distance > 80) break;
      if (h.object === this.stars || (h.object as unknown as { isSprite?: boolean }).isSprite) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      return { x: h.point.x, y: h.point.y, z: h.point.z, nx: n.x, ny: n.y, nz: n.z };
    }
    // ocean plane fallback
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.seaLevel);
    const wp = new THREE.Vector3();
    const hitW = this.raycaster.ray.intersectPlane(plane, wp);
    if (hitW) return { x: wp.x, y: wp.y, z: wp.z, nx: 0, ny: 1, nz: 0 };
    return null;
  }

  /* ============================== TOOLS ============================== */

  setTool(t: ToolId): void { this.tool = t; }
  selectToolIndex(i: number): void { if (i >= 0 && i < HOTBAR.length) { this.tool = HOTBAR[i].id; this.buildWeaponMesh(this.tool); } }

  private fireTool(): void {
    if (!this.alive || this.attract) return;
    const hit = this.pickSurface();
    const p = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : this.tmpV2.copy(this.camera.position).addScaledVector(this.cameraDirection(), 14).clone();
    switch (this.tool) {
      case "pistol":
        this.shoot("pistol");
        break;
      case "smg":
        this.shoot("smg");
        break;
      case "shotgun":
        this.shoot("shotgun");
        break;
      case "rifle":
        this.shoot("rifle");
        break;
      case "rocket":
        this.throwRocket();
        break;
      case "grenade":
        this.throwGrenade();
        break;
      case "dynamite":
        this.throwBomb();
        break;
      case "singularity":
        this.spawnBlackHole(p.x, p.y + 6, p.z, 2.2, 2600);
        this.log("SINGULARITY seeded. It will grow hungry.", "alert");
        break;
      case "water": {
        const n = this.solver.emitBox(p.x - 3, p.y + 0.4, p.z - 3, p.x + 3, p.y + 4, p.z + 3, 0.55, 0, this.ambientC, SPH_CAP);
        if (n > 0) this.audio.splash(6);
        break;
      }
      case "crates":
        this.spawnCrates(p.x, p.y + 0.2, p.z);
        break;
      case "glass": {
        const m = new THREE.Mesh(this.boxGeo, this.glassMat);
        m.scale.set(4.5, 3.5, 0.12);
        m.position.set(p.x, p.y + 1.8, p.z);
        this.scene.add(m);
        this.glass.push({ id: allocId(), mesh: m, x: p.x, y: p.y + 1.8, z: p.z, nx: 0, ny: 0, nz: 1, dead: false });
        this.log("Glass wall erected. It is, of course, breakable.", "sys");
        break;
      }
      case "portal":
        if (hit) this.placePortal({ x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz });
        break;
      case "ragdoll":
        this.makeRagdoll(p.x, p.y + 0.4, p.z, 1);
        this.log("Test dummy deployed. It obeys exactly one law: momentum.", "sys");
        break;
    }
  }

  private cameraDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  private throwBomb(): void {
    const dir = this.cameraDirection();
    const origin = this.camera.position.clone().addScaledVector(dir, 1.4);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }));
    m.position.copy(origin);
    this.scene.add(m);
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true)
      .setLinearDamping(0.05));
    this.rapier.createCollider(RAPIER.ColliderDesc.ball(0.26).setDensity(3000), body);
    body.setLinvel({ x: dir.x * 20, y: dir.y * 20 + 3, z: dir.z * 20 }, true);
    const rec: DynRec = {
      id: allocId(), body, mesh: m, kind: "bomb", radius: 0.3, volume: 0.08,
      age: 0, dead: false, fuse: 2.6, wasSub: 0,
    };
    this.dyn.push(rec);
    this.bombs.push({ rec });
  }

  private interact(): void {
    if (!this.alive || this.paused || this.attract) return;
    // dimension portal
    const portal = this.portalNearby();
    if (portal) {
      this.switchDimension(this.dimension === "prime" ? "other" : "prime");
      return;
    }
    // sewer grates
    let best: GrateRec | null = null;
    let bestD = 3.2;
    for (const g of this.grates) {
      const d = Math.hypot(g.x - this.pos.x, g.z - this.pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best) {
      if (this.pos.y > 2) {
        this.teleportPlayer(best.x, -6.1, best.z);
        this.log("Down the drain. The sewers run in two directions, with water on the floor.", "sys");
      } else if (this.pos.y < -3) {
        this.teleportPlayer(best.x, 8.2, best.z);
        this.log("You climb back up into the street.", "sys");
      }
      return;
    }
    // launch pads
    for (const pad of this.launchpads) {
      if (Math.hypot(pad.x - this.pos.x, pad.z - this.pos.z) < 6 && Math.abs(pad.y - this.pos.y) < 8) {
        this.flying = true;
        this.vel.set(0, 130, 0);
        this.trauma = 0.5;
        this.audio.explosion(0.6);
        this.log("LAUNCH VECTOR — ignition. You rocket skyward over the endless planet.", "alert");
        return;
      }
    }
  }

  private teleportPlayer(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.playerBody.setNextKinematicTranslation({ x, y, z });
  }

  /* ============================== NPCS — OTHER PEOPLE ============================== */

  private npcSkin(): number {
    const arr = [0xe8c39e, 0xd8a878, 0xb07a4e, 0x8a5a34, 0xf0d0b0];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private spawnNpc(x: number, z: number, kind: string): void {
    if (this.npcs.length >= 40) return;
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    let top = 0x3b6ea5, bottom = 0x33415c;
    if (kind === "farm") { top = 0x7a8c4a; bottom = 0x5a4632; }
    else if (kind === "coast") { top = 0xc96a3a; bottom = 0x44586c; }
    else {
      const tops = [0x3b6ea5, 0x884455, 0x557744, 0x887766, 0x555577, 0xaa6633, 0x224466];
      const bots = [0x33415c, 0x4a4a52, 0x6b5a44, 0x2f3a2f, 0x3a3a3a];
      top = tops[Math.floor(Math.random() * tops.length)];
      bottom = bots[Math.floor(Math.random() * bots.length)];
    }
    const skinM = new THREE.MeshStandardMaterial({ color: this.npcSkin(), roughness: 0.85 });
    const topM = new THREE.MeshStandardMaterial({ color: top, roughness: 0.95 });
    const botM = new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.95 });
    const hairM = new THREE.MeshStandardMaterial({ color: [0x2a1d12, 0x4a3a22, 0x141414, 0x6a4a2a][Math.floor(Math.random() * 4)], roughness: 1 });
    const addPart = (geo: THREE.BufferGeometry, mat: THREE.Material, dx: number, dy: number, dz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(dx, dy, dz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    addPart(new THREE.CapsuleGeometry(0.11, 0.42, 3, 6), botM, -0.13, 0.5, 0);
    addPart(new THREE.CapsuleGeometry(0.11, 0.42, 3, 6), botM, 0.13, 0.5, 0);
    addPart(new THREE.CapsuleGeometry(0.24, 0.42, 3, 8), topM, 0, 1.2, 0);
    addPart(new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), topM, -0.34, 1.18, 0);
    addPart(new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), topM, 0.34, 1.18, 0);
    addPart(new THREE.SphereGeometry(0.16, 10, 8), skinM, 0, 1.72, 0);
    addPart(new THREE.SphereGeometry(0.165, 10, 8), hairM, 0, 1.79, -0.03);
    g.position.set(x, y, z);
    this.scene.add(g);
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 0.9, z)
      .setLinearDamping(0.7).setAngularDamping(2.2));
    this.rapier.createCollider(RAPIER.ColliderDesc.capsule(0.32, 0.32).setFriction(0.6), body);
    const a = Math.random() * Math.PI * 2;
    this.npcs.push({
      body, group: g, head: null, kind, top,
      target: new THREE.Vector3(x + Math.cos(a) * 8, 0, z + Math.sin(a) * 8),
      speed: 1.3 + Math.random() * 0.9,
      sayT: 1.5 + Math.random() * 7,
      lineIdx: Math.floor(Math.random() * 4),
      alive: true,
    });
  }

  private killNpc(npc: NpcRec, silent: boolean): void {
    if (!npc.alive) return;
    npc.alive = false;
    try { this.rapier.removeRigidBody(npc.body); } catch { /* gone */ }
    this.scene.remove(npc.group);
    npc.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    if (!silent) this.log("A local goes down under your feet.", "sys");
  }

  private ragdollNpc(npc: NpcRec, ix: number, iy: number, iz: number): void {
    if (!npc.alive) return;
    const t = npc.body.translation();
    const r = this.makeRagdoll(t.x, t.y + 0.5, t.z, 1.0, npc.top, 0xd8c4a8);
    for (const b of r.bodies) b.applyImpulse({ x: ix, y: iy, z: iz }, true);
    this.killNpc(npc, true);
    this.log("They go down in a tangle of limbs — a ragdoll crumpling to the ground.", "alert");
  }

  private bubbleTexture(text: string): THREE.Texture {
    const hit = this.bubbleCache.get(text);
    if (hit) return hit;
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "rgba(252, 252, 255, 0.95)";
    c.beginPath();
    c.roundRect(14, 8, 484, 88, 22);
    c.fill();
    c.beginPath();
    c.moveTo(226, 92); c.lineTo(256, 124); c.lineTo(286, 92);
    c.closePath();
    c.fill();
    c.fillStyle = "#1c2230";
    c.font = "600 30px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    let l1 = text, l2 = "";
    if (c.measureText(text).width > 440) {
      const words = text.split(" ");
      const mid = Math.ceil(words.length / 2);
      l1 = words.slice(0, mid).join(" ");
      l2 = words.slice(mid).join(" ");
    }
    if (l2) { c.fillText(l1, 256, 40); c.fillText(l2, 256, 74); }
    else c.fillText(l1, 256, 52);
    const tex = new THREE.CanvasTexture(cv);
    this.bubbleCache.set(text, tex);
    return tex;
  }

  private sayLine(npc: NpcRec, text: string): void {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTexture(text), transparent: true, depthWrite: false }));
    const t = npc.body.translation();
    spr.position.set(t.x, t.y + 2.2, t.z);
    spr.scale.set(3.4, 0.85, 1);
    this.scene.add(spr);
    this.bubbles.push({ spr, ttl: 4.5 });
  }

  private updateNpcs(dt: number): void {
    for (const b of this.bubbles) {
      b.ttl -= dt;
      if (b.ttl <= 0) {
        this.scene.remove(b.spr);
        b.spr.material.dispose();
      }
    }
    this.bubbles = this.bubbles.filter((b) => b.ttl > 0);
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const t = npc.body.translation();
      const ground = this.heightAt(t.x, t.z);
      npc.group.position.set(t.x, ground - 0.02, t.z);
      const dx = npc.target.x - t.x, dz = npc.target.z - t.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 0.8) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 16;
        npc.target.set(t.x + Math.cos(a) * r, 0, t.z + Math.sin(a) * r);
      } else {
        npc.body.setLinvel({ x: (dx / dd) * npc.speed, y: 0, z: (dz / dd) * npc.speed }, true);
        npc.group.rotation.y = Math.atan2(dx, dz);
      }
      // flung by a fast object → ragdoll
      for (const d of this.dyn) {
        const lv = d.body.linvel();
        if (Math.hypot(lv.x, lv.y, lv.z) > 8) {
          const dp = d.body.translation();
          if (Math.hypot(dp.x - t.x, dp.z - t.z) < 1.6) {
            this.ragdollNpc(npc, lv.x * 1.1, Math.abs(lv.y) * 0.5 + 4, lv.z * 1.1);
            break;
          }
        }
      }
      // speak to nearby players
      npc.sayT -= dt;
      if (npc.sayT <= 0) {
        const p = this.pos;
        if (npc.alive && Math.hypot(t.x - p.x, t.z - p.z) < 18) {
          const lines = this.npcLines[npc.kind] ?? this.npcLines.city;
          this.sayLine(npc, lines[npc.lineIdx % lines.length]);
          npc.lineIdx++;
        }
        npc.sayT = 8 + Math.random() * 16;
      }
    }
    this.npcs = this.npcs.filter((n) => n.alive);
  }

  /* ============================== FIRST-PERSON VIEWMODEL ============================== */

  private buildViewmodel(): void {
    const g = new THREE.Group();
    const skinM = new THREE.MeshStandardMaterial({ color: 0xd8b088, roughness: 0.9 });
    const suitM = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.85 });
    const mkArm = (side: number) => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), suitM);
      upper.position.set(side * 0.09, -0.1, 0.12);
      upper.rotation.x = 0.95;
      upper.castShadow = false;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.26, 4, 8), suitM);
      fore.position.set(side * 0.055, 0.03, -0.06);
      fore.rotation.x = -0.45;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.13), skinM);
      hand.position.set(side * 0.035, 0.05, -0.15);
      arm.add(upper, fore, hand);
      arm.position.set(side * 0.44, -0.44, -0.56);
      return arm;
    };
    g.add(mkArm(-1), mkArm(1));
    g.position.set(0.14, -0.36, -0.62);
    this.camera.add(g);
    this.viewmodel = g;
    this.buildWeaponMesh(this.tool);
  }

  private buildWeaponMesh(tool: string): void {
    if (!this.viewmodel) return;
    if (this.weaponMesh) {
      this.viewmodel.remove(this.weaponMesh);
      this.weaponMesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat) mat.dispose();
      });
      this.weaponMesh = null;
    }
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.42, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    if (tool === "pistol") {
      add(new THREE.BoxGeometry(0.05, 0.05, 0.24), metal, 0, 0.09, -0.02);
      add(new THREE.BoxGeometry(0.055, 0.04, 0.3), metal, 0, 0.13, -0.03);
      add(new THREE.BoxGeometry(0.045, 0.1, 0.06), dark, 0, 0.01, 0.05);
    } else if (tool === "smg") {
      add(new THREE.BoxGeometry(0.055, 0.09, 0.34), metal, 0, 0.08, -0.06);
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 8), dark, 0, 0.08, -0.28).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.04, 0.12, 0.05), dark, 0, -0.02, 0.02);
      add(new THREE.BoxGeometry(0.035, 0.05, 0.06), metal, 0, 0.13, -0.1);
    } else if (tool === "shotgun") {
      const b1 = add(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 10), metal, -0.022, 0.07, -0.18);
      b1.rotation.x = Math.PI / 2;
      const b2 = add(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 10), metal, 0.022, 0.07, -0.18);
      b2.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.06, 0.07, 0.16), wood, 0, 0.02, 0.1);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.12), wood, 0, 0.0, -0.05);
    } else if (tool === "rifle") {
      add(new THREE.BoxGeometry(0.05, 0.07, 0.46), metal, 0, 0.08, -0.1);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), dark, 0, 0.08, -0.44).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.04, 0.12, 0.05), dark, 0, -0.01, 0.08);
      add(new THREE.BoxGeometry(0.03, 0.05, 0.04), metal, 0, 0.14, 0.02);
    } else if (tool === "rocket") {
      const tube = add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14), metal, 0, 0.06, -0.08);
      tube.rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), dark, 0, 0.06, 0.18).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.04, 0.1, 0.05), dark, 0, -0.04, 0.06);
    } else if (tool === "grenade") {
      add(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3e5a34, roughness: 0.7 }), 0, 0.05, -0.1);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), metal, 0, 0.14, -0.1);
    }
    g.position.set(0.02, 0.02, -0.16);
    g.rotation.y = 0.06;
    this.weaponMesh = g;
    this.viewmodel.add(g);
  }

  private updateViewmodel(frameDt: number): void {
    if (!this.viewmodel) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.vmBobT += frameDt * (3 + sp * 1.5);
    const bob = Math.sin(this.vmBobT * 2.2) * 0.009 * Math.min(1, sp / 4);
    this.vmRecoil = Math.max(0, this.vmRecoil - frameDt * 3.2);
    this.viewmodel.position.set(0.14, -0.36 + bob, -0.62);
    this.viewmodel.rotation.x = this.vmRecoil * 0.16;
    if (this.weaponMesh) this.weaponMesh.position.z = -0.16 + this.vmRecoil * 0.09;
  }

  /* ============================== GRAB & THROW ============================== */

  private grabNearest(): void {
    if (this.grabbed) return;
    const o = this.camera.position;
    const dir = this.cameraDirection();
    // candidates: dynamic objects, walking people, ragdolls
    const cand: { body: RAPIER.RigidBody; x: number; y: number; z: number; src: "dyn" | "npc" | "ragdoll"; ref?: unknown }[] = [];
    for (const d of this.dyn) {
      if (d.dead || d.kind === "rocket" || d.kind === "bomb" || d.kind === "grenade") continue;
      const p = d.body.translation();
      cand.push({ body: d.body, x: p.x, y: p.y, z: p.z, src: "dyn" });
    }
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const p = npc.body.translation();
      cand.push({ body: npc.body, x: p.x, y: p.y, z: p.z, src: "npc", ref: npc });
    }
    for (const r of this.ragdolls) {
      if (r.dead) continue;
      const p = r.bodies[0]?.translation();
      if (p) cand.push({ body: r.bodies[0], x: p.x, y: p.y, z: p.z, src: "ragdoll", ref: r });
    }
    let best: (typeof cand)[number] | null = null;
    let bestD = 6;
    for (const c of cand) {
      const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > bestD) continue;
      const dot = (dx / d) * dir.x + (dy / d) * dir.y + (dz / d) * dir.z;
      if (dot < 0.2) continue;
      bestD = d; best = c;
    }
    if (!best) return;
    try {
      best.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } catch { return; }
    this.grabbed = best.body;
    this.grabFrom = best.src;
    if (best.src === "npc" && best.ref) {
      // a person you pick up becomes a ragdoll in your arms
      const npc = best.ref as NpcRec;
      this.ragdollNpc(npc, 0, 0, 0);
    }
    this.log(best.src === "dyn" ? "You grip it. Let go to launch it." : "You've got a hold of them.", "sys");
  }

  private updateGrab(dt: number): void {
    if (!this.grabbed) return;
    void dt;
    const o = this.camera.position;
    const dir = this.cameraDirection();
    this.grabbed.setNextKinematicTranslation({
      x: o.x + dir.x * 2.4,
      y: Math.max(this.heightAt(o.x + dir.x * 2.4, o.z + dir.z * 2.4) + 0.4, o.y - 0.5 + dir.y * 2.4),
      z: o.z + dir.z * 2.4,
    });
  }

  private releaseGrab(): void {
    if (!this.grabbed) return;
    const body = this.grabbed;
    const src = this.grabFrom;
    this.grabbed = null;
    this.grabFrom = null;
    try {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      const dir = this.cameraDirection();
      body.setLinvel({
        x: dir.x * 22 + this.vel.x * 0.5,
        y: Math.abs(dir.y) * 14 + 5 + this.vel.y * 0.4,
        z: dir.z * 22 + this.vel.z * 0.5,
      }, true);
      body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
    } catch { /* body gone */ }
    this.audio.throwWhoosh();
    this.trauma = Math.min(1, this.trauma + 0.05);
    if (src === "ragdoll" || src === "npc") this.log("You let go. Physics takes them from there.", "sys");
  }

  /* ============================== DIMENSIONS ============================== */

  private makePortal(x: number, y: number, z: number, hue: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.28, 12, 40),
      new THREE.MeshStandardMaterial({ color: 0x222630, emissive: new THREE.Color().setHSL(hue, 0.8, 0.5), emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.3 }),
    );
    g.add(ring);
    const discMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 0.9, 0.55), transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.45, 40), discMat);
    g.add(disc);
    const light = new THREE.PointLight(new THREE.Color().setHSL(hue, 0.9, 0.6), 30, 40, 1.8);
    g.add(light);
    (g.userData as { spin?: THREE.Mesh }).spin = ring;
    return g;
  }

  private buildPortals(): void {
    // the one way out of the prime world: a glowing ring in a downtown tower
    this.portalA = this.makePortal(112, 9.6, 112, 0.52);
    this.scene.add(this.portalA);
    // the way back home, inside the Dislocated
    this.portalB = this.makePortal(14, 10, 10, 0.83);
    this.scene.add(this.portalB);
    this.portalB.visible = false;
  }

  /** Wipe one reality and materialize in the other. */
  private switchDimension(to: "prime" | "other"): void {
    if (this.dimension === to) return;
    this.dimension = to;
    for (const [key, rec] of Array.from(this.chunks)) {
      rec.group.traverse((o) => {
        const m = o as THREE.Mesh | undefined;
        if (!m) return;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      for (const col of rec.colliders) {
        try { this.rapier.removeCollider(col, true); } catch { /* already gone */ }
      }
      this.scene.remove(rec.group);
      this.chunks.delete(key);
    }
    for (const seg of this.segments) {
      this.scene.remove(seg.mesh);
      seg.mesh.geometry.dispose();
      (seg.mesh.material as THREE.Material).dispose();
      try { this.rapier.removeRigidBody(seg.body); } catch { /* gone */ }
    }
    this.segments = [];
    this.glass = [];
    this.grates = [];
    for (const npc of this.npcs) this.killNpc(npc, true);
    this.npcs = [];
    this.bubbleCache.forEach((t) => t.dispose());
    this.bubbleCache.clear();
    for (const r of this.ragdolls) this.removeRagdoll(r);
    this.ragdolls = [];
    for (const d of this.dyn) this.killDyn(d);
    this.dyn = [];
    this.fires = [];
    this.vortices = [];
    this.wells = [];
    this.bombs = [];
    for (const bh of this.blackholes) {
      this.scene.remove(bh.disk, bh.glow, bh.sphere);
      bh.disk.geometry.dispose();
      bh.glow.material.dispose();
      bh.sphere.geometry.dispose();
    }
    this.blackholes = [];
    this.solver.clear();
    this.spaceBuilt = false;
    this.launchpads = [];
    this.portalA!.visible = to === "prime";
    this.portalB!.visible = to === "other";
    if (to === "other") this.buildSpace();
    if (this.spaceGroup) this.spaceGroup.visible = to === "other";
    if (to === "other") {
      this.portalB!.position.set(14, this.heightAt(14, 10) + 2.7, 10);
      this.teleportPlayer(2, this.heightAt(2, 14) + 3, 14);
    } else {
      this.teleportPlayer(112, 13, 112);
    }
    this.flying = false;
    this.vel.set(0, 0, 0);
    this.log(to === "other"
      ? "You step through the ring. Reality comes apart beautifully around you."
      : "You fall back through the ring into the real world. The planet is exactly where you left it.", "alert");
    this.cb.onBiome(BIOME_NAMES[this.biomeAt(0)]);
  }

  private portalNearby(): THREE.Group | null {
    const p = this.pos;
    const near = (pg: THREE.Group | null) => pg && pg.visible && Math.hypot(pg.position.x - p.x, pg.position.y - p.y, pg.position.z - p.z) < 4.5;
    if (this.dimension === "prime") return near(this.portalA) ? this.portalA : null;
    return near(this.portalB) ? this.portalB : null;
  }

  /* ============================== SCENARIOS ============================== */

  runScenario(id: ScenarioId): void {
    const p = this.pos;
    switch (id) {
      case "blackhole":
        this.spawnBlackHole(p.x + 40, 46, p.z + 20, 4, 42000);
        this.log("A SINGULARITY has opened above the district. It pulls at everything, including you.", "alert");
        break;
      case "meteor":
        for (let i = 0; i < 6; i++) {
          const mx = p.x + (this.rng.next() - 0.5) * 120;
          const mz = p.z + (this.rng.next() - 0.5) * 120;
          const s = this.rng.range(2, 5);
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), this.solidMat("rock"));
          m.position.set(mx, 150 + i * 30, mz);
          this.scene.add(m);
          const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(m.position.x, m.position.y, m.position.z).setCcdEnabled(true));
          this.rapier.createCollider(RAPIER.ColliderDesc.ball(s).setDensity(3200), body);
          body.setLinvel({ x: (this.rng.next() - 0.5) * 12, y: -46, z: (this.rng.next() - 0.5) * 12 }, true);
          this.dyn.push({
            id: allocId(), body, mesh: m, kind: "meteor", radius: s, volume: s ** 3,
            age: 0, dead: false, wasSub: 0, debris: true,
          });
        }
        this.log("IMPACT EVENT — kinetic kill vehicles inbound from the sky.", "alert");
        break;
      case "quake":
        this.quakeT = 7;
        this.trauma = 0.8;
        this.audio.thunder(0);
        this.log("EARTHQUAKE — magnitude 7.9. Every structure is taking the hit.", "alert");
        break;
      case "flood":
        this.seaTarget = 8.6;
        this.floodT = 26;
        this.setWeather("rain");
        this.log("MEGAFLOOD — sea level surging. The streets will fill, one block at a time.", "alert");
        break;
      case "storm":
        this.setWeather("storm");
        this.log("SUPERSTORM — lightning, torrential rain, gale force. Stay inside.", "alert");
        break;
      case "volcano":
        this.solver.emitBox(p.x - 8, this.heightAt(p.x, p.z) + 2, p.z - 8, p.x + 8, this.heightAt(p.x, p.z) + 8, p.z + 8, 0.6, 3, 1050, SPH_CAP);
        this.fires.push({ id: allocId(), x: p.x, y: this.heightAt(p.x, p.z) + 2, z: p.z, radius: 7, fuel: 60, maxFuel: 60 });
        this.explode(p.x, this.heightAt(p.x, p.z) + 1, p.z, 16, 260, 3);
        this.log("VOLCANIC ERUPTION — magma now flows where the road used to be.", "alert");
        break;
      case "sewer": {
        let g = this.grates[0] ?? { x: 4, z: 4 };
        this.solver.emitBox(g.x - 1.6, -8.2, g.z - 1.6, g.x + 1.6, -5, g.z + 1.6, 0.5, 0, this.ambientC, SPH_CAP);
        this.solver.emitBox(g.x - 1.6, -8.2, g.z + 1.6, g.x + 1.6, -5, g.z + 1.6, 0.5, 0, this.ambientC, SPH_CAP);
        this.log("SEWER OVERFLOW — the drainage network is failing. Grates will vent water.", "alert");
        break;
      }
      case "tornado":
        this.vortices.push({
          kind: "vortex", id: allocId(), x: p.x + 30, y: 0, z: p.z + 10,
          radius: 22, swirl: 30, inward: 12, vertical: -8, axisY: 1,
        });
        if (this.vortices.length > 3) this.vortices.shift();
        this.log("TORNADO — a velocity column is shearing the district. Watch the water spiral.", "alert");
        break;
      case "glassstorm":
        for (const gl of this.glass) {
          if (!gl.dead && Math.hypot(gl.x - p.x, gl.z - p.z) < 140) this.shatterGlass(gl);
        }
        this.log("GLASS STORM — every pane within 140m shatters at once.", "alert");
        break;
      default:
        break;
    }
  }

  /* ============================== ENVIRONMENT ============================== */

  setWeather(w: WeatherId): void {
    this.weather = w;
    if (w === "clear") {
      this.rainTarget = 0; this.stormTarget = 0; this.windSpeed = 4; this.seaTarget = Math.max(this.seaTarget, 0);
    } else if (w === "rain") {
      this.rainTarget = 1; this.stormTarget = 0.3; this.windSpeed = 9;
    } else {
      this.rainTarget = 1; this.stormTarget = 1; this.windSpeed = 24;
    }
  }

  setTimeScale(ts: number): void { this.timeScale = clamp(ts, 0, 4); }
  cycleTimeScale(dir: number, silent = false): void {
    const steps = [0, 0.25, 0.5, 1, 2, 4];
    let i = steps.indexOf(this.timeScale);
    if (i < 0) i = 3;
    i = clamp(i + dir, 0, steps.length - 1);
    this.timeScale = steps[i];
    if (!silent) this.cb.onLog(this.timeScale === 0 ? "Time frozen. The universe holds its breath." : `Time flow: ${this.timeScale}×.`, "sys");
  }
  setPaused(p: boolean): void { this.paused = p; }
  setQuality(dpr: number): void {
    this.dpr = dpr;
    this.resize();
  }
  setSound(on: boolean): void { this.audio.setEnabled(on); }

  private strike(): void {
    const cx = this.pos.x + (this.rng.next() - 0.5) * 140;
    const cz = this.pos.z + (this.rng.next() - 0.5) * 140;
    const gy = Math.max(this.heightAt(cx, cz), this.seaLevel);
    const pos = this.bolt.geometry.getAttribute("position") as THREE.BufferAttribute;
    let x = cx, z = cz;
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      pos.setXYZ(i, x + (this.rng.next() - 0.5) * (1 - t) * 12, gy + 80 * (1 - t), z + (this.rng.next() - 0.5) * (1 - t) * 12);
      x += (this.rng.next() - 0.5) * 5;
      z += (this.rng.next() - 0.5) * 5;
    }
    pos.needsUpdate = true;
    this.boltLife = 0.16;
    (this.bolt.material as THREE.LineBasicMaterial).opacity = 1;
    this.compMat.uniforms.uFlash.value = 1;
    this.skyMat.uniforms.uFlash.value = 1;
    this.flashLight.position.set(cx, gy + 30, cz);
    this.flashLight.intensity = 14000;
    const dist = Math.hypot(cx - this.pos.x, cz - this.pos.z);
    this.audio.thunder(Math.min(2500, (dist / 340) * 1000));
    this.explode(cx, gy + 1, cz, 5, 22, 0);
    if (this.rng.next() < 0.4) {
      this.fires.push({ id: allocId(), x: cx, y: gy + 0.5, z: cz, radius: 2.5, fuel: 20, maxFuel: 20 });
      if (this.fires.length > 12) this.fires.shift();
    }
  }

  /* ============================== LIFE ============================== */

  private die(cause: string): void {
    if (!this.alive) return;
    if (this.sandbox) {
      this.hp = Math.max(this.hp, 60);
      this.log(`Sandbox mode: "${cause}" — but death is disabled here.`, "sys");
      return;
    }
    this.alive = false;
    this.hp = 0;
    this.makeRagdoll(this.pos.x, this.pos.y, this.pos.z, 1);
    if (document.pointerLockElement) document.exitPointerLock();
    this.cb.onDeath(cause);
  }

  respawn(): void {
    if (this.alive) return;
    this.alive = true;
    this.paused = false;
    this.hp = 100;
    this.flying = false;
    this.pos.copy(this.lastSafe);
    this.vel.set(0, 0, 0);
    this.playerBody.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.cb.onLog("You reassemble at the last safe point. The universe forgives, but it remembers.", "sys");
  }


  /* ============================== AAA SYSTEMS ============================== */

  private shoot(kind: "pistol" | "rifle" | "smg" | "shotgun"): void {
    if (kind === "shotgun") {
      for (let i = 0; i < 6; i++) this.fireBullet(kind, 0.05);
    } else {
      this.fireBullet(kind, kind === "smg" ? 0.014 : 0);
    }
    this.audio.gunshot(kind);
    this.trauma = Math.min(1, this.trauma + (kind === "pistol" ? 0.06 : kind === "rifle" ? 0.04 : kind === "shotgun" ? 0.11 : 0.02));
    this.vmRecoil = Math.min(1, this.vmRecoil + (kind === "shotgun" ? 0.5 : kind === "smg" ? 0.12 : 0.3));
    {
      const fd = this.cameraDirection();
      this.flashLight.position.set(this.camera.position.x + fd.x * 3, this.camera.position.y - 0.4, this.camera.position.z + fd.z * 3);
    }
    this.flashLight.intensity = kind === "pistol" ? 900 : kind === "shotgun" ? 1100 : 700;
    this.compMat.uniforms.uFlash.value = Math.max(this.compMat.uniforms.uFlash.value as number, 0.12);
  }

  private fireBullet(kind: "pistol" | "rifle" | "smg" | "shotgun", spread: number): void {
    const o = this.camera.position;
    let dir = this.cameraDirection();
    if (spread > 0) {
      dir = dir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
    }
    // right vector for muzzle offset
    const rx = -dir.z, rz = dir.x; // cross(dir, up)
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let px = o.x + dir.x * 160, py = o.y + dir.y * 160, pz = o.z + dir.z * 160;
    for (const h of hits) {
      if (h.distance > 240) break;
      if (h.object === this.stars || (h.object as unknown as { isSprite?: boolean }).isSprite) continue;
      px = h.point.x; py = h.point.y; pz = h.point.z;
      break;
    }
    // people in the line of fire
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const t = npc.body.translation();
      const cx = t.x - o.x, cy = t.y + 0.6 - o.y, cz = t.z - o.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 0.5 || along > 200) continue;
      const qx = o.x + dir.x * along, qy = o.y + dir.y * along, qz = o.z + dir.z * along;
      if (Math.hypot(t.x - qx, t.y + 0.6 - qy, t.z - qz) < 0.6) {
        px = qx; py = qy; pz = qz;
        this.ragdollNpc(npc, dir.x * 34, 8, dir.z * 34);
        break;
      }
    }
    const dmg = kind === "pistol" ? 50 : kind === "rifle" ? 32 : kind === "smg" ? 24 : 16;
    this.damageAt(px, py, pz, kind === "shotgun" ? 2.4 : 3.2, dmg);
    for (const gl of this.glass) {
      if (!gl.dead && Math.hypot(gl.x - px, gl.y - py, gl.z - pz) < 4) this.shatterGlass(gl);
    }
    const mx = o.x + dir.x * 1.1 + rx * 0.16 - 0.12;
    const my = o.y + dir.y * 1.1 - 0.1;
    const mz = o.z + dir.z * 1.1 + rz * 0.16 - 0.12;
    this.spawnTracer(mx, my, mz, px, py, pz);
    this.smoke.burst(px, py, pz, 5,
      { speed: 2.5, up: 1.2, life: 0.5, size: 0.25, grow: 1.5, r: 0.75, g: 0.75, b: 0.78, alpha: 0.5, grav: -0.5, drag: 2 });
  }

  private throwRocket(): void {
    if (!this.rocketMat) return;
    const o = this.camera.position;
    const dir = this.cameraDirection();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), this.rocketMat);
    m.position.set(o.x + dir.x * 1.4, o.y + dir.y * 1.0 - 0.25, o.z + dir.z * 1.4);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.castShadow = true;
    this.scene.add(m);
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(m.position.x, m.position.y, m.position.z).setCcdEnabled(true)
      .setLinearDamping(0).setAngularDamping(1.5));
    this.rapier.createCollider(RAPIER.ColliderDesc.capsule(0.31, 0.16).setDensity(900), body);
    body.setLinvel({ x: dir.x * 58, y: dir.y * 58, z: dir.z * 58 }, true);
    this.dyn.push({
      id: allocId(), body, mesh: m, kind: "rocket", radius: 0.5, volume: 0.3,
      age: 0, dead: false, wasSub: 0, debris: true, fuse: 1.5,
    });
    this.audio.gunshot("rocket");
    this.trauma = Math.min(1, this.trauma + 0.12);
  }

  private throwGrenade(): void {
    const o = this.camera.position;
    const dir = this.cameraDirection();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), new THREE.MeshStandardMaterial({ color: 0x3e5a34, roughness: 0.7, metalness: 0.15 }));
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x888890, metalness: 0.8, roughness: 0.3 }));
    pin.position.y = 0.2;
    m.add(pin);
    m.position.set(o.x + dir.x * 1.3, o.y + dir.y * 1.0 - 0.2, o.z + dir.z * 1.3);
    m.castShadow = true;
    this.scene.add(m);
    const body = this.rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(m.position.x, m.position.y, m.position.z)
      .setLinearDamping(0.05).setAngularDamping(0.4));
    this.rapier.createCollider(RAPIER.ColliderDesc.ball(0.19).setDensity(1200).setRestitution(0.42), body);
    body.setLinvel({ x: dir.x * 15, y: dir.y * 15 + 5.5, z: dir.z * 15 }, true);
    body.setAngvel({ x: 9, y: 0, z: 6 }, true);
    this.dyn.push({
      id: allocId(), body, mesh: m, kind: "grenade", radius: 0.19, volume: 0.029,
      age: 0, dead: false, wasSub: 0, debris: true, fuse: 2.2,
    });
    this.audio.gunshot("smg");
    this.vmRecoil = Math.min(1, this.vmRecoil + 0.2);
  }

  private spawnTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    if (this.tracers.length >= 12) {
      const old = this.tracers.shift()!;
      this.scene.remove(old.line);
    }
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz),
    ]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffe0b0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(l);
    this.tracers.push({ line: l, life: 0.07 });
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  private updateAutoFire(): void {
    if (!this.mouseDown || this.paused || this.attract || !this.alive) { this.autoT = 0; return; }
    if (this.tool !== "rifle" && this.tool !== "smg") return;
    this.autoT -= STEP;
    if (this.autoT <= 0) {
      this.shoot(this.tool);
      this.autoT = this.tool === "smg" ? 0.06 : 0.11;
    }
  }

  /** Push the solver's particle positions into the droplet Points mesh. */
  private syncWater(): void {
    if (!this.waterPts || !this.waterGeo) return;
    const s = this.solver;
    const attr = this.waterGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const n = s.n;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = s.px[i];
      arr[i * 3 + 1] = s.py[i];
      arr[i * 3 + 2] = s.pz[i];
    }
    this.waterGeo.setDrawRange(0, n);
    attr.needsUpdate = true;
  }

  private dropletTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.4, "rgba(225,240,250,0.9)");
    grd.addColorStop(1, "rgba(180,215,235,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /** 128×128 terrain-height texture (256 m window) that the ocean shades with. */
  private updateHeightTex(): void {
    if (!this.heightTex || !this.oceanMat) return;
    const px = this.pos.x, pz = this.pos.z;
    this.heightCX = px; this.heightCZ = pz;
    const N = 128, S = 256;
    const data = this.heightTex.image.data as Uint8Array;
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = this.heightAt(px - S / 2 + (i / (N - 1)) * S, pz - S / 2 + (j / (N - 1)) * S);
        data[j * N + i] = 0;
        if (h < mn) mn = h;
        if (h > mx) mx = h;
      }
    }
    const range = Math.max(1, mx - mn);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = this.heightAt(px - S / 2 + (i / (N - 1)) * S, pz - S / 2 + (j / (N - 1)) * S);
        data[j * N + i] = Math.max(0, Math.min(255, Math.round(((h - mn) / range) * 255)));
      }
    }
    this.oceanMat.uniforms.uHMin.value = mn;
    this.oceanMat.uniforms.uHMax.value = mx;
    (this.oceanMat.uniforms.uHCenter.value as THREE.Vector2).set(px, pz);
    this.heightTex.needsUpdate = true;
  }

  private updateHeightTexTimer(dt: number): void {
    this.heightT -= dt;
    if (this.heightT > 0) return;
    this.heightT = 1.2;
    if (Math.hypot(this.pos.x - this.heightCX, this.pos.z - this.heightCZ) > 48) this.updateHeightTex();
  }

  /** Mirror the camera across the water plane and render the world for reflections. */
  private renderReflections(): void {
    const rt = this.reflRT, cam = this.reflCam, clip = this.reflClip;
    if (!rt || !cam || !clip || !this.oceanMesh || !this.oceanMat) return;
    const camPos = this.camera.position;
    const sea = this.seaLevel;
    if (camPos.y < sea - 1.5) return; // underwater: nothing to reflect
    clip.constant = -sea;
    cam.position.set(camPos.x, 2 * sea - camPos.y, camPos.z);
    const dir = this.cameraDirection();
    cam.up.set(0, -1, 0);
    cam.lookAt(camPos.x + dir.x * 30, 2 * sea - (camPos.y + dir.y * 30), camPos.z + dir.z * 30);
    cam.fov = this.camera.fov;
    cam.aspect = this.canvas.width / Math.max(1, this.canvas.height);
    cam.updateProjectionMatrix();
    const prevClip = this.renderer.clippingPlanes;
    this.renderer.clippingPlanes = [clip];
    const prevVis = this.oceanMesh.visible;
    this.oceanMesh.visible = false;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clippingPlanes = prevClip;
    this.oceanMesh.visible = prevVis;
    this.oceanMat.uniforms.uReflTex.value = rt.texture;
    (this.oceanMat.uniforms.uReflVP.value as THREE.Matrix4).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  setSandbox(b: boolean): void {
    if (this.sandbox === b) return;
    this.sandbox = b;
    if (b) this.hp = 100;
    this.cb.onLog(b
      ? "Sandbox mode ON — you cannot die. The universe is lenient with you."
      : "Sandbox mode OFF — falls, fire and singularities now have consequences.", "sys");
  }
  setAttract(b: boolean): void {
    if (this.attract === b) return;
    this.attract = b;
    this.mouseDown = false;
    this.attractT = 0;
    if (!b) this.cb.onLog("World locked. Good hunting.", "sys");
  }
  get isSandbox(): boolean { return this.sandbox; }
  get isAttract(): boolean { return this.attract; }

  /* ============================== STEP ============================== */

  private frame(t: number): void {
    const frameDt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;

    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      let steps = 0;
      while (this.acc >= STEP && steps < 4) {
        this.step();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 4) this.acc = 0;
    }

    // camera
    if (this.attract) {
      // menu attract mode: slow cinematic orbit around the spawn district
      this.attractT += frameDt * 0.07;
      this.camera.position.set(
        this.pos.x + Math.sin(this.attractT) * 82,
        30 + Math.sin(this.attractT * 2.7) * 7,
        this.pos.z + Math.cos(this.attractT) * 82,
      );
      this.camera.lookAt(this.pos.x, this.pos.y + 4, this.pos.z);
    } else {
      const camY = this.pos.y + (this.alive ? 1.62 : 2.6);
      if (this.trauma > 0.01) {
        const sh = this.trauma * this.trauma * 2.4;
        this.camera.position.set(
          this.pos.x + (Math.random() - 0.5) * sh,
          camY + (Math.random() - 0.5) * sh,
          this.pos.z + (Math.random() - 0.5) * sh,
        );
      } else {
        this.camera.position.set(this.pos.x, camY, this.pos.z);
      }
      this.camera.rotation.set(0, 0, 0);
      this.camera.rotateY(this.yaw);
      this.camera.rotateX(this.pitch);
    }

    // sun follows player
    this.sun.position.set(this.pos.x + 70, this.pos.y + 110, this.pos.z + 40);
    this.sun.target.position.set(this.pos.x, this.pos.y, this.pos.z);

    this.syncVisuals(frameDt);
    if (this.viewmodel) this.viewmodel.visible = !this.attract;
    if (!this.attract) this.updateViewmodel(frameDt);
    this.syncWater();
    this.updateTracers(frameDt);
    this.updateHeightTexTimer(frameDt);
    this.render();

    // stats
    this.statT += frameDt;
    if (this.statT > 0.25) {
      this.statT = 0;
      const d = Math.hypot(this.pos.x, this.pos.z);
      this.cb.onStats({
        fps: Math.round(this.fpsEma),
        simMs: this.simMs,
        particles: this.solver.n,
        bodies: this.dyn.filter((b) => !b.dead).length + this.ragdolls.length,
        chunks: this.chunks.size,
        tris: this.renderer.info.render.triangles,
        calls: this.renderer.info.render.calls,
        biome: BIOME_NAMES[this.biomeAt(d)],
        dist: d,
        x: this.pos.x, y: this.pos.y, z: this.pos.z,
        hp: Math.max(0, Math.round(this.hp)),
        timeScale: this.timeScale,
        flying: this.flying,
        dead: !this.alive,
        blackholes: this.blackholes.length,
      });
    }
  }

  private step(): void {
    const t0 = performance.now();
    this.time += STEP;
    this.updateEnvironment(STEP);
    this.updateChunks();
    this.updateAutoFire();
    if (!this.attract) this.updatePlayer(STEP);
    this.updateDynamic(STEP);
    this.updateBlackHoles(STEP);
    this.updatePortals(STEP);
    this.updateFires(STEP);
    this.stepSph(STEP);
    this.stepPhysics();
    this.updateRagdolls();
    this.updateNpcs(STEP);
    this.updateGrab(STEP);
    this.updateEffects(STEP);
    this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  private time = 0;

  private updateEnvironment(dt: number): void {
    this.stormAmt = lerp(this.stormAmt, this.stormTarget, Math.min(1, dt * 0.8));
    this.rainRate = lerp(this.rainRate, this.rainTarget, Math.min(1, dt * 1.2));
    this.seaLevel = lerp(this.seaLevel, this.seaTarget, Math.min(1, dt * 0.4));
    if (this.floodT > 0) {
      this.floodT -= dt;
      if (this.floodT <= 0) this.seaTarget = 0;
    }
    if (this.weather === "rain" || this.weather === "storm") {
      this.ambientC = lerp(this.ambientC, 10, Math.min(1, dt * 0.1));
    } else {
      this.ambientC = lerp(this.ambientC, 18, Math.min(1, dt * 0.05));
    }
    // quake
    if (this.quakeT > 0) {
      this.quakeT -= dt;
      this.trauma = Math.min(1, this.trauma + dt * 1.6);
      for (const b of this.dyn) {
        if (b.dead || b.kind === "asteroid") continue;
        const p = b.body.translation();
        if (p.y < 60) b.body.applyImpulse({
          x: (this.rng.next() - 0.5) * 90, y: 26, z: (this.rng.next() - 0.5) * 90,
        }, true);
      }
      if (this.rng.next() < dt * 2.5) {
        const seg = this.segments[Math.floor(this.rng.next() * this.segments.length)];
        if (seg && !seg.dead) {
          seg.health -= seg.maxHealth * 0.2;
          if (seg.health <= 0) {
            const p = seg.body.translation();
            this.fractureSegment(seg, (p.x - this.pos.x) / 20, (p.z - this.pos.z) / 20);
          }
        }
      }
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    if (this.weather === "storm") {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 2.5 + this.rng.next() * 6;
        this.strike();
      }
    }
  }

  private updateChunks(): void {
    const pcx = Math.floor(this.pos.x / CHUNK), pcz = Math.floor(this.pos.z / CHUNK);
    // build nearest first
    const want: [number, number, number][] = [];
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
      for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > CHUNK_RADIUS * CHUNK_RADIUS + 2) continue;
        want.push([pcx + dx, pcz + dz, d2]);
      }
    }
    want.sort((a, b) => a[2] - b[2]);
    let budget = 2;
    for (const [cx, cz] of want) {
      if (budget <= 0) break;
      if (!this.chunks.has(`${this.dimension}:${cx},${cz}`)) {
        this.buildChunk(cx, cz);
        budget--;
      }
    }
    // unload far
    for (const [key, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > CHUNK_RADIUS + 1 || Math.abs(c.cz - pcz) > CHUNK_RADIUS + 1) {
        this.scene.remove(c.group);
        for (const col of c.colliders) {
          try { this.rapier.removeCollider(col, true); } catch { /* gone */ }
        }
        c.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const mat = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
            else if (mat && mat !== this.glassMat && mat !== this.debrisMat && mat !== this.crateMat) mat.dispose();
          }
        });
        // Debris and broken structures persist after their chunk unloads;
        // they are cleaned up when they die (or when the player is far away).
        this.segments = this.segments.filter((s) => !s.dead);
        this.chunks.delete(key);
      }
    }
  }

  private updatePlayer(dt: number): void {
    if (!this.alive) return;
    // movement input
    const fwd = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const strafe = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const sprint = this.keys.has("ShiftLeft");
    const speed = this.flying ? 46 : sprint ? 13.5 : 7.5;
    const dx = (-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * strafe);
    const dz = (-Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * strafe);
    const len = Math.hypot(dx, dz) || 1;
    const targetVx = (dx / len) * speed * (fwd || strafe ? 1 : 0);
    const targetVz = (dz / len) * speed * (fwd || strafe ? 1 : 0);
    const blend = this.flying ? 10 : 14;
    this.vel.x = lerp(this.vel.x, targetVx, Math.min(1, dt * blend));
    this.vel.z = lerp(this.vel.z, targetVz, Math.min(1, dt * blend));

    if (this.flying) {
      const up = (this.keys.has("Space") ? 1 : 0) - (this.keys.has("ShiftLeft") ? 0 : 0);
      const down = this.keys.has("KeyC") ? 1 : 0;
      this.vel.y = lerp(this.vel.y, (up - down) * 30, Math.min(1, dt * 6));
    } else {
      const jump = this.grounded && this.keys.has("Space");
      if (jump) this.vel.y = 8.2;
      this.vel.y -= GRAVITY * dt * (this.grounded ? 1 : 1.25);
      this.vel.y = Math.max(this.vel.y, -42);
    }

    // black hole + well pull on the player
    const acc = this.bhAccelAt(this.pos.x, this.pos.y, this.pos.z, this.tmpV);
    for (const w of this.wells) {
      const dxw = w.x - this.pos.x, dyw = w.y - this.pos.y, dzw = w.z - this.pos.z;
      const d2 = dxw * dxw + dyw * dyw + dzw * dzw + w.softening;
      const d = Math.sqrt(d2);
      if (d < w.radius) {
        const s = (w.strength / d2) * (1 - d / w.radius);
        acc.x += (dxw / d) * s;
        acc.y += (dyw / d) * s;
        acc.z += (dzw / d) * s;
      }
    }
    if (!this.flying) {
      this.vel.x += acc.x * dt;
      this.vel.y += acc.y * dt;
      this.vel.z += acc.z * dt;
    }

    // vortex pull
    for (const v of this.vortices) {
      const dxv = this.pos.x - v.x, dzv = this.pos.z - v.z;
      const d = Math.hypot(dxv, dzv);
      if (d < v.radius && d > 0.5) {
        const fall = 1 - d / v.radius;
        this.vel.x += ((-dzv / d) * v.swirl - (dxv / d) * v.inward) * fall * dt * 1.4;
        this.vel.z += ((dxv / d) * v.swirl - (dzv / d) * v.inward) * fall * dt * 1.4;
        this.vel.y += v.vertical * fall * dt;
      }
    }

    // character controller movement
    const delta = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.charCtrl.computeColliderMovement(this.playerCollider, delta);
    const mv = this.charCtrl.computedMovement();
    this.prevVy = this.vel.y;
    this.grounded = this.charCtrl.computedGrounded();
    const p = this.pos;
    this.playerBody.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });

    // fall damage + safe point
    if (this.grounded) {
      if (this.prevVy < -30 && !this.flying) {
        const dmg = (Math.abs(this.prevVy) - 30) * 4;
        this.trauma = Math.min(1, this.trauma + 0.5);
        this.audio.crack();
        if (!this.sandbox) {
          this.hp -= dmg;
          if (this.hp <= 0) this.die("the fall ended everything");
        }
      }
      this.safeT += dt;
      if (this.safeT > 1.2 && this.blackholes.every((b) => Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) > 30)) {
        this.safeT = 0;
        this.lastSafe.copy(p);
      }
    }
    // void death (space)
    if (Math.hypot(p.x, p.z) > 1400 && p.y < -60) {
      this.teleportPlayer(2500, 88, 0);
      this.cb.onLog("Drifted into the void — you are flung onto the space station. Space is forgiving of gravity, not of distance.", "warn");
    }
  }

  private updateDynamic(dt: number): void {
    const cap = 240;
    let debris = 0;
    for (const b of this.dyn) if (b.dead || !b.debris) continue;
    debris = this.dyn.filter((b) => !b.dead && b.debris).length;
    if (debris > cap) {
      for (const b of this.dyn) {
        if (!b.dead && b.debris) { this.killDyn(b); break; }
      }
    }
    for (const b of this.dyn) {
      if (b.dead) continue;
      b.age += dt;
      const p = b.body.translation();
      const v = b.body.linvel();

      // bombs: fuse + impact
      if (b.kind === "bomb" || b.kind === "rocket" || b.kind === "grenade") {
        const rocket = b.kind === "rocket";
        const gren = b.kind === "grenade";
        b.fuse = (b.fuse ?? (rocket ? 1.5 : gren ? 2.2 : 2.6)) - dt;
        const gy = this.heightAt(p.x, p.z);
        if ((b.fuse ?? 0) <= 0 || (p.y < gy + 0.45 && Math.hypot(p.x, p.z) < 1400)) {
          this.killDyn(b);
          this.explode(p.x, p.y, p.z, rocket ? 10 : gren ? 8 : 9, rocket ? 340 : gren ? 280 : 300, rocket ? 2.8 : 2.2);
          continue;
        }
      }
      // meteors: impact
      if (b.kind === "meteor") {
        const gy = this.heightAt(p.x, p.z);
        if (p.y < gy + 1.5 || b.age > 20) {
          this.killDyn(b);
          this.explode(p.x, Math.max(p.y, gy + 1), p.z, 16, 320, 4);
          this.fires.push({ id: allocId(), x: p.x, y: gy + 1, z: p.z, radius: 4, fuel: 30, maxFuel: 30 });
          if (this.fires.length > 12) this.fires.shift();
          continue;
        }
      }
      // water buoyancy + drag
      const wl = this.waterLevelAt(p.x, p.z);
      const sub = clamp((wl - (p.y - b.radius)) / (2 * b.radius), 0, 1);
      if (sub > 0.01) {
        if (b.body.isSleeping()) b.body.wakeUp();
        const fb = 1025 * 9.81 * b.volume * sub;
        b.body.addForce({ x: 0, y: fb, z: 0 }, false);
        const wv = { x: 0, y: 0, z: 0 };
        const w = this.solver.sampleVelocity(p.x, p.y, p.z, wv);
        const k = 30 * sub * b.volume * (0.4 + Math.min(1, w * 0.2));
        b.body.addForce({
          x: (wv.x - v.x) * k, y: (wv.y - v.y) * k * 0.5, z: (wv.z - v.z) * k,
        }, false);
        if (b.wasSub < 0.2 && sub > 0.35 && v.y < -5) this.audio.splash(-v.y);
      }
      b.wasSub = sub;

      // black hole capture
      for (const bh of this.blackholes) {
        const d = Math.hypot(bh.x - p.x, bh.y - p.y, bh.z - p.z);
        if (d < bh.horizon * 1.3) {
          this.glow.burst(p.x, p.y, p.z, 14, {
            speed: 7, up: 2, life: 0.5, size: 1.6, grow: 1, r: 0.6, g: 0.5, b: 1, alpha: 0.9, grav: 0, drag: 1,
          });
          this.cb.onLog(`${b.kind.toUpperCase()} crossed the event horizon.`, "alert");
          this.killDyn(b);
          break;
        }
        if (d < 260) {
          const s = (bh.mass * 2.2) / (d * d + 4);
          b.body.addForce({
            x: ((bh.x - p.x) / d) * s * b.body.mass(),
            y: ((bh.y - p.y) / d) * s * b.body.mass(),
            z: ((bh.z - p.z) / d) * s * b.body.mass(),
          }, true);
        }
      }
      if (b.dead) continue;

      // portal traversal
      for (const pv of this.portals) {
        const pt = pv.pair;
        for (const side of [0, 1]) {
          const cxp = side === 0 ? pt.ax : pt.bx;
          const cyp = side === 0 ? pt.ay : pt.by;
          const czp = side === 0 ? pt.az : pt.bz;
          const nx = side === 0 ? pt.anx : pt.bnx;
          const ny = side === 0 ? pt.any : pt.bny;
          const nz = side === 0 ? pt.anz : pt.bnz;
          const ox = p.x - cxp, oy = p.y - cyp, oz = p.z - czp;
          const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
          const along = ox * nx + oy * ny + oz * nz;
          const vn = v.x * nx + v.y * ny + v.z * nz;
          if (dist < pt.radius && Math.abs(along) < 1.2 && vn < -0.5) {
            const tx = side === 0 ? pt.bx : pt.ax;
            const ty = side === 0 ? pt.by : pt.ay;
            const tz = side === 0 ? pt.bz : pt.az;
            const tnx = side === 0 ? pt.bnx : pt.anx;
            const tny = side === 0 ? pt.bny : pt.any;
            const tnz = side === 0 ? pt.bnz : pt.anz;
            const q = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(nx, ny, nz), new THREE.Vector3(tnx, tny, tnz));
            const vel = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(q);
            b.body.setTranslation({ x: tx + tnx * 1.5, y: ty + tny * 1.5, z: tz + tnz * 1.5 }, true);
            b.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
            this.audio.portal();
            break;
          }
        }
      }

      // glass smashing (fast vehicles)
      if (b.kind === "car" || b.kind === "debris") {
        const sp = Math.hypot(v.x, v.y, v.z);
        if (sp > 6) {
          for (const gl of this.glass) {
            if (gl.dead) continue;
            if (Math.abs(p.x - gl.x) < gl.mesh.scale.x + b.radius &&
              Math.abs(p.y - gl.y) < gl.mesh.scale.y + b.radius &&
              Math.abs(p.z - gl.z) < 2) {
              this.shatterGlass(gl);
            }
          }
        }
      }
      // cull far
      if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z) > 700) this.killDyn(b);
    }
  }

  private killDyn(b: DynRec): void {
    if (b.dead) return;
    b.dead = true;
    try { this.rapier.removeRigidBody(b.body); } catch { /* gone */ }
    this.scene.remove(b.mesh);
    const m = b.mesh as THREE.Mesh;
    if (m.geometry && m.geometry !== this.boxGeo) m.geometry.dispose();
  }

  /** Water level at a point (ocean, pools, sewers). */
  private waterLevelAt(x: number, z: number): number {
    let lvl = Math.min(this.seaLevel, 0.2) + this.seaLevel; // sea (only meaningful below terrain)
    lvl = this.seaLevel;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const seed = this.worldSeed;
    // pools
    for (let dcx = -1; dcx <= 1; dcx++) {
      for (let dcz = -1; dcz <= 1; dcz++) {
        const pcx = cx + dcx, pcz = cz + dcz;
        if (this.biomeAt(Math.hypot(pcx * CHUNK + 32, pcz * CHUNK + 32)) !== "waterfront") continue;
        if (hash2(pcx, pcz, seed + 55) >= 0.55) continue;
        const px = pcx * CHUNK + (hash2(pcx, pcz, seed + 56) - 0.5) * 34 + 32;
        const pz = pcz * CHUNK + (hash2(pcx, pcz, seed + 57) - 0.5) * 34 + 32;
        if (Math.hypot(x - px, z - pz) < 8.5) lvl = Math.max(lvl, 4.7);
      }
    }
    // sewers
    if (Math.abs(x - (Math.round((x - 4) / 32) * 32 + 4)) < 2 && Math.abs(z - (Math.round((z - 4) / 32) * 32 + 4)) > 2 && z < 0 + 2000) {
      // along x-tunnels at z = 32k+4
      const tz = Math.round((z - 4) / 32) * 32 + 4;
      if (Math.abs(z - tz) < 2) lvl = Math.max(lvl, -7.8);
      const tx = Math.round((x - 4) / 32) * 32 + 4;
      if (Math.abs(x - tx) < 2) lvl = Math.max(lvl, -7.8);
    }
    return lvl;
  }

  private updateBlackHoles(dt: number): void {
    for (const bh of this.blackholes) {
      bh.diskMat.uniforms.uTime.value = this.time;
      bh.disk.rotation.z += dt * 0.4;
      bh.glow.material.opacity = 0.5 + Math.sin(this.time * 2.2) * 0.1;
      // player consumption
      if (this.alive) {
        const d = Math.max(0.001, Math.hypot(bh.x - this.pos.x, bh.y - this.pos.y, bh.z - this.pos.z));
        if (d < bh.horizon * 1.05) {
          if (this.sandbox) {
            const ux = (this.pos.x - bh.x) / d, uy = (this.pos.y - bh.y) / d, uz = (this.pos.z - bh.z) / d;
            this.vel.x += ux * 42; this.vel.y += uy * 42; this.vel.z += uz * 42;
            this.pos.set(bh.x + ux * bh.horizon * 1.4, bh.y + uy * bh.horizon * 1.4, bh.z + uz * bh.horizon * 1.4);
            this.log("Sandbox mode: the singularity reaches for you — and lets go.", "sys");
          } else {
            this.die("consumed by the singularity");
          }
        }
      }
      // player lensing uniforms handled in render()
    }
  }

  private updatePortals(dt: number): void {
    for (const pv of this.portals) {
      pv.matA.uniforms.uTime.value = this.time;
      pv.matB.uniforms.uTime.value = this.time;
      pv.groupA.children[0].rotation.z += dt * 0.8;
      pv.groupB.children[0].rotation.z -= dt * 0.8;
    }
  }

  private updateFires(dt: number): void {
    const s = this.solver;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      let wet = 0;
      const samples = Math.min(120, s.n);
      for (let k = 0; k < samples; k++) {
        const j = Math.floor(this.rng.next() * s.n);
        const dx = s.px[j] - f.x, dy = s.py[j] - f.y, dz = s.pz[j] - f.z;
        if (dx * dx + dy * dy + dz * dz < f.radius * f.radius) wet++;
      }
      const suppress = samples > 0 ? wet / samples : 0;
      f.fuel -= dt * (0.8 + suppress * 50);
      if (f.fuel <= 0) {
        this.smoke.burst(f.x, f.y, f.z, 10, {
          speed: 2, up: 3, life: 1.5, size: 1.4, grow: 2, r: 0.5, g: 0.5, b: 0.52, alpha: 0.5, grav: -2, drag: 1,
        });
        if (suppress > 0.03) this.cb.onLog("Fire suppressed by water — steam vented.", "sys");
        this.fires.splice(i, 1);
        continue;
      }
      if (this.rng.next() < dt * 26) {
        this.glow.spawn({
          x: f.x + (this.rng.next() - 0.5) * f.radius, y: f.y, z: f.z + (this.rng.next() - 0.5) * f.radius,
          vx: (this.rng.next() - 0.5) * 2, vy: 3 + this.rng.next() * 3, vz: (this.rng.next() - 0.5) * 2,
          life: 0.5 + this.rng.next() * 0.4, size: 0.9, grow: 0.4,
          r: 1, g: 0.35 + this.rng.next() * 0.3, b: 0.08, alpha: 0.9, grav: -3, drag: 1,
        });
      }
      if (this.rng.next() < dt * 7) {
        this.smoke.spawn({
          x: f.x, y: f.y + 2, z: f.z,
          vx: 0, vy: 4, vz: 0, life: 2.2, size: 1.5, grow: 2.2,
          r: 0.16, g: 0.15, b: 0.15, alpha: 0.55, grav: -2.5, drag: 1,
        });
      }
    }
    const sorted = [...this.fires].sort((a, b2) => b2.fuel - a.fuel);
    for (let l = 0; l < this.fireLights.length; l++) {
      const f = sorted[l];
      if (f) {
        this.fireLights[l].position.set(f.x, f.y + 2, f.z);
        this.fireLights[l].intensity = 260 + Math.sin(this.time * 23 + l * 9) * 110;
      } else {
        this.fireLights[l].intensity = 0;
      }
    }
  }

  private stepSph(dt: number): void {
    const ctx: SphContext = {
      dt,
      time: this.time,
      gravityX: 0, gravityY: -9.81, gravityZ: 0,
      ambientC: this.ambientC,
      windX: Math.cos(this.time * 0.13) * this.windSpeed * (1 - this.stormAmt * 0.4),
      windY: 0,
      windZ: Math.sin(this.time * 0.13) * this.windSpeed * (1 - this.stormAmt * 0.4),
      windDrag: 0.1,
      terrainHeight: (x, z) => this.heightAt(x, z),
      wells: this.wells,
      vortices: this.vortices,
      holes: this.blackholes.map((b) => b.field),
      portals: this.portals.map((p) => p.pair),
      proxies: this.dyn.filter((b) => !b.dead && b.kind !== "asteroid").map((b) => {
        const p = b.body.translation();
        const v = b.body.linvel();
        return {
          id: b.id, x: p.x, y: p.y, z: p.z, radius: b.radius,
          vx: v.x, vy: v.y, vz: v.z, invMass: 1 / Math.max(b.body.mass(), 1),
        } satisfies BodyProxy;
      }),
      fires: this.fires,
      fx: this.sphFx,
      push: this.sphPush,
      quality: { iterations: 2, maxVel: 42, xsph: 0.09, activeLimit: 2800 },
    };
    this.sphFx.length = 0;
    this.sphPush.length = 0;
    this.solver.step(ctx);
    this.solver.cullDistant(this.pos.x, this.pos.y, this.pos.z, 260, 2800);

    // consume fx
    for (const e of this.sphFx) {
      if (e.kind === "steam" || e.kind === "mist") {
        this.smoke.spawn({
          x: e.x, y: e.y, z: e.z,
          vx: (this.rng.next() - 0.5) * 2, vy: 2.2, vz: (this.rng.next() - 0.5) * 2,
          life: 1.5, size: 1.2 * e.s, grow: 2, r: 0.85, g: 0.9, b: 0.92, alpha: 0.38, grav: -1.5, drag: 1.2,
        });
      } else if (e.kind === "ember") {
        this.glow.spawn({
          x: e.x, y: e.y, z: e.z,
          vx: (this.rng.next() - 0.5) * 4, vy: 4, vz: (this.rng.next() - 0.5) * 4,
          life: 0.8, size: 0.5, grow: 0.2, r: 1, g: 0.45, b: 0.1, alpha: 0.9, grav: 2, drag: 1,
        });
      }
    }
    if (this.solver.impactSum > 26) this.audio.splash(this.solver.impactSum * 0.05);
    this.solver.impactSum = 0;

    // rain injection
    if (this.rainRate > 0.05 && this.solver.n < 2800) {
      const n = Math.min(Math.floor(90 * this.rainRate * dt) + 1, 5);
      for (let k = 0; k < n; k++) {
        const x = this.pos.x + (this.rng.next() - 0.5) * 60;
        const z = this.pos.z + (this.rng.next() - 0.5) * 60;
        const gy = Math.max(this.heightAt(x, z), this.waterLevelAt(x, z));
        if (gy > -4) this.solver.emit(x, gy + 0.4, z, 0, -3, 0, 0, this.ambientC, 0.5, 1, 2800);
      }
    }
  }
  private sphFx: SphFx[] = [];
  private sphPush: SphPush[] = [];

  private stepPhysics(): void {
    this.rapier.timestep = STEP;
    this.rapier.step();
    // propagate dynamic bodies to meshes
    for (const b of this.dyn) {
      if (b.dead) continue;
      const p = b.body.translation();
      const r = b.body.rotation();
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (b.kind === "rocket" && Math.random() < 0.4) {
        const lv = b.body.linvel();
        this.smoke.burst(p.x - lv.x * 0.03, p.y - lv.y * 0.03, p.z - lv.z * 0.03, 1,
          { speed: 0.5, up: 0.4, life: 0.7, size: 0.3, grow: 1.2, r: 0.55, g: 0.55, b: 0.6, alpha: 0.4, grav: -0.3, drag: 1.5 });
      }
    }
    // player position from body
    const p = this.playerBody.translation();
    this.pos.set(p.x, p.y, p.z);
  }

  private updateRagdolls(): void {
    for (const r of this.ragdolls) {
      if (r.dead) continue;
      let allDead = true;
      for (let i = 0; i < r.bodies.length; i++) {
        const b = r.bodies[i];
        const p = b.translation();
        const rot = b.rotation();
        r.meshes[i].position.set(p.x, p.y, p.z);
        r.meshes[i].quaternion.set(rot.x, rot.y, rot.z, rot.w);
        // black hole consumption
        let consumed = false;
        for (const bh of this.blackholes) {
          if (Math.hypot(bh.x - p.x, bh.y - p.y, bh.z - p.z) < bh.horizon * 1.2) {
            consumed = true;
            break;
          }
        }
        if (consumed || Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z) > 800) {
          this.removeRagdoll(r);
          allDead = false;
          break;
        }
        allDead = false;
      }
      if (allDead && !r.dead) this.removeRagdoll(r);
    }
  }

  private updateEffects(dt: number): void {
    // shards
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.shards.splice(i, 1);
        continue;
      }
      s.vy -= 9.81 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += dt * 6;
      s.mesh.rotation.z += dt * 4;
    }
    // shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.age += dt;
      const t = s.age / 0.5;
      if (t >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const sc = 1 + t * s.max;
      s.mesh.scale.setScalar(sc);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
    }
    // bombs list hygiene
    this.bombs = this.bombs.filter((b) => !b.rec.dead);
  }

  /* ============================== VISUALS / RENDER ============================== */

  private syncVisuals(dt: number): void {
    const d = Math.hypot(this.pos.x, this.pos.z);
    const biome = this.biomeAt(d);
    if (this.lastBiome !== biome) {
      this.lastBiome = biome;
      this.cb.onBiome(BIOME_NAMES[biome]);
    }

    // ocean
    if (this.oceanMat && this.oceanMesh) {
      this.oceanMesh.position.y = this.seaLevel;
      this.oceanMesh.visible = d < 1500;
      this.oceanMat.uniforms.uTime.value = this.time;
      this.oceanMat.uniforms.uStorm.value = this.stormAmt;
      this.oceanMat.uniforms.uSeaLevel.value = this.seaLevel;
      this.oceanMat.uniforms.uCamPos.value.copy(this.camera.position);
      this.oceanMat.uniforms.uIce.value = 0;
    }
    if (this.stars) this.stars.visible = this.dimension === "other" && d > 900;
    this.skyMat.uniforms.uTime.value = this.time;
    this.skyMat.uniforms.uStorm.value = this.stormAmt;

    // fog
    const under = this.camera.position.y < this.waterLevelAt(this.pos.x, this.pos.z) - 0.3;
    const fog = this.scene.fog as THREE.FogExp2;
    if (under) {
      fog.color.setHex(0x062a30);
      fog.density = lerp(fog.density, 0.02, Math.min(1, dt * 5));
    } else if (this.stormAmt > 0.3) {
      fog.color.setHex(0x3a4550);
      fog.density = lerp(fog.density, 0.0035, Math.min(1, dt * 2));
    } else {
      fog.color.setHex(0x8aa5b5);
      fog.density = lerp(fog.density, 0.0016, Math.min(1, dt * 2));
    }
    if (this.oceanMat) this.oceanMat.uniforms.uFogColor.value.copy(fog.color);
    this.sun.intensity = lerp(2.4, 0.6, this.stormAmt);
    this.hemi.intensity = lerp(0.8, 0.4, this.stormAmt);
    this.flashLight.intensity = lerp(this.flashLight.intensity, 0, Math.min(1, dt * 9));

    // aerosols
    const wx = Math.cos(this.time * 0.13) * this.windSpeed;
    const wz = Math.sin(this.time * 0.13) * this.windSpeed;
    this.smoke.update(dt * this.timeScale, wx, 0, wz);
    this.glow.update(dt * this.timeScale, wx, 0, wz);

    // rain
    const active = Math.floor(1300 * Math.min(1, this.rainRate));
    this.rainLines.visible = active > 30 && d < 1400;
    if (this.rainLines.visible) {
      for (let i = 0; i < active; i++) {
        let x = this.rainVel[i * 4];
        let y = this.rainVel[i * 4 + 1];
        let z = this.rainVel[i * 4 + 2];
        const sp = this.rainVel[i * 4 + 3];
        y -= sp * dt * this.timeScale;
        x += wx * dt * 0.5;
        z += wz * dt * 0.5;
        const gy = this.heightAt(this.pos.x + x, this.pos.z + z);
        if (y < Math.max(gy, this.seaLevel)) {
          x = (Math.random() - 0.5) * 240;
          y = 55 + Math.random() * 20;
          z = (Math.random() - 0.5) * 240;
        }
        this.rainVel[i * 4] = x; this.rainVel[i * 4 + 1] = y; this.rainVel[i * 4 + 2] = z;
        this.rainPos[i * 6] = this.pos.x + x;
        this.rainPos[i * 6 + 1] = y;
        this.rainPos[i * 6 + 2] = this.pos.z + z;
        this.rainPos[i * 6 + 3] = this.pos.x + x - wx * 0.03;
        this.rainPos[i * 6 + 4] = y + sp * 0.03;
        this.rainPos[i * 6 + 5] = this.pos.z + z - wz * 0.03;
      }
      this.rainGeo.setDrawRange(0, active * 2);
      (this.rainGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    // bolt fade
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      (this.bolt.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.boltLife / 0.16);
    }
    // audio
    this.audio.update(
      this.solver.meanSpeed * Math.min(1, this.solver.n / 600) * 10 + this.rainRate * 8,
      this.windSpeed, under,
    );
  }

  private render(): void {
    const r = this.renderer;
    this.renderReflections();
    // lensing uniforms
    const lens = this.compMat.uniforms.uLens.value as THREE.Vector4[];
    for (let i = 0; i < 3; i++) {
      const bh = this.blackholes[i];
      if (bh && this.lensing) {
        this.tmpV.set(bh.x, bh.y, bh.z).project(this.camera);
        const dist = this.camera.position.distanceTo(this.tmpV2.set(bh.x, bh.y, bh.z));
        const facing = this.tmpV.z < 1;
        lens[i].set(
          this.tmpV.x * 0.5 + 0.5,
          this.tmpV.y * 0.5 + 0.5,
          clamp((bh.horizon * 5) / Math.max(dist, 1), 0.02, 0.5),
          facing ? clamp(bh.mass / 6000, 0.3, 1.8) : 0,
        );
      } else {
        lens[i].set(0, 0, 0, 0);
      }
    }
    this.compMat.uniforms.uTime.value = this.time;
    this.compMat.uniforms.uAspect.value = this.canvas.width / Math.max(1, this.canvas.height);
    // sun flare: project the sun, fade when occluded or under storm
    this.sunOccT -= STEP;
    if (this.sunOccT <= 0) {
      this.sunOccT = 0.25;
      const sp0 = this.tmpV2.copy(this.camera.position);
      const sd0 = this.tmpV.copy(this.sun.position).sub(sp0).normalize();
      this.sunRaycaster.set(sp0, sd0);
      this.sunRaycaster.far = 600;
      const hits = this.sunRaycaster.intersectObjects(this.scene.children, true);
      let blocked = false;
      for (const h of hits) {
        if (h.object === this.stars) continue;
        blocked = true;
        break;
      }
      this.sunOcc = blocked;
    }
    this.sunVis = lerp(this.sunVis, this.sunOcc ? 0.06 : 1, Math.min(1, STEP * 6));
    {
      const sd = this.tmpV.copy(this.sun.position).sub(this.camera.position);
      const alt = clamp(sd.y / Math.max(sd.length(), 1), 0, 1);
      const dayF = 1 - this.stormAmt * 0.75;
      const intensity = (0.3 + (1 - alt) * 1.1) * dayF * (this.dimension === "other" ? 0.25 : 1);
      this.tmpV2.copy(this.sun.position).project(this.camera);
      (this.compMat.uniforms.uSunFlare.value as THREE.Vector4).set(
        this.tmpV2.x * 0.5 + 0.5,
        this.tmpV2.y * 0.5 + 0.5,
        this.sunVis,
        intensity,
      );
    }
    const under = this.camera.position.y < this.waterLevelAt(this.pos.x, this.pos.z) - 0.3;
    this.compMat.uniforms.uUnderwater.value = lerp(
      this.compMat.uniforms.uUnderwater.value as number, under ? 1 : 0, Math.min(1, 0.25));
    this.compMat.uniforms.uFlash.value = lerp(this.compMat.uniforms.uFlash.value as number, 0, Math.min(1, 0.2));

    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.compScene, this.compCam);
  }

  private lensing = true;
  setLensing(on: boolean): void { this.lensing = on; }

  resize(): void {
    if (this.dead || !this.renderer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(Math.floor(w * pr), Math.floor(h * pr), {
      type: THREE.HalfFloatType, depthBuffer: true,
    });
    this.compMat.uniforms.tDiffuse.value = this.rt.texture;
    this.smoke.setPixelRatio(pr, Math.floor(h * pr));
    this.glow.setPixelRatio(pr, Math.floor(h * pr));
  }

  private log(msg: string, kind: string): void {
    this.cb.onLog(msg, kind);
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.detachInput();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    try { this.rapier?.free(); } catch { /* already freed */ }
    this.audio.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.rt?.dispose();
    this.reflRT?.dispose();
    this.heightTex?.dispose();
    this.waterTex?.dispose();
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.tracers.length = 0;
    this.renderer?.dispose();
  }

  get isAlive(): boolean { return this.alive; }
  get isFlying(): boolean { return this.flying; }
  get currentTool(): ToolId { return this.tool; }
}

/* ═══════════════════════ AAA GRAPHICS — LOCAL SHADER SET ═══════════════════════
   Three dedicated materials that give the world its "real" look:
   a clouded sky, a water surface that reflects the world, and a filmic
   full-screen grade. Kept local so the Aqua lab keeps its own pipeline. */

const AAA_NOISE_GLSL = /* glsl */ `
  float ahash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float avnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(ahash(i), ahash(i + vec2(1.0, 0.0)), u.x),
               mix(ahash(i + vec2(0.0, 1.0)), ahash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float afbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += avnoise(p) * a; p = p * 2.03 + vec2(13.7, 7.1); a *= 0.5; }
    return v;
  }
`;

/** Clouded sky: gradient + disc sun + fbm cloud deck with self-shadowing. */
function makeAaaSky(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      uniform float uFlash;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      ${AAA_NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -1.0, 1.0);
        vec3 zen = mix(vec3(0.075, 0.22, 0.48), vec3(0.03, 0.05, 0.09), uStorm);
        vec3 hor = mix(vec3(0.66, 0.74, 0.80), vec3(0.15, 0.19, 0.25), uStorm);
        // warm band right at the horizon, like real atmosphere
        vec3 horWarm = mix(vec3(0.78, 0.72, 0.62), vec3(0.18, 0.2, 0.26), uStorm);
        vec3 col = mix(hor, zen, pow(clamp(up, 0.0, 1.0), 0.55));
        col = mix(col, horWarm, (1.0 - smoothstep(0.0, 0.16, up)) * 0.55);
        if (up < 0.0) col = mix(hor, vec3(0.05, 0.08, 0.1), clamp(-up * 3.0, 0.0, 1.0));
        // sun: disc + tight halo + broad warmth
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        vec3 sunTint = mix(vec3(1.0, 0.9, 0.72), vec3(0.5, 0.55, 0.62), uStorm);
        col += sunTint * (pow(s, 1500.0) * 6.0 + pow(s, 28.0) * 0.22 + pow(s, 4.0) * 0.05) * (1.0 - uStorm * 0.8);
        // fbm cloud deck (two scales) with self-shadowing toward the sun
        vec2 cuv = d.xz / max(d.y + 0.3, 0.12) * 0.35;
        float ct = uTime * 0.008;
        float cl = afbm(cuv + vec2(ct, ct * 0.6));
        float cl2 = afbm(cuv * 2.7 - vec2(ct * 1.4, ct));
        float cover = smoothstep(1.0 - 0.36 - uStorm * 0.5, 1.02, cl * 0.62 + cl2 * 0.38);
        float shadowN = afbm(cuv * 1.15 + normalize(uSunDir.xz + vec2(0.0001)) * 0.6 + vec2(ct, ct * 0.6));
        vec3 cloudLit = mix(vec3(0.99, 0.99, 1.0), vec3(0.16, 0.18, 0.23), uStorm);
        vec3 cloudDark = mix(vec3(0.66, 0.71, 0.8), vec3(0.07, 0.08, 0.11), uStorm);
        vec3 cloudCol = mix(cloudDark, cloudLit, clamp(shadowN * 1.5 - 0.15, 0.0, 1.0));
        float horiz = smoothstep(0.0, 0.2, up);
        col = mix(col, cloudCol, cover * horiz * (0.62 + uStorm * 0.3));
        // haze at the horizon
        col = mix(col, hor, (1.0 - smoothstep(0.0, 0.3, up)) * 0.4);
        // stars
        vec2 sp = floor(d.xz / max(d.y, 0.2) * 90.0);
        float star = step(0.992, ahash(sp)) * smoothstep(0.25, 0.8, up);
        col += vec3(0.8, 0.9, 1.0) * star * (0.3 + uStorm * 0.4);
        // lightning wash
        col += vec3(0.75, 0.82, 1.0) * uFlash * (0.35 + cover * 0.65);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/**
 * Water surface: gerstner waves, planar (mirrored-camera) reflections,
 * Blinn-Phong sun glints, depth-tinted shallows from the live terrain
 * height texture, crest + shore foam, exponential distance fog.
 */
function makeAaaOcean(heightTex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uSeaLevel: { value: 0 },
      uHeightTex: { value: heightTex },
      uWorldSize: { value: 256 },
      uHMin: { value: -20 },
      uHMax: { value: 44 },
      uHCenter: { value: new THREE.Vector2(0, 0) },
      uDeep: { value: new THREE.Color(0.006, 0.075, 0.14) },
      uShallow: { value: new THREE.Color(0.04, 0.3, 0.36) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.8) },
      uFogColor: { value: new THREE.Color(0.55, 0.68, 0.78) },
      uFogDensity: { value: 0.0013 },
      uCamPos: { value: new THREE.Vector3() },
      uReflTex: { value: null as THREE.Texture | null },
      uReflVP: { value: new THREE.Matrix4() },
      uIce: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vCrest;
      vec3 gerstner(vec2 dir, float freq, float amp, float speed, vec3 p, float t, inout vec3 nrm, inout float crest) {
        float f = dot(dir, p.xz) * freq + t * speed;
        float c = cos(f);
        float s = sin(f);
        p.x += dir.x * amp * c;
        p.z += dir.y * amp * c;
        p.y += amp * s;
        nrm.x -= dir.x * freq * amp * c;
        nrm.z -= dir.y * freq * amp * c;
        nrm.y -= freq * amp * s;
        crest += s * amp;
        return p;
      }
      void main() {
        vec3 p = position;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vec3 nrm = vec3(0.0, 1.0, 0.0);
        float crest = 0.0;
        float amp = 0.22 + uStorm * 1.5;
        float t = uTime;
        p = gerstner(normalize(vec2(1.0, 0.35)), 0.11, amp * 1.0, 1.1, p, t, nrm, crest);
        p = gerstner(normalize(vec2(-0.7, 1.0)), 0.21, amp * 0.55, 1.5, p, t, nrm, crest);
        p = gerstner(normalize(vec2(0.4, -1.0)), 0.42, amp * 0.28, 2.1, p, t, nrm, crest);
        p = gerstner(normalize(vec2(-1.0, -0.4)), 0.85, amp * 0.12, 2.8, p, t, nrm, crest);
        vCrest = crest;
        vNormal = normalize(normalMatrix * nrm);
        world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      uniform float uSeaLevel;
      uniform sampler2D uHeightTex;
      uniform float uWorldSize;
      uniform float uHMin;
      uniform float uHMax;
      uniform vec2 uHCenter;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uIce;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uCamPos;
      uniform sampler2D uReflTex;
      uniform mat4 uReflVP;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vCrest;
      ${AAA_NOISE_GLSL}
      void main() {
        // fine ripple normal
        vec2 p = vWorld.xz;
        float e = 0.35;
        vec2 t = vec2(uTime * 0.7, uTime * 0.45);
        float h0 = sin(p.x * 1.4 + t.x) * sin(p.y * 1.1 - t.y) + 0.5 * sin(p.x * 3.1 - t.y * 1.7) * sin(p.y * 2.7 + t.x);
        float hx = sin((p.x + e) * 1.4 + t.x) * sin(p.y * 1.1 - t.y) + 0.5 * sin((p.x + e) * 3.1 - t.y * 1.7) * sin(p.y * 2.7 + t.x);
        float hz = sin(p.x * 1.4 + t.x) * sin((p.y + e) * 1.1 - t.y) + 0.5 * sin(p.x * 1.4 + t.x) * sin((p.y + e) * 2.7 + t.x);
        vec3 n = normalize(vNormal + vec3((h0 - hx) * 0.35, 0.0, (h0 - hz) * 0.35));
        // terrain depth under this fragment (live height texture)
        vec2 huv = (vWorld.xz - uHCenter) / uWorldSize + 0.5;
        float terrainH = uHMin - 20.0;
        if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) {
          terrainH = mix(uHMin, uHMax, texture2D(uHeightTex, huv).r);
        }
        float depth = clamp(uSeaLevel - terrainH, -1.0, 40.0);
        vec3 waterCol = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.16));
        waterCol = mix(waterCol, uDeep * 0.6, uIce);
        vec3 V = normalize(uCamPos - vWorld);
        // planar reflection: bounce the view ray on the surface, project it
        // through the mirrored camera.
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
        fres = clamp(fres, 0.0, 0.88) * (1.0 - uStorm * 0.2);
        vec3 refl = vec3(0.0);
        if (fres > 0.02) {
          vec3 R = reflect(V, n);
          float tt = (uSeaLevel - vWorld.y) / max(R.y, 0.015);
          vec3 hitP = vWorld + R * tt;
          vec4 cp = uReflVP * vec4(hitP, 1.0);
          vec2 ruv = cp.xy / max(cp.w, 1e-4) * 0.5 + 0.5;
          float rin = (cp.w > 0.0 && ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) ? 1.0 : 0.0;
          refl = texture2D(uReflTex, clamp(ruv, 0.0, 1.0)).rgb * rin;
        }
        vec3 col = mix(waterCol, refl, fres);
        // sun glints (blinn-phong on the rippled normal)
        vec3 H = normalize(normalize(uSunDir) + V);
        col += uSunColor * pow(max(dot(n, H), 0.0), 420.0) * 1.5 * (1.0 - uStorm * 0.7);
        // foam: shore + wave crests, broken up by fbm
        float shore = smoothstep(2.4, 0.0, depth);
        float crestF = smoothstep(0.3, 0.9, vCrest);
        float fn = afbm(vWorld.xz * 0.35 + vec2(uTime * 0.16, -uTime * 0.1));
        float foam = clamp((shore * 0.8 + crestF * 0.55) * (0.35 + fn), 0.0, 1.0);
        col = mix(col, vec3(0.93, 0.96, 0.98), foam * 0.72);
        // distance fog matched to the scene
        float dist = length(uCamPos - vWorld);
        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Full-screen grade: lensing + underwater + flash + ACES + filmic look. */
function makeAaaComposite(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uLens: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
      uLensOn: { value: 1 },
      uSunFlare: { value: new THREE.Vector4(0, 0, 0, 0) },
      uUnderwater: { value: 0 },
      uFlash: { value: 0 },
      uVignette: { value: 0.38 },
      uGrain: { value: 0.045 },
      uAspect: { value: 1.7 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec4 uLens[3];
      uniform float uLensOn;
      uniform vec4 uSunFlare;
      uniform float uUnderwater;
      uniform float uFlash;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uAspect;
      varying vec2 vUv;
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        vec2 uv = vUv;
        for (int i = 0; i < 3; i++) {
          vec4 L = uLens[i];
          if (L.w > 0.0001) {
            vec2 d = (uv - L.xy) * vec2(uAspect, 1.0);
            float r = max(length(d), 1e-4);
            float bend = L.w * (L.z * L.z) / (r * r + L.z * L.z * 0.12);
            bend = min(bend, 0.45);
            uv -= (d / r) * bend / vec2(uAspect, 1.0) * uLensOn;
          }
        }
        uv += uUnderwater * vec2(
          sin(uv.y * 40.0 + uTime * 3.0) * 0.004,
          cos(uv.x * 34.0 - uTime * 2.2) * 0.004
        );
        vec3 col = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        vec3 water = col * vec3(0.25, 0.65, 0.7);
        float depthFog = uUnderwater * 0.55;
        col = mix(col, water * (1.0 - depthFog) + vec3(0.02, 0.12, 0.14) * depthFog, uUnderwater);
        col += vec3(0.75, 0.82, 1.0) * uFlash * 0.35;
        // filmic grade: ACES, gentle contrast, saturation lift, warm cast
        col = aces(col * 1.16);
        col = pow(max(col, 0.0), vec3(1.0 / 2.2));
        col = (col - 0.5) * 1.07 + 0.5;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.16);
        col *= vec3(1.02, 1.0, 0.965);
        // ── sun lens flare: core glow, anamorphic streak, ghost discs ──
        if (uSunFlare.w > 0.001) {
          vec2 sunP = uSunFlare.xy;
          vec2 sd = vUv - sunP;
          sd.x *= uAspect;
          float sr = length(sd);
          float glow = exp(-sr * 5.5) * 1.1 + exp(-sr * 24.0) * 2.4;
          float streak = exp(-abs(sd.y) * 26.0) * exp(-abs(sd.x) * 2.0) * 0.85;
          vec3 warm = vec3(1.0, 0.9, 0.72);
          vec3 cold = vec3(0.62, 0.8, 1.0);
          float ring = exp(-abs(sr - 0.16) * 90.0) * 0.5; // lens ring
          vec2 ax = sunP - 0.5;
          vec3 ghostCol = vec3(0.0);
          for (int i = 1; i <= 5; i++) {
            float f = float(i) * 0.21;
            vec2 gp = vec2(0.5 - ax.x * f, 0.5 - ax.y * f);
            vec2 gd = vUv - gp;
            gd.x *= uAspect;
            float gr = 0.016 + float(i) * 0.013;
            float ga = exp(-dot(gd, gd) / (gr * gr)) * 0.3;
            vec3 gc = (i == 2) ? cold : (i == 3) ? vec3(1.0, 0.68, 0.5) : warm;
            ghostCol += gc * ga;
          }
          float sfVis = uSunFlare.z;
          col += warm * (glow + streak + ring * 0.5) * uSunFlare.w * sfVis;
          col += cold * streak * 0.35 * uSunFlare.w * sfVis;
          col += ghostCol * 1.5 * uSunFlare.w * sfVis;
        }
        vec2 vc = vUv - 0.5;
        col *= 1.0 - uVignette * dot(vc, vc) * 2.2;
        float g = fract(sin(dot(vUv * (uTime + 13.0), vec2(12.9898, 78.233))) * 43758.5453);
        col += (g - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
