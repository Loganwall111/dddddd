import type { FurnaceState, Stack } from '../core/types';
import { maxStack,block } from '../blocks/registry';
import { CONTENT, PROCEDURAL_START, SPAWN_EGG_START } from '../blocks/registry';

export interface Recipe { name: string; ingredients: Record<number, number>; result: Stack; size: 2 | 3 }
export const RECIPES: Recipe[] = [
  { name: 'Cedar Planks', ingredients: { 5: 1 }, result: { id: 7, count: 4 }, size: 2 },
  { name: 'Birch Planks', ingredients: { 18: 1 }, result: { id: 19, count: 4 }, size: 2 },
  { name: 'Sticks', ingredients: { 7: 2 }, result: { id: 59, count: 4 }, size: 2 },
  { name: 'Crafting Bench', ingredients: { 7: 4 }, result: { id: 23, count: 1 }, size: 2 },
  { name: 'Furnace', ingredients: { 3: 8 }, result: { id: 24, count: 1 }, size: 3 },
  { name: 'Storage Chest', ingredients: { 7: 8 }, result: { id: 29, count: 1 }, size: 3 },
  { name: 'Wooden Pickaxe', ingredients: { 7: 3, 59: 2 }, result: { id: 48, count: 1 }, size: 3 },
  { name: 'Stone Pickaxe', ingredients: { 3: 3, 59: 2 }, result: { id: 49, count: 1 }, size: 3 },
  { name: 'Iron Pickaxe', ingredients: { 46: 3, 59: 2 }, result: { id: 50, count: 1 }, size: 3 },
  { name: 'Iron Sword', ingredients: { 46: 2, 59: 1 }, result: { id: 53, count: 1 }, size: 2 },
  { name: 'Iron Axe', ingredients: { 46: 2, 59: 2 }, result: { id: 52, count: 1 }, size: 2 },
  { name: 'Amber Lantern', ingredients: { 45: 1, 59: 1 }, result: { id: 28, count: 4 }, size: 2 },
  { name: 'Cut Stone', ingredients: { 3: 4 }, result: { id: 8, count: 4 }, size: 2 },
  { name: 'TNT', ingredients: { 45: 4, 4: 5 }, result: { id: 27, count: 1 }, size: 3 },
  { name: 'Iron Helmet', ingredients: { 46: 5 }, result: { id: 60, count: 1 }, size: 3 },
  { name: 'Iron Chestplate', ingredients: { 46: 8 }, result: { id: 61, count: 1 }, size: 3 },
];
export function resolveRecipe(grid: (Stack | null)[], size: 2 | 3): Recipe | null {
  const counts: Record<number, number> = {};
  for (const slot of grid) if (slot) counts[slot.id] = (counts[slot.id] || 0) + 1;
  return RECIPES.find(r => r.size <= size && Object.keys(r.ingredients).length === Object.keys(counts).length && Object.entries(r.ingredients).every(([id, count]) => counts[Number(id)] === count)) || null;
}
export const SMELTING: Record<number, number> = { 12: 46, 14: 47, 4: 9, 57: 58, 3: 8 };
for(let i=0;i<12;i++)SMELTING[PROCEDURAL_START+i*9]=PROCEDURAL_START+i*9+1;
for(let i=112;i<136;i+=3){
  const planks=i+1;RECIPES.push({name:block(planks).name,ingredients:{[i]:1},result:{id:planks,count:4},size:2});
  RECIPES.push({name:'Sticks',ingredients:{[planks]:2},result:{id:59,count:4},size:2});
  RECIPES.push({name:'Crafting Bench',ingredients:{[planks]:4},result:{id:23,count:1},size:2});
  RECIPES.push({name:'Storage Chest',ingredients:{[planks]:8},result:{id:29,count:1},size:3});
  RECIPES.push({name:'Wooden Pickaxe',ingredients:{[planks]:3,59:2},result:{id:48,count:1},size:3});
}
RECIPES.push({name:'Birch Sticks',ingredients:{19:2},result:{id:59,count:4},size:2},{name:'Birch Crafting Bench',ingredients:{19:4},result:{id:23,count:1},size:2},{name:'Birch Storage Chest',ingredients:{19:8},result:{id:29,count:1},size:3});
for(let i=PROCEDURAL_START;i<SPAWN_EGG_START;i+=9){
  RECIPES.push({name:'Carve Mineral Bricks',ingredients:{[i+1]:4},result:{id:i+2,count:4},size:2});
  RECIPES.push({name:'Forge Mineral Pickaxe',ingredients:{[i+1]:3,59:2},result:{id:i+5,count:1},size:3});
  RECIPES.push({name:'Forge Mineral Sword',ingredients:{[i+1]:2,59:1},result:{id:i+6,count:1},size:2});
  RECIPES.push({name:'Forge Mineral Axe',ingredients:{[i+1]:2,59:2},result:{id:i+7,count:1},size:2});
}
RECIPES.push({name:'Silver Mirror',ingredients:{9:1,46:4},result:{id:CONTENT.MIRROR,count:1},size:3});
RECIPES.push({name:'Rift Igniter',ingredients:{35:1,46:1},result:{id:CONTENT.RIFT_KEY,count:1},size:2});
export const FUELS: Record<number, number> = { 45: 48, 5: 12, 7: 8, 18: 12, 19: 8, 59: 3 };
for(let i=112;i<136;i+=3){FUELS[i]=12;FUELS[i+1]=8;}
export function tickFurnace(state: FurnaceState, dt: number): boolean {
  const result = state.input ? SMELTING[state.input.id] : 0;
  const canCook = !!result && (!state.output || state.output.id === result && state.output.count < maxStack(result));
  if (state.burn <= 0 && canCook && state.fuel && FUELS[state.fuel.id]) {
    state.burn = FUELS[state.fuel.id]; state.fuel.count--; if (!state.fuel.count) state.fuel = null;
  }
  if (state.burn > 0) {
    state.burn = Math.max(0, state.burn - dt);
    if (canCook) {
      state.progress += dt;
      if (state.progress >= 5) {
        state.progress -= 5; state.input!.count--; if (!state.input!.count) state.input = null;
        if (state.output) state.output.count++; else state.output = { id: result, count: 1 };
        return true;
      }
    } else state.progress = 0;
  }
  return false;
}