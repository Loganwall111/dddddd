import {
  Engine, Scene, Vector3, Matrix, Quaternion,
  StandardMaterial, Texture, Color3, DynamicTexture, MeshBuilder, Mesh,
  ShadowGenerator, PointLight, Color4, CubeTexture, FresnelParameters, UniversalCamera,
} from "@babylonjs/core";
import { BLOCKS, BlockId } from "../blocks/blocks";
import { generateBlockAtlas } from "../blocks/textureGen";
import { WorldManager } from "../world/worldManager";
import { PlayerController } from "../player/player";
import { UIManager } from "../ui/ui";
import { Inventory } from "../inventory/inventory";
import { AudioSystem } from "../audio/audio";
import { SkySystem } from "../rendering/sky";
import { DIMENSIONS, findSpawnY, DimensionDef } from "../dimensions/dimensions";
import { detonateTNT } from "../explosions/explosions";
import { listWorlds, loadWorldMeta, saveWorldMeta, newWorldId, seedFromString, saveChunks, loadChunks, deleteWorld, SavedWorld } from "../persistence/storage";
import { WorldType, DimensionId } from "../world/generator";
import { CHUNK_HEIGHT, SEA_LEVEL } from "../world/chunk";
import { DropSystem } from "../entities/drops";
import { MobManager } from "../entities/mobManager";
import { FurnaceSystem } from "../crafting/furnace";
import { WeatherSystem } from "../world/weather";
import { DragonBoss } from "../entities/boss";
import { ChestSystem } from "../inventory/chest";
import { NetSession, Advert } from "../net/net";
import { HumanoidModel, FirstPersonArm } from "../entities/playerModel";
import { buildHumanoidSkin, HumanoidSkinPack } from "../entities/skins";

export interface GameStartOpts {
  name: string;
  seedStr: string;
  gameMode: "creative" | "survival";
  worldType: WorldType;
  existingId?: string;
  host?: boolean;
  hostName?: string;
}

export class Game {
  canvas: HTMLCanvasElement;
  engine!: Engine;
  scene!: Scene;
  ui!: UIManager;
  audio!: AudioSystem;
  world!: WorldManager;
  player!: PlayerController;
  inventory!: Inventory;
  sky!: SkySystem;
  solidMat!: StandardMaterial;
  waterMat!: StandardMaterial;
  blockAtlas!: DynamicTexture;
  waterTexture!: DynamicTexture;
  selectionOutline!: Mesh;
  seOutlineMat!: StandardMaterial;
  drops!: DropSystem;
  mobManager!: MobManager;
  furnaces!: FurnaceSystem;
  weather!: WeatherSystem;
  chests!: ChestSystem;
  boss: DragonBoss | null = null;
  private hungerTimer = 0;
  private fallStartY: number | null = null;
  running = false;
  currentWorldId: string | null = null;
  currentMeta: Partial<SavedWorld> | null = null;
  autoSaveTimer = 0;
  lastTime = 0;
  cameraShake = 0;
  net = new NetSession();
  private peerModels = new Map<string, HumanoidModel>();
  private remoteSkin!: HumanoidSkinPack;
  private playerSkin!: HumanoidSkinPack;
  private posSendTimer = 0;
  xp = 0;

  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }

  private async createEngine(): Promise<Engine> {
    const opts = { useHighPrecisionMatrix: true, stencil: true, antialias: true, preserveDrawingBuffer: false } as any;
    // Prefer WebGPU when the browser supports it; fall back to WebGL2/WebGL.
    const nav = navigator as any;
    if (nav.gpu) {
      try {
        const { WebGPUEngine } = await import("@babylonjs/core");
        const gpu = new WebGPUEngine(this.canvas, opts);
        await gpu.initAsync();
        console.info("[Mass Awakening] Using WebGPU renderer");
        return gpu as unknown as Engine;
      } catch (e) {
        console.warn("[Mass Awakening] WebGPU init failed, falling back to WebGL:", e);
      }
    }
    const eng = new Engine(this.canvas, true, opts, true);
    console.info(`[Mass Awakening] Using WebGL renderer (WebGL2=${eng.webGLVersion === 2})`);
    return eng;
  }

  async init() {
    this.engine = await this.createEngine();
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.45,0.65,0.95,1);
    this.scene.fogEnabled = true;
    this.scene.autoClear = true;

    // Generate atlas and build materials
    const { atlas } = generateBlockAtlas();
    this.blockAtlas = new DynamicTexture("blockAtlas", { width: atlas.width, height: atlas.height } as any, this.scene, false);
    // DynamicTexture.getContext() returns CanvasRenderingContext2D
    const ctx = this.blockAtlas.getContext() as CanvasRenderingContext2D;
    (ctx as any).drawImage(atlas, 0, 0);
    this.blockAtlas.update(false);
    this.blockAtlas.hasAlpha = true;
    this.blockAtlas.uAng = 0; this.blockAtlas.vAng = 0; this.blockAtlas.wAng = 0;
    this.blockAtlas.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.blockAtlas.wrapV = Texture.CLAMP_ADDRESSMODE;
    // Mag filter nearest to preserve pixel look
    this.blockAtlas.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);

    this.solidMat = new StandardMaterial("solidMat", this.scene);
    this.solidMat.diffuseTexture = this.blockAtlas;
    this.solidMat.specularColor = new Color3(0.05,0.05,0.05);
    this.solidMat.specularPower = 64;
    (this.solidMat as any).useVertexColor = true;
    this.solidMat.backFaceCulling = false; // safety: mesher winding may vary; faces are pre-culled anyway
    this.solidMat.twoSidedLighting = true;

    // Water gets its own small repeating texture (a single water tile) so we can
    // animate UV offsets without disturbing the shared block atlas.
    const waterCanvas = document.createElement("canvas");
    waterCanvas.width = 64; waterCanvas.height = 64;
    const wctx = waterCanvas.getContext("2d")!;
    wctx.imageSmoothingEnabled = false;
    // tile index 10 = water tile in the atlas (row 0, col 10)
    wctx.drawImage(atlas, 10 * 16, 0, 16, 16, 0, 0, 64, 64);
    this.waterTexture = new DynamicTexture("waterTex", { width: 64, height: 64 } as any, this.scene, false);
    const wtctx = this.waterTexture.getContext() as CanvasRenderingContext2D;
    (wtctx as any).drawImage(waterCanvas, 0, 0);
    this.waterTexture.update(false);
    this.waterTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    this.waterTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.waterTexture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);

    this.waterMat = new StandardMaterial("waterMat", this.scene);
    this.waterMat.diffuseTexture = this.waterTexture;
    this.waterMat.alpha = 0.72;
    this.waterMat.backFaceCulling = false;
    (this.waterMat as any).separateCullingPass = true;
    (this.waterMat as any).useVertexColor = true;
    this.waterMat.diffuseColor = new Color3(0.3,0.5,0.95);
    this.waterMat.specularColor = new Color3(0.8,0.9,1.0);
    this.waterMat.specularPower = 128;
    // Subtle fresnel so glancing angles look brighter/foamier
    this.waterMat.emissiveFresnelParameters = new FresnelParameters();
    this.waterMat.emissiveFresnelParameters.bias = 0.05;
    this.waterMat.emissiveFresnelParameters.power = 2;
    this.waterMat.emissiveFresnelParameters.leftColor = new Color3(0.2,0.35,0.55);
    this.waterMat.emissiveFresnelParameters.rightColor = new Color3(0.05,0.1,0.2);

    // Audio
    this.audio = new AudioSystem();

    // UI
    this.ui = new UIManager(document.getElementById("ui-root")!, {
      onStartWorld: (opts) => this.startWorld(opts),
      onDeleteWorld: async (id) => { await deleteWorld(id); this.showMainMenu(); },
      onResume: () => this.resumeFromPause(),
      onQuitToMenu: () => this.quitToMenu(),
      onTogglePause: () => this.togglePause(),
      onToggleInventory: () => this.toggleInventory(),
      onSelectSlot: (i) => { if (this.player) this.player.state.selectedSlot = i; if (this.inventory) this.inventory.setSelectedSlot(i); this.ui?.renderHotbar(); },
      onToggleFlight: () => { this.player?.toggleFlight(); this.audio.uiClick(); },
      onGameModeToggle: () => { this.toggleGameMode(); },
      onSettingsApply: (s) => this.applySettings(s),
      onToggleView: () => this.cycleView(),
      onJoinWorld: (name, advert) => this.joinNetWorld(name, advert),
    });

    // Surface runtime errors visibly instead of a silent black screen.
    const showErr = (msg: string) => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999;background:#400;color:#fcc;padding:8px 14px;font:12px monospace;border:2px solid #f00;max-width:80vw;white-space:pre-wrap;pointer-events:auto;";
      el.textContent = "ERROR: " + msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 12000);
      console.error("[Mass Awakening]", msg);
    };
    window.addEventListener("error", (e) => showErr(e.message));
    window.addEventListener("unhandledrejection", (e) => showErr(String((e as any).reason?.message ?? e.reason)));

    this.playerSkin = buildHumanoidSkin(this.scene, 0);
    this.remoteSkin = buildHumanoidSkin(this.scene, 1);

    // Sky
    this.sky = new SkySystem(this.scene);
    this.sky.setDimension(DIMENSIONS.overworld);
    this.sky.enableShadows();

    // Selection outline (edges cube)
    this.selectionOutline = MeshBuilder.CreateBox("selection", { size: 1.002 }, this.scene);
    this.selectionOutline.isPickable = false;
    this.selectionOutline.enableEdgesRendering();
    this.selectionOutline.edgesWidth = 2.0;
    this.selectionOutline.edgesColor = new Color4(0,0,0,0.8);
    this.selectionOutline.material = new StandardMaterial("selmat", this.scene);
    (this.selectionOutline.material as StandardMaterial).disableLighting = true;
    (this.selectionOutline.material as StandardMaterial).alpha = 0;
    this.seOutlineMat = this.selectionOutline.material as StandardMaterial;
    this.selectionOutline.isVisible = false;

    // Input (Esc pause, E inv, F flight, V/F5 view, Enter chat)
    window.addEventListener("keydown", (e) => {
      if (!this.running) return;
      if (this.ui.chatOpen) { if (e.code === "Escape" || e.key === "Enter") e.stopPropagation(); return; }
      if (e.code === "KeyV" || e.code === "F5") { e.preventDefault(); this.cycleView(); return; }
      if (e.code === "Enter") {
        e.preventDefault();
        document.exitPointerLock?.();
        this.ui.openChat((text) => {
          this.net.sendChat(text);
          this.canvas.requestPointerLock();
        });
        return;
      }
      if (e.code === "Escape") {
        if (this.ui.chestOpen) { this.ui.closeChest(); this.canvas.requestPointerLock(); }
        else if (this.ui.furnaceOpen) { this.ui.closeFurnace(); this.canvas.requestPointerLock(); }
        else if (this.ui.invOpen) { this.ui.closeInventory(); this.canvas.requestPointerLock(); }
        else if (!this.ui.paused) this.pause();
        else this.resumeFromPause();
        e.preventDefault();
      }
      else if (e.code === "KeyE") {
        if (this.ui.chestOpen) { this.ui.closeChest(); this.canvas.requestPointerLock(); }
        else if (this.ui.furnaceOpen) { this.ui.closeFurnace(); this.canvas.requestPointerLock(); }
        else this.toggleInventory();
        e.preventDefault();
      }
      else if (e.code === "KeyF") { this.player?.toggleFlight(); this.audio?.uiClick(); }
    });

    await this.showMainMenu();
  }

  async showMainMenu() {
    const worlds = await listWorlds();
    this.stopGame();
    this.net.leave();
    this.clearPeerModels();
    this.canvas.classList.add("blurred");
    this.initMenuScene();
    this.ui.showMainMenu(worlds);
  }

  cycleView() {
    if (!this.player) return;
    this.player.cycleView();
    const names = ["First person", "Third person (back)", "Third person (front)"];
    this.ui.toast("Camera: " + names[this.player.viewMode]);
    this.audio.uiClick();
  }

  private clearPeerModels() {
    for (const [, m] of this.peerModels) m.dispose();
    this.peerModels.clear();
  }

  // ---- Main-menu live panorama: a slowly orbiting camera over generated terrain ----
  private menuWorld?: WorldManager;
  private menuCam?: UniversalCamera;
  private menuAngle = Math.random() * Math.PI * 2;
  private menuCenterY = -1;

  private teardownMenuScene() {
    if (this.menuWorld) { this.menuWorld.dispose(); this.menuWorld = undefined; }
    if (this.menuCam) { this.menuCam.dispose(); this.menuCam = undefined; }
    this.menuCenterY = -1;
  }

  private initMenuScene() {
    this.teardownMenuScene();
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.menuWorld = new WorldManager(this.scene, {
      name: "Panorama", seed, worldType: "normal", gameMode: "creative",
      created: Date.now(), lastPlayed: Date.now(),
    }, this.solidMat, this.waterMat);
    this.menuWorld.renderDistance = 3;
    this.menuCam = new UniversalCamera("menuCam", new Vector3(40, 80, 8), this.scene);
    this.menuCam.inputs.clear();
    this.menuCam.minZ = 0.1;
    this.menuCam.maxZ = 1000;
    this.menuCam.fov = 70 * Math.PI / 180;
    this.scene.activeCamera = this.menuCam;

    // Pre-generate a small region around the orbit center without blocking startup.
    (async () => {
      if (!this.menuWorld) return;
      let n = 0;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (this.menuWorld !== undefined) this.menuWorld.generateSync(dx, dz, "overworld");
          if (++n % 3 === 0) await new Promise<void>(r => setTimeout(r, 0));
        }
      }
    })();
    this.sky.setDimension(DIMENSIONS.overworld);
  }

  private updateMenuScene(dt: number, now: number) {
    if (!this.menuWorld || !this.menuCam) return;
    this.sky.update(dt);
    if (this.waterTexture) {
      const t = now / 1000;
      this.waterTexture.uOffset = (t * 0.02) % 1;
      this.waterTexture.vOffset = (t * 0.015) % 1;
    }
    // Find a good look-at height once terrain exists
    if (this.menuCenterY < 0 && this.menuWorld.getChunk(0, 0, "overworld")?.generated) {
      let y = 0;
      for (let yy = CHUNK_HEIGHT - 10; yy > 1; yy--) {
        const b = this.menuWorld.getBlockWorld(8, yy, 8, "overworld");
        const def = BLOCKS[b];
        if (def && def.solid) { y = yy + 1; break; }
      }
      this.menuCenterY = Math.max(y, SEA_LEVEL + 2);
    }
    const cy = this.menuCenterY > 0 ? this.menuCenterY : SEA_LEVEL + 4;
    this.menuAngle += dt * 0.04;
    const radius = 34;
    const px = 8 + Math.cos(this.menuAngle) * radius;
    const pz = 8 + Math.sin(this.menuAngle) * radius;
    this.menuWorld.update(px, pz, "overworld", 2, 3);
    this.menuCam.position.set(px, cy + 14 + Math.sin(this.menuAngle * 0.7) * 2, pz);
    this.menuCam.setTarget(new Vector3(8, cy + 4, 8));
  }

  async startWorld(opts: GameStartOpts) {
    try {
      await this.startWorldInner(opts);
    } catch (err) {
      console.error("[Mass Awakening] startWorld failed:", err);
      this.ui.setLoadingProgress(100, "ERROR: " + ((err as Error).message || String(err)));
    }
  }

  private async startWorldInner(opts: GameStartOpts) {
    // Ensure audio starts on user interaction
    this.audio.ensure();
    this.audio.uiClick();

    // NOTE: the menu panorama camera must stay alive until the player camera
    // exists (a frame rendered with a disposed active camera kills the render
    // loop and leaves a black screen). Teardown happens after player creation.
    this.canvas.classList.remove("blurred");

    // Load existing or create new
    let meta: SavedWorld;
    let isNew = false;
    if (opts.existingId) {
      const existing = await loadWorldMeta(opts.existingId);
      if (existing) meta = existing; else {
        // fall through to create
        isNew = true;
        meta = {
          id: newWorldId(),
          name: opts.name,
          seed: typeof opts.seedStr === "string" ? seedFromString(opts.seedStr) : parseInt(opts.seedStr) || Math.floor(Math.random()*1e9),
          worldType: opts.worldType,
          gameMode: opts.gameMode,
          created: Date.now(),
          lastPlayed: Date.now(),
          playerPos: { x: 0, y: 90, z: 0, dim: "overworld", yaw: 0, pitch: 0 },
          health: 20, hunger: 20,
          inventory: { selected: 0, slots: new Array(36).fill(null) },
          timeOfDay: 0.3,
        };
      }
    } else {
      isNew = true;
      meta = {
        id: newWorldId(),
        name: opts.name,
        seed: seedFromString(opts.seedStr),
        worldType: opts.worldType,
        gameMode: opts.gameMode,
        created: Date.now(),
        lastPlayed: Date.now(),
        playerPos: { x: 0, y: 90, z: 0, dim: "overworld", yaw: 0, pitch: 0 },
        health: 20, hunger: 20,
        inventory: { selected: 0, slots: new Array(36).fill(null) },
        timeOfDay: 0.3,
      };
    }
    this.currentWorldId = meta.id;
    this.currentMeta = meta;

    this.ui.setLoadingProgress(20, "Building world...");

    // Dispose previous world if any
    if (this.boss) { this.boss.dispose(); this.boss = null; }
    if (this.world) this.world.dispose();

    // Create world
    this.world = new WorldManager(this.scene, {
      name: meta.name, seed: meta.seed, worldType: meta.worldType,
      gameMode: meta.gameMode, created: meta.created, lastPlayed: meta.lastPlayed,
    }, this.solidMat, this.waterMat);
    this.world.renderDistance = this.ui.settings.renderDistance;

    this.ui.setLoadingProgress(40, "Loading saved chunks...");
    // Load chunks for all dimensions so player edits persist across travel.
    for (const dim of ["overworld", "nether", "end"] as DimensionId[]) {
      const savedChunks = await loadChunks(meta.id, dim);
      if (savedChunks.length) this.world.loadSerializedChunks(savedChunks);
    }
    // Pre-generate spawn area synchronously to avoid fall-through
    this.ui.setLoadingProgress(60, "Preparing spawn...");
    const spawnDim = meta.playerPos.dim;
    const cx0 = Math.floor(meta.playerPos.x / 16);
    const cz0 = Math.floor(meta.playerPos.z / 16);
    // Generate the immediate spawn area, yielding to the browser so the loading bar can paint.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.world.generateSync(cx0+dx, cz0+dz, spawnDim);
      }
      await new Promise<void>(r => setTimeout(r, 0));
      this.ui.setLoadingProgress(60 + (dz+2)*8, "Preparing spawn...");
    }
    // Find spawn
    let spawnY = meta.playerPos.y;
    if (isNew) {
      const dx = cx0*16+8, dz = cz0*16+8;
      spawnY = findSpawnY((x,y,z)=>this.world.getBlockWorld(x,y,z,spawnDim), dx, dz, DIMENSIONS[spawnDim].spawnHeight);
      meta.playerPos.x = dx;
      meta.playerPos.z = dz;
    }

    // Inventory
    this.inventory = new Inventory();
    if (meta.inventory && meta.inventory.slots && meta.inventory.slots.length === 36) {
      this.inventory.load(meta.inventory);
    } else {
      if (meta.gameMode === "creative") this.inventory.initCreative();
      else this.inventory.initSurvival();
    }

    // Player
    if (this.player) {
      this.player.camera.dispose();
      this.player.model?.dispose();
      this.player.fpArm?.dispose();
    }
    this.player = new PlayerController(this.scene, this.world, new Vector3(meta.playerPos.x+0.5, spawnY, meta.playerPos.z+0.5), meta.gameMode);
    this.player.state.yaw = meta.playerPos.yaw || 0;
    this.player.state.pitch = meta.playerPos.pitch || 0;
    this.player.state.health = meta.health;
    this.player.state.hunger = meta.hunger;
    // Wire item getter
    this.player.getHeldBlockId = () => {
      const s = this.inventory.slots[this.inventory.selectedHotbar];
      return s ? s.id : BlockId.Air;
    };
    this.player.consumeHeldItem = () => this.inventory.removeOne(this.inventory.selectedHotbar);
    this.player.onBlockBreak = (wx,wy,wz,b) => {
      this.audio.breakBlock();
      this.net.sendBlock(wx, wy, wz, BlockId.Air);
      // if survival, spawn a physical drop
      if (this.player.state.gameMode === "survival") {
        const def = BLOCKS[b];
        const drop = def?.drops ?? b;
        if (drop !== BlockId.Air && this.drops) this.drops.spawn(wx, wy, wz, drop, 1);
        this.gainXP(b === BlockId.CoalOre || b === BlockId.IronOre ? 2 : b === BlockId.DiamondOre || b === BlockId.EmeraldOre || b === BlockId.GoldOre || b === BlockId.RedstoneOre ? 5 : 1);
      }
      this.cameraShake = 0.05;
    };
    this.player.onBlockPlace = (wx,wy,wz,b) => {
      this.audio.placeBlock();
      this.net.sendBlock(wx, wy, wz, b);
      if (this.player.state.gameMode === "survival") {
        this.inventory.removeOne(this.inventory.selectedHotbar);
        this.ui.renderHotbar();
      }
      // If placed block is Nether Portal frame, maybe activate; TNT left-click priming
      if (b === BlockId.Portal) this.audio.portal();
    };
    this.player.onBlockBreaking = (wx,wy,wz,progress) => {
      if (progress > 0) this.ui.showBreakProgress(wx,wy,wz,progress);
      if (Math.floor(progress*10) !== Math.floor((progress-0.02)*10)) this.audio.mineTick();
    };
    this.player.onBreakBlockEnd = () => this.ui.hideBreakProgress();
    this.player.onDamage = (amt) => {
      this.audio.hurt();
      this.cameraShake = Math.min(0.5, this.cameraShake + 0.2);
    };
    this.player.onHotbarChange = (s) => { this.inventory.setSelectedSlot(s); this.ui.renderHotbar(); this.audio.uiClick(); };
    this.player.onLockChange = (locked) => {
      if (!locked && this.running && !this.ui.paused && !this.ui.invOpen) this.pause();
    };
    this.player.onPrimeTNT = (x,y,z) => this.primeTNT(x,y,z);
    this.player.onUseItem = () => {
      const slot = this.inventory.selectedHotbar;
      const s = this.inventory.slots[slot];
      if (!s) return false;
      const st = this.player.state;
      if (st.gameMode !== "survival") return false;
      if (s.id === BlockId.Apple || s.id === BlockId.Bread) {
        if (st.hunger >= 20) return false;
        const restore = s.id === BlockId.Apple ? 4 : 5;
        st.hunger = Math.min(20, st.hunger + restore);
        st.health = Math.min(20, st.health + (s.id === BlockId.Apple ? 1 : 0));
        this.inventory.removeOne(slot);
        this.ui.renderHotbar();
        this.ui.renderSurvivalBars(st.health, st.hunger);
        this.audio.eat();
        return true;
      }
      return false;
    };

    // Character model (third person) + first-person viewmodel arm
    this.player.model = new HumanoidModel(this.scene, this.playerSkin);
    this.player.fpArm = new FirstPersonArm(this.scene, this.playerSkin, this.player.camera);

    // Player camera is now active — safe to tear down the menu panorama.
    this.teardownMenuScene();

    // Multiplayer wiring
    this.net.name = opts.hostName || this.net.name;
    this.net.events.onBlock = (x, y, z, b) => { if (this.world) this.world.setBlockWorld(x, y, z, b as BlockId); };
    this.net.events.onChat = (name, text) => this.ui.addChatLine(`<${name}> ${text}`);
    this.net.events.onPeerJoined = (id, name) => {
      if (!this.peerModels.has(id)) {
        this.peerModels.set(id, new HumanoidModel(this.scene, this.remoteSkin, name));
        this.ui.toast(name + " joined the game");
        this.audio.pickup();
      }
    };
    this.net.events.onPeerLeft = (id) => {
      const m = this.peerModels.get(id);
      if (m) { m.dispose(); this.peerModels.delete(id); this.ui.toast("A player left"); }
    };
    if (opts.host) {
      this.net.host({ seed: meta.seed, worldType: meta.worldType, gameMode: meta.gameMode, worldName: meta.name });
      this.ui.toast("Hosting world for other tabs");
    }

    window.addEventListener("keydown", (e) => {
      if (!this.running) return;
      if (e.code === "KeyT" && this.player.lastHit) {
        const h = this.player.lastHit;
        if (this.world.getBlockWorld(h.wx,h.wy,h.wz) === BlockId.TNT) this.primeTNT(h.wx,h.wy,h.wz);
      }
    });

    // Drops and mobs
    if (this.drops) this.drops.clear();
    this.drops = new DropSystem(this.scene, (x,y,z) => this.world.getBlockWorld(x,y,z));
    this.drops.onPickup = (id, count) => {
      this.inventory.addItem(id, count);
      this.ui.renderHotbar();
      this.audio.pickup();
    };
    if (this.mobManager) this.mobManager.clear();
    const shadows = this.ui.settings.graphics === "high" ? this.sky.shadows : undefined;
    this.mobManager = new MobManager(this.scene,
      (x,y,z) => this.world.getBlockWorld(x,y,z),
      (x,z) => this.findSurfaceY(x,z),
      shadows);
    this.furnaces = new FurnaceSystem();
    this.chests = new ChestSystem();
    this.chests.load(meta.chests);
    this.weather = new WeatherSystem(this.scene);
    this.weather.onThunder = () => { this.audio.thunder(); this.cameraShake = Math.min(0.3, this.cameraShake + 0.1); };

    // Block interactions (furnace, crafting table, chest)
    this.player.onInteractBlock = (wx, wy, wz, block) => {
      if (block === BlockId.Furnace) {
        document.exitPointerLock?.();
        this.ui.hidePauseMenu();
        this.ui.closeInventory();
        this.ui.showFurnace(this.furnaces.get(wx, wy, wz));
        this.audio.openInventory();
        return true;
      }
      if (block === BlockId.CraftingTable) {
        document.exitPointerLock?.();
        this.ui.hidePauseMenu();
        this.ui.closeFurnace();
        this.ui.showInventory();
        this.audio.openInventory();
        return true;
      }
      if (block === BlockId.Chest) {
        document.exitPointerLock?.();
        this.ui.hidePauseMenu();
        this.ui.closeInventory();
        this.ui.closeFurnace();
        this.ui.showChest(this.chests.get(wx, wy, wz));
        this.audio.openInventory();
        return true;
      }
      if (block === BlockId.EndPortalFrame) {
        // Try to activate an end portal: look for a 3x3 ring of frames
        if (this.tryActivateEndPortal(wx, wy, wz)) {
          this.audio.portal();
          this.ui.toast("The End portal awakens...");
        } else {
          this.ui.toast("Complete a 3x3 ring of End Portal Frames to activate.");
        }
        return true;
      }
      return false;
    };

    this.sky.setDimension(DIMENSIONS[spawnDim]);
    this.sky.state.timeOfDay = meta.timeOfDay ?? 0.3;

    this.ui.hideLoading();
    this.ui.enterGame(this.inventory, meta.gameMode, DIMENSIONS[spawnDim].name);
    this.applySettings(this.ui.settings);

    this.running = true;
    if (isNew) await saveWorldMeta(meta);
    this.lastTime = performance.now();

    // Apply FOV
    this.player.camera.fov = (this.ui.settings.fov) * Math.PI / 180;
  }

  stopGame() {
    this.running = false;
    if (this.boss) { this.boss.dispose(); this.boss = null; }
    if (this.mobManager) this.mobManager.clear();
    if (this.drops) this.drops.clear();
    this.ui?.hideBossBar();
  }

  pause() {
    this.audio.uiClick();
    document.exitPointerLock?.();
    this.ui.showPauseMenu();
  }
  resumeFromPause() {
    this.audio.uiClick();
    this.ui.hidePauseMenu();
    this.ui.closeInventory();
    const canvas = this.canvas;
    canvas.requestPointerLock();
  }
  togglePause() {
    if (this.ui.paused) this.resumeFromPause(); else this.pause();
  }
  toggleInventory() {
    if (!this.running) return;
    this.audio.openInventory();
    document.exitPointerLock?.();
    if (this.ui.invOpen) { this.ui.closeInventory(); this.canvas.requestPointerLock(); }
    else { this.ui.hidePauseMenu(); this.ui.showInventory(); }
  }
  toggleGameMode() {
    if (!this.player) return;
    const next = this.player.state.gameMode === "creative" ? "survival" : "creative";
    this.player.setGameMode(next);
    this.inventory.slots.fill(null);
    if (next === "creative") this.inventory.initCreative();
    else this.inventory.initSurvival();
    this.ui.renderHotbar();
    this.ui.setModeLabel(`${next.toUpperCase()} · ${DIMENSIONS[this.world.activeDimension].name.toUpperCase()}`);
    this.ui.toast(`Game mode: ${next}`);
    this.audio.uiClick();
  }

  gainXP(n: number) {
    if (this.player?.state.gameMode !== "survival") return;
    this.xp += n;
    const level = Math.floor(Math.sqrt(this.xp / 12));
    const base = level * level * 12;
    const next = (level + 1) * (level + 1) * 12;
    this.ui.renderXP(level, (this.xp - base) / Math.max(1, next - base));
  }

  // Join a world hosted by another tab: build the same terrain from the advert's
  // seed, then connect to the host's channel.
  async joinNetWorld(name: string, advert: Advert) {
    this.net.name = name;
    await this.startWorld({
      name: advert.meta.worldName,
      seedStr: String(advert.meta.seed),
      gameMode: advert.meta.gameMode,
      worldType: advert.meta.worldType,
    });
    this.net.join(advert);
    this.ui.addChatLine(`[connected to ${advert.hostName}'s world]`);
  }

  applySettings(s: import("../ui/ui").Settings) {
    this.audio.setVolume(s.masterVolume);
    if (this.world) this.world.renderDistance = s.renderDistance;
    if (this.player) this.player.camera.fov = s.fov * Math.PI / 180;
    // Graphics preset → internal render resolution (real perf/quality lever).
    // Babylon's hardware scaling level is inversely proportional to resolution.
    const scale = s.graphics === "high" ? 1.0 : s.graphics === "medium" ? 0.85 : 0.65;
    const base = 1 / Math.min(window.devicePixelRatio || 1, 2);
    this.engine.setHardwareScalingLevel(base / scale);
    // Glow off on low
    if (this.sky?.glow) this.sky.glow.intensity = s.graphics === "low" ? 0 : 0.3;
    // Dynamic shadows only on high
    if (this.sky?.shadows) {
      const map = this.sky.shadows.getShadowMap();
      if (map) map.refreshRate = s.graphics === "high" ? 1 : 0;
    }
  }

  async quitToMenu() {
    await this.saveNow();
    this.stopGame();
    this.ui.hidePauseMenu();
    this.showMainMenu();
  }

  async saveNow() {
    if (!this.world || !this.currentWorldId || !this.player) return;
    const meta: SavedWorld = {
      ...(this.currentMeta as SavedWorld),
      lastPlayed: Date.now(),
      playerPos: { x: this.player.state.position.x - 0.5, y: this.player.state.position.y, z: this.player.state.position.z - 0.5,
                   dim: this.world.activeDimension, yaw: this.player.state.yaw, pitch: this.player.state.pitch },
      health: this.player.state.health,
      hunger: this.player.state.hunger,
      inventory: this.inventory.serialize(),
      gameMode: this.player.state.gameMode,
      timeOfDay: this.sky.state.timeOfDay,
      chests: this.chests ? this.chests.serialize() : undefined,
    };
    await saveWorldMeta(meta);
    // Group serialized chunks by dimension and save each dimension's store.
    const all = this.world.serializeModifiedChunks();
    const byDim = new Map<string, typeof all>();
    for (const c of all) {
      if (!byDim.has(c.dim)) byDim.set(c.dim, []);
      byDim.get(c.dim)!.push(c);
    }
    for (const [dim, chunks] of byDim) {
      await saveChunks(meta.id, dim, chunks);
    }
    this.ui.toast("World saved.");
  }

  switchDimension(dim: DimensionId) {
    if (!this.world || !this.player) return;
    const oldDim = this.world.activeDimension;
    this.world.activeDimension = dim;
    this.sky.setDimension(DIMENSIONS[dim]);

    // Keep the player's XZ location (portal linkage), but clamp far coords
    let px = Math.floor(this.player.state.position.x);
    let pz = Math.floor(this.player.state.position.z);
    px = Math.max(-512, Math.min(512, px));
    pz = Math.max(-512, Math.min(512, pz));

    // Pre-generate chunks around arrival synchronously so the player doesn't fall through
    const cx = Math.floor(px / 16), cz = Math.floor(pz / 16);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) this.world.generateSync(cx+dx, cz+dz, dim);

    // Find arrival height. For the End, aim for the main island if we'd land in void.
    let ax = px, az = pz;
    let y = this.findSurfaceYInDim(dim, ax, az);
    if (y <= 2 && dim === "end") { ax = 0; az = 0; y = this.findSurfaceYInDim(dim, ax, az); }
    if (y <= 2) y = DIMENSIONS[dim].spawnHeight;
    // Nether: never spawn submerged in the lava sea — build the platform above it.
    if (dim === "nether" && y < 36) y = 36;

    // Build a return portal at the arrival point so the player can go back.
    const portalKind = dim === "end" ? BlockId.EndPortal : BlockId.Portal;
    this.buildPortalStructure(ax, y, az, portalKind, dim);

    this.player.teleport(ax + 0.5, y + 1, az + 0.5);
    this.ui.setModeLabel(`${this.player.state.gameMode.toUpperCase()} · ${DIMENSIONS[dim].name.toUpperCase()}`);
    this.audio.portal();
    this.ui.toast(`Entering ${DIMENSIONS[dim].name}`);
    void oldDim;

    // Boss management: despawn when leaving, spawn the dragon in the End.
    if (this.boss) { this.boss.dispose(); this.boss = null; this.ui.hideBossBar(); }
    if (dim === "end") {
      const cx2 = dim === "end" ? 0 : ax;
      this.boss = new DragonBoss(this.scene, new Vector3(cx2, 60, 0), 200);
      this.boss.onDamagePlayer = (dmg) => this.damagePlayer(dmg);
      this.boss.onDefeat = () => {
        this.ui.toast("The dragon falls! The End is free.");
        this.ui.hideBossBar();
        this.audio.explosion();
        // reward
        this.drops.spawn(Math.floor(this.player.state.position.x), Math.floor(this.player.state.position.y + 1), Math.floor(this.player.state.position.z), BlockId.DiamondOre, 4);
      };
      this.ui.toast("A great shadow circles the void...");
    }
  }

  findSurfaceYInDim(dim: DimensionId, x: number, z: number): number {
    // Start below any ceiling (nether has bedrock at y>120)
    for (let y = CHUNK_HEIGHT - 10; y > 1; y--) {
      const b = this.world.getBlockWorld(x, y, z, dim);
      const def = BLOCKS[b];
      if (def && def.solid) return y + 1;
    }
    return 0;
  }

  // Build a small portal frame at (x,y,z) so the player can return.
  private buildPortalStructure(x: number, y: number, z: number, portalBlock: BlockId, dim: DimensionId) {
    // Clear a small area and lay an obsidian frame 2 wide x 3 tall with portal interior.
    const frame = BlockId.Obsidian;
    // ensure ground is solid under the portal
    const groundY = y - 1;
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!BLOCKS[this.world.getBlockWorld(x+dx, groundY, z+dz, dim)]?.solid) {
        this.world.setBlockWorld(x+dx, groundY, z+dz, dim === "nether" ? BlockId.Netherrack : BlockId.Stone, dim);
      }
    }
    // Frame
    for (let dx = -1; dx <= 2; dx++) {
      this.world.setBlockWorld(x+dx, y-1, z, frame, dim);
      this.world.setBlockWorld(x+dx, y+3, z, frame, dim);
    }
    for (let dy = 0; dy <= 2; dy++) {
      this.world.setBlockWorld(x-1, y+dy, z, frame, dim);
      this.world.setBlockWorld(x+2, y+dy, z, frame, dim);
    }
    // Interior portal blocks
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) {
      this.world.setBlockWorld(x+dx, y+dy, z, portalBlock, dim);
    }
    // Clear the space in front/behind so the player can walk through
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) for (const off of [-1, 1]) {
      const b = this.world.getBlockWorld(x+dx, y+dy, z+off, dim);
      if (BLOCKS[b]?.solid) this.world.setBlockWorld(x+dx, y+dy, z+off, BlockId.Air, dim);
    }
  }

  private frameCount = 0;
  private fpsTime = 0;
  private fps = 60;

  runLoop() {
    const engine = this.engine;
    const boundRender = () => this.frame();
    engine.runRenderLoop(boundRender);
    window.addEventListener("resize", () => engine.resize());
  }

  private frame() {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1; // clamp on tab switches
    this.fpsTime += dt; this.frameCount++;
    if (this.fpsTime > 0.5) { this.fps = this.frameCount / this.fpsTime; this.frameCount = 0; this.fpsTime = 0; this.ui.updateFPS(this.fps); }

    if (!this.running && this.menuWorld && this.menuCam && this.sky) {
      this.updateMenuScene(dt, now);
    }

    if (this.running && this.player && this.world && this.sky) {
      // Update
      this.sky.update(dt);
      // Animated water surface (scroll + gentle wobble)
      if (this.waterTexture) {
        const t = now / 1000;
        this.waterTexture.uOffset = (t * 0.02) % 1 + Math.sin(t * 0.6) * 0.015;
        this.waterTexture.vOffset = (t * 0.015) % 1 + Math.cos(t * 0.5) * 0.015;
      }
      // Furnaces always tick while a world is running (even while their UI is open)
      if (this.furnaces) this.furnaces.update(dt);
      // Only update world/chunks when not paused / no UI open
      if (!this.ui.paused && !this.ui.invOpen && !this.ui.furnaceOpen && !this.ui.chestOpen && !this.ui.chatOpen) {
        this.world.update(this.player.state.position.x, this.player.state.position.z, this.world.activeDimension, 1, 2);
        const prevVelY = this.player.state.velocity.y;
        const wasOnGround = this.player.state.onGround;
        this.player.update(dt);

        // --- Survival simulation ---
        if (this.player.state.gameMode === "survival") {
          // Fall damage
          if (!wasOnGround && this.player.state.onGround && prevVelY < 0) {
            const fallDist = -prevVelY * prevVelY / (2 * 22); // approx from impact velocity
            if (fallDist > 4) this.damagePlayer(Math.floor(fallDist - 3));
            if (fallDist > 1.5) this.audio.land();
          }
          // Hunger drain over time; regenerate when well-fed
          this.hungerTimer += dt;
          if (this.hungerTimer > 4) {
            this.hungerTimer = 0;
            const st = this.player.state;
            const moving = Math.abs(st.velocity.x) > 0.1 || Math.abs(st.velocity.z) > 0.1;
            if (moving && st.hunger > 0) st.hunger = Math.max(0, st.hunger - 0.5);
            if (st.hunger <= 0 && st.health > 1) { st.health -= 1; this.audio.hurt(); if (st.health <= 0) this.handleDeath(); }
            else if (st.hunger >= 18 && st.health < 20) st.health = Math.min(20, st.health + 1);
            this.ui.renderSurvivalBars(st.health, st.hunger);
          }
        }

        // Underwater camera tint
        {
          const camBlock = this.world.getBlockWorld(
            Math.floor(this.player.camera.position.x),
            Math.floor(this.player.camera.position.y),
            Math.floor(this.player.camera.position.z));
          if (camBlock === BlockId.Water) {
            this.scene.fogColor = new Color3(0.05, 0.2, 0.4);
            this.scene.fogDensity = 0.06;
            this.scene.clearColor = new Color4(0.05, 0.2, 0.4, 1);
          } else if (this.scene.clearColor.r < 0.2) {
            // restore sky clear color after leaving water
            this.scene.clearColor = new Color4(0.45, 0.65, 0.95, 1);
          }
        }

        // Drops and mobs (only in overworld for now)
        if (this.drops) this.drops.update(dt, this.player.state.position);
        if (this.mobManager && this.world.activeDimension === "overworld") {
          this.mobManager.update(dt, this.player.state.position, this.isNight(), (dmg) => this.damagePlayer(dmg));
        }
        if (this.weather) this.weather.update(dt, this.player.state.position, this.world.activeDimension === "overworld");
        // Boss
        if (this.boss) {
          this.boss.update(dt, this.player.state.position);
          this.ui.showBossBar("VOID DRAGON", (this.boss.health / this.boss.maxHealth) * 100);
          if (this.boss.dead) this.boss = null;
        }

        // Block target outline
        const origin = this.player.camera.position;
        const dir = this.player.camera.getForwardRay().direction;
        const hit = this.world.raycast(origin, dir, this.player.state.gameMode === "creative" ? 6 : 5);
        if (hit.hit) {
          this.selectionOutline.isVisible = true;
          this.seOutlineMat.alpha = 0;
          this.selectionOutline.position.set(hit.wx+0.5, hit.wy+0.5, hit.wz+0.5);
        } else {
          this.selectionOutline.isVisible = false;
          // Attack a mob or the boss if no block hit
          if (this.player.mouseDown.left && this.player.breakCooldown <= 0) {
            let landed = false;
            if (this.boss && this.boss.intersectsRay(origin, dir, 6)) {
              this.boss.hurt(this.attackDamage());
              landed = true;
            } else if (this.mobManager) {
              const mob = this.mobManager.attackFrom(origin, dir, this.attackDamage());
              if (mob) {
                landed = true;
                if (mob.dead) {
                    this.audio.breakBlock();
                    this.gainXP(4);
                    if (this.player.state.gameMode === "survival") {
                    const food = mob.kind === "pig" ? BlockId.Apple : mob.kind === "chicken" ? BlockId.Apple : BlockId.Bread;
                    this.drops.spawn(Math.floor(mob.position.x), Math.floor(mob.position.y), Math.floor(mob.position.z), food, 1);
                  }
                }
              }
            }
            if (landed) { this.player.breakCooldown = 0.3; this.audio.hurt(); }
          }
        }

        // Camera shake
        if (this.cameraShake > 0) {
          this.cameraShake = Math.max(0, this.cameraShake - dt*2);
          const s = this.cameraShake;
          this.player.camera.position.x += (Math.random()-0.5)*s;
          this.player.camera.position.y += (Math.random()-0.5)*s;
        }

        // TNT fuse handling via global primed list
        this.updatePrimedTNT(dt);

        // Portal: if standing in portal block for 1.5+ seconds, transport
        const standingBlock = this.world.getBlockWorld(Math.floor(this.player.state.position.x),
                                                       Math.floor(this.player.state.position.y + 0.5),
                                                       Math.floor(this.player.state.position.z));
        const standingBlockHead = this.world.getBlockWorld(Math.floor(this.player.state.position.x),
                                                       Math.floor(this.player.state.position.y + 1.5),
                                                       Math.floor(this.player.state.position.z));
        const inPortal = standingBlock === BlockId.Portal || standingBlockHead === BlockId.Portal
                      || standingBlock === BlockId.EndPortal || standingBlockHead === BlockId.EndPortal;
        if (inPortal) {
          this._portalTimer = (this._portalTimer || 0) + dt;
          if (this._portalTimer > 1.5) {
            const cur = this.world.activeDimension;
            let nextDim: DimensionId;
            if (standingBlock === BlockId.EndPortal || standingBlockHead === BlockId.EndPortal) {
              nextDim = cur === "end" ? "overworld" : "end";
            } else {
              nextDim = cur === "nether" ? "overworld" : (cur === "end" ? "overworld" : "nether");
            }
            this.switchDimension(nextDim);
            this._portalTimer = -3; // grace period so we don't instantly bounce back
          }
        } else if (this._portalTimer > 0) { this._portalTimer = 0; }
        else if (this._portalTimer < 0) { this._portalTimer += dt; }

        this.ui.updateCoords(this.player.state.position.x, this.player.state.position.y, this.player.state.position.z, this.world.activeDimension);

        // ---- multiplayer sync ----
        if (this.net.role !== "none") {
          this.posSendTimer += dt;
          if (this.posSendTimer > 0.1) {
            this.posSendTimer = 0;
            const p = this.player.state;
            this.net.sendPos(p.position.x, p.position.y, p.position.z, p.yaw, p.pitch);
            this.net.prunePeers();
          }
          for (const [id, peer] of this.net.peers) {
            let model = this.peerModels.get(id);
            if (!model) {
              model = new HumanoidModel(this.scene, this.remoteSkin, peer.name);
              this.peerModels.set(id, model);
            }
            const cur = model.root.position;
            const tx = peer.x, ty = peer.y, tz = peer.z;
            const k = Math.min(1, dt * 10);
            const moved = Math.hypot(tx - cur.x, tz - cur.z) > 0.05;
            model.setPosition(cur.x + (tx - cur.x) * k, cur.y + (ty - cur.y) * k, cur.z + (tz - cur.z) * k, peer.yaw);
            model.setWalking(moved, dt);
          }
        }

        // auto-save every 30s
        this.autoSaveTimer += dt;
        if (this.autoSaveTimer > 30) { this.autoSaveTimer = 0; this.saveNow(); }
      }
    }

    this.scene.render();
  }
  _portalTimer = 0;
  _primedTNT: { x:number;y:number;z:number; fuse:number; dim:string }[] = [];

  findSurfaceY(x: number, z: number): number {
    // Start below the ceiling band (nether has bedrock at y>120)
    for (let y = CHUNK_HEIGHT - 10; y > 1; y--) {
      const b = this.world.getBlockWorld(x, y, z);
      const def = BLOCKS[b];
      if (def && def.solid) return y + 1;
    }
    return 0;
  }

  // Look for a 3x3 ring of End Portal Frames around (wx,wy,wz); if found, fill the center with End Portal.
  tryActivateEndPortal(wx: number, wy: number, wz: number): boolean {
    for (let cx = wx - 1; cx <= wx + 1; cx++) {
      for (let cz = wz - 1; cz <= wz + 1; cz++) {
        let ok = true;
        for (let dx = -1; dx <= 1 && ok; dx++) {
          for (let dz = -1; dz <= 1 && ok; dz++) {
            if (dx === 0 && dz === 0) continue;
            const b = this.world.getBlockWorld(cx + dx, wy, cz + dz);
            if (b !== BlockId.EndPortalFrame) ok = false;
          }
        }
        if (ok) {
          // fill center with end portal
          this.world.setBlockWorld(cx, wy, wz, BlockId.EndPortal);
          return true;
        }
      }
    }
    return false;
  }

  attackDamage(): number {
    const held = this.inventory.getSelected()?.id;
    switch (held) {
      case BlockId.SwordIron: return 6;
      case BlockId.SwordWood: return 4;
      case BlockId.PickaxeDiamond: case BlockId.PickaxeIron: return 3;
      default: return 1;
    }
  }

  isNight(): boolean {
    const t = this.sky.state.timeOfDay;
    return t < 0.22 || t > 0.78;
  }

  damagePlayer(amount: number) {
    if (!this.player || this.player.state.gameMode !== "survival") return;
    this.player.state.health -= amount;
    this.audio.hurt();
    this.cameraShake = Math.min(0.5, this.cameraShake + 0.15);
    this.ui.renderSurvivalBars(this.player.state.health, this.player.state.hunger);
    if (this.player.state.health <= 0) this.handleDeath();
  }

  handleDeath() {
    document.exitPointerLock?.();
    this.ui.showDeathScreen(() => this.respawn());
  }

  respawn() {
    if (!this.player) return;
    this.player.state.health = 20;
    this.player.state.hunger = 20;
    const cx = 0, cz = 0;
    const y = this.findSurfaceY(cx * 16 + 8, cz * 16 + 8);
    this.player.teleport(cx * 16 + 8.5, Math.max(y, 3), cz * 16 + 8.5);
    this.ui.renderSurvivalBars(20, 20);
    this.canvas.requestPointerLock();
  }

  primeTNT(x:number,y:number,z:number) {
    if (this.world.getBlockWorld(x,y,z) !== BlockId.TNT) return;
    this.world.setBlockWorld(x,y,z,BlockId.Air);
    this._primedTNT.push({ x, y, z, fuse: 4.0, dim: this.world.activeDimension });
    this.audio.fuse();
  }

  private updatePrimedTNT(dt: number) {
    for (let i = this._primedTNT.length - 1; i >= 0; i--) {
      const t = this._primedTNT[i];
      t.fuse -= dt;
      if (Math.floor(t.fuse*4) !== Math.floor((t.fuse+dt)*4)) this.audio.fuse();
      if (t.fuse <= 0) {
        this._primedTNT.splice(i,1);
        detonateTNT(this.world, this.scene, t.x, t.y, t.z, 4);
        this.audio.explosion();
        this.cameraShake = 0.6;
      }
    }
    // Also, right-click on TNT with nothing primes it in creative for testing
    // handled by input interception: if left-click TNT block when player's held item is empty? For simplicity, right-click places; we add a shortcut: hit T in range primes TNT
  }
}
