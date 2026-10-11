import * as THREE from "three";

export type WorldEvent =
  | { type: "splash"; strength: number; x: number; z: number }
  | { type: "underwater"; active: boolean }
  | { type: "weather"; kind: string; rain: number; storm: boolean }
  | { type: "clock"; label: string; night: number };

type Listener = (event: WorldEvent) => void;

const listeners = new Set<Listener>();

/** Tiny pub/sub used to link the WebGL world with the HUD + audio engine. */
export const worldBus = {
  emit(event: WorldEvent) {
    listeners.forEach((listener) => listener(event));
  },
  on(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Shared mutable environment state. Written every frame by the sky/weather
 * simulation and read by water, post-processing, HUD and audio systems.
 * Kept outside React state to avoid re-render storms at 60fps.
 */
export interface EnvState {
  /** 0..1 — 0 = midnight, 0.5 = noon */
  timeOfDay: number;
  /** 0..1 — how deep into night we are */
  night: number;
  /** 0..1 — sun above the horizon */
  sunUp: number;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** 0..1.5 — rain intensity */
  rain: number;
  /** 0..1 — storm factor (lightning, wind) */
  storm: number;
  /** 0..1 — rainbow visibility (after rain, sun out) */
  rainbow: number;
  underwater: boolean;
  waterLevel: number;
  weatherKind: "clear" | "clouds" | "rain" | "storm" | "clearing";
  sunMesh: THREE.Mesh | null;
}

export function createEnvState(waterLevel = -2.25): EnvState {
  return {
    timeOfDay: 0.34,
    night: 0,
    sunUp: 1,
    sunDir: new THREE.Vector3(0.4, 0.7, -0.35).normalize(),
    moonDir: new THREE.Vector3(-0.4, -0.7, 0.35).normalize(),
    rain: 0,
    storm: 0,
    rainbow: 0,
    underwater: false,
    waterLevel,
    weatherKind: "clear",
    sunMesh: null,
  };
}
