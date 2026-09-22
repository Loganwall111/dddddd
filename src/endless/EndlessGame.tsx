import { useCallback, useEffect, useRef, useState } from "react";
import {
  EndlessWorld,
  HOTBAR,
  type EndlessStats,
  type ScenarioId,
  type WeatherId,
} from "./endlessWorld";
import "./endless.css";

const ZERO: EndlessStats = {
  fps: 0, simMs: 0, particles: 0, bodies: 0, chunks: 0, tris: 0, calls: 0,
  biome: "Coastal Meadows", dist: 0, x: 0, y: 0, z: 0, hp: 100, timeScale: 1,
  flying: false, dead: false, blackholes: 0,
};

const SCENARIOS: { id: ScenarioId; label: string; hint: string; icon: string }[] = [
  { id: "blackhole", label: "Black Hole", hint: "A singularity tears through the sky. Light bends; nothing escapes.", icon: "◉" },
  { id: "meteor", label: "Meteor Shower", hint: "Fire stones rain down and hit whatever is beneath them.", icon: "☄" },
  { id: "quake", label: "Quake", hint: "The ground shatters, slumps, and sinks.", icon: "⛰" },
  { id: "flood", label: "Flood", hint: "A wall of water rolls over the terrain.", icon: "≈" },
  { id: "storm", label: "Thunderstorm", hint: "Heavy rain, lightning, wind in the water.", icon: "⚡" },
  { id: "volcano", label: "Volcano", hint: "Eruption — rock, molten glass, smoke.", icon: "▲" },
  { id: "sewer", label: "Into the Sewers", hint: "Drop through a grate into the tunnels under the city.", icon: "⬒" },
  { id: "tornado", label: "Tornado", hint: "A column of wind walks across the land.", icon: "❋" },
  { id: "glassstorm", label: "Glass Storm", hint: "A blizzard of razor glass. Do not stand still.", icon: "❄" },
];

const CONTROLS: { k: string; a: string }[] = [
  { k: "WASD", a: "Move" },
  { k: "Mouse", a: "Look (click the world to lock the cursor)" },
  { k: "Space", a: "Jump / rise in flight" },
  { k: "Shift", a: "Sprint / descend in flight" },
  { k: "F", a: "Toggle flight" },
  { k: "E", a: "Interact — sewer grates, launch pads, open doors" },
  { k: "1–8", a: "Select tool" },
  { k: "Click", a: "Use the selected tool on the world" },
  { k: "T / G", a: "Time scale down / up" },
  { k: "R", a: "Respawn after death" },
  { k: "P", a: "Pause" },
  { k: "H", a: "Toggle this help" },
];

interface LogEntry { id: number; msg: string; kind: string; }

export default function EndlessGame({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<EndlessWorld | null>(null);
  const [phase, setPhase] = useState<"menu" | "loading" | "playing">("menu");
  const [stats, setStats] = useState<EndlessStats>(ZERO);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [toolIdx, setToolIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [scen, setScen] = useState(false);
  const [death, setDeath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [hadLock, setHadLock] = useState(false);
  const [sound, setSound] = useState(true);
  const [lensing, setLensing] = useState(true);
  const [weather, setWeather] = useState<WeatherId>("clear");
  const [quality, setQuality] = useState<1 | 1.5 | 2>(1);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const idRef = useRef(1);
  const toastTimer = useRef<number | null>(null);

  const pushLog = useCallback((msg: string, kind: string) => {
    const id = idRef.current++;
    setLog((l) => [...l.slice(-6), { id, msg, kind }]);
    window.setTimeout(() => setLog((l) => l.filter((e) => e.id !== id)), 6500);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("loading");
    const w = new EndlessWorld(canvas, {
      onStats: (s) => setStats(s),
      onLog: (m, k) => pushLog(m, k),
      onDeath: (cause) => setDeath(cause),
      onBiome: (name) => showToast(`You have reached ${name}.`),
    }, seed);
    worldRef.current = w;
    setPaused(false);
    setDeath(null);
    try {
      await w.init();
    } catch (e) {
      console.error(e);
      pushLog(`The world failed to form: ${e instanceof Error ? e.message : String(e)}`, "warn");
      setPhase("menu");
      return;
    }
    w.setSound(sound);
    w.setLensing(lensing);
    w.setQuality(quality);
    setPhase("playing");
  }, [seed, pushLog, showToast, sound, lensing, quality]);

  // Pointer-lock tracking (pause = lost lock)
  const hadLockRef = useRef(false);
  useEffect(() => { hadLockRef.current = hadLock; }, [hadLock]);
  useEffect(() => {
    if (phase !== "playing") return;
    const onLock = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setLocked(isLocked);
      if (isLocked) setHadLock(true);
      setPaused((p) => (isLocked ? false : hadLockRef.current ? true : p));
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [phase]);

  const respawn = () => {
    worldRef.current?.respawn();
    setDeath(null);
  };

  // P pause
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyH") setHelp((h) => !h);
      if (e.code === "KeyP" && !e.repeat) {
        const w = worldRef.current;
        if (!w) return;
        if (w.isAlive === false) return;
        if (document.pointerLockElement) document.exitPointerLock();
        setPaused((p) => {
          const np = !p;
          w.setPaused(np);
          return np;
        });
      }
      if (e.code === "KeyR" && death) respawn();
      if (e.code === "Escape" && document.pointerLockElement) document.exitPointerLock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, death]);

  useEffect(() => () => { worldRef.current?.dispose(); worldRef.current = null; }, []);

  const resume = () => {
    setPaused(false);
    setScen(false);
    worldRef.current?.setPaused(false);
    canvasRef.current?.requestPointerLock();
  };

  const pickTool = (i: number) => {
    setToolIdx(i);
    worldRef.current?.selectToolIndex(i);
  };
  const useScenario = (id: ScenarioId) => {
    const w = worldRef.current;
    if (!w) return;
    w.runScenario(id);
    const s = SCENARIOS.find((x) => x.id === id);
    if (s) pushLog(`${s.label} — ${s.hint}`, "info");
  };
  const doWeather = (wr: WeatherId) => {
    setWeather(wr);
    worldRef.current?.setWeather(wr);
  };
  const doQuality = (q: 1 | 1.5 | 2) => {
    setQuality(q);
    worldRef.current?.setQuality(q);
  };
  const doSound = (v: boolean) => {
    setSound(v);
    worldRef.current?.setSound(v);
  };
  const doLens = (v: boolean) => {
    setLensing(v);
    worldRef.current?.setLensing(v);
  };
  const quit = () => {
    worldRef.current?.dispose();
    worldRef.current = null;
    if (document.pointerLockElement) document.exitPointerLock();
    onExit();
  };

  const inGame = phase === "playing";
  const showPause = inGame && (paused || !locked || death) && hadLock;
  const showEnter = inGame && !hadLock;

  return (
    <div className="endless-root">
      <canvas ref={canvasRef} className="endless-canvas" onPointerDown={() => {
        if (inGame && !document.pointerLockElement) canvasRef.current?.requestPointerLock();
      }} />

      {/* ── Main menu ─────────────────────────────────────────── */}
      {(phase === "menu" || phase === "loading") && (
        <div className="ep-menu">
          <div className="ep-menu-bg" />
          <div className="ep-menu-stars" />
          <div className="ep-menu-card">
            <div className="ep-menu-eyebrow">A sandbox with no rules</div>
            <h1 className="ep-menu-title">ENDLESS<br />POTENTIAL</h1>
            <p className="ep-menu-sub">
              An infinite, physically honest world — water that floods, glass that shatters,
              buildings you can enter, sewers you can travel, and a sky that eventually gives
              way to space. Everything you throw at it reacts; everything you break stays broken.
            </p>
            <div className="ep-menu-actions">
              <button className="ep-btn ep-btn-primary" onClick={start}>
                {phase === "loading" ? "Forming the world…" : "Enter the World"}
              </button>
              <button className="ep-btn" onClick={() => setHelp(true)}>How to Play</button>
            </div>
            <div className="ep-menu-foot">
              <span>World seed: <b>{seed}</b></span>
              <span>60 Hz rigid-body core · SPH fluid · WebGPU-ready</span>
            </div>
          </div>
        </div>
      )}

      {/* ── HUD ───────────────────────────────────────────────── */}
      {inGame && (
        <>
          <div className="ep-hud">
            <div className="ep-hud-tl">
              <div className="ep-biome">{stats.biome}</div>
              <div className="ep-stats-line">
                <span>{stats.fps.toFixed(0)} fps</span>
                <span>{stats.simMs.toFixed(1)} ms sim</span>
                <span>{stats.particles.toLocaleString()} fluid</span>
                <span>{stats.bodies} bodies</span>
              </div>
              <div className="ep-stats-line dim">
                <span>x {stats.x.toFixed(0)}</span>
                <span>z {stats.z.toFixed(0)}</span>
                <span>{(stats.dist / 1000).toFixed(1)} km from origin</span>
                <span>{stats.tris.toLocaleString()} tris</span>
                {stats.flying && <span className="ep-fly">FLYING</span>}
              </div>
              <div className="ep-hp">
                <div className="ep-hp-fill" style={{ width: `${stats.hp}%` }} />
              </div>
              <div className="ep-time">TIME ×{stats.timeScale}</div>
            </div>

            <div className="ep-hud-tr">
              <button className="ep-icon-btn" title="Weather: clear" onClick={() => doWeather("clear")}>☀</button>
              <button className="ep-icon-btn" title="Weather: rain" onClick={() => doWeather("rain")}>🌧</button>
              <button className="ep-icon-btn" title="Weather: storm" onClick={() => doWeather("storm")}>⛈</button>
              <button className="ep-icon-btn" title="Gravitational lensing" onClick={() => doLens(!lensing)}>◍</button>
              <button className="ep-icon-btn" title="Sound" onClick={() => doSound(!sound)}>{sound ? "🔊" : "🔇"}</button>
              <button className="ep-icon-btn" title="Help (H)" onClick={() => setHelp(true)}>?</button>
              <button className="ep-icon-btn" title="Pause (P)" onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                setPaused(true);
                worldRef.current?.setPaused(true);
              }}>❚❚</button>
            </div>

            <div className="ep-toast">{toast}</div>

            <div className="ep-log">
              {log.map((e) => <div key={e.id} className={`ep-log-line ${e.kind}`}>{e.msg}</div>)}
            </div>

            <div className="ep-crosshair">+</div>

            <div className="ep-hotbar">
              {HOTBAR.map((t, i) => (
                <button key={t.id}
                  className={`ep-slot ${i === toolIdx ? "on" : ""}`}
                  onClick={() => pickTool(i)}
                  title={`${t.label} — key ${i + 1}`}>
                  <span className="ep-slot-glyph">{t.glyph}</span>
                  <span className="ep-slot-label">{t.label}</span>
                  <span className="ep-slot-key">{i + 1}</span>
                </button>
              ))}
            </div>

            <div className="ep-scen-wrap">
              <button className="ep-scen-toggle" onClick={() => setScen((s) => !s)}>
                {scen ? "▴" : "▾"} Scenarios
              </button>
              {scen && (
                <div className="ep-scen-list">
                  {SCENARIOS.map((s) => (
                    <button key={s.id} onClick={() => useScenario(s.id)}>
                      <span className="ep-scen-icon">{s.icon}</span>
                      <span className="ep-scen-body">
                        <b>{s.label}</b>
                        <small>{s.hint}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Enter prompt (first run) ─────────────────────── */}
          {showEnter && (
            <div className="ep-enter">
              <div className="ep-enter-card">
                <h2>The world is yours.</h2>
                <p>Click to take control. Move with WASD, and look around with your mouse.</p>
                <p className="ep-enter-dim">
                  Eight tools in the hotbar below. Nine scenarios under <b>Scenarios</b>.
                  Everything you break is real, and everything you build can be broken back.
                </p>
              </div>
            </div>
          )}

          {/* ── Pause ───────────────────────────────────────── */}
          {showPause && (
            <div className="ep-pause">
              <div className="ep-pause-card">
                <h2>{death ? "You are down." : "Paused"}</h2>
                {!death && (
                  <div className="ep-pause-row">
                    <button className="ep-btn ep-btn-primary" onClick={resume}>Resume</button>
                    <button className="ep-btn" onClick={() => setScen((s) => !s)}>
                      {scen ? "Hide" : "Scenarios"}
                    </button>
                    <button className="ep-btn" onClick={quit}>Leave the World</button>
                  </div>
                )}
                {scen && !death && (
                  <div className="ep-pause-scen">
                    {SCENARIOS.map((s) => (
                      <button key={s.id} onClick={() => useScenario(s.id)}>
                        <span className="ep-scen-icon">{s.icon}</span>
                        <b>{s.label}</b>
                        <small>{s.hint}</small>
                      </button>
                    ))}
                  </div>
                )}
                {death && (
                  <>
                    <p className="ep-death-cause">{death}</p>
                    <div className="ep-pause-row">
                      <button className="ep-btn ep-btn-primary" onClick={respawn}>Respawn (R)</button>
                      <button className="ep-btn" onClick={quit}>Leave the World</button>
                    </div>
                  </>
                )}
                <div className="ep-pause-set">
                  <div className="ep-set-row">
                    <span>Weather</span>
                    <div>
                      {(["clear", "rain", "storm"] as WeatherId[]).map((wr) => (
                        <button key={wr} className={`ep-mini ${weather === wr ? "on" : ""}`} onClick={() => doWeather(wr)}>
                          {wr}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ep-set-row">
                    <span>Quality</span>
                    <div>
                      {([[1, "Low"], [1.5, "Med"], [2, "High"]] as [1 | 1.5 | 2, string][]).map(([q, l]) => (
                        <button key={q} className={`ep-mini ${quality === q ? "on" : ""}`} onClick={() => doQuality(q)}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ep-set-row">
                    <span>Gravitational lensing</span>
                    <button className={`ep-mini ${lensing ? "on" : ""}`} onClick={() => doLens(!lensing)}>
                      {lensing ? "on" : "off"}
                    </button>
                  </div>
                  <div className="ep-set-row">
                    <span>Sound</span>
                    <button className={`ep-mini ${sound ? "on" : ""}`} onClick={() => doSound(!sound)}>
                      {sound ? "on" : "off"}
                    </button>
                  </div>
                </div>
                {help && (
                  <div className="ep-help-grid">
                    {CONTROLS.map((c) => (
                      <div key={c.k} className="ep-help-row">
                        <kbd>{c.k}</kbd><span>{c.a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Help (non-paused) ────────────────────────────── */}
          {help && !showPause && (
            <div className="ep-help-float">
              {CONTROLS.map((c) => (
                <div key={c.k} className="ep-help-row">
                  <kbd>{c.k}</kbd><span>{c.a}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
