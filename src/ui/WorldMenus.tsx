import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Box, Check, ChevronRight, Download, Flame, Globe2, Layers3, Leaf, MountainSnow, Pencil, Plus, Shuffle, Sparkles, Sword, Trash2, Upload, Wind } from 'lucide-react';
import { DIMENSIONS, type Difficulty, type DimensionId, type GameMode, type WorldPreset, type WorldSave } from '../core/types';
import { createWorld, deleteWorld, exportWorld, saveWorld, validateWorld } from '../persistence/storage';
import { BackButton, Screen, Toggle } from './Common';

export function WorldSelection({ worlds, onClose, onCreate, onPlay, onRefresh, onMessage }: { worlds: WorldSave[]; onClose: () => void; onCreate: () => void; onPlay: (world: WorldSave) => void; onRefresh: () => void; onMessage: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try { if (file.size > 30_000_000) throw new Error('World files must be smaller than 30 MB.'); const world = validateWorld(JSON.parse(await file.text())); await saveWorld(world); onRefresh(); onMessage('World imported. Your next chapter is ready.'); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not import this world.'); }
    if (input.current) input.current.value = '';
  };
  return <Screen title="Select World" eyebrow="SINGLEPLAYER" onClose={onClose}>
    <div className="world-list-heading"><span>{worlds.length} {worlds.length === 1 ? 'WORLD' : 'WORLDS'} ON THIS DEVICE</span><button className="text-button" onClick={() => input.current?.click()}><Upload size={14}/>Import world</button><input ref={input} type="file" accept=".json" className="sr-only" aria-label="Import world file" onChange={e => void importFile(e.target.files?.[0])}/></div>
    {worlds.length === 0 ? <div className="empty-worlds"><div className="empty-landscape"><MountainSnow size={60} strokeWidth={1}/><span className="empty-sun"/></div><h3>Your story starts here.</h3><p>A quiet cabin. A kingdom in the clouds. Whatever you imagine,<br className="desktop-break"/> there is a whole world waiting to become it.</p></div> : <div className="world-list">{worlds.map(world => <div className="world-row" key={world.id}>
      <button className={`world-thumbnail preset-${world.preset}`} onClick={() => onPlay(world)} aria-label={`Play ${world.name}`}><MountainSnow size={34}/></button>
      <div className="world-details">{renaming === world.id ? <form onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; try { await saveWorld({ ...world, name: name.trim().slice(0, 48) }); setRenaming(null); onRefresh(); } catch { onMessage('Could not rename this world.'); } }}><input autoFocus aria-label="World name" value={name} onChange={e => setName(e.target.value)} maxLength={48}/><button className="icon-button" aria-label="Save new name"><Check size={16}/></button></form> : <button className="world-name" onClick={() => onPlay(world)}>{world.name}</button>}<p>{world.mode} <span>/</span> {world.preset === 'normal' ? 'Standard' : world.preset} <span>/</span> {DIMENSIONS[world.dimension].name}</p><small>Seed {world.seed} <span>Last played {new Date(world.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></small></div>
      <div className="world-actions">{confirm === world.id ? <><button className="text-button danger" onClick={async () => { try { await deleteWorld(world.id); onRefresh(); setConfirm(null); } catch { onMessage('Could not delete this world.'); } }}>Delete forever</button><button className="text-button" onClick={() => setConfirm(null)}>Cancel</button></> : <><button className="icon-button" title="Rename world" aria-label={`Rename ${world.name}`} onClick={() => { setRenaming(world.id); setName(world.name); }}><Pencil size={14}/></button><button className="icon-button" title="Export backup" aria-label={`Export ${world.name}`} onClick={() => exportWorld(world)}><Download size={14}/></button><button className="icon-button" title="Delete world" aria-label={`Delete ${world.name}`} onClick={() => setConfirm(world.id)}><Trash2 size={14}/></button><button className="world-play icon-button" title="Play world" aria-label={`Enter ${world.name}`} onClick={() => onPlay(world)}><ChevronRight size={22}/></button></>}</div>
    </div>)}</div>}
    <footer className="modal-footer"><BackButton onClick={onClose}>Main menu</BackButton><button className="button primary" onClick={onCreate}><Plus size={18}/>Create new world<ArrowRight size={16}/></button></footer>
    <p className="save-note"><span className="status-dot"/>Saved locally. Yours to keep. Export a backup before clearing browser data.</p>
  </Screen>;
}

export function CreateWorld({ onClose, onCreate }: { onClose: () => void; onCreate: (world: WorldSave) => void }) {
  const [name, setName] = useState('A New Beginning'), [seed, setSeed] = useState('');
  const [mode, setMode] = useState<GameMode>('creative'), [preset, setPreset] = useState<WorldPreset>('normal'), [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [weather, setWeather] = useState(true), [seasons, setSeasons] = useState(true);
  return <Screen title="Create New World" eyebrow="YOUR ADVENTURE STARTS HERE" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); const world = createWorld(name, seed, mode, preset, difficulty); world.cycleWeather = weather; world.cycleSeasons = seasons; onCreate(world); }}>
      <div className="create-body"><div className="form-grid"><label className="field">World name<input value={name} maxLength={48} required onChange={e => setName(e.target.value)} placeholder="Name your next adventure"/></label><label className="field">World seed <span className="optional">OPTIONAL</span><div className="input-with-button"><input value={seed} maxLength={64} onChange={e => setSeed(e.target.value)} placeholder="Let fate decide..."/><button type="button" className="icon-button" onClick={() => setSeed(String(Math.floor(Math.random() * 99999999)))} aria-label="Randomize seed"><Shuffle size={16}/></button></div></label></div>
      <label className="setting-label">How will you play?</label><div className="mode-options">
        <button type="button" className={`mode-option ${mode === 'survival' ? 'selected' : ''}`} onClick={() => setMode('survival')}><Sword size={25}/><span><strong>Survival</strong><small>Gather. Craft. Make it through the night.</small></span><span className="radio-mark">{mode === 'survival' && <span/>}</span></button>
        <button type="button" className={`mode-option ${mode === 'creative' ? 'selected' : ''}`} onClick={() => setMode('creative')}><Sparkles size={25}/><span><strong>Creative</strong><small>Unlimited blocks. Unbounded imagination.</small></span><span className="radio-mark">{mode === 'creative' && <span/>}</span></button>
      </div>
      <div className="form-grid"><label className="field">World type<select value={preset} onChange={e => setPreset(e.target.value as WorldPreset)}><option value="normal">Standard / A little of everything</option><option value="amplified">Amplified / Mountains beyond measure</option><option value="flat">Superflat / A blank canvas</option><option value="archipelago">Archipelago / An ocean of possibility</option><option value="extreme">Extreme / Touch the sky</option></select></label><label className="field">Difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="peaceful">Peaceful / Room to breathe</option><option value="normal">Normal / The classic adventure</option><option value="hard">Hard / A world that fights back</option></select></label></div>
      <div className="generation-options"><Toggle label="Dynamic weather" checked={weather} onChange={setWeather}/><Toggle label="Changing seasons" checked={seasons} onChange={setSeasons}/></div>
      </div><footer className="modal-footer"><BackButton onClick={onClose}>Your worlds</BackButton><button className="button primary" type="submit">Create World<ArrowRight size={17}/></button></footer>
    </form>
  </Screen>;
}

export function DimensionsMenu({ current, onClose, onTravel }: { current?: DimensionId; onClose: () => void; onTravel: (id: DimensionId) => void }) {
  const icons = { overworld: Leaf, nether: Flame, end: Globe2, crystal: Box, sky: Wind, sift: Sparkles };
  return <Screen title="Dimensions & Realms" eyebrow="SIX WORLDS. ENDLESS POSSIBILITIES." onClose={onClose}>
    <p className="modal-description">From the familiar to the otherworldly.{!current && ' Enter any realm in a new Creative world.'} The Sift is also unlocked by the ancient-city melody.</p>
    <div className="dimension-list">{Object.entries(DIMENSIONS).map(([id, dim]) => { const Icon = icons[id as DimensionId]; return <button key={id} className={`dimension-row ${id === current ? 'current' : ''}`} disabled={id === current} onClick={() => onTravel(id as DimensionId)}><span className="dimension-symbol" style={{ color: dim.color }}><Icon size={27} strokeWidth={1.3}/></span><span><strong>{dim.name}</strong><small>{dim.subtitle}</small></span>{id === current ? <span className="current-label">YOU ARE HERE</span> : <ArrowUpRight size={20}/>}</button>; })}</div>
    <footer className="modal-footer"><span className="fine-print"><Layers3 size={14}/>Each realm preserves its own terrain changes.</span><BackButton onClick={onClose}>Back</BackButton></footer>
  </Screen>;
}