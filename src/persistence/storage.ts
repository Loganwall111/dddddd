import { openDB } from 'idb';
import { DEFAULT_SETTINGS, DEFAULT_CHARACTER, type CharacterStyle, type Settings, type WorldSave, type GameMode, type WorldPreset, type Difficulty } from '../core/types';
import { initialInventory } from '../inventory/inventory';
import { BLOCKS, maxStack } from '../blocks/registry';
import { HEIGHT } from '../world/generator';

const database = () => openDB('mass-awakening', 1, { upgrade(db) { db.createObjectStore('worlds', { keyPath: 'id' }); db.createObjectStore('settings'); } });
// Retain the modular 0.2 database name: a product-name change must not strand those worlds.
export async function loadCharacter():Promise<CharacterStyle>{try{const db=await database();const value=await db.get('settings','character');db.close();return sanitizeCharacter(value);}catch{return {...DEFAULT_CHARACTER};}}
export async function storeCharacter(style:CharacterStyle){const db=await database();await db.put('settings',sanitizeCharacter(style),'character');db.close();}
export function sanitizeCharacter(value:unknown):CharacterStyle{const result={...DEFAULT_CHARACTER};if(!value||typeof value!=='object')return result;const input=value as Record<string,unknown>;for(const key of ['skin','hair','eyes','shirt','trousers','boots'] as const)if(typeof input[key]==='string'&&/^#[0-9a-f]{6}$/i.test(input[key] as string))result[key]=input[key] as string;if(typeof input.name==='string')result.name=input.name.slice(0,24);if(['short','long','mohawk'].includes(input.hairStyle as string))result.hairStyle=input.hairStyle as CharacterStyle['hairStyle'];return result;}
export async function saveWorld(world: WorldSave) { world.updated = Date.now(); const db = await database(); await db.put('worlds', structuredClone(world)); db.close(); }
export async function getWorlds(): Promise<WorldSave[]> {
  const db = await database(); const records = await db.getAll('worlds'); db.close();
  const worlds: WorldSave[] = [];
  for (const record of records) { try { worlds.push(validateWorld(record, false)); } catch (error) { console.warn('A damaged world record was preserved but could not be loaded.', error); } }
  return worlds.sort((a, b) => b.updated - a.updated);
}
export async function deleteWorld(id: string) { const db = await database(); await db.delete('worlds', id); db.close(); }
export async function loadSettings(): Promise<Settings> { try { const db = await database(); const value = await db.get('settings', 'preferences'); db.close(); return { ...DEFAULT_SETTINGS, ...value }; } catch { return DEFAULT_SETTINGS; } }
export async function storeSettings(settings: Settings) { const db = await database(); await db.put('settings', settings, 'preferences'); db.close(); }
export function createWorld(name: string, seed: string, mode: GameMode, preset: WorldPreset, difficulty: Difficulty): WorldSave {
  return {
    version: 1, id: crypto.randomUUID(), name: name.trim() || 'A New Beginning', seed: seed.trim() || String(Math.floor(Math.random() * 99999999)), mode, preset, difficulty,
    created: Date.now(), updated: Date.now(), playtime: 0, time: .29, dimension: 'overworld',
    player: { position: [2.5, 0, -4.5], rotation: [0, .1], health: 20, hunger: 20, xp: 0, selected: 0, inventory: initialInventory(mode === 'creative'), equipment: Array(4).fill(null) },
    edits: {}, positions: {}, containers: {}, furnaces: {}, weather: 'clear', cycleWeather: true, season: 'Summer', cycleSeasons: true,
    craftGrid: Array(9).fill(null), defeatedBosses: [],generationVersion:2,character:{...DEFAULT_CHARACTER},portalKeys:[],noteProgress:0,
  };
}
export function exportWorld(world: WorldSave) {
  const blob = new Blob([JSON.stringify(world)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${world.name.replace(/[^a-z0-9_-]/gi, '-')}.mass-awakening.json`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function validateWorld(value: unknown, reidentify = true): WorldSave {
  if (!value || typeof value !== 'object') throw new Error('This is not an Aetherforged: Reincarnated world file.');
  const w = value as WorldSave;
  if (w.version !== 1 || typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.seed !== 'string' || w.name.length > 48 || w.seed.length > 64 || !w.player || !['creative', 'survival'].includes(w.mode) || !['normal', 'flat', 'amplified', 'archipelago', 'extreme'].includes(w.preset) || !['overworld', 'nether', 'end', 'crystal', 'sky','sift'].includes(w.dimension)) throw new Error('This world file has an unsupported format.');
  const validPosition = (p: unknown) => Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 10_000_000);
  if (!validPosition(w.player.position) || !Array.isArray(w.player.inventory) || w.player.inventory.length !== 36 || !Array.isArray(w.player.rotation) || w.player.rotation.length !== 2 || !w.player.rotation.every(Number.isFinite)) throw new Error('The player data in this file is invalid.');
  const validateSlots = (slots: unknown, length: number) => {
    if (!Array.isArray(slots) || slots.length !== length) throw new Error('Invalid inventory size in world file.');
    for (const stack of slots) if (stack && (!Number.isInteger(stack.id) || stack.id < 1 || !BLOCKS[stack.id] || !Number.isInteger(stack.count) || stack.count < 1 || stack.count > maxStack(stack.id) || stack.durability !== undefined && (!Number.isFinite(stack.durability) || stack.durability <= 0))) throw new Error('This world contains an invalid inventory.');
  };
  validateSlots(w.player.inventory, 36);
  if (w.player.equipment) validateSlots(w.player.equipment, 4);
  if (w.craftGrid) validateSlots(w.craftGrid, 9);
  if (!Number.isFinite(w.player.health) || w.player.health < 0 || w.player.health > 20 || !Number.isFinite(w.player.hunger) || w.player.hunger < 0 || w.player.hunger > 20 || !Number.isInteger(w.player.selected) || w.player.selected < 0 || w.player.selected > 8 || !Number.isFinite(w.player.xp) || w.player.xp < 0) throw new Error('Invalid survival state in world file.');
  if (!Number.isFinite(w.time) || w.time < 0 || w.time > 1 || !Number.isFinite(w.playtime) || w.playtime < 0) throw new Error('Invalid world clock.');
  if (!w.edits || typeof w.edits !== 'object') throw new Error('This world is missing terrain data.');
  for (const edits of Object.values(w.edits)) for (const [key, id] of Object.entries(edits || {})) {
    const coordinates = key.split(',').map(Number);
    if (!/^-?\d+,-?\d+,-?\d+$/.test(key) || !validPosition(coordinates) || coordinates[1] < 0 || coordinates[1] >= HEIGHT || !Number.isInteger(id) || !BLOCKS[id]) throw new Error('Invalid block data in world file.');
  }
  for (const slots of Object.values(w.containers || {})) validateSlots(slots, 27);
  for (const furnace of Object.values(w.furnaces || {})) {
    validateSlots([furnace.input, furnace.fuel, furnace.output], 3);
    if (!Number.isFinite(furnace.progress) || furnace.progress < 0 || !Number.isFinite(furnace.burn) || furnace.burn < 0) throw new Error('Invalid furnace data.');
  }
  for (const position of Object.values(w.positions || {})) if (!validPosition(position)) throw new Error('Invalid dimension position.');
  const base = createWorld(w.name, w.seed, w.mode, w.preset, w.difficulty || 'normal');
  return { ...base, ...w, id: reidentify ? crypto.randomUUID() : w.id, updated: reidentify ? Date.now() : w.updated, player: { ...base.player, ...w.player, equipment: w.player.equipment || Array(4).fill(null) }, containers: w.containers || {}, furnaces: w.furnaces || {}, positions: w.positions || {}, craftGrid: w.craftGrid || Array(9).fill(null), defeatedBosses: Array.isArray(w.defeatedBosses) ? w.defeatedBosses : [],generationVersion:w.generationVersion===2?2:1,character:sanitizeCharacter(w.character),portalKeys:Array.isArray(w.portalKeys)?w.portalKeys.filter(k=>typeof k==='string'):[],noteProgress:Number.isInteger(w.noteProgress)&&w.noteProgress!>=0&&w.noteProgress!<5?w.noteProgress:0 };
}
