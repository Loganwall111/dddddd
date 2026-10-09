import { DimensionId } from "../world/generator";

export interface DimensionDef {
  id: DimensionId;
  name: string;
  description: string;
  portalBlock?: number; // block id that forms the portal
  gravity: number;
  hasSky: boolean;
  fogColor: [number, number, number];
  skyColor: [number, number, number];
  ambient: [number, number, number];
  spawnHeight: number;
}

export const DIMENSIONS: Record<DimensionId, DimensionDef> = {
  overworld: {
    id: "overworld",
    name: "The Overworld",
    description: "The verdant surface realm of forests, oceans and mountains.",
    gravity: 22,
    hasSky: true,
    fogColor: [0.6, 0.75, 0.95],
    skyColor: [0.45, 0.65, 0.95],
    ambient: [0.35, 0.4, 0.5],
    spawnHeight: 90,
  },
  nether: {
    id: "nether",
    name: "The Nether",
    description: "A cavernous dimension of fire, lava and ancient stone.",
    gravity: 22,
    hasSky: false,
    fogColor: [0.35, 0.08, 0.08],
    skyColor: [0.1, 0.03, 0.05],
    ambient: [0.2, 0.08, 0.05],
    spawnHeight: 70,
  },
  end: {
    id: "end",
    name: "The End",
    description: "A floating realm of void and eerie stillness.",
    gravity: 22,
    hasSky: true,
    fogColor: [0.08, 0.05, 0.15],
    skyColor: [0.04, 0.02, 0.12],
    ambient: [0.2, 0.18, 0.3],
    spawnHeight: 70,
  },
};

// Find safe spawn Y by scanning down from startHeight for a solid block with 2 air spaces above
export function findSpawnY(getBlock: (x:number,y:number,z:number)=>number, x: number, z: number, startHeight: number): number {
  for (let y = startHeight; y > 1; y--) {
    const b = getBlock(x, y, z);
    if (b !== 0 && b !== 9 && b !== 20) { // solid, not water/lava
      return y + 1;
    }
  }
  return startHeight;
}
