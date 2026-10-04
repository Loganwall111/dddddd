/* ── Sift core: catalogs derived from the repo's original asset set ─────────
   Every entry maps 1:1 to files under
   fabric-mod/src/main/resources/assets/entersift/** (textures, entities,
   biomes, rift styles) so the editor and the game stay grounded in the
   repository's own content.                                                     */

export type Vec3 = [number, number, number];

/* deterministic rng */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x: number, z: number, seed = 1337) {
  let h = seed ^ (x * 374761393) ^ (z * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ── Block catalog (textures/block in the repo) ─────────────────────────── */
export type BlockModel = "cube" | "cross" | "liquid";
export interface BlockDef {
  id: string;
  name: string;
  cat: string;
  model: BlockModel;
  all?: string;          // single texture
  top?: string;
  side?: string;
  bottom?: string;
  emissive?: number;     // emissive intensity
  glowColor?: string;    // tint of emission
  tint?: string;         // fallback flat tint while textures load
}

const B = (id: string, name: string, cat: string, extra: Partial<BlockDef> = {}): BlockDef => ({
  id, name, cat, model: "cube", all: id, ...extra,
});

export const BLOCKS: BlockDef[] = [
  /* terrain */
  B("sift_earth", "Sift Earth", "Terrain"),
  B("sift_grass", "Sift Grass", "Terrain"),
  B("pink_turf", "Pink Turf", "Terrain", { top: "pink_turf_top", side: "pink_turf_side", bottom: "pink_turf_top" }),
  B("blue_turf", "Blue Turf", "Terrain", { top: "blue_turf_top", side: "blue_turf_side", bottom: "blue_turf_top" }),
  B("valley_turf", "Valley Turf", "Terrain", { top: "valley_turf_top", side: "valley_turf_side", bottom: "valley_turf_top" }),
  B("pale_crust", "Pale Crust", "Terrain"),
  B("ash_crust", "Ash Crust", "Terrain"),
  B("salt", "Salt", "Terrain"),
  B("saltstone", "Saltstone", "Terrain"),
  B("soul_salt", "Soul Salt", "Terrain"),
  B("sinter", "Sinter", "Terrain"),
  B("carapace", "Carapace", "Terrain"),
  /* stone & rock */
  B("reef_stone", "Reef Stone", "Stone"),
  B("crag_rock", "Crag Rock", "Stone"),
  B("crag_rock_dark", "Crag Rock (Dark)", "Stone"),
  B("crag_band", "Banded Crag", "Stone"),
  B("crag_moss", "Mossy Crag", "Stone"),
  B("cinder_rock", "Cinder Rock", "Stone"),
  B("cinder_glow", "Cinder Glow", "Stone", { emissive: 0.9, glowColor: "#ff7a3c" }),
  B("ember_ore", "Ember Ore", "Stone", { emissive: 0.8, glowColor: "#ffb03c" }),
  B("sonorous_deepslate", "Sonorous Deepslate", "Stone"),
  /* flora */
  B("pink_grass", "Pink Grass", "Flora", { model: "cross" }),
  B("blue_grass", "Blue Grass", "Flora", { model: "cross" }),
  B("valley_fern", "Valley Fern", "Flora", { model: "cross" }),
  B("glow_bulb", "Glow Bulb", "Flora", { model: "cross", emissive: 1.4, glowColor: "#8ffce8" }),
  B("glow_tuft", "Glow Tuft", "Flora", { model: "cross", emissive: 1.2, glowColor: "#9ff2ff" }),
  B("sift_bloom", "Sift Bloom", "Flora"),
  B("violet_bloom", "Violet Bloom", "Flora"),
  B("sift_coral_red", "Red Sift Coral", "Flora"),
  B("sift_coral_yellow", "Yellow Sift Coral", "Flora"),
  B("coral_orange_block", "Orange Coral Block", "Flora"),
  B("coral_pink_block", "Pink Coral Block", "Flora"),
  /* wood & canopy */
  B("soulwood", "Soulwood", "Wood"),
  B("verdant_wood", "Verdant Wood", "Wood"),
  B("violet_wood", "Violet Wood", "Wood"),
  B("soul_canopy", "Soul Canopy", "Wood"),
  B("verdant_canopy", "Verdant Canopy", "Wood"),
  B("violet_canopy", "Violet Canopy", "Wood"),
  B("pale_canopy", "Pale Canopy", "Wood"),
  B("singer_moss", "Singer Moss", "Wood"),
  /* ruins & bricks */
  B("ruin_bricks", "Ruin Bricks", "Ruins"),
  B("ruin_tiles", "Ruin Tiles", "Ruins"),
  B("mossy_ruin_bricks", "Mossy Ruin Bricks", "Ruins"),
  B("spire_bricks", "Spire Bricks", "Ruins"),
  B("rose_spire", "Rose Spire Stone", "Ruins"),
  B("threshold", "Threshold Stone", "Ruins"),
  B("tunnel_wall", "Tunnel Wall", "Ruins"),
  B("tunnel_rib", "Tunnel Rib", "Ruins"),
  /* paths */
  B("rose_path", "Rose Path", "Paths"),
  B("teal_path", "Teal Path", "Paths"),
  /* rift & portal */
  B("rift_membrane", "Rift Membrane", "Rift", { emissive: 1.1, glowColor: "#ffffff" }),
  B("rift_edge", "Rift Edge", "Rift", { emissive: 0.9, glowColor: "#ffd9a0" }),
  B("rift_overworld", "Overworld Rift", "Rift", { emissive: 1.0, glowColor: "#b8ff9e" }),
  B("rift_sift", "Sift Rift", "Rift", { emissive: 1.0, glowColor: "#ffd0b0" }),
  B("rift_pink", "Night-Pink Rift", "Rift", { emissive: 1.0, glowColor: "#ff9ecb" }),
  B("rift_end", "End Rift", "Rift", { emissive: 1.0, glowColor: "#c39eff" }),
  B("rift_red", "Nether Rift", "Rift", { emissive: 1.0, glowColor: "#ff6a5a" }),
  B("rift_olive", "Olive Rift", "Rift", { emissive: 1.0, glowColor: "#d8e08a" }),
  B("rift_orange", "Orange Rift", "Rift", { emissive: 1.0, glowColor: "#ffb066" }),
  B("rift_yellow", "Yellow Rift", "Rift", { emissive: 1.0, glowColor: "#ffe08a" }),
  B("sift_portal", "Sift Portal", "Rift", { emissive: 1.2, glowColor: "#7ef2e6" }),
  B("sift_portal_b", "Sift Portal (B)", "Rift", { emissive: 1.2, glowColor: "#7ef2e6" }),
  B("sift_portal_base", "Portal Base", "Rift", { emissive: 0.8, glowColor: "#5ac8be" }),
  B("sift_mosaic", "Sift Mosaic", "Rift"),
  B("threshold_stage_0", "Threshold Stage 0", "Rift", { emissive: 0.4, glowColor: "#8ef2e0" }),
  B("threshold_stage_1", "Threshold Stage 1", "Rift", { emissive: 0.55, glowColor: "#8ef2e0" }),
  B("threshold_stage_2", "Threshold Stage 2", "Rift", { emissive: 0.7, glowColor: "#8ef2e0" }),
  B("threshold_stage_3", "Threshold Stage 3", "Rift", { emissive: 0.85, glowColor: "#8ef2e0" }),
  B("threshold_stage_4", "Threshold Stage 4", "Rift", { emissive: 1.0, glowColor: "#8ef2e0" }),
  B("threshold_stage_5", "Threshold Stage 5", "Rift", { emissive: 1.1, glowColor: "#8ef2e0" }),
  B("threshold_stage_6", "Threshold Stage 6", "Rift", { emissive: 1.2, glowColor: "#8ef2e0" }),
  B("threshold_stage_7", "Threshold Stage 7", "Rift", { emissive: 1.4, glowColor: "#aefcf0" }),
  /* resonance (note glow) */
  ...(["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta", "pink"] as const).map((c) =>
    B(`resonance_${c}`, `Resonance ${c[0].toUpperCase()}${c.slice(1)}`, "Resonance", {
      emissive: 1.3, glowColor: ({ red: "#ff4a4a", orange: "#ff9a3c", yellow: "#ffe45a", green: "#6aff7a", cyan: "#5af2ff", blue: "#5a7aff", purple: "#b05aff", magenta: "#ff5ad2", pink: "#ff8ab0" } as Record<string, string>)[c],
    })),
  /* liquids */
  B("ichor_still", "Ichor (Still)", "Liquid", { model: "liquid" }),
  B("ichor_flow", "Ichor (Flow)", "Liquid", { model: "liquid" }),
  B("blub_jelly", "Blub Jelly", "Liquid"),
];

export const blockById = (id: string) => BLOCKS.find((b) => b.id === id);

export const BLOCK_CATEGORIES = ["All", "Terrain", "Stone", "Flora", "Wood", "Ruins", "Paths", "Rift", "Resonance", "Liquid"];

/* ── Mob catalog (textures/entity + ref crops) ──────────────────────────── */
export interface MobDef {
  id: string;
  name: string;
  desc: string;
  size: number;       // approx height in editor units
  hostile?: boolean;
  anim: "hop" | "crawl" | "float" | "fly" | "stride" | "hover";
}
export const MOBS: MobDef[] = [
  { id: "blub", name: "Blub", desc: "Indigo-eyed hopper with floppy ears; squishes and squeaks.", size: 0.9, anim: "hop" },
  { id: "licker", name: "Licker", desc: "Grey-green crawler with a long cream tongue and mint patches.", size: 1.5, anim: "crawl" },
  { id: "overseer", name: "Overseer", desc: "One-eyed violet watcher on spindly legs.", size: 2.4, anim: "stride" },
  { id: "twisted_warden", name: "Twisted Warden", desc: "Cyan bracket antlers, brass-toothed chest maw.", size: 3.2, hostile: true, anim: "stride" },
  { id: "drift_jelly", name: "Drift Jelly", desc: "Massive floating jelly, pale and luminous.", size: 3.2, anim: "float" },
  { id: "note_bird", name: "Note Bird", desc: "Mint songbird with glowing wing tips; chirps rift notes.", size: 0.6, anim: "fly" },
  { id: "singer", name: "Singer", desc: "Moss-voiced chorister; answers the ritual song.", size: 1.6, anim: "stride" },
  { id: "sculker", name: "Sculker", desc: "Dark sculk stalker with cyan freckles.", size: 1.4, hostile: true, anim: "crawl" },
  { id: "sculkling", name: "Sculkling", desc: "Tiny sculk sprite; hops in swarms.", size: 0.5, anim: "hop" },
  { id: "soul_bee", name: "Soul Bee", desc: "Pale cyan spirit bee trailing soul-light.", size: 0.4, anim: "fly" },
  { id: "antlerling", name: "Antlerling", desc: "Gentle branched grazer of the pale groves.", size: 1.3, anim: "stride" },
  { id: "watchling", name: "Watchling", desc: "Floating cube sentinel with a scanning eye.", size: 0.7, anim: "hover" },
];
export const mobById = (id: string) => MOBS.find((m) => m.id === id);

/* ── Rift styles (from client RiftRenderer notes in the repo README) ────── */
export interface RiftStyle { id: string; name: string; rim: string; inner: string; sky: string; }
export const RIFT_STYLES: RiftStyle[] = [
  { id: "overworld", name: "Overworld (gold-green)", rim: "#eaffd0", inner: "#7ec850", sky: "#9fd8ff" },
  { id: "sift", name: "Sift (peach)", rim: "#fff0dc", inner: "#ff9d6b", sky: "#ffc9a0" },
  { id: "sift_night", name: "Sift Night (pink)", rim: "#ffe0ee", inner: "#ff7fae", sky: "#2a1e3f" },
  { id: "end", name: "End (violet)", rim: "#efe0ff", inner: "#9a5aff", sky: "#120a20" },
  { id: "nether", name: "Nether (red)", rim: "#ffe0d0", inner: "#ff4a2e", sky: "#33080a" },
  { id: "portal", name: "Ritual Portal (cyan)", rim: "#e8fffb", inner: "#35e0d0", sky: "#04333a" },
];

/* ── Biomes (worldgen/biome in the repo) ────────────────────────────────── */
export interface BiomeDef {
  id: string; name: string;
  ground: string; accent: string; sky: [string, string]; fog: string;
  flora: string[]; stone: string[];
}
export const BIOMES: BiomeDef[] = [
  { id: "singer_meadow", name: "Singer Meadow", ground: "valley_turf", accent: "#5bbfb7", sky: ["#39a59e", "#5bbfb7"], fog: "#4fb3aa", flora: ["glow_bulb", "pink_grass", "blue_grass", "valley_fern"], stone: ["reef_stone", "teal_path"] },
  { id: "rose_spires", name: "Rose Spires", ground: "pink_turf", accent: "#e08a9a", sky: ["#de7e7a", "#ffc9b0"], fog: "#e09a94", flora: ["pink_grass", "sift_bloom"], stone: ["rose_spire", "spire_bricks", "rose_path"] },
  { id: "saltwound_expanse", name: "Saltwound Expanse", ground: "salt", accent: "#e8e3da", sky: ["#c9b8ae", "#efe6dc"], fog: "#d8ccc2", flora: ["glow_tuft"], stone: ["saltstone", "soul_salt", "ash_crust"] },
  { id: "boneyard", name: "Boneyard", ground: "soul_salt", accent: "#bfe8e2", sky: ["#1d3a44", "#2e5a60"], fog: "#25454d", flora: ["glow_tuft", "blue_grass"], stone: ["soul_lantern_stone", "sinter", "carapace"] },
  { id: "coral_expanse", name: "Coral Expanse", ground: "reef_stone", accent: "#ff9a7a", sky: ["#2a7a8a", "#6fd8d0"], fog: "#3f9a9a", flora: ["sift_coral_red", "sift_coral_yellow", "coral_orange_block", "coral_pink_block"], stone: ["reef_stone"] },
  { id: "titan_crags", name: "Titan Crags", ground: "crag_rock", accent: "#8a7a6a", sky: ["#7a8a9a", "#c8d4dc"], fog: "#8a97a4", flora: ["crag_moss"], stone: ["crag_band", "crag_rock_dark", "crag_moss"] },
  { id: "soul_valley", name: "Soul Valley", ground: "blue_turf", accent: "#6fc8e8", sky: ["#173042", "#2a5a70"], fog: "#1e3d50", flora: ["glow_tuft", "blue_grass", "violet_bloom"], stone: ["soulwood", "soul_canopy"] },
  { id: "pale_grove", name: "Pale Grove", ground: "pale_crust", accent: "#d8e8dc", sky: ["#9ac8bc", "#d8f0e6"], fog: "#bcdcd0", flora: ["sift_bloom", "valley_fern"], stone: ["pale_canopy", "pale_crust"] },
  { id: "rift_tunnel", name: "Rift Tunnel", ground: "tunnel_wall", accent: "#35e0d0", sky: ["#0a1418", "#123036"], fog: "#0d1d22", flora: ["glow_bulb"], stone: ["tunnel_wall", "tunnel_rib", "sonorous_deepslate"] },
  { id: "campaign_peaks", name: "Campaign Peaks", ground: "ash_crust", accent: "#c8b8a8", sky: ["#8a9ab0", "#d0dce8"], fog: "#9aa8ba", flora: ["blue_grass"], stone: ["crag_rock", "sinter"] },
  { id: "carapace", name: "Carapace Fields", ground: "carapace", accent: "#b08a6a", sky: ["#a08060", "#e0c0a0"], fog: "#b09070", flora: ["sift_coral_yellow"], stone: ["carapace", "cinder_rock"] },
  { id: "tidepool_reef", name: "Tidepool Reef", ground: "sift_grass", accent: "#6fe0d0", sky: ["#2a8a9a", "#7fe8dc"], fog: "#3fa8a8", flora: ["sift_coral_red", "blue_grass"], stone: ["reef_stone", "sift_earth"] },
];

/* ── Sky presets ────────────────────────────────────────────────────────── */
export interface SkyPreset { id: string; name: string; top: string; bottom: string; fog: string; ambient: number; sun: string; night?: boolean; }
export const SKIES: SkyPreset[] = [
  { id: "sift_day", name: "Sift Day (mint-cyan)", top: "#39a59e", bottom: "#9fe8dc", fog: "#5bbfb7", ambient: 0.85, sun: "#fff2d8" },
  { id: "sift_night", name: "Sift Night (amber-peach)", top: "#c96253", bottom: "#de7e7a", fog: "#c96f66", ambient: 0.5, sun: "#ffd8b0", night: true },
  { id: "overworld", name: "Overworld Noon", top: "#78a7ff", bottom: "#cfe8ff", fog: "#b8d4f0", ambient: 1.0, sun: "#fff8e0" },
  { id: "end", name: "End Violet", top: "#0b0614", bottom: "#2a1440", fog: "#170b26", ambient: 0.35, sun: "#b090ff", night: true },
  { id: "nether", name: "Nether Red", top: "#200404", bottom: "#4a0e08", fog: "#300806", ambient: 0.4, sun: "#ff6040", night: true },
];

/* ── Editor placement kinds ─────────────────────────────────────────────── */
export type AssetKind = "block" | "mob" | "rift" | "vfx" | "prop";
export interface Placed {
  uid: number;
  kind: AssetKind;
  id: string;              // block id / mob id / rift style / vfx id
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
  variant?: string;        // palette or extra flag
  emissive?: number;
  animated?: boolean;
}
export let UID = 1;
export const nextUid = () => UID++;

/* VFX catalog */
export const VFX_DEFS = [
  { id: "souls", name: "Soul Drift", desc: "Rising soul motes (rich ambience)" },
  { id: "embers", name: "Ember Field", desc: "Warm cinder sparks" },
  { id: "lightning", name: "Rift Arcs", desc: "Crackling lightning arcs" },
  { id: "shaft", name: "Note Light Shaft", desc: "Coloured beam from a struck note" },
  { id: "shards", name: "Outline Shards", desc: "Floating hollow outline cubes" },
  { id: "sparkle", name: "Sparkle Burst", desc: "Pixel sparkles" },
  { id: "ichor", name: "Ichor Tidepool", desc: "Rainbow opalescent liquid pool" },
] as const;
export type VfxId = (typeof VFX_DEFS)[number]["id"];
