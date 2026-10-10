import { Feather, Heart, Leaf, MapPin, Shield, Wheat } from 'lucide-react';
import type { GameSnapshot, Settings } from '../core/types';
import { block } from '../blocks/registry';
import { ItemImage } from './Inventory';
import { Key } from './Common';

export function HUD({ snapshot: s, settings, onSelect }: { snapshot: GameSnapshot; settings: Settings; onSelect: (index: number) => void }) {
  return <div className="game-hud">
    <div className="hud-location"><Leaf size={17}/><div><strong>{s.biome}</strong><span>{s.season==='Autumn'?'Fall':s.season} <i/> {s.weather === 'clear' ? 'Clear skies' : s.season==='Winter'?'Snowfall':s.weather === 'rain' ? 'Rainfall' : 'Thunderstorm'}</span></div></div>
    {settings.showCoordinates && <div className="debug-hud"><span><MapPin size={12}/>{s.position.map(Math.floor).join(' / ')}</span><span>{s.fps} FPS <i/> {s.chunks} chunks</span></div>}
    {s.boss && <div className="boss-hud"><span>{s.boss.name}</span><div><i style={{ width: `${s.boss.health / s.boss.maxHealth * 100}%` }}/></div></div>}
    <div className={`crosshair ${settings.highContrast ? 'contrast' : ''}`}><i/><i/></div>
    {s.progress > 0 && <div className="mining-meter"><span style={{ width: `${Math.min(1, s.progress) * 100}%` }}/></div>}
    {s.target && <div className="target-label">{s.target}</div>}
    <div className="hud-bottom">
      <div className="selected-item-name">{s.inventory[s.selected] ? block(s.inventory[s.selected]!.id).name : 'Empty hand'}</div>
      {s.mode === 'survival' ? <div className="survival-bars"><div className="health-pips">{Array.from({ length: 10 }, (_, i) => <Heart key={i} size={17} fill={s.health > i * 2 ? 'currentColor' : 'none'} className={s.health > i * 2 ? 'full' : 'empty'}/>)}</div><span className="xp-level">{Math.floor(s.xp / 10)}</span><div className="hunger-pips">{Array.from({ length: 10 }, (_, i) => <Wheat key={i} size={16} className={s.hunger > i * 2 ? 'full' : 'empty'}/>)}</div></div> : <div className="creative-status"><Feather size={13}/>{s.flying ? 'FLYING' : 'CREATIVE MODE'}<span>{s.flying ? 'Space to rise / Ctrl to descend' : 'V to take flight'}</span></div>}
      {s.equipment.some(Boolean) && <div className="armor-indicator"><Shield size={12}/>Armor {s.equipment.reduce((n, slot) => n + (slot ? block(slot.id).armor || 0 : 0), 0)}</div>}
      {s.mode === 'survival' && <div className="xp-track"><span style={{ width: `${s.xp % 10 * 10}%` }}/></div>}
      <div className="hud-hotbar">{s.inventory.slice(0, 9).map((slot, i) => <button key={i} className={`hud-slot ${s.selected === i ? 'selected' : ''}`} onClick={() => onSelect(i)} title={slot ? block(slot.id).name : `Slot ${i + 1}`}><span className="slot-key">{i + 1}</span>{slot && <><ItemImage id={slot.id}/>{slot.count > 1 && <span className="stack-count">{slot.count}</span>}{slot.durability !== undefined && <span className="durability"><span style={{ width: `${slot.durability / (block(slot.id).durability || 1) * 100}%` }}/></span>}</>}</button>)}</div>
      <div className="hud-shortcuts"><span><Key>E</Key>Inventory</span><span>LMB Mine</span><span>RMB Place / Use</span><span><Key>Esc</Key>Pause</span></div>
    </div>
  </div>;
}