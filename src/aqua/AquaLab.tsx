// AquaLab — the laboratory command deck: tools, scenarios, world controls,
// live telemetry, inspector and event log around the AquaWorld viewport.

import { useEffect, useRef, useState } from "react";
import {
  Activity, Box, Car, CircleDot, CloudLightning, CloudRain, Crosshair, Droplets,
  Eclipse, Eye, Flame, FlaskConical, Gauge, Hammer, Hand, Pause, Play, RotateCcw,
  Ship, Snowflake, StepForward, Sun, Thermometer, Tornado, Volume2, VolumeX,
  Waves, Wind, X, Zap, Camera, ChevronLeft, ChevronRight, Cpu,
} from "lucide-react";
import { AquaWorld, type CameraMode, type LabStats, type ScenarioId, type ToolId, type VizMode, type WeatherId } from "./AquaWorld";
import "./aqua.css";

interface LogEntry {
  msg: string;
  kind: string;
  t: number;
}

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof Hand }> = [
  { id: "hose", label: "Hose", icon: Droplets },
  { id: "push", label: "Push", icon: Hand },
  { id: "demolish", label: "Demolish", icon: Hammer },
  { id: "ignite", label: "Ignite", icon: Flame },
  { id: "water", label: "Fluid blob", icon: Waves },
  { id: "debris", label: "Debris", icon: Box },
  { id: "boat", label: "Boat", icon: Ship },
  { id: "car", label: "Car", icon: Car },
  { id: "portal", label: "Portal", icon: CircleDot },
  { id: "blackhole", label: "Black hole", icon: Eclipse },
  { id: "whirlpool", label: "Whirlpool", icon: Tornado },
  { id: "inspect", label: "Inspect", icon: Crosshair },
];

const FLUIDS = ["water", "saltwater", "oil", "lava", "mud", "cryo"];

const SCENARIOS: Array<{ id: ScenarioId; label: string; hot?: boolean }> = [
  { id: "dam", label: "Breach dam", hot: true },
  { id: "flood", label: "Megaflood", hot: true },
  { id: "storm", label: "Superstorm" },
  { id: "tsunami", label: "Tsunami", hot: true },
  { id: "whirlpool", label: "Whirlpool" },
  { id: "blackhole", label: "Singularity" },
  { id: "portal", label: "Portal river" },
  { id: "meteor", label: "Meteor", hot: true },
  { id: "quake", label: "Earthquake", hot: true },
  { id: "freeze", label: "Deep freeze" },
  { id: "reset", label: "Reset world" },
];

const SPEEDS = [0.1, 0.25, 1, 2, 4];

export function AquaLab({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<AquaWorld | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<LabStats | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>("hose");
  const [fluid, setFluid] = useState("water");
  const [weather, setWeather] = useState<WeatherId>("clear");
  const [camMode, setCamMode] = useState<CameraMode>("orbit");
  const [viz, setViz] = useState<VizMode>("fluid");
  const [timeScale, setTimeScale] = useState(1);
  const [paused, setPaused] = useState(false);
  const [extreme, setExtreme] = useState(false);
  const [lensing, setLensing] = useState(true);
  const [sound, setSound] = useState(true);
  const [gravity, setGravity] = useState(1);
  const [ambient, setAmbient] = useState(18);
  const [wind, setWind] = useState(4);
  const [flood, setFlood] = useState(-50);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [engine, setEngineState] = useState<"sph" | "flip">("sph");
  const [flip, setFlip] = useState({ grid: 96, iter: 20, ratio: 0.85, vort: 1.5, refr: 1.0, ext: 1.35, blur: 1.0, fres: 3.0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const world = new AquaWorld(canvas, {
      onStats: (s) => { if (!disposed) setStats(s); },
      onLog: (msg, kind) => {
        if (disposed) return;
        setLog((prev) => [...prev.slice(-59), { msg, kind, t: Date.now() }]);
      },
      onSelect: (info) => { if (!disposed) setSelection(info); },
    });
    worldRef.current = world;
    world.init()
      .then(() => { if (!disposed) setReady(true); })
      .catch((err) => {
        if (!disposed) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  const w = () => worldRef.current;

  const pickTool = (t: ToolId) => { setTool(t); w()?.setTool(t); };
  const pickFluid = (f: string) => { setFluid(f); w()?.setFluid(f); };
  const pickWeather = (x: WeatherId) => { setWeather(x); w()?.setWeather(x); };
  const pickCam = (m: CameraMode) => { setCamMode(m); w()?.setCameraMode(m); };
  const pickViz = (v: VizMode) => { setViz(v); w()?.setViz(v); };
  const pickSpeed = (s: number) => { setTimeScale(s); setPaused(false); w()?.setPaused(false); w()?.setTimeScale(s); };
  const togglePause = () => { setPaused((p) => { w()?.setPaused(!p); return !p; }); };
  const toggleExtreme = () => { setExtreme((v) => { w()?.setExtreme(!v); return !v; }); };
  const pickEngine = () => { setEngineState("flip"); w()?.setEngine("flip"); };
  const flipSolve = (k: "grid" | "iter" | "ratio" | "vort", v: number) => {
    setFlip((p) => ({ ...p, [k]: v }));
    if (k === "grid") w()?.setFlipSettings({ grid: v });
    else if (k === "iter") w()?.setFlipSettings({ pressureIter: v });
    else if (k === "ratio") w()?.setFlipSettings({ flipRatio: v });
    else w()?.setFlipSettings({ vorticity: v });
  };
  const flipRender = (k: "refr" | "ext" | "blur" | "fres", v: number) => {
    setFlip((p) => ({ ...p, [k]: v }));
    if (k === "refr") w()?.setFlipRender({ refraction: v });
    else if (k === "ext") w()?.setFlipRender({ extinction: v });
    else if (k === "blur") w()?.setFlipRender({ blur: v });
    else w()?.setFlipRender({ fresnelPow: v });
  };
  const toggleLensing = () => { setLensing((v) => { w()?.setLensing(!v); return !v; }); };
  const toggleSound = () => { setSound((v) => { w()?.setSound(!v); return !v; }); };

  return (
    <div className="aqua-lab">
      <canvas ref={canvasRef} className="aqua-canvas" />

      {!ready && (
        <div className="aqua-loading">
          <div className="aqua-loading__core">
            <span className="aqua-loading__ring" />
            <strong>AQUA LAB</strong>
            <small>{loadError ? `FAILED: ${loadError}` : "INITIALIZING PHYSICS CORE / WASM / FLUIDS…"}</small>
          </div>
        </div>
      )}

      {/* top command bar */}
      <header className="aqua-topbar">
        <div className="aqua-brand">
          <Waves size={16} />
          <strong>AQUA LAB</strong>
          <span>EXTREME WATER &amp; PHYSICS ENGINE</span>
        </div>
        <div className="aqua-time">
          <button className={paused ? "is-active" : ""} onClick={togglePause} title="Pause / resume (Space)">
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          {SPEEDS.map((s) => (
            <button key={s} className={!paused && timeScale === s ? "is-active" : ""} onClick={() => pickSpeed(s)}>
              {s}×
            </button>
          ))}
          <button onClick={() => w()?.stepOnce()} title="Step one frame">
            <StepForward size={14} />
          </button>
        </div>
        <div className="aqua-topactions">
          <button onClick={() => w()?.runDiagnostics()} title="Run engine self-tests">
            <FlaskConical size={14} /> TESTS
          </button>
          <button onClick={onExit} title="Back to menu">
            <X size={14} /> EXIT
          </button>
        </div>
      </header>

      {/* left dock */}
      <button className={`aqua-docktab aqua-docktab--left ${leftOpen ? "is-open" : ""}`} onClick={() => setLeftOpen((v) => !v)}>
        {leftOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      <aside className={`aqua-dock aqua-dock--left ${leftOpen ? "is-open" : ""}`}>
        <section>
          <h4><Cpu size={11} /> FLUID ENGINE</h4>
          <div className="aqua-chips">
            <button className={engine === "sph" ? "is-active" : ""} disabled={engine === "flip"}
              title="PBF-SPH particles (WebGL). One-way switch — exit the lab to come back.">
              SPH · PBF
            </button>
            <button className={engine === "flip" ? "is-active is-hot" : ""} disabled={engine === "flip"}
              onClick={pickEngine}
              title="3D MAC grid Navier-Stokes on WebGPU compute — hybrid FLIP/PIC, red-black GS pressure, screen-space refraction.">
              FLIP · WebGPU
            </button>
          </div>
          {engine === "flip" && (
            <>
              <div className="aqua-chips" style={{ marginTop: 6 }} title="Bulk FLIP fluid releases">
                {(["water", "lava", "oil", "ice", "steam"] as const).map((k) => (
                  <button key={k} onClick={() => w()?.flipSpawnFluid(k)}>{k}</button>
                ))}
                <button onClick={() => w()?.flipSpawnFluid("clear")}>clear</button>
              </div>
              <label className="aqua-slider">
                <span>Grid {flip.grid}³</span>
                <input type="range" min={48} max={128} step={16} value={flip.grid}
                  onChange={(e) => flipSolve("grid", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Pressure iters {flip.iter}</span>
                <input type="range" min={4} max={48} step={1} value={flip.iter}
                  onChange={(e) => flipSolve("iter", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>FLIP ratio {flip.ratio.toFixed(2)}</span>
                <input type="range" min={0} max={1} step={0.05} value={flip.ratio}
                  onChange={(e) => flipSolve("ratio", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Vorticity {flip.vort.toFixed(1)}</span>
                <input type="range" min={0} max={4} step={0.1} value={flip.vort}
                  onChange={(e) => flipSolve("vort", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Refraction {flip.refr.toFixed(2)}</span>
                <input type="range" min={0} max={3} step={0.05} value={flip.refr}
                  onChange={(e) => flipRender("refr", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Extinction {flip.ext.toFixed(2)}</span>
                <input type="range" min={0} max={3} step={0.05} value={flip.ext}
                  onChange={(e) => flipRender("ext", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Bilateral blur {flip.blur.toFixed(2)}</span>
                <input type="range" min={0} max={3} step={0.05} value={flip.blur}
                  onChange={(e) => flipRender("blur", Number(e.target.value))} />
              </label>
              <label className="aqua-slider">
                <span>Fresnel power {flip.fres.toFixed(1)}</span>
                <input type="range" min={1} max={8} step={0.5} value={flip.fres}
                  onChange={(e) => flipRender("fres", Number(e.target.value))} />
              </label>
            </>
          )}
        </section>
        <section>
          <h4><Zap size={11} /> SPAWN TOOLS</h4>
          <div className="aqua-tools">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={tool === t.id ? "is-active" : ""} onClick={() => pickTool(t.id)} title={t.label}>
                  <Icon size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <h4><Droplets size={11} /> HOSE / BLOB FLUID</h4>
          <div className="aqua-chips">
            {FLUIDS.map((f) => (
              <button key={f} className={fluid === f ? "is-active" : ""} onClick={() => pickFluid(f)}>{f}</button>
            ))}
          </div>
        </section>
        {engine === "sph" ? (
          <section>
            <h4><Activity size={11} /> CATASTROPHIC SCENARIOS</h4>
            <div className="aqua-scenarios">
              {SCENARIOS.map((s) => (
                <button key={s.id} className={s.hot ? "is-hot" : ""} onClick={() => w()?.runScenario(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <h4><Activity size={11} /> FLIP SCENARIOS</h4>
            <div className="aqua-scenarios">
              <button className="is-hot" onClick={() => w()?.flipSpawnFluid("water")}>Basin release</button>
              <button className="is-hot" onClick={() => { w()?.flipSpawnFluid("lava"); w()?.flipSpawnFluid("water"); }}>Lava × water</button>
              <button onClick={() => { w()?.flipSpawnFluid("oil"); w()?.flipSpawnFluid("water"); }}>Oil slick</button>
              <button onClick={() => w()?.flipSpawnFluid("ice")}>Ice calving</button>
              <button className="is-hot" onClick={() => { w()?.runScenario("blackhole"); w()?.flipSpawnFluid("water"); }}>Singularity drain</button>
              <button onClick={() => w()?.flipSpawnFluid("clear")}>Reset fluid</button>
            </div>
          </section>
        )}
        <section>
          <h4><Gauge size={11} /> WORLD PHYSICS</h4>
          <div className="aqua-weather">
            <button className={weather === "clear" ? "is-active" : ""} onClick={() => pickWeather("clear")} title="Clear"><Sun size={14} /></button>
            <button className={weather === "rain" ? "is-active" : ""} onClick={() => pickWeather("rain")} title="Rain"><CloudRain size={14} /></button>
            <button className={weather === "storm" ? "is-active" : ""} onClick={() => pickWeather("storm")} title="Storm"><CloudLightning size={14} /></button>
            <button className={weather === "snow" ? "is-active" : ""} onClick={() => pickWeather("snow")} title="Snow"><Snowflake size={14} /></button>
          </div>
          <label className="aqua-slider">
            <span><Gauge size={11} /> Gravity {gravity.toFixed(1)}g</span>
            <input type="range" min={0} max={2.5} step={0.1} value={gravity}
              onChange={(e) => { const v = Number(e.target.value); setGravity(v); w()?.setGravity(v); }} />
          </label>
          <label className="aqua-slider">
            <span><Thermometer size={11} /> Ambient {ambient.toFixed(0)}°C</span>
            <input type="range" min={-35} max={45} step={1} value={ambient}
              onChange={(e) => { const v = Number(e.target.value); setAmbient(v); w()?.setAmbientC(v); }} />
          </label>
          <label className="aqua-slider">
            <span><Wind size={11} /> Wind {wind.toFixed(0)} m/s</span>
            <input type="range" min={0} max={32} step={1} value={wind}
              onChange={(e) => { const v = Number(e.target.value); setWind(v); w()?.setWind(v); }} />
          </label>
          <label className="aqua-slider">
            <span><Waves size={11} /> Flood {flood <= -20 ? "off" : `${flood.toFixed(1)}m`}</span>
            <input type="range" min={-50} max={14} step={0.5} value={flood}
              onChange={(e) => { const v = Number(e.target.value); setFlood(v); w()?.setFloodTarget(v); }} />
          </label>
        </section>
        <section>
          <h4><Camera size={11} /> CAMERA &amp; VISION</h4>
          <div className="aqua-chips">
            {(["orbit", "fly", "follow"] as CameraMode[]).map((m) => (
              <button key={m} className={camMode === m ? "is-active" : ""} onClick={() => pickCam(m)}>{m}</button>
            ))}
          </div>
          <div className="aqua-chips" style={{ marginTop: 6 }}>
            {(["fluid", "velocity", "pressure", "temperature"] as VizMode[]).map((v) => (
              <button key={v} className={viz === v ? "is-active" : ""} onClick={() => pickViz(v)} title="Scientific visualization">
                <Eye size={10} /> {v.slice(0, 4)}
              </button>
            ))}
          </div>
          <div className="aqua-toggles">
            <button className={extreme ? "is-active is-extreme" : ""} onClick={toggleExtreme}>
              {extreme ? "EXTREME ●" : "EXTREME ○"}
            </button>
            <button className={lensing ? "is-active" : ""} onClick={toggleLensing}>LENSING</button>
            <button className={sound ? "is-active" : ""} onClick={toggleSound}>
              {sound ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
          </div>
        </section>
      </aside>

      {/* right dock */}
      <button className={`aqua-docktab aqua-docktab--right ${rightOpen ? "is-open" : ""}`} onClick={() => setRightOpen((v) => !v)}>
        {rightOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      <aside className={`aqua-dock aqua-dock--right ${rightOpen ? "is-open" : ""}`}>
        <section>
          <h4><Activity size={11} /> TELEMETRY</h4>
          <div className="aqua-stats">
            <span><small>FPS</small><b>{stats?.fps ?? "—"}</b></span>
            <span><small>SIM MS</small><b>{stats ? stats.simMs.toFixed(1) : "—"}</b></span>
            <span><small>PARTICLES</small><b>{stats?.particles ?? "—"}</b></span>
            <span><small>BODIES</small><b>{stats?.bodies ?? "—"}</b></span>
            <span><small>WATER m³</small><b>{stats ? stats.volume.toFixed(0) : "—"}</b></span>
            <span><small>MAX V</small><b>{stats ? `${stats.maxSpeed.toFixed(1)}` : "—"}</b></span>
            <span><small>TIER</small><b>T{stats?.tier ?? "—"} {stats?.quality ?? ""}</b></span>
            <span><small>DRAWS</small><b>{stats?.calls ?? "—"}</b></span>
          </div>
        </section>
        <section>
          <h4><Crosshair size={11} /> INSPECTOR</h4>
          {selection ? (
            <pre className="aqua-inspect">{selection}</pre>
          ) : (
            <p className="aqua-hint">Select the Inspect tool and click any body, building or vehicle. Backspace removes the selection.</p>
          )}
        </section>
        <section className="aqua-logwrap">
          <h4><FlaskConical size={11} /> EVENT LOG</h4>
          <div className="aqua-log">
            {log.length === 0 && <p className="aqua-hint">Simulation events, collapses and test results appear here.</p>}
            {log.map((l, i) => (
              <p key={`${l.t}-${i}`} className={`aqua-log__line aqua-log__line--${l.kind}`}>{l.msg}</p>
            ))}
          </div>
        </section>
        <section>
          <button className="aqua-reset" onClick={() => w()?.runScenario("reset")}>
            <RotateCcw size={13} /> RESET WORLD
          </button>
        </section>
      </aside>

      {/* bottom hints */}
      <footer className="aqua-hints">
        <span><b>LMB</b> tool</span>
        <span><b>RMB drag</b> orbit</span>
        <span><b>Wheel</b> zoom</span>
        <span><b>WASD</b> move</span>
        <span><b>Space</b> pause</span>
        <span><b>V</b> camera</span>
      </footer>
    </div>
  );
}
