import { block, maxStack } from '../blocks/registry';
import type { Stack } from '../core/types';

export function addItem(inventory: (Stack | null)[], id: number, count: number, durability?: number): number {
  const max = maxStack(id);
  for (const slot of inventory) {
    if (!slot || slot.id !== id || slot.count >= max) continue;
    const amount = Math.min(count, max - slot.count); slot.count += amount; count -= amount;
    if (!count) return 0;
  }
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i]) continue;
    const amount = Math.min(count, max);
    inventory[i] = { id, count: amount, ...(block(id).durability ? { durability: durability ?? block(id).durability } : {}) };
    count -= amount; if (!count) return 0;
  }
  return count;
}
export function countItem(inventory: (Stack | null)[], id: number): number { return inventory.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0); }
export function consumeItem(inventory: (Stack | null)[], id: number, amount: number): boolean {
  if (countItem(inventory, id) < amount) return false;
  for (let i = 0; i < inventory.length && amount; i++) if (inventory[i]?.id === id) {
    const stack = inventory[i]!, take = Math.min(amount, stack.count); stack.count -= take; amount -= take;
    if (!stack.count) inventory[i] = null;
  }
  return true;
}
export function initialInventory(creative: boolean): (Stack | null)[] {
  const inventory: (Stack | null)[] = Array(36).fill(null);
  const initial = creative ? [51, 1, 3, 7, 9, 28, 27, 26, 55] : [48, 5, 7, 28, 55, 0, 0, 0, 0];
  initial.forEach((id, i) => { if (id) inventory[i] = { id, count: maxStack(id) === 1 ? 1 : creative ? 64 : id === 55 ? 8 : id === 28 ? 3 : 12, ...(block(id).durability ? { durability: block(id).durability } : {}) }; });
  return inventory;
}
export function moveStack(slots: (Stack | null)[], from: number, to: number, split = false) {
  if (from === to || !slots[from]) return;
  const source = slots[from]!, target = slots[to];
  const amount = split ? Math.ceil(source.count / 2) : source.count;
  if (!target || target.id === source.id) {
    const moved = Math.min(amount, maxStack(source.id) - (target?.count || 0));
    if (target) target.count += moved; else slots[to] = { ...source, count: moved };
    source.count -= moved; if (!source.count) slots[from] = null;
  } else if (!split) { slots[from] = target; slots[to] = source; }
}