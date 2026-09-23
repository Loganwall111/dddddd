/* RIFTBOUND — engine: voxel world, player, the Rift, the Gate, the Dream dimension, foggy skies.
   Everything is procedural and original; the goal is the *feel* of the reference cinematics:
   stepped glowing rifts torn in the sky, arcing lightning, a pixel-tile portal, a pastel
   rainbow dimension, and soft blocky clouds in the fog. */
import * as THREE from "three";
import {
<<<<<<< HEAD
  B, BLOCKS, HOTBAR_BLOCKS, CX, CY, CZ,
=======
  B, BLOCKS, HOTBAR_BLOCKS, CX, CY, CZ, terrainHeightAt,
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
  Chunk, Dim, buildChunkMesh, generateChunk, hash2, makeAtlas, raycastVoxel,
} from "./voxel";

export interface RiftsStats {
  fps: number; x: number; y: number; z: number;
  dim: Dim; mode: "creative" | "survival"; third: boolean; flying: boolean; hp: number; down: boolean;
}
export interface RiftsCallbacks {
  onStats: (s: RiftsStats) => void;
  onLog: (msg: string, kind: string) => void;
  onDown: () => void;
<<<<<<< HEAD
=======
  onError?: (msg: string) => void;
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
}

const STEP = 1 / 60;
const RIFT_POS = { x: 26, z: -20 };
const PORTAL_PRIME = { x: -14, z: 18 };
const PORTAL_RAINBOW = { x: 10, z: -12 };
const CHUNK_VIEW = 3;

export class RiftsWorld {
  private canvas: HTMLCanvasElement;
  private cb: RiftsCallbacks;
  private rngSeed: number;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private clockT = 0;
  private fpsEma = 60;
  private lastT = performance.now();
  private acc = 0;
  private statT = 0;
  private raf = 0;
  private disposed = false;

  // world
  private dim: Dim = "prime";
  private chunks = new Map<string, { chunk: Chunk; solid: THREE.Mesh | null; water: THREE.Mesh | null; glow: THREE.Mesh | null }>();
  private solidMat!: THREE.MeshStandardMaterial;
  private glowMat!: THREE.MeshBasicMaterial;
  private waterMat!: THREE.ShaderMaterial;
  private atlasTex!: THREE.DataTexture;

  // environment
  private skyMat!: THREE.ShaderMaterial;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private dayT = 0.22; // start morning
  private cloudMesh!: THREE.InstancedMesh;
  private cloudShadow!: THREE.InstancedMesh;
  private cloudSeeds: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];

  // player
  private pos = new THREE.Vector3(8, 30, 8);
  private vel = new THREE.Vector3();
  private yaw = 0.6;
  private pitch = -0.1;
  private onGround = false;
  private flying = false;
  private third = false;
  private mode: "creative" | "survival" = "creative";
  private hp = 20;
  private down = false;
  private fallTop = 0;
  private playing = false;
  private paused = false;
  private keys = new Set<string>();
  private hotIdx = 0;

  // rift
  private riftGroup: THREE.Group | null = null;
  private riftCoreMat!: THREE.MeshBasicMaterial;
  private riftLight!: THREE.PointLight;
  private riftLight2!: THREE.PointLight;
  private riftFlash = 0;
  private riftTimer = 0;
  private bolts: { group: THREE.Group; mat: THREE.MeshBasicMaterial; age: number; life: number }[] = [];
  private debris: { mesh: THREE.Mesh; r: number; a: number; w: number; y0: number; bw: number; ba: number; spin: number }[] = [];
  private riftSpriteMat!: THREE.SpriteMaterial;

  // gate (portal)
  private gateGroup: THREE.Group | null = null;
  private gateShader!: THREE.ShaderMaterial;
  private gateRimMats: THREE.MeshBasicMaterial[] = [];
  private gateBeamMats: THREE.MeshBasicMaterial[] = [];
  private riftPillarMats: THREE.MeshBasicMaterial[] = [];
  private riftSparks?: THREE.Points;
  private sparkVel: number[] = [];
  private gateSpriteMat!: THREE.SpriteMaterial;

  // audio
  private actx: AudioContext | null = null;

  constructor(canvas: HTMLCanvasElement, cb: RiftsCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.rngSeed = Math.floor(Math.random() * 1e6);
  }

  async init(): Promise<void> {
<<<<<<< HEAD
=======
    try {
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200);
    this.scene.add(this.camera);

    // atlas → texture
    const atlas = makeAtlas();
    const { data, w, h } = atlas.texture;
    const img = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      img[i * 4] = data[i][0]; img[i * 4 + 1] = data[i][1]; img[i * 4 + 2] = data[i][2]; img[i * 4 + 3] = data[i][3];
    }
    this.atlasTex = new THREE.DataTexture(img, w, h, THREE.RGBAFormat);
    this.atlasTex.magFilter = THREE.NearestFilter;
    this.atlasTex.minFilter = THREE.NearestMipmapLinearFilter;
    this.atlasTex.generateMipmaps = true;
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.needsUpdate = true;

    this.solidMat = new THREE.MeshStandardMaterial({ map: this.atlasTex, vertexColors: true, roughness: 1, metalness: 0 });
    this.glowMat = new THREE.MeshBasicMaterial({ map: this.atlasTex, vertexColors: true });
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPastel: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPastel;
        varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main() {
          vec3 col;
          if (uPastel > 0.5) {
            vec2 p = vW.xz * 0.035;
            float n1 = sin(p.x * 1.7 + uTime * 0.35) * cos(p.y * 1.9 - uTime * 0.28);
            float n2 = sin(p.x * 3.3 - p.y * 2.6 + uTime * 0.5);
            float n3 = sin(p.x * 5.9 + p.y * 4.7 - uTime * 0.8);
            vec3 a = vec3(1.0, 0.37, 0.82);    // magenta
            vec3 b2 = vec3(0.25, 0.88, 0.79);   // teal
            vec3 c3 = vec3(0.66, 0.61, 0.98);   // lavender
            vec3 d4 = vec3(1.0, 0.76, 0.48);    // peach
            col = mix(a, b2, smoothstep(0.2, 0.8, 0.5 + 0.5 * n1));
            col = mix(col, c3, smoothstep(0.35, 0.75, 0.5 + 0.5 * n2));
            col = mix(col, d4, smoothstep(0.62, 0.95, 0.5 + 0.5 * n3) * 0.55);
            float spk = h21(floor(vW.xz * 0.9));
            if (spk > 0.93) col = mix(col, vec3(1.0), 0.85);
            col = mix(col, vec3(1.0), 0.10);
          } else {
            float n = h21(floor(vW.xz * 0.5) + floor(uTime * 2.0) * 0.13);
            col = mix(vec3(0.14, 0.4, 0.64), vec3(0.34, 0.62, 0.86), n);
          }
          gl_FragColor = vec4(col, uPastel > 0.5 ? 0.82 : 0.66);
        }`,
    });

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x6fb9f0) },
        uBottom: { value: new THREE.Color(0xdceaf2) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.2).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vP;
        void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uSunDir;
        varying vec3 vP;
        void main() {
          vec3 d = normalize(vP);
          float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uBottom, uTop, pow(t, 0.8));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.92, 0.72) * pow(s, 240.0) * 1.2;
          col += vec3(1.0, 0.8, 0.5) * pow(s, 18.0) * 0.16;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
    this.sun.position.set(80, 130, 40);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a4a, 0.85);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xcfe2f0, 0.0022);

    // blocky drifting clouds
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cloudMesh = new THREE.InstancedMesh(
      cloudGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, roughness: 1 }),
      110,
    );
    this.cloudShadow = new THREE.InstancedMesh(
      cloudGeo,
      new THREE.MeshStandardMaterial({ color: 0xb3c2d6, transparent: true, opacity: 0.85, roughness: 1 }),
      110,
    );
    for (let i = 0; i < 110; i++) {
      this.cloudSeeds.push({
        x: (hash2(i, 1, 9001) - 0.5) * 840,
        y: 54 + hash2(i, 2, 9002) * 10,
        z: (hash2(i, 3, 9003) - 0.5) * 840,
        sx: 7 + hash2(i, 4, 9004) * 15,
        sy: 1.6 + hash2(i, 5, 9005) * 1.8,
        sz: 7 + hash2(i, 6, 9006) * 15,
      });
    }
    this.scene.add(this.cloudMesh, this.cloudShadow);

    this.scene.add(new THREE.Group()); // scene root group for entities
    this.buildEntities();

    // prime spawn
    const gy = this.terrainHeight(8, 8, "prime");
    this.pos.set(8, gy + 2, 8);

    this.attachInput();
    this.resize();
    window.addEventListener("resize", this.onResize);
    // prebuild a ring around spawn
    this.ensureChunks(2);
    this.lastT = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
<<<<<<< HEAD
=======
    } catch (e) {
      const msg = e instanceof Error ? (e.stack || e.message) : String(e);
      console.error(msg);
      this.cb.onError?.(msg);
      throw e;
    }
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
  }

  /* ── helpers ── */
  private terrainHeight(x: number, z: number, dim: Dim): number {
<<<<<<< HEAD
    // mirrors generateChunk's surface formula (no caves/trees)
    const fbm = (fx: number, fz: number, seed: number, oct: number) => {
      let v = 0, amp = 0.5, f = 1;
      for (let i = 0; i < oct; i++) {
        const xi = Math.floor(fx * f), zi = Math.floor(fz * f);
        const xf = fx * f - xi, zf = fz * f - zi;
        const s = (t: number) => t * t * (3 - 2 * t);
        const a = hash2(xi, zi, seed + i * 101), b = hash2(xi + 1, zi, seed + i * 101);
        const c = hash2(xi, zi + 1, seed + i * 101), d = hash2(xi + 1, zi + 1, seed + i * 101);
        v += (a + (b - a) * s(xf) + (c - a) * s(zf) + (a - b - c + d) * s(xf) * s(zf)) * amp;
        amp *= 0.5; f *= 2.07;
      }
      return v;
    };
    if (dim === "prime") return Math.floor(14 + fbm(x * 0.02, z * 0.02, this.rngSeed, 4) * 10 + fbm(x * 0.005, z * 0.005, this.rngSeed + 5, 2) * 7);
    return Math.floor(10 + fbm(x * 0.024, z * 0.024, this.rngSeed + 40, 3) * 5);
=======
    return terrainHeightAt(x, z, dim, this.rngSeed);
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
  }

  private getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.STONE;
    if (y >= CY) return B.AIR;
    const cx = Math.floor(x / CX), cz = Math.floor(z / CZ);
    const rec = this.chunks.get(`${cx},${cz}`);
    if (!rec) return B.AIR;
    return rec.chunk.get(((x % CX) + CX) % CX, y, ((z % CZ) + CZ) % CZ);
  }

  private key(cx: number, cz: number): string { return `${cx},${cz}`; }

  private chunkRec(cx: number, cz: number): { chunk: Chunk; solid: THREE.Mesh | null; water: THREE.Mesh | null; glow: THREE.Mesh | null } | null {
    const rec = this.chunks.get(this.key(cx, cz));
    return rec ?? null;
  }

  private rebuildMesh(rec: { chunk: Chunk; solid: THREE.Mesh | null; water: THREE.Mesh | null; glow: THREE.Mesh | null }, cx: number, cz: number): void {
    const { solid, water, glow } = buildChunkMesh(rec.chunk, (x, y, z) => this.getBlock(x, y, z), this.dim);
    const build = (data: { positions: number[]; uvs: number[]; colors: number[]; indices: number[] }, mat: THREE.Material) => {
      if (data.positions.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
      g.setIndex(data.indices);
      g.computeBoundingSphere();
      return new THREE.Mesh(g, mat);
    };
    if (rec.solid) { this.scene.remove(rec.solid); rec.solid.geometry.dispose(); }
    if (rec.water) { this.scene.remove(rec.water); rec.water.geometry.dispose(); }
    if (rec.glow) { this.scene.remove(rec.glow); rec.glow.geometry.dispose(); }
    rec.solid = build(solid, this.solidMat);
    rec.water = build(water, this.waterMat);
    rec.glow = build(glow, this.glowMat);
    if (rec.solid) this.scene.add(rec.solid);
    if (rec.water) this.scene.add(rec.water);
    if (rec.glow) this.scene.add(rec.glow);
    void cx; void cz;
  }

  private ensureChunks(radius: number): void {
    const pcx = Math.floor(this.pos.x / CX), pcz = Math.floor(this.pos.z / CZ);
    // remove far
    for (const [k, rec] of Array.from(this.chunks)) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > radius + 1) {
        if (rec.solid) { this.scene.remove(rec.solid); rec.solid.geometry.dispose(); }
        if (rec.water) { this.scene.remove(rec.water); rec.water.geometry.dispose(); }
        if (rec.glow) { this.scene.remove(rec.glow); rec.glow.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
    // build near→far, budget 2/frame
    const want: [number, number, number][] = [];
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (!this.chunks.has(this.key(cx, cz))) want.push([cx, cz, dx * dx + dz * dz]);
    }
    want.sort((a, b) => a[2] - b[2]);
    let budget = 2;
    for (const [cx, cz] of want) {
      if (budget <= 0) break;
      budget--;
      const chunk = new Chunk(cx, cz);
      generateChunk(chunk, this.dim, this.rngSeed);
      const rec = { chunk, solid: null, water: null, glow: null };
      this.chunks.set(this.key(cx, cz), rec);
      this.rebuildMesh(rec, cx, cz);
    }
  }

  /* ── entities: rift + gate ── */
  private buildEntities(): void {
    this.disposeRift();
    this.disposeGate();
    if (this.dim === "prime") this.buildRift();
    this.buildGate(this.dim === "prime" ? PORTAL_PRIME : PORTAL_RAINBOW);
  }

  private makeGlowSprite(inner: string, outer: string): THREE.Sprite {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    return s;
  }

  /** Stepped, glowing, torn-in-the-sky rift with arcing lightning and orbiting debris. */
  private buildRift(): void {
    const gy = this.terrainHeight(RIFT_POS.x, RIFT_POS.z, "prime");
    const cy = gy + 8;
    const g = new THREE.Group();
    g.position.set(RIFT_POS.x, cy, RIFT_POS.z);
    const spawnYaw = Math.atan2(8 - RIFT_POS.x, 8 - RIFT_POS.z);
    g.rotation.y = spawnYaw;

    // jagged stepped silhouette (a torn plus)
    const S = 13, c = 6;
    const mask: boolean[][] = [];
    for (let y = 0; y < S; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < S; x++) {
        const dx = Math.abs(x - c), dy = Math.abs(y - c);
        let inArm = (dx <= 2 && dy <= 6) || (dy <= 2 && dx <= 6);
        if (inArm && Math.max(dx, dy) > 3 && hash2(x * 3, y * 7, 917) < 0.38) inArm = false;
        if (!inArm && dx <= 3 && dy <= 3 && hash2(x * 5, y * 11, 918) > 0.84) inArm = true;
        row.push(inArm);
      }
      mask.push(row);
    }

    const boxGeo = new THREE.BoxGeometry(0.92, 0.92, 0.5);
    this.riftCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
    const midMat = new THREE.MeshStandardMaterial({ color: 0xffc2ae, emissive: 0xff7d6e, emissiveIntensity: 1.15, roughness: 0.4 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a70, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Group(), mid = new THREE.Group(), glow = new THREE.Group();
    const inMask = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && mask[y][x];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!mask[y][x]) continue;
      const px = x - c, py = c - y;
      // interior: pink plasma; boundary: bright stepped white ring
      const edgeCell = !inMask(x + 1, y) || !inMask(x - 1, y) || !inMask(x, y + 1) || !inMask(x, y - 1);
      if (edgeCell) {
        const m1 = new THREE.Mesh(boxGeo, this.riftCoreMat);
        m1.position.set(px, py, 0.18);
        core.add(m1);
      }
      const m2 = new THREE.Mesh(boxGeo, midMat);
      m2.position.set(px, py, -0.1);
      const m3 = new THREE.Mesh(boxGeo, glowMat);
      m3.position.set(px, py, -0.5);
      m3.scale.setScalar(1.05);
      mid.add(m2); glow.add(m3);
    }
    g.add(core, mid, glow);

    const sprite = this.makeGlowSprite("rgba(255,225,190,0.95)", "rgba(255,150,90,0.38)");
    sprite.scale.set(30, 30, 1);
    sprite.position.z = -2.5;
    this.riftSpriteMat = sprite.material as THREE.SpriteMaterial;
    g.add(sprite);

    this.riftLight = new THREE.PointLight(0xffb46a, 260, 48, 1.7);
    this.riftLight.position.set(0, 0, 2.4);
    this.riftLight2 = new THREE.PointLight(0xff77aa, 130, 34, 1.8);
    this.riftLight2.position.set(0, 0, -1.5);
    g.add(this.riftLight, this.riftLight2);

    // orbiting stepped debris
    const palette = [0xffffff, 0xffc7dd, 0xc9b8ff, 0xffd9a8, 0xbfffe8];
    const dGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 14; i++) {
      const sz = 0.35 + hash2(i, 9, 921) * 0.8;
      const m = new THREE.Mesh(dGeo, new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.6 }));
      m.scale.setScalar(sz);
      g.add(m);
      this.debris.push({
        mesh: m,
        r: 3.4 + hash2(i, 10, 922) * 4.2,
        a: hash2(i, 11, 923) * Math.PI * 2,
        w: (0.16 + hash2(i, 12, 924) * 0.45) * (hash2(i, 13, 925) < 0.5 ? -1 : 1),
        y0: 1.5 + hash2(i, 14, 926) * 7,
        bw: 0.6 + hash2(i, 15, 927) * 1.6,
        ba: 0.3 + hash2(i, 16, 928) * 0.7,
        spin: (hash2(i, 17, 929) - 0.5) * 2,
      });
    }

    // vertical light pillar rising from the top of the tear
    this.riftPillarMats = [];
    const pillarSpec: [number, number, number][] = [[2.6, 7, 0.38], [1.7, 15, 0.26], [0.9, 23, 0.16]];
    for (const [w, py, op] of pillarSpec) {
      const pm = new THREE.MeshBasicMaterial({
        color: 0xfff4e2, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 8, 0.7), pm);
      box.position.set(0, py, -0.4);
      g.add(box);
      this.riftPillarMats.push(pm);
    }

    // drifting white sparks inside the tear
    const sparkPos: number[] = [];
    this.sparkVel = [];
    for (let i = 0; i < 80; i++) {
      let sx = 0, sy = 0, ok = false;
      for (let t = 0; t < 12 && !ok; t++) {
        sx = (hash2(i, t, 711) - 0.5) * 13;
        sy = (hash2(i, t, 712) - 0.5) * 13;
        ok = (Math.abs(sx) <= 3 && Math.abs(sy) <= 6.5) || (Math.abs(sy) <= 3 && Math.abs(sx) <= 6.5);
      }
      if (!ok) continue;
      sparkPos.push(sx, sy, (hash2(i, 9, 713) - 0.5) * 1.6);
      this.sparkVel.push(0.5 + hash2(i, 8, 714) * 0.9);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sparkPos, 3));
    const sm = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.17, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.riftSparks = new THREE.Points(sg, sm);
    g.add(this.riftSparks);

    this.scene.add(g);
    this.riftGroup = g;
    this.bolts = [];
    this.riftTimer = 0.2;
  }

  private disposeRift(): void {
    if (!this.riftGroup) return;
    this.scene.remove(this.riftGroup);
    this.riftGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const x of mats) {
        const map = (x as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        x.dispose();
      }
    });
    this.riftGroup = null;
    this.debris = [];
    this.bolts = [];
    this.riftPillarMats = [];
    this.riftSparks = undefined;
    this.sparkVel = [];
  }

  /** Pixel-tile gate: dark stepped frame + animated cyan tile field + glow rim. */
  private buildGate(at: { x: number; z: number }): void {
    const gy = this.terrainHeight(at.x, at.z, this.dim);
    const g = new THREE.Group();
    g.position.set(at.x, gy, at.z);
    g.rotation.y = Math.atan2(8 - at.x, 8 - at.z);

    // platform + frame are REAL voxels (solid, breakable, collidable)
    this.stampGateVoxels(at, gy);

    // pixel-tile surface
    this.gateShader = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main() {
          // coarse square-tile mosaic: deep teal → pale cyan → white, top rows brighter
          vec2 tc = floor(vUv * vec2(12.0, 7.0));
          float n = h21(tc);
          float n2 = h21(tc + 4.7);
          float bias = mix(vUv.y, 1.0 - vUv.x, 0.6);
          float v = n * 0.55 + bias * 0.5 + n2 * 0.2 + 0.04 * sin(uTime * 2.4 + n * 21.0);
          vec3 c1 = vec3(0.10, 0.45, 0.58);
          vec3 c2 = vec3(0.28, 0.68, 0.78);
          vec3 c3 = vec3(0.60, 0.90, 0.95);
          vec3 c4 = vec3(0.88, 0.99, 1.00);
          vec3 col = v < 0.34 ? c1 : v < 0.52 ? c2 : v < 0.70 ? c3 : v < 0.87 ? c4 : vec3(1.0);
          float edge = max(max(step(vUv.x, 0.055), step(1.0 - vUv.x, 0.055)), max(step(vUv.y, 0.055), step(1.0 - vUv.y, 0.055)));
          col = mix(col, vec3(1.0), edge * 0.95);
          gl_FragColor = vec4(col, 0.96);
        }`,
    });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.6), this.gateShader);
    surf.position.set(0, 4.0, 0.06);
    g.add(surf);

    // glowing stepped rim
    this.gateRimMats = [];
    const rimMat = () => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.gateRimMats.push(m);
      return m;
    };
    const rim = (w: number, h: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), rimMat());
      m.position.set(x, y, z);
      g.add(m);
    };
    rim(7.9, 0.22, 0, 4.0 + 2.41, 0.1);
    // stepped silhouette cap on the top edge
    const capXs: [number, number][] = [[-3.4, 0.5], [-1.9, 0.8], [-0.5, 0.6], [0.9, 0.9], [2.3, 0.55], [3.5, 0.35]];
    for (const [cx, ch] of capXs) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, ch, 0.2), rimMat());
      cap.position.set(cx, 4.0 + 2.41 + 0.11 + ch / 2, 0.1);
      g.add(cap);
    }
    rim(7.9, 0.22, 0, 4.0 - 2.41, 0.1);
    rim(0.22, 5.0, -3.91, 4.0, 0.1);
    rim(0.22, 5.0, 3.91, 4.0, 0.1);

    // gold/brass trim on the platform edge + frame cap (reference: dark stone w/ gold lines)
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    const gold = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), goldMat);
      m.position.set(x, y, z);
      g.add(m);
    };
    gold(9.4, 0.16, 0.16, 0, 1.52, 4.6);
    gold(9.4, 0.16, 0.16, 0, 1.52, -4.6);
    gold(0.16, 0.16, 9.4, 4.6, 1.52, 0);
    gold(0.16, 0.16, 9.4, -4.6, 1.52, 0);

    // colored light beams rising behind the panel (red / orange / magenta / gold)
    this.gateBeamMats = [];
    const beamCols = [0xff4a3d, 0xff8a3d, 0xff3d9e, 0xffcf4a, 0xff6f5f, 0xffb13d];
    for (let i = 0; i < 6; i++) {
      const bm = new THREE.MeshBasicMaterial({
        color: beamCols[i], transparent: true,
        opacity: 0.13 + (i % 3) * 0.05, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const bh = 16 + hash2(i, 3, 777) * 10;
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.5 + hash2(i, 4, 778) * 0.7, bh, 0.5), bm);
      bx.position.set(-5 + i * 2 + (hash2(i, 5, 779) - 0.5), bh / 2 + 1, -1.8);
      g.add(bx);
      this.gateBeamMats.push(bm);
    }

    const sprite = this.makeGlowSprite("rgba(210,255,255,0.9)", "rgba(80,220,240,0.35)");
    sprite.scale.set(18, 12, 1);
    sprite.position.set(0, 4.0, -1.6);
    this.gateSpriteMat = sprite.material as THREE.SpriteMaterial;
    g.add(sprite);

    const pl = new THREE.PointLight(0x9feaff, 160, 30, 1.8);
    pl.position.set(0, 4.0, 3);
    g.add(pl);

    this.scene.add(g);
    this.gateGroup = g;
  }

  private stampGateVoxels(at: { x: number; z: number }, gy: number): void {
    const cx = Math.floor(at.x / CX), cz = Math.floor(at.z / CZ);
    let rec = this.chunkRec(cx, cz);
    if (!rec) {
      const chunk = new Chunk(cx, cz);
      generateChunk(chunk, this.dim, this.rngSeed);
      rec = { chunk, solid: null, water: null, glow: null };
      this.chunks.set(this.key(cx, cz), rec);
    }
    const put = (gx: number, gyv: number, gz: number, b: number) => {
      const lx = gx - cx * CX, lz = gz - cz * CZ;
      if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ || gyv < 0 || gyv >= CY) return;
      rec!.chunk.set(lx, gyv, lz, b);
    };
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) put(at.x + dx, gy + 1, at.z + dz, B.FRAME);
    this.rebuildMesh(rec, cx, cz);
    // neighbor chunks may share the platform edge
    if (at.x - cx * CX < 2) { const r = this.chunkRec(cx - 1, cz); if (r) this.rebuildMesh(r, cx - 1, cz); }
    if (at.x - cx * CX > CX - 3) { const r = this.chunkRec(cx + 1, cz); if (r) this.rebuildMesh(r, cx + 1, cz); }
    if (at.z - cz * CZ < 2) { const r = this.chunkRec(cx, cz - 1); if (r) this.rebuildMesh(r, cx, cz - 1); }
    if (at.z - cz * CZ > CZ - 3) { const r = this.chunkRec(cx, cz + 1); if (r) this.rebuildMesh(r, cx, cz + 1); }
  }

  private disposeGate(): void {
    if (!this.gateGroup) return;
    this.scene.remove(this.gateGroup);
    this.gateGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const x of mats) {
        const map = (x as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        x.dispose();
      }
    });
    this.gateGroup = null;
    this.gateRimMats = [];
    this.gateBeamMats = [];
  }

  /* ── dimension switch ── */
  switchDimension(to: Dim): void {
    if (to === this.dim) return;
    this.dim = to;
    for (const rec of this.chunks.values()) {
      if (rec.solid) { this.scene.remove(rec.solid); rec.solid.geometry.dispose(); }
      if (rec.water) { this.scene.remove(rec.water); rec.water.geometry.dispose(); }
      if (rec.glow) { this.scene.remove(rec.glow); rec.glow.geometry.dispose(); }
    }
    this.chunks.clear();
    (this.scene.fog as THREE.FogExp2).density = to === "prime" ? 0.0022 : 0.0038;
    (this.cloudMesh.material as THREE.MeshStandardMaterial).color.set(to === "prime" ? 0xffffff : 0xffeaf6);
    (this.cloudShadow.material as THREE.MeshStandardMaterial).color.set(to === "prime" ? 0xb3c2d6 : 0xd9b8cf);
    this.waterMat.uniforms.uPastel.value = to === "rainbow" ? 1 : 0;
    this.buildEntities();
    const sp = to === "prime" ? { x: 8, z: 8 } : { x: 10, z: -12 };
    const gy = this.terrainHeight(sp.x, sp.z, to);
    this.pos.set(sp.x, gy + 2.5, sp.z);
    this.vel.set(0, 0, 0);
    this.flying = false;
    this.ensureChunks(1); // sync core so physics has ground immediately
    this.cb.onLog(to === "rainbow"
      ? "The Gate opens. The Dream pours in — pastel light, floating isles, water like candy."
      : "You slip back through the Gate. Solid ground, blue sky, the Rift still crackling on the horizon.", "alert");
  }

  /* ── frame ── */
<<<<<<< HEAD
  private frame(): void {
=======
  private errReported = false;
  private frame(): void {
    try {
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    this.clockT += dt;

    if (this.playing && !this.paused && !this.down) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 4) { this.step(STEP); this.acc -= STEP; steps++; }
      if (steps === 4) this.acc = 0;
    }

    this.ensureChunks(CHUNK_VIEW);
    this.updateEnvironment(dt);
    this.updateRift(dt);
    this.updateGate(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);

    this.statT += dt;
    if (this.statT > 0.25) {
      this.statT = 0;
      this.cb.onStats({
        fps: Math.round(this.fpsEma),
        x: this.pos.x, y: this.pos.y, z: this.pos.z,
        dim: this.dim, mode: this.mode, third: this.third, flying: this.flying,
        hp: this.hp, down: this.down,
      });
    }
<<<<<<< HEAD
=======
    } catch (e) {
      if (!this.errReported) {
        this.errReported = true;
        const msg = e instanceof Error ? (e.stack || e.message) : String(e);
        console.error(msg);
        this.cb.onError?.(msg);
      }
    }
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
  }

  private updateEnvironment(dt: number): void {
    this.dayT = (this.dayT + dt / 240) % 1;
    const elev = Math.sin(this.dayT * Math.PI * 2);
    const day = THREE.MathUtils.clamp(elev * 1.6 + 0.35, 0, 1);
    const isRainbow = this.dim === "rainbow";

    const topDay = new THREE.Color(isRainbow ? 0x9fe8d8 : 0x6fb9f0);
    const botDay = new THREE.Color(isRainbow ? 0xd8ece2 : 0xdceaf2);
    const topNight = new THREE.Color(isRainbow ? 0x1c2a4a : 0x0a1024);
    const botNight = new THREE.Color(isRainbow ? 0x26384a : 0x141d38);
    (this.skyMat.uniforms.uTop.value as THREE.Color).copy(topNight).lerp(topDay, day);
    (this.skyMat.uniforms.uBottom.value as THREE.Color).copy(botNight).lerp(botDay, day);
    (this.scene.fog as THREE.FogExp2).color.copy((this.skyMat.uniforms.uBottom.value as THREE.Color));
    this.sun.intensity = 0.25 + day * 1.5;
    this.hemi.intensity = 0.25 + day * 0.6;
    const sd = this.skyMat.uniforms.uSunDir.value as THREE.Vector3;
    sd.set(0.5, 0.25 + elev * 0.6, 0.3).normalize();
    this.sun.position.set(this.pos.x + sd.x * 150, this.pos.y + Math.max(20, sd.y * 180), this.pos.z + sd.z * 150);
    this.sun.target.position.set(this.pos.x, this.pos.y, this.pos.z);

    // clouds drift
    const cm = this.cloudMesh;
    const M = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.cloudSeeds.length; i++) {
      const c = this.cloudSeeds[i];
      c.x += dt * 1.4;
      const wx = c.x - this.pos.x, wz = c.z - this.pos.z;
      const fx = this.pos.x + ((wx + 420 + 10000) % 840) - 420;
      const fz = this.pos.z + ((wz + 420 + 10000) % 840) - 420;
      v.set(fx, c.y, fz);
      s.set(c.sx, c.sy, c.sz);
      M.compose(v, q, s);
      cm.setMatrixAt(i, M);
      v.y -= c.sy * 0.62;
      s.set(c.sx * 0.96, c.sy * 0.8, c.sz * 0.96);
      M.compose(v, q, s);
      this.cloudShadow.setMatrixAt(i, M);
    }
    cm.instanceMatrix.needsUpdate = true;
    this.cloudShadow.instanceMatrix.needsUpdate = true;

    // keep sky + camera-centered far plane in reach
    const skyMesh = this.scene.children.find((o) => (o as THREE.Mesh).geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
    if (skyMesh) skyMesh.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.waterMat.uniforms.uTime.value = this.clockT;
  }

  private updateRift(dt: number): void {
    if (!this.riftGroup) return;
    const t = this.clockT;
    this.riftFlash = Math.max(0, this.riftFlash - dt * 5);
    const flick = 0.86 + 0.14 * Math.sin(t * 9.1) * Math.sin(t * 3.7);
    this.riftCoreMat.color.setScalar(flick * (1 + this.riftFlash * 0.8));
    this.riftSpriteMat.opacity = (0.4 + 0.1 * Math.sin(t * 5.3)) * (1 + this.riftFlash * 1.4);
    this.riftLight.intensity = 260 * flick * (1 + this.riftFlash * 2.6);
    this.riftLight2.intensity = 130 * (1 + this.riftFlash * 2.2);
    for (let i = 0; i < this.riftPillarMats.length; i++) {
      const base = [0.38, 0.26, 0.16][i] ?? 0.16;
      this.riftPillarMats[i].opacity = base * (0.75 + 0.25 * Math.sin(t * 7.3 + i * 2.1)) * (1 + this.riftFlash * 0.8);
    }
    if (this.riftSparks) {
      const attr = this.riftSparks.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) + this.sparkVel[i] * dt;
        if (y > 6.5) y = -6.5;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
      (this.riftSparks.material as THREE.PointsMaterial).opacity = 0.75 * flick + 0.2 * this.riftFlash;
    }

    // debris orbit
    for (const d of this.debris) {
      d.a += d.w * dt;
      d.mesh.position.set(
        Math.cos(d.a) * d.r,
        d.y0 + Math.sin(t * d.bw) * d.ba,
        Math.sin(d.a) * d.r * 0.6,
      );
      d.mesh.rotation.y += d.spin * dt;
      d.mesh.rotation.x += d.spin * 0.6 * dt;
    }

    // lightning bolts
    this.riftTimer -= dt;
    if (this.riftTimer <= 0) {
      this.riftTimer = 0.3 + Math.random() * 0.6;
      this.spawnBolt();
    }
    for (const b of this.bolts) {
      b.age += dt;
      b.mat.opacity = Math.max(0, 0.95 * (1 - b.age / b.life));
      if (b.age >= b.life) {
        this.scene.remove(b.group);
        b.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
        b.mat.dispose();
      }
    }
    this.bolts = this.bolts.filter((b) => b.age < b.life);
  }

  private boltTarget(): THREE.Vector3 {
    const g = this.riftGroup!;
    const wp = new THREE.Vector3();
    // random point on the silhouette edge
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4;
      wp.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, 0.3);
      if (Math.abs(wp.x) < 6.5 && Math.abs(wp.y) < 6.5) break;
    }
    g.localToWorld(wp);
    return wp;
  }

  private spawnBolt(): void {
    const start = this.boltTarget();
    const end = new THREE.Vector3(
      start.x + (Math.random() - 0.5) * 34,
      start.y + (Math.random() - 0.5) * 10,
      start.z + (Math.random() - 0.5) * 22,
    );
    // occasionally drop to the ground
    if (Math.random() < 0.5) {
      const gy = this.terrainHeight(end.x, end.z, "prime");
      end.y = Math.max(gy + 1, end.y);
    }
    const segs = 9 + Math.floor(Math.random() * 6);
    const pts: THREE.Vector3[] = [start.clone()];
    for (let i = 1; i < segs; i++) {
      const p = start.clone().lerp(end, i / segs);
      p.x += (Math.random() - 0.5) * 1.7;
      p.y += (Math.random() - 0.5) * 1.7;
      p.z += (Math.random() - 0.5) * 1.7;
      pts.push(p);
    }
    pts.push(end.clone());

    const mat = new THREE.MeshBasicMaterial({
      color: 0xeaf2ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const grp = new THREE.Group();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.01) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.06), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(up, dir.normalize());
      grp.add(m);
    }
    this.scene.add(grp);
    this.bolts.push({ group: grp, mat, age: 0, life: 0.22 });
    this.riftFlash = 1;
    this.thunder(0.4 + Math.random() * 0.4);
  }

  private updateGate(dt: number): void {
    if (!this.gateGroup) return;
    this.gateShader.uniforms.uTime.value = this.clockT;
    const pulse = 0.75 + 0.25 * Math.sin(this.clockT * 2.4);
    for (const m of this.gateRimMats) m.color.setRGB(1, 1, 1).multiplyScalar(pulse * 0.9 + 0.1);
    this.gateSpriteMat.opacity = 0.5 + 0.15 * Math.sin(this.clockT * 1.7);
    for (let i = 0; i < this.gateBeamMats.length; i++) {
      this.gateBeamMats[i].opacity = (0.12 + (i % 3) * 0.05) * (0.7 + 0.3 * Math.sin(this.clockT * 1.9 + i * 1.7));
    }
    void dt;
  }

  /* ── camera ── */
  private updateCamera(dt: number): void {
    if (!this.playing) {
      // menu: slow drift around the dimension's landmark
      const t = this.clockT * 0.05;
      const at = this.dim === "prime" ? { x: RIFT_POS.x, z: RIFT_POS.z } : PORTAL_RAINBOW;
      const ry = this.terrainHeight(at.x, at.z, this.dim);
      this.camera.position.set(
        at.x + Math.sin(t) * 42,
        ry + 10 + Math.sin(t * 1.7) * 3,
        at.z + Math.cos(t) * 42,
      );
      this.camera.lookAt(at.x, ry + 7, at.z);
      return;
    }
    if (this.third) {
      const back = 4.2;
      const dir = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      const camPos = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, -back);
      // simple ground clamp
      const gy = this.terrainHeight(camPos.x, camPos.z, this.dim) + 0.4;
      if (camPos.y < gy) camPos.y = gy;
      this.camera.position.lerp(camPos, Math.min(1, dt * 18));
      this.camera.lookAt(this.pos.x, this.pos.y + 1.4, this.pos.z);
    } else {
      this.camera.position.set(this.pos.x, this.pos.y + (this.down ? 2.6 : 1.62), this.pos.z);
      this.camera.rotation.set(0, 0, 0);
      this.camera.rotateY(this.yaw);
      this.camera.rotateX(this.pitch);
    }
  }

  /* ── player step ── */
  private step(dt: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW")) wish.add(forward);
    if (this.keys.has("KeyS")) wish.sub(forward);
    if (this.keys.has("KeyD")) wish.add(right);
    if (this.keys.has("KeyA")) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = this.flying ? (sprint ? 14 : 9) : sprint ? 6.2 : 4.4;

    if (this.flying) {
      this.vel.x = wish.x * speed;
      this.vel.z = wish.z * speed;
      this.vel.y = (this.keys.has("Space") ? 1 : 0) * speed - (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 0 : 0);
      if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) this.vel.y = -speed;
      else if (this.keys.has("Space")) this.vel.y = speed;
      else this.vel.y = 0;
    } else {
      const accel = this.onGround ? 40 : 12;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x * speed, accel, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z * speed, accel, dt);
      this.vel.y -= 26 * dt;
      if (this.vel.y < -42) this.vel.y = -42;
      if (this.keys.has("Space") && this.onGround) this.vel.y = 8.6;
    }

    // integrate with voxel collision, axis by axis
    const hw = 0.3, hh = 1.8;
    const moveAxis = (axis: 0 | 1 | 2, amt: number) => {
      if (amt === 0) return;
      const p = this.pos;
      if (axis === 0) p.x += amt;
      else if (axis === 1) p.y += amt;
      else p.z += amt;
      const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw);
      const y0 = Math.floor(p.y), y1 = Math.floor(p.y + hh);
      const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const b = this.getBlock(x, y, z);
        if (b === B.AIR || b === B.WATER || !BLOCKS[b]?.solid) continue;
        // resolve
        if (axis === 0) p.x = amt > 0 ? x - hw - 0.001 : x + 1 + hw + 0.001;
        if (axis === 1) {
          p.y = amt > 0 ? y - hh - 0.001 : y + 1;
          if (amt < 0) this.land();
          this.vel.y = 0;
        }
        if (axis === 2) p.z = amt > 0 ? z - hw - 0.001 : z + 1 + hw + 0.001;
        return;
      }
    };
    if (this.onGround) this.fallTop = this.pos.y;
    this.onGround = false;
    moveAxis(0, this.vel.x * dt);
    moveAxis(2, this.vel.z * dt);
    moveAxis(1, this.vel.y * dt);
    if (this.pos.y < -20) this.damage(99, "the void");
  }

  private land(): void {
    this.onGround = true;
    const fall = this.fallTop - this.pos.y;
    this.fallTop = this.pos.y;
    if (this.mode === "survival" && fall > 4.5 && !this.flying) {
      this.damage((fall - 4.5) * 1.6, "a long fall");
    }
  }

  private damage(n: number, cause: string): void {
    if (this.mode !== "survival" || this.down) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0;
      this.down = true;
      this.cb.onLog(`You are down — ${cause}. Press R to rise again.`, "alert");
      this.cb.onDown();
    }
  }

  respawn(): void {
    this.hp = 20;
    this.down = false;
    const sp = this.dim === "prime" ? { x: 8, z: 8 } : { x: 10, z: -12 };
    const gy = this.terrainHeight(sp.x, sp.z, this.dim);
    this.pos.set(sp.x, gy + 2, sp.z);
    this.vel.set(0, 0, 0);
    this.cb.onLog("You rise again, whole and unbothered.", "sys");
  }

  /* ── editing ── */
  private camDir(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }
  private camPos(): THREE.Vector3 {
    return this.third
      ? this.camera.position
      : this.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
  }

  breakBlock(): void {
    if (!this.playing || this.paused || this.down) return;
    const o = this.camPos(), d = this.camDir();
    const hit = raycastVoxel((x, y, z) => this.getBlock(x, y, z), o.x, o.y, o.z, d.x, d.y, d.z, 6);
    if (!hit) return;
    const cx = Math.floor(hit.x / CX), cz = Math.floor(hit.z / CZ);
    const rec = this.chunkRec(cx, cz);
    if (!rec) return;
    rec.chunk.set(((hit.x % CX) + CX) % CX, hit.y, ((hit.z % CZ) + CZ) % CZ, B.AIR);
    this.rebuildMesh(rec, cx, cz);
    this.remeshNeighbors(cx, cz, hit);
    this.clickSound(1);
  }

  placeBlock(): void {
    if (!this.playing || this.paused || this.down) return;
    const o = this.camPos(), d = this.camDir();
    const hit = raycastVoxel((x, y, z) => this.getBlock(x, y, z), o.x, o.y, o.z, d.x, d.y, d.z, 6);
    if (!hit) return;
    const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    const cur = this.getBlock(tx, ty, tz);
    if (cur !== B.AIR && cur !== B.WATER) return;
    // don't place inside the player
    const p = this.pos;
    if (tx + 1 > p.x - 0.3 && tx < p.x + 0.3 && tz + 1 > p.z - 0.3 && tz < p.z + 0.3 && ty + 1 > p.y && ty < p.y + 1.8) return;
    const cx = Math.floor(tx / CX), cz = Math.floor(tz / CZ);
    const rec = this.chunkRec(cx, cz);
    if (!rec) return;
    rec.chunk.set(((tx % CX) + CX) % CX, ty, ((tz % CZ) + CZ) % CZ, HOTBAR_BLOCKS[this.hotIdx]);
    this.rebuildMesh(rec, cx, cz);
    this.remeshNeighbors(cx, cz, { x: tx, y: ty, z: tz });
    this.clickSound(0);
  }

  private remeshNeighbors(cx: number, cz: number, hit: { x: number; y: number; z: number }): void {
    const lx = hit.x - cx * CX, lz = hit.z - cz * CZ;
    if (lx === 0) { const r = this.chunkRec(cx - 1, cz); if (r) this.rebuildMesh(r, cx - 1, cz); }
    if (lx === CX - 1) { const r = this.chunkRec(cx + 1, cz); if (r) this.rebuildMesh(r, cx + 1, cz); }
    if (lz === 0) { const r = this.chunkRec(cx, cz - 1); if (r) this.rebuildMesh(r, cx, cz - 1); }
    if (lz === CZ - 1) { const r = this.chunkRec(cx, cz + 1); if (r) this.rebuildMesh(r, cx, cz + 1); }
  }

  interact(): void {
    if (!this.playing || this.paused || this.down) return;
    const at = this.dim === "prime" ? PORTAL_PRIME : PORTAL_RAINBOW;
    const gy = this.terrainHeight(at.x, at.z, this.dim) + 5;
    const d = Math.hypot(at.x - this.pos.x, gy - this.pos.y, at.z - this.pos.z);
    if (d < 5.5) {
      this.portalSound();
      this.switchDimension(this.dim === "prime" ? "rainbow" : "prime");
      return;
    }
    if (this.dim === "prime") {
      const ry = this.terrainHeight(RIFT_POS.x, RIFT_POS.z, "prime") + 8;
      const dr = Math.hypot(RIFT_POS.x - this.pos.x, ry - this.pos.y, RIFT_POS.z - this.pos.z);
      if (dr < 8) this.cb.onLog("The Rift is a wound in the sky. Lightning crawls across its edges. It does not invite you in.", "sys");
    }
  }

  setHot(i: number): void {
    if (i >= 0 && i < HOTBAR_BLOCKS.length) {
      this.hotIdx = i;
      this.cb.onLog(`Holding: ${BLOCKS[HOTBAR_BLOCKS[i]].name}`, "sys");
    }
  }
  cycleHot(n: number): void { this.setHot((this.hotIdx + n + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length); }
  toggleCamera(): void {
    this.third = !this.third;
    this.cb.onLog(this.third ? "Third person — feet on the ground, no drone." : "First person.", "sys");
  }
  toggleFly(): void {
    if (this.mode !== "creative") { this.cb.onLog("Flight is a creative-mode thing. Switch modes to float.", "sys"); return; }
    this.flying = !this.flying;
    this.cb.onLog(this.flying ? "Flight engaged." : "Flight ended.", "sys");
  }
  setMode(m: "creative" | "survival"): void {
    this.mode = m;
    this.hp = 20;
    this.down = false;
    this.flying = false;
    this.cb.onLog(m === "creative" ? "Creative mode — build without fear." : "Survival mode — the world gets back what you take.", "sys");
  }
  getMode(): "creative" | "survival" { return this.mode; }

  /* ── lifecycle + input ── */
  begin(mode: "creative" | "survival"): void {
    this.playing = true;
    this.setMode(mode);
    this.canvas.requestPointerLock();
  }
  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.canvas.requestPointerLock();
  }
  toMenu(): void { this.playing = false; }

  private onKey = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    this.keys.add(e.code);
    if (!this.playing) return;
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 8) this.setHot(n - 1);
    }
    if (e.code === "KeyV") this.toggleCamera();
    if (e.code === "KeyF") this.toggleFly();
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyR" && this.down) this.respawn();
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };
  private onMouse = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0024, -1.5, 1.5);
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.playing || this.paused) return;
    if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock(); return; }
    if (e.button === 0) this.breakBlock();
    if (e.button === 2) this.placeBlock();
  };
  private onWheel = (e: WheelEvent): void => {
    if (!this.playing || this.paused) return;
    this.cycleHot(e.deltaY > 0 ? 1 : -1);
  };
  private onResize = (): void => this.resize();

  private attachInput(): void {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouse);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  resize(): void {
    if (this.disposed) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio));
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouse);
    window.removeEventListener("resize", this.onResize);
    this.renderer?.dispose();
    this.actx?.close().catch(() => undefined);
  }

  /* ── tiny synth ── */
  private ac(): AudioContext | null {
    try {
      if (!this.actx) this.actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.actx.state === "suspended") void this.actx.resume();
      return this.actx;
    } catch { return null; }
  }
  private thunder(loud: number): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = 0.9;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * loud, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + len);
  }
  private portalSound(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(920, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.75);
  }
  private clickSound(breaking: number): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = breaking ? 140 : 240;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.08);
  }
}
