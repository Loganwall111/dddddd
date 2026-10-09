// Chest storage containers, keyed by block position.
import { ItemStack } from "./inventory";

export const CHEST_SIZE = 27;

export class ChestSystem {
  chests = new Map<string, (ItemStack | null)[]>();

  key(x: number, y: number, z: number): string { return `${x},${y},${z}`; }

  get(x: number, y: number, z: number): (ItemStack | null)[] {
    const k = this.key(x, y, z);
    let c = this.chests.get(k);
    if (!c) {
      c = new Array(CHEST_SIZE).fill(null);
      this.chests.set(k, c);
    }
    return c;
  }

  serialize(): Record<string, ([number, number] | null)[]> {
    const out: Record<string, ([number, number] | null)[]> = {};
    for (const [k, slots] of this.chests) {
      // skip empty chests to keep saves small
      if (slots.some(s => s)) out[k] = slots.map(s => s ? [s.id, s.count] : null);
    }
    return out;
  }

  load(data: Record<string, ([number, number] | null)[]> | undefined) {
    this.chests.clear();
    if (!data) return;
    for (const k of Object.keys(data)) {
      this.chests.set(k, data[k].map(s => s ? { id: s[0], count: s[1] } : null));
    }
  }
}
