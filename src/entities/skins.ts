// Procedural pixel-art skins for mobs and the player character.
// Everything is generated at runtime on canvases — original art, no external assets.
import { Scene, Mesh, StandardMaterial, Color3, DynamicTexture, VertexBuffer } from "@babylonjs/core";

type Ctx = CanvasRenderingContext2D;
const TILE = 16;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xffff) / 0xffff; };
}
function px(ctx: Ctx, ox: number, oy: number, x: number, y: number, c: string) {
  if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
  ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1);
}
function rect(ctx: Ctx, ox: number, oy: number, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h);
}
function speckle(ctx: Ctx, ox: number, oy: number, seed: number, pal: string[], density = 0.6) {
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
    if (r() < density) px(ctx, ox, oy, x, y, pal[Math.floor(r() * pal.length)]);
}

export type MobKindName = "zombie" | "skeleton" | "pig" | "cow" | "sheep" | "chicken" | "bear";

interface MobPalette {
  body: string[];      // fur/cloth speckle palette
  legs: string[];
  headBase: string;
  face: (ctx: Ctx, ox: number, oy: number) => void;
  extra?: (ctx: Ctx, ox: number, oy: number, part: "body" | "head" | "legs") => void;
}

const MOB_PALETTES: Record<MobKindName, MobPalette> = {
  zombie: {
    body: ["#2a6a4a", "#206040", "#356f35", "#1c4a30"],
    legs: ["#2a5a8a", "#24507a", "#30689a"],
    headBase: "#3f8a4f",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#3f8a4f"); speckle(c, ox, oy, 11, ["#357a44", "#4a9a5a", "#2f6a3a"], 0.5);
      rect(c, ox, oy, 3, 6, 3, 2, "#0a0a0a"); rect(c, ox, oy, 10, 6, 3, 2, "#0a0a0a");
      px(c, ox, oy, 4, 6, "#7ac88a"); px(c, ox, oy, 11, 6, "#7ac88a");
      rect(c, ox, oy, 6, 11, 4, 2, "#1e4a28");
      px(c, ox, oy, 7, 11, "#123018"); px(c, ox, oy, 9, 12, "#123018");
    },
  },
  skeleton: {
    body: ["#c8c8c8", "#b8b8b8", "#d8d8d8"],
    legs: ["#b0b0b0", "#a0a0a0", "#c0c0c0"],
    headBase: "#d8d8d8",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#d8d8d8"); speckle(c, ox, oy, 21, ["#c8c8c8", "#e4e4e4"], 0.4);
      rect(c, ox, oy, 3, 6, 3, 3, "#1a1a1a"); rect(c, ox, oy, 10, 6, 3, 3, "#1a1a1a");
      px(c, ox, oy, 7, 9, "#9a9a9a"); px(c, ox, oy, 8, 9, "#9a9a9a");
      rect(c, ox, oy, 5, 12, 6, 2, "#8a8a8a");
      for (let x = 5; x <= 10; x += 2) px(c, ox, oy, x, 12, "#d8d8d8");
    },
    extra: (c, ox, oy, part) => {
      if (part === "body") for (let y = 3; y <= 12; y += 3) rect(c, ox, oy, 2, y, 12, 1, "#9a9a9a");
    },
  },
  pig: {
    body: ["#f0a0a0", "#e89898", "#f5b0b0"],
    legs: ["#e89090", "#dd8585", "#f0a5a5"],
    headBase: "#f0a0a0",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#f0a0a0"); speckle(c, ox, oy, 31, ["#e89898", "#f5b0b0"], 0.4);
      rect(c, ox, oy, 3, 6, 2, 2, "#202020"); rect(c, ox, oy, 11, 6, 2, 2, "#202020");
      rect(c, ox, oy, 6, 8, 4, 3, "#e08888");
      px(c, ox, oy, 7, 9, "#a06060"); px(c, ox, oy, 8, 9, "#a06060");
    },
  },
  cow: {
    body: ["#4a3020", "#3c2818", "#5a3c28"],
    legs: ["#3c2818", "#342214", "#463020"],
    headBase: "#4a3020",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#4a3020"); speckle(c, ox, oy, 41, ["#3c2818", "#5a3c28", "#e8e4da"], 0.35);
      rect(c, ox, oy, 2, 5, 3, 2, "#d8d4cc"); rect(c, ox, oy, 11, 5, 3, 2, "#d8d4cc");
      px(c, ox, oy, 3, 6, "#101010"); px(c, ox, oy, 12, 6, "#101010");
      rect(c, ox, oy, 5, 9, 6, 4, "#c8b8a8");
      px(c, ox, oy, 6, 10, "#3a2a1a"); px(c, ox, oy, 9, 10, "#3a2a1a");
      rect(c, ox, oy, 0, 2, 2, 2, "#e8e4da"); rect(c, ox, oy, 14, 2, 2, 2, "#e8e4da");
    },
  },
  sheep: {
    body: ["#e8e8e4", "#dcdcd6", "#f2f2ee"],
    legs: ["#d8c8b8", "#cbb8a6", "#e2d4c6"],
    headBase: "#d8d0c4",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#e8e8e4"); speckle(c, ox, oy, 51, ["#dcdcd6", "#f2f2ee"], 0.6);
      rect(c, ox, oy, 4, 4, 8, 9, "#d8cfc2");
      speckle(c, ox, oy, 52, ["#ccc2b4", "#e0d8cc"], 0.3);
      rect(c, ox, oy, 5, 6, 2, 2, "#181818"); rect(c, ox, oy, 9, 6, 2, 2, "#181818");
      rect(c, ox, oy, 7, 10, 2, 2, "#b8a898");
    },
  },
  chicken: {
    body: ["#f0f0f0", "#e4e4e4", "#fafafa"],
    legs: ["#e8a030", "#d89020", "#f5b040"],
    headBase: "#f0f0f0",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#f0f0f0"); speckle(c, ox, oy, 61, ["#e4e4e4", "#fafafa"], 0.5);
      px(c, ox, oy, 4, 6, "#101010"); px(c, ox, oy, 11, 6, "#101010");
      rect(c, ox, oy, 6, 8, 4, 2, "#e8a030"); px(c, ox, oy, 7, 10, "#c87818"); px(c, ox, oy, 8, 10, "#c87818");
      rect(c, ox, oy, 7, 11, 2, 2, "#d03020");
    },
  },
  bear: {
    body: ["#e8ecec", "#dce4e4", "#f4f8f8"],
    legs: ["#dce4e4", "#d0dada", "#e8f0f0"],
    headBase: "#e8ecec",
    face: (c, ox, oy) => {
      rect(c, ox, oy, 0, 0, 16, 16, "#e8ecec"); speckle(c, ox, oy, 71, ["#dce4e4", "#f4f8f8"], 0.5);
      rect(c, ox, oy, 3, 6, 2, 2, "#101010"); rect(c, ox, oy, 11, 6, 2, 2, "#101010");
      rect(c, ox, oy, 6, 9, 4, 3, "#c8d4d4");
      px(c, ox, oy, 7, 10, "#101010"); px(c, ox, oy, 8, 10, "#101010");
    },
  },
};

export interface MobSkinPack {
  texture: DynamicTexture;
  material: (kind: MobKindName, part: "body" | "head" | "legs") => StandardMaterial;
  tileOf: (kind: MobKindName, part: "body" | "head" | "legs") => number;
  atlasW: number; atlasH: number;
}

export function buildMobSkins(scene: Scene): MobSkinPack {
  const kinds: MobKindName[] = ["zombie", "skeleton", "pig", "cow", "sheep", "chicken", "bear"];
  const atlasW = 8, atlasH = 4; // 32 tiles of 16px
  const canvas = document.createElement("canvas");
  canvas.width = atlasW * TILE; canvas.height = atlasH * TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const tileOf = (kind: MobKindName, part: "body" | "head" | "legs") => kinds.indexOf(kind) * 3 + (part === "body" ? 0 : part === "head" ? 1 : 2);
  for (const kind of kinds) {
    const pal = MOB_PALETTES[kind];
    for (const part of ["body", "head", "legs"] as const) {
      const t = tileOf(kind, part);
      const ox = (t % atlasW) * TILE, oy = Math.floor(t / atlasW) * TILE;
      if (part === "head") {
        pal.face(ctx, ox, oy);
      } else {
        const p = part === "body" ? pal.body : pal.legs;
        rect(ctx, ox, oy, 0, 0, 16, 16, p[0]);
        speckle(ctx, ox, oy, kinds.indexOf(kind) * 100 + (part === "body" ? 1 : 2), p, 0.75);
      }
      if (pal.extra) pal.extra(ctx, ox, oy, part);
    }
  }
  const texture = new DynamicTexture("mobSkins", { width: canvas.width, height: canvas.height } as any, scene, false);
  (texture.getContext() as Ctx).drawImage(canvas, 0, 0);
  texture.update(false);
  texture.hasAlpha = false;
  const mats = new Map<string, StandardMaterial>();
  const material = (kind: MobKindName, part: "body" | "head" | "legs") => {
    const k = kind + part;
    let m = mats.get(k);
    if (!m) {
      m = new StandardMaterial("mobskin_" + k, scene);
      m.diffuseTexture = texture;
      m.specularColor = new Color3(0.04, 0.04, 0.04);
      mats.set(k, m);
    }
    return m;
  };
  return { texture, material, tileOf, atlasW, atlasH };
}

// Remap all UVs of a box mesh so every face samples a single atlas tile.
export function remapBoxUVs(mesh: Mesh, tile: number, atlasW: number, atlasH: number) {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  if (!uvs) return;
  const tx = tile % atlasW, ty = Math.floor(tile / atlasW);
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = (tx + 0.02 + uvs[i] * 0.96) / atlasW;
    uvs[i + 1] = 1 - (ty + 0.02 + (1 - uvs[i + 1]) * 0.96) / atlasH;
  }
  mesh.updateVerticesData(VertexBuffer.UVKind, uvs);
}

// ---------- Player / humanoid skin ----------
export interface HumanoidSkinPack {
  texture: DynamicTexture;
  atlasW: number; atlasH: number;
  tiles: { head_face: number; head_side: number; head_top: number; torso: number; arm: number; leg: number };
  material: StandardMaterial;
}

// Original character: auburn hair, tan skin, teal tunic, brown trousers.
export function buildHumanoidSkin(scene: Scene, variant = 0): HumanoidSkinPack {
  const atlasW = 8, atlasH = 1;
  const canvas = document.createElement("canvas");
  canvas.width = atlasW * TILE; canvas.height = atlasH * TILE;
  const ctx = canvas.getContext("2d")!;
  const shirts = [["#2a8a8a", "#238080", "#35a0a0"], ["#7a3aa0", "#6d3390", "#8a48b0"]][variant % 2];
  const O = (i: number) => i * TILE;
  // 0 head face
  rect(ctx, O(0), 0, 0, 0, 16, 16, "#d8a878");
  speckle(ctx, O(0), 0, 81, ["#cfa070", "#e0b288"], 0.4);
  rect(ctx, O(0), 0, 0, 0, 16, 4, "#7a4a26"); // hair top
  rect(ctx, O(0), 0, 0, 4, 2, 3, "#7a4a26"); rect(ctx, O(0), 0, 14, 4, 2, 3, "#7a4a26");
  rect(ctx, O(0), 0, 3, 7, 3, 2, "#ffffff"); rect(ctx, O(0), 0, 10, 7, 3, 2, "#ffffff");
  px(ctx, O(0), 0, 5, 7, "#3a5ac8"); px(ctx, O(0), 0, 11, 7, "#3a5ac8");
  px(ctx, O(0), 0, 4, 7, "#101010"); px(ctx, O(0), 0, 10, 7, "#101010");
  rect(ctx, O(0), 0, 7, 9, 2, 2, "#c89868");
  rect(ctx, O(0), 0, 6, 12, 4, 1, "#a06848");
  // 1 head side
  rect(ctx, O(1), 0, 0, 0, 16, 16, "#d8a878");
  speckle(ctx, O(1), 0, 82, ["#cfa070", "#e0b288"], 0.4);
  rect(ctx, O(1), 0, 0, 0, 16, 5, "#7a4a26"); rect(ctx, O(1), 0, 0, 5, 3, 4, "#7a4a26");
  px(ctx, O(1), 0, 10, 7, "#101010"); rect(ctx, O(1), 0, 9, 7, 2, 2, "#ffffff"); px(ctx, O(1), 0, 10, 7, "#3a5ac8");
  // 2 head top (hair)
  rect(ctx, O(2), 0, 0, 0, 16, 16, "#7a4a26");
  speckle(ctx, O(2), 0, 83, ["#6a3e1e", "#8a5630", "#946238"], 0.7);
  // 3 torso (tunic)
  rect(ctx, O(3), 0, 0, 0, 16, 16, shirts[0]);
  speckle(ctx, O(3), 0, 84, shirts, 0.6);
  rect(ctx, O(3), 0, 0, 0, 16, 2, "#5a3a20"); // collar strap
  rect(ctx, O(3), 0, 0, 13, 16, 3, "#5a3a20"); // belt
  px(ctx, O(3), 0, 7, 14, "#d8b040"); px(ctx, O(3), 0, 8, 14, "#d8b040");
  // 4 arm (sleeve + skin)
  rect(ctx, O(4), 0, 0, 0, 16, 16, shirts[0]);
  speckle(ctx, O(4), 0, 85, shirts, 0.6);
  rect(ctx, O(4), 0, 0, 10, 16, 6, "#d8a878");
  speckle(ctx, O(4), 0, 86, ["#cfa070", "#e0b288"], 0.4);
  // 5 leg (trouser + boot)
  rect(ctx, O(5), 0, 0, 0, 16, 16, "#4a3626");
  speckle(ctx, O(5), 0, 87, ["#403020", "#55402c"], 0.6);
  rect(ctx, O(5), 0, 0, 12, 16, 4, "#2a2a2a");
  rect(ctx, O(5), 0, 0, 12, 16, 1, "#3a3a3a");

  const texture = new DynamicTexture("humanoidSkin", { width: canvas.width, height: canvas.height } as any, scene, false);
  (texture.getContext() as Ctx).drawImage(canvas, 0, 0);
  texture.update(false);
  const material = new StandardMaterial("humanoidMat", scene);
  material.diffuseTexture = texture;
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  return { texture, atlasW, atlasH, tiles: { head_face: 0, head_side: 1, head_top: 2, torso: 3, arm: 4, leg: 5 }, material };
}
