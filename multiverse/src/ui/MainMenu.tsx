import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Atom, Dna, Film, Home, Infinity as InfinityIcon, Play, Settings2, Volume2, Sparkles, Waves, BookOpen } from "lucide-react";
import { LAYERS, layerInfo, type LayerId, type MultiverseSave, type MultiverseSettings } from "../game/lore";

interface MainMenuProps {
  save: MultiverseSave | null;
  settings: MultiverseSettings;
  onSelectLayer: (layer: LayerId) => void;
  onContinue: () => void;
  onReplayIntro: () => void;
  onSettings: (settings: MultiverseSettings) => void;
}

type View = "home" | "realities" | "settings" | "lore" | "quit";

const SIGIL = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="3.5" fill="currentColor" />
    <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" />
    <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" transform="rotate(60 24 24)" />
    <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" transform="rotate(120 24 24)" />
  </svg>
);

function MainNav({ save, onNavigate, onContinue, onReplayIntro }: { save: MultiverseSave | null; onNavigate: (view: View) => void; onContinue: () => void; onReplayIntro: () => void }) {
  const items = [
    ...(save ? [{ id: "continue", label: "Continue", detail: `${layerInfo(save.layer).name} · ${save.travels} gateways taken`, icon: Play, action: onContinue }] : []),
    { id: "enter", label: "Enter the Multiverse", detail: "Choose a reality to inhabit", icon: InfinityIcon, action: () => onNavigate("realities") },
    { id: "genesis", label: "Genesis Film", detail: "Replay the origin cinematic", icon: Film, action: onReplayIntro },
    { id: "lore", label: "The Lore", detail: "Earth · Lodemus · Simolysis", icon: BookOpen, action: () => onNavigate("lore") },
    { id: "settings", label: "Settings", detail: "Rendering, audio and comfort", icon: Settings2, action: () => onNavigate("settings") },
    { id: "quit", label: "Quit", detail: "Leave the machine running", icon: Home, action: () => onNavigate("quit") },
  ];
  const [focused, setFocused] = useState(items[0].id);
  return (
    <motion.nav className="menu-nav" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8 }} aria-label="Main menu">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button key={item.id} className={`menu-item ${focused === item.id ? "is-focused" : ""}`} onMouseEnter={() => setFocused(item.id)} onFocus={() => setFocused(item.id)} onClick={item.action}>
            <span className="menu-item__num">{String(index + 1).padStart(2, "0")}</span>
            <Icon size={15} strokeWidth={1.5} />
            <span className="menu-item__label">{item.label}</span>
            <span className="menu-item__detail">{item.detail}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}

function Realities({ save, onSelect, onBack }: { save: MultiverseSave | null; onSelect: (layer: LayerId) => void; onBack: () => void }) {
  return (
    <motion.div className="menu-panel" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.4 }}>
      <header>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="panel-kicker">GATEWAY NETWORK</span>
          <h2>Choose a reality</h2>
        </div>
      </header>
      <div className="reality-list">
        {LAYERS.map((layer, index) => {
          const visited = save?.visited.includes(layer.id);
          const current = save?.layer === layer.id;
          return (
            <button key={layer.id} className="reality-card" style={{ ["--accent" as string]: layer.color }} onClick={() => onSelect(layer.id)}>
              <span className="reality-card__index">{String(index + 1).padStart(2, "0")}</span>
              <span className="reality-card__body">
                <strong>{layer.name}</strong>
                <em>{layer.tagline}</em>
                <p>{layer.description}</p>
              </span>
              <span className="reality-card__flags">
                {visited && <i>VISITED</i>}
                {current && <i className="is-live">LAST SEEN</i>}
              </span>
            </button>
          );
        })}
      </div>
      <footer className="panel-foot">
        <Atom size={13} /> Walk into a gateway in-world to drift to the next reality. Lodemus remembers every world you have touched.
      </footer>
    </motion.div>
  );
}

function Lore({ onBack }: { onBack: () => void }) {
  return (
    <motion.div className="menu-panel menu-panel--wide" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.4 }}>
      <header>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="panel-kicker">THE ARCHIVE OF SIMOLYSIS</span>
          <h2>The Lore</h2>
        </div>
      </header>
      <div className="lore-body">
        <p>
          <strong>THE FALL.</strong> Earth is gone. A meteorite struck at dawn, and in a single day the oceans boiled and the continents burned. You were one of the last to reach the machine.
        </p>
        <p>
          <strong>LODEMUS.</strong> Not a ship. Not an ark. A machine built in humanity's final hour to keep the living alive after a world dies. When you took hold of it, Lodemus carried your mind across the boundary of reality — and plugged you into the Multiverse.
        </p>
        <p>
          <strong>SIMOLYSIS.</strong> The god who started everything. When the first burst of energy radiated across the multiverse, Simolysis dreamed a trillion worlds into being — and hid, inside them, a purpose no traveler has yet uncovered.
        </p>
        <p>
          <strong>YOU.</strong> A traveler, awake inside a reality that can be anything: floating white voids, endless halls, fractal mazes, gravitational hearts, living valleys under aurora-lit skies. There is far more to your journey than survival. Your next move is everything.
        </p>
      </div>
      <footer className="panel-foot">
        <Dna size={13} /> New realities assemble themselves from the seed of the old ones.
      </footer>
    </motion.div>
  );
}

function Settings({ settings, onSettings, onBack }: { settings: MultiverseSettings; onSettings: (settings: MultiverseSettings) => void; onBack: () => void }) {
  const patch = (part: Partial<MultiverseSettings>) => onSettings({ ...settings, ...part });
  return (
    <motion.div className="menu-panel" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.4 }}>
      <header>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="panel-kicker">LODEMUS CONFIGURATION</span>
          <h2>Settings</h2>
        </div>
      </header>
      <div className="settings-body">
        <label className="select-setting">
          <span>
            <b>Visual fidelity</b>
            <small>Master profile for reflections, post-processing and density.</small>
          </span>
          <select value={settings.quality} onChange={(event) => patch({ quality: event.target.value as MultiverseSettings["quality"] })}>
            <option value="low">Performance</option>
            <option value="medium">High</option>
            <option value="ultra">Multiverse Cinematic</option>
          </select>
        </label>
        <label className="range-setting">
          <span>
            <b>Render scale</b>
            <small>{settings.renderScale}% internal resolution</small>
          </span>
          <input type="range" min="50" max="150" step="10" value={settings.renderScale} onChange={(event) => patch({ renderScale: Number(event.target.value) })} />
        </label>
        <label className="range-setting">
          <span>
            <b>Field of view</b>
            <small>{settings.fov}°</small>
          </span>
          <input type="range" min="55" max="95" step="1" value={settings.fov} onChange={(event) => patch({ fov: Number(event.target.value) })} />
        </label>
        <label className="range-setting">
          <span>
            <b>
              <Volume2 size={12} /> Master volume
            </b>
            <small>{settings.audio}%</small>
          </span>
          <input type="range" min="0" max="100" value={settings.audio} onChange={(event) => patch({ audio: Number(event.target.value) })} />
        </label>
        <label className="toggle-setting">
          <span>
            <b>Reduced motion</b>
            <small>Calms camera drift and ambient movement.</small>
          </span>
          <input type="checkbox" checked={settings.reducedMotion} onChange={(event) => patch({ reducedMotion: event.target.checked })} />
        </label>
        <label className="toggle-setting">
          <span>
            <b>Subtitles</b>
            <small>Show narration captions in the Genesis film.</small>
          </span>
          <input type="checkbox" checked={settings.subtitles} onChange={(event) => patch({ subtitles: event.target.checked })} />
        </label>
      </div>
    </motion.div>
  );
}

function Quit({ onBack }: { onBack: () => void }) {
  return (
    <motion.div className="quit-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
      <div className="quit-sigil">{SIGIL}</div>
      <h2>THE MULTIVERSE WILL BE WAITING</h2>
      <p>Lodemus keeps your place among the realities. Earth is gone, but you are not.</p>
      <button className="btn btn-primary" onClick={onBack}>
        <Sparkles size={15} /> RE-ENTER
      </button>
    </motion.div>
  );
}

export function MainMenu({ save, settings, onSelectLayer, onContinue, onReplayIntro, onSettings }: MainMenuProps) {
  const [view, setView] = useState<View>("home");

  return (
    <div className="main-menu">
      <div className="menu-vignette" />
      <motion.div className="menu-brand" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
        <span className="menu-brand__mark">{SIGIL}</span>
        <span className="menu-brand__engine">LODEMUS REALITY ENGINE</span>
      </motion.div>

      <div className="menu-hero">
        <motion.i initial={{ opacity: 0, x: -22 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 0.9 }}>
          EARTH IS GONE · YOU ARE NOT
        </motion.i>
        <motion.span
          initial={{ opacity: 0, letterSpacing: "1.2em", filter: "blur(16px)" }}
          animate={{ opacity: 1, letterSpacing: "0.14em", filter: "blur(0px)" }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          THE
          <br />
          MULTIVERSE
        </motion.span>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}>
          SIMOLYSIS IS WATCHING
        </motion.p>
      </div>

      <AnimatePresence mode="wait">
        {view === "home" && <MainNav key="home" save={save} onNavigate={setView} onContinue={onContinue} onReplayIntro={onReplayIntro} />}
        {view === "realities" && <Realities key="realities" save={save} onSelect={onSelectLayer} onBack={() => setView("home")} />}
        {view === "settings" && <Settings key="settings" settings={settings} onSettings={onSettings} onBack={() => setView("home")} />}
        {view === "lore" && <Lore key="lore" onBack={() => setView("home")} />}
        {view === "quit" && <Quit key="quit" onBack={() => setView("home")} />}
      </AnimatePresence>

      <div className="menu-foot" aria-hidden="true">
        <span>
          <Waves size={12} /> REALITIES STABLE
        </span>
        <span>LODEMUS LINK · LIVE</span>
        <span>60 HZ · SIMOLYSIS WATCHES</span>
      </div>
    </div>
  );
}

