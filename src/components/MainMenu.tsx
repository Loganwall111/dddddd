import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Float, OrbitControls } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Atom, Bookmark, Check, ChevronRight, CircleDot,
  Dna, Eye, FlaskConical, Gauge, Globe2, Infinity as InfinityIcon, Leaf,
  Maximize, Monitor, Mountain, Orbit, Play, RefreshCw, Search, Settings2,
  Sparkles, Volume2, Waves, Zap,
} from "lucide-react";
import { CreatureModel } from "./CreatureModel";
import {
  creatures, expeditions, generateSeed, universeProfile, type CreatureDefinition, type ExpeditionId, type SaveState,
} from "../game/procedural";

export interface AppSettings {
  quality: "low" | "medium" | "ultra";
  simulation: number;
  audio: number;
  music: number;
  sfx: number;
  bloom: boolean;
  cameraMotion: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  subtitles: boolean;
  shadows: boolean;
  godRays: boolean;
  vignette: boolean;
  chromaticAberration: boolean;
  volumetrics: boolean;
  cameraShake: boolean;
  antialiasing: boolean;
  fov: number;
  mouseSensitivity: number;
  invertY: boolean;
  viewDistance: number;
  particleDensity: number;
  renderScale: number;
  filmGrain: boolean;
}

interface MainMenuProps {
  seed: string;
  selectedCreature: CreatureDefinition;
  characterName: string;
  save: SaveState | null;
  settings: AppSettings;
  onSeedChange: (seed: string) => void;
  onCreatureChange: (creature: CreatureDefinition) => void;
  onCharacterNameChange: (name: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onStart: (mode?: "journey" | "sandbox", expedition?: ExpeditionId) => void;
  onContinue: () => void;
}

type MenuView = "main" | "creatures" | "seed" | "atlas" | "multiverse" | "settings";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="3.5" fill="currentColor" />
        <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" />
        <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" transform="rotate(60 24 24)" />
        <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" transform="rotate(120 24 24)" />
      </svg>
      <span>LUMITAL</span>
    </div>
  );
}

function CornerTelemetry({ seed }: { seed: string }) {
  return (
    <div className="menu-telemetry" aria-hidden="true">
      <span><i /> REALITY ENGINE / LIVE</span>
      <span>SEED {seed}</span>
      <span>TOPOLOGY STABLE / 60 HZ</span>
    </div>
  );
}

function SaveConstellation({ save, onContinue }: { save: SaveState | null; onContinue: () => void }) {
  return (
    <motion.aside className="menu-save-panel" initial={{ opacity: 0, x: 34 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.8 }}>
      <div className="save-panel-header"><span>// LOAD JOURNEY</span><small>{save ? "LOCAL MEMORY / 01" : "NO MEMORY / READY"}</small></div>
      <div className="save-panel-orbit" aria-hidden="true"><i /><i /><i /><span>{save ? "01" : "＋"}</span></div>
      <div className="save-panel-caption"><span>{save ? "ACTIVE REALITY" : "GENESIS MEMORY"}</span><strong>{save ? "Vesper Continuum" : "No journey bound"}</strong><small>{save ? `${save.discoveries.length} observations / cycle ${save.cycle}` : "Create an organism to begin"}</small></div>
      {save ? (
        <button className="save-slot is-active" onClick={onContinue}><span><b>JOURNEY 01</b><small>{save.seed} / {save.discoveries.length} DISCOVERIES</small></span><em>{Math.min(99, Math.max(1, save.cycle * 3))}%</em><ArrowRight size={17} /></button>
      ) : (
        <div className="save-slot save-slot--empty"><span><b>NO SAVE SLOT</b><small>THE FIRST POSSIBILITY IS WAITING</small></span></div>
      )}
      <div className="save-panel-footer"><span><kbd>ENTER</kbd> SELECT</span><span><kbd>ESC</kbd> BACK</span></div>
    </motion.aside>
  );
}

function MainNavigation({
  save,
  onNavigate,
  onContinue,
}: {
  save: SaveState | null;
  onNavigate: (view: MenuView, journey?: boolean) => void;
  onContinue: () => void;
}) {
  const items = [
    ...(save ? [{ id: "continue", label: "Continue journey", detail: `Cycle ${save.cycle} / ${save.discoveries.length} discoveries`, icon: Play, onClick: onContinue }] : []),
    { id: "start", label: "New journey", detail: "Awaken in a new living reality", icon: CircleDot, onClick: () => onNavigate("creatures", true) },
    { id: "creatures", label: "Creature / form", detail: "400 viable morphologies", icon: Dna, onClick: () => onNavigate("creatures") },
    { id: "atlas", label: "Living atlas", detail: "Leaf cells to stomach seas", icon: Globe2, onClick: () => onNavigate("atlas") },
    { id: "seed", label: "World seed", detail: "Define the laws of emergence", icon: Orbit, onClick: () => onNavigate("seed") },
    { id: "multiverse", label: "Multiverse", detail: "Revisit persistent realities", icon: InfinityIcon, onClick: () => onNavigate("multiverse") },
    { id: "sandbox", label: "Sandbox", detail: "Unbind physics and scale", icon: Atom, onClick: () => onNavigate("seed", true) },
    { id: "aqua", label: "Aqua physics lab", detail: "Extreme water & destruction sandbox", icon: Waves, onClick: () => { window.location.hash = "aqua"; } },
    { id: "endless", label: "Endless Potential", detail: "Infinite physics world — water, cities, black holes, space", icon: InfinityIcon, onClick: () => { window.location.hash = "endless"; } },
    { id: "rifts", label: "Riftbound", detail: "Voxel sandbox: the Rift, the Gate, the Dream", icon: Zap, onClick: () => { window.location.hash = "rifts"; } },
    { id: "settings", label: "Settings", detail: "Rendering, simulation and access", icon: Settings2, onClick: () => onNavigate("settings") },
  ];
  const [focused, setFocused] = useState(items[0].id);
  const focusedIndex = Math.max(0, items.findIndex((item) => item.id === focused));

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "KeyW", "KeyS", "Enter"].includes(event.code)) return;
      event.preventDefault();
      if (event.code === "Enter") {
        items[focusedIndex]?.onClick();
        return;
      }
      const direction = event.code === "ArrowDown" || event.code === "KeyS" ? 1 : -1;
      const next = (focusedIndex + direction + items.length) % items.length;
      setFocused(items[next].id);
      document.querySelector(`.menu-link[data-id="${items[next].id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [focusedIndex, items]);

  return (
    <motion.nav
      className="main-nav"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.9 }}
      aria-label="Main menu"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            data-id={item.id}
            className={`menu-link ${focused === item.id ? "is-focused" : ""} ${index === 0 ? "is-primary" : ""}`}
            onMouseEnter={() => setFocused(item.id)}
            onFocus={() => setFocused(item.id)}
            onClick={item.onClick}
          >
            <span className="menu-link__number">{String(index + 1).padStart(2, "0")}</span>
            <Icon size={15} strokeWidth={1.4} />
            <span className="menu-link__label">{item.label}</span>
            <span className="menu-link__detail">{item.detail}</span>
            <ChevronRight className="menu-link__arrow" size={17} />
          </button>
        );
      })}
      <div className="menu-nav-controls"><span><kbd>W</kbd><kbd>S</kbd> NAVIGATE</span><span><kbd>ENTER</kbd> SELECT</span></div>
    </motion.nav>
  );
}

function MorphGlyph({ creature }: { creature: CreatureDefinition }) {
  const count = creature.bodyPlan === "colonial" ? 5 : creature.bodyPlan === "radial" ? 4 : 2;
  return (
    <span className={`morph-glyph morph-glyph--${creature.bodyPlan}`} style={{ "--hue": creature.hue } as React.CSSProperties}>
      {Array.from({ length: count }, (_, index) => <i key={index} />)}
    </span>
  );
}

function CreaturePreview({ creature, reducedMotion }: { creature: CreatureDefinition; reducedMotion: boolean }) {
  return (
    <div className="creature-preview-canvas">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.2, 5.1], fov: 42 }}>
        <color attach="background" args={["#07080a"]} />
        <fog attach="fog" args={["#07080a", 6, 13]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} color="#dff6ff" />
        <directionalLight position={[-4, -1, 1]} intensity={1.7} color="#725cff" />
        <Float speed={reducedMotion ? 0 : 1.2} floatIntensity={reducedMotion ? 0 : 0.2} rotationIntensity={reducedMotion ? 0 : 0.15}>
          <CreatureModel creature={creature} scale={1.05} active reducedMotion={reducedMotion} />
        </Float>
        <mesh position={[0, -1.44, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.3, 64]} />
          <meshBasicMaterial color="#b9ffdc" transparent opacity={0.07} />
        </mesh>
        <Environment preset="night" />
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.1} maxPolarAngle={2.05} autoRotate={!reducedMotion} autoRotateSpeed={0.3} />
      </Canvas>
    </div>
  );
}

function TraitMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="trait-meter">
      <span>{label}</span><b>{value}</b>
      <i><i style={{ width: `${value}%` }} /></i>
    </div>
  );
}

function CreatureLab({
  selected,
  characterName,
  onSelect,
  onCharacterNameChange,
  onClose,
  onContinue,
  journey,
  reducedMotion,
}: {
  selected: CreatureDefinition;
  characterName: string;
  onSelect: (creature: CreatureDefinition) => void;
  onCharacterNameChange: (name: string) => void;
  onClose: () => void;
  onContinue: () => void;
  journey: boolean;
  reducedMotion: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => creatures.filter((creature) =>
    (filter === "all" || creature.bodyPlan === filter) &&
    `${creature.name} ${creature.habitat} ${creature.role}`.toLowerCase().includes(query.toLowerCase())), [query, filter]);

  return (
    <motion.section className="menu-sheet creature-lab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <BrandMark compact />
        <div className="sheet-title"><span>Genesis archive</span><strong>Choose a viable beginning</strong></div>
        <span className="sheet-index">400 FORMS / DETERMINISTIC GENOMES</span>
      </header>

      <div className="creature-lab__body">
        <div className="creature-browser">
          <div className="browser-tools">
            <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search morphology, habitat, role" /></label>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter body plan">
              <option value="all">All architectures</option>
              <option value="radial">Radial</option><option value="bilateral">Bilateral</option>
              <option value="colonial">Colonial</option><option value="fractal">Fractal</option>
              <option value="crystalline">Crystalline</option><option value="plasma">Plasma</option>
            </select>
          </div>
          <div className="creature-grid" role="listbox" aria-label="Starting creatures">
            {filtered.map((creature) => (
              <button
                key={creature.id}
                className={selected.id === creature.id ? "is-selected" : ""}
                onClick={() => onSelect(creature)}
                role="option"
                aria-selected={selected.id === creature.id}
              >
                <MorphGlyph creature={creature} />
                <span><b>{creature.name}</b><small>{creature.bodyPlan} / {creature.habitat}</small></span>
                {selected.id === creature.id && <Check size={15} />}
              </button>
            ))}
          </div>
          <footer>{filtered.length} viable morphologies <span>Each form changes movement, tolerance and evolutionary potential.</span></footer>
        </div>

        <aside className="creature-analysis">
          <CreaturePreview creature={selected} reducedMotion={reducedMotion} />
          <div className="analysis-copy">
            <span className="kicker">FORM {String(selected.id + 1).padStart(3, "0")} / {selected.bodyPlan}</span>
            <h2>{selected.genus}</h2>
            <label className="entity-name-field"><span>ENTITY CALLSIGN</span><input value={characterName} onChange={(event) => onCharacterNameChange(event.target.value.slice(0, 24))} placeholder={selected.genus} maxLength={24} /></label>
            <p>{selected.description}</p>
            <div className="trait-pairs">
              <span><small>LOCOMOTION</small>{selected.locomotion}</span>
              <span><small>METABOLISM</small>{selected.metabolism}</span>
              <span><small>ECOLOGICAL ROLE</small>{selected.role}</span>
              <span><small>SOCIAL LOGIC</small>{selected.social}</span>
            </div>
            <div className="trait-grid">
              <TraitMeter label="Adaptability" value={selected.potential} />
              <TraitMeter label="Endurance" value={selected.endurance} />
              <TraitMeter label="Mobility" value={selected.mobility} />
              <TraitMeter label="Cognition" value={selected.cognition} />
            </div>
          </div>
          <button className="primary-action" onClick={journey ? onContinue : onClose}>
            {journey ? "Bind this genome" : "Confirm form"}<ArrowRight size={18} />
          </button>
        </aside>
      </div>
    </motion.section>
  );
}

function SeedComposer({
  seed,
  onSeedChange,
  onClose,
  onStart,
  sandbox,
}: {
  seed: string;
  onSeedChange: (seed: string) => void;
  onClose: () => void;
  onStart: () => void;
  sandbox: boolean;
}) {
  const profile = useMemo(() => universeProfile(seed), [seed]);
  return (
    <motion.section className="menu-sheet seed-composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <BrandMark compact />
        <div className="sheet-title"><span>Reality foundry</span><strong>{sandbox ? "Unbound simulation" : "Choose the laws of your universe"}</strong></div>
        <span className="sheet-index">SEEDSPACE / 2<sup>128</sup> REALITIES</span>
      </header>
      <div className="seed-layout">
        <div className="seed-copy">
          <span className="kicker">DETERMINISTIC ORIGIN</span>
          <h2>Every seed is a history<br />waiting to happen.</h2>
          <p>Geography is repeatable. Life is not. Ecosystems continue to diverge after first contact.</p>
          <label className="seed-input">
            <span>WORLD SEED</span>
            <input value={seed} onChange={(event) => onSeedChange(event.target.value.toUpperCase().slice(0, 32))} />
            <button onClick={() => onSeedChange(generateSeed())} aria-label="Randomize seed"><RefreshCw size={17} /></button>
          </label>
          <button className="primary-action primary-action--wide" onClick={onStart} disabled={!seed.trim()}>
            {sandbox ? "Enter unbound reality" : "Awaken in this reality"}<ArrowRight size={18} />
          </button>
        </div>
        <div className="universe-profile">
          <div className="orbital-diagram" aria-hidden="true">
            <i /><i /><i /><i />
            <span><Orbit size={30} strokeWidth={0.8} /></span>
          </div>
          <span className="kicker">PREDICTED CONSTANTS</span>
          <dl>
            <div><dt>AGE</dt><dd>{profile.age} GY</dd></div>
            <div><dt>GRAVITY BIAS</dt><dd>{profile.gravity} g</dd></div>
            <div><dt>ENTROPY SLOPE</dt><dd>{profile.entropy}</dd></div>
            <div><dt>DIMENSIONS</dt><dd>{profile.dimensions} perceived</dd></div>
            <div><dt>DOMINANT SPECTRUM</dt><dd>{profile.spectral}</dd></div>
            <div><dt>TOPOLOGY</dt><dd>{profile.topology}</dd></div>
          </dl>
          <p><Sparkles size={15} /> Viable for emergent complexity. Causality confidence 93.7%.</p>
        </div>
      </div>
    </motion.section>
  );
}

function MultiversePanel({ save, onClose, onContinue }: { save: SaveState | null; onClose: () => void; onContinue: () => void }) {
  return (
    <motion.section className="menu-sheet multiverse-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <BrandMark compact />
        <div className="sheet-title"><span>Persistent atlas</span><strong>Discovered realities</strong></div>
        <span className="sheet-index">LOCAL MEMORY / ENCRYPTED</span>
      </header>
      <div className="multiverse-content">
        <div className="multiverse-heading">
          <span className="kicker">KNOWN BRANCHES</span>
          <h2>{save ? "One universe remembers you." : "No universe has learned your name."}</h2>
          <p>Bookmarked realities retain their seed, discoveries, evolutionary history and broad ecosystem state.</p>
        </div>
        {save ? (
          <button className="reality-row" onClick={onContinue}>
            <span className="reality-orb"><i /></span>
            <span><small>{save.seed}</small><strong>Vesper Continuum</strong><em>{save.discoveries.length} discoveries / cycle {save.cycle}</em></span>
            <Bookmark size={18} fill={save.bookmarked ? "currentColor" : "none"} />
            <ArrowRight size={21} />
          </button>
        ) : (
          <div className="empty-reality"><InfinityIcon size={35} strokeWidth={0.8} /><span>The atlas is empty. Begin a journey to collapse the first possibility.</span></div>
        )}
      </div>
    </motion.section>
  );
}

function LivingAtlas({ onClose, onStart }: { onClose: () => void; onStart: (mode?: "journey" | "sandbox", expedition?: ExpeditionId) => void }) {
  const [selectedId, setSelectedId] = useState<ExpeditionId>("leaf");
  const selected = expeditions.find((expedition) => expedition.id === selectedId) ?? expeditions[0];
  const icons = { leaf: Leaf, digestion: FlaskConical, sewer: Waves, colossus: Mountain, frontier: Globe2 };
  const SelectedIcon = icons[selected.id];
  return (
    <motion.section className="menu-sheet living-atlas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <BrandMark compact />
        <div className="sheet-title"><span>Cross-scale expedition atlas</span><strong>Choose where to become small</strong></div>
        <span className="sheet-index">700,000+ CITY SEEDS / 10 LIFE STAGES / 66 REALMS</span>
      </header>
      <div className="atlas-layout">
        <div className="atlas-intro">
          <span className="kicker">THE WORLD IS NOT A MAP</span>
          <h2>Every surface<br />opens inward.</h2>
          <p>Start as a walking organism. Cross a leaf vein, survive a human stomach, ride a sewer tide or climb a bull into the mountains. Every planet keeps its own cities, villages and laws; the same seed continues across every scale.</p>
          <div className="atlas-stat-grid">
            <span><b>700K+</b><small>cities / villages / ruins</small></span>
            <span><b>75+</b><small>planetary biomes</small></span>
            <span><b>∞</b><small>host chains</small></span>
          </div>
          <div className="atlas-rule"><i /><span>SELECT A LIVING ENTRY POINT</span></div>
        </div>
        <div className="atlas-routes" role="listbox" aria-label="Living expedition routes">
          {expeditions.map((expedition, index) => {
            const Icon = icons[expedition.id];
            return (
              <button key={expedition.id} role="option" aria-selected={selected.id === expedition.id} className={`atlas-route-card ${selected.id === expedition.id ? "is-selected" : ""}`} onClick={() => setSelectedId(expedition.id)}>
                <span className="atlas-route-card__index">{String(index + 1).padStart(2, "0")}</span>
                <span className="atlas-route-card__icon" style={{ color: expedition.color }}><Icon size={18} strokeWidth={1.35} /></span>
                <span className="atlas-route-card__copy"><b>{expedition.label}</b><small>{expedition.subtitle}</small></span>
                <span className="atlas-route-card__scale">{expedition.scale}</span>
                <ChevronRight size={16} className="atlas-route-card__arrow" />
              </button>
            );
          })}
        </div>
        <aside className="atlas-preview" style={{ "--route-color": selected.color } as React.CSSProperties}>
          <div className={`atlas-visual atlas-visual--${selected.id}`} aria-hidden="true">
            <div className="atlas-visual__orbit" /><div className="atlas-visual__core"><SelectedIcon size={27} strokeWidth={1.1} /></div>
            <span className="atlas-visual__label">{selected.scale}</span>
          </div>
          <div className="atlas-preview__copy">
            <span className="kicker">ENTRY {String(expeditions.findIndex((item) => item.id === selected.id) + 1).padStart(2, "0")} / {selected.host}</span>
            <h3>{selected.label}</h3>
            <p>{selected.description}</p>
            <div className="atlas-detail-grid"><span><small>DESTINATION</small>{selected.destination}</span><span><small>RISK</small>{selected.danger}</span></div>
            <div className="atlas-landmarks"><small>LANDMARKS ON APPROACH</small><div>{selected.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div></div>
            <div className="atlas-resources"><small>HARVESTABLE RESOURCES</small><div>{selected.resources.map((resource) => <span key={resource}>{resource}</span>)}</div></div>
          </div>
          <button className="primary-action" onClick={() => onStart("journey", selected.id)}>Begin {selected.label} <ArrowRight size={18} /></button>
        </aside>
      </div>
    </motion.section>
  );
}

function Toggle({ value, onChange, label, detail }: { value: boolean; onChange: (value: boolean) => void; label: string; detail: string }) {
  return (
    <button className="setting-toggle" onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span><b>{label}</b><small>{detail}</small></span><i className={value ? "is-on" : ""}><i /></i>
    </button>
  );
}

function SettingsPanel({ settings, onChange, onClose }: { settings: AppSettings; onChange: (settings: AppSettings) => void; onClose: () => void }) {
  const patch = (values: Partial<AppSettings>) => onChange({ ...settings, ...values });
  const [tab, setTab] = useState<"graphics" | "audio" | "controls" | "simulation" | "accessibility">("graphics");
  return (
    <motion.section className="menu-sheet settings-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <BrandMark compact />
        <div className="sheet-title"><span>Full AAA control</span><strong>Settings</strong></div>
        <button className="text-button" onClick={() => onChange(defaultSettings)}>RESET DEFAULTS</button>
      </header>
      <div className="settings-layout">
        <aside>
          <button className={tab === "graphics" ? "is-active" : ""} onClick={() => setTab("graphics")}><Eye size={16} /> Graphics</button>
          <button className={tab === "audio" ? "is-active" : ""} onClick={() => setTab("audio")}><Volume2 size={16} /> Audio</button>
          <button className={tab === "controls" ? "is-active" : ""} onClick={() => setTab("controls")}><Waves size={16} /> Controls</button>
          <button className={tab === "simulation" ? "is-active" : ""} onClick={() => setTab("simulation")}><Gauge size={16} /> Simulation</button>
          <button className={tab === "accessibility" ? "is-active" : ""} onClick={() => setTab("accessibility")}><CircleDot size={16} /> Accessibility</button>
        </aside>
        <div className="settings-list">
          {tab === "graphics" && (
            <>
              <div className="settings-section">
                <span className="kicker">RENDERING PIPELINE</span>
                <label className="select-setting"><span><b>Visual fidelity preset</b><small>Master profile controlling LOD, volumetrics, samples and draw distance.</small></span><select value={settings.quality} onChange={(event) => patch({ quality: event.target.value as AppSettings["quality"] })}><option value="low">Performance</option><option value="medium">High</option><option value="ultra">Lumital Cinematic</option></select></label>
                <label className="range-setting"><span><b>Render scale</b><small>{settings.renderScale}% / internal resolution multiplier</small></span><input type="range" min="50" max="150" step="10" value={settings.renderScale} onChange={(event) => patch({ renderScale: Number(event.target.value) })} /></label>
                <label className="range-setting"><span><b>Field of view</b><small>{settings.fov}° / camera perspective</small></span><input type="range" min="55" max="90" step="1" value={settings.fov} onChange={(event) => patch({ fov: Number(event.target.value) })} /></label>
                <label className="range-setting"><span><b>View distance</b><small>{settings.viewDistance}% / streaming horizon and terrain chunks</small></span><input type="range" min="50" max="150" step="5" value={settings.viewDistance} onChange={(event) => patch({ viewDistance: Number(event.target.value) })} /></label>
              </div>
              <div className="settings-section">
                <span className="kicker">POST-PROCESSING</span>
                <Toggle value={settings.bloom} onChange={(bloom) => patch({ bloom })} label="Spectral bloom" detail="Physically weighted glow around emissive matter." />
                <Toggle value={settings.godRays} onChange={(godRays) => patch({ godRays })} label="Volumetric god rays" detail="Light shafts streaming through atmospheric particulate." />
                <Toggle value={settings.vignette} onChange={(vignette) => patch({ vignette })} label="Cinematic vignette" detail="Softly darkens frame edges for focus." />
                <Toggle value={settings.chromaticAberration} onChange={(chromaticAberration) => patch({ chromaticAberration })} label="Chromatic aberration" detail="Subtle RGB channel separation at the periphery." />
                <Toggle value={settings.filmGrain} onChange={(filmGrain) => patch({ filmGrain })} label="Film grain" detail="Organic noise overlay to reduce banding." />
                <Toggle value={settings.antialiasing} onChange={(antialiasing) => patch({ antialiasing })} label="Multisample antialiasing" detail="Smooths geometric edges at a performance cost." />
              </div>
              <div className="settings-section">
                <span className="kicker">ENVIRONMENT</span>
                <Toggle value={settings.shadows} onChange={(shadows) => patch({ shadows })} label="Real-time shadows" detail="Sun and bioluminescent light casting soft shadows." />
                <Toggle value={settings.volumetrics} onChange={(volumetrics) => patch({ volumetrics })} label="Volumetric fog" detail="Light-aware atmospheric density inside biomes." />
                <label className="range-setting"><span><b>Particle density</b><small>{settings.particleDensity}% / embers, mist, spores, bioluminescence</small></span><input type="range" min="25" max="150" step="5" value={settings.particleDensity} onChange={(event) => patch({ particleDensity: Number(event.target.value) })} /></label>
                <Toggle value={settings.cameraMotion} onChange={(cameraMotion) => patch({ cameraMotion })} label="Camera inertia" detail="Momentum and biological head movement." />
                <Toggle value={settings.cameraShake} onChange={(cameraShake) => patch({ cameraShake })} label="Impact camera shake" detail="Punches and grabs rattle the camera." />
              </div>
            </>
          )}
          {tab === "audio" && (
            <>
              <div className="settings-section">
                <span className="kicker">MASTER MIX</span>
                <label className="range-setting"><span><b>Master level</b><small>{settings.audio}%</small></span><input type="range" min="0" max="100" value={settings.audio} onChange={(event) => patch({ audio: Number(event.target.value) })} /></label>
                <label className="range-setting"><span><b>Music</b><small>{settings.music}% / generative realm themes</small></span><input type="range" min="0" max="100" value={settings.music} onChange={(event) => patch({ music: Number(event.target.value) })} /></label>
                <label className="range-setting"><span><b>Sound effects</b><small>{settings.sfx}% / combat, footsteps, environmental</small></span><input type="range" min="0" max="100" value={settings.sfx} onChange={(event) => patch({ sfx: Number(event.target.value) })} /></label>
              </div>
              <div className="settings-section">
                <span className="kicker">AUDIO FEATURES</span>
                <Toggle value={settings.subtitles} onChange={(subtitles) => patch({ subtitles })} label="Environmental subtitles" detail="Describes important procedural audio cues." />
              </div>
            </>
          )}
          {tab === "controls" && (
            <>
              <div className="settings-section">
                <span className="kicker">MOUSE &amp; CAMERA</span>
                <label className="range-setting"><span><b>Mouse sensitivity</b><small>{settings.mouseSensitivity}%</small></span><input type="range" min="10" max="150" value={settings.mouseSensitivity} onChange={(event) => patch({ mouseSensitivity: Number(event.target.value) })} /></label>
                <Toggle value={settings.invertY} onChange={(invertY) => patch({ invertY })} label="Invert vertical axis" detail="Pulling the mouse down looks up." />
              </div>
              <div className="settings-section">
                <span className="kicker">KEYBINDINGS</span>
                <div className="keybinds-grid">
                  <span><kbd>WASD</kbd> Move</span>
                  <span><kbd>Shift</kbd> Surge</span>
                  <span><kbd>Space / C</kbd> Ascend / Descend</span>
                  <span><kbd>Q</kbd> Strike</span>
                  <span><kbd>G</kbd> Grab</span>
                  <span><kbd>F</kbd> Feed</span>
                  <span><kbd>E</kbd> Observe</span>
                  <span><kbd>T</kbd> Cycle camera</span>
                  <span><kbd>Z / X</kbd> Scale up / down</span>
                  <span><kbd>I</kbd> Inventory</span>
                  <span><kbd>V</kbd> Evolve</span>
                  <span><kbd>P</kbd> Pause</span>
                </div>
              </div>
            </>
          )}
          {tab === "simulation" && (
            <>
              <div className="settings-section">
                <span className="kicker">WORLD SIMULATION</span>
                <label className="range-setting"><span><b>Ecology density</b><small>{settings.simulation}% / simulation LOD adapts with distance</small></span><input type="range" min="25" max="100" step="25" value={settings.simulation} onChange={(event) => patch({ simulation: Number(event.target.value) })} /></label>
              </div>
            </>
          )}
          {tab === "accessibility" && (
            <>
              <div className="settings-section">
                <span className="kicker">ACCESSIBILITY</span>
                <Toggle value={settings.reducedMotion} onChange={(reducedMotion) => patch({ reducedMotion })} label="Reduced motion" detail="Limits camera drift and nonessential environmental motion." />
                <Toggle value={settings.highContrast} onChange={(highContrast) => patch({ highContrast })} label="High contrast HUD" detail="Strengthens typography and interface boundaries." />
                <Toggle value={settings.subtitles} onChange={(subtitles) => patch({ subtitles })} label="Environmental subtitles" detail="Describes important procedural audio cues." />
              </div>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}

export const defaultSettings: AppSettings = {
  quality: "ultra",
  simulation: 75,
  audio: 55,
  music: 70,
  sfx: 85,
  bloom: true,
  cameraMotion: true,
  reducedMotion: false,
  highContrast: false,
  subtitles: true,
  shadows: true,
  godRays: true,
  vignette: true,
  chromaticAberration: true,
  volumetrics: true,
  cameraShake: true,
  antialiasing: true,
  fov: 65,
  mouseSensitivity: 50,
  invertY: false,
  viewDistance: 100,
  particleDensity: 100,
  renderScale: 100,
  filmGrain: true,
};

export function MainMenu(props: MainMenuProps) {
  const [view, setView] = useState<MenuView>("main");
  const [journeyFlow, setJourneyFlow] = useState(false);
  const [sandboxFlow, setSandboxFlow] = useState(false);
  const navigate = (next: MenuView, journey = false) => {
    setJourneyFlow(journey && next === "creatures");
    setSandboxFlow(journey && next === "seed");
    setView(next);
  };
  const close = () => { setView("main"); setJourneyFlow(false); setSandboxFlow(false); };

  return (
    <div className={`main-menu ${props.settings.highContrast ? "high-contrast" : ""}`}>
      <div className="menu-vignette" />
      <div className="menu-optics" aria-hidden="true"><i /><i /><i /></div>
      <AnimatePresence mode="wait">
        {view === "main" ? (
          <motion.div key="main" className="menu-home" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1 }}>
              <BrandMark compact />
              <span className="menu-version">INFINITE REALITY SIMULATION</span>
              <div className="menu-system-status">
                <span><Monitor size={13} /> {props.settings.quality.toUpperCase()}</span>
                <span><Volume2 size={13} /> {props.settings.audio}%</span>
                <span><Maximize size={13} /> DESKTOP</span>
              </div>
            </motion.header>
            <div className="menu-top-kicker">// MAIN MENU <i /> <span>STABLE / V1.0.0</span></div>
            <div className="hero-brand">
              <motion.i initial={{ opacity: 0, x: -25 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 1 }}>THE LIVING REALITY ENGINE</motion.i>
              <motion.span initial={{ opacity: 0, letterSpacing: "1.5em", filter: "blur(14px)" }} animate={{ opacity: 1, letterSpacing: "0.22em", filter: "blur(0px)" }} transition={{ duration: 1.6, ease: "easeOut" }}>LUMITAL</motion.span>
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8 }}>EVERY SCALE CONTAINS ANOTHER WORLD</motion.p>
            </div>
            <MainNavigation save={props.save} onNavigate={navigate} onContinue={props.onContinue} />
            <SaveConstellation save={props.save} onContinue={props.onContinue} />
            <motion.div className="menu-reality-status" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.05, duration: 1 }}>
              <span className="menu-reality-status__eyebrow"><i /> GENESIS FORM READY</span>
              <strong>{props.characterName.trim() || props.selectedCreature.genus}</strong>
              <p>{props.selectedCreature.genus} / {props.selectedCreature.bodyPlan} / {props.selectedCreature.habitat}</p>
              <div><span>ADAPTABILITY <b>{props.selectedCreature.potential}</b></span><i><i style={{ width: `${props.selectedCreature.potential}%` }} /></i></div>
              <small>FORM {String(props.selectedCreature.id + 1).padStart(3, "0")} OF 400</small>
            </motion.div>
            <div className="menu-side-copy" aria-hidden="true">A WORLD WITHIN A WORLD WITHIN A WORLD</div>
            <CornerTelemetry seed={props.seed} />
          </motion.div>
        ) : view === "creatures" ? (
          <CreatureLab key="creatures" selected={props.selectedCreature} characterName={props.characterName} onSelect={props.onCreatureChange} onCharacterNameChange={props.onCharacterNameChange} onClose={close} journey={journeyFlow} onContinue={() => { setView("seed"); setSandboxFlow(false); }} reducedMotion={props.settings.reducedMotion} />
        ) : view === "seed" ? (
          <SeedComposer key="seed" seed={props.seed} onSeedChange={props.onSeedChange} onClose={close} onStart={() => props.onStart(sandboxFlow ? "sandbox" : "journey")} sandbox={sandboxFlow} />
        ) : view === "atlas" ? (
          <LivingAtlas key="atlas" onClose={close} onStart={props.onStart} />
        ) : view === "multiverse" ? (
          <MultiversePanel key="multiverse" save={props.save} onClose={close} onContinue={props.onContinue} />
        ) : (
          <SettingsPanel key="settings" settings={props.settings} onChange={props.onSettingsChange} onClose={close} />
        )}
      </AnimatePresence>
    </div>
  );
}