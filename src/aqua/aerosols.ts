// Generalized aerosol pool: spray, mist, steam, smoke, dust, embers, sparks.
// One CPU-simulated pool rendered as a single GPU point cloud (no per-particle
// objects, no GC churn). Two instances: alpha-blended smoke + additive fire.

import * as THREE from "three";

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aData; // size, alpha, seed
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
uniform float uPixelRatio;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aData.y;
  vSeed = aData.z;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 0.1);
  gl_PointSize = clamp(aData.x * uScale * uPixelRatio / dist, 0.0, 220.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float n = fract(sin(vSeed * 12.9898) * 43758.5453);
  float soft = smoothstep(1.0, 0.25 + n * 0.2, d);
  if (soft * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vColor, soft * vAlpha);
}
`;

export interface AerosolSpawn {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number;
  grow: number;
  r: number; g: number; b: number;
  alpha: number;
  grav: number;
  drag: number;
}

export class AerosolSystem {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private dat: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private grow: Float32Array;
  private alpha0: Float32Array;
  private grav: Float32Array;
  private dragK: Float32Array;
  private cursor = 0;
  private activeCount = 0;
  private readonly cap: number;

  constructor(capacity: number, additive: boolean) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.dat = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.dragK = new Float32Array(capacity);
    this.pos.fill(0);
    for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -1000;
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("aData", new THREE.BufferAttribute(this.dat, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPixelRatio: { value: 1 },
        uScale: { value: 900 },
      },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 15;
  }

  setPixelRatio(pr: number, heightPx: number): void {
    this.mat.uniforms.uPixelRatio.value = pr;
    this.mat.uniforms.uScale.value = heightPx * 0.5;
  }

  spawn(s: AerosolSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = s.x; this.pos[i * 3 + 1] = s.y; this.pos[i * 3 + 2] = s.z;
    this.vel[i * 3] = s.vx; this.vel[i * 3 + 1] = s.vy; this.vel[i * 3 + 2] = s.vz;
    this.col[i * 3] = s.r; this.col[i * 3 + 1] = s.g; this.col[i * 3 + 2] = s.b;
    this.life[i] = s.life; this.maxLife[i] = s.life;
    this.size0[i] = s.size; this.grow[i] = s.grow;
    this.alpha0[i] = s.alpha;
    this.grav[i] = s.grav; this.dragK[i] = s.drag;
    this.dat[i * 3 + 2] = Math.random() * 100;
    this.activeCount = Math.min(this.activeCount + 1, this.cap);
  }

  burst(x: number, y: number, z: number, count: number, base: Partial<AerosolSpawn> & { speed?: number; up?: number }): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const sp = (base.speed ?? 4) * (0.3 + r);
      this.spawn({
        x: x + (Math.random() - 0.5) * (base.size ?? 1),
        y, z: z + (Math.random() - 0.5) * (base.size ?? 1),
        vx: Math.cos(a) * sp, vy: (base.up ?? 2) * (0.4 + Math.random()), vz: Math.sin(a) * sp,
        life: base.life ?? 1.2, size: base.size ?? 1, grow: base.grow ?? 1,
        r: base.r ?? 1, g: base.g ?? 1, b: base.b ?? 1,
        alpha: base.alpha ?? 0.5, grav: base.grav ?? -1, drag: base.drag ?? 1.5,
      });
    }
  }

  update(dt: number, windX: number, windY: number, windZ: number): void {
    const n = this.cap;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1000;
        this.dat[i * 3 + 1] = 0;
        continue;
      }
      const d = 1 - Math.min(0.95, this.dragK[i] * dt);
      this.vel[i * 3] = this.vel[i * 3] * d + windX * dt * 0.6;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + (windY + this.grav[i]) * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * d + windZ * dt * 0.6;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.dat[i * 3] = this.size0[i] * (1 + this.grow[i] * t);
      this.dat[i * 3 + 1] = this.alpha0[i] * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aData") as THREE.BufferAttribute).needsUpdate = true;
  }

  get active(): number {
    return this.activeCount;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
