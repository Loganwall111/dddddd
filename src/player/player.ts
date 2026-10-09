import { Scene, Vector3, UniversalCamera, PointerEventTypes, PointerInfo, KeyboardEventTypes, Tools as BabylonTools, ShadowGenerator, Mesh, Quaternion } from "@babylonjs/core";
import { BlockId, BLOCKS } from "../blocks/blocks";
import { WorldManager } from "../world/worldManager";
import { CHUNK_HEIGHT } from "../world/chunk";
import { HumanoidModel, FirstPersonArm } from "../entities/playerModel";

export interface PlayerState {
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
  health: number;
  hunger: number;
  air: number;
  gameMode: "creative" | "survival";
  selectedSlot: number;
  breakingBlock: { wx:number; wy:number; wz:number; progress: number } | null;
}

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;
export const MOVE_SPEED = 4.3;
export const SPRINT_SPEED = 5.8;
export const FLY_SPEED = 9.0;
export const JUMP_VELOCITY = 8.5;
export const GRAVITY = 22.0;

export class PlayerController {
  scene: Scene;
  world: WorldManager;
  camera: UniversalCamera;
  state: PlayerState;
  keys: Record<string, boolean> = {};
  mouseDown: { left: boolean; right: boolean } = { left: false, right: false };
  pointerLocked: boolean = false;
  placeCooldown = 0;
  breakCooldown = 0;

  constructor(scene: Scene, world: WorldManager, startPos: Vector3, gameMode: "creative" | "survival") {
    this.scene = scene;
    this.world = world;
    this.state = {
      position: startPos.clone(),
      velocity: new Vector3(0, 0, 0),
      yaw: 0, pitch: -0.1,
      onGround: false, flying: gameMode === "creative",
      health: 20, hunger: 20, air: 20,
      gameMode,
      selectedSlot: 0,
      breakingBlock: null,
    };

    this.camera = new UniversalCamera("playerCam", new Vector3(0, PLAYER_EYE_HEIGHT, 0), scene);
    this.camera.parent = null;
    this.camera.position.set(0, PLAYER_EYE_HEIGHT, 0);
    this.camera.fov = Math.PI / 3;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1000;
    this.camera.rotationQuaternion = new Quaternion();
    this.camera.inputs.clear(); // disable default UniversalCamera keyboard/mouse; we handle everything
    scene.activeCamera = this.camera;

    this.attachInputs();
  }

  private attachInputs() {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    // Pointer lock
    canvas.addEventListener("click", () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.pointerLocked);
    });

    this.scene.onPointerObservable.add((pi: PointerInfo) => {
      if (!this.pointerLocked) return;
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        const ev = pi.event as MouseEvent;
        if (ev.button === 0) this.mouseDown.left = true;
        if (ev.button === 2) this.mouseDown.right = true;
      } else if (pi.type === PointerEventTypes.POINTERUP) {
        const ev = pi.event as MouseEvent;
        if (ev.button === 0) { this.mouseDown.left = false; this.state.breakingBlock = null; if (this.onBreakBlockEnd) this.onBreakBlockEnd(); }
        if (ev.button === 2) this.mouseDown.right = false;
      } else if (pi.type === PointerEventTypes.POINTERMOVE) {
        const ev = pi.event as MouseEvent;
        if (!this.pointerLocked) return;
        const sensitivity = 0.002;
        this.state.yaw -= ev.movementX * sensitivity;
        this.state.pitch -= ev.movementY * sensitivity;
        const lim = Math.PI/2 - 0.01;
        if (this.state.pitch > lim) this.state.pitch = lim;
        if (this.state.pitch < -lim) this.state.pitch = -lim;
      }
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.scene.onKeyboardObservable.add((info) => {
      const ev = info.event;
      const down = info.type === KeyboardEventTypes.KEYDOWN;
      this.keys[ev.code] = down;
      if (down) {
        if (ev.code.startsWith("Digit")) {
          const n = parseInt(ev.code.slice(5)) - 1;
          if (n >= 0 && n <= 8) {
            this.state.selectedSlot = n;
            if (this.onHotbarChange) this.onHotbarChange(n);
          }
        }
        if (ev.code === "Space" && this.state.flying) {
          // fly up handled in update
        }
        if (ev.code === "ShiftLeft" && this.state.gameMode === "creative" && this.state.flying) {
          // fly down handled in update
        }
        if (ev.code === "KeyF") {
          // toggle flight (creative only, for now always allow double-tap-style; we'll bind to double-space or F3+N later)
        }
      }
    });

    window.addEventListener("wheel", (ev) => {
      if (!this.pointerLocked) return;
      if (ev.deltaY > 0) this.state.selectedSlot = (this.state.selectedSlot + 1) % 9;
      else this.state.selectedSlot = (this.state.selectedSlot + 8) % 9;
      if (this.onHotbarChange) this.onHotbarChange(this.state.selectedSlot);
    });
  }

  // 0 = first person, 1 = third person back, 2 = third person front
  viewMode = 0;
  model: HumanoidModel | null = null;
  fpArm: FirstPersonArm | null = null;
  private viewDist = 3.4;
  miningAnim = 0;

  cycleView() { this.viewMode = (this.viewMode + 1) % 3; }

  onLockChange?: (locked: boolean) => void;
  onBlockBreak?: (wx:number,wy:number,wz:number,block: BlockId) => void;
  onBlockPlace?: (wx:number,wy:number,wz:number,block: BlockId) => void;
  onBlockBreaking?: (wx:number,wy:number,wz:number,progress:number) => void;
  onHotbarChange?: (slot: number) => void;
  onBreakBlockEnd?: () => void;
  onDamage?: (amount: number) => void;
  onPrimeTNT?: (wx:number,wy:number,wz:number) => void;
  onUseItem?: () => boolean; // return true if the held item was consumed (e.g. eating)
  onInteractBlock?: (wx:number,wy:number,wz:number,block: BlockId) => boolean; // return true to consume the interaction
  lastHit?: { wx:number; wy:number; wz:number; blockId: BlockId };

  private isSolid(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return wy < 0; // below 0 is void
    const b = this.world.getBlockWorld(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    const def = BLOCKS[b];
    return !!def && def.solid && !def.liquid;
  }
  private isLiquid(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const b = this.world.getBlockWorld(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    const def = BLOCKS[b];
    return !!def && def.liquid;
  }

  // Collide a simple AABB vs voxel world. Returns corrected position and on-ground state.
  private moveAndCollide(dt: number) {
    const pos = this.state.position;
    const vel = this.state.velocity;
    const hw = PLAYER_WIDTH / 2;

    // Apply velocity axis by axis
    this.state.onGround = false;

    const moveAxis = (axis: "x"|"y"|"z", delta: number) => {
      if (delta === 0) return;
      pos[axis] += delta;
      // AABB corners
      const minX = pos.x - hw, maxX = pos.x + hw;
      const minY = pos.y,       maxY = pos.y + PLAYER_HEIGHT;
      const minZ = pos.z - hw, maxZ = pos.z + hw;
      const minBX = Math.floor(minX), maxBX = Math.floor(maxX);
      const minBY = Math.floor(minY), maxBY = Math.floor(maxY);
      const minBZ = Math.floor(minZ), maxBZ = Math.floor(maxZ);
      for (let bx = minBX; bx <= maxBX; bx++) {
        for (let by = minBY; by <= maxBY; by++) {
          for (let bz = minBZ; bz <= maxBZ; bz++) {
            if (!this.isSolid(bx, by, bz)) continue;
            // Collision
            if (axis === "x") {
              if (delta > 0) { pos.x = bx - hw - 0.0001; vel.x = 0; }
              else { pos.x = bx + 1 + hw + 0.0001; vel.x = 0; }
            } else if (axis === "y") {
              if (delta > 0) { pos.y = by - PLAYER_HEIGHT - 0.0001; vel.y = 0; }
              else { pos.y = by + 1 + 0.0001; vel.y = 0; this.state.onGround = true; }
            } else {
              if (delta > 0) { pos.z = bz - hw - 0.0001; vel.z = 0; }
              else { pos.z = bz + 1 + hw + 0.0001; vel.z = 0; }
            }
          }
        }
      }
    };

    moveAxis("y", vel.y * dt);
    moveAxis("x", vel.x * dt);
    moveAxis("z", vel.z * dt);

    // prevent falling out of world
    if (pos.y < -20) {
      this.state.position.set(0, 80, 0);
      this.state.velocity.set(0,0,0);
      if (this.onDamage && this.state.gameMode === "survival") this.onDamage(1000);
    }
  }

  update(dt: number) {
    // Camera direction vectors from yaw/pitch.
    // Babylon's left-handed camera forward is +Z rotated by the yaw/pitch quaternion:
    // forward = (sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch)).
    const yaw = this.state.yaw, pitch = this.state.pitch;
    const horizForward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));

    const keys = this.keys;
    const isSprinting = keys["ShiftLeft"] && this.state.onGround && !this.state.flying && this.state.gameMode === "survival";
    const speed = isSprinting ? SPRINT_SPEED : (this.state.flying ? FLY_SPEED : MOVE_SPEED);
    let moveX = 0, moveZ = 0;
    if (keys["KeyW"]) moveZ += 1;
    if (keys["KeyS"]) moveZ -= 1;
    if (keys["KeyA"]) moveX -= 1;
    if (keys["KeyD"]) moveX += 1;
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 0) { moveX /= mag; moveZ /= mag; }
    this.state.velocity.x = (right.x * moveX + horizForward.x * moveZ) * speed;
    this.state.velocity.z = (right.z * moveX + horizForward.z * moveZ) * speed;

    if (this.state.flying) {
      this.state.velocity.y = 0;
      if (keys["Space"]) this.state.velocity.y = speed;
      if (keys["ShiftLeft"]) this.state.velocity.y = -speed;
      // double-space toggle flying off (only in creative for simplicity)
    } else {
      this.state.velocity.y -= GRAVITY * dt;
      if (keys["Space"] && this.state.onGround) {
        this.state.velocity.y = JUMP_VELOCITY;
        this.state.onGround = false;
      }
    }

    // Water slowing
    const headInWater = this.isLiquid(this.state.position.x, this.state.position.y + PLAYER_EYE_HEIGHT*0.5, this.state.position.z);
    if (headInWater && !this.state.flying) {
      this.state.velocity.x *= 0.5; this.state.velocity.z *= 0.5;
      if (keys["Space"]) this.state.velocity.y = 3.0;
    }

    // Apply movement/collision
    this.moveAndCollide(dt);

    // Update camera transform (with third-person support)
    const eye = new Vector3(this.state.position.x, this.state.position.y + PLAYER_EYE_HEIGHT, this.state.position.z);
    const fwd = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    if (this.viewMode === 0) {
      this.camera.position.copyFrom(eye);
      this.camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
    } else {
      const sign = this.viewMode === 1 ? -1 : 1; // back view: behind player
      let dist = this.viewDist;
      // clamp against terrain so the camera never ends up inside a block
      for (let d = dist; d > 0.6; d -= 0.3) {
        const p = eye.add(fwd.scale(sign * d));
        const b = this.world.getBlockWorld(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        const def = BLOCKS[b];
        if (def && def.solid) { dist = d - 0.4; break; }
      }
      this.camera.position.copyFrom(eye.add(fwd.scale(sign * dist)));
      if (this.viewMode === 1) this.camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
      else this.camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw + Math.PI, -pitch, 0);
    }

    // Character model + viewmodel arm
    const moving = Math.abs(this.state.velocity.x) > 0.2 || Math.abs(this.state.velocity.z) > 0.2;
    if (this.model) {
      const showModel = this.viewMode !== 0;
      this.model.setVisible(showModel);
      if (showModel) {
        this.model.setPosition(this.state.position.x, this.state.position.y, this.state.position.z, yaw);
        if (this.mouseDown.left) this.model.swingArm(performance.now() / 1000);
        else this.model.setWalking(moving, dt);
      }
    }
    if (this.fpArm) {
      const showArm = this.viewMode === 0 && this.pointerLocked;
      this.fpArm.setVisible(showArm);
      if (showArm) {
        if (this.mouseDown.left) this.fpArm.swing = 1;
        this.fpArm.attachToCamera(this.camera);
        this.fpArm.tick(dt);
      }
    }

    // Block interaction
    this.handleBlockInteractions(dt);
  }

  private handleBlockInteractions(dt: number) {
    if (!this.pointerLocked) return;
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    // Raycast
    const origin = this.camera.position;
    const dir = this.camera.getForwardRay().direction;
    const reach = this.state.gameMode === "creative" ? 6 : 5;
    const hit = this.world.raycast(origin, dir, reach);
    this.lastHit = hit.hit ? { wx:hit.wx, wy:hit.wy, wz:hit.wz, blockId: hit.blockId } : undefined;

    // Left click: break
    if (this.mouseDown.left && hit.hit) {
      const def = BLOCKS[hit.blockId];
      if (!def) return;
      if (this.state.gameMode === "creative") {
        if (def.hardness < 0) return; // bedrock
        if (this.breakCooldown <= 0) {
          this.world.setBlockWorld(hit.wx, hit.wy, hit.wz, BlockId.Air);
          if (this.onBlockBreak) this.onBlockBreak(hit.wx, hit.wy, hit.wz, hit.blockId);
          this.breakCooldown = 0.15;
          this.state.breakingBlock = null;
        }
      } else {
        // survival: break progress based on hardness
        if (!this.state.breakingBlock ||
            this.state.breakingBlock.wx !== hit.wx || this.state.breakingBlock.wy !== hit.wy || this.state.breakingBlock.wz !== hit.wz) {
          this.state.breakingBlock = { wx:hit.wx, wy:hit.wy, wz:hit.wz, progress:0 };
        }
        if (def.hardness < 0) { this.state.breakingBlock = null; return; }
        // Determine mining speed based on held item
        const held = this.getHeldBlockId();
        const heldDef = held ? BLOCKS[held] : null;
        let speed = 1;
        const isToolPick = heldDef && (held === BlockId.PickaxeWood || held === BlockId.PickaxeStone || held === BlockId.PickaxeIron || held === BlockId.PickaxeDiamond);
        const isToolAxe = heldDef && (held === BlockId.SwordWood || held === BlockId.SwordIron);
        if (def.tool === "pickaxe" && isToolPick) {
          const tier = held === BlockId.PickaxeWood?0: held === BlockId.PickaxeStone?1: held === BlockId.PickaxeIron?2:3;
          if ((def.toolTier ?? 0) <= tier) speed = 2 + tier;
        } else if (def.tool === "axe" && isToolAxe) speed = 2;
        else if (def.tool === "shovel") speed = 1.8;
        else speed = 1;
        // wrong tool penalty for hard blocks
        if (def.tool === "pickaxe" && !isToolPick && def.hardness >= 1.5) speed *= 0.3;
        this.state.breakingBlock.progress += dt * speed / Math.max(0.1, def.hardness);
        if (this.onBlockBreaking) this.onBlockBreaking(hit.wx, hit.wy, hit.wz, Math.min(1, this.state.breakingBlock.progress));
        if (this.state.breakingBlock.progress >= 1) {
          this.world.setBlockWorld(hit.wx, hit.wy, hit.wz, BlockId.Air);
          if (this.onBlockBreak) this.onBlockBreak(hit.wx, hit.wy, hit.wz, hit.blockId);
          this.state.breakingBlock = null;
        }
      }
    } else if (this.mouseDown.left && !hit.hit) {
      this.state.breakingBlock = null;
    }

    // Right click: place or interact (e.g., prime TNT)
    if (this.mouseDown.right && hit.hit && this.placeCooldown <= 0) {
      // Try consuming/using the held item first (eating, etc.)
      if (this.onUseItem && this.onUseItem()) {
        this.mouseDown.right = false;
        this.placeCooldown = 0.4;
        return;
      }
      // Block interaction (furnace, chest, crafting table...)
      if (this.onInteractBlock && this.onInteractBlock(hit.wx, hit.wy, hit.wz, hit.blockId)) {
        this.mouseDown.right = false;
        this.placeCooldown = 0.4;
        return;
      }
      // Prime TNT: in creative always; in survival if held item is a tool or nothing
      if (hit.blockId === BlockId.TNT) {
        const held = this.getHeldBlockId();
        const heldDef = BLOCKS[held];
        const isTool = heldDef?.floatInCreative; // tools/food
        if (this.state.gameMode === "creative" || isTool || held === BlockId.Air) {
          if (this.onPrimeTNT) this.onPrimeTNT(hit.wx, hit.wy, hit.wz);
          this.mouseDown.right = false;
          this.placeCooldown = 0.5;
          return;
        }
      }
      const px = hit.wx + hit.nx;
      const py = hit.wy + hit.ny;
      const pz = hit.wz + hit.nz;
      // don't place inside player
      const hw = PLAYER_WIDTH/2;
      const pminX = this.state.position.x - hw, pmaxX = this.state.position.x + hw;
      const pminY = this.state.position.y,      pmaxY = this.state.position.y + PLAYER_HEIGHT;
      const pminZ = this.state.position.z - hw, pmaxZ = this.state.position.z + hw;
      if (px+1 > pminX && px < pmaxX && py+1 > pminY && py < pmaxY && pz+1 > pminZ && pz < pmaxZ) {
        // overlapping player bbox
      } else {
        const held = this.getHeldBlockId();
        if (held && BLOCKS[held] && (BLOCKS[held].solid || BLOCKS[held].floatInCreative === false)) {
          // For phase 1: only place solid "block" items (not tools/food)
          const def = BLOCKS[held];
          if (def.solid || held === BlockId.Torch || held === BlockId.TallGrass || held === BlockId.Flower || held === BlockId.Mushroom || held === BlockId.FlowerYellow || held === BlockId.MushroomBrown) {
            // Special TNT placement: place TNT block (priming via left-click on TNT handled elsewhere)
            this.world.setBlockWorld(px, py, pz, held);
            if (this.onBlockPlace) this.onBlockPlace(px,py,pz,held);
            // In survival consume one from stack (handled by inventory system elsewhere)
            this.placeCooldown = 0.2;
          }
        }
      }
    }
    // Right click with no block target: still allow item use (eating)
    if (this.mouseDown.right && !hit.hit && this.placeCooldown <= 0) {
      if (this.onUseItem && this.onUseItem()) {
        this.mouseDown.right = false;
        this.placeCooldown = 0.4;
      }
    }
  }

  // Inventory integration: these will be populated by inventory UI
  public getHeldBlockId: () => BlockId = () => BlockId.Dirt; // overridden
  public consumeHeldItem: () => void = () => {};

  teleport(x: number, y: number, z: number) {
    this.state.position.set(x, y, z);
    this.state.velocity.set(0, 0, 0);
  }
  setGameMode(mode: "creative" | "survival") {
    this.state.gameMode = mode;
    if (mode === "creative") this.state.flying = true;
    else this.state.flying = false;
  }
  toggleFlight() {
    if (this.state.gameMode === "creative") this.state.flying = !this.state.flying;
  }
}
