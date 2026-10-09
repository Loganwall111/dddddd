// Furnace state + smelting simulation. Furnaces are identified by block coords.
import { BlockId } from "../blocks/blocks";
import { ItemStack } from "../inventory/inventory";
import { SMELT_RECIPES, FUEL_TIMES, SMELT_TIME } from "../inventory/inventory";

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  burnTime: number;    // seconds of burn remaining
  burnTotal: number;   // total burn time of current fuel (for UI gauge)
  progress: number;    // seconds of smelting progress
}

export class FurnaceSystem {
  furnaces = new Map<string, FurnaceState>();

  key(x: number, y: number, z: number): string { return `${x},${y},${z}`; }

  get(x: number, y: number, z: number): FurnaceState {
    const k = this.key(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) {
      f = { input: null, fuel: null, output: null, burnTime: 0, burnTotal: 0, progress: 0 };
      this.furnaces.set(k, f);
    }
    return f;
  }

  hasSmeltableInput(f: FurnaceState): boolean {
    if (!f.input) return false;
    const r = SMELT_RECIPES.find(r => r.input === f.input!.id);
    if (!r) return false;
    // ensure output can accept
    if (f.output && (f.output.id !== r.output || f.output.count >= 64)) return false;
    return true;
  }

  update(dt: number) {
    for (const f of this.furnaces.values()) {
      const canSmelt = this.hasSmeltableInput(f);
      if (canSmelt) {
        // need burn time; consume fuel if empty
        if (f.burnTime <= 0 && f.fuel) {
          const fuelTime = FUEL_TIMES[f.fuel.id];
          if (fuelTime && fuelTime > 0) {
            f.burnTime = fuelTime;
            f.burnTotal = fuelTime;
            f.fuel.count -= 1;
            if (f.fuel.count <= 0) f.fuel = null;
          }
        }
        if (f.burnTime > 0) {
          f.burnTime = Math.max(0, f.burnTime - dt);
          f.progress += dt;
          if (f.progress >= SMELT_TIME) {
            f.progress = 0;
            const r = SMELT_RECIPES.find(r => r.input === f.input!.id)!;
            f.input!.count -= 1;
            if (f.input!.count <= 0) f.input = null;
            if (!f.output) f.output = { id: r.output, count: r.count };
            else f.output.count += r.count;
          }
        }
      } else {
        // decay progress slowly when idle
        f.progress = Math.max(0, f.progress - dt * 2);
        if (f.burnTime > 0) f.burnTime = Math.max(0, f.burnTime - dt);
      }
    }
  }

  // Take output into a stack (returns taken stack or null)
  takeOutput(f: FurnaceState): ItemStack | null {
    if (!f.output) return null;
    const out = { ...f.output };
    f.output = null;
    return out;
  }
}
