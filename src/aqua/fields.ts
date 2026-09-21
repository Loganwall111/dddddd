// Unified force-field framework (§18/§23 of the lab spec).
// Gravity is never assumed uniform: every particle and rigid body samples the
// same field list, so wells, vortices, wind and black holes affect everything.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GravityWell {
  kind: "well";
  id: number;
  x: number;
  y: number;
  z: number;
  /** positive = attract, negative = repel (m^3/s^2-ish) */
  strength: number;
  radius: number;
  softening: number;
}

export interface VortexField {
  kind: "vortex";
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** tangential speed at core edge */
  swirl: number;
  /** inward pull */
  inward: number;
  /** vertical pull (+ = down into drain, - = up like a tornado) */
  vertical: number;
  axisY: number; // 1 = vertical axis whirlpool, 0 = horizontal-axis roller
}

export interface BlackHoleField {
  kind: "blackhole";
  id: number;
  x: number;
  y: number;
  z: number;
  mass: number;
  horizon: number;
  diskRadius: number;
}

export interface WindField {
  kind: "wind";
  id: number;
  x: number;
  y: number;
  z: number;
  strength: number;
  gust: number;
}

export type ForceField = GravityWell | VortexField | BlackHoleField | WindField;

/** Portal pair: crossing entrance disc teleports matter to the exit. */
export interface PortalPair {
  id: number;
  ax: number; ay: number; az: number; // entrance center
  anx: number; any: number; anz: number; // entrance normal
  bx: number; by: number; bz: number; // exit center
  bnx: number; bny: number; bnz: number; // exit normal
  radius: number;
}

/** Analytic body proxy so SPH particles collide with rigid bodies. */
export interface BodyProxy {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  vx: number;
  vy: number;
  vz: number;
  invMass: number;
}

/** A heat source: evaporates water, ignites fuel, spawns embers. */
export interface FireSource {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  fuel: number;
  maxFuel: number;
}

let nextId = 1;
export function allocId(): number {
  return nextId++;
}
