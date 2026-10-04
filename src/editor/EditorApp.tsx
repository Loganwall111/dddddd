/* SIFT FORGE — dark, Unreal-class asset & scene editor for the Sift set.   */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, TransformControls, Grid } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  BLOCKS, BLOCK_CATEGORIES, BIOMES, MOBS, RIFT_STYLES, SKIES, VFX_DEFS,
  blockById, mobById, nextUid, type Placed, type Vec3,
} from "../sift/core";
import { BlockMesh } from "../sift/Blocks";
import { MobMesh } from "../sift/Mobs";
import { Rift } from "../sift/Rift";
import { SkyDome, VfxItem } from "../sift/VFX";
import { SCENE_PRESETS } from "../sift/scenes";
import { exportGLB, exportOBJ, exportSceneJSON, exportMinecraftPack, exportPNG } from "../sift/exporters";

interface EditorSettings {
  skyId: string; fog: number; bloom: number; ribbons: number; snap: boolean; showGrid: boolean;
  anims: boolean; quality: "high" | "medium" | "low";
}
const defaultSettings: EditorSettings = { skyId: "sift_day", fog: 0.012, bloom: 0.9, ribbons: 1, snap: true, showGrid: true, anims: true, quality: "high" };

type Tool = "select" | "place" | "erase" | "orbit" | "biome";

export function EditorApp({ onExit }: { onExit: () => void }) {
  const [items, setItems] = useState<Placed[]>(() => SCENE_PRESETS[0].build());
  const [selected, setSelected] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [placing, setPlacing] = useState<{ kind: Placed["kind"]; id: string } | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(defaultSettings);
  const [tab, setTab] = useState<"blocks" | "mobs" | "rifts" | "vfx" | "scenes">("blocks");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [activeBiome, setActiveBiome] = useState(BIOMES[0].id);
  const [stats, setStats] = useState({ fps: 0, tris: 0 });
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gizmo, setGizmo] = useState<"translate" | "rotate" | "scale">("translate");

  const pushUndo = useCallback((current: Placed[]) => {
    undoStack.current.push(JSON.stringify(current));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const mutate = useCallback((fn: (prev: Placed[]) => Placed[]) => {
    setItems((prev) => {
      pushUndo(prev);
      return fn(prev);
    });
  }, [pushUndo]);

  const undo = useCallback(() => {
    setItems((prev) => {
      const u = undoStack.current.pop();
      if (u == null) return prev;
      redoStack.current.push(JSON.stringify(prev));
      return JSON.parse(u);
    });
    setSelected(null);
  }, []);
  const redo = useCallback(() => {
    setItems((prev) => {
      const r = redoStack.current.pop();
      if (r == null) return prev;
      undoStack.current.push(JSON.stringify(prev));
      return JSON.parse(r);
    });
    setSelected(null);
  }, []);

  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSel(); }
      if (e.key === "Delete" || e.key === "Backspace") deleteSel();
      if (e.key === "Escape") { setPlacing(null); setSelected(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selected_item = items.find((i) => i.uid === selected) || null;

  const updateSelected = (patch: Partial<Placed>) => {
    if (selected == null) return;
    setItems((prev) => prev.map((i) => (i.uid === selected ? { ...i, ...patch } : i)));
  };

  const deleteSel = () => {
    if (selected == null) return;
    mutate((p) => p.filter((i) => i.uid !== selected));
    setSelected(null);
  };
  const duplicateSel = () => {
    if (selected == null) return;
    setItems((prev) => {
      pushUndo(prev);
      const src = prev.find((i) => i.uid === selected);
      if (!src) return prev;
      const copy = { ...src, uid: nextUid(), pos: [src.pos[0] + 1, src.pos[1], src.pos[2] + 1] as Vec3 };
      setSelected(copy.uid);
      return [...prev, copy];
    });
  };

  const loadScene = (id: string) => {
    const preset = SCENE_PRESETS.find((s) => s.id === id);
    if (!preset) return;
    mutate(() => preset.build());
    setSettings((s) => ({ ...s, skyId: preset.sky }));
    setSelected(null);
    say(`Scene loaded — ${preset.name}`);
  };

  const sky = SKIES.find((s) => s.id === settings.skyId) || SKIES[0];

  return (
    <div className="forge-root">
      {/* ── top toolbar ── */}
      <header className="forge-top">
        <button className="forge-exit" onClick={onExit} title="Back to hub">⌂</button>
        <div className="forge-brand">
          <span className="forge-logo">◈ SIFT&nbsp;FORGE</span>
          <span className="forge-slogan">forge the rift — original rift-dimension toolkit</span>
        </div>
        <div className="forge-tools">
          {(["select", "place", "erase", "biome", "orbit"] as Tool[]).map((t) => (
            <button key={t} className={`forge-btn ${tool === t ? "on" : ""}`}
              onClick={() => { setTool(t); if (t !== "place") setPlacing(null); }}>
              {t === "select" ? "Select" : t === "place" ? "Place" : t === "erase" ? "Erase" : t === "biome" ? "Biome" : "Orbit"}
            </button>
          ))}
          {tool === "biome" && (
            <select className="forge-biomeselect" value={activeBiome} onChange={(e) => setActiveBiome(e.target.value)}
              style={{ background: "#151b21", color: "#d7e2e8", border: "1px solid #232c35", borderRadius: 8, padding: "6px 8px" }}>
              {BIOMES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <span className="forge-sep" />
          <button className="forge-btn" onClick={undo} title="Ctrl+Z">↶</button>
          <button className="forge-btn" onClick={redo} title="Ctrl+Shift+Z">↷</button>
          <button className={`forge-btn ${settings.snap ? "on" : ""}`} onClick={() => setSettings((s) => ({ ...s, snap: !s.snap }))}>Snap</button>
          <button className={`forge-btn ${settings.showGrid ? "on" : ""}`} onClick={() => setSettings((s) => ({ ...s, showGrid: !s.showGrid }))}>Grid</button>
          <button className={`forge-btn ${settings.anims ? "on" : ""}`} onClick={() => setSettings((s) => ({ ...s, anims: !s.anims }))}>Anim</button>
          <span className="forge-sep" />
          <button className="forge-btn" onClick={() => setPreview((p) => !p)}>{preview ? "■ Stop" : "▶ Cinematic"}</button>
          <button className="forge-btn" title="Save scene to browser" onClick={() => { localStorage.setItem("siftforge.scene.v1", JSON.stringify(items)); say("Scene saved"); }}>💾</button>
          <button className="forge-btn" title="Load saved scene" onClick={() => { const s = localStorage.getItem("siftforge.scene.v1"); if (!s) { say("No saved scene yet"); return; } pushUndo(items); setItems(JSON.parse(s)); say("Saved scene loaded"); }}>📂</button>
          <button className="forge-btn" onClick={() => canvasRef.current && exportPNG(canvasRef.current)}>📷</button>
          <div className="forge-exportwrap">
            <button className="forge-btn accent" onClick={() => setExportOpen((o) => !o)}>⬇ Export</button>
            {exportOpen && (
              <div className="forge-menu" onMouseLeave={() => setExportOpen(false)}>
                <button onClick={() => { exportGLB(items); say("Exporting .glb …"); }}>GLB (any engine — Unity/Godot/UE)</button>
                <button onClick={() => { exportOBJ(items); say("Exporting .obj …"); }}>OBJ mesh</button>
                <button onClick={() => { exportSceneJSON(items); say("Scene JSON saved"); }}>Scene JSON</button>
                <button onClick={() => { exportMinecraftPack(items).then(() => say("Fabric pack zip downloaded")); }}>Minecraft pack (Fabric 1.21.4+/26.x)</button>
                <button onClick={() => canvasRef.current && exportPNG(canvasRef.current)}>PNG snapshot</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="forge-body">
        {/* ── library ── */}
        <aside className="forge-lib">
          <div className="forge-tabs">
            {(["blocks", "mobs", "rifts", "vfx", "scenes"] as const).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setPlacing(null); }}>
                {t === "vfx" ? "VFX" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <input className="forge-search" placeholder="search assets…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {tab === "blocks" && (
            <div className="forge-cats">
              {BLOCK_CATEGORIES.map((c) => (
                <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
          )}
          <div className="forge-list">
            {tab === "blocks" && BLOCKS
              .filter((b) => (cat === "All" || b.cat === cat) && b.name.toLowerCase().includes(search.toLowerCase()))
              .map((b) => (
                <button key={b.id} className="forge-item" onClick={() => setPlacing({ kind: "block", id: b.id })}>
                  <i style={{ background: b.emissive ? b.glowColor : undefined }} className={b.emissive ? "glowchip" : "chip"} />
                  <span>{b.name}</span><em>{b.cat}</em>
                </button>
              ))}
            {tab === "mobs" && MOBS.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).map((m) => (
              <button key={m.id} className="forge-item" title={m.desc} onClick={() => setPlacing({ kind: "mob", id: m.id })}>
                <i className="chip mob" /><span>{m.name}</span><em>{m.hostile ? "hostile" : "passive"}</em>
              </button>
            ))}
            {tab === "rifts" && RIFT_STYLES.map((r) => (
              <button key={r.id} className="forge-item" onClick={() => setPlacing({ kind: "rift", id: r.id })}>
                <i className="chip" style={{ background: r.inner, boxShadow: `0 0 10px ${r.inner}` }} /><span>{r.name}</span><em>rift</em>
              </button>
            ))}
            {tab === "vfx" && VFX_DEFS.map((v) => (
              <button key={v.id} className="forge-item" title={v.desc} onClick={() => setPlacing({ kind: "vfx", id: v.id })}>
                <i className="chip vfx" /><span>{v.name}</span><em>vfx</em>
              </button>
            ))}
            {tab === "scenes" && SCENE_PRESETS.map((s) => (
              <button key={s.id} className="forge-item scene" onClick={() => loadScene(s.id)}>
                <span>{s.name}</span><em>{s.desc}</em>
              </button>
            ))}
          </div>
          <div className="forge-libfoot">
            {BLOCKS.length} blocks · {MOBS.length} creatures · {RIFT_STYLES.length} rift styles · {VFX_DEFS.length} vfx · {SCENE_PRESETS.length} scenes
          </div>
        </aside>

        {/* ── viewport ── */}
        <main className="forge-view">
          <Canvas shadows dpr={settings.quality === "high" ? [1, 2] : 1} camera={{ position: [14, 10, 16], fov: 55 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={({ gl }) => { canvasRef.current = gl.domElement; }}>
            <Viewport
              items={items} selected={selected} setSelected={setSelected}
              tool={tool} placing={placing} setPlacing={setPlacing}
              settings={settings} setItems={setItems} pushUndo={pushUndo}
              gizmo={gizmo} preview={preview} onStats={setStats} activeBiome={activeBiome}
            />
          </Canvas>
          {placing && <div className="forge-hint">Placing <b>{placing.id}</b> — click ground · Esc to stop</div>}
          {toast && <div className="forge-toast">{toast}</div>}
          <div className="forge-status">
            <span>{items.length} objects</span><span>{stats.fps} fps</span><span>{(stats.tris / 1000).toFixed(0)}k tris</span>
            <span className="grow" />
            <span>{sky.name}</span>
          </div>
        </main>

        {/* ── inspector ── */}
        <aside className="forge-insp">
          <h3>INSPECTOR</h3>
          {selected_item ? (
            <div className="forge-props">
              <div className="forge-proprow title">
                <b>{selected_item.kind === "block" ? blockById(selected_item.id)?.name : selected_item.id}</b>
                <span>{selected_item.kind}</span>
              </div>
              <div className="forge-gizmomodes">
                {(["translate", "rotate", "scale"] as const).map((g) => (
                  <button key={g} className={gizmo === g ? "on" : ""} onClick={() => setGizmo(g)}>{g[0].toUpperCase() + g.slice(1)}</button>
                ))}
              </div>
              {(["pos", "rot", "scale"] as const).map((axis) => (
                <div key={axis} className="forge-vec">
                  <label>{axis}</label>
                  {[0, 1, 2].map((i) => (
                    <input key={i} type="number" step={axis === "rot" ? 0.1 : 0.5}
                      value={Number((selected_item as any)[axis === "pos" ? "pos" : axis][i].toFixed(2))}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        const key = axis as "pos" | "rot" | "scale";
                        const arr = [...selected_item[key]] as Vec3;
                        arr[i] = axis === "rot" ? v : v;
                        updateSelected({ [key]: arr } as any);
                      }} />
                  ))}
                </div>
              ))}
              {selected_item.kind === "block" && (
                <label className="forge-slider">
                  emissive ×<input type="range" min={0} max={3} step={0.1}
                    value={selected_item.emissive ?? 1}
                    onChange={(e) => updateSelected({ emissive: parseFloat(e.target.value) })} />
                </label>
              )}
              {selected_item.kind === "rift" && (
                <>
                  <label className="forge-slider">tear timeline
                    <input type="range" min={0} max={1} step={0.01}
                      value={selected_item.tear ?? 1}
                      onChange={(e) => updateSelected({ tear: parseFloat(e.target.value), animated: false })} />
                  </label>
                  <div className="forge-tearrow">
                    <button onClick={() => updateSelected({ tear: undefined, animated: true })}>▶ replay tear</button>
                  </div>
                </>
              )}
              <label className="forge-check">
                <input type="checkbox" checked={selected_item.animated !== false}
                  onChange={(e) => updateSelected({ animated: e.target.checked })} /> animate
              </label>
              <div className="forge-actions">
                <button onClick={duplicateSel}>Duplicate</button>
                <button className="danger" onClick={deleteSel}>Delete</button>
              </div>
            </div>
          ) : (
            <p className="forge-empty">Select an object, or pick an asset on the left and click the ground to place it.</p>
          )}

          <h3>WORLD</h3>
          <div className="forge-props">
            <label className="forge-select">sky
              <select value={settings.skyId} onChange={(e) => setSettings((s) => ({ ...s, skyId: e.target.value }))}>
                {SKIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="forge-slider">fog<input type="range" min={0} max={0.05} step={0.001} value={settings.fog}
              onChange={(e) => setSettings((s) => ({ ...s, fog: parseFloat(e.target.value) }))} /></label>
            <label className="forge-slider">bloom<input type="range" min={0} max={2.5} step={0.05} value={settings.bloom}
              onChange={(e) => setSettings((s) => ({ ...s, bloom: parseFloat(e.target.value) }))} /></label>
            <label className="forge-slider">aurora ribbons<input type="range" min={0} max={2} step={0.05} value={settings.ribbons}
              onChange={(e) => setSettings((s) => ({ ...s, ribbons: parseFloat(e.target.value) }))} /></label>
            <label className="forge-select">quality
              <select value={settings.quality} onChange={(e) => setSettings((s) => ({ ...s, quality: e.target.value as any }))}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ═══════════════ 3D viewport ═══════════════ */
function Viewport(props: {
  items: Placed[]; selected: number | null; setSelected: (n: number | null) => void;
  tool: Tool; placing: { kind: Placed["kind"]; id: string } | null; setPlacing: (p: any) => void;
  settings: EditorSettings; setItems: React.Dispatch<React.SetStateAction<Placed[]>>;
  pushUndo: (p: Placed[]) => void; gizmo: "translate" | "rotate" | "scale";
  preview: boolean; onStats: (s: { fps: number; tris: number }) => void;
  activeBiome: string;
}) {
  const { items, selected, setSelected, tool, placing, setPlacing, settings, setItems, pushUndo, gizmo, preview, onStats, activeBiome } = props;
  const [hover, setHover] = useState<Vec3 | null>(null);
  const selRef = useRef<THREE.Group>(null);
  const sky = SKIES.find((s) => s.id === settings.skyId) || SKIES[0];
  const { gl, scene } = useThree();
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current > 600) {
      onStats({ fps: Math.round((frames.current * 1000) / (now - last.current)), tris: gl.info.render.triangles });
      frames.current = 0; last.current = now;
    }
  });

  const snapV = (v: number) => (settings.snap ? Math.round(v * 2) / 2 : v);
  const painting = useRef(false);
  const strokeUndo = useRef(false);
  const lastPaint = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const up = () => { painting.current = false; strokeUndo.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const placeAt = (pt: THREE.Vector3) => {
    if (!placing) return;
    const sx = snapV(pt.x), sz = snapV(pt.z);
    if (lastPaint.current && lastPaint.current.distanceTo(new THREE.Vector3(sx, 0, sz)) < 1) return;
    const y = placing.kind === "block" ? snapV(Math.max(0.5, Math.round(pt.y) + 0.5))
      : placing.kind === "rift" ? 2.6 : 0;
    const item: Placed = {
      uid: nextUid(), kind: placing.kind, id: placing.id,
      pos: [sx, y, sz],
      rot: [0, 0, 0], scale: [1, 1, 1], animated: true,
    };
    if (!strokeUndo.current) { pushUndo(items); strokeUndo.current = true; }
    lastPaint.current = new THREE.Vector3(sx, 0, sz);
    setItems((prev) => [...prev, item]);
    setSelected(item.uid);
  };

  const paintBiome = (pt: THREE.Vector3) => {
    const sx = Math.round(pt.x), sz = Math.round(pt.z);
    if (lastPaint.current && lastPaint.current.distanceTo(new THREE.Vector3(sx, 0, sz)) < 1) return;
    lastPaint.current = new THREE.Vector3(sx, 0, sz);
    if (!strokeUndo.current) { pushUndo(items); strokeUndo.current = true; }
    const bio = BIOMES.find((b) => b.id === activeBiome) || BIOMES[0];
    const add: Placed[] = [{
      uid: nextUid(), kind: "block", id: bio.ground, pos: [sx, 0.5, sz],
      rot: [0, 0, 0], scale: [1, 1, 1], animated: true,
    }];
    const roll = Math.random();
    if (roll < 0.16 && bio.flora.length) {
      add.push({
        uid: nextUid(), kind: "block", id: bio.flora[Math.floor(Math.random() * bio.flora.length)],
        pos: [sx, 1.5, sz], rot: [0, Math.random() * 3, 0], scale: [1, 1, 1], animated: true,
      });
    } else if (roll < 0.28 && bio.stone.length) {
      add.push({
        uid: nextUid(), kind: "block", id: bio.stone[Math.floor(Math.random() * bio.stone.length)],
        pos: [sx + (Math.random() > 0.5 ? 1 : -1), 0.5, sz], rot: [0, 0, 0], scale: [1, 1, 1], animated: true,
      });
    }
    setItems((prev) => {
      const filtered = prev.filter((i) => !(i.kind === "block" && Math.abs(i.pos[0] - sx) < 0.5 && Math.abs(i.pos[2] - sz) < 0.5 && i.pos[1] < 0.75));
      return [...filtered, ...add];
    });
  };

  const groundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    if (!placing && tool === "select") setSelected(null);
  };
  const eraseClick = (uid: number, e: ThreeEvent<MouseEvent>) => {
    if (tool !== "erase") return false;
    e.stopPropagation();
    pushUndo(items);
    setItems((prev) => prev.filter((i) => i.uid !== uid));
    return true;
  };

  const selectedRefCb = useCallback((g: THREE.Group | null) => {
    selRef.current = g;
  }, []);

  return (
    <>
      <color attach="background" args={[sky.fog]} />
      <fog attach="fog" args={[sky.fog, 24, 140]} />
      <SkyDome top={sky.top} bottom={sky.bottom} night={!!sky.night} ribbons={settings.ribbons} />
      <ambientLight intensity={sky.ambient * 0.7} />
      <directionalLight position={[18, 26, 10]} intensity={sky.ambient * 1.6} color={sky.sun} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40} />
      <hemisphereLight intensity={0.25} color={sky.top} groundColor={sky.fog} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow
        onClick={groundClick}
        onPointerDown={(e) => {
          if (placing || tool === "biome") {
            painting.current = true; strokeUndo.current = false; lastPaint.current = null;
            if (placing) placeAt(e.point); else paintBiome(e.point);
          }
        }}
        onPointerMove={(e) => {
          if (placing || tool === "biome") {
            setHover([snapV(e.point.x), 0, snapV(e.point.z)]);
            if (painting.current) { if (placing) placeAt(e.point); else paintBiome(e.point); }
          }
        }}
        onPointerLeave={() => { setHover(null); painting.current = false; }}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={"#0b0d10"} roughness={1} />
      </mesh>
      {settings.showGrid && (
        <Grid position={[0, 0.02, 0]} args={[80, 80]} cellSize={1} sectionSize={8}
          cellColor="#1c232b" sectionColor="#2c3a46" fadeDistance={90} infiniteGrid />
      )}

      {/* objects */}
      {items.map((it) => (
        <group key={it.uid} position={it.pos} rotation={it.rot}
          scale={it.kind === "rift" ? [1, 1, 1] : it.scale}
          ref={it.uid === selected ? selectedRefCb : undefined}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            if (eraseClick(it.uid, e)) return;
            if (tool === "select" || tool === "place") setSelected(it.uid);
          }}>
          {it.kind === "block" && <BlockMesh id={it.id} emissiveMul={it.emissive ?? 1} animate={settings.anims && it.animated !== false} />}
          {it.kind === "mob" && <MobMesh id={it.id} animated={settings.anims && it.animated !== false} />}
          {it.kind === "rift" && <Rift styleId={it.id} width={3 * it.scale[0]} height={3 * it.scale[1]} animated={settings.anims && it.animated !== false} tearOverride={it.tear} />}
          {it.kind === "vfx" && <VfxItem id={it.id} color={it.variant} />}
        </group>
      ))}

      {/* ghost preview */}
      {placing && hover && (
        <group position={[hover[0], placing.kind === "block" ? 0.5 : 0, hover[2]]}>
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#59f2c8" transparent opacity={0.18} wireframe />
          </mesh>
        </group>
      )}

      {selected != null && selRef.current && (
        <TransformControls object={selRef.current} mode={gizmo} size={0.8}
          onObjectChange={() => {
            const g = selRef.current;
            if (!g || selected == null) return;
            setItems((prev) => prev.map((i) => i.uid === selected
              ? { ...i, pos: [g.position.x, g.position.y, g.position.z], rot: [g.rotation.x, g.rotation.y, g.rotation.z], scale: [g.scale.x, g.scale.y, g.scale.z] }
              : i));
          }} />
      )}

      <OrbitControls makeDefault enabled={!placing && (tool === "orbit" || tool === "select")}
        autoRotate={preview} autoRotateSpeed={1.2} maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={3} maxDistance={120} target={[0, 2, 0]} />

      {settings.bloom > 0 && (
        <EffectComposer>
          <Bloom intensity={settings.bloom} luminanceThreshold={0.55} mipmapBlur radius={0.75} />
          <Vignette darkness={0.55} offset={0.25} />
        </EffectComposer>
      )}
    </>
  );
}
