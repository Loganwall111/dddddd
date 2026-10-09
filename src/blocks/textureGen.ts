// Procedurally generate a 16x16 pixel-art texture atlas for all blocks/items,
// drawn onto a canvas so no binary assets are needed. All art is original and
// generated at runtime — style inspired by classic voxel sandboxes.

import { T } from "../blocks/blocks";

const TILE = 16;
const ATLAS_W = 16;
const ATLAS_H = 8;
const CANVAS_W = TILE * ATLAS_W;
const CANVAS_H = TILE * ATLAS_H;

export type AtlasPair = { atlas: HTMLCanvasElement; itemAtlas: HTMLCanvasElement };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xffff) / 0xffff; };
}

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, tx: number, ty: number, x: number, y: number, c: string) {
  if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
  ctx.fillStyle = c;
  ctx.fillRect(tx * TILE + x, ty * TILE + y, 1, 1);
}
function rect(ctx: Ctx, tx: number, ty: number, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(tx * TILE + x, ty * TILE + y, w, h);
}
function clearTile(ctx: Ctx, tx: number, ty: number) {
  ctx.clearRect(tx * TILE, ty * TILE, TILE, TILE);
}
// Speckle a tile with palette colors
function speckle(ctx: Ctx, tx: number, ty: number, seed: number, palette: string[], density = 0.5) {
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (r() < density) px(ctx, tx, ty, x, y, palette[Math.floor(r() * palette.length)]);
  }
}
// Larger soft patches (low-frequency variation)
function patches(ctx: Ctx, tx: number, ty: number, seed: number, palette: string[], count = 5, size = 3) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(r() * TILE), cy = Math.floor(r() * TILE);
    const c = palette[Math.floor(r() * palette.length)];
    for (let y = -size; y <= size; y++) for (let x = -size; x <= size; x++) {
      if (x * x + y * y <= size * size && r() < 0.6) px(ctx, tx, ty, cx + x, cy + y, c);
    }
  }
}

function tileXY(idx: number): [number, number] {
  return [idx % ATLAS_W, Math.floor(idx / ATLAS_W)];
}
export function tileUV(tileIndex: number): [number, number, number, number] {
  const [tx, ty] = tileXY(tileIndex);
  const u0 = tx / ATLAS_W;
  const u1 = (tx + 1) / ATLAS_W;
  const v1 = 1 - ty / ATLAS_H;
  const v0 = 1 - (ty + 1) / ATLAS_H;
  return [u0, v0, u1, v1];
}

// ================= block painters =================

function grassTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#71a848");
  speckle(ctx, tx, ty, 11, ["#5f9940", "#83bb55", "#69a24a", "#7ab14e", "#55893a"], 0.8);
  patches(ctx, tx, ty, 13, ["#83bb55", "#5f9940"], 4, 2);
}
function grassSide(ctx: Ctx, tx: number, ty: number) {
  // dirt body
  rect(ctx, tx, ty, 0, 0, 16, 16, "#8a5f3c");
  speckle(ctx, tx, ty, 21, ["#79502f", "#996d45", "#6e4628", "#a3774d"], 0.7);
  patches(ctx, tx, ty, 23, ["#996d45", "#6e4628"], 4, 2);
  // grass overhang with ragged edge
  const r = rng(25);
  for (let x = 0; x < 16; x++) {
    const depth = 2 + Math.floor(r() * 3);
    for (let y = 0; y < depth; y++) px(ctx, tx, ty, x, y, y === 0 ? "#7ab14e" : (r() < 0.5 ? "#69a24a" : "#5f9940"));
    if (r() < 0.5) px(ctx, tx, ty, x, depth, "#5f9940");
  }
}
function dirt(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#8a5f3c");
  speckle(ctx, tx, ty, 31, ["#79502f", "#996d45", "#6e4628", "#a3774d"], 0.75);
  patches(ctx, tx, ty, 33, ["#996d45", "#6e4628", "#5d3b22"], 5, 2);
}
function stone(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#8d8d8d");
  speckle(ctx, tx, ty, 41, ["#7f7f7f", "#999999", "#878787", "#737373"], 0.7);
  patches(ctx, tx, ty, 43, ["#7a7a7a", "#949494"], 5, 2);
  // subtle cracks
  const r = rng(47);
  for (let i = 0; i < 3; i++) {
    let x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    for (let s = 0; s < 4; s++) {
      px(ctx, tx, ty, x, y, "#6a6a6a");
      x += Math.floor(r() * 3) - 1; y += Math.floor(r() * 3) - 1;
    }
  }
}
function sand(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#dbcf9e");
  speckle(ctx, tx, ty, 51, ["#d1c48e", "#e6dbab", "#c7ba84", "#efe4b8"], 0.8);
  patches(ctx, tx, ty, 53, ["#c7ba84", "#e6dbab"], 4, 2);
}
function gravel(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#8a8078");
  const r = rng(61);
  // pebbles
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    const c = ["#6e665e", "#9c948c", "#7a716a", "#5d564f"][Math.floor(r() * 4)];
    px(ctx, tx, ty, x, y, c);
    if (r() < 0.6) px(ctx, tx, ty, x + 1, y, c);
    if (r() < 0.5) px(ctx, tx, ty, x, y + 1, c);
  }
  speckle(ctx, tx, ty, 63, ["#787068", "#948c84"], 0.3);
}
function logSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#6b4f2e");
  // vertical bark strips
  const r = rng(71);
  for (let x = 0; x < 16; x++) {
    const shade = r();
    const c = shade < 0.3 ? "#5a4126" : shade < 0.6 ? "#6b4f2e" : "#7a5a34";
    for (let y = 0; y < 16; y++) {
      px(ctx, tx, ty, x, y, c);
      if (r() < 0.12) px(ctx, tx, ty, x, y, "#4e3820");
    }
  }
  // darker vertical grooves
  for (const gx of [2, 6, 10, 14]) for (let y = 0; y < 16; y++) if (rng(gx * 31 + y)() < 0.7) px(ctx, tx, ty, gx, y, "#543c22");
}
function logTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#6b4f2e");
  // bark border
  rect(ctx, tx, ty, 1, 1, 14, 14, "#b8905c");
  speckle(ctx, tx, ty, 75, ["#a8814e", "#c49a66"], 0.4);
  // rings
  rect(ctx, tx, ty, 3, 3, 10, 10, "#8a683c");
  rect(ctx, tx, ty, 5, 5, 6, 6, "#b8905c");
  rect(ctx, tx, ty, 7, 7, 2, 2, "#8a683c");
  // bark corners
  for (let i = 0; i < 16; i++) {
    px(ctx, tx, ty, i, 0, "#5a4126"); px(ctx, tx, ty, i, 15, "#5a4126");
    px(ctx, tx, ty, 0, i, "#5a4126"); px(ctx, tx, ty, 15, i, "#5a4126");
  }
}
function planks(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#b08a52");
  speckle(ctx, tx, ty, 81, ["#a37e48", "#bd985f", "#96723f"], 0.5);
  // four boards
  for (const by of [0, 4, 8, 12]) {
    rect(ctx, tx, ty, 0, by + 3, 16, 1, "#7a5c30"); // seam shadow
    px(ctx, tx, ty, 0, by, "#c4a066"); px(ctx, tx, ty, 15, by, "#c4a066");
  }
  // vertical joints staggered
  for (let y = 0; y < 4; y++) { px(ctx, tx, ty, 4, y, "#7a5c30"); px(ctx, tx, ty, 12, y + 8, "#7a5c30"); }
  for (let y = 4; y < 8; y++) px(ctx, tx, ty, 9, y, "#7a5c30");
  for (let y = 12; y < 16; y++) px(ctx, tx, ty, 7, y, "#7a5c30");
}
function leaves(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#2f7a1f");
  speckle(ctx, tx, ty, 91, ["#276a1a", "#38902a", "#1e5712", "#43a633", "#357f24"], 0.9);
  // dark holes
  const r = rng(93);
  for (let i = 0; i < 8; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "#123c0a");
}
function waterTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#3d5fd8");
  speckle(ctx, tx, ty, 101, ["#3556cc", "#4a6ee6", "#2d4cb8", "#5a7dee"], 0.7);
  // wave streaks
  const r = rng(103);
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(r() * 16);
    const x0 = Math.floor(r() * 12);
    const len = 3 + Math.floor(r() * 4);
    for (let x = 0; x < len; x++) px(ctx, tx, ty, x0 + x, y, "#7d9bf2");
  }
}
function bedrock(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#454545");
  patches(ctx, tx, ty, 111, ["#262626", "#5c5c5c", "#1a1a1a", "#6e6e6e"], 8, 2);
  speckle(ctx, tx, ty, 113, ["#333333", "#565656"], 0.35);
}
function cobble(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#5c5c5c");
  // rounded stones
  const stones = [
    [1, 1, 5, 4], [7, 0, 6, 5], [13, 1, 3, 3], [0, 6, 4, 5], [5, 6, 5, 4],
    [11, 6, 5, 4], [1, 12, 6, 4], [8, 11, 5, 5], [14, 11, 2, 4],
  ];
  const r = rng(121);
  for (const [sx, sy, w, h] of stones) {
    const base = ["#7d7d7d", "#8a8a8a", "#737373"][Math.floor(r() * 3)];
    rect(ctx, tx, ty, sx, sy, w, h, base);
    // highlight top-left, shadow bottom-right
    for (let i = 0; i < w; i++) { px(ctx, tx, ty, sx + i, sy, "#9d9d9d"); px(ctx, tx, ty, sx + i, sy + h - 1, "#545454"); }
    for (let i = 0; i < h; i++) { px(ctx, tx, ty, sx, sy + i, "#969696"); px(ctx, tx, ty, sx + w - 1, sy + i, "#4e4e4e"); }
    speckle(ctx, tx, ty, 125 + sx + sy, ["#858585", "#707070"], 0.2);
  }
}
function oreTile(ctx: Ctx, tx: number, ty: number, ore: string, oreHi: string, oreLo: string, seed: number) {
  stone(ctx, tx, ty);
  const r = rng(seed);
  const clusters = 4;
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
    const shape = [
      [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1],
    ];
    for (const [dx, dy] of shape) {
      if (r() < 0.8) px(ctx, tx, ty, cx + dx, cy + dy, ore);
    }
    px(ctx, tx, ty, cx, cy, oreHi);
    px(ctx, tx, ty, cx + 1, cy + 1, oreLo);
  }
}
function glassTile(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  // frame
  for (let i = 0; i < 16; i++) {
    px(ctx, tx, ty, i, 0, "#e8f4ff"); px(ctx, tx, ty, i, 15, "#b8d4e8");
    px(ctx, tx, ty, 0, i, "#dcecf8"); px(ctx, tx, ty, 15, i, "#c8dcec");
  }
  // diagonal sheen streaks
  for (let i = 0; i < 6; i++) { px(ctx, tx, ty, 2 + i, 5 - i + 2, "#ffffff"); }
  for (let i = 0; i < 4; i++) { px(ctx, tx, ty, 9 + i, 13 - i, "#e8f4ff"); }
  px(ctx, tx, ty, 3, 4, "#ffffff");
}
function brickTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#9c9c9c"); // mortar base
  // rows of bricks (staggered)
  const rows = [0, 4, 8, 12];
  for (let ri = 0; ri < 4; ri++) {
    const y = rows[ri];
    const off = ri % 2 === 0 ? 0 : 4;
    for (let x = -4; x < 16; x += 8) {
      const bx = x + off;
      const c = ri % 2 === 0 ? "#9e4a3a" : "#a04c3c";
      rect(ctx, tx, ty, Math.max(0, bx), y, Math.min(7, 16 - Math.max(0, bx)), 3, c);
    }
  }
  speckle(ctx, tx, ty, 131, ["#8e4030", "#aa5a48"], 0.25);
}
function snowTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#f4faff");
  speckle(ctx, tx, ty, 141, ["#e2ecf6", "#ffffff", "#d4e2f0"], 0.5);
}
function iceTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#8db8f0");
  speckle(ctx, tx, ty, 151, ["#a0c8f5", "#7aa8e8", "#bcd8f8"], 0.6);
  // cracks
  for (let i = 0; i < 8; i++) px(ctx, tx, ty, 2 + i, 3 + i % 3, "#d8ecff");
  for (let i = 0; i < 6; i++) px(ctx, tx, ty, 10 - i, 10 + (i % 2), "#d8ecff");
}
function lavaTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#cf5210");
  patches(ctx, tx, ty, 161, ["#e87818", "#b23e08", "#f8961e", "#963005"], 7, 2);
  const r = rng(163);
  for (let i = 0; i < 10; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "#ffd048");
}
function obsidianTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#140d1e");
  patches(ctx, tx, ty, 171, ["#241636", "#0c0714", "#31204a"], 6, 2);
  const r = rng(173);
  for (let i = 0; i < 6; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "#5a3d80");
}
function netherrackTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#6e2424");
  patches(ctx, tx, ty, 181, ["#521a1a", "#8a2e2e", "#3e1212", "#7e2a2a"], 7, 2);
  speckle(ctx, tx, ty, 183, ["#5e1e1e", "#7e2e2e"], 0.4);
}
function soulSandTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#4e3a28");
  patches(ctx, tx, ty, 191, ["#3e2e1e", "#5e4632", "#332618"], 6, 2);
  // sad faces
  const r = rng(193);
  for (let i = 0; i < 2; i++) {
    const x = 2 + Math.floor(r() * 10), y = 3 + Math.floor(r() * 8);
    px(ctx, tx, ty, x, y, "#241a10"); px(ctx, tx, ty, x + 2, y, "#241a10");
    px(ctx, tx, ty, x, y + 2, "#241a10"); px(ctx, tx, ty, x + 1, y + 2, "#241a10"); px(ctx, tx, ty, x + 2, y + 2, "#241a10");
  }
}
function glowstoneTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#b98a34");
  patches(ctx, tx, ty, 201, ["#8f6a22", "#d9a844", "#7a5a1c", "#e8bc58"], 6, 2);
  const r = rng(203);
  for (let i = 0; i < 14; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "#fff0a8");
}
function endStoneTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#dcdcb2");
  speckle(ctx, tx, ty, 211, ["#cfcfa2", "#e8e8c0", "#c2c294"], 0.6);
  const r = rng(213);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    px(ctx, tx, ty, x, y, "#a8a87c"); px(ctx, tx, ty, x + 1, y, "#b4b488");
  }
}
function endFrameTile(ctx: Ctx, tx: number, ty: number) {
  endStoneTile(ctx, tx, ty);
  rect(ctx, tx, ty, 0, 0, 16, 3, "#3a5e42");
  rect(ctx, tx, ty, 0, 0, 16, 1, "#4e7a56");
  // eye socket
  rect(ctx, tx, ty, 5, 7, 6, 6, "#140d1e");
  rect(ctx, tx, ty, 6, 8, 4, 4, "#31c48a");
  px(ctx, tx, ty, 7, 9, "#e8fff2");
}
function tntSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c8382c");
  speckle(ctx, tx, ty, 221, ["#b22c22", "#d94a3a", "#a42418"], 0.4);
  // white band with TNT
  rect(ctx, tx, ty, 0, 5, 16, 6, "#e8e4dc");
  rect(ctx, tx, ty, 0, 5, 16, 1, "#c8c4bc");
  rect(ctx, tx, ty, 0, 10, 16, 1, "#c8c4bc");
  // letters
  const L = "#1c1c1c";
  // T
  rect(ctx, tx, ty, 2, 6, 3, 1, L); px(ctx, tx, ty, 3, 7, L); px(ctx, tx, ty, 3, 8, L); px(ctx, tx, ty, 3, 9, L);
  // N
  px(ctx, tx, ty, 7, 6, L); px(ctx, tx, ty, 7, 7, L); px(ctx, tx, ty, 7, 8, L); px(ctx, tx, ty, 7, 9, L);
  px(ctx, tx, ty, 8, 7, L);
  px(ctx, tx, ty, 9, 6, L); px(ctx, tx, ty, 9, 7, L); px(ctx, tx, ty, 9, 8, L); px(ctx, tx, ty, 9, 9, L);
  // T
  rect(ctx, tx, ty, 11, 6, 3, 1, L); px(ctx, tx, ty, 12, 7, L); px(ctx, tx, ty, 12, 8, L); px(ctx, tx, ty, 12, 9, L);
}
function tntTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c8382c");
  speckle(ctx, tx, ty, 231, ["#b22c22", "#d94a3a"], 0.4);
  rect(ctx, tx, ty, 3, 3, 10, 10, "#e8e4dc");
  rect(ctx, tx, ty, 6, 6, 4, 4, "#3a3a3a");
  px(ctx, tx, ty, 7, 7, "#8a8a8a");
}
function tntBottom(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c8382c");
  speckle(ctx, tx, ty, 241, ["#b22c22", "#d94a3a", "#a42418"], 0.5);
}
function bookshelfTile(ctx: Ctx, tx: number, ty: number) {
  planks(ctx, tx, ty);
  // two shelf rows of books
  for (const rowY of [1, 9]) {
    rect(ctx, tx, ty, 1, rowY, 14, 6, "#3e2c18");
    const colors = ["#a03838", "#3868a0", "#3e8a3e", "#a08838", "#6a3ea0", "#38a0a0", "#a06038"];
    const r = rng(251 + rowY);
    let x = 1;
    while (x < 14) {
      const w = 1 + Math.floor(r() * 2);
      const c = colors[Math.floor(r() * colors.length)];
      rect(ctx, tx, ty, x, rowY + 1, w, 5, c);
      if (r() < 0.4) px(ctx, tx, ty, x, rowY + 2, "#e8e0d0");
      x += w + (r() < 0.3 ? 1 : 0);
    }
  }
}
function craftTop(ctx: Ctx, tx: number, ty: number) {
  planks(ctx, tx, ty);
  // grid inlay
  for (const i of [1, 5, 9, 13]) { rect(ctx, tx, ty, i, 1, 1, 14, "#7a5c30"); rect(ctx, tx, ty, 1, i, 14, 1, "#7a5c30"); }
  rect(ctx, tx, ty, 2, 2, 12, 12, "#c4a066");
  for (const i of [6, 10]) { rect(ctx, tx, ty, i, 2, 1, 12, "#7a5c30"); rect(ctx, tx, ty, 2, i, 12, 1, "#7a5c30"); }
}
function craftSide(ctx: Ctx, tx: number, ty: number) {
  planks(ctx, tx, ty);
  // saw & tool motifs
  rect(ctx, tx, ty, 2, 3, 5, 4, "#8a8a8a");
  rect(ctx, tx, ty, 3, 4, 3, 2, "#6a6a6a");
  rect(ctx, tx, ty, 9, 8, 5, 2, "#6f4f2b");
  rect(ctx, tx, ty, 10, 6, 3, 2, "#8a8a8a");
}
function craftFront(ctx: Ctx, tx: number, ty: number) { craftSide(ctx, tx, ty); }
function furnaceSide(ctx: Ctx, tx: number, ty: number) {
  cobble(ctx, tx, ty);
}
function furnaceFront(ctx: Ctx, tx: number, ty: number) {
  cobble(ctx, tx, ty);
  // mouth
  rect(ctx, tx, ty, 4, 6, 8, 7, "#1c1c1c");
  rect(ctx, tx, ty, 4, 6, 8, 1, "#0e0e0e");
  // fire
  rect(ctx, tx, ty, 6, 10, 4, 3, "#ff9020");
  rect(ctx, tx, ty, 7, 9, 2, 2, "#ffd048");
  px(ctx, tx, ty, 7, 11, "#c83810"); px(ctx, tx, ty, 8, 11, "#c83810");
}
function chestTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#9c6e34");
  speckle(ctx, tx, ty, 261, ["#8a5f2c", "#aa7c40", "#7e5426"], 0.45);
  // frame
  rect(ctx, tx, ty, 0, 0, 16, 1, "#5e3e1c"); rect(ctx, tx, ty, 0, 15, 16, 1, "#5e3e1c");
  rect(ctx, tx, ty, 0, 0, 1, 16, "#5e3e1c"); rect(ctx, tx, ty, 15, 0, 1, 16, "#5e3e1c");
  rect(ctx, tx, ty, 0, 6, 16, 2, "#5e3e1c");
  // latch
  rect(ctx, tx, ty, 7, 5, 2, 4, "#c8c4bc");
  px(ctx, tx, ty, 7, 7, "#3a3a3a"); px(ctx, tx, ty, 8, 7, "#3a3a3a");
}
function torchTile(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  rect(ctx, tx, ty, 7, 8, 2, 6, "#8a5f2c");
  px(ctx, tx, ty, 7, 8, "#6f4820"); px(ctx, tx, ty, 8, 13, "#6f4820");
  rect(ctx, tx, ty, 6, 5, 4, 3, "#ff9020");
  rect(ctx, tx, ty, 7, 4, 2, 2, "#ffd048");
  px(ctx, tx, ty, 7, 3, "#fff4b0"); px(ctx, tx, ty, 8, 6, "#ffe888");
}
function mushroomTile(ctx: Ctx, tx: number, ty: number, cap: string, capHi: string) {
  clearTile(ctx, tx, ty);
  rect(ctx, tx, ty, 7, 9, 2, 5, "#e8dcc8");
  px(ctx, tx, ty, 7, 13, "#c4b49c"); px(ctx, tx, ty, 8, 13, "#c4b49c");
  rect(ctx, tx, ty, 4, 5, 8, 4, cap);
  rect(ctx, tx, ty, 5, 4, 6, 1, cap);
  rect(ctx, tx, ty, 4, 8, 8, 1, capHi === cap ? cap : "#c4b49c");
  px(ctx, tx, ty, 5, 5, capHi); px(ctx, tx, ty, 9, 6, capHi); px(ctx, tx, ty, 7, 4, capHi);
}
function cactusSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#3e7e2e");
  speckle(ctx, tx, ty, 271, ["#36702a", "#489038", "#2e6020"], 0.5);
  for (let y = 0; y < 16; y++) { px(ctx, tx, ty, 0, y, "#2a5a1c"); px(ctx, tx, ty, 15, y, "#2a5a1c"); }
  const r = rng(273);
  for (let i = 0; i < 10; i++) {
    const x = 1 + Math.floor(r() * 14), y = Math.floor(r() * 16);
    px(ctx, tx, ty, x, y, "#a8d888");
  }
}
function cactusTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#489038");
  rect(ctx, tx, ty, 1, 1, 14, 14, "#5aa848");
  rect(ctx, tx, ty, 0, 0, 16, 1, "#2a5a1c"); rect(ctx, tx, ty, 0, 15, 16, 1, "#2a5a1c");
  rect(ctx, tx, ty, 0, 0, 1, 16, "#2a5a1c"); rect(ctx, tx, ty, 15, 0, 1, 16, "#2a5a1c");
  rect(ctx, tx, ty, 6, 6, 4, 4, "#3e7e2e");
}
function pumpkinSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#d8842c");
  // ribs
  for (const x of [0, 4, 8, 12]) {
    rect(ctx, tx, ty, x, 0, 1, 16, "#b06418");
    rect(ctx, tx, ty, x + 1, 0, 1, 16, "#e89840");
  }
  rect(ctx, tx, ty, 0, 0, 16, 1, "#b06418"); rect(ctx, tx, ty, 0, 15, 16, 1, "#a45c14");
}
function pumpkinTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c87824");
  for (const i of [2, 6, 10, 14]) { rect(ctx, tx, ty, i, 0, 1, 16, "#b06418"); rect(ctx, tx, ty, 0, i, 16, 1, "#b06418"); }
  rect(ctx, tx, ty, 6, 6, 4, 4, "#6e8a2e");
  px(ctx, tx, ty, 7, 7, "#5a7024"); px(ctx, tx, ty, 8, 8, "#5a7024");
}
function tallgrassTile(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  const r = rng(281);
  for (let b = 0; b < 7; b++) {
    const x = 1 + Math.floor(r() * 14);
    const h = 5 + Math.floor(r() * 7);
    const lean = Math.floor(r() * 3) - 1;
    for (let y = 0; y < h; y++) {
      const xx = x + Math.floor((y / h) * lean);
      px(ctx, tx, ty, xx, 15 - y, y < 2 ? "#83bb55" : (r() < 0.5 ? "#5f9940" : "#69a24a"));
    }
  }
}
function flowerTile(ctx: Ctx, tx: number, ty: number, petal: string, petalHi: string) {
  clearTile(ctx, tx, ty);
  for (let y = 9; y < 16; y++) px(ctx, tx, ty, 7, y, "#4e8a2e");
  px(ctx, tx, ty, 6, 12, "#5f9940"); px(ctx, tx, ty, 5, 11, "#5f9940");
  px(ctx, tx, ty, 8, 13, "#5f9940");
  rect(ctx, tx, ty, 5, 3, 5, 4, petal);
  px(ctx, tx, ty, 4, 4, petal); px(ctx, tx, ty, 10, 4, petal); px(ctx, tx, ty, 4, 5, petal); px(ctx, tx, ty, 10, 5, petal);
  px(ctx, tx, ty, 6, 2, petal); px(ctx, tx, ty, 8, 2, petal);
  px(ctx, tx, ty, 6, 7, petal); px(ctx, tx, ty, 8, 7, petal);
  rect(ctx, tx, ty, 7, 4, 1, 2, petalHi);
}
function portalTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#4b1590");
  const r = rng(291);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    if (v < 0.22) px(ctx, tx, ty, x, y, "#9a4ee8");
    else if (v < 0.4) px(ctx, tx, ty, x, y, "#6f28c8");
    else if (v < 0.46) px(ctx, tx, ty, x, y, "#d8a8ff");
  }
  // swirl streaks
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * 14), y = Math.floor(r() * 10);
    for (let s = 0; s < 3; s++) px(ctx, tx, ty, x + s, y + s * 2, "#c88aff");
  }
}
function endPortalTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#0c0c1c");
  const r = rng(292);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    px(ctx, tx, ty, x, y, r() < 0.5 ? "#1affc8" : "#0a8a6a");
  }
  for (let i = 0; i < 8; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "#d0ffe8");
}
function bedTop(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c8382c");
  speckle(ctx, tx, ty, 293, ["#b22c22", "#d94a3a"], 0.3);
  rect(ctx, tx, ty, 0, 0, 16, 4, "#e8e4dc");
  rect(ctx, tx, ty, 0, 4, 16, 1, "#c8c4bc");
}
function bedSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#c8382c");
  rect(ctx, tx, ty, 0, 10, 16, 6, "#8a5f2c");
  rect(ctx, tx, ty, 0, 10, 16, 1, "#5e3e1c");
  rect(ctx, tx, ty, 0, 0, 16, 2, "#e8e4dc");
}
function bedEnd(ctx: Ctx, tx: number, ty: number) { bedSide(ctx, tx, ty); }
function woolTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#e2e2e2");
  const r = rng(294);
  for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
    if (r() < 0.6) { rect(ctx, tx, ty, x, y, 2, 2, ["#d4d4d4", "#eeeeee", "#c6c6c6"][Math.floor(r() * 3)]); }
  }
}
function clayTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#9da4b0");
  speckle(ctx, tx, ty, 295, ["#8e95a2", "#acb3be", "#848b98"], 0.6);
}
function quartzTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#ece4d8");
  speckle(ctx, tx, ty, 296, ["#e0d6c8", "#f5efe5", "#d5cab8"], 0.5);
  rect(ctx, tx, ty, 0, 4, 16, 1, "#c8bca8"); rect(ctx, tx, ty, 0, 11, 16, 1, "#c8bca8");
}

// ================= item painters =================
function pickaxeTile(ctx: Ctx, tx: number, ty: number, head: string, headHi: string) {
  clearTile(ctx, tx, ty);
  const stick = "#8a5f2c";
  // diagonal stick
  for (let i = 0; i < 10; i++) { px(ctx, tx, ty, 12 - i, 3 + i, stick); px(ctx, tx, ty, 13 - i, 4 + i, "#6f4820"); }
  // curved head
  for (let i = 0; i < 7; i++) px(ctx, tx, ty, 1 + i, 4 - Math.floor(Math.abs(i - 3) * 0.8), head);
  for (let i = 0; i < 7; i++) px(ctx, tx, ty, 1 + i, 5 - Math.floor(Math.abs(i - 3) * 0.8), head);
  px(ctx, tx, ty, 1, 6, head); px(ctx, tx, ty, 7, 6, head);
  px(ctx, tx, ty, 0, 7, head); px(ctx, tx, ty, 8, 7, head);
  px(ctx, tx, ty, 3, 3, headHi); px(ctx, tx, ty, 4, 3, headHi);
}
function swordTile(ctx: Ctx, tx: number, ty: number, blade: string, bladeHi: string) {
  clearTile(ctx, tx, ty);
  const stick = "#8a5f2c";
  // blade diagonal
  for (let i = 0; i < 9; i++) {
    px(ctx, tx, ty, 3 + i, 11 - i, blade);
    px(ctx, tx, ty, 4 + i, 12 - i, blade);
    if (i < 7) px(ctx, tx, ty, 3 + i, 12 - i, bladeHi);
  }
  px(ctx, tx, ty, 2, 12, blade); px(ctx, tx, ty, 12, 2, bladeHi);
  // guard
  for (let i = 0; i < 4; i++) px(ctx, tx, ty, 2 + i, 12 + i, "#5a5a5a");
  // handle
  px(ctx, tx, ty, 2, 14, stick); px(ctx, tx, ty, 1, 15, stick);
  px(ctx, tx, ty, 3, 15, "#6f4820"); px(ctx, tx, ty, 2, 13, stick);
}
function appleTile(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  rect(ctx, tx, ty, 5, 6, 6, 6, "#d32f2f");
  px(ctx, tx, ty, 4, 7, "#d32f2f"); px(ctx, tx, ty, 11, 7, "#d32f2f");
  px(ctx, tx, ty, 4, 10, "#d32f2f"); px(ctx, tx, ty, 11, 10, "#d32f2f");
  px(ctx, tx, ty, 5, 12, "#d32f2f"); px(ctx, tx, ty, 10, 12, "#d32f2f");
  rect(ctx, tx, ty, 6, 7, 2, 2, "#ff7066");
  px(ctx, tx, ty, 7, 5, "#5f9940"); px(ctx, tx, ty, 8, 4, "#69a24a"); px(ctx, tx, ty, 9, 4, "#69a24a");
}
function breadTile(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  rect(ctx, tx, ty, 2, 6, 12, 6, "#c49a5a");
  rect(ctx, tx, ty, 3, 5, 10, 1, "#e8c382");
  rect(ctx, tx, ty, 2, 6, 1, 6, "#a87e42"); rect(ctx, tx, ty, 13, 6, 1, 6, "#a87e42");
  rect(ctx, tx, ty, 3, 12, 10, 1, "#8a6632");
  for (const x of [4, 7, 10]) px(ctx, tx, ty, x, 8, "#a87e42");
}
function stickItem(ctx: Ctx, tx: number, ty: number) {
  clearTile(ctx, tx, ty);
  for (let i = 0; i < 12; i++) { px(ctx, tx, ty, 2 + i, 3 + i, "#8a5f2c"); px(ctx, tx, ty, 3 + i, 4 + i, "#6f4820"); }
}
function ingotTile(ctx: Ctx, tx: number, ty: number, base: string, hi: string, lo: string) {
  clearTile(ctx, tx, ty);
  rect(ctx, tx, ty, 3, 7, 10, 4, base);
  rect(ctx, tx, ty, 3, 6, 10, 1, hi);
  rect(ctx, tx, ty, 3, 11, 10, 1, lo);
  rect(ctx, tx, ty, 2, 8, 1, 3, lo); rect(ctx, tx, ty, 13, 8, 1, 3, lo);
  px(ctx, tx, ty, 4, 7, hi); px(ctx, tx, ty, 5, 7, hi);
}

// ================= atlas assembly =================
export function generateBlockAtlas(): AtlasPair {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const draw = (tile: number, fn: (c: Ctx, x: number, y: number) => void) => {
    const [tx, ty] = tileXY(tile);
    fn(ctx, tx, ty);
  };

  draw(T.grass_top, grassTop);
  draw(T.grass_side, grassSide);
  draw(T.dirt, dirt);
  draw(T.stone, stone);
  draw(T.sand, sand);
  draw(T.gravel, gravel);
  draw(T.wood_side, logSide);
  draw(T.wood_top, logTop);
  draw(T.planks, planks);
  draw(T.leaves, leaves);
  draw(T.water, waterTile);
  draw(T.bedrock, bedrock);
  draw(T.cobble, cobble);
  draw(T.coal_ore, (c, x, y) => oreTile(c, x, y, "#2a2a2a", "#444444", "#1a1a1a", 301));
  draw(T.iron_ore, (c, x, y) => oreTile(c, x, y, "#d8af93", "#e8c8b0", "#b08a6e", 302));
  draw(T.gold_ore, (c, x, y) => oreTile(c, x, y, "#fcee4b", "#fff8a0", "#d4c22e", 303));
  draw(T.diamond_ore, (c, x, y) => oreTile(c, x, y, "#57e8e0", "#a8fff8", "#38b8b0", 304));
  draw(T.glass, glassTile);
  draw(T.brick, brickTile);
  draw(T.snow, snowTile);
  draw(T.ice, iceTile);
  draw(T.lava, lavaTile);
  draw(T.obsidian, obsidianTile);
  draw(T.netherrack, netherrackTile);
  draw(T.soul_sand, soulSandTile);
  draw(T.glowstone, glowstoneTile);
  draw(T.end_stone, endStoneTile);
  draw(T.end_frame, endFrameTile);
  draw(T.tnt_side, tntSide);
  draw(T.tnt_top, tntTop);
  draw(T.tnt_bottom, tntBottom);
  draw(T.bookshelf, bookshelfTile);
  draw(T.craft_top, craftTop);
  draw(T.craft_side, craftSide);
  draw(T.craft_front, craftFront);
  draw(T.furnace_side, furnaceSide);
  draw(T.furnace_front, furnaceFront);
  draw(T.chest, chestTile);
  draw(T.torch, torchTile);
  draw(T.mushroom_red, (c, x, y) => mushroomTile(c, x, y, "#c8302e", "#e86860"));
  draw(T.mushroom_brown, (c, x, y) => mushroomTile(c, x, y, "#8b5e3a", "#a87a52"));
  draw(T.cactus_side, cactusSide);
  draw(T.cactus_top, cactusTop);
  draw(T.pumpkin_side, pumpkinSide);
  draw(T.pumpkin_top, pumpkinTop);
  draw(T.tallgrass, tallgrassTile);
  draw(T.flower_rose, (c, x, y) => flowerTile(c, x, y, "#e23434", "#ffd670"));
  draw(T.flower_dandelion, (c, x, y) => flowerTile(c, x, y, "#ffdd40", "#ff9020"));
  draw(T.portal, portalTile);
  draw(T.bed_top, bedTop);
  draw(T.bed_side, bedSide);
  draw(T.bed_end, bedEnd);
  draw(T.wool_white, woolTile);
  draw(T.clay, clayTile);
  draw(T.redstone_ore, (c, x, y) => oreTile(c, x, y, "#e02020", "#ff5050", "#a01010", 305));
  draw(T.emerald_ore, (c, x, y) => oreTile(c, x, y, "#20c868", "#8affa0", "#109048", 306));
  draw(T.quartz, quartzTile);
  draw(T.end_portal, endPortalTile);

  // biome & building variety
  draw(T.birch_side, birchSide);
  draw(T.birch_top, (c, x, y) => logTopColored(c, x, y, "#d8d0c0", "#b8ae98"));
  draw(T.birch_leaves, (c, x, y) => leavesColored(c, x, y, ["#5da045", "#6fb356", "#4c8a38", "#7fc266", "#549a3e"], 93, true));
  draw(T.spruce_side, (c, x, y) => barkColored(c, x, y, ["#3a2a17", "#4a3620", "#2e2012", "#55401f"]));
  draw(T.spruce_top, (c, x, y) => logTopColored(c, x, y, "#4a3620", "#3a2a17"));
  draw(T.spruce_leaves, (c, x, y) => leavesColored(c, x, y, ["#1e4023", "#2a5530", "#16321a", "#33663a", "#234a28"], 96, false));
  draw(T.stone_bricks, stoneBricksTile);
  draw(T.mossy_cobble, mossyCobbleTile);
  draw(T.iron_block, (c, x, y) => metalBlock(c, x, y, ["#e8e8e8", "#d8d8d8", "#c0c0c0", "#f8f8f8"], "#9a9a9a"));
  draw(T.gold_block, (c, x, y) => metalBlock(c, x, y, ["#f8d838", "#e8c828", "#d0b018", "#ffe878"], "#a88a10"));
  draw(T.diamond_block, (c, x, y) => metalBlock(c, x, y, ["#68e8e0", "#57d8d0", "#45c0b8", "#a0fff8"], "#2a9a94"));
  draw(T.nether_brick, netherBrickTile);
  draw(T.melon_side, melonSide);
  draw(T.melon_top, melonTop);
  draw(T.sandstone, sandstoneTile);
  draw(T.item_coal, (c, x, y) => gemItem(c, x, y, ["#2a2a2a", "#3a3a3a", "#181818", "#555555"]));
  draw(T.item_diamond, (c, x, y) => gemItem(c, x, y, ["#4aede4", "#7ffff6", "#2bc4bc", "#d0fffc"]));
  draw(T.item_emerald, (c, x, y) => gemItem(c, x, y, ["#28c860", "#70f0a0", "#149848", "#c0ffe0"]));

  // items
  draw(T.item_pickaxe_wood, (c, x, y) => pickaxeTile(c, x, y, "#b08a52", "#c4a066"));
  draw(T.item_pickaxe_stone, (c, x, y) => pickaxeTile(c, x, y, "#8d8d8d", "#a5a5a5"));
  draw(T.item_pickaxe_iron, (c, x, y) => pickaxeTile(c, x, y, "#e8e8e8", "#ffffff"));
  draw(T.item_pickaxe_diamond, (c, x, y) => pickaxeTile(c, x, y, "#57e8e0", "#a8fff8"));
  draw(T.item_sword_wood, (c, x, y) => swordTile(c, x, y, "#b08a52", "#c4a066"));
  draw(T.item_sword_iron, (c, x, y) => swordTile(c, x, y, "#e8e8e8", "#ffffff"));
  draw(T.item_apple, appleTile);
  draw(T.item_bread, breadTile);
  draw(T.item_stick, stickItem);
  draw(T.item_ingot_iron, (c, x, y) => ingotTile(c, x, y, "#e0e0e0", "#ffffff", "#a0a0a0"));
  draw(T.item_ingot_gold, (c, x, y) => ingotTile(c, x, y, "#f5d048", "#ffefa0", "#c09020"));

  return { atlas: canvas, itemAtlas: canvas };
}

// ================= extended biome / building painters =================
function birchSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#e8e4da");
  speckle(ctx, tx, ty, 901, ["#ddd8cc", "#f2efe6", "#d0cabd"], 0.5);
  // characteristic dark dashes
  const r = rng(902);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 13), y = Math.floor(r() * 16);
    const w = 2 + Math.floor(r() * 3);
    rect(ctx, tx, ty, x, y, w, 1, r() < 0.6 ? "#3a3a34" : "#5a5a50");
  }
}
function logTopColored(ctx: Ctx, tx: number, ty: number, bark: string, heart: string) {
  rect(ctx, tx, ty, 0, 0, 16, 16, bark);
  rect(ctx, tx, ty, 1, 1, 14, 14, heart);
  speckle(ctx, tx, ty, 905, [heart, bark], 0.25);
  rect(ctx, tx, ty, 3, 3, 10, 10, bark);
  rect(ctx, tx, ty, 5, 5, 6, 6, heart);
  rect(ctx, tx, ty, 7, 7, 2, 2, bark);
}
function barkColored(ctx: Ctx, tx: number, ty: number, pal: string[]) {
  rect(ctx, tx, ty, 0, 0, 16, 16, pal[1]);
  const r = rng(910);
  for (let x = 0; x < 16; x++) {
    const c = pal[Math.floor(r() * pal.length)];
    for (let y = 0; y < 16; y++) {
      px(ctx, tx, ty, x, y, c);
      if (r() < 0.1) px(ctx, tx, ty, x, y, pal[2]);
    }
  }
}
function leavesColored(ctx: Ctx, tx: number, ty: number, pal: string[], seed: number, holey: boolean) {
  rect(ctx, tx, ty, 0, 0, 16, 16, pal[0]);
  speckle(ctx, tx, ty, seed, pal, 0.9);
  const r = rng(seed + 1);
  const holes = holey ? 9 : 4;
  for (let i = 0; i < holes; i++) px(ctx, tx, ty, Math.floor(r() * 16), Math.floor(r() * 16), "rgba(0,0,0,0.55)");
}
function stoneBricksTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#7a7a7a");
  speckle(ctx, tx, ty, 920, ["#828282", "#727272", "#8a8a8a"], 0.5);
  // mortar lines: 4x4 bricks staggered
  for (const my of [3, 7, 11, 15]) rect(ctx, tx, ty, 0, my, 16, 1, "#5a5a5a");
  for (let y = 0; y < 4; y++) { const off = (y % 2) * 4; for (let x = off; x < 16; x += 8) rect(ctx, tx, ty, x, y * 4, 1, 4, "#5a5a5a"); }
  // highlights
  for (let y = 0; y < 4; y++) rect(ctx, tx, ty, 0, y * 4 + (y>0?1:0), 16, 1, y>0 ? "#8f8f8f" : "#8f8f8f");
}
function mossyCobbleTile(ctx: Ctx, tx: number, ty: number) {
  cobble(ctx, tx, ty);
  const r = rng(930);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * 14), y = Math.floor(r() * 14);
    rect(ctx, tx, ty, x, y, 2, 2, ["#4a7a34", "#5a8a40", "#3c6a2a"][Math.floor(r() * 3)]);
  }
}
function metalBlock(ctx: Ctx, tx: number, ty: number, pal: string[], edge: string) {
  rect(ctx, tx, ty, 0, 0, 16, 16, pal[1]);
  speckle(ctx, tx, ty, 940, pal, 0.35);
  // bevel
  rect(ctx, tx, ty, 0, 0, 16, 1, pal[3]); rect(ctx, tx, ty, 0, 0, 1, 16, pal[3]);
  rect(ctx, tx, ty, 0, 15, 16, 1, edge); rect(ctx, tx, ty, 15, 0, 1, 16, edge);
  // plate seams
  rect(ctx, tx, ty, 1, 1, 14, 1, pal[2]); rect(ctx, tx, ty, 1, 14, 14, 1, pal[2]);
  rect(ctx, tx, ty, 1, 1, 1, 14, pal[0]); rect(ctx, tx, ty, 14, 1, 1, 14, pal[2]);
}
function netherBrickTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#2a1418");
  const brick = "#48202a", hi = "#5a2a34";
  for (let y = 0; y < 4; y++) {
    const off = (y % 2) * 4;
    for (let x = -4 + off; x < 16; x += 8) {
      rect(ctx, tx, ty, Math.max(0, x), y * 4, Math.min(8, 16 - x), 3, brick);
      rect(ctx, tx, ty, Math.max(0, x), y * 4, Math.min(8, 16 - x), 1, hi);
    }
  }
}
function melonSide(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#7aa02a");
  for (let x = 0; x < 16; x += 4) rect(ctx, tx, ty, x, 0, 2, 16, "#5a8018");
  speckle(ctx, tx, ty, 950, ["#8ab838", "#6a9420"], 0.25);
  rect(ctx, tx, ty, 0, 0, 16, 1, "#4a6a10"); rect(ctx, tx, ty, 0, 15, 16, 1, "#4a6a10");
}
function melonTop(ctx: Ctx, tx: number, ty: number) {
  melonSide(ctx, tx, ty);
  rect(ctx, tx, ty, 6, 6, 4, 4, "#3c5a0e");
  rect(ctx, tx, ty, 7, 7, 2, 2, "#c49a66");
}
function sandstoneTile(ctx: Ctx, tx: number, ty: number) {
  rect(ctx, tx, ty, 0, 0, 16, 16, "#d8c88a");
  speckle(ctx, tx, ty, 960, ["#cfc080", "#e0d098", "#c8b878"], 0.6);
  rect(ctx, tx, ty, 0, 4, 16, 1, "#b8a868");
  rect(ctx, tx, ty, 0, 10, 16, 2, "#c0b070");
  rect(ctx, tx, ty, 0, 0, 16, 1, "#e8dcA8".toLowerCase());
}
function gemItem(ctx: Ctx, tx: number, ty: number, pal: string[]) {
  clearTile(ctx, tx, ty);
  // faceted gem shape
  const [base, hi, lo, shine] = pal;
  rect(ctx, tx, ty, 4, 3, 8, 2, base);
  rect(ctx, tx, ty, 3, 5, 10, 4, base);
  rect(ctx, tx, ty, 4, 9, 8, 2, base);
  rect(ctx, tx, ty, 6, 11, 4, 1, lo);
  rect(ctx, tx, ty, 3, 5, 10, 1, hi);
  rect(ctx, tx, ty, 4, 3, 8, 1, hi);
  px(ctx, tx, ty, 5, 4, shine); px(ctx, tx, ty, 6, 5, shine); px(ctx, tx, ty, 5, 6, shine);
  rect(ctx, tx, ty, 4, 10, 8, 1, lo); rect(ctx, tx, ty, 3, 8, 10, 1, lo);
}
