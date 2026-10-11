/**
 * THE MULTIVERSE — engine/input.js
 * ==================================================================
 * Input, bound to *actions* rather than keys. The player's hands are the
 * interface between two realities: keyboard, mouse, gamepad, touch. All
 * bindings are remappable and persisted by the settings system.
 *
 * Frame contract:  input.beginFrame() → read actions → input.endFrame()
 */
import { clamp } from '../core/math.js';

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'],
  scan: ['KeyQ'],
  fly: ['KeyF'],
  ghost: ['KeyG'],
  drop: ['KeyR'],
  camera: ['KeyV'],
  map: ['KeyM'],
  codex: ['Tab'],
  pause: ['Escape'],
  screenshot: ['F2'],
  screenshotHi: ['F9'],
  mute: ['KeyM', 'AudioVolumeMute'].slice(0, 1),
  quicksave: ['F5'],
  quickload: ['F6'],
  ascend: ['Space'],
  descend: ['KeyC'],
  narrate: ['KeyT'],
};

/** Human-readable labels for the settings screen and the help overlay. */
export const ACTION_LABELS = {
  forward: 'Walk forward',
  back: 'Walk back',
  left: 'Strafe left',
  right: 'Strafe right',
  jump: 'Jump / Ascend',
  sprint: 'Sprint / Dive',
  crouch: 'Crouch / Descend',
  interact: 'Interact',
  scan: 'Bioscan',
  fly: 'Flight mode',
  ghost: 'Dissolve (ghost)',
  drop: 'Drop through floor',
  camera: 'Camera shoulder',
  map: 'Atlas',
  codex: 'Codex',
  pause: 'Pause',
  screenshot: 'Capture frame',
  quicksave: 'Save reality',
  quickload: 'Load reality',
  narrate: 'Narrate this place',
};

const MOUSE_SENSITIVITY = 0.0022;

export class InputSystem {
  constructor({ canvas = document, settings = null, onAction = null } = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.onAction = onAction;
    this.bindings = structuredCloneish(DEFAULT_BINDINGS);
    this.actions = new Map(); // action -> { down, pressed, released, heldTime }
    this.keysDown = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: 0, y: 0, left: false, right: false, middle: false };
    this.locked = false;
    this.sensitivity = settings?.get?.('mouseSensitivity') ?? 1;
    this.invertY = settings?.get?.('invertY') ?? false;
    this.gamepadIndex = null;
    this.touch = { active: false, moveId: null, lookId: null, moveOrigin: { x: 0, y: 0 }, moveDelta: { x: 0, y: 0 }, lookDelta: { x: 0, y: 0 } };
    this.enabled = true;
    this._bound = [];
    this.attach();
  }

  static ACTION_LIST = Object.keys(DEFAULT_BINDINGS);

  attach(target = window) {
    const add = (element, type, fn, opts) => {
      element.addEventListener(type, fn, opts);
      this._bound.push([element, type, fn, opts]);
    };

    add(target, 'keydown', (event) => {
      if (!this.enabled) return;
      // Never swallow browser-critical combinations.
      if (event.ctrlKey && !event.altKey && ['KeyR', 'KeyT', 'KeyW', 'KeyN'].includes(event.code)) return;
      this.keysDown.add(event.code);
      const actions = this._actionsForKey(event.code);
      if (actions.length) {
        if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
        for (const action of actions) this._press(action, event);
      }
      this.onAction?.('keydown', event.code, event);
    });

    add(target, 'keyup', (event) => {
      this.keysDown.delete(event.code);
      for (const action of this._actionsForKey(event.code)) this._release(action, event);
      this.onAction?.('keyup', event.code, event);
    });

    add(target, 'blur', () => this.releaseAll());

    add(document, 'mousemove', (event) => {
      if (this.locked || this.fallbackLook) {
        this.mouse.dx += event.movementX ?? 0;
        this.mouse.dy += event.movementY ?? 0;
      }
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    });

    add(document, 'mousedown', (event) => {
      if (!this.enabled) return;
      if (event.button === 0) {
        this.mouse.left = true;
        if (this.locked) this._press('interact', event);
      }
      if (event.button === 2) this.mouse.right = true;
      if (event.button === 1) this.mouse.middle = true;
    });

    add(document, 'mouseup', (event) => {
      if (event.button === 0) {
        this.mouse.left = false;
        if (this.locked) this._release('interact', event);
      }
      if (event.button === 2) this.mouse.right = false;
      if (event.button === 1) this.mouse.middle = false;
    });

    add(target, 'wheel', (event) => {
      this.mouse.wheel += Math.sign(event.deltaY);
      if (this.locked) event.preventDefault();
    }, { passive: false });

    add(document, 'contextmenu', (event) => {
      if (this.locked) event.preventDefault();
    });

    add(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onAction?.('pointerlock', this.locked);
    });

    // Some browsers refuse pointer lock (iframe policies, Esc cooldown, kiosk
    // modes). Rather than losing mouse look entirely, fall back to raw
    // movementX/Y deltas and pretend we are locked.
    add(document, 'pointerlockerror', () => {
      if (this.locked) return;
      this.locked = true;
      this.fallbackLook = true;
      this.onAction?.('pointerlock', true);
    });

    // ---- touch: left half moves, right half looks ----
    add(this.canvas, 'touchstart', (event) => {
      if (!this.enabled) return;
      this.touch.active = true;
      for (const t of event.changedTouches) {
        const isLeft = t.clientX < window.innerWidth * 0.45;
        if (isLeft && this.touch.moveId == null) {
          this.touch.moveId = t.identifier;
          this.touch.moveOrigin.x = t.clientX;
          this.touch.moveOrigin.y = t.clientY;
        } else if (!isLeft && this.touch.lookId == null) {
          this.touch.lookId = t.identifier;
        }
      }
    }, { passive: true });

    add(this.canvas, 'touchmove', (event) => {
      for (const t of event.changedTouches) {
        if (t.identifier === this.touch.moveId) {
          this.touch.moveDelta.x = clamp((t.clientX - this.touch.moveOrigin.x) / 70, -1, 1);
          this.touch.moveDelta.y = clamp((t.clientY - this.touch.moveOrigin.y) / 70, -1, 1);
        } else if (t.identifier === this.touch.lookId) {
          this.mouse.dx += t.clientX - (this.touch.lastLookX ?? t.clientX);
          this.mouse.dy += t.clientY - (this.touch.lastLookY ?? t.clientY);
          this.touch.lastLookX = t.clientX;
          this.touch.lastLookY = t.clientY;
        }
      }
    }, { passive: true });

    const endTouch = (event) => {
      for (const t of event.changedTouches) {
        if (t.identifier === this.touch.moveId) {
          this.touch.moveId = null;
          this.touch.moveDelta.x = 0;
          this.touch.moveDelta.y = 0;
        } else if (t.identifier === this.touch.lookId) {
          this.touch.lookId = null;
          this.touch.lastLookX = undefined;
          this.touch.lastLookY = undefined;
        }
      }
      if (this.touch.moveId == null && this.touch.lookId == null) this.touch.active = false;
    };
    add(this.canvas, 'touchend', endTouch, { passive: true });
    add(this.canvas, 'touchcancel', endTouch, { passive: true });
  }

  detach() {
    for (const [element, type, fn, opts] of this._bound) element.removeEventListener(type, fn, opts);
    this._bound.length = 0;
  }

  _actionsForKey(code) {
    const out = [];
    for (const [action, keys] of Object.entries(this.bindings)) {
      if (keys.includes(code)) out.push(action);
    }
    return out;
  }

  _state(action) {
    if (!this.actions.has(action)) this.actions.set(action, { down: false, pressed: false, released: false, heldTime: 0 });
    return this.actions.get(action);
  }

  _press(action, event) {
    const state = this._state(action);
    if (state.down) return;
    state.down = true;
    state.pressed = true;
    state.heldTime = 0;
    this.onAction?.(action, event);
  }

  _release(action, event) {
    const state = this._state(action);
    if (!state.down) return;
    state.down = false;
    state.released = true;
    this.onAction?.(`${action}:release`, event);
  }

  releaseAll() {
    for (const [action, state] of this.actions) {
      if (state.down) {
        state.down = false;
        state.released = true;
        this.onAction?.(`${action}:release`);
      }
    }
    this.keysDown.clear();
    this.mouse.left = this.mouse.right = this.mouse.middle = false;
  }

  /** Poll the gamepad and fold it into the action state. */
  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = this.gamepadIndex != null ? pads[this.gamepadIndex] : null;
    if (!pad) {
      pad = Array.from(pads).find((p) => p && p.connected);
      this.gamepadIndex = pad ? pad.index : null;
    }
    this.gamepad = pad ?? null;
    if (!pad) return;
    const axis = (i, dead = 0.16) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < dead ? 0 : v;
    };
    this.padMove = { x: axis(0), y: axis(1) };
    this.padLook = { x: axis(2), y: axis(3) };
    if (this.padLook.x || this.padLook.y) {
      this.mouse.dx += this.padLook.x * 14;
      this.mouse.dy += this.padLook.y * 14;
    }
    const button = (i) => pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
    const map = [
      [0, 'jump'],
      [1, 'crouch'],
      [2, 'interact'],
      [3, 'scan'],
      [4, 'fly'],
      [5, 'ghost'],
      [6, 'sprint'],
      [7, 'sprint'],
      [9, 'pause'],
      [10, 'camera'],
      [12, 'forward'],
      [13, 'back'],
      [14, 'left'],
      [15, 'right'],
      [17, 'drop'],
    ];
    const now = new Set();
    for (const [index, action] of map) {
      if (!button(index)) continue;
      now.add(action);
      if (!this._state(action).down) this._press(action);
    }
    for (const action of [...this.actions.keys()]) {
      if (map.some(([, a]) => a === action) && !now.has(action) && this._state(action).down) {
        const stillKeyboard = this._actionsForKey([...this.keysDown][0] ?? '').includes(action);
        if (!stillKeyboard) this._release(action);
      }
    }
  }

  /** Call once per frame, before reading input. */
  beginFrame() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    if (!this.enabled) {
      this.releaseAll();
      return;
    }
    this.pollGamepad();
  }

  /** Call once per frame, after reading input. */
  endFrame(dt = 0) {
    for (const state of this.actions.values()) {
      state.pressed = false;
      state.released = false;
      if (state.down) state.heldTime += dt;
    }
  }

  isDown(action) {
    return this._state(action).down;
  }

  wasPressed(action) {
    return this._state(action).pressed;
  }

  wasReleased(action) {
    return this._state(action).released;
  }

  heldFor(action) {
    return this._state(action).heldTime;
  }

  /** Look delta in radians, already scaled by sensitivity and inversion. */
  lookDelta() {
    return {
      yaw: -this.mouse.dx * MOUSE_SENSITIVITY * this.sensitivity,
      pitch: (this.invertY ? this.mouse.dy : -this.mouse.dy) * MOUSE_SENSITIVITY * this.sensitivity,
    };
  }

  /** Normalised, camera-relative movement intent: {x: strafe, z: forward}. */
  moveVector() {
    let x = 0;
    let z = 0;
    if (this.isDown('forward')) z += 1;
    if (this.isDown('back')) z -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    if (this.padMove) {
      x += this.padMove.x;
      z -= this.padMove.y;
    }
    if (this.touch.moveDelta.x || this.touch.moveDelta.y) {
      x += this.touch.moveDelta.x;
      z -= this.touch.moveDelta.y;
    }
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    return { x, z, magnitude: Math.min(1, length) };
  }

  requestPointerLock() {
    this.canvas.requestPointerLock?.();
  }

  exitPointerLock() {
    if (this.fallbackLook) {
      this.fallbackLook = false;
      this.locked = false;
      this.onAction?.('pointerlock', false);
      return;
    }
    document.exitPointerLock?.();
  }

  setBinding(action, codes) {
    this.bindings[action] = Array.isArray(codes) ? codes : [codes];
    this.settings?.set?.(`bindings.${action}`, this.bindings[action]);
  }

  /** Which action a key would collide with (for the rebinding UI). */
  conflicting(action, code) {
    for (const [other, codes] of Object.entries(this.bindings)) {
      if (other !== action && codes.includes(code)) return other;
    }
    return null;
  }

  get pointerLocked() {
    return this.locked;
  }
}

function structuredCloneish(value) {
  return JSON.parse(JSON.stringify(value));
}
