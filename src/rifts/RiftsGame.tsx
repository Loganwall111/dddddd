/* RIFTBOUND — UI shell: menu, HUD, hotbar, pause, down-screen. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiftsWorld, type RiftsStats } from "./riftsWorld";
import { HOTBAR_BLOCKS, BLOCKS, makeAtlas } from "./voxel";
import "./rifts.css";

const DIM_NAMES: Record<string, string> = {
  prime: "THE WORLD BETWEEN",
  rainbow: "THE DREAM — ANOTHER PLACE",
};

function tilePreview(tileIdx: number): string {
  const { data, w } = makeAtlas().texture;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const g = cv.getContext("2d")!;
  const tx = (tileIdx % 8) * 16, ty = Math.floor(tileIdx / 8) * 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const q = data[(ty + y) * w + tx + x];
    g.fillStyle = `rgb(${q[0]},${q[1]},${q[2]})`;
    g.fillRect(x, y, 1, 1);
  }
  return cv.toDataURL();
}

export default function RiftsGame({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<RiftsWorld | null>(null);
  const [phase, setPhase] = useState<"menu" | "play">("menu");
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<RiftsStats | null>(null);
  const [hot, setHot] = useState(0);
  const [log, setLog] = useState<{ id: number; msg: string; kind: string }[]>([]);
<<<<<<< HEAD
=======
  const [engineError, setEngineError] = useState<string | null>(null);
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
  const logId = useRef(0);

  const previews = useMemo(() => HOTBAR_BLOCKS.map((b) => tilePreview(BLOCKS[b].tiles[1])), []);

  const pushLog = useCallback((msg: string, kind: string) => {
    const id = ++logId.current;
    setLog((l) => [...l.slice(-3), { id, msg, kind }]);
    setTimeout(() => setLog((l) => l.filter((e) => e.id !== id)), 5000);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new RiftsWorld(canvas, {
      onStats: setStats,
      onLog: pushLog,
      onDown: () => setPaused(false),
<<<<<<< HEAD
=======
      onError: setEngineError,
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)
    });
    worldRef.current = world;
    void world.init();
    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, [pushLog]);

  // pause when pointer lock is lost mid-game
  useEffect(() => {
    const onLock = () => {
      if (phase === "play" && !document.pointerLockElement) {
        setPaused(true);
        worldRef.current?.setPaused(true);
      }
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [phase]);

  const start = (m: "creative" | "survival") => {
    worldRef.current?.setMode(m);
    worldRef.current?.begin(m);
    setPhase("play");
    setPaused(false);
  };
  const resume = () => {
    setPaused(false);
    worldRef.current?.setPaused(false);
  };
  const quit = () => {
    setPhase("menu");
    setPaused(false);
    worldRef.current?.setPaused(false);
    worldRef.current?.toMenu();
  };

  const playing = phase === "play";
  const down = !!stats?.down;

  return (
    <div className="rb-root">
      <canvas ref={canvasRef} className="rb-canvas" />
<<<<<<< HEAD
=======
      {engineError && (
        <div className="rb-error">
          <div className="rb-error-title">ENGINE ERROR</div>
          <pre>{engineError.split("\n").slice(0, 8).join("\n")}</pre>
        </div>
      )}
>>>>>>> 0e80b88 (Fix black screen: mesher crashed on every face next to air; add lakes)

      {playing && !paused && !down && (
        <div className="rb-hud">
          <div className="rb-info">
            <div className="rb-dim">{DIM_NAMES[stats?.dim ?? "prime"]}</div>
            <div className="rb-sub">
              {stats ? `${stats.fps} fps · x ${stats.x.toFixed(0)} y ${stats.y.toFixed(0)} z ${stats.z.toFixed(0)}` : ""}
            </div>
            <div className="rb-sub">
              {stats?.mode.toUpperCase()} · {stats?.third ? "THIRD PERSON" : "FIRST PERSON"}{stats?.flying ? " · FLYING" : ""}
            </div>
            {stats?.mode === "survival" && (
              <div className="rb-hp"><i style={{ width: `${(stats.hp / 20) * 100}%` }} /></div>
            )}
          </div>

          <div className="rb-log">
            {log.map((e) => <div key={e.id} className={`rb-log-line ${e.kind}`}>{e.msg}</div>)}
          </div>

          <div className="rb-crosshair">+</div>

          <div className="rb-hint">
            E — use the Gate · V — camera · F — fly (creative) · 1–8 / wheel — blocks · LMB break · RMB place
          </div>

          <div className="rb-hotbar">
            {HOTBAR_BLOCKS.map((b, i) => (
              <button key={b} className={`rb-slot ${i === hot ? "on" : ""}`}
                onClick={() => { setHot(i); worldRef.current?.setHot(i); }}
                title={BLOCKS[b].name}>
                <span className="rb-slot-tile" style={{ backgroundImage: `url(${previews[i]})` }} />
                <span className="rb-slot-key">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {playing && down && (
        <div className="rb-down">
          <div className="rb-down-card">
            <h2>You are down.</h2>
            <p>The Dream keeps moving. Press <b>R</b> to rise again.</p>
          </div>
        </div>
      )}

      {playing && paused && (
        <div className="rb-pause">
          <div className="rb-pause-card">
            <h2>Paused</h2>
            <div className="rb-pause-row">
              <button className="rb-btn rb-btn-primary" onClick={resume}>Resume</button>
              <button className="rb-btn" onClick={quit}>Back to Title</button>
            </div>
            <p className="rb-pause-dim">
              WASD move · Space jump · Shift sprint · LMB break · RMB place · E the Gate ·
              V first/third person · F fly (creative) · 1–8 + wheel blocks
            </p>
          </div>
        </div>
      )}

      {phase === "menu" && (
        <div className="rb-menu">
          <div className="rb-menu-card">
            <div className="rb-eyebrow">A voxel world torn in two</div>
            <h1 className="rb-title">RIFT<span>BOUND</span></h1>
            <p className="rb-sub">
              A foggy world of blocky skies and square clouds. A glowing rift tears the horizon,
              lightning crawling across its stepped edges. A gate of cyan pixels stands open —
              behind it, the Dream: pastel water, floating isles, candy light.
              Break it. Build it. Wander both sides.
            </p>
            <div className="rb-menu-row">
              <button className="rb-btn rb-btn-primary" onClick={() => start("creative")}>PLAY — CREATIVE</button>
              <button className="rb-btn" onClick={() => start("survival")}>PLAY — SURVIVAL</button>
            </div>
            <div className="rb-menu-foot">
              <span>FIRST + THIRD PERSON · GROUND-LOCKED CAMERA · INFINITE CHUNKS</span>
              <button className="rb-link" onClick={onExit}>← back to Lumital</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
