import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { ArrowRight, BookOpen, Box, Check, ChevronDown, Flame, Hammer, Package, Search, Shield, Sparkles, X } from 'lucide-react';
import type { Game } from '../core/Game';
import { DEFAULT_CHARACTER, type Stack } from '../core/types';
import { BLOCKS, CATEGORIES, block, maxStack } from '../blocks/registry';
import { itemIcon } from '../blocks/textures';
import { addItem, countItem } from '../inventory/inventory';
import { FUELS, RECIPES, SMELTING, resolveRecipe } from '../crafting/recipes';
import { Key, Modal } from './Common';
import { CharacterCanvas } from './CharacterCreator';

type SlotGroup = 'inventory' | 'craft' | 'equipment' | 'furnace' | 'chest';
interface DragPayload { group?: SlotGroup; index?: number; creative?: number }
export function ItemImage({ id }: { id: number }) { return <img className="item-image" src={itemIcon(id)} alt="" aria-hidden="true" draggable={false}/>; }
export function Inventory({ game, context, containerKey, onClose }: { game: Game; context?: 'crafting' | 'furnace' | 'chest'; containerKey?: string; onClose: () => void }) {
  const [tab, setTab] = useState(context === 'furnace' ? 'Furnace' : context === 'chest' ? 'Storage' : context === 'crafting' ? 'Crafting' : game.save.mode === 'creative' ? 'Library' : 'Backpack');
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All');
  const [cursor, setCursor] = useState<Stack | null>(null), [pointer, setPointer] = useState({ x: 0, y: 0 });
  const cursorRef = useRef<Stack | null>(null); cursorRef.current = cursor;
  const [, render] = useState(0);
  const changed = () => { game.refresh(); render(n => n + 1); };
  const size = context === 'crafting' ? 3 : 2;
  const recipe = resolveRecipe(game.save.craftGrid, size);
  const furnace = containerKey ? game.save.furnaces[containerKey] : undefined;
  const get = (group: SlotGroup, index: number): Stack | null => {
    if (group === 'inventory') return game.save.player.inventory[index];
    if (group === 'craft') return game.save.craftGrid[index];
    if (group === 'equipment') return game.save.player.equipment[index];
    if (group === 'chest') return game.save.containers[containerKey!]?.[index] || null;
    return furnace ? furnace[(['input', 'fuel', 'output'] as const)[index]] : null;
  };
  const set = (group: SlotGroup, index: number, value: Stack | null) => {
    if (group === 'inventory') game.save.player.inventory[index] = value;
    else if (group === 'craft') game.save.craftGrid[index] = value;
    else if (group === 'equipment') game.save.player.equipment[index] = value;
    else if (group === 'chest') game.save.containers[containerKey!][index] = value;
    else if (furnace) furnace[(['input', 'fuel', 'output'] as const)[index]] = value;
  };
  const accepts = (group: SlotGroup, index: number, stack: Stack) => {
    if (group === 'equipment') return index === 0 ? stack.id === 60 : index === 1 ? stack.id === 61 : false;
    if (group === 'furnace') return index === 0 ? !!SMELTING[stack.id] : index === 1 ? !!FUELS[stack.id] : false;
    return true;
  };
  const close = () => {
    if (cursorRef.current) {
      const stack = cursorRef.current, remainder = addItem(game.save.player.inventory, stack.id, stack.count, stack.durability);
      if (remainder) game.entities.drop({ ...stack, count: remainder }, game.player.position.add(game.camera.getForwardRay().direction));
      cursorRef.current = null; setCursor(null);
    }
    game.returnCraftGrid(); onClose();
  };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.code === 'KeyE' && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); closeRef.current(); } };
    const timer = setInterval(() => render(n => n + 1), 200);
    window.addEventListener('keydown', key); return () => { clearInterval(timer); window.removeEventListener('keydown', key); };
  }, []);
  const quickMove = (group: SlotGroup, index: number) => {
    const stack = get(group, index); if (!stack) return;
    if (group !== 'inventory') { const left = addItem(game.save.player.inventory, stack.id, stack.count, stack.durability); set(group, index, left ? { ...stack, count: left } : null); changed(); return; }
    if (context === 'chest') { const left = addItem(game.save.containers[containerKey!], stack.id, stack.count, stack.durability); set(group, index, left ? { ...stack, count: left } : null); changed(); return; }
    const indices = index < 9 ? Array.from({ length: 27 }, (_, i) => i + 9) : Array.from({ length: 9 }, (_, i) => i);
    for (const dest of indices) {
      const target = get('inventory', dest);
      if (!target || target.id === stack.id && target.count < maxStack(stack.id)) {
        const amount = Math.min(stack.count, maxStack(stack.id) - (target?.count || 0));
        set('inventory', dest, { ...stack, count: (target?.count || 0) + amount }); stack.count -= amount;
        if (!stack.count) { set(group, index, null); break; }
      }
    }
    changed();
  };
  const clickSlot = (group: SlotGroup, index: number, event: MouseEvent, right = false) => {
    event.preventDefault(); const stack = get(group, index);
    if (event.shiftKey && !cursor) { quickMove(group, index); return; }
    if (!cursor) {
      if (!stack) return;
      const amount = right ? Math.ceil(stack.count / 2) : stack.count;
      setCursor({ ...stack, count: amount }); setPointer({ x: event.clientX, y: event.clientY });
      set(group, index, stack.count === amount ? null : { ...stack, count: stack.count - amount });
    } else if (accepts(group, index, cursor)) {
      if (!stack || stack.id === cursor.id) {
        const amount = Math.min(right ? 1 : cursor.count, maxStack(cursor.id) - (stack?.count || 0));
        set(group, index, { ...cursor, count: (stack?.count || 0) + amount }); setCursor(cursor.count === amount ? null : { ...cursor, count: cursor.count - amount });
      } else if (!right) { set(group, index, cursor); setCursor(stack); }
    }
    changed();
  };
  const dropSlot = (group: SlotGroup, index: number, event: DragEvent) => {
    event.preventDefault();
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/awakening')) as DragPayload;
      if (data.creative) {
        if (game.save.mode !== 'creative') return;
        const stack: Stack = { id: data.creative, count: maxStack(data.creative), ...(block(data.creative).durability ? { durability: block(data.creative).durability } : {}) };
        if (accepts(group, index, stack)) set(group, index, stack);
      } else if (data.group !== undefined && data.index !== undefined && !(data.group === group && data.index === index)) {
        const source = get(data.group, data.index), target = get(group, index);
        if (!source || !accepts(group, index, source) || target && !accepts(data.group, data.index, target)) return;
        if (target?.id === source.id) {
          const amount = Math.min(source.count, maxStack(source.id) - target.count);
          set(group, index, { ...target, count: target.count + amount }); set(data.group, data.index, source.count === amount ? null : { ...source, count: source.count - amount });
        } else { set(group, index, source); set(data.group, data.index, target); }
      }
      changed();
    } catch { /* Only game inventory payloads can be dropped into a slot. */ }
  };
  const slot = (group: SlotGroup, index: number, label?: string) => {
    const stack = get(group, index), selected = group === 'inventory' && index === game.save.player.selected;
    return <button key={`${group}-${index}`} className={`inventory-slot ${selected ? 'selected' : ''} ${group === 'equipment' ? 'equipment-slot' : ''}`} aria-label={stack ? `${block(stack.id).name}, ${stack.count}. ${label || `Slot ${index + 1}`}` : label || `Empty slot ${index + 1}`} title={stack ? `${block(stack.id).name}${stack.durability !== undefined ? ` | Durability ${stack.durability}` : ''}` : label} draggable={!!stack} onDragStart={event => event.dataTransfer.setData('application/awakening', JSON.stringify({ group, index }))} onDragOver={event => event.preventDefault()} onDrop={event => dropSlot(group, index, event)} onClick={event => clickSlot(group, index, event)} onContextMenu={event => clickSlot(group, index, event, true)}>
      {stack ? <><ItemImage id={stack.id}/>{stack.count > 1 && <span className="stack-count">{stack.count}</span>}{stack.durability !== undefined && <span className="durability"><span style={{ width: `${stack.durability / (block(stack.id).durability || 1) * 100}%` }}/></span>}</> : group === 'equipment' ? <Shield size={21}/> : null}
      {group === 'inventory' && index < 9 && <span className="slot-number">{index + 1}</span>}
    </button>;
  };
  const tabs = [game.save.mode === 'creative' ? 'Library' : null, 'Backpack', 'Crafting', context === 'furnace' ? 'Furnace' : null, context === 'chest' ? 'Storage' : null].filter(Boolean) as string[];
  const items = BLOCKS.filter(b => b.id && (category === 'All' || category === b.category) && b.name.toLowerCase().includes(query.toLowerCase()));
  return <div onMouseMove={event => { if (cursor) setPointer({ x: event.clientX, y: event.clientY }); }}>
    <Modal title={tab === 'Library' ? 'Creative Inventory' : tab === 'Furnace' ? 'Furnace' : tab === 'Storage' ? 'Chest' : tab==='Crafting'?'Crafting':'Inventory'} eyebrow={`${game.save.mode.toUpperCase()} / ${BLOCKS.length-1} BLOCKS & ITEMS`} onClose={close} wide className="inventory-modal">
      <div className="inventory-toolbar"><nav className="modal-tabs">{tabs.map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name === 'Library' ? <Box size={15}/> : name === 'Crafting' ? <Hammer size={15}/> : name === 'Furnace' ? <Flame size={15}/> : <Package size={15}/>}{name}</button>)}</nav><button className="mode-switch text-button" onClick={() => { const mode = game.save.mode === 'creative' ? 'survival' : 'creative'; game.setMode(mode); setTab(mode === 'creative' ? 'Library' : 'Backpack'); }}><Sparkles size={13}/>{game.save.mode}<ChevronDown size={12}/></button></div>
      <div className="inventory-content">
        {tab === 'Library' && <>
          <label className="inventory-search"><Search size={17}/><input placeholder="Find your next building block..." aria-label="Search items" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}<span>{items.length} ITEMS</span></label>
          <div className="category-tabs">{['All', ...CATEGORIES].map(cat => <button key={cat} className={category === cat ? 'active' : ''} onClick={() => setCategory(cat)}>{cat}</button>)}</div>
          <div className="creative-grid">{items.map(b => <button key={b.id} className="creative-item" title={`${b.name} | ${b.category} | Click to equip`} draggable onDragStart={event => event.dataTransfer.setData('application/awakening', JSON.stringify({ creative: b.id }))} onClick={() => { game.give(b.id); changed(); }}><ItemImage id={b.id}/><span>{b.name}</span></button>)}{!items.length && <p className="no-items">No blocks found. Try a different search.</p>}</div>
          <div className="inventory-hint"><Check size={13}/>Click an item to equip it. Drag it into any hotbar slot.</div>
        </>}
        {(tab === 'Backpack' || tab === 'Crafting') && <div className="workbench-layout"><div className="workbench-main">
          <div className="crafting-upper">
            {tab === 'Backpack' ? <div className="character-preview"><div className="equipment-column">{[0,1,2,3].map(i => slot('equipment', i, ['Helmet', 'Chestplate', 'Leg armor', 'Boots'][i]))}</div><div className="avatar-stage"><CharacterCanvas style={game.save.character||DEFAULT_CHARACTER}/><span>{game.save.character?.name||'WANDERER'}</span></div></div> : <div className="bench-intro"><Hammer size={36} strokeWidth={1}/><h3>{size === 3 ? 'Crafting bench' : 'Field crafting'}</h3><p>{size === 3 ? 'More space for bigger ideas.' : 'Place ingredients in the grid, or choose a recipe.'}</p></div>}
            <div className="craft-area"><span className="slot-label">{size} x {size} CRAFTING</span><div className="craft-flow"><div className="craft-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>{Array.from({ length: size * size }, (_, i) => slot('craft', i))}</div><ArrowRight size={20}/><button className={`inventory-slot output-slot ${recipe ? 'has-result' : ''}`} disabled={!recipe} onClick={() => { game.craft(size); changed(); }} title={recipe ? `Craft ${recipe.result.count} ${recipe.name}` : 'Add a valid recipe'} aria-label={recipe ? `Craft ${recipe.name}` : 'Crafting output'}>{recipe && <><ItemImage id={recipe.result.id}/><span className="stack-count">{recipe.result.count}</span></>}</button></div><small>{recipe ? `Craft ${recipe.name}` : 'Your next idea goes here.'}</small></div>
          </div>
          <span className="slot-label">BACKPACK</span><div className="storage-grid">{Array.from({ length: 27 }, (_, i) => slot('inventory', i + 9))}</div>
        </div>{tab === 'Crafting' && <aside className="recipe-book"><h4><BookOpen size={15}/>Recipe book</h4>{RECIPES.filter(r => r.size <= size).map((r, i) => { const available = Object.entries(r.ingredients).every(([id, n]) => countItem(game.save.player.inventory, Number(id)) >= n); return <button key={i} className={`recipe-row ${available ? 'available' : ''}`} onClick={() => { game.fillRecipe(r, size); changed(); }} title={Object.entries(r.ingredients).map(([id,n]) => `${n} ${block(Number(id)).name}`).join(', ')}><ItemImage id={r.result.id}/><span><strong>{r.name}</strong><small>{Object.entries(r.ingredients).map(([id,n]) => `${n} ${block(Number(id)).name}`).join(' + ')}</small></span>{available && <Check size={12}/>}</button>; })}</aside>}</div>}
        {tab === 'Furnace' && furnace && <><div className="furnace-workspace"><div className="furnace-inputs"><span className="slot-label">INPUT</span>{slot('furnace', 0)}<Flame className={furnace.burn > 0 ? 'burning' : ''} size={27}/>{slot('furnace', 1)}<span className="slot-label">FUEL</span></div><div className="smelt-progress"><ArrowRight size={34}/><div className="progress-track"><span style={{ width: `${furnace.progress / 5 * 100}%` }}/></div><small>{furnace.burn > 0 ? `${Math.round(furnace.burn)}s of fuel remaining` : 'Add coal or wood to begin'}</small></div><div className="furnace-result"><span className="slot-label">RESULT</span>{slot('furnace', 2)}</div><p>Ore becomes metal.<br/>Sand becomes glass.<br/>Good food takes a little heat.</p></div><span className="slot-label">BACKPACK</span><div className="storage-grid">{Array.from({ length: 27 }, (_, i) => slot('inventory', i + 9))}</div></>}
        {tab === 'Storage' && <><span className="slot-label">STORAGE CHEST</span><div className="storage-grid chest-grid">{Array.from({ length: 27 }, (_, i) => slot('chest', i))}</div><span className="slot-label">BACKPACK</span><div className="storage-grid">{Array.from({ length: 27 }, (_, i) => slot('inventory', i + 9))}</div></>}
        <div className="inventory-hotbar"><span className="slot-label">QUICK ACCESS <small>SCROLL OR PRESS 1-9 TO SELECT</small></span><div className="storage-grid">{Array.from({ length: 9 }, (_, i) => slot('inventory', i))}</div></div>
      </div>
      <footer className="inventory-footer"><span><Key>E</Key>Close inventory</span><span><Key>Shift</Key>+ click to move stacks</span><span>Right-click to split</span></footer>
    </Modal>
    {cursor && <div className="cursor-stack" style={{ left: pointer.x + 9, top: pointer.y + 9 }}><ItemImage id={cursor.id}/><span>{cursor.count}</span></div>}
  </div>;
}