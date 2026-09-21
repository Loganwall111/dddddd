// Physical material database. Every fluid and solid in the lab resolves its
// behavior (buoyancy, drag, damage, phase change) from these tables.

export interface FluidDef {
  id: number;
  name: string;
  /** kg / m^3 */
  density: number;
  /** dynamic viscosity scale (1 = water) */
  viscosity: number;
  /** render tint */
  color: [number, number, number];
  /** freezes below this C, boils above this C */
  freezeC: number;
  boilC: number;
  /** how strongly it clumps (surface tension look) */
  cohesion: number;
  flammable: boolean;
  opaque: number;
}

export const FLUIDS: Record<string, FluidDef> = {
  water:     { id: 0, name: "Fresh water", density: 1000, viscosity: 1.0, color: [0.16, 0.45, 0.75], freezeC: 0,   boilC: 100,  cohesion: 1.0, flammable: false, opaque: 0.55 },
  saltwater: { id: 1, name: "Salt water",  density: 1025, viscosity: 1.05, color: [0.10, 0.38, 0.62], freezeC: -2,  boilC: 102,  cohesion: 1.0, flammable: false, opaque: 0.6 },
  oil:       { id: 2, name: "Crude oil",   density: 870,  viscosity: 6.0, color: [0.12, 0.10, 0.08], freezeC: -20, boilC: 300,  cohesion: 1.4, flammable: true,  opaque: 0.95 },
  lava:      { id: 3, name: "Magma",       density: 2600, viscosity: 9.0, color: [1.0, 0.32, 0.05], freezeC: 700, boilC: 3000, cohesion: 1.6, flammable: false, opaque: 1.0 },
  mud:       { id: 4, name: "Mud slurry",  density: 1400, viscosity: 5.0, color: [0.35, 0.24, 0.14], freezeC: -1,  boilC: 100,  cohesion: 1.2, flammable: false, opaque: 0.95 },
  cryo:      { id: 5, name: "Cryogenic",   density: 800,  viscosity: 0.4, color: [0.65, 0.85, 1.0],  freezeC: -200, boilC: -160, cohesion: 0.6, flammable: false, opaque: 0.4 },
};

export const FLUID_LIST = Object.values(FLUIDS);
export function fluidById(id: number): FluidDef {
  return FLUID_LIST.find((f) => f.id === id) ?? FLUIDS.water;
}

export interface SolidDef {
  name: string;
  density: number;
  friction: number;
  restitution: number;
  /** impact energy (J-ish) per unit volume before fracture */
  strength: number;
  /** tint for debris */
  color: [number, number, number];
  brittle: number;
}

export const SOLIDS: Record<string, SolidDef> = {
  concrete: { name: "Concrete", density: 2400, friction: 0.9, restitution: 0.05, strength: 9,  color: [0.62, 0.62, 0.6],  brittle: 0.8 },
  steel:    { name: "Steel",    density: 7850, friction: 0.5, restitution: 0.25, strength: 60, color: [0.45, 0.48, 0.55], brittle: 0.15 },
  wood:     { name: "Wood",     density: 600,  friction: 0.7, restitution: 0.15, strength: 5,  color: [0.5, 0.34, 0.18],  brittle: 0.5 },
  glass:    { name: "Glass",    density: 2500, friction: 0.3, restitution: 0.1,  strength: 1,  color: [0.7, 0.85, 0.9],   brittle: 1.0 },
  brick:    { name: "Brick",    density: 1900, friction: 0.85, restitution: 0.05, strength: 7, color: [0.55, 0.25, 0.18], brittle: 0.75 },
  rock:     { name: "Rock",     density: 2700, friction: 1.0, restitution: 0.05, strength: 25, color: [0.4, 0.38, 0.35],  brittle: 0.6 },
  asphalt:  { name: "Asphalt",  density: 2300, friction: 0.95, restitution: 0.02, strength: 8, color: [0.16, 0.16, 0.17],  brittle: 0.4 },
  soil:     { name: "Soil",     density: 1600, friction: 1.0, restitution: 0.0,  strength: 2,  color: [0.32, 0.24, 0.15],  brittle: 0.3 },
};
