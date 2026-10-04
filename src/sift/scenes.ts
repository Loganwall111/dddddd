/* Authored preset scenes & landmarks, generated from the repo's own biome,
   block and entity catalogs. Each preset returns Placed[] for the editor.   */
import { mulberry, nextUid, type Placed, type Vec3 } from "./core";

let P: Placed[] = [];
const put = (kind: Placed["kind"], id: string, pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], extra: Partial<Placed> = {}) => {
  P.push({ uid: nextUid(), kind, id, pos, rot, scale, animated: true, ...extra });
};

function tower(x: number, z: number, h: number, brick: string, cap?: string) {
  for (let y = 0; y < h; y++) put("block", brick, [x, y + 0.5, z]);
  if (cap) put("block", cap, [x, h + 0.5, z], [0, 0, 0], [1.5, 0.5, 1.5]);
}
function tree(x: number, z: number, wood: string, canopy: string, h = 4, spread = 2) {
  for (let y = 0; y < h; y++) put("block", wood, [x, y + 0.5, z]);
  for (let dx = -spread; dx <= spread; dx++)
    for (let dz = -spread; dz <= spread; dz++)
      for (let dy = 0; dy <= 1; dy++) {
        if (Math.abs(dx) === spread && Math.abs(dz) === spread && dy === 1) continue;
        if (dx === 0 && dz === 0 && dy === 0) continue;
        put("block", canopy, [x + dx, h + 0.5 + dy, z + dz]);
      }
}
function disc(y: number, r: number, block: string, rnd: () => number, jitter = 0.15) {
  for (let x = -r; x <= r; x++)
    for (let z = -r; z <= r; z++) {
      const d = Math.sqrt(x * x + z * z);
      if (d <= r + (rnd() - 0.5) * jitter * 8) put("block", block, [x, y, z]);
    }
}

/* ── 1. Ritual Plaza — ancient-city frame + the singing portal ── */
export function sceneRitualPlaza(): Placed[] {
  P = [];
  const rnd = mulberry(7);
  disc(-0.5, 12, "teal_path", rnd);
  disc(-0.5, 9, "sonorous_deepslate", rnd, 0.05);
  /* reinforced deepslate frame 5x4 */
  for (let x = -2; x <= 2; x++) { put("block", "sonorous_deepslate", [x, 0.5, -6]); put("block", "sonorous_deepslate", [x, 4.5, -6]); }
  for (let y = 1; y <= 3; y++) { put("block", "sonorous_deepslate", [-2, y + 0.5, -6]); put("block", "sonorous_deepslate", [2, y + 0.5, -6]); }
  put("rift", "portal", [0, 2.5, -6], [0, 0, 0], [3.4, 3.2, 1]);
  /* six coloured note blocks in an arc */
  const notes = ["resonance_red", "resonance_magenta", "resonance_pink", "resonance_cyan", "resonance_blue", "resonance_purple"];
  notes.forEach((n, i) => {
    const a = (i / 5 - 0.5) * 2.2;
    put("block", n, [Math.sin(a) * 6, 0.5, -2 + Math.cos(a) * 3]);
    if (i % 2 === 0) put("vfx", "shaft", [Math.sin(a) * 6, 0, -2 + Math.cos(a) * 3], [0, 0, 0], [1, 1, 1], { variant: (["#ff4a4a", "#ff5ad2", "#ff8ab0", "#5af2ff", "#5a7aff", "#b05aff"] as string[])[i] });
  });
  /* plaza pillars */
  for (const [px, pz] of [[-8, -4], [8, -4], [-8, 4], [8, 4]] as const) {
    tower(px, pz, 4, "ruin_bricks", "sift_portal_base");
    put("vfx", "souls", [px, 0, pz], [0, 0, 0], [0.4, 1, 0.4]);
  }
  put("mob", "singer", [0, 0, -1.5]);
  put("mob", "singer", [2.4, 0, 0.5], [0, -0.8, 0]);
  put("mob", "watchling", [-3, 1.5, 2]);
  put("mob", "blub", [4, 0, 3]);
  put("mob", "soul_bee", [-4, 1.5, -2]);
  put("vfx", "souls", [0, 0, -6]);
  put("vfx", "shards", [0, 0, -6]);
  return P;
}

/* ── 2. Coral Expanse ── */
export function sceneCoralExpanse(): Placed[] {
  P = [];
  const rnd = mulberry(21);
  disc(-0.5, 14, "reef_stone", rnd);
  for (let i = 0; i < 9; i++) {
    const x = Math.round((rnd() - 0.5) * 22), z = Math.round((rnd() - 0.5) * 22);
    const h = 2 + Math.floor(rnd() * 4);
    for (let y = 0; y < h; y++) put("block", "reef_stone", [x, y + 0.5, z]);
    const col = rnd() > 0.5 ? "sift_coral_red" : "sift_coral_yellow";
    put("block", col, [x, h + 0.5, z]);
    if (rnd() > 0.5) put("block", rnd() > 0.5 ? "coral_orange_block" : "coral_pink_block", [x + 1, h, z]);
    if (rnd() > 0.6) put("block", col, [x, h + 1.5, z], [0, 0, 0], [0.6, 0.6, 0.6]);
  }
  put("mob", "drift_jelly", [3, 2.4, -3]);
  put("mob", "drift_jelly", [-6, 3, 4], [0, 1, 0], [0.6, 0.6, 0.6]);
  put("mob", "blub", [-2, 0, 5]);
  put("mob", "soul_bee", [5, 2, 2]);
  put("mob", "note_bird", [-4, 2, -5]);
  put("rift", "sift", [8, 2.2, -7], [0, -0.7, 0]);
  put("vfx", "souls", [0, 0, 0], [0, 0, 0], [1, 1, 1], { variant: "#7ef2e6" });
  put("block", "ichor_still", [0, 0.05, 8], [0, 0, 0], [6, 0.1, 4]);
  return P;
}

/* ── 3. Boneyard Gate ── */
export function sceneBoneyard(): Placed[] {
  P = [];
  const rnd = mulberry(33);
  disc(-0.5, 13, "soul_salt", rnd);
  /* skull gate */
  for (let y = 0; y < 6; y++) { put("block", "sinter", [-4, y + 0.5, -5]); put("block", "sinter", [4, y + 0.5, -5]); }
  for (let x = -4; x <= 4; x++) put("block", "sinter", [x, 6.5, -5]);
  /* skull atop */
  put("block", "salt", [0, 8, -5], [0, 0, 0], [3, 2.2, 2.4]);
  put("block", "soul_lantern_stone", [-0.8, 7.8, -3.7], [0, 0, 0], [0.6, 0.6, 0.3]);
  put("block", "soul_lantern_stone", [0.8, 7.8, -3.7], [0, 0, 0], [0.6, 0.6, 0.3]);
  put("block", "salt", [0, 7, -3.7], [0, 0, 0], [0.4, 0.5, 0.3]);
  /* curved tusks */
  for (let i = 0; i < 6; i++) {
    put("block", "saltstone", [-5 - Math.sin(i * 0.4) * 1.2, 0.5 + i * 0.8, -5], [0, 0, -i * 0.12]);
    put("block", "saltstone", [5 + Math.sin(i * 0.4) * 1.2, 0.5 + i * 0.8, -5], [0, 0, i * 0.12]);
  }
  /* ribcages */
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    put("block", "saltstone", [s * (6 + i * 0.2), 1 + Math.sin(i * 0.5) * 1.4, 2 + i * 1.4], [0, 0, s * (0.5 - i * 0.12)], [0.4, 2.2, 0.4]);
  }
  put("mob", "sculker", [0, 0, 1]);
  put("mob", "sculkling", [2, 0, 3]);
  put("mob", "sculkling", [-2.5, 0, 2.2]);
  put("mob", "watchling", [0, 3, -5]);
  put("rift", "end", [0, 2.6, -5], [0, 0, 0], [4, 3.6, 1]);
  put("vfx", "souls", [0, 0, 0], [0, 0, 0], [1.2, 1, 1.2]);
  put("vfx", "embers", [-6, 0, 4], [0, 0, 0], [0.6, 1, 0.6], { variant: "#7ef2ff" });
  return P;
}

/* ── 4. Titan Crags ── */
export function sceneTitanCrags(): Placed[] {
  P = [];
  const rnd = mulberry(55);
  disc(-0.5, 15, "crag_rock", rnd);
  const crag = (x: number, z: number, h: number, w: number) => {
    for (let y = 0; y < h; y++) {
      const s = w * (1 - y / (h * 1.6));
      put("block", y % 3 === 2 ? "crag_band" : "crag_rock_dark", [x, y + 0.5, z], [0, 0, 0], [s, 1, s]);
    }
    tree(x, z, "soulwood", "violet_canopy", h, 1);
  };
  crag(-6, -6, 12, 4); crag(7, -3, 9, 3); crag(2, 7, 7, 2.5); crag(-9, 5, 6, 2);
  for (let i = 0; i < 8; i++) put("block", "crag_moss", [Math.round((rnd() - 0.5) * 20), 0.5, Math.round((rnd() - 0.5) * 20)]);
  put("mob", "antlerling", [0, 0, 2]);
  put("mob", "antlerling", [4, 0, -1], [0, 2, 0]);
  put("mob", "note_bird", [-3, 3, -2]);
  put("mob", "overseer", [9, 0, 4], [0, -2, 0]);
  put("rift", "overworld", [-2, 2, -10], [0, 0.4, 0]);
  put("vfx", "shards", [0, 0, 0]);
  return P;
}

/* ── 5. Rose Spires ── */
export function sceneRoseSpires(): Placed[] {
  P = [];
  const rnd = mulberry(77);
  disc(-0.5, 14, "pink_turf", rnd);
  disc(-0.5, 6, "rose_path", rnd, 0.1);
  tower(-7, -6, 10, "rose_spire", "spire_bricks");
  tower(6, -8, 13, "spire_bricks", "rose_spire");
  tower(9, 4, 8, "rose_spire", "spire_bricks");
  tower(-9, 6, 7, "spire_bricks", "rose_spire");
  /* bridges */
  for (let i = 0; i < 8; i++) put("block", "ruin_tiles", [-7 + i * 1.6, 6.5, -7 + i * -0.2]);
  for (let i = 0; i < 10; i++) put("block", "pink_grass", [Math.round((rnd() - 0.5) * 22), 0.5, Math.round((rnd() - 0.5) * 22)], [0, 0, 0], [1, 1, 1]);
  tree(0, -4, "violet_wood", "pale_canopy", 3, 1);
  put("mob", "licker", [2, 0, 2], [0, 1.2, 0]);
  put("mob", "note_bird", [-2, 2.4, 0]);
  put("mob", "blub", [5, 0, 5]);
  put("rift", "sift_night", [0, 2.4, -12], [0, 0, 0], [4, 4, 1]);
  put("vfx", "sparkle", [0, 0, 0], [0, 0, 0], [1, 1, 1], { variant: "#ffc9dd" });
  return P;
}

/* ── 6. Rift Tunnel ── */
export function sceneRiftTunnel(): Placed[] {
  P = [];
  for (let z = -14; z <= 6; z++) {
    for (let x = -3; x <= 3; x++) {
      const edge = Math.abs(x) === 3;
      put("block", edge && z % 4 === 0 ? "tunnel_rib" : "tunnel_wall", [x, 0.5 - 1, z]);
      if (edge) for (let y = 0; y < 4; y++) put("block", z % 4 === 0 ? "tunnel_rib" : "tunnel_wall", [x, y - 0.5 + 0.5, z]);
      if (Math.abs(x) === 3) put("block", "tunnel_wall", [x, 4, z]);
      if (Math.abs(x) === 2) put("block", "tunnel_wall", [x, 4.6, z]);
      if (x === 0) put("block", "tunnel_wall", [x, 5, z]);
    }
    if (z % 3 === 0) { put("block", "glow_bulb", [-3, 1.5, z]); put("block", "glow_bulb", [3, 1.5, z]); }
  }
  /* threshold stages along the floor */
  for (let i = 0; i < 8; i++) put("block", `threshold_stage_${i}`, [0, 0.06, 4 - i * 2], [0, 0, 0], [1.4, 0.12, 1.4]);
  put("rift", "portal", [0, 2.4, -14]);
  put("mob", "sculkling", [1, 0, -2]);
  put("mob", "watchling", [-1.5, 1.5, -6]);
  put("vfx", "souls", [0, 0, -8], [0, 0, 0], [0.5, 1, 0.5]);
  return P;
}

/* ── 7. Singer Meadow festival ── */
export function sceneMeadow(): Placed[] {
  P = [];
  const rnd = mulberry(99);
  disc(-0.5, 16, "valley_turf", rnd);
  for (let i = 0; i < 26; i++) {
    const f = ["glow_bulb", "pink_grass", "blue_grass", "valley_fern"][Math.floor(rnd() * 4)];
    put("block", f, [Math.round((rnd() - 0.5) * 28), 0.5, Math.round((rnd() - 0.5) * 28)]);
  }
  tree(-8, -6, "verdant_wood", "verdant_canopy", 5, 2);
  tree(9, -8, "soulwood", "soul_canopy", 4, 2);
  tree(6, 8, "verdant_wood", "violet_canopy", 4, 1);
  put("block", "ichor_still", [-3, 0.05, 6], [0, 0, 0], [5, 0.1, 4]);
  put("mob", "singer", [0, 0, 0]);
  put("mob", "singer", [-3, 0, -2], [0, 1, 0]);
  put("mob", "blub", [3, 0, 2]);
  put("mob", "blub", [4.5, 0, 1]);
  put("mob", "antlerling", [-6, 0, 3], [0, 2.4, 0]);
  put("mob", "note_bird", [1, 2.6, -3]);
  put("mob", "soul_bee", [-2, 1.6, 4]);
  put("rift", "sift", [0, 2.2, -11], [0, 0, 0], [3, 3, 1]);
  put("vfx", "souls", [0, 0, 0], [0, 0, 0], [1.3, 1, 1.3], { variant: "#b0ffe0" });
  put("vfx", "sparkle", [-3, 0, 6]);
  return P;
}

export const SCENE_PRESETS: { id: string; name: string; desc: string; build: () => Placed[]; sky: string }[] = [
  { id: "ritual", name: "Ritual Plaza", desc: "Ancient-city frame, the singing portal, six note glows.", build: sceneRitualPlaza, sky: "sift_night" },
  { id: "coral", name: "Coral Expanse", desc: "Coral trees, ichor tidepool, drift jellies.", build: sceneCoralExpanse, sky: "sift_day" },
  { id: "boneyard", name: "Boneyard Gate", desc: "Skull arch with soul-lantern eyes, tusks and ribcages.", build: sceneBoneyard, sky: "end" },
  { id: "crags", name: "Titan Crags", desc: "Banded colossal crags crowned by twisted trees.", build: sceneTitanCrags, sky: "overworld" },
  { id: "spires", name: "Rose Spires", desc: "Rose-brick towers, sky bridge, pink meadow.", build: sceneRoseSpires, sky: "sift_night" },
  { id: "tunnel", name: "Rift Tunnel", desc: "Ribbed tunnel with the eight threshold stages.", build: sceneRiftTunnel, sky: "end" },
  { id: "meadow", name: "Singer Meadow", desc: "Festival meadow: singers, blubs, glow bulbs.", build: sceneMeadow, sky: "sift_day" },
];
