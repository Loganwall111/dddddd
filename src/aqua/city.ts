// Deterministic city planner: towers, houses, dam and bridge segment specs,
// plus procedural facade textures (no image assets needed).

import * as THREE from "three";
import { Rng } from "./rng";
import { DAM_X } from "./terrain";

export interface SegmentSpec {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  mat: string;
  level: number;
  tag: "tower" | "house" | "dam" | "bridge" | "pillar";
  facade: number; // texture variant
}

export interface RoadSpec {
  x: number; z: number; w: number; d: number;
}

export interface CityPlan {
  segments: SegmentSpec[];
  roads: RoadSpec[];
}

const BLOCKS_X: Array<[number, number]> = [[-58, -43.5], [-36.5, -19.5], [-12.5, 4.5], [11.5, 28]];
const BLOCKS_Z: Array<[number, number]> = [[-42.5, -27.5], [-20.5, -3.5], [3.5, 20.5], [27.5, 42.5]];
const PAD_Y = 6;

export function planCity(seed: number): CityPlan {
  const rng = new Rng(seed);
  const segments: SegmentSpec[] = [];
  const roads: RoadSpec[] = [];
  // roads: N-S avenues
  for (const rx of [-40, -16, 8]) roads.push({ x: rx, z: 0, w: 7, d: 92 });
  // E-W streets
  for (const rz of [-24, 0, 24]) roads.push({ x: -15, z: rz, w: 90, d: 7 });
  // south access road over the bridge
  roads.push({ x: 8, z: -63, w: 6, d: 36 });

  let building = 0;
  const towerBlocks = new Set([5, 6, 9, 10, 2, 13]);
  for (let bx = 0; bx < 4; bx++) {
    for (let bz = 0; bz < 4; bz++) {
      const idx = bx * 4 + bz;
      const [x0, x1] = BLOCKS_X[bx];
      const [z0, z1] = BLOCKS_Z[bz];
      if (towerBlocks.has(idx)) {
        // tower: stacked floor-pair segments
        const w = rng.range(9, 12);
        const d = rng.range(9, 12);
        const cx = (x0 + x1) / 2 + rng.range(-1, 1);
        const cz = (z0 + z1) / 2 + rng.range(-1, 1);
        const floors = rng.int(5, 10);
        const fh = 3.4;
        const id = building++;
        for (let f = 0; f < floors; f += 2) {
          const lvl = f / 2;
          const hgt = Math.min(2, floors - f) * fh;
          segments.push({
            x: cx, y: PAD_Y + f * fh + hgt / 2, z: cz,
            sx: w, sy: hgt, sz: d,
            mat: rng.next() < 0.7 ? "concrete" : "steel",
            level: lvl, tag: "tower", facade: id % 3,
          });
        }
      } else {
        // 2-3 houses per block
        const count = rng.int(2, 3);
        for (let h = 0; h < count; h++) {
          const w = rng.range(5, 7.5);
          const d = rng.range(4.5, 6.5);
          const cx = rng.range(x0 + w / 2 + 0.5, x1 - w / 2 - 0.5);
          const cz = rng.range(z0 + d / 2 + 0.5, z1 - d / 2 - 0.5);
          segments.push({
            x: cx, y: PAD_Y + 2, z: cz,
            sx: w, sy: 4, sz: d,
            mat: rng.next() < 0.5 ? "brick" : "wood",
            level: 0, tag: "house", facade: building++ % 3,
          });
        }
      }
    }
  }
  // dam: 3 concrete monoliths across the river canyon
  for (const dz of [-68, -62, -56]) {
    segments.push({
      x: DAM_X, y: 6.5, z: dz,
      sx: 3.2, sy: 13, sz: 6.4,
      mat: "concrete", level: 0, tag: "dam", facade: 0,
    });
  }
  // bridge deck over the river at x = 8
  for (const dz of [-70, -62, -54]) {
    segments.push({
      x: 8, y: 7.6, z: dz,
      sx: 7, sy: 1.1, sz: 8.4,
      mat: "steel", level: 1, tag: "bridge", facade: 1,
    });
  }
  // bridge pillars (tall, static supports)
  for (const dz of [-66, -58]) {
    segments.push({
      x: 8, y: 3.4, z: dz,
      sx: 2.2, sy: 7, sz: 2.2,
      mat: "concrete", level: 0, tag: "pillar", facade: 0,
    });
  }
  return { segments, roads };
}

export function makeFacadeTexture(variant: number, seed: number): THREE.CanvasTexture {
  const rng = new Rng(seed + variant * 977);
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const bases = ["#2b3138", "#35322e", "#2c3340"];
  g.fillStyle = bases[variant % 3];
  g.fillRect(0, 0, 128, 256);
  // window grid
  for (let y = 8; y < 250; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng.next();
      if (lit < 0.28) g.fillStyle = rng.next() < 0.5 ? "#ffd489" : "#9fd8ff";
      else if (lit < 0.5) g.fillStyle = "#14181d";
      else g.fillStyle = "#3d4854";
      g.fillRect(x, y, 10, 12);
    }
  }
  // grime
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 236, 128, 20);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
