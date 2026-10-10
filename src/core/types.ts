export type DimensionId = 'overworld' | 'nether' | 'end' | 'crystal' | 'sky' | 'sift';
export type GameMode = 'creative' | 'survival';
export type WorldPreset = 'normal' | 'amplified' | 'flat' | 'archipelago' | 'extreme';
export type Difficulty = 'peaceful' | 'normal' | 'hard';
export type Weather = 'clear' | 'rain' | 'storm';
export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export interface CharacterStyle { name: string; skin: string; hair: string; eyes: string; shirt: string; trousers: string; boots: string; hairStyle: 'short' | 'long' | 'mohawk'; }
export const DEFAULT_CHARACTER: CharacterStyle = { name: 'Wanderer', skin: '#bd936f', hair: '#503925', eyes: '#527a82', shirt: '#4c9294', trousers: '#454f80', boots: '#504536', hairStyle: 'short' };
export interface Stack { id: number; count: number; durability?: number }
export interface PlayerSave {
  position: [number, number, number]; rotation: [number, number];
  health: number; hunger: number; xp: number; selected: number;
  inventory: (Stack | null)[]; equipment: (Stack | null)[];
}
export interface FurnaceState {
  input: Stack | null; fuel: Stack | null; output: Stack | null;
  progress: number; burn: number;
}
export interface WorldSave {
  version: 1; id: string; name: string; seed: string; mode: GameMode;
  preset: WorldPreset; difficulty: Difficulty; created: number; updated: number;
  playtime: number; time: number; dimension: DimensionId;
  gameRules?: Partial<Record<'doDaylightCycle', boolean>>;
  player: PlayerSave; edits: Partial<Record<DimensionId, Record<string, number>>>;
  positions: Partial<Record<DimensionId, [number, number, number]>>;
  containers: Record<string, (Stack | null)[]>;
  furnaces: Record<string, FurnaceState>;
  weather: Weather; cycleWeather: boolean; season: Season; cycleSeasons: boolean;
  craftGrid: (Stack | null)[]; defeatedBosses: string[];
  generationVersion?: 1 | 2;
  character?: CharacterStyle;
  portalKeys?: string[];
  noteProgress?: number;
}
export interface Settings {
  quality: 'performance' | 'balanced' | 'cinematic'; renderDistance: number;
  shadows: boolean; reflections: boolean; bloom: boolean;
  fov: number; sensitivity: number; volume: number; music: number;
  reducedMotion: boolean; highContrast: boolean; showCoordinates: boolean;
  invertY: boolean; flightSpeed: number; cameraShake: boolean;
  volumetricClouds: boolean; godRays: boolean; wetReflections: boolean; softwareRayTracing: boolean; toneMapping: boolean;
  tornadoes: boolean; npcVoice: boolean;
  coloredLights: boolean; puddles: boolean; nameplates: boolean; debris: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  quality: 'balanced', renderDistance: 4, shadows: true, reflections: true,
  bloom: true, fov: 78, sensitivity: 1, volume: 65, music: 20,
  reducedMotion: false, highContrast: false, showCoordinates: false,
  invertY: false, flightSpeed: 14, cameraShake: true,
  volumetricClouds: true, godRays: true, wetReflections: true, softwareRayTracing: false, toneMapping: false, tornadoes: true, npcVoice: true,
  coloredLights: true, puddles: true, nameplates: true, debris: true,
};
export interface Target { x: number; y: number; z: number; id: number; normal: [number, number, number]; distance: number }
export interface GameSnapshot {
  health: number; hunger: number; xp: number; selected: number;
  inventory: (Stack | null)[]; equipment: (Stack | null)[];
  position: [number, number, number]; dimension: DimensionId; mode: GameMode;
  biome: string; time: number; season: Season; weather: Weather;
  target: string; progress: number; fps: number; chunks: number; flying: boolean;
  boss: { name: string; health: number; maxHealth: number } | null;
}
export type GameEvent =
  | { type: 'snapshot'; data: GameSnapshot }
  | { type: 'ready'; backend: string }
  | { type: 'loading'; progress: number; label: string }
  | { type: 'pause' }
  | { type: 'inventory'; context?: 'crafting' | 'furnace' | 'chest'; key?: string }
  | { type: 'toast'; message: string }
  | { type: 'death' }
  | { type: 'dialogue'; name: string; text: string; profession: string }
  | { type: 'tour-caption'; title: string; subtitle: string; index: number; total: number }
  | { type: 'tour-loading'; active: boolean; progress: number; label: string }
  | { type: 'tour-end' }
  | { type: 'error'; message: string };
export const DIMENSIONS: Record<DimensionId, { name: string; subtitle: string; color: string; sky: string; fog: string; water: number; next: DimensionId }> = {
  overworld: { name: 'The Overworld', subtitle: 'Every horizon is a new beginning.', color: '#99b783', sky: '#90bdc8', fog: '#c6d8cc', water: 26, next: 'nether' },
  nether: { name: 'The Nether', subtitle: 'Beneath a sky of ember and ash.', color: '#de875a', sky: '#49242e', fog: '#7f3932', water: 23, next: 'end' },
  end: { name: 'The End', subtitle: 'At the edge of everything.', color: '#bba2e5', sky: '#141125', fog: '#312340', water: -20, next: 'overworld' },
  crystal: { name: 'Crystal Hollows', subtitle: 'Follow the light beneath the world.', color: '#8ed9d2', sky: '#143d48', fog: '#2b6a73', water: 20, next: 'overworld' },
  sky: { name: 'The Skylands', subtitle: 'An ocean of clouds. A world above.', color: '#b7d7e8', sky: '#95c9e3', fog: '#d8e5dc', water: -20, next: 'overworld' },
  sift: { name: 'The Sift', subtitle: 'Beautiful things can be dangerous.', color: '#76e0bb', sky: '#075c62', fog: '#438c7b', water: 27, next: 'overworld' },
};