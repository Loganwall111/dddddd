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
import { makeCompositeMaterial, makeSkyMaterial, makeOceanMaterial, makeDiskMaterial, makePortalMaterial } from "../aqua/shaders";
import { SOLIDS } from "../aqua/materials";
import { Rng, clamp, lerp } from "../aqua/rng";
import {
  allocId,
  type GravityWell, type VortexField, type BlackHoleField,
  type PortalPair, type BodyProxy, type FireSource,
} from "../aqua/fields";

export type BiomeId = "downtown" | "waterfront" | "dislocated" | "impossible" | "space";
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

export type ToolId = "dynamite" | "singularity" | "water" | "crates" | "glass" | "portal" | "ragdoll" | "well";

export const HOTBAR: { id: ToolId; label: string; glyph: string }[] = [
  { id: "dynamite", label: "Dynamite", glyph: "◆" },
  { id: "singularity", label: "Singularity", glyph: "◉" },
  { id: "water", label: "Water blob", glyph: "≋" },
  { id: "crates", label: "Crate stack", glyph: "▣" },
  { id: "glass", label: "Glass wall", glyph: "◫" },
  { id: "portal", label: "Portal", glyph: "◎" },
  { id: "ragdoll", label: "Ragdoll", glyph: "✚" },
  { id: "well", label: "Gravity well", glyph: "❂" },
];

export const BIOME_NAMES: Record<BiomeId, string> = {
  downtown: "DOWNTOWN — SECTOR 0",
  waterfront: "THE WATERFRONT",
  dislocated: "THE DISLOCATED",
  impossible: "THE IMPOSSIBLE",
  space: "DEEP SPACE",
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
  private compMat = makeCompositeMaterial();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private flashLight!: THREE.PointLight;
  private fireLights: THREE.PointLight[] = [];
  private skyMat = makeSkyMaterial();
  private oceanMat: THREE.ShaderMaterial | null = null;
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
  private tool: ToolId = "dynamite";

  // shared scratch
  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
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

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.25, 6000);
    this.scene.add(this.smoke.points);
    this.scene.add(this.glow.points);
    this.scene.fog = new THREE.FogExp2(0x8aa5b5, 0.0016);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x33403a, 0.8);
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

    // ocean
    const foamData = new Uint8Array(64 * 64);
    for (let i = 0; i < foamData.length; i++) foamData[i] = (this.rng.next() * 255) | 0;
    const foamTex = new THREE.DataTexture(foamData, 64, 64, THREE.RedFormat);
    foamTex.needsUpdate = true;
    this.oceanMat = makeOceanMaterial(foamTex);
    this.oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500, 120, 120), this.oceanMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.frustumCulled = false;
    this.scene.add(this.oceanMesh);

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

    // facades
    this.facadeMats = [0, 1, 2].map((v) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.34 + v * 0.07, 0.36 + v * 0.06, 0.42 + v * 0.08), roughness: 0.85, metalness: 0.05,
    }));

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
    if (dist < 190) return "downtown";
    if (dist < 420) return "waterfront";
    if (dist < 800) return "dislocated";
    if (dist < 1400) return "impossible";
    return "space";
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
    const base = fbm(x * 0.01, z * 0.01, seed, 4);
    if (tier === "downtown") {
      // perfect city grid: 32m blocks, 8m roads
      const inRoadX = mod(x, 32) < 8;
      const inRoadZ = mod(z, 32) < 8;
      if (inRoadX || inRoadZ) return 6.0;
      return 7.0;
    }
    if (tier === "waterfront") {
      let h = -3 + base * 7.5;
      // pool basins (one per chunk, hashed)
      const ph = hash2(cx, cz, seed + 55);
      if (ph < 0.55) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 56) - 0.5) * 34 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz, seed + 57) - 0.5) * 34 + 32;
        const d = Math.hypot(x - px, z - pz);
        if (d < 10) {
          const wall = smooth(clamp((d - 6.5) / 3.5, 0, 1));
          h = Math.min(h, lerp(3.2, Math.max(h, 6), wall));
        }
      }
      return h;
    }
    if (tier === "dislocated") {
      let h = 2 + base * 16;
      // floating plateaus: flatten patches
      const ph = hash2(cx, cz, seed + 71);
      if (ph < 0.5) {
        const px = cx * CHUNK + (hash2(cx, cz, seed + 72) - 0.5) * 30 + 32;
        const pz = cz * CHUNK + (hash2(cx, cz, seed + 73) - 0.5) * 30 + 32;
        const d = Math.hypot(x - px, z - pz);
        if (d < 12) h = lerp(8, h, clamp(d / 12, 0, 1));
      }
      return h;
    }
    // impossible: jagged + spires
    let h = 0 + base * 9;
    const sp = hash2(cx * 3 + 7, cz * 3 + 11, seed + 91);
    if (sp < 0.3) {
      const px = cx * CHUNK + (hash2(cx, cz, seed + 92) - 0.5) * 40 + 32;
      const pz = cz * CHUNK + (hash2(cx, cz, seed + 93) - 0.5) * 40 + 32;
      const d = Math.hypot(x - px, z - pz);
      const spireH = 18 + hash2(cx, cz, seed + 94) * 26;
      if (d < 7) h = Math.max(h, spireH * (1 - d / 7) ** 1.4);
    }
    return h;
  }

  private terrainColor(tier: BiomeId): number {
    if (tier === "downtown") return 0x3c4046;
    if (tier === "waterfront") return 0x7a7458;
    if (tier === "dislocated") return 0x5a4a6e;
    return 0x2b2b33;
  }

  /* ============================== CHUNKS ============================== */

  private buildInitialChunks(): void {
    const pcx = Math.floor(this.pos.x / CHUNK), pcz = Math.floor(this.pos.z / CHUNK);
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
      for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
        if (dx * dx + dz * dz > CHUNK_RADIUS * CHUNK_RADIUS + 2) continue;
        this.buildChunk(pcx + dx, pcz + dz);
      }
    }
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
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return;
    const group = new THREE.Group();
    const colliders: RAPIER.Collider[] = [];
    const centerD = Math.hypot(cx * CHUNK + 32, cz * CHUNK + 32);
    const tier = this.biomeAt(centerD);
    const seed = this.worldSeed;

    const heightAt = (x: number, z: number) => this.rawHeight(x, z, tier, cx, cz);
    const hm = this.heightfieldTrimesh(cx, cz, 16, heightAt);

    // visual terrain
    if (tier !== "space") {
      const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, 16, 16);
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
    else if (tier === "waterfront") this.buildWaterfrontChunk(cx, cz, group, colliders);
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

    // buildings per 32m block
    for (let bx = 0; bx < 2; bx++) {
      for (let bz = 0; bz < 2; bz++) {
        const cellX = x0 + bx * 32, cellZ = z0 + bz * 32;
        const bh = hash2(cellX >> 5, cellZ >> 5, seed + 200);
        if (bh > 0.62) continue;
        this.buildBuilding(cellX + 8 + (hash2(bx, bz, seed + 201) - 0.5) * 6, cellZ + 8 + (hash2(bz, bx, seed + 202) - 0.5) * 6, group, colliders);
      }
    }

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
    const floors = 2 + Math.floor(hash2(px | 0, pz | 0, seed + 400) * 3); // 2..4
    const w = 12 + hash2(pz | 0, px | 0, seed + 401) * 7;
    const d = 12 + hash2(px | 0, pz + 1, seed + 402) * 7;
    const h = 3.2;
    const hollow = hash2(px | 0, pz | 0, seed + 403) < 0.4;
    const facade = this.facadeMats[Math.floor(hash2(px | 0, pz | 0, seed + 404) * 3)];
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
      const winN = 2 + Math.floor(hash2(f, px | 0, seed + 405) * 2);
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

  /* -------------------------- waterfront -------------------------- */

  private buildWaterfrontChunk(cx: number, cz: number, group: THREE.Group, colliders: RAPIER.Collider[]): void {
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
    // a few trees + lamps
    for (let i = 0; i < 3; i++) {
      const px = cx * CHUNK + this.rng.range(6, 58);
      const pz = cz * CHUNK + this.rng.range(6, 58);
      const gy = this.rawHeight(px, pz, "waterfront", cx, cz);
      if (gy < 0.8) continue;
      this.addTree(px, gy, pz, group, colliders);
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

  private makeRagdoll(x: number, y: number, z: number, scale: number): Ragdoll {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8c4a8, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2e6fc2, roughness: 0.9 });
    const cloth2 = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.9 });
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
    this.keys.add(e.code);
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5)) - 1;
      if (n >= 0 && n < HOTBAR.length) {
        this.tool = HOTBAR[n].id;
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

  private onPointerUp = (): void => { /* tool is single-shot per click */ };

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.paused || !this.alive) return;
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      this.fireTool();
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
  selectToolIndex(i: number): void { if (i >= 0 && i < HOTBAR.length) this.tool = HOTBAR[i].id; }

  private fireTool(): void {
    if (!this.alive) return;
    const hit = this.pickSurface();
    const p = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : this.tmpV2.copy(this.camera.position).addScaledVector(this.cameraDirection(), 14).clone();
    switch (this.tool) {
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
      case "well":
        this.wells.push({
          kind: "well", id: allocId(), x: p.x, y: p.y + 8, z: p.z,
          strength: 300, radius: 26, softening: 8,
        });
        if (this.wells.length > 6) this.wells.shift();
        this.log("Gravity well installed. Nothing nearby is safe from its patience.", "sys");
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
    if (!this.alive || this.paused) return;
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
        this.log("LAUNCH VECTOR — ignition. You are leaving the planet. Space is ahead; the station is at (2500, 80, 0).", "alert");
        return;
      }
    }
  }

  private teleportPlayer(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.playerBody.setNextKinematicTranslation({ x, y, z });
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

    // sun follows player
    this.sun.position.set(this.pos.x + 70, this.pos.y + 110, this.pos.z + 40);
    this.sun.target.position.set(this.pos.x, this.pos.y, this.pos.z);

    this.syncVisuals(frameDt);
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
    this.updatePlayer(STEP);
    this.updateDynamic(STEP);
    this.updateBlackHoles(STEP);
    this.updatePortals(STEP);
    this.updateFires(STEP);
    this.stepSph(STEP);
    this.stepPhysics();
    this.updateRagdolls();
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
      if (!this.chunks.has(`${cx},${cz}`)) {
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
        this.hp -= dmg;
        this.trauma = Math.min(1, this.trauma + 0.5);
        this.audio.crack();
        if (this.hp <= 0) this.die("the fall ended everything");
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
      if (b.kind === "bomb") {
        b.fuse = (b.fuse ?? 2.6) - dt;
        const gy = this.heightAt(p.x, p.z);
        if ((b.fuse ?? 0) <= 0 || (p.y < gy + 0.45 && Math.hypot(p.x, p.z) < 1400)) {
          this.killDyn(b);
          this.explode(p.x, p.y, p.z, 9, 300, 2.2);
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
        const d = Math.hypot(bh.x - this.pos.x, bh.y - this.pos.y, bh.z - this.pos.z);
        if (d < bh.horizon * 1.05) this.die("consumed by the singularity");
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
    if (this.stars) this.stars.visible = d > 1200;
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
    this.renderer?.dispose();
  }

  get isAlive(): boolean { return this.alive; }
  get isFlying(): boolean { return this.flying; }
  get currentTool(): ToolId { return this.tool; }
}
