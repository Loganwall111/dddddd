/**
 * THE MULTIVERSE — engine/interact.js
 * ==================================================================
 * REACHING OUT AND TOUCHING THE WORLD. A single, central interaction system
 * so that everything in the game — portals, archive fragments, the machine,
 * animals, televisions, the Great One — is discoverable through the same
 * reticle and the same key.
 *
 * A target is anything that registers an *interactable*:
 *
 *   world.registerInteractable({
 *     id, position (Vector3-like or getter), label, verb, radius,
 *     priority, requires (progress predicate), enabled, onInteract(ctx)
 *   })
 *
 * The system finds the best candidate in front of the player (a cone test,
 * not merely distance: you must be looking at what you want to touch),
 * exposes it for the HUD, and fires it on press.
 */
import { clamp01 } from '../core/math.js';

export class InteractionSystem {
  constructor({ maxDistance = 6, coneAngle = 0.72, holdTime = 0 } = {}) {
    this.maxDistance = maxDistance;
    this.coneAngle = coneAngle; // cos of the half-angle
    this.holdTime = holdTime;
    this.targets = new Map();
    this.current = null;
    this.holdProgress = 0;
    this.lastTriggered = null;
    this.triggerCount = 0;
    this.onFocusChange = null;
    this.onTrigger = null;
  }

  register(target) {
    if (!target?.id) throw new Error('interactable needs an id');
    this.targets.set(target.id, {
      radius: 3,
      priority: 0,
      enabled: true,
      ...target,
    });
    return target.id;
  }

  unregister(id) {
    this.targets.delete(id);
    if (this.current?.id === id) {
      this.current = null;
      this.onFocusChange?.(null);
    }
  }

  clear() {
    this.targets.clear();
    this.current = null;
  }

  /** Position of a target in the same shape every frame. */
  _positionOf(target) {
    const value = typeof target.position === 'function' ? target.position() : target.position;
    if (!value) return null;
    return value;
  }

  /**
   * Find the best target for this frame.
   * @param {{x,y,z}} eye        camera/eye position
   * @param {{x,y,z}} forward    unit forward vector
   * @param {object}  context    passed through to the interact callback
   */
  update(dt, eye, forward, context = {}) {
    let best = null;
    let bestScore = -Infinity;
    for (const target of this.targets.values()) {
      if (!target.enabled) continue;
      if (target.requires && !target.requires(context)) continue;
      const position = this._positionOf(target);
      if (!position) continue;
      const dx = position.x - eye.x;
      const dy = (position.y ?? 0) - eye.y;
      const dz = position.z - eye.z;
      const distance = Math.hypot(dx, dy, dz);
      const reach = (target.radius ?? 3) + this.maxDistance;
      if (distance > reach) continue;
      const inverse = 1 / Math.max(0.0001, distance);
      const alignment = (dx * inverse) * forward.x + (dy * inverse) * forward.y + (dz * inverse) * forward.z;
      if (alignment < this.coneAngle && distance > 2.2) continue;
      // Prefer what you are looking at, then what is closest, then priority.
      const score = alignment * 2 + (target.priority ?? 0) * 0.4 + clamp01(1 - distance / reach) * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = { target, distance, alignment };
      }
    }

    const previousId = this.current?.id ?? null;
    if (best) {
      this.current = { ...best.target, distance: best.distance, alignment: best.alignment };
    } else {
      this.current = null;
      this.holdProgress = 0;
    }
    if ((this.current?.id ?? null) !== previousId) {
      this.onFocusChange?.(this.current, previousId);
    }
    void dt;
    return this.current;
  }

  /** Player pressed the interact key. */
  trigger(context = {}) {
    if (!this.current) return null;
    const target = this.targets.get(this.current.id) ?? this.current;
    if (target.requires && !target.requires(context)) return null;
    const result = target.onInteract?.({
      ...context,
      target,
      distance: this.current.distance,
      label: target.label,
      verb: target.verb ?? 'interact',
    });
    this.triggerCount++;
    this.lastTriggered = { id: target.id, at: performance.now(), result };
    this.onTrigger?.(target, result);
    return result;
  }

  /** A convenience for scripted prompts ("press E to enter the white void"). */
  prompt() {
    if (!this.current) return null;
    return {
      id: this.current.id,
      label: this.current.label ?? 'Interact',
      verb: this.current.verb ?? 'interact',
      key: this.current.key ?? 'E',
      distance: this.current.distance,
      detail: this.current.detail ?? null,
    };
  }

  get count() {
    return this.targets.size;
  }
}

/**
 * REACHABILITY. A tiny graph of named places per reality used by the compass,
 * the codex and the "where was that waterfall" problem.
 */
export class LandmarkRegistry {
  constructor() {
    this.byRealm = new Map();
  }

  add(realmId, landmark) {
    if (!this.byRealm.has(realmId)) this.byRealm.set(realmId, []);
    this.byRealm.get(realmId).push({ discovered: false, ...landmark });
    return landmark;
  }

  all(realmId) {
    return this.byRealm.get(realmId) ?? [];
  }

  discover(realmId, id) {
    const found = this.all(realmId).find((l) => l.id === id);
    if (!found || found.discovered) return null;
    found.discovered = true;
    return found;
  }

  /** The nearest landmark to a position, discovered or not. */
  nearest(realmId, position) {
    let best = null;
    let bestDistance = Infinity;
    for (const landmark of this.all(realmId)) {
      const distance = Math.hypot(landmark.x - position.x, landmark.z - position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = landmark;
      }
    }
    return best ? { landmark: best, distance: bestDistance } : null;
  }

  /** Bearing in radians from a position to a landmark (for the compass). */
  bearing(position, landmark) {
    return Math.atan2(landmark.x - position.x, landmark.z - position.z);
  }

  discoveredCount(realmId) {
    return this.all(realmId).filter((l) => l.discovered).length;
  }

  serialize() {
    const out = {};
    for (const [realmId, list] of this.byRealm) {
      out[realmId] = list.map((l) => ({ id: l.id, discovered: l.discovered }));
    }
    return out;
  }

  deserialize(state) {
    if (!state) return;
    for (const [realmId, list] of Object.entries(state)) {
      for (const record of list) {
        const found = this.all(realmId).find((l) => l.id === record.id);
        if (found) found.discovered = record.discovered;
      }
    }
  }
}
