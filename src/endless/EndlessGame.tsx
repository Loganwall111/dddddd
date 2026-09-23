import { useCallback, useEffect, useRef, useState } from "react";
import {
  EndlessWorld,
  HOTBAR,
  type EndlessStats,
  type ScenarioId,
  type ToolId,
  type WeatherId,
} from "./endlessWorld";
import "./endless.css";

const ZERO: EndlessStats = {
  fps: 0, simMs: 0, particles: 0, bodies: 0, chunks: 0, tris: 0, calls: 0,
  biome: "DOWNTOWN — SECTOR 0", dist: 0, x: 0, y: 0, z: 0, hp: 100, timeScale: 1,
  flying: false, dead: false, blackholes: 0,
};

const SCENARIOS: { id: ScenarioId; label: string; hint: string; icon: string }[] = [
  { id: "blackhole", label: "Black Hole", hint: "A singularity tears through the sky. Light bends; nothing escapes.", icon: "◉" },
  { id: "meteor", label: "Meteor Shower", hint: "Fire stones rain down and hit whatever is beneath them.", icon: "☄" },
  { id: "quake", label: "Quake", hint: "The ground shatters, slumps, and sinks.", icon: "⛰" },
  { id: "flood", label: "Flood", hint: "A wall of water rolls over the terrain.", icon: "≈" },
  { id: "storm", label: "Thunderstorm", hint: "Heavy rain, lightning, wind in the water.", icon: "⚡" },
  { id: "volcano", label: "Volcano", hint: "Eruption — rock, molten glass, smoke.", icon: "▲" },
  { id: "sewer", label: "Into the Sewers", hint: "The drainage network fails. Grates vent water.", icon: "⬒" },
  { id: "tornado", label: "Tornado", hint: "A column of wind walks across the land.", icon: "❋" },
  { id: "glassstorm", label: "Glass Storm", hint: "A blizzard of razor glass. Do not stand still.", icon: "❄" },
];

const INVENTORY: { id: ToolId; name: string; desc: string }[] = [
  { id: "pistol", name: "Pistol", desc: "Semi-automatic sidearm. Hitscan, heavy punch per round." },
  { id: "smg", name: "SMG", desc: "A buzz of lead. Faster than thought, lighter than trouble." },
  { id: "shotgun", name: "Shotgun", desc: "Six pellets, one opinion. Best served close." },
  { id: "rifle", name: "Assault Rifle", desc: "Full-auto carbine. Hold the trigger — it never gets tired." },
  { id: "rocket", name: "Rocket Launcher", desc: "An unstable warhead on a stick. It finds soft things." },
  { id: "grenade", name: "Grenade", desc: "A spinning argument. It bounces, it waits, it detonates." },
  { id: "dynamite", name: "Dynamite", desc: "Throw a stick of dynamite. Fuses hate being ignored." },
  { id: "water", name: "Water Cannon", desc: "Pour a few hundred litres of very motivated water." },
  { id: "crates", name: "Crate Stack", desc: "Spawns load-bearing crates. They break under pressure." },
  { id: "glass", name: "Glass Wall", desc: "Raises a pane of glass. It will shatter — that is the point." },
  { id: "portal", name: "Portal Frame", desc: "Two clicks, two holes, one confused physics engine." },
  { id: "ragdoll", name: "Test Dummy", desc: "It obeys exactly one law: momentum." },
];

const CONTROLS: { k: string; a: string }[] = [
  { k: "WASD", a: "Move" },
  { k: "Mouse", a: "Look (click the world to lock the cursor)" },
  { k: "LMB", a: "Use the selected tool / fire" },
  { k: "RMB", a: "Grab — hold to carry crates, dummies… or people; release to throw" },
  { k: "Space", a: "Jump / rise in flight" },
  { k: "Shift", a: "Sprint / descend in flight" },
  { k: "F", a: "Toggle flight" },
  { k: "E", a: "Interact — sewer grates, launch pads, the portal ring" },
  { k: "1–0 · Q · X", a: "Select tool (12 slots)" },
  { k: "I", a: "Open inventory" },
  { k: "T / G", a: "Time scale down / up" },
  { k: "R", a: "Respawn after death" },
  { k: "P", a: "Pause" },
  { k: "H", a: "Toggle this help" },
];

const slotKey = (i: number): string => (i < 9 ? String(i + 1) : i === 9 ? "0" : i === 10 ? "Q" : "X");

interface LogEntry { id: number; msg: string; kind: string; }

type MenuOption = "start" | "sandbox" | "graphics" | "sound" | "newworld" | "controls";

export default function EndlessGame({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<EndlessWorld | null>(null);
  const [phase, setPhase] = useState<"menu" | "playing">("menu");
  const [booting, setBooting] = useState(true);
  const [stats, setStats] = useState<EndlessStats>(ZERO);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [toolIdx, setToolIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [scen, setScen] = useState(false);
  const [inv, setInv] = useState(false);
  const [death, setDeath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [hadLock, setHadLock] = useState(false);
  const [sandbox, setSandbox] = useState(true);
  const [lensing, setLensing] = useState(true);
  const [sound, setSound] = useState(true);
  const [weather, setWeather] = useState<WeatherId>("clear");
  const [quality, setQuality] = useState<1 | 1.5 | 2>(1.5);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [bootTick, setBootTick] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
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

  const settingsRef = useRef({ sound, lensing, quality, sandbox });
  settingsRef.current = { sound, lensing, quality, sandbox };

  // ── engine lifecycle: the world forms on load (attract mode) and is
  //    the living background behind the menu.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBooting(true);
    let cancelled = false;
    const w = new EndlessWorld(canvas, {
      onStats: (s) => setStats(s),
      onLog: (m, k) => pushLog(m, k),
      onDeath: (cause) => setDeath(cause),
      onBiome: (name) => showToast(`You have reached ${name}.`),
    }, seed);
    worldRef.current = w;
    (async () => {
      try {
        await w.init();
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          pushLog(`The world failed to form: ${e instanceof Error ? e.message : String(e)}`, "warn");
        }
      }
      if (!cancelled) {
        const st = settingsRef.current;
        w.setSound(st.sound);
        w.setLensing(st.lensing);
        w.setQuality(st.quality);
        w.setSandbox(st.sandbox);
        setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
      w.dispose();
      if (worldRef.current === w) worldRef.current = null;
    };
  }, [seed, bootTick, pushLog, showToast]);

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

  // Keyboard: pause, help, inventory, respawn
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyH") setHelp((h) => !h);
      if (e.code === "KeyI" && !e.repeat) {
        const nv = !inv;
        setInv(nv);
        const w = worldRef.current;
        if (w) w.setPaused(nv);
        if (nv) {
          if (document.pointerLockElement) document.exitPointerLock();
        } else {
          canvasRef.current?.requestPointerLock();
        }
      }
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
  }, [phase, death, inv]);

  const startGame = () => {
    const w = worldRef.current;
    if (!w) return;
    setInv(false);
    setHelp(false);
    w.setAttract(false);
    setPhase("playing");
    setHadLock(false);
    setPaused(false);
    w.setPaused(false);
    canvasRef.current?.requestPointerLock();
  };

  const toggleSandbox = (v?: boolean) => {
    const nv = v ?? !sandbox;
    setSandbox(nv);
    worldRef.current?.setSandbox(nv);
  };
  const cycleQuality = () => {
    const order: (1 | 1.5 | 2)[] = [1, 1.5, 2];
    const next = order[(order.indexOf(quality) + 1) % order.length];
    setQuality(next);
    worldRef.current?.setQuality(next);
  };
  const toggleSound = (v?: boolean) => {
    const nv = v ?? !sound;
    setSound(nv);
    worldRef.current?.setSound(nv);
  };
  const newWorld = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
    setBootTick((t) => t + 1);
    setPhase("menu");
    setHadLock(false);
    setDeath(null);
    setPaused(false);
    setInv(false);
  };

  const resume = () => {
    setPaused(false);
    setInv(false);
    setScen(false);
    worldRef.current?.setPaused(false);
    canvasRef.current?.requestPointerLock();
  };
  const closeInventory = () => {
    setInv(false);
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
  const doLens = (v: boolean) => {
    setLensing(v);
    worldRef.current?.setLensing(v);
  };
  const quit = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    onExit(); // effect cleanup disposes the engine
  };

  const inGame = phase === "playing";
  const showInventory = inGame && inv;
  const showPause = inGame && !inv && (paused || (!locked && hadLock) || death) && hadLock;
  const showEnter = inGame && !hadLock && !inv;

  const menuOptions: { id: MenuOption; label: string; value?: string }[] = [
    { id: "start", label: "START GAME" },
    { id: "sandbox", label: "SANDBOX MODE", value: sandbox ? "ON — cannot die" : "OFF — lethal" },
    { id: "graphics", label: "GRAPHICS", value: quality === 1 ? "LOW" : quality === 1.5 ? "MEDIUM" : "HIGH" },
    { id: "sound", label: "SOUND", value: sound ? "ON" : "OFF" },
    { id: "newworld", label: "NEW WORLD", value: "↻ reseed" },
    { id: "controls", label: "CONTROLS" },
  ];
  const menuAction = (id: MenuOption) => {
    if (id === "start") startGame();
    else if (id === "sandbox") toggleSandbox();
    else if (id === "graphics") cycleQuality();
    else if (id === "sound") toggleSound();
    else if (id === "newworld") newWorld();
    else if (id === "controls") setHelp((h) => !h);
  };

  // menu keyboard nav
  useEffect(() => {
    if (phase !== "menu") return;
    const onKey = (e: KeyboardEvent) => {
      if (help) { if (e.code === "Escape" || e.code === "KeyH") setHelp(false); return; }
      if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); setFocusIdx((i) => (i + 1) % menuOptions.length); }
      else if (e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); setFocusIdx((i) => (i - 1 + menuOptions.length) % menuOptions.length); }
      else if (e.code === "Enter") { e.preventDefault(); menuAction(menuOptions[focusIdx].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="endless-root">
      <canvas ref={canvasRef} className="endless-canvas" onPointerDown={() => {
        if (inGame && !document.pointerLockElement && !inv) canvasRef.current?.requestPointerLock();
      }} />

      {/* ── Main menu (No Man's Sky style, over the live world) ── */}
      {phase === "menu" && (
        <div className={`nms-menu ${booting ? "booting" : ""}`}>
          <div className="nms-panel">
            <div className="nms-eyebrow">The Planet Update · v2.1</div>
            <h1 className="nms-title">ENDLESS<br />POTENTIAL</h1>
            <p className="nms-sub">
              A whole planet: megacity, suburbs, towns, farmland, a thousand-metre mountain range,
              coast, desert — endless, and every one of its people alive, walking, talking back.
              Grab anything and hurl it. Somewhere downtown a ring of light opens onto another
              reality. Water floods, glass shatters, everything you break stays broken.
            </p>
            <div className="nms-list">
              {menuOptions.map((o, i) => (
                <button
                  key={o.id}
                  className={`nms-opt ${i === focusIdx ? "on" : ""}`}
                  onMouseEnter={() => setFocusIdx(i)}
                  onClick={() => menuAction(o.id)}>
                  <span className="nms-opt-label">{o.label}</span>
                  {o.value && <span className="nms-opt-value">{o.value}</span>}
                </button>
              ))}
            </div>
            <div className="nms-foot">
              <span>WORLD SEED <b>{seed}</b></span>
              <span>60 Hz RIGID CORE · SPH FLUID · PLANAR REFLECTIONS</span>
            </div>
          </div>
          {booting && <div className="nms-boot">FORMING WORLD…</div>}
        </div>
      )}

      {/* ── Help from the menu ── */}
      {phase === "menu" && help && (
        <div className="nms-help">
          <h3>Controls</h3>
          <div className="ep-help-grid">
            {CONTROLS.map((c) => (
              <div key={c.k} className="ep-help-row"><kbd>{c.k}</kbd><span>{c.a}</span></div>
            ))}
          </div>
          <button className="ep-btn" onClick={() => setHelp(false)}>Close</button>
        </div>
      )}

      {/* ── HUD ── */}
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
              <div className="ep-time">
                TIME ×{stats.timeScale}
                {sandbox && <span className="ep-sandbox"> · SANDBOX — CANNOT DIE</span>}
              </div>
            </div>

            <div className="ep-hud-tr">
              <button className="ep-icon-btn" title="Weather: clear" onClick={() => doWeather("clear")}>☀</button>
              <button className="ep-icon-btn" title="Weather: rain" onClick={() => doWeather("rain")}>🌧</button>
              <button className="ep-icon-btn" title="Weather: storm" onClick={() => doWeather("storm")}>⛈</button>
              <button className="ep-icon-btn" title="Gravitational lensing" onClick={() => doLens(!lensing)}>◍</button>
              <button className="ep-icon-btn" title="Inventory (I)" onClick={() => {
                setInv(true);
                worldRef.current?.setPaused(true);
                if (document.pointerLockElement) document.exitPointerLock();
              }}>🎒</button>
              <button className="ep-icon-btn" title="Sound" onClick={() => toggleSound()}>{sound ? "🔊" : "🔇"}</button>
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
                  title={`${t.label} — key ${slotKey(i)}`}>
                  <span className="ep-slot-glyph">{t.glyph}</span>
                  <span className="ep-slot-label">{t.label}</span>
                  <span className="ep-slot-key">{slotKey(i)}</span>
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

          {/* ── Enter prompt (first run) ── */}
          {showEnter && (
            <div className="ep-enter">
              <div className="ep-enter-card">
                <h2>The world is yours.</h2>
                <p>Click to take control. Move with WASD, and look around with your mouse.</p>
                <p className="ep-enter-dim">
                  Twelve tools in the hotbar (1–0, Q, X). Hold <b>RMB</b> to grab and throw.
                  Nine scenarios under <b>Scenarios</b>. Press <b>I</b> for the inventory.
                  Everything you break is real — and somewhere downtown, a ring of light
                  is waiting for you.
                </p>
              </div>
            </div>
          )}

          {/* ── Inventory ── */}
          {showInventory && (
            <div className="ep-inv">
              <div className="ep-inv-card">
                <div className="ep-inv-head">
                  <h2>Inventory</h2>
                  <button className="ep-icon-btn" title="Close (I)" onClick={closeInventory}>✕</button>
                </div>
                <div className="ep-inv-grid">
                  {INVENTORY.map((it, i) => (
                    <button key={it.id} className={`ep-inv-item ${i === toolIdx ? "on" : ""}`}
                      onClick={() => pickTool(i)}>
                      <span className="ep-inv-glyph">{HOTBAR[i].glyph}</span>
                      <span className="ep-inv-body">
                        <b>{it.name} <small className="ep-inv-key">[{slotKey(i)}]</small></b>
                        <small>{it.desc}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Pause ─ */}
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
                    <span>Sandbox mode (no death)</span>
                    <button className={`ep-mini ${sandbox ? "on" : ""}`} onClick={() => toggleSandbox()}>
                      {sandbox ? "on" : "off"}
                    </button>
                  </div>
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
                    <span>Graphics</span>
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
                    <button className={`ep-mini ${sound ? "on" : ""}`} onClick={() => toggleSound()}>
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

          {/* ── Help (non-paused) ── */}
          {help && !showPause && !showInventory && (
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
