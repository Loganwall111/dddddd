/**
 * THE MULTIVERSE — engine/camera.js
 * ==================================================================
 * The camera rig. Two modes (first person, over-the-shoulder third person),
 * plus everything that makes a camera feel *cinematic* rather than attached:
 *
 *   • spring-arm collision so the third-person camera never enters rock
 *   • trauma-based shake (impact, thunder, the Great One's heartbeat)
 *   • fov impulses on sprint, dive and reality transitions
 *   • head bob, breath sway, and a slow idle drift so stills are never static
 *   • underwater roll/wobble, and a ghost-mode float
 */
import { clamp, clamp01, damp, dampAngle, lerp, smoothstep, wrap } from '../core/math.js';

export const CAMERA_MODES = ['first', 'third', 'cinematic', 'free'];

export class CameraRig {
  constructor({ fov = 72, near = 0.15, far = 26000 } = {}) {
    this.fov = fov;
    this.baseFov = fov;
    this.near = near;
    this.far = far;
    this.mode = 'first';
    this.yaw = 0;
    this.pitch = 0;
    this.position = { x: 0, y: 0, z: 0 };
    this.target = { x: 0, y: 0, z: 0 };
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    this.roll = 0;
    this.trauma = 0;
    this.bob = 0;
    this.sway = 0;
    this.distance = 4.4; // third-person arm length
    this.armLength = this.distance;
    this.aimOffset = 0.35;
    this.shoulder = 1; // 1 = right shoulder, -1 = left
    this.fovImpulse = 0;
    this.landImpulse = 0;
    this.time = 0;
    this.shakeSeed = Math.random() * 1000;
    this.underwater = 0;
    this.ghost = 0;
    this.cinematic = null; // { from, to, duration, elapsed, ease }
    this.lastPosition = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  setMode(mode) {
    if (!CAMERA_MODES.includes(mode)) return;
    this.mode = mode;
  }

  /** Add shake energy (0..1). Values accumulate and decay on their own. */
  addTrauma(amount) {
    this.trauma = clamp01(this.trauma + amount);
  }

  /** A one-off fov kick, in degrees (negative = punch-in). */
  kick(degrees) {
    this.fovImpulse += degrees;
  }

  /** Play a scripted camera move (used by the intro and realm transitions). */
  playCinematic({ from, to, duration = 3, ease = 'easeInOut', onDone = null, lookAt = null }) {
    this.cinematic = { from, to, duration, elapsed: 0, ease, onDone, lookAt };
    this.mode = 'cinematic';
  }

  stopCinematic() {
    this.cinematic = null;
    if (this.mode === 'cinematic') this.mode = 'first';
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, player, {
    mode = null,
    groundHeight = null,
    shake = 1,
    underwater = 0,
    ghost = false,
    lookSmoothing = 14,
    thirdPersonBlocked = null,
    cinematicTarget = null,
  } = {}) {
    this.time += dt;
    if (mode) this.setMode(mode);
    this.underwater = damp(this.underwater, underwater, 4, dt);
    this.ghost = damp(this.ghost, ghost ? 1 : 0, 3, dt);

    // Smoothly follow the player's own yaw/pitch (input already applied).
    this.yaw = dampAngle(this.yaw, player.yaw, lookSmoothing, dt);
    this.pitch = damp(this.pitch, player.pitch, lookSmoothing, dt);

    // Idle drift: nothing in this game is ever perfectly still.
    const idle = clamp01(1 - Math.min(1, player.speed / 3));
    this.sway += dt * (0.9 + idle * 0.5);
    const swayX = Math.sin(this.sway * 0.7) * 0.012 * idle;
    const swayY = Math.cos(this.sway * 0.9) * 0.008 * idle;

    // Head bob, scaled by speed.
    const speedFactor = clamp01(player.speed / 8);
    this.bob += dt * (6.2 + speedFactor * 5.4) * clamp01(speedFactor * 1.6);
    const bobAmount = speedFactor * 0.055 * (player.grounded ? 1 : 0.2);
    const bobY = Math.sin(this.bob * 2) * bobAmount;
    const bobX = Math.cos(this.bob) * bobAmount * 0.6;

    const eyeX = player.position.x;
    const eyeY = player.position.y + player.eyeHeight;
    const eyeZ = player.position.z;

    if (this.mode === 'first') {
      const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
      this.position.x = eyeX + right.x * (bobX + swayX * 3);
      this.position.y = eyeY + bobY + swayY * 2 + this.landImpulse;
      this.position.z = eyeZ + right.z * (bobX + swayX * 3);
    } else if (this.mode === 'third') {
      // Spring arm: pull the camera back behind the player, collide with rock.
      const desired = this._armTarget(eyeX, eyeY, eyeZ);
      let length = this.distance;
      if (thirdPersonBlocked) {
        // March along the arm and stop short of the first blocked sample.
        const steps = 6;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const sx = lerp(eyeX, desired.x, t);
          const sy = lerp(eyeY, desired.y, t);
          const sz = lerp(eyeZ, desired.z, t);
          const ground = groundHeight ? groundHeight(sx, sz, sy) : null;
          if (ground != null && sy < ground + 0.55) {
            length = this.distance * ((i - 1) / steps);
            break;
          }
        }
      }
      this.armLength = damp(this.armLength, Math.max(0.6, length), 8, dt);
      const t = this.armLength / this.distance;
      this.position.x = lerp(eyeX, desired.x, t);
      this.position.y = lerp(eyeY, desired.y, t);
      this.position.z = lerp(eyeZ, desired.z, t);
    } else if (this.mode === 'cinematic' && this.cinematic) {
      const cine = this.cinematic;
      cine.elapsed += dt;
      const raw = clamp01(cine.elapsed / cine.duration);
      const eased = easeFn(cine.ease, raw);
      const from = cine.from;
      const to = cine.to;
      this.position.x = lerp(from.x, to.x, eased);
      this.position.y = lerp(from.y, to.y, eased);
      this.position.z = lerp(from.z, to.z, eased);
      if (cine.lookAt) {
        const target = typeof cine.lookAt === 'function' ? cine.lookAt() : cine.lookAt;
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const dz = target.z - this.position.z;
        this.yaw = Math.atan2(dx, dz);
        this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      }
      if (raw >= 1) {
        const done = cine.onDone;
        this.cinematic = null;
        this.mode = 'free';
        done?.();
      }
    } else if (this.mode === 'free') {
      if (cinematicTarget) {
        this.yaw = dampAngle(this.yaw, cinematicTarget.yaw ?? this.yaw, 2, dt);
        this.pitch = damp(this.pitch, cinematicTarget.pitch ?? this.pitch, 2, dt);
        if (cinematicTarget.position) {
          this.position.x = damp(this.position.x, cinematicTarget.position.x, 2.5, dt);
          this.position.y = damp(this.position.y, cinematicTarget.position.y, 2.5, dt);
          this.position.z = damp(this.position.z, cinematicTarget.position.z, 2.5, dt);
        }
      }
    }

    // ---- shake ----
    this.trauma = Math.max(0, this.trauma - dt * 1.35);
    const shakeAmount = this.trauma * this.trauma * shake;
    const t = this.time * 34 + this.shakeSeed;
    const shakePitch = noise(t) * 0.055 * shakeAmount + noise(t * 1.7 + 11) * 0.02 * shakeAmount;
    const shakeYaw = noise(t * 1.3 + 5) * 0.05 * shakeAmount;
    const shakeRoll = noise(t * 0.8 + 21) * 0.06 * shakeAmount;
    const shakeY = noise(t * 2.1 + 3) * 0.09 * shakeAmount;

    // ---- roll: lean into strafes, wobble underwater ----
    const lean = clamp(-player.velocity.x * Math.cos(this.yaw) - player.velocity.z * -Math.sin(this.yaw), -8, 8) * 0.006;
    const waterRoll = Math.sin(this.time * 0.8) * 0.035 * this.underwater;
    this.roll = damp(this.roll, lean + waterRoll, 5, dt) + shakeRoll;

    this.position.y += shakeY;

    // ---- fov ----
    this.fovImpulse = damp(this.fovImpulse, 0, 4, dt);
    const speedFov = clamp01((player.speed - 6) / 8) * 6;
    const baseFov = this.baseFov + speedFov * (this.mode === 'first' ? 1 : 0.6);
    this.fov = damp(this.fov, baseFov + this.fovImpulse + this.underwater * -4 + this.ghost * 6, 6, dt);

    // ---- look target (for the renderer to orient a camera on) ----
    this.target.x = this.position.x + Math.sin(this.yaw) * Math.cos(this.pitch);
    this.target.y = this.position.y + Math.sin(this.pitch);
    this.target.z = this.position.z + Math.cos(this.yaw) * Math.cos(this.pitch);

    this.velocity.x = (this.position.x - this.lastPosition.x) / Math.max(0.0001, dt);
    this.velocity.y = (this.position.y - this.lastPosition.y) / Math.max(0.0001, dt);
    this.velocity.z = (this.position.z - this.lastPosition.z) / Math.max(0.0001, dt);
    this.lastPosition = { ...this.position };

    return this;
  }

  _armTarget(x, y, z) {
    const shoulderX = Math.cos(this.yaw) * this.shoulder * this.aimOffset;
    const shoulderZ = -Math.sin(this.yaw) * this.shoulder * this.aimOffset;
    const cx = Math.cos(this.yaw);
    const sx = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    return {
      x: x + shoulderX - sx * cp * this.distance,
      y: y + shoulderZ * 0 + 0.25 - sp * this.distance,
      z: z + shoulderZ - cx * cp * this.distance,
    };
  }

  toggleShoulder() {
    this.shoulder *= -1;
  }

  /** Forward vector in world space (unit). */
  forward() {
    const cp = Math.cos(this.pitch);
    return { x: Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * cp };
  }

  /** Right vector in world space (unit, horizontal). */
  right() {
    return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
  }

  /** Where the player is looking, on the ground (for the scanner). */
  groundTarget(distance = 40, groundHeight = null) {
    const forward = this.forward();
    const x = this.position.x + forward.x * distance;
    const z = this.position.z + forward.z * distance;
    const y = groundHeight ? groundHeight(x, z) : 0;
    return { x, y, z, distance };
  }

  serialize() {
    return { yaw: this.yaw, pitch: this.pitch, mode: this.mode, roll: this.roll, fov: this.fov };
  }
}

function easeFn(name, t) {
  switch (name) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
    default:
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

/** Cheap deterministic 1-D value noise for shake. */
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1f(i);
  const b = hash1f(i + 1);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

function hash1f(x) {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export { smoothstep, wrap, clamp01, lerp };
