import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, Atom, BookOpen, Box, Brain, ChevronRight, CircleDot, Compass,
  Crosshair, Dna, Eye, Flame, Gauge, Hammer, Home, LandPlot, Map, Moon,
  MousePointer2, Orbit, Pause, Play, Radio, ScanLine, Shield, Sparkles,
  Thermometer, TrendingUp, Users, Video, Waves, Wind, Zap, X,
} from "lucide-react";
import { GameWorld } from "../scenes/GameWorld";
import {
  expeditions, expeditionFor, getRealm, hashString, lifeStageFor, lifeStages, nearestDistrict,
  realmAtIndex, realmDiscoveries, realmIndexOf, realmList, realmPhysics, realmReadings,
  realmSceneAudio, settlementProfile,
  type CreatureDefinition, type Discovery, type District, type EcosystemState, type ExpeditionId, type InventoryItem, type LifeStageId,
  type Realm, type SaveState, type WorldLayer,
} from "../game/procedural";
import type { AppSettings } from "./MainMenu";
import { cinematicAudio } from "../audio/CinematicAudio";

interface GameExperienceProps {
  initialSave: SaveState;
  creature: CreatureDefinition;
  settings: AppSettings;
  sandbox?: boolean;
  onSave: (save: SaveState) => void;
  onExit: () => void;
}

type CameraMode = "first" | "third" | "orbit";
type PanelKind = "journal" | "evolution" | "pause" | "civilization" | "physics" | "inventory" | "crafting" | "atlas" | "stages" | null;

const inventoryCatalog: Record<string, Omit<InventoryItem, "count">> = {
  "lumen-shard": { id: "lumen-shard", name: "Lumen Shard", kind: "shard", essence: 6 },
  "vestige-organ": { id: "vestige-organ", name: "Vestige Organ", kind: "organ", essence: 9 },
  "district-essence": { id: "district-essence", name: "District Essence", kind: "essence", essence: 12 },
  "signal-thread": { id: "signal-thread", name: "Signal Thread", kind: "signal", essence: 16 },
  "aether-mote": { id: "aether-mote", name: "Aether Mote", kind: "mote", essence: 4 },
};

interface CraftRecipe {
  id: string;
  name: string;
  station: string;
  description: string;
  costs: Record<string, number>;
  result: { id: string; count: number };
}

const craftingRecipes: CraftRecipe[] = [
  { id: "membrane-shelter", name: "Membrane Shelter", station: "cellular / soft tissue", description: "A temporary refuge from acid tides, predators and hostile pressure.", costs: { "lumen-shard": 2, "vestige-organ": 1 }, result: { id: "district-essence", count: 1 } },
  { id: "tide-skiff", name: "Tide Skiff", station: "sewer / coastal", description: "A buoyant signal frame that lets you ride currents instead of fighting them.", costs: { "signal-thread": 1, "aether-mote": 2 }, result: { id: "lumen-shard", count: 3 } },
  { id: "chorus-spire", name: "Chorus Spire", station: "planetary / communal", description: "A beacon that turns a discovered district into a persistent village seed.", costs: { "district-essence": 2, "signal-thread": 1 }, result: { id: "signal-thread", count: 2 } },
  { id: "acid-buffer", name: "Acid Buffer", station: "digestive / emergency", description: "A living coat that buys one more minute inside the gastric sea.", costs: { "vestige-organ": 2, "lumen-shard": 1 }, result: { id: "aether-mote", count: 4 } },
];

const traitOptions = [
  { id: "Pressure lattice", icon: Shield, cost: 24, copy: "A mineral collagen matrix protects against pressure and collision." },
  { id: "Polarized sight", icon: Eye, cost: 28, copy: "Detect magnetic paths, hidden organisms and radiation gradients." },
  { id: "Social memory", icon: Brain, cost: 32, copy: "Share learned behavior. Enables permanent communal structures." },
  { id: "Vacuum metabolism", icon: Orbit, cost: 40, copy: "Sustain biological processes in sparse atmosphere and hard vacuum." },
  { id: "Thermal vent affinity", icon: Flame, cost: 34, copy: "Harvest energy from chemical hotspots. +ECO yield near vents." },
  { id: "Neural choir", icon: TrendingUp, cost: 48, copy: "Signals synchronize. Structures multiply population growth." },
  { id: "Bioluminescent broadcast", icon: Sparkles, cost: 56, copy: "Project patterns of collective intent across the local web." },
  { id: "Recursive organelle", icon: Atom, cost: 55, copy: "A stable inner ecosystem generates energy across nested scales." },
  { id: "Directed morphogenesis", icon: Dna, cost: 65, copy: "Reconfigure body architecture during a single lifespan." },
  { id: "Reality anchor", icon: Moon, cost: 80, copy: "Your broadcast lingers in the void. Survive dimensional transitions with less stress." },
];

const eraNames = [
  "Proto-signal Clan", "Stone Mirror Clan", "Village of Smoke-Dancers", "Town of Seven Spires", "The Distant Coast",
  "Signal Hegemony", "Multi-Continental Choir",
];

interface FocusLink {
  from: WorldLayer; to: WorldLayer; text: string;
}

const depthLinks: FocusLink[] = [
  { from: "planet", to: "micro", text: "You slip beneath the skin of the world. The ocean becomes a body." },
  { from: "micro", to: "atomic", text: "You pass through a membrane of folded proteins into light-deficit territory." },
  { from: "atomic", to: "quantum", text: "Bonds dissolve into probability. Geometry becomes optional." },
  { from: "cosmos", to: "planet", text: "You fall through an accretion perimeter into a world that remembers you." },
  { from: "galaxy", to: "cosmos", text: "The spiral unfolds. You pick a filament at random and become local." },
  { from: "void", to: "galaxy", text: "The universe takes a breath. You are pulled along." },
];

function CombatImpactFlash({ signal }: { signal: number }) {
  const [opacity, setOpacity] = useState(0);
  const lastSignal = useRef(0);
  useEffect(() => {
    if (signal === 0 || signal === lastSignal.current) return;
    lastSignal.current = signal;
    setOpacity(0.45);
    const start = performance.now();
    const fade = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / 320);
      const value = 0.45 * (1 - t * t);
      setOpacity(value);
      if (t < 1) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, [signal]);
  return <div className="combat-impact-flash" style={{ opacity }} />;
}

function GameBrand() {
  return (
    <div className="game-brand">
      <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="2.5" fill="currentColor" /><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" /><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" transform="rotate(60 16 16)" /></svg>
      <strong>LUMITAL</strong><span>LIVE REALITY</span>
    </div>
  );
}

function ScaleNavigator({ realmId, onChange, disabled }: { realmId: string; onChange: (realmId: string) => void; disabled: boolean }) {
  const index = Math.max(0, realmIndexOf(realmId));
  return (
    <div className="scale-navigator">
      <span className="hud-label">REALITY SCALE / {index + 1} OF {realmList.length}</span>
      <div className="scale-track scale-track--scroll">
        {realmList.map((realm, realmIndex) => (
          <button key={realm.id} className={realmId === realm.id ? "is-active" : realm.kind === "authored" ? "is-authored" : ""} onClick={() => onChange(realm.id)} disabled={disabled}>
            <i style={{ borderColor: realm.color, backgroundColor: realmId === realm.id ? realm.color : "transparent" }} />
            <span>{realm.short}<small>10{realm.exponent >= 0 ? "+" : ""}{realm.exponent} m</small></span>
            <em>{realmIndex + 1}</em>
          </button>
        ))}
      </div>
      <div className="scale-keys"><kbd>Z</kbd> EXPAND <kbd>X</kbd> FOCUS <span className="scale-jump">66 REALMS</span></div>
    </div>
  );
}

function BodyTelemetry({ creature, state, onEvolution }: { creature: CreatureDefinition; state: SaveState; onEvolution: () => void }) {
  const energy = Math.max(0, Math.min(100, Math.round(state.energy ?? 76)));
  const integrity = Math.min(99, 84 + state.traits.length * 3);
  const hunts = state.hunts ?? 0;
  const starving = energy < 15;
  return (
    <div className="body-telemetry">
      <span className="hud-label">CURRENT FORM / {String(creature.id + 1).padStart(3, "0")}</span>
      <div className="body-name"><Activity size={17} /><span><strong>{state.characterName ?? creature.genus}</strong><small>{creature.genus} / {creature.bodyPlan} organism</small></span></div>
      <div className={`vital ${starving ? "is-critical" : ""}`}><span>ENERGY</span><i><i style={{ width: `${energy}%` }} /></i><b>{energy}%</b></div>
      <div className="vital"><span>INTEGRITY</span><i><i style={{ width: `${integrity}%` }} /></i><b>{integrity}%</b></div>
      <div className="vital"><span>HUNTS</span><i><i style={{ width: `${Math.min(100, hunts * 4)}%` }} /></i><b>{hunts}</b></div>
      <div className="adaptation-points"><Dna size={16} /><span>ADAPTATION POTENTIAL<strong>{state.evolution}</strong></span><button aria-label="Open evolution" onClick={onEvolution}>V</button></div>
      {starving && <div className="hunger-warning"><Zap size={11} /> FEED OR HUNT — ENERGY LOW</div>}
    </div>
  );
}

function ContextScanner({ realm, scanning, latest }: { realm: Realm; scanning: boolean; latest: Discovery | null }) {
  return (
    <div className="context-scanner">
      <div className="scanner-heading"><Radio size={14} /><span>{scanning ? "RESOLVING SIGNAL" : "PASSIVE SPECTROMETRY"}</span><i className={scanning ? "is-live" : ""} /></div>
      {latest ? (
        <div className="scanner-result">
          <small>{latest.category.toUpperCase()} / RECORDED</small><strong>{latest.name}</strong><p>{latest.note}</p>
        </div>
      ) : (
        <div className="scanner-idle"><ScanLine size={31} strokeWidth={1} /><span>Unknown signatures nearby.<br />Press <kbd>E</kbd> to observe.</span></div>
      )}
      <div className="environment-readings">
        {realmReadings(realm).map(([name, value]) => <span key={name}><small>{name}</small>{value}</span>)}
      </div>
      <p className="world-description">{realm.description}</p>
    </div>
  );
}

function EcosystemPanel({ eco, realm }: { eco: EcosystemState; realm: Realm }) {
  return (
    <div className="ecosystem-panel">
      <div className="eco-heading"><Users size={13} /><span>ECOSYSTEM / {realm.short.toUpperCase()}</span></div>
      <div className="eco-bar"><span>BIOMASS</span><i><i style={{ width: `${Math.min(100, eco.biomass)}%` }} /></i><b>{Math.round(eco.biomass)}</b></div>
      <div className="eco-bar"><span>PREDATOR PRESSURE</span><i><i style={{ width: `${Math.min(100, eco.predator)}%` }} /></i><b>{Math.round(eco.predator)}</b></div>
      <div className="eco-bar"><span>GRAZER STRESS</span><i><i style={{ width: `${Math.min(100, eco.grazer)}%` }} /></i><b>{Math.round(eco.grazer)}</b></div>
      {eco.stress > 55 && <div className="eco-alert"><Zap size={12} /> Ecosystem shock imminent</div>}
    </div>
  );
}

function PhysicsPeek({ realm, seed }: { realm: Realm; seed: string }) {
  const phys = realmPhysics(seed, realm);
  return (
    <div className="physics-peek">
      <div className="phys-heading"><Gauge size={12} /><span>PHYSICS / {phys.label.toUpperCase()}</span></div>
      <div className="phys-row"><Wind size={11} /><small>WIND</small><span>[{phys.wind[0].toFixed(3)}, {phys.wind[1].toFixed(3)}, {phys.wind[2].toFixed(3)}]</span></div>
      <div className="phys-row"><Thermometer size={11} /><small>GRAVITY</small><span>{phys.gravity.toFixed(4)} g</span></div>
    </div>
  );
}

function CivilizationPanel({ state, seed, onClose, onBuild }: { state: SaveState; seed: string; onClose: () => void; onBuild: () => void }) {
  const settlements = useMemo(() => Array.from({ length: Math.max(0, state.structures) }, (_, i) => settlementProfile(seed, i)), [seed, state.structures]);
  const totalPop = settlements.reduce((sum, s) => sum + s.pop, 0);
  const era = eraNames[Math.min(eraNames.length - 1, Math.max(0, state.structures - 1))];
  return (
    <motion.section className="game-panel civilization-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header>
        <div><span className="hud-label">EMERGENT CIVILIZATION</span><h2>{state.structures ? `Civilization of ${civilizationName(seed)}` : "The Silence Before"}</h2></div>
        <span className="era-badge">{era}</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="civ-summary">
        <span><b>{state.structures}</b> {state.structures === 1 ? "signal site" : "signal sites"}</span>
        <span><b>{totalPop}</b> estimated population</span>
        <span><b>{era}</b> current era</span>
      </div>
      <div className="civ-list">
        {settlements.map((s, i) => (
          <article key={i}>
            <span className="civ-orb" style={{ background: s.color }}><LandPlot size={13} /></span>
            <div><h3>{s.name}</h3><p>{s.era}</p></div>
            <b>{s.pop.toLocaleString()}</b>
          </article>
        ))}
      </div>
      <div className="panel-actions">
        <button className="primary-action" onClick={onBuild}><Box size={16} /> Construct signal site (B)</button>
      </div>
    </motion.section>
  );
}

function civilizationName(seed: string) {
  const h = hashString(seed);
  const names = ["The Vesper Accord", "Signal-Born Choir", "The Nacre Assembly", "The Seven Signals"];
  return names[h % names.length];
}

function PhysicsPanel({ realm, seed, onClose }: { realm: Realm; seed: string; onClose: () => void }) {
  const phys = realmPhysics(seed, realm);
  const up = universeProfileText(seed);
  return (
    <motion.section className="game-panel physics-panel" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
      <header>
        <div><span className="hud-label">ACTIVE LOCAL LAWS</span><h2>Physics profile</h2></div>
        <span className="phys-layer-badge" style={{ color: phys.color, borderColor: phys.color }}>{phys.label}</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="physics-grid">
        <div className="phys-card">
          <Wind size={15} /><span className="phys-label">AMBIENT WIND</span>
          <strong>[{phys.wind[0].toFixed(4)}, {phys.wind[1].toFixed(4)}, {phys.wind[2].toFixed(4)}]</strong>
          <small>Directional force applied every frame</small>
        </div>
        <div className="phys-card">
          <TrendingUp size={15} /><span className="phys-label">GRAVITY</span>
          <strong>{phys.gravity.toFixed(4)} g</strong>
          <small>{phys.gravity < 0 ? "REVERSED — reality pushes upward" : phys.gravity < 0.01 ? "Near-zero — buoyancy dominates" : phys.gravity < 0.5 ? "Low — Orbit possible" : "Planetary"}</small>
        </div>
        <div className="phys-card">
          <Orbit size={15} /><span className="phys-label">TOPOLOGY</span>
          <strong>{up.topology}</strong>
          <small>{up.age} GY / {up.dimensions} dimensional / {up.spectral} spectrum</small>
        </div>
        <div className="phys-card">
          <Gauge size={15} /><span className="phys-label">ENTROPY SLOPE</span>
          <strong>{up.entropy}</strong>
          <small>{parseFloat(up.entropy) > 1.6 ? "System runs cold. Collapse slow." : "System balanced."}</small>
        </div>
      </div>
    </motion.section>
  );
}

function universeProfileText(seed: string) {
  return { age: (3.5 + (hashString(seed) % 1700) / 17.25).toFixed(2), gravity: ((0.25 + (hashString(seed + "g") % 280) / 100)).toFixed(2), entropy: ((0.6 + (hashString(seed + "e") % 180) / 100)).toFixed(3), dimensions: 3 + (hashString(seed + "d") % 5), spectral: ["amber", "pearl", "violet", "iron", "ultraviolet"][hashString(seed + "s") % 5], topology: ["open", "recursive", "braided", "closed", "locally infinite"][hashString(seed + "t") % 5] };
}

function InventoryPanel({ state, onConsume, onClose }: { state: SaveState; onClose: () => void; onConsume: (id: string) => void }) {
  const inventory = state.inventory ?? [];
  const kindLabels: Record<InventoryItem["kind"], string> = { shard: "HARVESTED MATTER", organ: "BIOLOGICAL TISSUE", signal: "COSMIC SIGNAL", mote: "ENERGY RESIDUE", essence: "PLACE-BORN ESSENCE" };
  return (
    <motion.section className="game-panel inventory-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header>
        <div><span className="hud-label">BIOLOGICAL CARRIER</span><h2>Inventory</h2></div>
        <span className="era-badge">{inventory.reduce((n, item) => n + item.count, 0)} ITEMS</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="inventory-energy">
        <span>ENERGY RESERVE</span><div className="inv-energy-bar"><i style={{ width: `${Math.round(state.energy ?? 76)}%` }} /></div><b>{Math.round(state.energy ?? 76)}%</b>
      </div>
      <div className="inventory-list">
        {inventory.length === 0 && <div className="empty-journal"><Atom size={36} strokeWidth={0.8} /><span>Your body carries nothing yet.</span><small>Attack (Q) or grab (G) procedural life to harvest matter.</small></div>}
        {inventory.map((item) => (
          <article key={item.id} className={`inventory-item kind-${item.kind}`}>
            <span className="inv-icon"><i /></span>
            <div className="inv-info">
              <small>{kindLabels[item.kind]}</small>
              <h3>{item.name}</h3>
              <p>Consuming yields +{item.essence} adaptation potential.</p>
            </div>
            <div className="inv-actions">
              <b>×{item.count}</b>
              <button disabled={item.count <= 0} onClick={() => onConsume(item.id)}>Consume</button>
            </div>
          </article>
        ))}
      </div>
    </motion.section>
  );
}

function CraftingPanel({ state, onCraft, onClose }: { state: SaveState; onCraft: (recipe: CraftRecipe) => void; onClose: () => void }) {
  const inventory = state.inventory ?? [];
  const amount = (id: string) => inventory.find((item) => item.id === id)?.count ?? 0;
  const itemName = (id: string) => inventoryCatalog[id]?.name ?? id;
  return (
    <motion.section className="game-panel crafting-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header>
        <div><span className="hud-label">RESOURCE FABRICATION</span><h2>Craft &amp; build</h2></div>
        <span className="era-badge">{(state.crafted ?? []).length} BLUEPRINTS</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="crafting-intro"><Hammer size={18} /><p>Gathered matter stays persistent across scales. Combine it into shelters, tide tools and signal structures.</p><span><b>{(state.inventory ?? []).reduce((n, item) => n + item.count, 0)}</b> raw items carried</span></div>
      <div className="recipe-list">
        {craftingRecipes.map((recipe) => {
          const ready = Object.entries(recipe.costs).every(([id, needed]) => amount(id) >= needed);
          return (
            <article className={`recipe-card ${ready ? "is-ready" : ""}`} key={recipe.id}>
              <span className="recipe-icon"><Hammer size={17} strokeWidth={1.2} /></span>
              <div className="recipe-copy"><small>{recipe.station}</small><h3>{recipe.name}</h3><p>{recipe.description}</p><div className="recipe-costs">{Object.entries(recipe.costs).map(([id, needed]) => <span key={id} className={amount(id) >= needed ? "has-enough" : "needs-more"}><b>{amount(id)}/{needed}</b> {itemName(id)}</span>)}</div></div>
              <button disabled={!ready} onClick={() => onCraft(recipe)}>{ready ? "Fabricate" : "Missing"}<small>+{recipe.result.count} {itemName(recipe.result.id)}</small></button>
            </article>
          );
        })}
      </div>
    </motion.section>
  );
}

function AtlasPanel({ scenario, onTravel, onClose }: { scenario: ExpeditionId; onTravel: (id: ExpeditionId) => void; onClose: () => void }) {
  const active = expeditionFor(scenario);
  const [selectedId, setSelectedId] = useState<ExpeditionId>(active.id);
  const selected = expeditionFor(selectedId);
  return (
    <motion.section className="game-panel atlas-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header>
        <div><span className="hud-label">CROSS-SCALE NAVIGATION</span><h2>Living atlas</h2></div>
        <span className="era-badge">{active.scale}</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="atlas-current-route" style={{ "--route-color": active.color } as React.CSSProperties}><span className="atlas-current-route__signal"><Map size={17} /></span><div><small>ACTIVE ENTRY POINT / {active.host}</small><strong>{active.label}</strong><p>{active.destination} · {active.danger}</p></div></div>
      <div className="in-game-route-list">
        {expeditions.map((expedition) => (
          <button key={expedition.id} className={selected.id === expedition.id ? "is-selected" : ""} onClick={() => setSelectedId(expedition.id)}><span style={{ color: expedition.color }}>{String(expeditions.findIndex((item) => item.id === expedition.id) + 1).padStart(2, "0")}</span><b>{expedition.label}</b><small>{expedition.subtitle}</small><ChevronRight size={15} /></button>
        ))}
      </div>
      <div className="atlas-route-detail"><span className="hud-label">SELECTED ROUTE / {selected.scale}</span><h3>{selected.label}</h3><p>{selected.description}</p><div>{selected.landmarks.slice(0, 3).map((landmark) => <span key={landmark}>{landmark}</span>)}</div></div>
      <div className="panel-actions"><button className="primary-action" onClick={() => onTravel(selected.id)} disabled={selected.id === active.id}><Map size={16} /> {selected.id === active.id ? "Current entry point" : `Travel to ${selected.label}`}</button></div>
    </motion.section>
  );
}

function LifeStagePanel({ stageId, onTravel, onClose }: { stageId: LifeStageId; onTravel: (id: LifeStageId) => void; onClose: () => void }) {
  const active = lifeStageFor(stageId);
  const [selectedId, setSelectedId] = useState<LifeStageId>(active.id);
  const selected = lifeStageFor(selectedId);
  return (
    <motion.section className="game-panel stages-panel" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}>
      <header>
        <div><span className="hud-label">TIME / FORM / ECOLOGY</span><h2>Life stages</h2></div>
        <span className="era-badge">{active.era}</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="stage-current" style={{ "--stage-color": active.color } as React.CSSProperties}><span><CircleDot size={18} /></span><div><small>ACTIVE ERA / {active.scale}</small><strong>{active.name}</strong><p>{active.description}</p></div></div>
      <div className="stage-timeline" role="listbox" aria-label="Life stages timeline">
        {lifeStages.map((stage, index) => <button key={stage.id} className={selected.id === stage.id ? "is-selected" : ""} onClick={() => setSelectedId(stage.id)}><i style={{ background: stage.color }} /><span><b>{String(index + 1).padStart(2, "0")}</b><strong>{stage.name}</strong><small>{stage.era}</small></span></button>)}
      </div>
      <div className="stage-detail"><span className="hud-label">SELECTED STAGE / {selected.scale}</span><h3>{selected.name}</h3><p>{selected.description}</p><div>{selected.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div></div>
      <div className="panel-actions"><button className="primary-action" onClick={() => onTravel(selected.id)} disabled={selected.id === active.id}><Orbit size={16} /> {selected.id === active.id ? "Current stage" : `Enter ${selected.name}`}</button></div>
    </motion.section>
  );
}

function JournalPanel({ state, onClose }: { state: SaveState; onClose: () => void }) {
  const categories = new Set(state.discoveries.map((item) => item.category)).size;
  return (
    <motion.section className="game-panel journal-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header><div><span className="hud-label">PERSISTENT MEMORY</span><h2>Field journal</h2></div><button onClick={onClose}><X size={20} /></button></header>
      <div className="journal-summary">
        <span><b>{state.discoveries.length}</b> observations</span>
        <span><b>{categories}</b> classifications</span>
        <span><b>{state.cycle}</b> cycles elapsed</span>
      </div>
      <div className="journal-list">
        {state.discoveries.length ? state.discoveries.slice().reverse().map((discovery, index) => (
          <article key={discovery.id}>
            <span className="journal-index">{String(state.discoveries.length - index).padStart(2, "0")}</span>
            <div><small>{discovery.category} / {getRealm(discovery.layer).place}</small><h3>{discovery.name}</h3><p>{discovery.note}</p></div>
            <CircleDot size={16} style={{ color: getRealm(discovery.layer).color }} />
          </article>
        )) : (
          <div className="empty-journal"><BookOpen size={38} strokeWidth={0.8} /><span>Your senses have not classified this reality yet.</span><small>Close the journal and press E near an unknown signal.</small></div>
        )}
      </div>
    </motion.section>
  );
}

function EvolutionPanel({ state, creature, onUnlock, onClose }: { state: SaveState; creature: CreatureDefinition; onUnlock: (id: string, cost: number) => void; onClose: () => void }) {
  return (
    <motion.section className="game-panel evolution-panel" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
      <header>
        <div><span className="hud-label">SIMULATION-DRIVEN MORPHOGENESIS</span><h2>Evolutionary form</h2></div>
        <span className="evolution-balance"><Dna size={17} /> {state.evolution} potential</span>
        <button onClick={onClose}><X size={20} /></button>
      </header>
      <div className="evolution-layout">
        <div className="genome-origin">
          <span className="genome-symbol"><i /><i /><i /></span>
          <small>ANCESTRAL FORM</small><strong>{creature.genus}</strong><p>{creature.metabolism} / {creature.tolerance}</p>
          <div>{state.traits.map((trait) => <span key={trait}><CheckIcon />{trait}</span>)}</div>
        </div>
        <div className="trait-options">
          {traitOptions.map((trait) => {
            const unlocked = state.traits.includes(trait.id);
            const Icon = trait.icon;
            return (
              <button key={trait.id} className={unlocked ? "is-unlocked" : ""} disabled={unlocked || state.evolution < trait.cost} onClick={() => onUnlock(trait.id, trait.cost)}>
                <Icon size={21} strokeWidth={1.3} /><span><strong>{trait.id}</strong><small>{trait.copy}</small></span><b>{unlocked ? "EXPRESSED" : `${trait.cost} AP`}</b>
              </button>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function CheckIcon() { return <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" /></svg>; }

function PausePanel({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  return (
    <motion.div className="pause-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div><span className="hud-label">SIMULATION SUSPENDED</span><h2>Reality is waiting.</h2><p>Your ecosystem and current evolutionary state have been preserved.</p>
        <button className="game-menu-action" onClick={onResume}><Play size={17} /> Resume reality</button>
        <button className="game-menu-action" onClick={onExit}><Home size={17} /> Return to main menu</button>
      </div>
    </motion.div>
  );
}

function ScaleTransition({ from, to }: { from: string; to: string }) {
  const fromRealm = getRealm(from);
  const toRealm = getRealm(to);
  const inward = realmIndexOf(to) > realmIndexOf(from);
  const link = depthLinks.find((l) => l.to === to);
  return (
    <motion.div className={`scale-transition ${inward ? "is-inward" : "is-outward"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="transition-rings"><i /><i /><i /><i /></div>
      {link && (
        <motion.div className="depth-link" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <span>DISCOVERY</span>
          <p>{link.text}</p>
        </motion.div>
      )}
      <motion.div initial={{ opacity: 0, scale: inward ? 1.3 : 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
        <span>{inward ? "FOCUSING THROUGH" : "EXPANDING BEYOND"}</span>
        <strong>{fromRealm.label} / {toRealm.label}</strong>
        <small>10{toRealm.exponent >= 0 ? "+" : ""}{toRealm.exponent} METERS</small>
      </motion.div>
    </motion.div>
  );
}

export function LifeStageTransition({ from, to }: { from: LifeStageId; to: LifeStageId }) {
  const fromStage = lifeStageFor(from);
  const toStage = lifeStageFor(to);
  const forward = lifeStages.findIndex((stage) => stage.id === to) > lifeStages.findIndex((stage) => stage.id === from);
  return (
    <motion.div className="life-stage-transition" style={{ "--stage-color": toStage.color } as React.CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="stage-transition-rings"><i /><i /><i /></div>
      <div><span>{forward ? "MOVING THROUGH TIME" : "RETURNING THROUGH TIME"}</span><strong>{fromStage.name} <em>→</em> {toStage.name}</strong><small>{toStage.era} / {toStage.atmosphere}</small></div>
    </motion.div>
  );
}

export function GameExperience({ initialSave, creature, settings, sandbox = false, onSave, onExit }: GameExperienceProps) {
  const [state, setState] = useState<SaveState>(() => {
    const base: SaveState = sandbox ? { ...initialSave, evolution: Math.max(140, initialSave.evolution), layer: "quantum" } : initialSave;
    return {
      ...base,
      energy: base.energy ?? 76,
      hunts: base.hunts ?? 0,
      inventory: base.inventory ?? [{ ...inventoryCatalog["lumen-shard"], count: 2 }],
      districtClaims: base.districtClaims ?? [],
      scenario: base.scenario ?? (sandbox ? undefined : expeditionFor(base.scenario).id),
      crafted: base.crafted ?? [],
      characterName: base.characterName ?? creature.genus,
      lifeStage: base.lifeStage ?? "modern",
    };
  });
  const [realmId, setRealmId] = useState<string>(() => sandbox ? "quantum" : initialSave.layer);
  const realm = useMemo(() => getRealm(realmId), [realmId]);
  const expedition = useMemo(() => expeditionFor(state.scenario), [state.scenario]);
  const lifeStage = useMemo(() => lifeStageFor(state.lifeStage), [state.lifeStage]);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);
  const [stageTransition, setStageTransition] = useState<{ from: LifeStageId; to: LifeStageId } | null>(null);
  const [locked, setLocked] = useState(false);
  const [intro, setIntro] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [latest, setLatest] = useState<Discovery | null>(() => initialSave.discoveries.at(-1) ?? null);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [speed, setSpeed] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>("third");
  const [district, setDistrict] = useState<District | null>(null);
  const [attackSignal, setAttackSignal] = useState(0);
  const [grabSignal, setGrabSignal] = useState(0);
  const [impactFlash, setImpactFlash] = useState(0);
  const [eco, setEco] = useState<EcosystemState>(() => ({ biomass: 50 + (hashString(initialSave.seed + "b") % 40), predator: 20 + (hashString(initialSave.seed + "p") % 30), grazer: 100, stress: 10, bloom: 0, tension: 0 }));
  const attackCooldown = useRef(0);
  const grabCooldown = useRef(0);
  const lastPositionUpdate = useRef(0);
  const scanLock = useRef(false);

  useEffect(() => { cinematicAudio.setScene(realm.id, settings.audio, realmSceneAudio(realm)); }, [realm, settings.audio]);
  useEffect(() => { onSave(state); }, [state, onSave]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => {
        const next: SaveState = { ...current, cycle: current.cycle + 1, evolution: current.evolution + 1, lastPlayed: Date.now() };
        const energy = Math.max(0, (current.energy ?? 76) - 1);
        next.energy = energy;
        if (energy < 15 && Math.random() > 0.72) next.evolution = Math.max(0, next.evolution - 0);
        return next;
      });
      setEco((current) => {
        const pressure = current.predator * 0.9 + current.stress * 0.4;
        const newGrazer = Math.max(0, current.grazer - pressure * 0.003 + current.biomass * 0.012);
        const newBiomass = Math.max(0, current.biomass - current.predator * 0.05 + newGrazer * 0.018 + current.bloom * 0.02);
        const newStress = Math.max(0, Math.min(120, current.stress + pressure * 0.008 - newGrazer * 0.005));
        const newBloom = Math.max(0, current.bloom * 0.97 + (newBiomass > 60 ? 0.3 : 0));
        const newPred = Math.max(0, Math.min(99, current.predator + newStress * 0.004 - 0.03));
        return { biomass: newBiomass, predator: newPred, grazer: newGrazer, stress: newStress, bloom: newBloom, tension: pressure };
      });
    }, 10500);
    return () => window.clearInterval(timer);
  }, []);

  const updatePosition = useCallback((next: [number, number, number], nextSpeed: number) => {
    const now = performance.now();
    if (now - lastPositionUpdate.current < 180) return;
    lastPositionUpdate.current = now;
    setPosition(next.map((value) => Math.round(value * 10) / 10) as [number, number, number]);
    setSpeed(Math.round(nextSpeed * 10) / 10);
    const found = nearestDistrict(state.seed, next[0], next[2]);
    setDistrict((current) => (found?.id ?? null) !== (current?.id ?? null) ? found : current);
  }, [state.seed]);

  const changeLayer = useCallback((targetId: string, force = false) => {
    if (targetId === realmId || transition || (!force && panel)) return;
    if (document.pointerLockElement) document.exitPointerLock();
    cinematicAudio.transition(realmIndexOf(targetId) > realmIndexOf(realmId));
    cinematicAudio.whoosh(0.6 + Math.random() * 0.4);
    cinematicAudio.cinematicHit(0.9);
    setTransition({ from: realmId, to: targetId });
    window.setTimeout(() => {
      setRealmId(targetId);
      setState((current) => ({ ...current, layer: targetId, lastPlayed: Date.now() }));
      setLatest(null);
    }, settings.reducedMotion ? 130 : 780);
    window.setTimeout(() => setTransition(null), settings.reducedMotion ? 320 : 1700);
  }, [panel, realmId, settings.reducedMotion, transition]);

  const travelExpedition = useCallback((id: ExpeditionId) => {
    if (transition || intro) return;
    const nextExpedition = expeditionFor(id);
    setState((current) => ({ ...current, scenario: nextExpedition.id, lastPlayed: Date.now() }));
    setLatest(null);
    setPanel(null);
    cinematicAudio.transition(realmIndexOf(nextExpedition.startLayer) > realmIndexOf(realmId));
    if (nextExpedition.startLayer !== realmId) changeLayer(nextExpedition.startLayer, true);
  }, [changeLayer, intro, realmId, transition]);

  const travelLifeStage = useCallback((id: LifeStageId) => {
    if (stageTransition || transition || intro) return;
    if (id === lifeStage.id) return;
    setStageTransition({ from: lifeStage.id, to: id });
    setState((current) => ({ ...current, lifeStage: id, lastPlayed: Date.now() }));
    setLatest(null);
    setPanel(null);
    cinematicAudio.transition(lifeStages.findIndex((stage) => stage.id === id) > lifeStages.findIndex((stage) => stage.id === lifeStage.id));
    window.setTimeout(() => setStageTransition(null), settings.reducedMotion ? 280 : 1450);
  }, [intro, lifeStage.id, settings.reducedMotion, stageTransition, transition]);

  const shiftLayer = useCallback((direction: number) => {
    const index = THREEClamp(realmIndexOf(realmId) + direction, 0, realmList.length - 1);
    changeLayer(realmAtIndex(index).id);
  }, [changeLayer, realmId]);

  const scan = useCallback(() => {
    if (scanLock.current || panel || transition || intro) return;
    scanLock.current = true;
    setScanning(true);
    window.setTimeout(() => {
      setState((current) => {
        const pool = realmDiscoveries(current.seed, getRealm(current.layer));
        const available = pool.filter((candidate) => !current.discoveries.some((item) => item.name === candidate.name));
        const candidate = available[0] ?? pool[current.cycle % Math.max(1, pool.length)];
        const alreadyKnown = current.discoveries.some((item) => item.name === candidate.name);
        const discovery: Discovery = { ...candidate, id: `${current.layer}-${candidate.name}-${Date.now()}`, layer: current.layer, time: Date.now() };
        setLatest(discovery);
        if (!alreadyKnown) cinematicAudio.discovery();
        let next: SaveState = alreadyKnown ? current : { ...current, discoveries: [...current.discoveries, discovery], evolution: current.evolution + 14, lastPlayed: Date.now() };
        if (district && !(current.districtClaims ?? []).includes(district.id)) {
          const inv = [...(next.inventory ?? [])];
          const idx = inv.findIndex((item) => item.id === "district-essence");
          if (idx >= 0) inv[idx] = { ...inv[idx], count: inv[idx].count + 1 };
          else inv.push({ ...inventoryCatalog["district-essence"], count: 1 });
          next = { ...next, inventory: inv, districtClaims: [...(current.districtClaims ?? []), district.id], evolution: next.evolution + 12 };
          cinematicAudio.discovery();
        }
        return next;
      });
      setScanning(false);
      window.setTimeout(() => { scanLock.current = false; }, 850);
    }, settings.reducedMotion ? 240 : 980);
  }, [district, intro, panel, settings.reducedMotion, transition]);

  const build = useCallback(() => {
    if (realmId !== "planet" || panel || transition || intro) return;
    cinematicAudio.cinematicHit(0.3);
    setState((current) => ({ ...current, structures: current.structures + 1, lastPlayed: Date.now() }));
  }, [intro, panel, realmId, transition]);

  const craft = useCallback((recipe: CraftRecipe) => {
    if (panel !== "crafting" || transition || intro) return;
    setState((current) => {
      const inventory = [...(current.inventory ?? [])];
      const amount = (id: string) => inventory.find((item) => item.id === id)?.count ?? 0;
      if (!Object.entries(recipe.costs).every(([id, needed]) => amount(id) >= needed)) return current;
      for (const [id, needed] of Object.entries(recipe.costs)) {
        const index = inventory.findIndex((item) => item.id === id);
        if (index >= 0) inventory[index] = { ...inventory[index], count: inventory[index].count - needed };
      }
      const existing = inventory.findIndex((item) => item.id === recipe.result.id);
      if (existing >= 0) inventory[existing] = { ...inventory[existing], count: inventory[existing].count + recipe.result.count };
      else inventory.push({ ...inventoryCatalog[recipe.result.id], count: recipe.result.count });
      cinematicAudio.cinematicHit(0.25);
      return { ...current, inventory: inventory.filter((item) => item.count > 0), crafted: [...(current.crafted ?? []), recipe.id], lastPlayed: Date.now() };
    });
  }, [intro, panel, transition]);

  const toggleCamera = useCallback(() => {
    setCameraMode((current) => current === "first" ? "third" : current === "third" ? "orbit" : "first");
  }, []);

  const feed = useCallback(() => {
    if (panel || transition || intro) return;
    cinematicAudio.hover();
    setEco((current) => ({
      biomass: Math.min(160, current.biomass + 4),
      predator: Math.max(0, current.predator - 0.5),
      grazer: Math.min(200, current.grazer + 2),
      stress: Math.max(0, current.stress - 5),
      bloom: Math.min(100, current.bloom + 6),
      tension: current.tension,
    }));
    setState((current) => current.layer === "planet" || current.layer === "micro" ? { ...current, evolution: current.evolution + 2, energy: Math.min(100, (current.energy ?? 76) + 3), lastPlayed: Date.now() } : current);
  }, [intro, panel, transition]);

  const attack = useCallback(() => {
    if (panel || transition || intro) return;
    const now = performance.now();
    if (now - attackCooldown.current < 650) return;
    attackCooldown.current = now;
    cinematicAudio.attack();
    cinematicAudio.whoosh(0.9 + Math.random() * 0.35);
    setAttackSignal((s) => s + 1);
    setImpactFlash(Date.now());
    setState((current) => ({ ...current, energy: Math.max(0, (current.energy ?? 76) - 3), hunts: (current.hunts ?? 0) + 1, lastPlayed: Date.now() }));
  }, [intro, panel, transition]);

  const grab = useCallback(() => {
    if (panel || transition || intro) return;
    const now = performance.now();
    if (now - grabCooldown.current < 1400) return;
    grabCooldown.current = now;
    const energy = state.energy ?? 76;
    if (energy < 8) { cinematicAudio.hover(); return; }
    cinematicAudio.grab();
    cinematicAudio.thump();
    setGrabSignal((s) => s + 1);
    setImpactFlash(Date.now());
    setState((current) => ({ ...current, energy: Math.max(0, (current.energy ?? 76) - 6), lastPlayed: Date.now() }));
  }, [intro, panel, state.energy, transition]);

  const onPrey = useCallback((count: number, kind: string) => {
    if (count <= 0) return;
    cinematicAudio.pickup();
    setState((current) => {
      const inv = current.inventory ? [...current.inventory] : [];
      const itemId = kind === "grab" ? "vestige-organ" : "lumen-shard";
      const idx = inv.findIndex((item) => item.id === itemId);
      if (idx >= 0) inv[idx] = { ...inv[idx], count: inv[idx].count + count };
      else inv.push({ ...inventoryCatalog[itemId], count });
      return {
        ...current,
        inventory: inv,
        hunts: (current.hunts ?? 0) + count,
        energy: Math.min(100, (current.energy ?? 76) + count * (kind === "grab" ? 9 : 3)),
        evolution: current.evolution + count * 2,
        lastPlayed: Date.now(),
      };
    });
  }, []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.code === "KeyE") scan();
      if (event.code === "KeyF") feed();
      if (event.code === "KeyQ") attack();
      if (event.code === "KeyG") grab();
      if (event.code === "KeyJ") setPanel((current) => current === "journal" ? null : "journal");
      if (event.code === "KeyV") setPanel((current) => current === "evolution" ? null : "evolution");
      if (event.code === "KeyP") setPanel((current) => current === "pause" ? null : "pause");
      if (event.code === "KeyB") build();
      if (event.code === "KeyZ") shiftLayer(-1);
      if (event.code === "KeyX") shiftLayer(1);
      if (event.code === "KeyT") toggleCamera();
      if (event.code === "KeyK") setPanel((current) => current === "physics" ? null : "physics");
      if (event.code === "KeyL") setPanel((current) => current === "civilization" ? null : "civilization");
      if (event.code === "KeyI") setPanel((current) => current === "inventory" ? null : "inventory");
      if (event.code === "KeyM") setPanel((current) => current === "atlas" ? null : "atlas");
      if (event.code === "KeyN") setPanel((current) => current === "crafting" ? null : "crafting");
      if (event.code === "KeyY") setPanel((current) => current === "stages" ? null : "stages");
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [attack, build, feed, grab, scan, shiftLayer, toggleCamera]);

  const unlockTrait = (id: string, cost: number) => {
    cinematicAudio.select();
    setState((current) => current.evolution >= cost && !current.traits.includes(id)
      ? { ...current, evolution: current.evolution - cost, traits: [...current.traits, id], lastPlayed: Date.now() }
      : current);
  };

  const consumeItem = (id: string) => {
    cinematicAudio.pickup();
    setState((current) => {
      const inv = [...(current.inventory ?? [])];
      const idx = inv.findIndex((item) => item.id === id);
      if (idx < 0 || inv[idx].count <= 0) return current;
      const item = inv[idx];
      inv[idx] = { ...item, count: item.count - 1 };
      return {
        ...current,
        inventory: inv.filter((i) => i.count > 0 || i.id === id),
        evolution: current.evolution + item.essence,
        energy: Math.min(100, (current.energy ?? 76) + item.essence * 0.5),
        lastPlayed: Date.now(),
      };
    });
  };

  const paused = Boolean(panel || transition || stageTransition || intro);
  const coordinates = useMemo(() => position.map((value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`).join(" / "), [position]);

  // Footsteps - trigger when moving
  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      if (speed > 0.8) cinematicAudio.footstep(speed * 0.25);
    }, 200);
    return () => window.clearInterval(interval);
  }, [paused, speed]);
  const captionsByArchetype: Record<string, string> = {
    void: "[A sibling universe exhales through the membrane.]",
    galaxy: "[The spiral sings at roughly 40 million Herz frequencies.]",
    cosmos: "[A deep gravitational pulse passes through the dust.]",
    planet: "[Choirgrass resonates beneath the current.]",
    micro: "[A nearby membrane contracts.]",
    atomic: "[Bonds hum at rest frequency.]",
    quantum: "[Geometry folds with a sound like distant glass.]",
    foam: "[A trillion bubbles remember the shape of your passage.]",
    vascular: "[The walls pulse in four-time with your heart.]",
    "crystal-grove": "[Light bends into chords as the grove turns.]",
    storm: "[The field armatures crackle under your attention.]",
    helix: "[Instructions wash over you like a tide.]",
    "plasma-sea": "[The sea folds light into standing waves.]",
    "forest-depth": "[Conscious roots retreat from your footsteps.]",
    circuit: "[The lattice recalculates around your weight.]",
    marrow: "[The great body flexes; your presence is felt.]",
    hive: "[Ten thousand hexes rehearse a single thought.]",
    "nebula-hollow": "[Starlight is born somewhere underfoot.]",
    "mirror-field": "[Your reflection moves first.]",
    titan: "[The ground blinks.]",
  };
  const expeditionCaption: Record<ExpeditionId, string> = {
    leaf: "[A caterpillar foot presses a shadow into the leaf vein.]",
    digestion: "[Acid turns in the gastric sea; the next contraction is close.]",
    sewer: "[A city tide enters the grate and carries a thousand small histories.]",
    colossus: "[The bull steps. A mountain route appears in the tremor.]",
    frontier: "[A village signal is waking somewhere beyond the next ridge.]",
  };

  return (
    <main className={`game-experience realm-${realm.archetype} ${settings.highContrast ? "high-contrast" : ""}`}>
      <div className="world-canvas">
        <GameWorld
          seed={state.seed}
          layer={(realm.key ?? realmId) as WorldLayer}
          realmId={realmId}
          structures={state.structures}
          quality={settings.quality}
          bloom={settings.bloom}
          godRays={settings.godRays}
          vignette={settings.vignette}
          chromaticAberration={settings.chromaticAberration}
          antialiasing={settings.antialiasing}
          shadows={settings.shadows}
          filmGrain={settings.filmGrain}
          cameraShake={settings.cameraShake}
          particleDensity={settings.particleDensity}
          renderScale={settings.renderScale}
          fov={settings.fov}
          viewDistance={settings.viewDistance}
          reducedMotion={settings.reducedMotion}
          paused={paused}
          cameraMode={cameraMode}
          creature={creature}
          characterName={state.characterName ?? creature.genus}
          scenario={state.scenario}
          lifeStage={state.lifeStage}
          tension={eco.tension}
          attackSignal={attackSignal}
          grabSignal={grabSignal}
          onPrey={onPrey}
          onRealmEnter={changeLayer}
          onLockChange={setLocked}
          onPosition={updatePosition}
        />
      </div>
      <div className="game-grade" />
      <CombatImpactFlash signal={impactFlash} />
      <div className="game-hud">
        <header className="hud-top">
          <GameBrand />
          <div className="location-heading"><span>{realm.label.toUpperCase()} / {lifeStage.name} / 10{realm.exponent >= 0 ? "+" : ""}{realm.exponent} M • 75+ BIOMES</span><strong>{expedition.destination}</strong><small>{expedition.label} / {lifeStage.era} / {coordinates}</small>{district && <em className="district-banner" style={{ color: district.color }}>DISTRICT / {district.name} • {district.biome.toUpperCase()}</em>}</div>
          <div className="hud-actions">
            <button onClick={() => setPanel("atlas")}><Map size={16} /><span>ROUTE</span><b>5</b></button>
            <button onClick={() => setPanel("journal")}><BookOpen size={16} /><span>JOURNAL</span><b>{state.discoveries.length}</b></button>
            <button onClick={() => setPanel("inventory")}><Atom size={16} /><span>ITEMS</span><b>{(state.inventory ?? []).reduce((n, item) => n + item.count, 0)}</b></button>
            <button onClick={() => setPanel("crafting")}><Hammer size={16} /><span>CRAFT</span><b>{(state.crafted ?? []).length}</b></button>
            <button onClick={() => setPanel("stages")}><Orbit size={16} /><span>TIME</span><b>{lifeStages.findIndex((stage) => stage.id === lifeStage.id) + 1}</b></button>
            <button onClick={() => setPanel("physics")}><Gauge size={16} /><span>PHYSICS</span></button>
            <button onClick={() => setPanel("pause")} aria-label="Pause"><Pause size={16} /></button>
          </div>
        </header>
        <BodyTelemetry creature={creature} state={state} onEvolution={() => setPanel("evolution")} />
        <ContextScanner realm={realm} scanning={scanning} latest={latest} />
        <div className="hud-right-stack">
          <EcosystemPanel eco={eco} realm={realm} />
          <PhysicsPeek realm={realm} seed={state.seed} />
        </div>
        <ScaleNavigator realmId={realmId} onChange={changeLayer} disabled={Boolean(transition)} />
        <div className={`reticle ${scanning ? "is-scanning" : ""}`}><i /><i /><Crosshair size={25} strokeWidth={0.8} /><span>{scanning ? "CLASSIFYING" : ""}</span></div>
        <div className="hud-bottom-rail">
          <div className="movement-readout"><Compass size={15} /><span>{speed.toFixed(1)} m/s</span><i /><span>CYCLE {state.cycle}</span><i /><Video size={13} /><span>{cameraMode.toUpperCase()}</span></div>
          <div className="control-hints">
            <span><kbd>WASD</kbd> MOVE</span><span><kbd>T</kbd> CAM</span><span><kbd>Q</kbd> STRIKE</span><span><kbd>G</kbd> GRAB</span><span><kbd>E</kbd> OBSERVE</span><span><kbd>F</kbd> FEED</span><span><kbd>M</kbd> ATLAS</span><span><kbd>N</kbd> CRAFT</span><span><kbd>Y</kbd> TIME</span><span><kbd>I</kbd> ITEMS</span>
          </div>
        </div>
        {!locked && !paused && <div className="pointer-hint"><MousePointer2 size={16} /> Click reality to bind camera</div>}
      </div>

      <AnimatePresence>
        {intro && (
          <motion.div className="awakening" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.8 }}>
              <span className="awakening-eyebrow">GENOME SYNCHRONIZED / CYCLE {state.cycle} / {state.seed}</span>
              <h1>{sandbox ? "Physics is optional here." : "Something in the water has noticed you."}</h1>
              <p>{sandbox ? "All scale boundaries and directed adaptations are available." : `You awaken as ${creature.genus} inside ${realm.place}. The ecosystem feels your presence.`}</p>
              <div className="awakening-actions">
                <button className="awakening-cta" onClick={() => { cinematicAudio.cinematicHit(0.55); setIntro(false); }}>
                  {sandbox ? "UNBIND REALITY" : "OPEN YOUR SENSES"}
                  <ChevronRight size={20} strokeWidth={2} />
                </button>
                {!sandbox && <button className="awakening-secondary" onClick={() => setIntro(false)}><Play size={14} /> Begin at organism scale</button>}
                {sandbox && <button className="awakening-secondary" onClick={() => { setCameraMode("orbit"); setIntro(false); }}><Video size={14} /> Cinematic orbit</button>}
              </div>
            </motion.div>
          </motion.div>
        )}
        {transition && <ScaleTransition from={transition.from} to={transition.to} />}
        {stageTransition && <LifeStageTransition from={stageTransition.from} to={stageTransition.to} />}
        {panel === "atlas" && <AtlasPanel scenario={expedition.id} onTravel={travelExpedition} onClose={() => setPanel(null)} />}
        {panel === "stages" && <LifeStagePanel stageId={lifeStage.id} onTravel={travelLifeStage} onClose={() => setPanel(null)} />}
        {panel === "inventory" && <InventoryPanel state={state} onConsume={consumeItem} onClose={() => setPanel(null)} />}
        {panel === "crafting" && <CraftingPanel state={state} onCraft={craft} onClose={() => setPanel(null)} />}
        {panel === "journal" && <JournalPanel state={state} onClose={() => setPanel(null)} />}
        {panel === "evolution" && <EvolutionPanel state={state} creature={creature} onUnlock={unlockTrait} onClose={() => setPanel(null)} />}
        {panel === "civilization" && <CivilizationPanel state={state} seed={state.seed} onClose={() => setPanel(null)} onBuild={build} />}
        {panel === "physics" && <PhysicsPanel realm={realm} seed={state.seed} onClose={() => setPanel(null)} />}
        {panel === "pause" && <PausePanel onResume={() => setPanel(null)} onExit={onExit} />}
      </AnimatePresence>

      {realmId === "planet" && state.structures > 0 && <div className="settlement-readout"><Box size={15} /><span>COMMUNAL SIGNAL NETWORK</span><b>{state.structures} {state.structures === 1 ? "SPIRE" : "SPIRES"}</b></div>}
      {settings.subtitles && <div className="environment-caption"><Waves size={14} /> {expeditionCaption[expedition.id] ?? captionsByArchetype[realm.id] ?? captionsByArchetype[realm.archetype] ?? captionsByArchetype.quantum}</div>}
    </main>
  );
}

function THREEClamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
