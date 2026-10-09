import { WorldSettings, SerializedChunk } from "../world/worldManager";
import { SerializedInventory } from "../inventory/inventory";
import { DimensionId } from "../world/generator";

const DB_NAME = "massAwakeningDB";
const DB_VERSION = 1;
const STORE_WORLDS = "worlds";
const STORE_CHUNKS_PREFIX = "chunks_";

export interface SavedWorld extends WorldSettings {
  id: string;
  playerPos: { x: number; y: number; z: number; dim: DimensionId; yaw: number; pitch: number };
  health: number;
  hunger: number;
  inventory: SerializedInventory;
  gameMode: "creative" | "survival";
  timeOfDay: number;
  chests?: Record<string, ([number, number] | null)[]>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORLDS)) db.createObjectStore(STORE_WORLDS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function chunkStoreName(worldId: string, dim: string): string {
  return `${STORE_CHUNKS_PREFIX}${worldId}_${dim}`;
}

async function ensureChunkStore(db: IDBDatabase, worldId: string, dim: string): Promise<void> {
  const name = chunkStoreName(worldId, dim);
  if (!db.objectStoreNames.contains(name)) {
    // We can't create new stores outside an upgrade event on an open DB. To
    // keep things simple we close and re-open with a bumped version.
    db.close();
    dbPromise = null;
    const ver = db.version + 1;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, ver);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "key" });
      };
      req.onsuccess = () => { resolve(); req.result.close(); };
      req.onerror = () => reject(req.error);
    });
    await openDB();
  }
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listWorlds(): Promise<SavedWorld[]> {
  const db = await openDB();
  const store = tx(db, STORE_WORLDS, "readonly");
  const all = await asPromise(store.getAll() as IDBRequest<SavedWorld[]>);
  return all.sort((a,b) => b.lastPlayed - a.lastPlayed);
}

export async function saveWorldMeta(world: SavedWorld): Promise<void> {
  const db = await openDB();
  const store = tx(db, STORE_WORLDS, "readwrite");
  await asPromise(store.put(world));
}

export async function loadWorldMeta(id: string): Promise<SavedWorld | null> {
  const db = await openDB();
  const store = tx(db, STORE_WORLDS, "readonly");
  const w = await asPromise(store.get(id) as IDBRequest<SavedWorld | undefined>);
  return w ?? null;
}

export async function deleteWorld(id: string): Promise<void> {
  const db = await openDB();
  // delete meta
  await asPromise(tx(db, STORE_WORLDS, "readwrite").delete(id));
  // delete chunk stores if they exist (by reopening with version bump)
  for (const dim of ["overworld","nether","end"]) {
    const name = chunkStoreName(id, dim);
    if (db.objectStoreNames.contains(name)) {
      db.close(); dbPromise = null;
      const ver = db.version + 1;
      await new Promise<void>((resolve,reject) => {
        const req = indexedDB.open(DB_NAME, ver);
        req.onupgradeneeded = () => {
          if (req.result.objectStoreNames.contains(name)) req.result.deleteObjectStore(name);
        };
        req.onsuccess = () => { resolve(); req.result.close(); };
        req.onerror = () => reject(req.error);
      });
      await openDB();
    }
  }
}

export async function saveChunks(worldId: string, dim: string, chunks: SerializedChunk[]): Promise<void> {
  const db = await openDB();
  await ensureChunkStore(db, worldId, dim);
  const db2 = await openDB();
  const store = tx(db2, chunkStoreName(worldId, dim), "readwrite");
  await Promise.all(chunks.map(c => asPromise(store.put({ key: `${c.cx},${c.cz}`, ...c }))));
}

export async function loadChunks(worldId: string, dim: string): Promise<SerializedChunk[]> {
  const db = await openDB();
  const name = chunkStoreName(worldId, dim);
  if (!db.objectStoreNames.contains(name)) return [];
  const store = tx(db, name, "readonly");
  const rows = await asPromise(store.getAll() as IDBRequest<any[]>);
  return rows.map(r => ({ cx: r.cx, cz: r.cz, dim: r.dim, blocks: r.blocks }));
}

export function newWorldId(): string {
  return "w_" + Date.now().toString(36) + "_" + Math.floor(Math.random()*1e6).toString(36);
}

// ---- Export / Import ----
export interface WorldExport {
  version: 1;
  app: "mass-awakening";
  meta: SavedWorld;
  chunks: Record<string, SerializedChunk[]>;
}

export async function exportWorld(id: string): Promise<WorldExport | null> {
  const meta = await loadWorldMeta(id);
  if (!meta) return null;
  const chunks: Record<string, SerializedChunk[]> = {};
  for (const dim of ["overworld", "nether", "end"]) {
    chunks[dim] = await loadChunks(id, dim);
  }
  return { version: 1, app: "mass-awakening", meta, chunks };
}

export async function importWorld(data: WorldExport): Promise<SavedWorld> {
  if (!data || data.app !== "mass-awakening" || !data.meta) throw new Error("Invalid world file");
  const meta = data.meta;
  // Give the imported world a fresh id if one already exists
  const existing = await loadWorldMeta(meta.id);
  if (existing) meta.id = newWorldId();
  await saveWorldMeta(meta);
  for (const dim of Object.keys(data.chunks || {})) {
    await saveChunks(meta.id, dim, data.chunks[dim]);
  }
  return meta;
}

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
