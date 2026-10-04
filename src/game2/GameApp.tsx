/* SIFT REALMS — playable third-person rift adventure using the Sift set.
   Three realms, wandering fauna, hostile sculk, resonance quest, rift travel. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { hash2, mulberry, clamp, lerp, type Placed } from "../sift/core";
import { BlockMesh } from "../sift/Blocks";
import { MobMesh } from "../sift/Mobs";
import { Rift } from "../sift/Rift";
import { SkyDome, ParticleDrift, LightShaft, IchorPool, VfxItem } from "../sift/VFX";
import { SCENE_PRESETS } from "../sift/scenes";

/* ── realms ── */
interface Realm {
  id: string; name: string;
  ground: string; hi: string; stone: string;
  skyTop: string; skyBottom: string; fog: string; night?: boolean;
  topB: string; bottomB: string; fogB: string;   /* opposite sky phase */
  seed: number; height: number;
  hostile?: boolean;
}
const REALMS: Realm[] = [
  { id: "meadow", name: "Singer Meadow", ground: "#4fb3aa", hi: "#6fd8cc", stone: "#3f8f88", skyTop: "#39a59e", skyBottom: "#9fe8dc", fog: "#5bbfb7", topB: "#c96253", bottomB: "#ffb0a0", fogB: "#c97a6a", seed: 11, height: 2.2 },
  { id: "spires", name: "Rose Spires", ground: "#d88a98", hi: "#f0b0ba", stone: "#a8606e", skyTop: "#c96253", skyBottom: "#ffc9b0", fog: "#d88a80", topB: "#3a2030", bottomB: "#8a4a5a", fogB: "#5a3040", seed: 22, height: 3.4, night: true },
  { id: "boneyard", name: "Boneyard", ground: "#37555c", hi: "#4a7078", stone: "#26414a", skyTop: "#101c26", skyBottom: "#25454d", fog: "#1a343c", topB: "#2e5a60", bottomB: "#4a8a90", fogB: "#2e5a60", seed: 33, height: 2.6, night: true, hostile: true },
  { id: "coral", name: "Coral Expanse", ground: "#3f9a9a", hi: "#6fd8d0", stone: "#2a7a8a", skyTop: "#2a7a8a", skyBottom: "#7fe8dc", fog: "#3fa8a8", topB: "#0e2a3a", bottomB: "#2a5a6a", fogB: "#12303a", seed: 44, height: 1.8 },
  { id: "tunnel", name: "Rift Tunnel", ground: "#16333b", hi: "#1e4650", stone: "#0a1e24", skyTop: "#0a1418", skyBottom: "#123036", fog: "#0d1d22", topB: "#1a4650", bottomB: "#2a6a72", fogB: "#123036", seed: 55, height: 1.2, night: true, hostile: true },
];

/* the sixth realm: whatever the Sift Forge editor saved (or the Ritual Plaza) */
const FORGE_REALM: Realm = {
  id: "forge", name: "Forge Scene", ground: "#141a20", hi: "#1c242c", stone: "#0d1218",
  skyTop: "#0e1a22", skyBottom: "#1e3a44", fog: "#12242c",
  topB: "#0a1218", bottomB: "#16303a", fogB: "#0d1d24", seed: 77, height: 0, night: true,
};
const ALL_REALMS: Realm[] = [...REALMS, FORGE_REALM];
const FORGE_IX = ALL_REALMS.length - 1;

export interface MapData {
  px: number; pz: number; yaw: number; realm: number;
  rifts: { x: number; z: number }[];
  shards: { x: number; z: number; taken: boolean }[];
  mobs: { x: number; z: number; hostile: boolean }[];
}

function smooth(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi, seed), hash2(xi + 1, zi, seed), u), lerp(hash2(xi, zi + 1, seed), hash2(xi + 1, zi + 1, seed), u), v);
}
function groundH(x: number, z: number, r: Realm) {
  const n = smooth(x * 0.08, z * 0.08, r.seed) * 0.7 + smooth(x * 0.22, z * 0.22, r.seed + 7) * 0.3;
  return Math.round(n * r.height * 2) * 0.5;
}

/* decorative structures per realm (positions generated deterministically) */
function realmProps(r: Realm): { p: [number, number, number]; s: [number, number, number]; c: string; e?: number; g?: string }[] {
  const rnd = mulberry(r.seed * 999);
  const out: any[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, e = 0, g?: string) =>
    out.push({ p: [x, y, z] as any, s: [sx, sy, sz] as any, c, e, g });
  if (r.id === "meadow") {
    for (let i = 0; i < 26; i++) {
      const x = (rnd() - 0.5) * 90, z = (rnd() - 0.5) * 90;
      const h = 3 + rnd() * 3;
      add(x, groundH(x, z, r) + h / 2, z, 0.8, h, 0.8, "#3f8f88");
      add(x, groundH(x, z, r) + h + 0.8, z, 3.4, 1.6, 3.4, rnd() > 0.5 ? "#58c8a0" : "#7fd4b0");
    }
    for (let i = 0; i < 40; i++) {
      const x = (rnd() - 0.5) * 95, z = (rnd() - 0.5) * 95;
      add(x, groundH(x, z, r) + 0.5, z, 0.3, 0.8, 0.3, "#8ffce8", 1.4, "#8ffce8");
    }
  }
  if (r.id === "spires") {
    for (let i = 0; i < 10; i++) {
      const x = (rnd() - 0.5) * 100, z = (rnd() - 0.5) * 100;
      const h = 8 + rnd() * 10;
      add(x, groundH(x, z, r) + h / 2, z, 2.4, h, 2.4, "#b06878");
      add(x, groundH(x, z, r) + h + 1, z, 3.2, 2, 3.2, "#d898a4");
      add(x, groundH(x, z, r) + h + 2.6, z, 1.4, 1.4, 1.4, "#f0c0ca", 0.5, "#ff9ecb");
    }
  }
  if (r.id === "boneyard") {
    /* skull gate */
    add(-6, 3, -20, 1.6, 7, 1.6, "#c8d8d4"); add(6, 3, -20, 1.6, 7, 1.6, "#c8d8d4");
    add(0, 7, -20, 14, 2, 2, "#c8d8d4");
    add(0, 8.6, -20, 5, 3.4, 3.6, "#e2eeea");
    add(-1.2, 8.4, -18.4, 1, 1, 0.5, "#7ef2ff", 2, "#35e0d0");
    add(1.2, 8.4, -18.4, 1, 1, 0.5, "#7ef2ff", 2, "#35e0d0");
    for (let i = 0; i < 14; i++) {
      const x = (rnd() - 0.5) * 90, z = (rnd() - 0.5) * 90;
      const h = 2 + rnd() * 4;
      add(x, groundH(x, z, r) + h / 2, z, 0.7, h, 0.7, "#9fb8b4", 0, undefined);
    }
  }
  if (r.id === "coral") {
    for (let i = 0; i < 18; i++) {
      const x = (rnd() - 0.5) * 90, z = (rnd() - 0.5) * 90;
      const h = 2 + rnd() * 3;
      add(x, groundH(x, z, r) + h / 2, z, 1, h, 1, "#2a7a8a");
      add(x, groundH(x, z, r) + h + 0.6, z, 1.8, 1.2, 1.8, rnd() > 0.5 ? "#ff7a5a" : "#ffd05a", 0.7, "#ff9a7a");
      if (rnd() > 0.5) add(x + 1.4, groundH(x, z, r) + 0.6, z, 0.9, 0.9, 0.9, "#ff8ab0", 0.4, "#ff8ab0");
      if (rnd() > 0.6) add(x - 1.2, groundH(x, z, r) + 0.5, z + 0.8, 0.7, 0.7, 0.7, "#ffd05a", 0.4, "#ffd05a");
    }
    for (let i = 0; i < 10; i++) {
      const x = (rnd() - 0.5) * 80, z = (rnd() - 0.5) * 80;
      add(x, groundH(x, z, r) + 0.4, z, 2.4, 0.4, 2.4, "#7fe8dc", 0.5, "#35e0d0");
    }
  }
  if (r.id === "tunnel") {
    for (let z = -45; z <= 45; z += 6) {
      const gl = groundH(-6, z, r), gr = groundH(6, z, r);
      add(-6, gl + 2, z, 1.2, 5, 1.2, "#1e4650");
      add(6, gr + 2, z, 1.2, 5, 1.2, "#1e4650");
      add(0, Math.max(gl, gr) + 4.8, z, 14, 1.2, 1.2, "#16333b");
      add(-5.2, gl + 1.2, z, 0.5, 0.5, 0.5, "#8ffce8", 1.8, "#8ffce8");
      add(5.2, gr + 1.2, z, 0.5, 0.5, 0.5, "#8ffce8", 1.8, "#8ffce8");
    }
  }
  return out;
}

/* ── instanced voxel terrain ── */
function Terrain({ realm }: { realm: Realm }) {
  const data = useMemo(() => {
    const cells: { x: number; y: number; z: number; c: THREE.Color }[] = [];
    const R = 52;
    for (let x = -R; x <= R; x += 2)
      for (let z = -R; z <= R; z += 2) {
        const h = groundH(x, z, realm);
        const jitter = hash2(x, z, realm.seed + 3);
        const col = new THREE.Color(jitter > 0.72 ? realm.hi : jitter < 0.12 ? realm.stone : realm.ground);
        cells.push({ x, y: h - 0.5, z, c: col });
        if (h > 1) cells.push({ x, y: h - 1.5, z, c: new THREE.Color(realm.stone) });
      }
    return cells;
  }, [realm]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current!;
    const mat = new THREE.Matrix4();
    data.forEach((c, i) => {
      mat.makeScale(2, 1, 2);
      mat.setPosition(c.x, c.y, c.z);
      m.setMatrixAt(i, mat);
      m.setColorAt(i, c.c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [data]);
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, data.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

function Props({ realm }: { realm: Realm }) {
  const props = useMemo(() => realmProps(realm), [realm]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current!;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    props.forEach((p, i) => {
      mat.compose(new THREE.Vector3(...p.p), q, new THREE.Vector3(...p.s));
      m.setMatrixAt(i, mat);
      m.setColorAt(i, new THREE.Color(p.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [props]);
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, Math.max(1, props.length)]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} emissive="#000000" />
    </instancedMesh>
  );
}

/* glowing props overlay (emissive ones) */
function GlowProps({ realm }: { realm: Realm }) {
  const props = useMemo(() => realmProps(realm).filter((p) => p.e > 0), [realm]);
  return (
    <group>
      {props.map((p, i) => (
        <mesh key={i} position={p.p} scale={p.s}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={p.c} emissive={p.g || p.c} emissiveIntensity={p.e} />
        </mesh>
      ))}
    </group>
  );
}

/* ── game logic ── */
interface MobState { id: string; pos: THREE.Vector3; anchor: THREE.Vector3; vel: THREE.Vector3; hp: number; t: number; hostile: boolean; dead: boolean; telegraph?: number; minionT?: number; waveT?: number }
interface Shard { pos: THREE.Vector3; taken: boolean; realm: string }

function useGame(hud: (h: any) => void) {
  const state = useRef({
    keys: {} as Record<string, boolean>,
    player: new THREE.Vector3(0, 3, 8),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0.35, dist: 9,
    realmIx: 0, hp: 100, shards: 0, time: 0, dead: false, swing: 0,
    mobs: [] as MobState[], shardsArr: [] as Shard[], flash: 0, won: false,
  });
  return state;
}

export function GameApp({ onExit }: { onExit: () => void }) {
  const [hud, setHud] = useState({ hp: 100, shards: 0, realm: REALMS[0].name, msg: "", dead: false, won: false, muted: false, started: false, ichor: 0, potions: 1, charms: 0, boss: null as number | null, craftOpen: false });
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const mapData = useRef<MapData>({ px: 0, pz: 0, yaw: 0, realm: 0, rifts: [], shards: [], mobs: [] });
  const [banner, setBanner] = useState<string | null>(null);
  const [gs, setGs] = useState<GameSettings>({ dpr: 1.5, fogFar: 110, volume: 0.5, paused: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadRun, setLoadRun] = useState(false);
  const [hasSave, setHasSave] = useState(() => !!localStorage.getItem(SAVE_KEY2));
  useEffect(() => { setGs((g) => ({ ...g, paused: settingsOpen })); }, [settingsOpen]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.code === "Escape" && started) setSettingsOpen((o) => !o); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [started]);
  useEffect(() => {
    if (audioRef.current.amb) { audioRef.current.amb.volume = gs.volume * 0.5; }
    if (audioRef.current.mus) { audioRef.current.mus.volume = gs.volume * 0.35; }
  }, [gs.volume]);
  useEffect(() => {
    if (!hud.started) return;
    setBanner(hud.realm);
    const t = window.setTimeout(() => setBanner(null), 2400);
    return () => window.clearTimeout(t);
  }, [hud.realm, hud.started]);
  const audioRef = useRef<{ amb?: HTMLAudioElement; mus?: HTMLAudioElement }>({});

  useEffect(() => {
    if (!started || muted) {
      audioRef.current.amb?.pause(); audioRef.current.mus?.pause();
      return;
    }
    if (!audioRef.current.amb) {
      audioRef.current.amb = new Audio("/sift/audio/sift_loop.wav");
      audioRef.current.amb.loop = true; audioRef.current.amb.volume = 0.25;
      audioRef.current.mus = new Audio("/sift/audio/sift_1.wav");
      audioRef.current.mus.loop = true; audioRef.current.mus.volume = 0.16;
    }
    audioRef.current.amb.play().catch(() => {});
    audioRef.current.mus?.play().catch(() => {});
  }, [started, muted]);

  const start = (cont: boolean) => {
    if (cont) setLoadRun(true);
    else { localStorage.removeItem(SAVE_KEY2); setHasSave(false); }
    setStarted(true);
    setHud((h) => ({ ...h, started: true }));
  };

  return (
    <div className="game-root">
      <Canvas shadows dpr={[1, gs.dpr]} camera={{ fov: 60, position: [0, 6, 14] }}>
        <GameWorld onHud={setHud} started={started} map={mapData} gs={gs} load={loadRun} />
      </Canvas>
      <Minimap data={mapData} />

      {/* HUD */}
      <div className="game-hud">
        <div className="game-top">
          <button className="forge-btn" onClick={onExit}>⌂</button>
          <div className="game-realm"><b>◈ SIFT REALMS</b><span>{hud.realm}</span></div>
          <div className="game-right">
            <button className="forge-btn" onClick={() => setMuted((m) => !m)}>{muted ? "🔇" : "🔊"}</button>
            <button className="forge-btn" title="Settings (Esc)" onClick={() => setSettingsOpen(true)}>⚙</button>
            <div className="game-shards">◆ {hud.shards}/12 resonance</div>
          </div>
        </div>
        <div className="game-bottom">
          <div className="game-hp"><i style={{ width: `${hud.hp}%` }} /></div>
          <div className="game-inv">
            <span className="cy">◆ {hud.shards}/12</span>
            <span className="pu">🜁 {hud.ichor} ichor</span>
            <span>[Q] potion ×{hud.potions}</span>
            <span>charm ×{hud.charms}</span>
            <span className="dim">[C] craft</span>
          </div>
          <div className="game-keys">WASD move · Space jump · Shift sprint · drag = look · click = gauntlet · walk into rifts to travel</div>
        </div>
        {hud.boss != null && (
          <div className="game-boss"><span>⚠ TWISTED WARDEN</span><div className="game-bossbar"><i style={{ width: `${hud.boss}%` }} /></div></div>
        )}
        {settingsOpen && (
          <div className="game-settings">
            <h3>SETTINGS</h3>
            <label>resolution scale
              <input type="range" min={0.75} max={2} step={0.25} value={gs.dpr}
                onChange={(e) => setGs((g) => ({ ...g, dpr: parseFloat(e.target.value) }))} />
            </label>
            <label>view distance
              <input type="range" min={60} max={160} step={5} value={gs.fogFar}
                onChange={(e) => setGs((g) => ({ ...g, fogFar: parseFloat(e.target.value) }))} />
            </label>
            <label>volume
              <input type="range" min={0} max={1} step={0.05} value={gs.volume}
                onChange={(e) => setGs((g) => ({ ...g, volume: parseFloat(e.target.value) }))} />
            </label>
            <div className="row">
              <button className="forge-btn accent" onClick={() => setSettingsOpen(false)}>RESUME</button>
              <button className="forge-btn" onClick={onExit}>EXIT TO HUB</button>
            </div>
            <small>game pauses while open · Esc closes</small>
          </div>
        )}
        {hud.craftOpen && (
          <div className="game-craft">
            <h3>RIFT CRAFTING</h3>
            <div><b>[1]</b> Soul Potion — 3 ichor · heals 50 · use with <b>Q</b></div>
            <div><b>[2]</b> Gauntlet Charm — 6 ichor · +strike power &amp; reach</div>
            <small>ichor drips from felled sculk — the Warden sheds six.</small>
          </div>
        )}
        {hud.msg && <div className="game-msg">{hud.msg}</div>}
        {banner && <div key={banner} className="game-realm-banner"><span>⟡ entering</span><b>{banner}</b></div>}
        <CompassStrip data={mapData} />
        {hud.won && (
          <div className="game-banner">
            <h2>THE SONG IS COMPLETE</h2>
            <p>All twelve resonance notes recovered — the ritual portal sings across realms.</p>
          </div>
        )}
        {hud.dead && (
          <div className="game-banner dead">
            <h2>YOU FADED</h2>
            <p>The sculk claims another. Click to reawaken at the meadow gate.</p>
          </div>
        )}
      </div>

      {!started && (
        <div className="game-start">
          <div className="game-start-core">
            <span className="forge-logo big">◈ SIFT REALMS</span>
            <p>a playable rift-dimension adventure</p>
            <small>Six realms in a rift chain — the last one is your saved Forge scene. Recover the 12 resonance notes, craft from ichor, fell the Warden.</small>
            <div className="game-start-row">
              <button className="forge-btn accent big" onClick={() => start(false)}>NEW RUN</button>
              {hasSave && <button className="forge-btn big" onClick={() => start(true)}>CONTINUE ▸</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface GameSettings { dpr: number; fogFar: number; volume: number; paused: boolean; }
const SAVE_KEY2 = "siftrealms.save.v1";

function GameWorld({ onHud, started, map, gs, load }: { onHud: (f: (h: any) => any) => void; started: boolean; map: React.MutableRefObject<MapData>; gs: GameSettings; load: boolean }) {
  const realmIx = useRef(0);
  const realm = ALL_REALMS[realmIx.current];
  const player = useRef(new THREE.Group());
  const bodyRef = useRef<THREE.Group>(null);
  const camTarget = useRef(new THREE.Vector3());
  const keys = useRef<Record<string, boolean>>({});
  const look = useRef({ yaw: 0, pitch: 0.32, dist: 9, drag: false, lx: 0, ly: 0 });
  const vel = useRef(new THREE.Vector3());
  const onGround = useRef(false);
  const hp = useRef(100);
  const dead = useRef(false);
  const won = useRef(false);
  const swing = useRef(0);
  const flash = useRef(0);
  const cycle = useRef(0);
  const mixRef = useRef(0);
  const ichor = useRef(0);
  const potions = useRef(1);
  const charms = useRef(0);
  const craftOpen = useRef(false);
  const pickups = useRef<{ pos: THREE.Vector3 }[]>([]);
  const rings = useRef<{ x: number; z: number; t: number }[]>([]);
  const bossHp = useRef(12);
  const bossActive = useRef(false);
  const gl = useThree((s) => s.gl);

  /* world + shards + mobs per realm */
  const world = useMemo(() => {
    const mk = (ix: number) => {
      const r = ALL_REALMS[ix];
      const rnd = mulberry(r.seed * 55);
      const mobs: MobState[] = [];
      const PICKS: string[][] = [
        ["blub", "blub", "antlerling", "note_bird", "singer", "soul_bee", "blub", "note_bird"],
        ["licker", "blub", "note_bird", "overseer", "blub", "soul_bee"],
        ["sculker", "sculker", "sculkling", "sculkling", "twisted_warden", "watchling"],
        ["drift_jelly", "blub", "soul_bee", "note_bird", "drift_jelly", "blub", "soul_bee"],
        ["sculkling", "watchling", "sculker", "sculkling", "watchling", "sculker"],
      ];
      (PICKS[ix] || PICKS[0]).forEach((id) => {
        const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70;
        const pos = new THREE.Vector3(x, groundH(x, z, r), z);
        mobs.push({ id, pos, anchor: pos.clone(), vel: new THREE.Vector3(), hp: id === "twisted_warden" ? 12 : 3, t: rnd() * 10, hostile: id === "sculker" || id === "twisted_warden" || id === "sculkling", dead: false });
      });
      const shards: Shard[] = Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + rnd();
        const x = Math.cos(a) * (14 + rnd() * 22), z = Math.sin(a) * (14 + rnd() * 22);
        return { pos: new THREE.Vector3(x, groundH(x, z, r) + 1.4, z), taken: false, realm: r.id };
      });
      return { mobs, shards };
    };
    return ALL_REALMS.map((_, i) => mk(i));
  }, []);

  const rifts = useMemo(() => ALL_REALMS.map((r, i) => ({
    pos: new THREE.Vector3(0, groundH(0, -30, r) + 2.2, -30),
    style: ["sift", "sift_night", "end"][i],
    to: (i + 1) % ALL_REALMS.length,
  })), []);

  /* Forge custom realm items (editor save or Ritual Plaza fallback) */
  const forgeItems = useMemo<Placed[]>(() => {
    try {
      const raw = localStorage.getItem("siftforge.scene.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
        if (Array.isArray(parsed?.items) && parsed.items.length) return parsed.items;
      }
    } catch { /* ignore */ }
    return SCENE_PRESETS[0].build();
  }, []);

  /* load a saved run */
  useEffect(() => {
    if (!load) return;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY2) || "null");
      if (!s) return;
      hp.current = s.hp ?? 100;
      ichor.current = s.ichor ?? 0;
      potions.current = s.potions ?? 1;
      charms.current = s.charms ?? 0;
      realmIx.current = Math.min(s.realm ?? 0, ALL_REALMS.length - 1);
      if (Array.isArray(s.pos)) player.current.position.set(s.pos[0], s.pos[1], s.pos[2]);
      if (Array.isArray(s.shards)) world.forEach((w2, i) => w2.shards.forEach((sh, j) => { sh.taken = !!s.shards[i]?.[j]; }));
    } catch { /* ignore */ }
  }, [load, world]);
  const lastSave = useRef(0);

  /* input */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!started || dead.current) return;
      if (e.code === "KeyC") craftOpen.current = !craftOpen.current;
      if (e.code === "Digit1" && ichor.current >= 3) { ichor.current -= 3; potions.current++; }
      if (e.code === "Digit2" && ichor.current >= 6) { ichor.current -= 6; charms.current++; }
      if (e.code === "KeyQ" && potions.current > 0) { potions.current--; hp.current = Math.min(100, hp.current + 50); }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const md = (e: MouseEvent) => {
      look.current.drag = true; look.current.lx = e.clientX; look.current.ly = e.clientY;
      if (dead.current) { respawn(); }
      else if (started) swing.current = 0.35;
    };
    const mm = (e: MouseEvent) => {
      if (!look.current.drag) return;
      look.current.yaw -= (e.clientX - look.current.lx) * 0.005;
      look.current.pitch = clamp(look.current.pitch + (e.clientY - look.current.ly) * 0.004, 0.05, 1.1);
      look.current.lx = e.clientX; look.current.ly = e.clientY;
    };
    const mu = () => { look.current.drag = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    gl.domElement.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up);
      gl.domElement.removeEventListener("mousedown", md);
      window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu);
    };
  }, [gl, started]);

  const respawn = () => {
    dead.current = false; hp.current = 100;
    realmIx.current = 0;
    player.current.position.set(0, 3, 8);
    vel.current.set(0, 0, 0);
  };

  let hudTimer = useRef(0);

  useFrame((st, dt) => {
    if (!started || gs.paused) return;
    dt = Math.min(dt, 0.05);
    const r = ALL_REALMS[realmIx.current];
    const p = player.current.position;
    const w = world[realmIx.current];

    /* movement */
    const speed = keys.current["ShiftLeft"] ? 11 : 6;
    const f = new THREE.Vector3(-Math.sin(look.current.yaw), 0, -Math.cos(look.current.yaw));
    const rt = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (keys.current["KeyW"]) wish.add(f);
    if (keys.current["KeyS"]) wish.sub(f);
    if (keys.current["KeyD"]) wish.add(rt);
    if (keys.current["KeyA"]) wish.sub(rt);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    vel.current.x = lerp(vel.current.x, wish.x, 1 - Math.pow(0.001, dt));
    vel.current.z = lerp(vel.current.z, wish.z, 1 - Math.pow(0.001, dt));
    vel.current.y -= 24 * dt;
    if (keys.current["Space"] && onGround.current) { vel.current.y = 9; onGround.current = false; }
    if (!dead.current) {
      p.addScaledVector(vel.current, dt);
    }
    const gh = groundH(p.x, p.z, r);
    if (p.y <= gh) { p.y = gh; vel.current.y = 0; onGround.current = true; } else onGround.current = false;
    p.x = clamp(p.x, -60, 60); p.z = clamp(p.z, -60, 60);

    /* player body follow + face move dir */
    if (bodyRef.current) {
      bodyRef.current.position.copy(p);
      if (wish.lengthSq() > 0.1) {
        const target = Math.atan2(wish.x, wish.z);
        let d = target - bodyRef.current.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        bodyRef.current.rotation.y += d * Math.min(1, dt * 12);
      }
    }

    /* camera */
    const L = look.current;
    const cx = p.x + Math.sin(L.yaw) * Math.cos(L.pitch) * L.dist;
    const cy = p.y + Math.sin(L.pitch) * L.dist + 1.5;
    const cz = p.z + Math.cos(L.yaw) * Math.cos(L.pitch) * L.dist;
    camTarget.current.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.0001, dt));
    st.camera.position.copy(camTarget.current);
    st.camera.lookAt(p.x, p.y + 1.6, p.z);

    /* mobs */
    bossActive.current = false;
    w.mobs.forEach((m) => {
      if (m.dead) return;
      m.t += dt;
      const toP = new THREE.Vector3().subVectors(p, m.pos); toP.y = 0;
      const dP = toP.length();
      const isWarden = m.id === "twisted_warden";
      if (m.hostile && dP < (isWarden ? 22 : 16) && !dead.current) {
        const dir = toP.clone().normalize();
        if (isWarden) {
          /* ── boss fight: three phases ── */
          const phase = m.hp > 8 ? 1 : m.hp > 4 ? 2 : 3;
          const spd = [0, 2.6, 3.4, 4.3][phase];
          bossActive.current = true;
          bossHp.current = Math.max(0, m.hp);
          if ((m.telegraph ?? 0) > 0) {
            m.telegraph! -= dt;                       /* winding up the slam */
            if (m.telegraph! <= 0) {
              rings.current.push({ x: m.pos.x, z: m.pos.z, t: 0 });
              if (dP < 4.5) { hp.current -= 25; flash.current = 0.5; vel.current.addScaledVector(dir.clone().negate(), 10); }
              m.telegraph = -1.6;
            }
          } else if ((m.telegraph ?? 0) < 0) {
            m.telegraph! += dt;                       /* recovery cooldown */
          } else if (dP < 3.4) {
            m.telegraph = 0.9;                        /* telegraph */
          } else {
            m.pos.addScaledVector(dir, dt * spd);
          }
          if (phase >= 2) {                           /* summon sculkling minions */
            m.minionT = (m.minionT ?? 6) - dt;
            if (m.minionT <= 0) {
              m.minionT = 9;
              const sp = m.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
              sp.y = groundH(sp.x, sp.z, r);
              w.mobs.push({ id: "sculkling", pos: sp, anchor: sp.clone(), vel: new THREE.Vector3(), hp: 3, t: 0, hostile: true, dead: false });
            }
          }
          if (phase === 3) {                          /* shockwave rings */
            m.waveT = (m.waveT ?? 5) - dt;
            if (m.waveT <= 0) {
              m.waveT = 5;
              rings.current.push({ x: m.pos.x, z: m.pos.z, t: 0 });
              if (dP < 7) { hp.current -= 12; vel.current.addScaledVector(dir.clone().negate(), 8); }
            }
          }
        } else {
          m.pos.addScaledVector(dir, dt * 3.6);
          if (dP < 1.6) { hp.current -= dt * 22; flash.current = 0.4; }
        }
      } else if ((m.id === "blub" || m.id === "antlerling") && dP < 7) {
        /* skittish: bolt away from the player */
        m.pos.addScaledVector(toP.clone().negate().normalize(), dt * 4.4);
      } else if (m.id === "note_bird") {
        /* swooping song circles */
        m.pos.x = m.anchor.x + Math.cos(m.t * 0.9) * 5;
        m.pos.z = m.anchor.z + Math.sin(m.t * 0.9) * 5;
      } else if (m.id === "soul_bee") {
        m.pos.x = m.anchor.x + Math.cos(m.t * 1.6) * 1.7;
        m.pos.z = m.anchor.z + Math.sin(m.t * 1.6) * 1.7;
      } else if (m.id === "watchling") {
        /* sentinel drift: keeps a wary distance */
        if (dP < 14 && dP > 4) m.pos.addScaledVector(toP.clone().normalize(), dt * 1.2);
        else if (dP <= 4) m.pos.addScaledVector(toP.clone().negate().normalize(), dt * 1.4);
      } else if (m.id === "overseer") {
        /* slow stalking orbit */
        const a = m.t * 0.25;
        m.pos.x = m.anchor.x + Math.cos(a) * 6;
        m.pos.z = m.anchor.z + Math.sin(a) * 6;
      } else {
        m.pos.x += Math.sin(m.t * 0.7 + m.hp) * dt * 1.4;
        m.pos.z += Math.cos(m.t * 0.5) * dt * 1.4;
      }
      m.pos.y = groundH(m.pos.x, m.pos.z, r);
      /* gauntlet strike (charms add power + reach) */
      const reach = 3.4 + charms.current * 0.6;
      if (swing.current > 0 && dP < reach) {
        m.hp -= dt * 30 * (1 + charms.current * 0.5);
        m.pos.addScaledVector(toP.normalize().negate(), dt * 8);
        if (m.hp <= 0) {
          m.dead = true;
          const n = m.id === "twisted_warden" ? 6 : 2;
          for (let i = 0; i < n; i++) {
            pickups.current.push({ pos: m.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.6, (Math.random() - 0.5) * 2.4)) });
          }
          if (m.id === "twisted_warden") rings.current.push({ x: m.pos.x, z: m.pos.z, t: 0 });
        }
      }
    });
    swing.current = Math.max(0, swing.current - dt);
    flash.current = Math.max(0, flash.current - dt);

    /* ichor pickup collection */
    pickups.current = pickups.current.filter((pk) => {
      if (pk.pos.distanceTo(p) < 1.5) { ichor.current++; return false; }
      return true;
    });
    /* shockwave rings age out */
    rings.current.forEach((rg) => (rg.t += dt));
    rings.current = rings.current.filter((rg) => rg.t < 1.1);

    /* shards */
    w.shards.forEach((s) => {
      if (s.taken) return;
      if (s.pos.distanceTo(p) < 1.6) {
        s.taken = true;
        const total = world.reduce((a, x) => a + x.shards.filter((q) => q.taken).length, 0);
        if (total >= 12) won.current = true;
      }
    });

    /* rift travel */
    rifts.forEach((rf) => {
      if (rf.pos.distanceTo(new THREE.Vector3(p.x, rf.pos.y, p.z)) < 2 && p.y > rf.pos.y - 2.5) {
        if (flash.current <= 0.05) {
          flash.current = 0.8;
          realmIx.current = rf.to;
          const dest = rifts[rf.to];
          p.set(dest.pos.x, groundH(dest.pos.x, dest.pos.z + 6, ALL_REALMS[rf.to]) + 1, dest.pos.z + 6);
          vel.current.set(0, 0, 0);
        }
      }
    });

    /* death */
    if (hp.current <= 0 && !dead.current) { dead.current = true; }

    /* day/night cycle — the Sift's inverted sky (mint day ↔ amber night) */
    cycle.current += dt;
    mixRef.current = 0.5 - 0.5 * Math.cos((cycle.current / 150) * Math.PI * 2);

    /* minimap feed */
    const md = map.current;
    md.px = p.x; md.pz = p.z; md.yaw = look.current.yaw; md.realm = realmIx.current;
    md.rifts = rifts.map((rf) => ({ x: rf.pos.x, z: rf.pos.z }));
    md.shards = w.shards.map((s) => ({ x: s.pos.x, z: s.pos.z, taken: s.taken }));
    md.mobs = w.mobs.filter((m) => !m.dead).map((m) => ({ x: m.pos.x, z: m.pos.z, hostile: m.hostile }));

    /* HUD sync ~5Hz */
    hudTimer.current += dt;
    if (hudTimer.current > 0.2) {
      hudTimer.current = 0;
      const total = world.reduce((a, x) => a + x.shards.filter((q) => q.taken).length, 0);
      onHud((h: any) => ({
        ...h,
        hp: Math.max(0, Math.round(hp.current)),
        shards: total,
        realm: ALL_REALMS[realmIx.current].name,
        dead: dead.current,
        won: won.current,
        ichor: ichor.current,
        potions: potions.current,
        charms: charms.current,
        boss: bossActive.current ? Math.max(0, (bossHp.current / 12) * 100) : null,
        craftOpen: craftOpen.current,
        msg: flash.current > 0.4 ? "⟡ rift transit" : "",
      }));
      const now = performance.now();
      if (now - lastSave.current > 3000) {
        lastSave.current = now;
        localStorage.setItem(SAVE_KEY2, JSON.stringify({
          hp: hp.current, ichor: ichor.current, potions: potions.current, charms: charms.current,
          realm: realmIx.current, pos: [p.x, p.y, p.z],
          shards: world.map((w2) => w2.shards.map((s2) => s2.taken)),
        }));
      }
    }
  });

  const r = ALL_REALMS[realmIx.current];
  const w = world[realmIx.current];

  return (
    <>
      <color attach="background" args={[r.fog]} />
      <fog attach="fog" args={[r.fog, 18, gs.fogFar]} />
      <Atmosphere realm={r} mixRef={mixRef} />
      <SkyDome top={r.skyTop} bottom={r.skyBottom} topB={r.topB} bottomB={r.bottomB} night={!!r.night} ribbons={1} mixRef={mixRef} />
      <ambientLight intensity={r.night ? 0.4 : 0.75} />
      <directionalLight position={[20, 30, 12]} intensity={r.night ? 0.7 : 1.5} color={r.night ? "#ffd8b0" : "#fff2d8"} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={50} shadow-camera-bottom={-50} />

      <Terrain realm={r} />
      <Props realm={r} />
      <GlowProps realm={r} />
      {realmIx.current === FORGE_IX && <ForgeScene items={forgeItems} />}
      {r.id === "meadow" && <IchorPool radius={5} />}

      {rifts.map((rf, i) => i === realmIx.current && (
        <group key={i} position={rf.pos.toArray() as [number, number, number]}>
          <Rift styleId={rf.style} width={3.4} height={3.4} />
        </group>
      ))}
      {/* exit rift back */}
      {(() => { const back = rifts[(realmIx.current + ALL_REALMS.length - 1) % ALL_REALMS.length]; return null; })()}

      {w.shards.map((s, i) => !s.taken && (
        <group key={i} position={s.pos.toArray() as [number, number, number]}>
          <ShardSpin />
        </group>
      ))}

      {pickups.current.map((pk, i) => (
        <group key={"pk" + i} position={pk.pos.toArray() as [number, number, number]}>
          <IchorDrop />
        </group>
      ))}
      <ShockRings rings={rings} />

      {w.mobs.map((m, i) => !m.dead && (
        <group key={i} position={m.pos.toArray() as [number, number, number]}>
          <MobMesh id={m.id} animated />
        </group>
      ))}

      {/* player: little rift-touched explorer */}
      <group ref={player}>
        <group ref={bodyRef}>
          <Explorer swing={swing} />
        </group>
      </group>

      {/* weather per realm */}
      {r.id === "boneyard" && <ParticleDrift color="#ff8a4a" count={380} radius={45} rise={0.15} sway={1.4} wind={6} opacity={0.3 + mixRef.current * 0.7} />}
      {r.id === "meadow" && <ParticleDrift color="#b0ffe0" count={170} radius={45} rise={-0.25} sway={0.8} opacity={0.75} />}
      {r.id === "spires" && <ParticleDrift color="#ff9ecb" count={220} radius={45} rise={-0.35} sway={1.1} wind={1.6} opacity={0.7} />}
      {r.id === "coral" && <ParticleDrift color="#7fe8dc" count={180} radius={45} rise={0.4} sway={1.0} opacity={0.7} />}
      {r.id === "tunnel" && <ParticleDrift color="#8ffce8" count={140} radius={30} rise={0.3} sway={0.6} opacity={0.8} />}
      {r.id === "boneyard" && <LightShaft color="#35e0d0" height={14} radius={0.8} />}

      <EffectComposer>
        <Bloom intensity={0.8} luminanceThreshold={0.6} mipmapBlur />
        <Vignette darkness={0.5} offset={0.25} />
      </EffectComposer>
    </>
  );
}

/* per-frame fog + background blend across the realm's two sky phases */
function Atmosphere({ realm, mixRef }: { realm: Realm; mixRef: React.MutableRefObject<number> }) {
  const scene = useThree((s) => s.scene);
  const cA = useMemo(() => new THREE.Color(realm.fog), [realm]);
  const cB = useMemo(() => new THREE.Color(realm.fogB), [realm]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    tmp.copy(cA).lerp(cB, mixRef.current);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(tmp);
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp);
  });
  return null;
}

/* horizontal bearing compass with shard/rift markers */
function CompassStrip({ data }: { data: React.MutableRefObject<MapData> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const cv = ref.current;
      if (!cv) return;
      const ctx = cv.getContext("2d")!;
      const W = cv.width, H = cv.height, C = W / 2;
      const d = data.current;
      const heading = -d.yaw;
      const FOV = (70 * Math.PI) / 180;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,12,14,0.72)";
      ctx.fillRect(0, 0, W, H);
      /* ticks + cardinals */
      ctx.strokeStyle = "rgba(215,226,232,0.35)";
      ctx.fillStyle = "rgba(215,226,232,0.6)";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      for (let deg = 0; deg < 360; deg += 15) {
        const br = (deg * Math.PI) / 180;
        let rel = br - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) > FOV / 2) continue;
        const x = C + (rel / (FOV / 2)) * (W / 2 - 8);
        const cardinal = deg % 90 === 0;
        ctx.beginPath(); ctx.moveTo(x, H - 4); ctx.lineTo(x, H - (cardinal ? 12 : 8)); ctx.stroke();
        if (cardinal) ctx.fillText(["N", "E", "S", "W"][deg / 90], x, 11);
      }
      const mark = (br: number, draw: (x: number) => void) => {
        let rel = br - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) > FOV / 2) return;
        draw(C + (rel / (FOV / 2)) * (W / 2 - 8));
      };
      d.shards.forEach((s) => {
        if (s.taken) return;
        const br = Math.atan2(s.x - d.px, -(s.z - d.pz));
        mark(br, (x) => {
          ctx.fillStyle = "#5af2ff";
          ctx.save(); ctx.translate(x, H - 14); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
        });
      });
      d.rifts.forEach((rf) => {
        const br = Math.atan2(rf.x - d.px, -(rf.z - d.pz));
        mark(br, (x) => { ctx.strokeStyle = "#ff7fae"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3.5, H - 18, 7, 7); });
      });
      /* caret */
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.moveTo(C, H - 2); ctx.lineTo(C - 4, H); ctx.lineTo(C + 4, H); ctx.closePath(); ctx.fill();
    }, 90);
    return () => window.clearInterval(iv);
  }, [data]);
  return <canvas ref={ref} width={340} height={30} className="game-compass" aria-label="compass" />;
}

/* top-down minimap: north-up, player arrow rotates with heading */
function Minimap({ data }: { data: React.MutableRefObject<MapData> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const cv = ref.current;
      if (!cv) return;
      const ctx = cv.getContext("2d")!;
      const S = cv.width, C = S / 2, scale = 1.6, R = 60;
      const d = data.current;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "rgba(8,12,14,0.82)"; ctx.fillRect(0, 0, S, S);
      /* rings */
      ctx.strokeStyle = "rgba(53,224,208,0.15)";
      for (let rr = 20; rr < C; rr += 20) { ctx.beginPath(); ctx.arc(C, C, rr, 0, Math.PI * 2); ctx.stroke(); }
      const px = (x: number) => C + (x - d.px) * scale;
      const pz = (z: number) => C + (z - d.pz) * scale;
      const inR = (x: number, z: number) => (x - C) ** 2 + (z - C) ** 2 < R * R;
      /* shards */
      d.shards.forEach((s) => {
        if (s.taken) return;
        const x = px(s.x), z = pz(s.z);
        if (!inR(x, z)) return;
        ctx.fillStyle = "#5af2ff";
        ctx.save(); ctx.translate(x, z); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
      });
      /* rifts */
      d.rifts.forEach((rf) => {
        const x = px(rf.x), z = pz(rf.z);
        if (!inR(x, z)) return;
        ctx.strokeStyle = "#ff7fae"; ctx.lineWidth = 2;
        ctx.strokeRect(x - 4, z - 4, 8, 8);
      });
      /* mobs */
      d.mobs.forEach((m) => {
        const x = px(m.x), z = pz(m.z);
        if (!inR(x, z)) return;
        ctx.fillStyle = m.hostile ? "#ff5a6a" : "#7fd4b0";
        ctx.beginPath(); ctx.arc(x, z, 2.2, 0, Math.PI * 2); ctx.fill();
      });
      /* player arrow */
      ctx.save();
      ctx.translate(C, C); ctx.rotate(-d.yaw);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
      /* rim + realm tick */
      ctx.strokeStyle = "rgba(53,224,208,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.stroke();
    }, 90);
    return () => window.clearInterval(iv);
  }, [data]);
  return <canvas ref={ref} width={150} height={150} className="game-map" aria-label="minimap" />;
}

/* renders a Sift Forge editor scene as the sixth realm */
function ForgeScene({ items }: { items: Placed[] }) {
  return (
    <group>
      {items.map((it) => (
        <group key={it.uid} position={it.pos} rotation={it.rot} scale={it.kind === "rift" ? [1, 1, 1] : it.scale}>
          {it.kind === "block" && <BlockMesh id={it.id} emissiveMul={it.emissive ?? 1} />}
          {it.kind === "mob" && <MobMesh id={it.id} animated />}
          {it.kind === "rift" && <Rift styleId={it.id} width={3 * it.scale[0]} height={3 * it.scale[1]} />}
          {it.kind === "vfx" && <VfxItem id={it.id} color={it.variant} />}
        </group>
      ))}
    </group>
  );
}

function IchorDrop() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 3;
      ref.current.position.y = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.15;
    }
  });
  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.28]} />
        <meshStandardMaterial color="#c07ae0" emissive="#c07ae0" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

/* pooled expanding shockwave rings */
function ShockRings({ rings }: { rings: React.MutableRefObject<{ x: number; z: number; t: number }[]> }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    rings.current.slice(0, 6).forEach((r, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = true;
      m.position.set(r.x, 0.5, r.z);
      const s = 1 + r.t * 9;
      m.scale.set(s, s, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - r.t / 1.1));
    });
    for (let i = Math.min(6, rings.current.length); i < 6; i++) {
      const m = refs.current[i];
      if (m) m.visible = false;
    }
  });
  return (
    <group>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.1, 40]} />
          <meshBasicMaterial color="#43f1e4" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ShardSpin() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 2;
      ref.current.position.y = Math.sin(clock.elapsedTime * 2.4) * 0.25;
    }
  });
  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.4]} />
        <meshStandardMaterial color="#5af2ff" emissive="#5af2ff" emissiveIntensity={1.8} />
      </mesh>
    </group>
  );
}

function Explorer({ swing }: { swing: React.MutableRefObject<number> }) {
  const armR = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Mesh>(null), legR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const s = swing.current;
    if (armR.current) armR.current.rotation.x = -s * 4 + Math.sin(t * 8) * 0.1;
    if (legL.current) legL.current.rotation.x = Math.sin(t * 9) * 0.5;
    if (legR.current) legR.current.rotation.x = -Math.sin(t * 9) * 0.5;
  });
  const P = ({ p = [0, 0, 0] as [number, number, number], s = [1, 1, 1] as [number, number, number], c, e = 0, g, refFn }: any) => (
    <mesh position={p} scale={s} ref={refFn} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={c} emissive={g || "#000"} emissiveIntensity={e} />
    </mesh>
  );
  return (
    <group>
      <P p={[0, 0.75, 0]} s={[0.5, 0.7, 0.3]} c="#2a4a52" />
      <P p={[0, 1.3, 0]} s={[0.4, 0.4, 0.4]} c="#e8c8a8" />
      <P p={[0, 1.55, 0]} s={[0.44, 0.14, 0.44]} c="#35e0d0" e={0.6} g="#35e0d0" />
      <P p={[-0.34, 0.8, 0]} s={[0.14, 0.6, 0.16]} c="#22404a" />
      <group position={[0.34, 1.05, 0]} ref={armR as any}>
        <P p={[0, -0.28, 0]} s={[0.14, 0.6, 0.16]} c="#22404a" />
        <P p={[0, -0.6, 0.1]} s={[0.2, 0.2, 0.24]} c="#b08a3e" e={0.5} g="#35e0d0" />
      </group>
      <group position={[-0.14, 0.4, 0]} ref={legL as any}><P p={[0, -0.3, 0]} s={[0.16, 0.6, 0.18]} c="#1a3038" /></group>
      <group position={[0.14, 0.4, 0]} ref={legR as any}><P p={[0, -0.3, 0]} s={[0.16, 0.6, 0.18]} c="#1a3038" /></group>
    </group>
  );
}
