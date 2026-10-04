/* Procedural voxel rigs for the twelve Sift creatures.
   Palettes sampled from the repo's ref crops + entity skins (fabric-mod/art). */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type V3 = [number, number, number];
function Part({ p = [0, 0, 0] as V3, s = [1, 1, 1] as V3, c, e = 0, glow, r = [0, 0, 0] as V3, refFn }: {
  p?: V3; s?: V3; c: string; e?: number; glow?: string; r?: V3;
  refFn?: (m: THREE.Mesh) => void;
}) {
  return (
    <mesh position={p} scale={s} rotation={r} ref={refFn} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={c} emissive={glow || "#000000"} emissiveIntensity={e} roughness={0.85} />
    </mesh>
  );
}

const M = (props: any) => <Part {...props} />;

/* ── Blub: teal hopper, floppy ears ── */
export function Blub({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const earL = useRef<THREE.Mesh>(null), earR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime * 2.2;
    const hop = Math.abs(Math.sin(t)) * 0.28;
    const sq = 1 - Math.abs(Math.sin(t)) * 0.14;
    root.current.position.y = hop;
    root.current.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
    const flop = Math.sin(t * 2) * 0.35 * Math.abs(Math.cos(t));
    if (earL.current) earL.current.rotation.z = 0.25 + flop;
    if (earR.current) earR.current.rotation.z = -0.25 - flop;
  });
  return (
    <group ref={root}>
      <M p={[0, 0.35, 0]} s={[0.62, 0.5, 0.55]} c="#5fb6c6" />
      <M p={[0, 0.3, 0.26]} s={[0.34, 0.1, 0.06]} c="#e893a6" />            {/* mouth ledge */}
      <M p={[-0.16, 0.42, 0.29]} s={[0.12, 0.07, 0.03]} c="#34346b" />      {/* eyes */}
      <M p={[0.16, 0.42, 0.29]} s={[0.12, 0.07, 0.03]} c="#34346b" />
      <M p={[0, 0.36, 0.29]} s={[0.09, 0.06, 0.03]} c="#7b52d6" />          {/* nose */}
      <M p={[-0.16, 0.75, 0]} s={[0.14, 0.34, 0.1]} c="#5fb6c6" refFn={(m) => (earL.current = m)} />
      <M p={[0.16, 0.75, 0]} s={[0.14, 0.34, 0.1]} c="#5fb6c6" refFn={(m) => (earR.current = m)} />
      <M p={[-0.16, 0.74, 0.055]} s={[0.07, 0.24, 0.02]} c="#e893a6" />
      <M p={[0.16, 0.74, 0.055]} s={[0.07, 0.24, 0.02]} c="#e893a6" />
      <M p={[-0.2, 0.06, 0]} s={[0.12, 0.12, 0.14]} c="#4a9cae" />
      <M p={[0.2, 0.06, 0]} s={[0.12, 0.12, 0.14]} c="#4a9cae" />
    </group>
  );
}

/* ── Licker: grey-green crawler, long cream tongue ── */
export function Licker({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const tongue = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime * 3;
    root.current.position.y = Math.sin(t * 2) * 0.03;
    if (tongue.current) tongue.current.rotation.x = 0.15 + Math.sin(t) * 0.18;
    if (head.current) head.current.rotation.z = Math.sin(t * 0.7) * 0.06;
  });
  return (
    <group ref={root}>
      <M p={[0, 0.42, -0.25]} s={[0.6, 0.42, 0.7]} c="#55453f" />
      <M p={[0, 0.62, -0.3]} s={[0.3, 0.16, 0.3]} c="#58c8a8" e={0.25} glow="#2a8a6a" />
      <group ref={head as any} position={[0, 0.95, 0.25]}>
        <M s={[0.78, 0.62, 0.7]} c="#8b907f" />
        <M p={[0.05, 0.28, 0.1]} s={[0.24, 0.1, 0.3]} c="#7ed49a" r={[0, 0.4, 0]} />
        <M p={[-0.26, 0.02, 0.36]} s={[0.2, 0.1, 0.02]} c="#cfe0f8" />
        <M p={[-0.2, 0.02, 0.37]} s={[0.08, 0.1, 0.02]} c="#6f9df0" />
        <M p={[0.26, 0.02, 0.36]} s={[0.2, 0.1, 0.02]} c="#cfe0f8" />
        <M p={[0.32, 0.02, 0.37]} s={[0.08, 0.1, 0.02]} c="#6f9df0" />
      </group>
      <group position={[0, 0.62, 0.55]} ref={tongue as any}>
        <M p={[0, -0.1, 0.35]} s={[0.3, 0.09, 0.85]} c="#f2d9c4" />
      </group>
      <M p={[-0.3, 0.12, 0.15]} s={[0.12, 0.24, 0.14]} c="#463a34" />
      <M p={[0.3, 0.12, 0.15]} s={[0.12, 0.24, 0.14]} c="#463a34" />
      <M p={[-0.3, 0.12, -0.5]} s={[0.12, 0.24, 0.14]} c="#463a34" />
      <M p={[0.3, 0.12, -0.5]} s={[0.12, 0.24, 0.14]} c="#463a34" />
    </group>
  );
}

/* ── Overseer: violet one-eyed watcher on stilts ── */
export function Overseer({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const eye = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.position.y = Math.sin(t * 1.4) * 0.08;
    root.current.rotation.y = Math.sin(t * 0.4) * 0.4;
    if (eye.current) (eye.current.material as any).emissiveIntensity = 1.4 + Math.sin(t * 5) * 0.5;
  });
  const legs: V3[] = [[-0.3, 0, -0.2], [0.3, 0, -0.2], [-0.3, 0, 0.2], [0.3, 0, 0.2], [0, 0, -0.35], [0, 0, 0.35]];
  return (
    <group ref={root}>
      <M p={[0, 1.9, 0]} s={[0.72, 0.66, 0.66]} c="#6d4fa3" />
      <M p={[0, 1.9, 0.34]} s={[0.34, 0.3, 0.04]} c="#e8e8f0" />
      <M p={[0, 1.9, 0.37]} s={[0.13, 0.13, 0.03]} c="#141420" e={0.6} glow="#0a0a14" refFn={(m) => (eye.current = m)} />
      <M p={[0, 1.5, 0]} s={[0.5, 0.2, 0.5]} c="#c8a06a" />
      <M p={[0, 1.32, 0]} s={[0.86, 0.12, 0.86]} c="#2b2b33" />
      {legs.map((p, i) => (
        <M key={i} p={[p[0], 0.66, p[2]]} s={[0.07, 1.3, 0.07]} c="#23232b" r={[Math.sin(i) * 0.12, 0, Math.cos(i * 2) * 0.12]} />
      ))}
    </group>
  );
}

/* ── Twisted Warden: dark hull, cyan bracket antlers, brass maw ── */
export function TwistedWarden({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const maw = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.rotation.y = Math.sin(t * 0.5) * 0.2;
    root.current.position.y = Math.sin(t * 1.1) * 0.05;
    if (maw.current) (maw.current.material as any).emissiveIntensity = 1.6 + Math.sin(t * 3.2) * 0.7;
  });
  return (
    <group ref={root}>
      <M p={[0, 1.5, 0]} s={[1.1, 1.5, 0.7]} c="#14333a" />
      <M p={[0, 2.55, 0]} s={[0.8, 0.7, 0.62]} c="#102a30" />
      {/* bracket antlers */}
      <M p={[-0.62, 2.7, 0]} s={[0.16, 0.9, 0.16]} c="#43f1e4" e={1.6} glow="#2ad8cc" />
      <M p={[-0.62, 3.2, 0.3]} s={[0.16, 0.16, 0.8]} c="#43f1e4" e={1.6} glow="#2ad8cc" />
      <M p={[0.62, 2.7, 0]} s={[0.16, 0.9, 0.16]} c="#43f1e4" e={1.6} glow="#2ad8cc" />
      <M p={[0.62, 3.2, 0.3]} s={[0.16, 0.16, 0.8]} c="#43f1e4" e={1.6} glow="#2ad8cc" />
      {/* chest maw with brass teeth */}
      <M p={[0, 1.35, 0.36]} s={[0.8, 0.24, 0.1]} c="#0af2e2" e={1.8} glow="#0af2e2" refFn={(m) => (maw.current = m)} />
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <M key={i} p={[x, 1.55, 0.4]} s={[0.14, 0.2, 0.1]} c="#b08a3e" />
      ))}
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <M key={"b" + i} p={[x, 1.16, 0.4]} s={[0.14, 0.18, 0.1]} c="#b08a3e" />
      ))}
      <M p={[-0.75, 1.2, 0]} s={[0.28, 0.7, 0.34]} c="#0e262c" />
      <M p={[0.75, 1.2, 0]} s={[0.28, 0.7, 0.34]} c="#0e262c" />
      <M p={[-0.75, 0.75, 0]} s={[0.3, 0.3, 0.36]} c="#b08a3e" />
      <M p={[0.75, 0.75, 0]} s={[0.3, 0.3, 0.36]} c="#b08a3e" />
      <M p={[-0.34, 0.4, 0]} s={[0.3, 0.8, 0.34]} c="#0e262c" />
      <M p={[0.34, 0.4, 0]} s={[0.3, 0.8, 0.34]} c="#0e262c" />
    </group>
  );
}

/* ── Drift Jelly: pale floating bell ── */
export function DriftJelly({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const t1 = useRef<THREE.Mesh>(null), t2 = useRef<THREE.Mesh>(null), t3 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.position.y = 2 + Math.sin(t * 0.9) * 0.35;
    const p = 1 + Math.sin(t * 1.8) * 0.06;
    root.current.scale.set(p, 2 - p, p);
    [t1, t2, t3].forEach((r, i) => { if (r.current) r.current.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.3; });
  });
  return (
    <group ref={root}>
      <M p={[0, 0.5, 0]} s={[1.6, 1.0, 1.6]} c="#cfe8ef" e={0.35} glow="#9fe8ff" />
      <M p={[0, 1.1, 0]} s={[1.1, 0.6, 1.1]} c="#dff2f8" e={0.5} glow="#b0f0ff" />
      <M p={[0, -0.05, 0]} s={[1.3, 0.2, 1.3]} c="#e893a6" e={0.3} glow="#e893a6" />
      <M p={[-0.4, -0.8, 0]} s={[0.08, 1.2, 0.08]} c="#bfe0ea" refFn={(m) => (t1.current = m)} />
      <M p={[0.1, -0.9, 0.2]} s={[0.08, 1.4, 0.08]} c="#bfe0ea" refFn={(m) => (t2.current = m)} />
      <M p={[0.45, -0.7, -0.2]} s={[0.08, 1.0, 0.08]} c="#bfe0ea" refFn={(m) => (t3.current = m)} />
      <M p={[-0.3, 0.6, 0.6]} s={[0.2, 0.2, 0.2]} c="#ffffff" e={1.2} glow="#c8f8ff" />
      <M p={[0.4, 0.4, 0.55]} s={[0.16, 0.16, 0.16]} c="#ffffff" e={1.2} glow="#c8f8ff" />
    </group>
  );
}

/* ── Note Bird: mint songbird, glowing wingtips ── */
export function NoteBird({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const wL = useRef<THREE.Mesh>(null), wR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime * 6;
    root.current.position.y = 1.6 + Math.sin(t * 0.5) * 0.25;
    root.current.rotation.y = clock.elapsedTime * 0.6;
    if (wL.current) wL.current.rotation.z = Math.sin(t) * 0.7 + 0.2;
    if (wR.current) wR.current.rotation.z = -Math.sin(t) * 0.7 - 0.2;
  });
  return (
    <group ref={root}>
      <M s={[0.3, 0.26, 0.4]} c="#8fe3c0" />
      <M p={[0, 0.14, 0.24]} s={[0.2, 0.18, 0.16]} c="#a8f0d4" />
      <M p={[0, 0.14, 0.34]} s={[0.06, 0.05, 0.06]} c="#e8a03c" />
      <M p={[-0.08, 0.18, 0.3]} s={[0.04, 0.04, 0.02]} c="#1a1a24" />
      <M p={[0.08, 0.18, 0.3]} s={[0.04, 0.04, 0.02]} c="#1a1a24" />
      <group position={[-0.18, 0.05, 0]} ref={wL as any}>
        <M p={[-0.14, 0, 0]} s={[0.3, 0.05, 0.3]} c="#7fd4b0" />
        <M p={[-0.28, 0, 0]} s={[0.08, 0.06, 0.08]} c="#eafff5" e={1.4} glow="#b0ffd8" />
      </group>
      <group position={[0.18, 0.05, 0]} ref={wR as any}>
        <M p={[0.14, 0, 0]} s={[0.3, 0.05, 0.3]} c="#7fd4b0" />
        <M p={[0.28, 0, 0]} s={[0.08, 0.06, 0.08]} c="#eafff5" e={1.4} glow="#b0ffd8" />
      </group>
      <M p={[0, 0.02, -0.26]} s={[0.1, 0.08, 0.2]} c="#6fc4a0" />
    </group>
  );
}

/* ── Singer: moss-voiced chorister ── */
export function Singer({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const throat = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.rotation.y = Math.sin(t * 0.8) * 0.5;
    if (throat.current) (throat.current.material as any).emissiveIntensity = 0.8 + Math.abs(Math.sin(t * 4)) * 1.2;
  });
  return (
    <group ref={root}>
      <M p={[0, 0.55, 0]} s={[0.5, 0.8, 0.4]} c="#5a7a5f" />
      <M p={[0, 1.25, 0]} s={[0.44, 0.5, 0.4]} c="#7fb98a" />
      <M p={[0, 1.15, 0.21]} s={[0.16, 0.12, 0.04]} c="#d0ffe8" e={1.2} glow="#a0ffd0" refFn={(m) => (throat.current = m)} />
      <M p={[-0.12, 1.34, 0.2]} s={[0.06, 0.06, 0.02]} c="#16302a" />
      <M p={[0.12, 1.34, 0.2]} s={[0.06, 0.06, 0.02]} c="#16302a" />
      <M p={[0, 1.56, 0]} s={[0.3, 0.14, 0.3]} c="#4a6a50" />
      <M p={[-0.32, 0.6, 0]} s={[0.12, 0.6, 0.14]} c="#4a6a50" r={[0, 0, 0.2]} />
      <M p={[0.32, 0.6, 0]} s={[0.12, 0.6, 0.14]} c="#4a6a50" r={[0, 0, -0.2]} />
      <M p={[-0.12, 0.08, 0]} s={[0.14, 0.16, 0.16]} c="#3f5a45" />
      <M p={[0.12, 0.08, 0]} s={[0.14, 0.16, 0.16]} c="#3f5a45" />
    </group>
  );
}

/* ── Sculker / Sculkling: sculk stalkers ── */
export function Sculker({ animated, small }: { animated?: boolean; small?: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime * (small ? 5 : 3);
    root.current.position.y = Math.abs(Math.sin(t)) * (small ? 0.16 : 0.08);
    root.current.rotation.y = Math.sin(t * 0.3) * 0.6;
  });
  const s = small ? 0.45 : 1;
  return (
    <group ref={root} scale={s}>
      <M p={[0, 0.4, 0]} s={[0.7, 0.5, 0.9]} c="#12303a" />
      <M p={[0, 0.75, 0.2]} s={[0.5, 0.35, 0.5]} c="#0d242c" />
      <M p={[-0.12, 0.78, 0.46]} s={[0.08, 0.06, 0.02]} c="#35e0d0" e={1.6} glow="#35e0d0" />
      <M p={[0.12, 0.78, 0.46]} s={[0.08, 0.06, 0.02]} c="#35e0d0" e={1.6} glow="#35e0d0" />
      <M p={[-0.2, 0.5, 0.46]} s={[0.06, 0.06, 0.02]} c="#35e0d0" e={1.0} glow="#35e0d0" />
      <M p={[0.28, 0.35, 0.2]} s={[0.06, 0.06, 0.02]} c="#35e0d0" e={1.0} glow="#35e0d0" />
      <M p={[-0.4, 0.2, 0.2]} s={[0.12, 0.4, 0.14]} c="#0a1e24" />
      <M p={[0.4, 0.2, 0.2]} s={[0.12, 0.4, 0.14]} c="#0a1e24" />
      <M p={[-0.4, 0.2, -0.3]} s={[0.12, 0.4, 0.14]} c="#0a1e24" />
      <M p={[0.4, 0.2, -0.3]} s={[0.12, 0.4, 0.14]} c="#0a1e24" />
      <M p={[0, 0.72, -0.45]} s={[0.1, 0.3, 0.1]} c="#35e0d0" e={0.8} glow="#35e0d0" />
    </group>
  );
}

/* ── Soul Bee ── */
export function SoulBee({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const wL = useRef<THREE.Mesh>(null), wR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.position.y = 1.2 + Math.sin(t * 3) * 0.12;
    root.current.rotation.y = t * 1.2;
    if (wL.current) wL.current.rotation.z = Math.sin(t * 30) * 0.6 + 0.3;
    if (wR.current) wR.current.rotation.z = -Math.sin(t * 30) * 0.6 - 0.3;
  });
  return (
    <group ref={root}>
      <M s={[0.22, 0.2, 0.3]} c="#bfeef2" e={0.7} glow="#8ff2ff" />
      <M p={[0, 0, 0.17]} s={[0.16, 0.14, 0.06]} c="#20454a" />
      <M p={[-0.05, 0.02, 0.21]} s={[0.03, 0.04, 0.02]} c="#c8fbff" e={1.5} glow="#c8fbff" />
      <M p={[0.05, 0.02, 0.21]} s={[0.03, 0.04, 0.02]} c="#c8fbff" e={1.5} glow="#c8fbff" />
      <M p={[0, 0.14, 0]} s={[0.3, 0.02, 0.2]} c="#e8feff" e={0.6} glow="#c8fbff" refFn={(m) => (wL.current = m)} />
      <M p={[0, 0.16, 0]} s={[0.3, 0.02, 0.2]} c="#e8feff" e={0.6} glow="#c8fbff" refFn={(m) => (wR.current = m)} />
    </group>
  );
}

/* ── Antlerling ── */
export function Antlerling({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime * 2;
    root.current.position.y = Math.abs(Math.sin(t)) * 0.06;
    root.current.rotation.y = Math.sin(t * 0.25) * 0.7;
  });
  return (
    <group ref={root}>
      <M p={[0, 0.55, 0]} s={[0.42, 0.4, 0.7]} c="#c8a888" />
      <M p={[0, 0.95, 0.42]} s={[0.26, 0.26, 0.26]} c="#d4b494" />
      <M p={[-0.07, 0.98, 0.56]} s={[0.04, 0.04, 0.02]} c="#2a2018" />
      <M p={[0.07, 0.98, 0.56]} s={[0.04, 0.04, 0.02]} c="#2a2018" />
      <M p={[-0.1, 1.2, 0.4]} s={[0.05, 0.3, 0.05]} c="#e8d8c0" r={[0, 0, 0.3]} />
      <M p={[0.1, 1.2, 0.4]} s={[0.05, 0.3, 0.05]} c="#e8d8c0" r={[0, 0, -0.3]} />
      <M p={[-0.16, 1.34, 0.4]} s={[0.14, 0.05, 0.05]} c="#e8d8c0" />
      <M p={[0.16, 1.34, 0.4]} s={[0.14, 0.05, 0.05]} c="#e8d8c0" />
      {[[-0.14, 0.25], [0.14, 0.25], [-0.14, -0.28], [0.14, -0.28]].map((p, i) => (
        <M key={i} p={[p[0], 0.2, p[1]]} s={[0.09, 0.4, 0.09]} c="#a88868" />
      ))}
      <M p={[0, 0.6, -0.42]} s={[0.06, 0.14, 0.06]} c="#b09070" />
    </group>
  );
}

/* ── Watchling: floating cube sentinel ── */
export function Watchling({ animated }: { animated?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const eye = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !root.current) return;
    const t = clock.elapsedTime;
    root.current.position.y = 1.1 + Math.sin(t * 2) * 0.1;
    root.current.rotation.y = t * 0.8;
    if (eye.current) eye.current.position.x = Math.sin(t * 3) * 0.08;
  });
  return (
    <group ref={root}>
      <M s={[0.4, 0.4, 0.4]} c="#2a2a35" />
      <M p={[0, 0, 0.21]} s={[0.26, 0.26, 0.03]} c="#0e0e16" />
      <M p={[0, 0, 0.23]} s={[0.1, 0.1, 0.02]} c="#9fe8ff" e={1.6} glow="#9fe8ff" refFn={(m) => (eye.current = m)} />
      <M p={[0, 0.26, 0]} s={[0.1, 0.12, 0.1]} c="#35e0d0" e={0.8} glow="#35e0d0" />
    </group>
  );
}

export function MobMesh({ id, animated = true }: { id: string; animated?: boolean }) {
  switch (id) {
    case "blub": return <Blub animated={animated} />;
    case "licker": return <Licker animated={animated} />;
    case "overseer": return <Overseer animated={animated} />;
    case "twisted_warden": return <TwistedWarden animated={animated} />;
    case "drift_jelly": return <DriftJelly animated={animated} />;
    case "note_bird": return <NoteBird animated={animated} />;
    case "singer": return <Singer animated={animated} />;
    case "sculker": return <Sculker animated={animated} />;
    case "sculkling": return <Sculker animated={animated} small />;
    case "soul_bee": return <SoulBee animated={animated} />;
    case "antlerling": return <Antlerling animated={animated} />;
    case "watchling": return <Watchling animated={animated} />;
    default: return <Blub animated={animated} />;
  }
}
