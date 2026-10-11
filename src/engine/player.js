/**
 * THE MULTIVERSE — engine/player.js
 * ==================================================================
 * SIMOLYSIS, as a body. The player controller handles the six ways you can
 * exist in this game:
 *
 *   GROUND  — walking, sprinting, jumping, coyote time, slope limits
 *   AIR     — falling with drag, terminal velocity, air control
 *   WATER   — swimming with buoyancy, drag, breath and kick-off
 *   FLIGHT  — creative flight (unlocked in the cities realm and by upgrade)
 *   GHOST   — out-of-body: no collision, no gravity, pass through everything
 *   CLIMB   — grabbing cliff faces, which the valley is full of
 *
 * The controller is deliberately free of THREE: it integrates a position and
 * asks the world for ground heights, which keeps it unit-testable in Node.
 */
import { clamp, clamp01, damp, dampAngle, lerp, moveToward, wrap } from '../core/math.js';

export const PLAYER_STATES = ['ground', 'air', 'water', 'flight', 'ghost', 'climb', 'dead'];

export const PLAYER_TUNING = {
  radius: 0.42,
  height: 1.8,
  eyeHeight: 1.66,
  crouchEyeHeight: 0.98,
  walkSpeed: 5.4,
  runSpeed: 10.2,
  crouchSpeed: 2.4,
  swimSpeed: 4.6,
  swimDashSpeed: 9.5,
  flySpeed: 34,
  flyBoostSpeed: 120,
  ghostSpeed: 22,
  jumpHeight: 1.35,
  gravity: 22.5,
  airControl: 0.34,
  groundAccel: 42,
  groundFriction: 12,
  airDrag: 0.35,
  waterDrag: 1.6,
  buoyancy: 12.5,
  coyoteTime: 0.16,
  jumpBuffer: 0.14,
  maxSlope: 0.72, // cos of the steepest walkable angle (~44°)
  stepHeight: 0.62,
  climbSpeed: 3.6,
  breatheDrain: 0.055, // breath per second underwater
  breatheRefill: 0.32,
  staminaDrain: 0.16,
  staminaRefill: 0.24,
  fallDamageSpeed: 26,
  terminalVelocity: 90,
};

export class Player {
  constructor({ field = null, tuning = {}, spawn = { x: 0, y: 40, z: 0 } } = {}) {
    this.tuning = { ...PLAYER_TUNING, ...tuning };
    this.field = field;
    this.position = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.state = 'air';
    this.grounded = false;
    this.wasGrounded = false;
    this.coyote = 0;
    this.jumpBuffered = 0;
    this.crouching = false;
    this.sprinting = false;
    this.eyeHeight = this.tuning.eyeHeight;
    this.targetEyeHeight = this.tuning.eyeHeight;
    this.headBob = 0;
    this.breath = 1;
    this.stamina = 1;
    this.health = 1;
    this.fallStart = this.position.y;
    this.lastImpact = 0;
    this.stepDistance = 0;
    this.swimKick = false;
    this.waterLevel = 0;
    this.surfaceY = null;
    this.underwater = false;
    this.ghost = false;
    this.ghostCharge = 1;
    this.flying = false;
    this.climbing = false;
    this.groundProvider = null;
    this.groundProviders = [];
    this.onFootstep = null;
    this.onSplash = null;
    this.onLand = null;
    this.onSwimStroke = null;
    this.onStateChange = null;
    this.abilities = { fly: false, ghost: true, climb: true, breathe: true };
    this.timeInState = 0;
    this.distanceTravelled = 0;
    this.spawn = { ...spawn };
  }

  reset(spawn = this.spawn) {
    this.position = { ...spawn };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.state = 'air';
    this.grounded = false;
    this.health = 1;
    this.breath = 1;
    this.stamina = 1;
    this.ghost = false;
    this.flying = false;
  }

  get eye() {
    return {
      x: this.position.x,
      y: this.position.y + this.eyeHeight,
      z: this.position.z,
    };
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get forwardVector() {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    return { x: sy * cp, y: sp, z: cy * cp };
  }

  /* ---------------------------------------------------------------- *
   * Ground queries
   * ---------------------------------------------------------------- */

  groundHeight(x, z, y = this.position.y) {
    if (this.groundProvider) {
      const value = this.groundProvider(x, z, y);
      if (value != null) return value;
    }
    for (const provider of this.groundProviders) {
      const value = provider(x, z, y);
      if (value != null && Math.abs(value - y) < 80) return value;
    }
    return this.field ? this.field.heightAt(x, z) : 0;
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    if (this.field?.normalAt) return this.field.normalAt(x, z, out, 1.2);
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Intent
   * ---------------------------------------------------------------- */

  /** Translate input + realm rules into a movement intent. */
  readIntent(input, realm = null, { mode = 'normal' } = {}) {
    const move = input.moveVector();
    const look = input.lookDelta();
    this.yaw = wrap(this.yaw + look.yaw, Math.PI * 2);
    this.pitch = clamp(this.pitch + look.pitch, -1.5, 1.5);

    if (input.wasPressed('crouch')) this.crouching = !this.crouching;
    const wantSprint = input.isDown('sprint');
    const wantJump = input.wasPressed('jump');
    const holdJump = input.isDown('jump');

    if (wantJump) this.jumpBuffered = this.tuning.jumpBuffer;
    if (input.wasPressed('fly') && this.abilities.fly) this.flying = !this.flying;
    if (input.wasPressed('ghost') && this.abilities.ghost) this.ghost = !this.ghost;
    if (input.wasPressed('drop')) this.climbing = false;

    // Realm physics override (gravity scale, water-only realms, etc.)
    const physics = realm?.physics ?? null;
    this.realmPhysics = physics;
    this.mode = mode;

    return { move, wantSprint, wantJump, holdJump, rise: move.magnitude > 0.05 ? 1 : 0 };
  }

  /* ---------------------------------------------------------------- *
   * Integration
   * ---------------------------------------------------------------- */

  update(dt, ctx = {}) {
    const {
      input = null,
      realm = null,
      waterLevel = 0,
      underwater = false,
      movingGround = null,
      mode = 'normal',
      timeScale = 1,
    } = ctx;
    dt = Math.min(dt, 0.05) * timeScale;
    if (dt <= 0) return;
    this.timeInState += dt;
    this.waterLevel = waterLevel;

    const intent = input ? this.readIntent(input, realm, { mode }) : { move: { x: 0, z: 0, magnitude: 0 }, wantSprint: false, wantJump: false, holdJump: false };
    const physics = realm?.physics ?? {};
    const gravityScale = physics.gravity ?? 1;
    let gravity = this.tuning.gravity * gravityScale;
    const canBreath = physics.underwater !== true && !physics.oxygen;

    // ---- ability gates ----
    if (mode === 'ui') {
      this.velocity.x = this.velocity.y = this.velocity.z = 0;
      return;
    }
    if (physics.ghostOnly && !this.ghost) this.ghost = true;
    if (this.abilities.fly === false && realm?.id === 'cities') this.abilities.fly = true;

    // ---- where is the ground? ----
    const ground = this.groundHeight(this.position.x, this.position.z, this.position.y);
    const floorGap = this.position.y - ground;
    const wasGrounded = this.grounded;

    // ---- state selection ----
    const feetBelowWater = this.position.y < waterLevel - 0.1;
    const fullyWet = this.position.y + this.tuning.height * 0.6 < waterLevel;
    if (this.ghost) {
      this._setState('ghost');
    } else if (this.flying && this.abilities.fly) {
      this._setState('flight');
    } else if (fullyWet || (physics.underwater && !this.grounded)) {
      this._setState('water');
    } else if (this.climbing && !this.grounded) {
      this._setState('climb');
    } else if (this.grounded) {
      this._setState('ground');
    } else {
      this._setState('air');
    }
    // Automatic swim state: entering deep water shouldn't need a key press.
    if (!this.ghost && !this.flying && feetBelowWater && !this.grounded && this.state === 'air') this._setState('water');

    // ---- movement per state ----
    const move = intent.move;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // Camera-relative: forward is +z in our convention.
    const wishX = move.x * cosY + move.z * sinY;
    const wishZ = move.x * -sinY + move.z * cosY;

    switch (this.state) {
      case 'ghost': {
        const speed = this.tuning.ghostSpeed * (intent.wantSprint ? 3.4 : 1);
        const pitchLift = Math.sin(this.pitch);
        const target = {
          x: wishX * speed,
          y: pitchLift * speed * (move.magnitude > 0.02 ? 1 : 0) + (intent.holdJump ? speed * 0.6 : 0) - (this.crouching ? speed * 0.6 : 0),
          z: wishZ * speed,
        };
        this.velocity.x = damp(this.velocity.x, target.x, 4, dt);
        this.velocity.y = damp(this.velocity.y, target.y, 4, dt);
        this.velocity.z = damp(this.velocity.z, target.z, 4, dt);
        this.ghostCharge = clamp01(this.ghostCharge + dt * 0.05);
        break;
      }
      case 'flight': {
        const boost = intent.wantSprint ? this.tuning.flyBoostSpeed : this.tuning.flySpeed;
        const pitchLift = Math.sin(this.pitch) * boost;
        const target = {
          x: wishX * boost,
          y: (move.magnitude > 0.02 ? pitchLift : 0) + (intent.holdJump ? boost * 0.7 : 0) - (this.crouching ? boost * 0.7 : 0),
          z: wishZ * boost,
        };
        this.velocity.x = damp(this.velocity.x, target.x, 3.2, dt);
        this.velocity.y = damp(this.velocity.y, target.y, 3.2, dt);
        this.velocity.z = damp(this.velocity.z, target.z, 3.2, dt);
        break;
      }
      case 'water': {
        const speed = intent.wantSprint ? this.tuning.swimDashSpeed : this.tuning.swimSpeed;
        const pitch = Math.sin(this.pitch);
        const target = {
          x: wishX * speed,
          y: (move.magnitude > 0.02 ? pitch * speed : 0) + (intent.holdJump ? speed * 0.8 : 0) - (this.crouching ? speed * 0.9 : 0),
          z: wishZ * speed,
        };
        // Buoyancy pushes the player back to the surface when not diving.
        const surfaceDelta = waterLevel - this.position.y;
        if (!this.crouching && this.position.y + 0.6 > waterLevel - 0.25) {
          target.y += clamp(surfaceDelta, -1.5, 3.4) * 2.2;
        }
        const drag = this.tuning.waterDrag;
        this.velocity.x = damp(this.velocity.x, target.x, drag, dt);
        this.velocity.y = damp(this.velocity.y, target.y, drag, dt);
        this.velocity.z = damp(this.velocity.z, target.z, drag, dt);
        // `underwater` is the world's own water veto (some realms have none);
        // `this.underwater` is the head-height test the controller performs.
        const submerged = underwater || this.underwater;
        this.breath = clamp01(this.breath - dt * (submerged ? this.tuning.breatheDrain : -this.tuning.breatheRefill));
        if (move.magnitude > 0.4) {
          this.swimStrokeTimer = (this.swimStrokeTimer ?? 0) - dt;
          if (this.swimStrokeTimer <= 0) {
            this.swimStrokeTimer = 1.1;
            this.onSwimStroke?.();
          }
        }
        break;
      }
      case 'climb': {
        const speed = this.tuning.climbSpeed;
        const climbing = intent.holdJump;
        this.velocity.x = damp(this.velocity.x, wishX * speed * 0.5, 8, dt);
        this.velocity.z = damp(this.velocity.z, wishZ * speed * 0.5, 8, dt);
        this.velocity.y = damp(this.velocity.y, climbing ? speed : intent.wantJump ? -speed * 0.6 : -0.4, 8, dt);
        this.stamina = clamp01(this.stamina - dt * 0.06);
        if (this.stamina <= 0.02) this.climbing = false;
        break;
      }
      case 'ground': {
        const speed = this.crouching ? this.tuning.crouchSpeed : intent.wantSprint && this.stamina > 0.05 ? this.tuning.runSpeed : this.tuning.walkSpeed;
        const accel = this.tuning.groundAccel * (this.grounded ? 1 : 0.4);
        this.velocity.x = moveToward(this.velocity.x, wishX * speed, accel * dt);
        this.velocity.z = moveToward(this.velocity.z, wishZ * speed, accel * dt);
        if (move.magnitude > 0.02) {
          const friction = this.tuning.groundFriction * dt;
          void friction;
        } else {
          this.velocity.x = moveToward(this.velocity.x, 0, this.tuning.groundFriction * dt);
          this.velocity.z = moveToward(this.velocity.z, 0, this.tuning.groundFriction * dt);
        }
        // Steep ground: slide down the fall line.
        const normal = this.normalAt(this.position.x, this.position.z);
        if (normal.y < this.tuning.maxSlope) {
          const slideX = normal.x * gravity * 0.5 * dt;
          const slideZ = normal.z * gravity * 0.5 * dt;
          this.velocity.x += slideX;
          this.velocity.z += slideZ;
          if (normal.y < 0.35 && this.abilities.climb && intent.holdJump) this.climbing = true;
        }
        this.velocity.y -= gravity * dt;
        break;
      }
      case 'air':
      default: {
        const airControl = this.tuning.airControl * (this.grounded ? 1 : 1);
        const speed = intent.wantSprint ? this.tuning.runSpeed : this.tuning.walkSpeed;
        this.velocity.x = moveToward(this.velocity.x, wishX * speed, this.tuning.groundAccel * airControl * dt);
        this.velocity.z = moveToward(this.velocity.z, wishZ * speed, this.tuning.groundAccel * airControl * dt);
        this.velocity.y -= gravity * dt;
        this.velocity.y = Math.max(this.velocity.y, -this.tuning.terminalVelocity);
        break;
      }
    }

    // ---- jump handling (all states that can leave the ground) ----
    if (this.jumpBuffered > 0) this.jumpBuffered -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    const canJump = this.state === 'ground' || (this.state === 'air' && this.coyote > 0);
    if (this.jumpBuffered > 0 && canJump) {
      const jumpVelocity = Math.sqrt(2 * this.tuning.gravity * gravityScale * this.tuning.jumpHeight);
      this.velocity.y = jumpVelocity;
      this.jumpBuffered = 0;
      this.coyote = 0;
      this.grounded = false;
      this._setState('air');
      this.onFootstep?.('jump');
    }
    // Water exit: kick free at the surface.
    if (this.state === 'water' && this.position.y + 0.4 > waterLevel && intent.holdJump) {
      this.velocity.y += 10 * dt;
    }

    // ---- stamina ----
    if (this.state === 'ground' && intent.wantSprint && move.magnitude > 0.4) {
      this.stamina = clamp01(this.stamina - dt * this.tuning.staminaDrain);
    } else {
      this.stamina = clamp01(this.stamina + dt * this.tuning.staminaRefill);
    }

    // ---- integrate ----
    const previousY = this.position.y;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
    if (movingGround) {
      this.position.x += movingGround.x * dt;
      this.position.z += movingGround.z * dt;
    }
    this.distanceTravelled += Math.hypot(this.velocity.x, this.velocity.z) * dt;

    // ---- collision with the ground ----
    if (!this.ghost) {
      const newGround = this.groundHeight(this.position.x, this.position.z, this.position.y);
      const gap = this.position.y - newGround;
      if (gap <= 0) {
        // Step-up assistance, then hard landing.
        const stepDelta = newGround - previousY;
        if (this.state === 'ground' && stepDelta > 0 && stepDelta <= this.tuning.stepHeight && this.velocity.y <= 0.1) {
          this.position.y = newGround;
          this.velocity.y = 0;
        } else {
          const impact = -this.velocity.y;
          this.position.y = newGround;
          this.velocity.y = 0;
          if (!wasGrounded) {
            this.lastImpact = impact;
            const damage = impact > this.tuning.fallDamageSpeed ? (impact - this.tuning.fallDamageSpeed) * 0.02 : 0;
            this.health = clamp01(this.health - damage);
            if (damage > 0) this.onLand?.(impact, damage);
            this.onFootstep?.(impact > 12 ? 'heavy' : 'land');
          }
          this.grounded = true;
          this.coyote = this.tuning.coyoteTime;
          if (this.state === 'air') this._setState('ground');
        }
      } else if (gap > 0.08) {
        this.grounded = false;
      } else {
        this.grounded = true;
      }

      // Cliff safety rail out of the world.
      const worldRadius = this.field?.options?.worldRadius ?? 4200;
      const distanceFromCentre = Math.hypot(this.position.x, this.position.z);
      if (distanceFromCentre > worldRadius * 1.1) {
        const pull = (distanceFromCentre - worldRadius * 1.1) / 200;
        this.position.x -= (this.position.x / distanceFromCentre) * pull * dt * 30;
        this.position.z -= (this.position.z / distanceFromCentre) * pull * dt * 30;
      }
    }

    // ---- water entry ----
    const nowUnderwater = this.position.y + this.eyeHeight * 0.6 < waterLevel;
    if (nowUnderwater !== this.underwater) {
      this.underwater = nowUnderwater;
      if (nowUnderwater) {
        this.onSplash?.('enter', this.position, Math.abs(this.velocity.y));
        this.velocity.y *= 0.45;
      } else {
        this.onSplash?.('exit', this.position, 0);
        this.onFootstep?.('surface');
      }
    }

    // ---- footsteps ----
    if (this.state === 'ground' && this.grounded) {
      const interval = intent.wantSprint ? 0.34 : 0.52;
      this.stepDistance += this.speed * dt;
      if (this.stepDistance > interval * (this.speed > 1 ? this.speed : 1)) {
        this.stepDistance = 0;
        this.onFootstep?.(this.speed > 7 ? 'run' : this.crouching ? 'crouch' : 'walk');
      }
      this.headBob += this.speed * dt * 2.1;
      this.targetEyeHeight = this.crouching ? this.tuning.crouchEyeHeight : this.tuning.eyeHeight;
    } else {
      this.targetEyeHeight = this.tuning.eyeHeight;
    }
    this.eyeHeight = damp(this.eyeHeight, this.targetEyeHeight, 8, dt);

    // ---- death by drowning or falling ----
    if (this.breath <= 0) {
      this.health = clamp01(this.health - dt * 0.09);
      if (this.health <= 0 && this.state !== 'dead') this._setState('dead');
    }
    if (!canBreath && this.breath < 1) this.breath = clamp01(this.breath - dt * 0.02);
    if (this.health <= 0 && this.state !== 'dead') this._setState('dead');
    if (this.state === 'dead') {
      this.deadTime = (this.deadTime ?? 0) + dt;
      this.velocity.y -= gravity * dt;
    }

    this.wasGrounded = wasGrounded;
  }

  _setState(next) {
    if (this.state === next) return;
    const previous = this.state;
    this.state = next;
    this.timeInState = 0;
    this.onStateChange?.(next, previous);
  }

  /** Distance travelled — used by the discovery system. */
  get travelled() {
    return this.distanceTravelled;
  }

  serialize() {
    return {
      position: { ...this.position },
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      breath: this.breath,
      stamina: this.stamina,
    };
  }

  deserialize(state) {
    if (!state) return;
    Object.assign(this.position, state.position ?? {});
    this.yaw = state.yaw ?? 0;
    this.pitch = state.pitch ?? 0;
    this.health = state.health ?? 1;
    this.breath = state.breath ?? 1;
    this.stamina = state.stamina ?? 1;
  }
}

/* ------------------------------------------------------------------ *
 * Situational helpers (pure, testable)
 * ------------------------------------------------------------------ */

/** Speed multiplier from the surface you are standing on. */
export function surfaceTraction(biomeId, wetness = 0) {
  const base = biomeId === 'wetland' || biomeId === 'beach' ? 0.92 : biomeId === 'alpine' ? 0.88 : biomeId === 'crystal' ? 0.95 : 1;
  return clamp(base - wetness * 0.15, 0.7, 1.05);
}

/** How high the fog should rise when the player is inside a reality. */
export function visibilityFor(realm, weather) {
  const base = realm?.id === 'void' ? 900 : realm?.id === 'backrooms' ? 26 : realm?.id === 'maze' ? 60 : realm?.id === 'fractal' ? 300 : 6000;
  const weatherFactor = weather === 'storm' ? 0.35 : weather === 'mist' ? 0.25 : weather === 'rain' ? 0.6 : 1;
  return base * weatherFactor;
}

export { lerp, clamp01 };
