import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Settings, Target, WorldSave } from '../core/types';
import { DIMENSIONS } from '../core/types';
import type { VoxelWorld } from '../world/World';

export class PlayerController {
  position = new Vector3(2.5, 50, -4.5);
  velocity = Vector3.Zero();
  keys = new Set<string>();
  yaw = 0; pitch = .05; grounded = false; flying = false; active = false;
  private lastJump = 0;
  private fallSpeed = 0;
  private stepTimer = 0;
  onFall?: (amount: number) => void;
  onStep?: () => void;
  onJump?: () => void;
  constructor(public camera: FreeCamera, private world: VoxelWorld, private save: WorldSave, public settings: Settings) {
    this.position.copyFromFloats(...save.player.position); this.yaw = save.player.rotation[0]; this.pitch = save.player.rotation[1];
    camera.minZ = .05; camera.maxZ = 1100; this.updateCamera();
  }
  look(dx: number, dy: number) {
    if (!this.active) return;
    this.yaw += dx * .002 * this.settings.sensitivity;
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch + dy * .002 * this.settings.sensitivity * (this.settings.invertY ? -1 : 1)));
  }
  keyDown(code: string) {
    if (code === 'Space' && !this.keys.has(code)) {
      const now = performance.now();
      if (now - this.lastJump < 280 && this.save.mode === 'creative') { this.flying = !this.flying; this.velocity.y = 0; }
      this.lastJump = now;
    }
    if (code === 'KeyV' && this.save.mode === 'creative') { this.flying = !this.flying; this.velocity.y = 0; }
    this.keys.add(code);
  }
  collides(x: number, y: number, z: number): boolean {
    for (let bx = Math.floor(x - .29); bx <= Math.floor(x + .29); bx++) for (let bz = Math.floor(z - .29); bz <= Math.floor(z + .29); bz++) for (let by = Math.floor(y + .001); by <= Math.floor(y + 1.78); by++) if (this.world.solid(bx, by, bz)) return true;
    return false;
  }
  intersectsBlock(x: number, y: number, z: number) {
    return x + 1 > this.position.x - .3 && x < this.position.x + .3 && y + 1 > this.position.y && y < this.position.y + 1.8 && z + 1 > this.position.z - .3 && z < this.position.z + .3;
  }
  update(dt: number) {
    if (!this.active || !this.world.isLoaded(this.position.x, this.position.z)) return;
    if (this.save.mode !== 'creative') this.flying = false;
    const keys = this.keys, swimming = this.world.fluidAt?.(this.position.x,this.position.y+1,this.position.z) ?? (this.position.y + 1 < DIMENSIONS[this.save.dimension].water && !this.world.solid(this.position.x, this.position.y + 1, this.position.z));
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight'), crouch = keys.has('ControlLeft') || keys.has('KeyC');
    const moving = forward !== 0 || strafe !== 0;
    const speed = this.flying ? this.settings.flightSpeed * (sprint ? 2 : 1) : swimming ? 3 : crouch ? 2 : sprint ? 7.5 : 4.7;
    const length = Math.hypot(forward, strafe) || 1;
    const dx = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / length * speed * dt;
    const dz = (Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) / length * speed * dt;
    for (const [axis, change] of [['x', dx], ['z', dz]] as const) {
      if (!change) continue;
      const next = this.position.clone(); next[axis] += change;
      if (!this.world.isLoaded(next.x, next.z)) continue;
      const edge = crouch && this.grounded && !this.flying && !this.collides(next.x, next.y - .55, next.z);
      if (edge) continue;
      if (!this.collides(next.x, next.y, next.z)) this.position.copyFrom(next);
      else if (this.grounded && !crouch && !this.collides(next.x, next.y + 1.01, next.z)) { next.y += 1.01; this.position.copyFrom(next); }
    }
    if (this.flying) this.velocity.y = (Number(keys.has('Space')) - Number(crouch)) * speed;
    else {
      this.velocity.y -= (swimming ? 5 : 25) * dt;
      if (swimming) this.velocity.y = Math.max(-3, this.velocity.y * .95);
      if (keys.has('Space') && (this.grounded || swimming)) { this.velocity.y = swimming ? 4 : 8.7; if (!swimming) this.onJump?.(); this.grounded = false; }
    }
    this.fallSpeed = Math.min(this.fallSpeed, this.velocity.y);
    const dy = this.velocity.y * dt, steps = Math.max(1, Math.ceil(Math.abs(dy) / .3));
    this.grounded = false;
    for (let i = 0; i < steps; i++) {
      const nextY = this.position.y + dy / steps;
      if (!this.collides(this.position.x, nextY, this.position.z)) this.position.y = nextY;
      else {
        if (dy < 0) {
          this.grounded = true;
          if (this.fallSpeed < -13 && !swimming && !this.flying) this.onFall?.(Math.floor((-this.fallSpeed - 12) * .75));
          this.fallSpeed = 0;
        }
        this.velocity.y = 0; break;
      }
    }
    if (this.flying || swimming) this.fallSpeed = 0;
    if (moving && this.grounded && !this.flying) { this.stepTimer += dt; if (this.stepTimer > (sprint ? .27 : .4)) { this.onStep?.(); this.stepTimer = 0; } }
    if (this.position.y < -35) this.onFall?.(99);
    this.updateCamera();
  }
  updateCamera() {
    this.camera.position.copyFrom(this.position); this.camera.position.y += this.keys.has('ControlLeft') && !this.flying ? 1.4 : 1.62;
    this.camera.rotation.set(this.pitch, this.yaw, 0); this.camera.fov = this.settings.fov * Math.PI / 180;
  }
  target(maxDistance = 7): Target | null {
    const origin = this.camera.position, direction = this.camera.getForwardRay().direction;
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = direction.x >= 0 ? 1 : -1, sy = direction.y >= 0 ? 1 : -1, sz = direction.z >= 0 ? 1 : -1;
    const tx = Math.abs(1 / direction.x), ty = Math.abs(1 / direction.y), tz = Math.abs(1 / direction.z);
    let ax = (direction.x >= 0 ? x + 1 - origin.x : origin.x - x) * tx;
    let ay = (direction.y >= 0 ? y + 1 - origin.y : origin.y - y) * ty;
    let az = (direction.z >= 0 ? z + 1 - origin.z : origin.z - z) * tz;
    let distance = 0, normal: [number, number, number] = [0, 1, 0];
    while (distance <= maxDistance) {
      const id = this.world.getBlock(x, y, z);
      if (id) return { x, y, z, id, normal, distance };
      if (ax < ay && ax < az) { x += sx; distance = ax; ax += tx; normal = [-sx, 0, 0]; }
      else if (ay < az) { y += sy; distance = ay; ay += ty; normal = [0, -sy, 0]; }
      else { z += sz; distance = az; az += tz; normal = [0, 0, -sz]; }
    }
    return null;
  }
  teleport(position: [number, number, number]) { this.position.copyFromFloats(...position); this.velocity.setAll(0); this.fallSpeed = 0; this.updateCamera(); }
  serialize() { this.save.player.position = this.position.asArray() as [number, number, number]; this.save.player.rotation = [this.yaw, this.pitch]; }
}