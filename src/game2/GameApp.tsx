/* SIFT REALMS — playable third-person rift adventure using the Sift set.
   Three realms, wandering fauna, hostile sculk, resonance quest, rift travel. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { hash2, mulberry, clamp, lerp } from "../sift/core";
import { MobMesh } from "../sift/Mobs";
import { Rift } from "../sift/Rift";
import { SkyDome, ParticleDrift, LightShaft, IchorPool } from "../sift/VFX";

/* ── realms ── */
interface Realm {
  id: string; name: string;
  ground: string; hi: string; stone: string;
  skyTop: string; skyBottom: string; fog: string; night?: boolean;
  seed: number; height: number;
  hostile?: boolean;
}
const REALMS: Realm[] = [
  { id: "meadow", name: "Singer Meadow", ground: "#4fb3aa", hi: "#6fd8cc", stone: "#3f8f88", skyTop: "#39a59e", skyBottom: "#9fe8dc", fog: "#5bbfb7", seed: 11, height: 2.2 },
  { id: "spires", name: "Rose Spires", ground: "#d88a98", hi: "#f0b0ba", stone: "#a8606e", skyTop: "#c96253", skyBottom: "#ffc9b0", fog: "#d88a80", seed: 22, height: 3.4, night: true },
  { id: "boneyard", name: "Boneyard", ground: "#37555c", hi: "#4a7078", stone: "#26414a", skyTop: "#101c26", skyBottom: "#25454d", fog: "#1a343c", seed: 33, height: 2.6, night: true, hostile: true },
];

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
interface MobState { id: string; pos: THREE.Vector3; vel: THREE.Vector3; hp: number; t: number; hostile: boolean; dead: boolean }
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
  const [hud, setHud] = useState({ hp: 100, shards: 0, realm: REALMS[0].name, msg: "", dead: false, won: false, muted: false, started: false });
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
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

  const start = () => { setStarted(true); setHud((h) => ({ ...h, started: true })); };

  return (
    <div className="game-root">
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 60, position: [0, 6, 14] }}>
        <GameWorld onHud={setHud} started={started} />
      </Canvas>

      {/* HUD */}
      <div className="game-hud">
        <div className="game-top">
          <button className="forge-btn" onClick={onExit}>⌂</button>
          <div className="game-realm"><b>◈ SIFT REALMS</b><span>{hud.realm}</span></div>
          <div className="game-right">
            <button className="forge-btn" onClick={() => setMuted((m) => !m)}>{muted ? "🔇" : "🔊"}</button>
            <div className="game-shards">◆ {hud.shards}/12 resonance</div>
          </div>
        </div>
        <div className="game-bottom">
          <div className="game-hp"><i style={{ width: `${hud.hp}%` }} /></div>
          <div className="game-keys">WASD move · Space jump · Shift sprint · drag = look · click = gauntlet · walk into rifts to travel</div>
        </div>
        {hud.msg && <div className="game-msg">{hud.msg}</div>}
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
        <div className="game-start" onClick={start}>
          <div className="game-start-core">
            <span className="forge-logo big">◈ SIFT REALMS</span>
            <p>a playable rift-dimension adventure</p>
            <small>Singer Meadow → Rose Spires → the Boneyard. Recover the 12 resonance notes. Mind the sculk.</small>
            <button className="forge-btn accent big">ENTER THE RIFT</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GameWorld({ onHud, started }: { onHud: (f: (h: any) => any) => void; started: boolean }) {
  const realmIx = useRef(0);
  const realm = REALMS[realmIx.current];
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
  const gl = useThree((s) => s.gl);

  /* mobs + shards per realm */
  const world = useMemo(() => {
    const mk = (ix: number) => {
      const r = REALMS[ix];
      const rnd = mulberry(r.seed * 55);
      const mobs: MobState[] = [];
      const pick = ix === 0 ? ["blub", "blub", "antlerling", "note_bird", "singer", "soul_bee", "blub", "note_bird"]
        : ix === 1 ? ["licker", "blub", "note_bird", "overseer", "blub", "soul_bee"]
          : ["sculker", "sculker", "sculkling", "sculkling", "twisted_warden", "watchling"];
      pick.forEach((id) => {
        const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70;
        mobs.push({ id, pos: new THREE.Vector3(x, groundH(x, z, r), z), vel: new THREE.Vector3(), hp: id === "twisted_warden" ? 12 : 3, t: rnd() * 10, hostile: id === "sculker" || id === "twisted_warden" || id === "sculkling", dead: false });
      });
      const shards: Shard[] = Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + rnd();
        const x = Math.cos(a) * (14 + rnd() * 22), z = Math.sin(a) * (14 + rnd() * 22);
        return { pos: new THREE.Vector3(x, groundH(x, z, r) + 1.4, z), taken: false, realm: r.id };
      });
      return { mobs, shards };
    };
    return REALMS.map((_, i) => mk(i));
  }, []);

  const rifts = useMemo(() => REALMS.map((r, i) => ({
    pos: new THREE.Vector3(0, groundH(0, -30, r) + 2.2, -30),
    style: ["sift", "sift_night", "end"][i],
    to: (i + 1) % REALMS.length,
  })), []);

  /* input */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys.current[e.code] = true; };
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
    if (!started) return;
    dt = Math.min(dt, 0.05);
    const r = REALMS[realmIx.current];
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
    w.mobs.forEach((m) => {
      if (m.dead) return;
      m.t += dt;
      const toP = new THREE.Vector3().subVectors(p, m.pos); toP.y = 0;
      const dP = toP.length();
      if (m.hostile && dP < 16 && !dead.current) {
        toP.normalize();
        m.pos.addScaledVector(toP, dt * (m.id === "twisted_warden" ? 2.6 : 3.6));
        if (dP < 1.6) { hp.current -= dt * 22; flash.current = 0.4; }
      } else {
        m.pos.x += Math.sin(m.t * 0.7 + m.hp) * dt * 1.4;
        m.pos.z += Math.cos(m.t * 0.5) * dt * 1.4;
      }
      m.pos.y = groundH(m.pos.x, m.pos.z, r);
      /* gauntlet strike */
      if (swing.current > 0 && dP < 3.4) {
        m.hp -= dt * 30;
        m.pos.addScaledVector(toP.normalize().negate(), dt * 8);
        if (m.hp <= 0) { m.dead = true; }
      }
    });
    swing.current = Math.max(0, swing.current - dt);
    flash.current = Math.max(0, flash.current - dt);

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
          p.set(dest.pos.x, groundH(dest.pos.x, dest.pos.z + 6, REALMS[rf.to]) + 1, dest.pos.z + 6);
          vel.current.set(0, 0, 0);
        }
      }
    });

    /* death */
    if (hp.current <= 0 && !dead.current) { dead.current = true; }

    /* HUD sync ~5Hz */
    hudTimer.current += dt;
    if (hudTimer.current > 0.2) {
      hudTimer.current = 0;
      const total = world.reduce((a, x) => a + x.shards.filter((q) => q.taken).length, 0);
      onHud((h: any) => ({
        ...h,
        hp: Math.max(0, Math.round(hp.current)),
        shards: total,
        realm: REALMS[realmIx.current].name,
        dead: dead.current,
        won: won.current,
        msg: flash.current > 0.4 ? "⟡ rift transit" : "",
      }));
    }
  });

  const r = REALMS[realmIx.current];
  const w = world[realmIx.current];

  return (
    <>
      <color attach="background" args={[r.fog]} />
      <fog attach="fog" args={[r.fog, 18, 110]} />
      <SkyDome top={r.skyTop} bottom={r.skyBottom} night={!!r.night} ribbons={1} />
      <ambientLight intensity={r.night ? 0.4 : 0.75} />
      <directionalLight position={[20, 30, 12]} intensity={r.night ? 0.7 : 1.5} color={r.night ? "#ffd8b0" : "#fff2d8"} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={50} shadow-camera-bottom={-50} />

      <Terrain realm={r} />
      <Props realm={r} />
      <GlowProps realm={r} />
      {r.id === "meadow" && <IchorPool radius={5} />}

      {rifts.map((rf, i) => i === realmIx.current && (
        <group key={i} position={rf.pos.toArray() as [number, number, number]}>
          <Rift styleId={rf.style} width={3.4} height={3.4} />
        </group>
      ))}
      {/* exit rift back */}
      {(() => { const back = rifts[(realmIx.current + REALMS.length - 1) % REALMS.length]; return null; })()}

      {w.shards.map((s, i) => !s.taken && (
        <group key={i} position={s.pos.toArray() as [number, number, number]}>
          <ShardSpin />
        </group>
      ))}

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

      <ParticleDrift color={r.night ? "#9fe8ff" : "#b0ffe0"} count={160} radius={40} />
      {r.id === "boneyard" && <LightShaft color="#35e0d0" height={14} radius={0.8} />}

      <EffectComposer>
        <Bloom intensity={0.8} luminanceThreshold={0.6} mipmapBlur />
        <Vignette darkness={0.5} offset={0.25} />
      </EffectComposer>
    </>
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
