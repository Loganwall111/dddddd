// FLIP/PIC fluid engine on raw WebGPU (runs on the same GPUDevice as three's
// WebGPURenderer). MAC staggered grid + red-black Gauss-Seidel pressure +
// hybrid FLIP/PIC particle transport. No DOM dependencies; given a GPUDevice
// it can also be exercised headlessly.

import {
  MAX_PARTICLES, MAX_BODIES, MAX_FIELDS, MAX_WORKGROUPS,
  WGSL_CLEAR, WGSL_SPLAT_DENSITY, WGSL_ADVECT_U, WGSL_ADVECT_V, WGSL_ADVECT_W,
  WGSL_FORCES_U, WGSL_FORCES_V, WGSL_FORCES_W, WGSL_PIC, WGSL_DIVERGENCE,
  WGSL_PRESSURE_RED, WGSL_PRESSURE_BLACK, WGSL_PROJECT, WGSL_FLIP,
  WGSL_ADVECT_PARTICLES, WGSL_SPLAT_RENDER, WGSL_UPLOAD_FLUID,
  WGSL_STATS_A, WGSL_STATS_B,
} from "./shaders";

export interface FlipSettings {
  grid: number;          // n (cubic cells), 48..128
  pressureIter: number;  // red-black GS iterations
  flipRatio: number;     // 0..1 (1 = pure FLIP, 0 = pure PIC)
  vorticity: number;     // confinement strength
  buoyancy: number;      // gravity scale per unit water concentration
  steamLift: number;
  damping: number;
}

export const DEFAULT_FLIP_SETTINGS: FlipSettings = {
  grid: 96, pressureIter: 20, flipRatio: 0.85, vorticity: 1.5,
  buoyancy: 1.0, steamLift: 3.0, damping: 0.1,
};

export interface FlipStepParams {
  gravityX: number; gravityY: number; gravityZ: number;
  windX: number; windY: number; windZ: number; windDrag: number;
  ambientC: number;
  camX: number; camY: number; camZ: number;
  terrainHeight: (x: number, z: number) => number;
  bodies: { x: number; y: number; z: number; radius: number; vx: number; vy: number; vz: number }[];
  wells: { x: number; y: number; z: number; radius: number; strength: number; softening: number }[];
  vortices: { x: number; y: number; z: number; radius: number; swirl: number; inward: number; vertical: number; axisY: number }[];
  holes: { x: number; y: number; z: number; mass: number; horizon: number }[];
}

export interface FlipStats {
  maxSpeed: number; meanSpeed: number; alive: number; ms: number;
}

const FRAME_FLOATS = 24;
const BODY_FLOATS = 8;
const FIELD_FLOATS = 8;

export class FlipEngine {
  readonly n: number;
  readonly h: number;
  readonly originX = -60;
  readonly originY = -20;
  readonly originZ = -60;
  readonly fluidTexture: GPUTexture;
  readonly stats: FlipStats = { maxSpeed: 0, meanSpeed: 0, alive: 0, ms: 0 };

  private device: GPUDevice;
  private queue: GPUQueue;
  private grid: GPUBuffer;
  private parts: GPUBuffer;
  private terrain: GPUBuffer;
  private frame: GPUBuffer;
  private gridOff: GPUBuffer;
  private bodies: GPUBuffer;
  private wells: GPUBuffer;
  private vortices: GPUBuffer;
  private holes: GPUBuffer;
  private statsBuf: GPUBuffer;
  private readback: GPUBuffer;
  private pipelines: GPUPipeline[] = [];
  private bgl0: GPUBindGroupLayout;
  private bgl1: GPUBindGroupLayout;
  private bgl2: GPUBindGroupLayout;
  private groups: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
  private deadBlock: Float32Array;
  private cursor = 0;
  private particleCount = 0;
  private terrainDirty = true;
  private settings: FlipSettings;
  private readbackPending: Promise<void> | null = null;
  private disposed = false;

  private static gridOffsets(n: number) {
    const cell = n * n * n;
    const sizeU = (n + 1) * n * n;
    const sizeV = n * (n + 1) * n;
    const sizeW = n * n * (n + 1);
    let off = 0;
    const o: Record<string, number> = {};
    const ranges: [string, number][] = [["U", sizeU], ["V", sizeV], ["W", sizeW], ["U0", sizeU], ["V0", sizeV], ["W0", sizeW],
      ["Div", cell], ["P", cell], ["DensW", cell], ["DensS", cell], ["R", cell], ["G", cell], ["B", cell], ["A", cell]];
    for (const [k, sz] of ranges) {
      o[k] = off; off += sz;
    }
    return { o, total: off };
  }

  constructor(device: GPUDevice, settings: FlipSettings) {
    this.device = device;
    this.queue = device.queue;
    this.settings = { ...settings };
    this.n = Math.max(24, Math.min(128, settings.grid | 0));
    this.h = 120 / this.n;
    const { o, total } = FlipEngine.gridOffsets(this.n);
    this.gridOffLayout = o;

    const mk = (size: number, usage: GPUBufferUsageFlags, label: string) =>
      device.createBuffer({ size, usage, label });

    this.grid = mk(total * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "flip.grid");
    this.parts = mk(MAX_PARTICLES * 8 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "flip.parts");
    this.terrain = mk(this.n * this.n * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "flip.terrain");
    this.frame = mk(FRAME_FLOATS * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.frame");
    this.gridOff = mk(24 * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.gridoff");
    this.bodies = mk(MAX_BODIES * BODY_FLOATS * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.bodies");
    this.wells = mk(MAX_FIELDS * FIELD_FLOATS * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.wells");
    this.vortices = mk(MAX_FIELDS * FIELD_FLOATS * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.vortices");
    this.holes = mk(MAX_FIELDS * FIELD_FLOATS * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "flip.holes");
    this.statsBuf = mk((3 * MAX_WORKGROUPS + 3) * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, "flip.stats");
    this.readback = mk(12, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, "flip.readback");

    this.fluidTexture = device.createTexture({
      size: [this.n, this.n, this.n],
      format: "rgba32f",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.SAMPLE | GPUTextureUsage.COPY_SRC,
      label: "flip.fluid",
    });

    // static uniforms
    const go = new Uint32Array(24);
    go[0] = o.U; go[1] = o.V; go[2] = o.W; go[3] = o.U0; go[4] = o.V0; go[5] = o.W0;
    go[6] = o.Div; go[7] = o.P; go[8] = o.DensW; go[9] = o.DensS;
    go[10] = o.R; go[11] = o.G; go[12] = o.B; go[13] = o.A;
    go[14] = this.n; go[15] = this.n + 1; go[16] = this.n + 1; go[17] = this.n + 1;
    this.queue.writeBuffer(this.gridOff, 0, go as unknown as GPUAllowSharedBufferSource);
    this.queue.fillBuffer(this.bodies, 0, this.bodies.size, 0);
    this.queue.fillBuffer(this.wells, 0, this.wells.size, 0);
    this.queue.fillBuffer(this.vortices, 0, this.vortices.size, 0);
    this.queue.fillBuffer(this.holes, 0, this.holes.size, 0);
    this.queue.fillBuffer(this.statsBuf, 0, this.statsBuf.size, 0);

    // particle buffer starts fully dead (fluidId = -1 in the w component)
    this.deadBlock = new Float32Array(MAX_PARTICLES * 8);
    for (let i = 0; i < MAX_PARTICLES; i++) this.deadBlock[i * 8 + 3] = -1;
    this.queue.writeBuffer(this.parts, 0, this.deadBlock as unknown as GPUAllowSharedBufferSource);

    // bind group layouts
    this.bgl0 = device.createBindGroupLayout({
      label: "flip.bgl0",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });
    this.bgl1 = device.createBindGroupLayout({
      label: "flip.bgl1",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    this.bgl2 = device.createBindGroupLayout({
      label: "flip.bgl2",
      entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, texture: {} }],
    });
    const g0 = device.createBindGroup({ layout: this.bgl0, entries: [
      { binding: 0, resource: { buffer: this.frame } },
      { binding: 1, resource: { buffer: this.bodies } },
      { binding: 2, resource: { buffer: this.wells } },
      { binding: 3, resource: { buffer: this.vortices } },
      { binding: 4, resource: { buffer: this.holes } },
    ]});
    const g1 = device.createBindGroup({ layout: this.bgl1, entries: [
      { binding: 0, resource: { buffer: this.grid } },
      { binding: 1, resource: { buffer: this.parts } },
      { binding: 2, resource: { buffer: this.gridOff } },
      { binding: 3, resource: { buffer: this.terrain } },
      { binding: 4, resource: { buffer: this.statsBuf } },
    ]});
    const g2 = device.createBindGroup({ layout: this.bgl2, entries: [
      { binding: 0, resource: this.fluidTexture.createView() },
    ]});
    this.groups = [g0, g1, g2];

    const src = (code: string) => device.createShaderModule({ label: "flip.wgsl", code });
    const pipeline = (code: string, label: string) => {
      const pl = device.createComputePipeline({
        layout: [this.bgl0, this.bgl1, this.bgl2],
        compute: { module: src(code), entryPoint: "main" },
        label,
      });
      this.pipelines.push(pl);
      return pl;
    };
    this.plClear = pipeline(WGSL_CLEAR, "flip.clear");
    this.plSplatD = pipeline(WGSL_SPLAT_DENSITY, "flip.splatD");
    this.plAdvU = pipeline(WGSL_ADVECT_U, "flip.advU");
    this.plAdvV = pipeline(WGSL_ADVECT_V, "flip.advV");
    this.plAdvW = pipeline(WGSL_ADVECT_W, "flip.advW");
    this.plForU = pipeline(WGSL_FORCES_U, "flip.forU");
    this.plForV = pipeline(WGSL_FORCES_V, "flip.forV");
    this.plForW = pipeline(WGSL_FORCES_W, "flip.forW");
    this.plPic = pipeline(WGSL_PIC, "flip.pic");
    this.plDiv = pipeline(WGSL_DIVERGENCE, "flip.div");
    this.plRed = pipeline(WGSL_PRESSURE_RED, "flip.red");
    this.plBlack = pipeline(WGSL_PRESSURE_BLACK, "flip.black");
    this.plProj = pipeline(WGSL_PROJECT, "flip.proj");
    this.plFlip = pipeline(WGSL_FLIP, "flip.flip");
    this.plAdvP = pipeline(WGSL_ADVECT_PARTICLES, "flip.advP");
    this.plSplatR = pipeline(WGSL_SPLAT_RENDER, "flip.splatR");
    this.plUpload = pipeline(WGSL_UPLOAD_FLUID, "flip.upload");
    this.plStatsA = pipeline(WGSL_STATS_A, "flip.statsA");
    this.plStatsB = pipeline(WGSL_STATS_B, "flip.statsB");

    device.onuncapturederror = (e) => console.error("[FlipEngine] GPU error:", e.error);
  }

  private gridOffLayout: Record<string, number>;
  private plClear!: GPUPipeline; private plSplatD!: GPUPipeline;
  private plAdvU!: GPUPipeline; private plAdvV!: GPUPipeline; private plAdvW!: GPUPipeline;
  private plForU!: GPUPipeline; private plForV!: GPUPipeline; private plForW!: GPUPipeline;
  private plPic!: GPUPipeline; private plDiv!: GPUPipeline;
  private plRed!: GPUPipeline; private plBlack!: GPUPipeline; private plProj!: GPUPipeline;
  private plFlip!: GPUPipeline; private plAdvP!: GPUPipeline;
  private plSplatR!: GPUPipeline; private plUpload!: GPUPipeline;
  private plStatsA!: GPUPipeline; private plStatsB!: GPUPipeline;

  /** Spawn a box of particles (recycles slots via a cursor). */
  spawnBox(
    minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
    fluidId: number, tempC: number, maxCount: number, spacing = 0.4,
  ): number {
    if (this.disposed) return 0;
    const pos = new Float32Array(maxCount * 4);
    const vel = new Float32Array(maxCount * 4);
    let i = 0;
    const s = spacing;
    for (let x = minX; x <= maxX && i < maxCount; x += s) {
      for (let y = minY; y <= maxY && i < maxCount; y += s) {
        for (let z = minZ; z <= maxZ && i < maxCount; z += s) {
          // deterministic jitter so the lattice doesn't lock
          const jx = ((i * 7919) % 1000) / 1000 - 0.5;
          const jy = ((i * 104729) % 1000) / 1000 - 0.5;
          pos[i * 4 + 0] = x + jx * 0.12;
          pos[i * 4 + 1] = y + jy * 0.12;
          pos[i * 4 + 2] = z + (jx + jy) * 0.06;
          pos[i * 4 + 3] = fluidId;
          vel[i * 4 + 3] = tempC;
          i++;
        }
      }
    }
    const n = i;
    if (n === 0) return 0;
    const start = this.cursor % MAX_PARTICLES;
    const velRegion = MAX_PARTICLES * 16; // bytes: MAX_PARTICLES particles * 16B
    // write in up to two contiguous segments if the cursor wraps
    const first = Math.min(n, MAX_PARTICLES - start);
    this.queue.writeBuffer(this.parts, start * 16, pos.subarray(0, first * 4) as unknown as GPUAllowSharedBufferSource);
    this.queue.writeBuffer(this.parts, velRegion + start * 16, vel.subarray(0, first * 4) as unknown as GPUAllowSharedBufferSource);
    if (n > first) {
      this.queue.writeBuffer(this.parts, 0, pos.subarray(first * 4, n * 4) as unknown as GPUAllowSharedBufferSource);
      this.queue.writeBuffer(this.parts, velRegion, vel.subarray(first * 4, n * 4) as unknown as GPUAllowSharedBufferSource);
      this.particleCount = MAX_PARTICLES;
    } else {
      this.particleCount = Math.max(this.particleCount, start + n);
    }
    this.cursor = (start + n) % MAX_PARTICLES;
    return n;
  }

  /** Kill all particles (e.g. on scenario change). */
  clearParticles(): void {
    if (this.disposed) return;
    this.queue.writeBuffer(this.parts, 0, this.deadBlock as unknown as GPUAllowSharedBufferSource);
    this.cursor = 0;
  }

  setSettings(partial: Partial<FlipSettings>): void {
    Object.assign(this.settings, partial);
  }

  get particleCountLive(): number { return this.stats.alive; }

  step(dt: number, time: number, params: FlipStepParams): void {
    if (this.disposed) return;
    const t0 = performance.now();
    const { n, h } = this;
    const st = this.settings;

    // frame uniforms
    const f = new Float32Array(FRAME_FLOATS);
    f[0] = dt; f[1] = time; f[2] = n; f[3] = h;
    f[4] = this.originX; f[5] = this.originY; f[6] = this.originZ;
    f[7] = params.gravityX; f[8] = params.gravityY; f[9] = params.gravityZ;
    f[10] = params.windX; f[11] = params.windY; f[12] = params.windZ; f[13] = params.windDrag;
    f[14] = st.buoyancy; f[15] = st.steamLift; f[16] = st.damping;
    f[17] = st.flipRatio; f[18] = st.vorticity;
    f[23] = params.ambientC;
    f[20] = params.camX; f[21] = params.camY; f[22] = params.camZ;
    new Uint32Array(f.buffer, f.byteOffset + 19 * 4, 1)[0] = this.particleCount;
    this.queue.writeBuffer(this.frame, 0, f as unknown as GPUAllowSharedBufferSource);

    // terrain column heights
    if (this.terrainDirty) {
      const th = new Float32Array(n * n);
      for (let k = 0; k < n; k++) {
        const z = this.originZ + (k + 0.5) * h;
        for (let i = 0; i < n; i++) {
          th[k * n + i] = params.terrainHeight(this.originX + (i + 0.5) * h, z);
        }
      }
      this.queue.writeBuffer(this.terrain, 0, th as unknown as GPUAllowSharedBufferSource);
      this.terrainDirty = false;
    }

    // field uniforms
    this.writeFieldBuf(this.bodies, params.bodies, (o, b) => {
      this.bodiesFloats[o + 0] = b.x; this.bodiesFloats[o + 1] = b.y; this.bodiesFloats[o + 2] = b.z;
      this.bodiesFloats[o + 3] = b.radius; this.bodiesFloats[o + 4] = b.vx;
      this.bodiesFloats[o + 5] = b.vy; this.bodiesFloats[o + 6] = b.vz;
    });
    this.writeFieldBuf(this.wells, params.wells, (o, b) => {
      this.wellsFloats[o + 0] = b.x; this.wellsFloats[o + 1] = b.y; this.wellsFloats[o + 2] = b.z;
      this.wellsFloats[o + 3] = b.radius; this.wellsFloats[o + 4] = b.strength; this.wellsFloats[o + 5] = b.softening;
    });
    this.writeFieldBuf(this.vortices, params.vortices, (o, b) => {
      this.vorticesFloats[o + 0] = b.x; this.vorticesFloats[o + 1] = b.y; this.vorticesFloats[o + 2] = b.z;
      this.vorticesFloats[o + 3] = b.radius; this.vorticesFloats[o + 4] = b.swirl;
      this.vorticesFloats[o + 5] = b.inward; this.vorticesFloats[o + 6] = b.vertical; this.vorticesFloats[o + 7] = b.axisY;
    });
    this.writeFieldBuf(this.holes, params.holes, (o, b) => {
      this.holesFloats[o + 0] = b.x; this.holesFloats[o + 1] = b.y; this.holesFloats[o + 2] = b.z;
      this.holesFloats[o + 3] = b.mass; this.holesFloats[o + 4] = b.horizon;
    });
    // copy grid -> old copies (FLIP needs the previous advected field)
    const o = this.gridOffLayout;
    const sizeU = (n + 1) * n * n;
    const sizeV = n * (n + 1) * n;
    const sizeW = n * n * (n + 1);
    this.queue.copyBufferToBuffer(this.grid, o.U * 4, this.grid, o.U0 * 4, sizeU * 4);
    this.queue.copyBufferToBuffer(this.grid, o.V * 4, this.grid, o.V0 * 4, sizeV * 4);
    this.queue.copyBufferToBuffer(this.grid, o.W * 4, this.grid, o.W0 * 4, sizeW * 4);

    const g4 = Math.ceil(n / 4);
    const gp = Math.ceil(MAX_PARTICLES / 128);
    const enc = this.device.createCommandEncoder({ label: "flip.frame" });
    const pass = enc.beginComputePass();
    const dispatch = (pl: GPUPipeline, x: number, y = 1, z = 1) => {
      pass.setPipeline(pl);
      pass.setBindGroup(0, this.groups[0]);
      pass.setBindGroup(1, this.groups[1]);
      pass.setBindGroup(2, this.groups[2]);
      pass.dispatchWorkgroups(x, y, z);
    };
    dispatch(this.plClear, g4, g4, g4);
    dispatch(this.plSplatD, gp);
    dispatch(this.plAdvU, g4, g4, g4);
    dispatch(this.plAdvV, g4, g4, g4);
    dispatch(this.plAdvW, g4, g4, g4);
    dispatch(this.plForU, g4, g4, g4);
    dispatch(this.plForV, g4, g4, g4);
    dispatch(this.plForW, g4, g4, g4);
    dispatch(this.plPic, gp);
    dispatch(this.plDiv, g4, g4, g4);
    const iters = Math.max(1, Math.min(48, st.pressureIter | 0));
    for (let it = 0; it < iters; it++) {
      dispatch(this.plRed, g4, g4, g4);
      dispatch(this.plBlack, g4, g4, g4);
    }
    dispatch(this.plProj, g4, g4, g4);
    dispatch(this.plFlip, gp);
    dispatch(this.plAdvP, gp);
    dispatch(this.plSplatR, gp);
    dispatch(this.plUpload, g4, g4, g4);
    dispatch(this.plStatsA, gp);
    dispatch(this.plStatsB, 1);
    pass.finish();
    this.queue.submit([enc.finish()]);

    // async readback of [maxSpeed, alive, meanSpeed]
    this.queue.copyBufferToBuffer(this.statsBuf, (3 * MAX_WORKGROUPS) * 4, this.readback, 0, 12);
    if (this.readbackPending) this.readbackPending = null;
    const rb = this.readback;
    this.readbackPending = rb.mapAsync(GPUMapMode.READ).then(() => {
      const arr = new Float32Array(rb.getMappedRange().slice(0, 12));
      this.stats.maxSpeed = arr[0];
      this.stats.alive = arr[1];
      this.stats.meanSpeed = arr[2];
      rb.unmap();
      this.readbackPending = null;
    }).catch(() => { this.readbackPending = null; });
    this.stats.ms = performance.now() - t0;
  }

  private bodiesFloats = new Float32Array(MAX_BODIES * BODY_FLOATS);
  private wellsFloats = new Float32Array(MAX_FIELDS * FIELD_FLOATS);
  private vorticesFloats = new Float32Array(MAX_FIELDS * FIELD_FLOATS);
  private holesFloats = new Float32Array(MAX_FIELDS * FIELD_FLOATS);

  private writeFieldBuf(buf: GPUBuffer, list: unknown[], fill: (o: number, b: any) => void): void {
    const target = buf === this.bodies ? this.bodiesFloats : buf === this.wells ? this.wellsFloats
      : buf === this.vortices ? this.vorticesFloats : this.holesFloats;
    target.fill(0);
    const cnt = Math.min(list.length, target.length / FIELD_FLOATS);
    for (let i = 0; i < cnt; i++) fill(i * FIELD_FLOATS, list[i]);
    this.queue.writeBuffer(buf, 0, target as unknown as GPUAllowSharedBufferSource);
  }

  /** Force a terrain re-upload next step. */
  markTerrainDirty(): void { this.terrainDirty = true; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pl of this.pipelines) pl.destroy();
    for (const b of [this.grid, this.parts, this.terrain, this.frame, this.gridOff, this.bodies,
      this.wells, this.vortices, this.holes, this.statsBuf, this.readback]) b.destroy();
    this.fluidTexture.destroy();
    this.bgl0.destroy(); this.bgl1.destroy(); this.bgl2.destroy();
    this.groups.forEach((g) => g.destroy());
  }
}
