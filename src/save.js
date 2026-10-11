/**
 * THE MULTIVERSE: SIMOLYSIS — save.js
 * ------------------------------------------------------------------
 * Persistence for the player's journey through the multiverse: three manual
 * slots plus an autosave, a version field with a migration chain, and an
 * export/import path so a save can survive the death of a browser profile
 * (which, thematically, is a very LODEMUS thing to support).
 *
 * No DOM/WebGL dependencies: fully unit-tested.
 */
import { memoryStorage } from './settings.js';

export const SAVE_VERSION = 4;
export const SLOT_PREFIX = 'multiverse.save.';
export const SLOTS = ['slot1', 'slot2', 'slot3', 'auto', 'quicksave'];

export function defaultProgress() {
  return {
    // story
    chapter: 0,
    introWatched: false,
    metSimolysis: false,
    truthsFound: [], // ids from lore.truths
    // world
    seed: 1337,
    realm: 'valley',
    position: [0, 0, 0],
    rotation: [0, 0],
    // discovery
    discovered: {},      // entityId -> true
    discoveredCount: 0,
    scannedSpecies: [],
    archives: [],        // collected archive fragments
    quests: {},          // questId -> { state, step, updated }
    realmsVisited: ['valley'],
    // progression
    essence: 0,
    level: 1,
    upgrades: {},        // { flight: 1, breathe: 1, ... }
    // stats
    stats: {
      playtime: 0,
      distance: 0,
      creaturesSeen: 0,
      portalsEntered: 0,
      deaths: 0,
      ghosts: 0,
      ascensions: 0,
      waterfalls: 0,
      peaks: 0,
      tvsBreached: 0,
      deepestDepth: 0,
      highestPeak: 0,
      itemsCollected: 0,
    },
    // world mutation
    flags: {},           // arbitrary story flags
    weather: { timeOfDay: 0.28, day: 1, season: 0 },
    createdAt: null,
    updatedAt: null,
    version: SAVE_VERSION,
  };
}

function migrate(data) {
  let out = { ...data };
  const from = Number(out.version) || 1;
  if (from < 2) {
    // v1 stored `seen` as an array; v2 uses a map for O(1) lookups.
    if (Array.isArray(out.discovered)) {
      out.discovered = out.discovered.reduce((acc, id) => ((acc[id] = true), acc), {});
    }
    out.version = 2;
  }
  if (from < 3) {
    out.stats = { ...defaultProgress().stats, ...(out.stats || {}) };
    out.realmsVisited = out.realmsVisited || ['valley'];
    out.version = 3;
  }
  if (from < 4) {
    out.weather = { timeOfDay: 0.28, day: 1, season: 0, ...(out.weather || {}) };
    out.upgrades = out.upgrades || {};
    out.truthsFound = out.truthsFound || [];
    out.version = 4;
  }
  return out;
}

/** Deep-merge a (possibly partial) save onto defaults, ignoring junk keys. */
export function normalizeSave(raw, seedFallback = 1337) {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return { ...base, seed: seedFallback };
  const merged = migrate({ ...base, ...raw });
  // type guards — a hand-edited save must not be able to crash the game
  if (!Array.isArray(merged.truthsFound)) merged.truthsFound = [];
  if (!Array.isArray(merged.scannedSpecies)) merged.scannedSpecies = [];
  if (!Array.isArray(merged.archives)) merged.archives = [];
  if (!Array.isArray(merged.position) || merged.position.length !== 3) merged.position = [0, 0, 0];
  if (!Array.isArray(merged.rotation) || merged.rotation.length !== 2) merged.rotation = [0, 0];
  merged.position = merged.position.map((v) => (Number.isFinite(v) ? +v : 0));
  merged.rotation = merged.rotation.map((v) => (Number.isFinite(v) ? +v : 0));
  merged.essence = Number.isFinite(merged.essence) ? Math.max(0, merged.essence) : 0;
  merged.level = Number.isFinite(merged.level) ? Math.max(1, Math.floor(merged.level)) : 1;
  merged.chapter = Number.isFinite(merged.chapter) ? Math.max(0, Math.floor(merged.chapter)) : 0;
  if (!Number.isFinite(merged.seed)) merged.seed = seedFallback;
  if (typeof merged.discovered !== 'object' || merged.discovered === null) merged.discovered = {};
  if (typeof merged.quests !== 'object' || merged.quests === null) merged.quests = {};
  if (typeof merged.flags !== 'object' || merged.flags === null) merged.flags = {};
  merged.version = SAVE_VERSION;
  return merged;
}

export function createSaveSystem({ storage = memoryStorage(), keyPrefix = SLOT_PREFIX } = {}) {
  const listeners = new Set();
  const emit = (type, payload) => {
    for (const fn of listeners) fn(type, payload);
  };
  const keyOf = (slot) => `${keyPrefix}${slot}`;

  const api = {
    /** List slot summaries for the main menu without loading full saves. */
    list() {
      return SLOTS.map((slot) => {
        const raw = storage.getItem(keyOf(slot));
        if (!raw) return { slot, empty: true };
        try {
          const data = JSON.parse(raw);
          return {
            slot,
            empty: false,
            chapter: data.chapter ?? 0,
            realm: data.realm ?? 'valley',
            level: data.level ?? 1,
            essence: data.essence ?? 0,
            playtime: data.stats?.playtime ?? 0,
            discovered: data.discoveredCount ?? 0,
            updatedAt: data.updatedAt,
          };
        } catch {
          return { slot, corrupt: true, empty: false };
        }
      });
    },
    read(slot, seedFallback = 1337) {
      const raw = storage.getItem(keyOf(slot));
      if (!raw) return null;
      try {
        return normalizeSave(JSON.parse(raw), seedFallback);
      } catch (err) {
        console.warn(`[save] slot ${slot} is corrupt`, err);
        return null;
      }
    },
    write(slot, progress) {
      const data = normalizeSave(progress);
      data.updatedAt = new Date().toISOString();
      if (!data.createdAt) data.createdAt = data.updatedAt;
      try {
        storage.setItem(keyOf(slot), JSON.stringify(data));
        emit('write', { slot, data });
        return true;
      } catch (err) {
        console.error(`[save] failed writing slot ${slot}`, err);
        emit('error', { slot, err });
        return false;
      }
    },
    /** Merge a delta into an existing slot (used by the autosaver). */
    patch(slot, delta) {
      const current = api.read(slot) || defaultProgress();
      return api.write(slot, { ...current, ...delta });
    },
    remove(slot) {
      storage.removeItem(keyOf(slot));
      emit('remove', { slot });
    },
    has(slot) {
      return storage.getItem(keyOf(slot)) !== null;
    },
    export(slot) {
      const data = api.read(slot);
      if (!data) return null;
      return JSON.stringify({ meta: 'multiverse-save', exportedAt: new Date().toISOString(), data }, null, 2);
    },
    import(slot, json, seedFallback = 1337) {
      try {
        const parsed = JSON.parse(json);
        const data = parsed?.data && parsed.meta === 'multiverse-save' ? parsed.data : parsed;
        const normalized = normalizeSave(data, seedFallback);
        return api.write(slot, normalized);
      } catch (err) {
        console.warn('[save] import failed', err);
        return false;
      }
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}

/** Progress helper that owns the live save object while the game runs. */
export function createProgressTracker(saveSystem, slot, seed = 1337) {
  const state = saveSystem.read(slot, seed) || { ...defaultProgress(), seed };
  let dirty = false;
  let sinceSave = 0;
  const listeners = new Set();

  const notify = (change) => {
    for (const fn of listeners) fn(change, state);
  };

  return {
    state,
    get(k) {
      return state[k];
    },
    set(k, v) {
      if (state[k] === v) return;
      state[k] = v;
      dirty = true;
      notify({ key: k, value: v });
    },
    /** Functor-style mutation for nested structures. */
    update(fn) {
      fn(state);
      dirty = true;
      notify({ key: '*' });
    },
    addStat(key, amount = 1) {
      state.stats[key] = (state.stats[key] || 0) + amount;
      dirty = true;
    },
    maxStat(key, value) {
      if ((state.stats[key] || 0) < value) {
        state.stats[key] = value;
        dirty = true;
      }
    },
    discover(id) {
      if (state.discovered[id]) return false;
      state.discovered[id] = true;
      state.discoveredCount = Object.keys(state.discovered).length;
      dirty = true;
      notify({ key: 'discovered', value: id });
      return true;
    },
    isDiscovered(id) {
      return !!state.discovered[id];
    },
    addArchive(id) {
      if (state.archives.includes(id)) return false;
      state.archives.push(id);
      dirty = true;
      notify({ key: 'archives', value: id });
      return true;
    },
    findTruth(id) {
      if (state.truthsFound.includes(id)) return false;
      state.truthsFound.push(id);
      dirty = true;
      notify({ key: 'truthsFound', value: id });
      return true;
    },
    setQuest(id, patch) {
      const quest = state.quests[id] || { state: 'inactive', step: 0 };
      state.quests[id] = { ...quest, ...patch, updated: Date.now() };
      dirty = true;
      notify({ key: 'quest', value: id });
    },
    /** Called from the fixed-step loop; autosaves on a timer. */
    tick(dt, { interval = 45 } = {}) {
      state.stats.playtime += dt;
      sinceSave += dt;
      if (dirty && sinceSave >= interval) {
        saveSystem.write(slot, state);
        sinceSave = 0;
        dirty = false;
        notify({ key: 'autosave' });
      }
    },
    flush() {
      saveSystem.write(slot, state);
      dirty = false;
      sinceSave = 0;
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get dirty() {
      return dirty;
    },
  };
}
