import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { seededRandom } from "../utils/rand";
import { type EnvState } from "../game/bus";
import { WorldSky } from "./SkySystems";
import { Ocean } from "./Ocean";
import { SkyWhales, WaterfallCliffs } from "./Landmarks";
import type { LayerProps } from "./Layers";

/* ------------------------------------------------------------------ */
/* Terrain shape — shared with the player controller                    */
/* ------------------------------------------------------------------ */

export function verdantHeight(x: number, z: number): number {
  const valley = Math.sin(x * 0.02) * Math.cos(z * 0.016) * 3.4;
  const dunes = Math.sin(x * 0.075 + 1.7) * Math.cos(z * 0.062 - 0.4) * 1.1;
  const detail = Math.sin(x * 0.19 - z * 0.13) * 0.22;
  const rim = Math.max(0, (Math.hypot(x, z) - 210) * 0.16);
  return valley + dunes + detail - 2.4 + rim;
}

/* ------------------------------------------------------------------ */
/* Terrain mesh                                                         */
/* ------------------------------------------------------------------ */

function Terrain() {
  const geometry = useMemo(() => {
    const size = 640;
    const segments = 150;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const attr = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(attr.count * 3);
    const sand = new THREE.Color("#b39a68");
    const shore = new THREE.Color("#4f8f68");
    const grass = new THREE.Color("#2e6b52");
    const moss = new THREE.Color("#3f8f68");
    const rock = new THREE.Color("#4a4e58");
    const peak = new THREE.Color("#aab4c0");
    const color = new THREE.Color();
    for (let i = 0; i < attr.count; i += 1) {
      const x = attr.getX(i);
      const z = attr.getZ(i);
      const y = verdantHeight(x, z);
      attr.setY(i, y);
      if (y < -1.9) color.copy(sand);
      else if (y < -1.2) color.copy(shore);
      else if (y < 2.4) color.copy(grass).lerp(moss, (Math.sin(x * 0.3) + 1) * 0.5);
      else if (y < 5.4) color.copy(rock);
      else color.copy(peak);
      color.multiplyScalar(0.92 + Math.sin(x * 12.9898 + z * 78.233) * 0.08);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.94} metalness={0.02} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Flora — glowing reeds, alien trees, resonant crystals                */
/* ------------------------------------------------------------------ */

function Flora({ seed, quality }: { seed: string; quality: LayerProps["quality"] }) {
  const reeds = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);
  const crystals = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const random = seededRandom(seed, "verdant-flora");
    const dummy = new THREE.Object3D();
    const reeds: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const canopies: THREE.Matrix4[] = [];
    const crystals: THREE.Matrix4[] = [];
    const reedCount = quality === "low" ? 420 : quality === "medium" ? 750 : 1150;
    for (let i = 0; i < reedCount; i += 1) {
      const x = (random() - 0.5) * 460;
      const z = (random() - 0.5) * 460;
      const y = verdantHeight(x, z);
      if (y < -2.4 || y > 6) continue;
      dummy.position.set(x, y + 0.55, z);
      dummy.rotation.set((random() - 0.5) * 0.24, random() * Math.PI, (random() - 0.5) * 0.24);
      dummy.scale.setScalar(0.7 + random() * 0.9);
      dummy.updateMatrix();
      reeds.push(dummy.matrix.clone());
    }
    const treeCount = quality === "low" ? 70 : 150;
    for (let i = 0; i < treeCount; i += 1) {
      const x = (random() - 0.5) * 420;
      const z = (random() - 0.5) * 420;
      const y = verdantHeight(x, z);
      if (y < 0.2 || y > 7) continue;
      const scale = 1.6 + random() * 2.6;
      dummy.position.set(x, y + scale * 0.9, z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.set(scale * 0.24, scale * 0.9, scale * 0.24);
      dummy.updateMatrix();
      trunks.push(dummy.matrix.clone());
      dummy.position.set(x, y + scale * 1.9, z);
      dummy.scale.setScalar(scale * (0.85 + random() * 0.5));
      dummy.updateMatrix();
      canopies.push(dummy.matrix.clone());
    }
    const crystalCount = 54;
    for (let i = 0; i < crystalCount; i += 1) {
      const x = (random() - 0.5) * 430;
      const z = (random() - 0.5) * 430;
      const y = verdantHeight(x, z);
      if (y < 2.4) continue;
      dummy.position.set(x, y + 0.5, z);
      dummy.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.6);
      dummy.scale.set(0.3 + random() * 0.7, 0.9 + random() * 2.2, 0.3 + random() * 0.7);
      dummy.updateMatrix();
      crystals.push(dummy.matrix.clone());
    }
    return { reeds, trunks, canopies, crystals };
  }, [seed, quality]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const apply = (mesh: THREE.InstancedMesh | null, matrices: THREE.Matrix4[]) => {
      if (!mesh) return;
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.count = matrices.length;
      mesh.instanceMatrix.needsUpdate = true;
    };
    apply(reeds.current, data.reeds);
    apply(trunks.current, data.trunks);
    apply(canopies.current, data.canopies);
    apply(crystals.current, data.crystals);
    if (canopies.current) {
      const color = new THREE.Color();
      data.canopies.forEach((_, index) => {
        color.setHSL(0.38 + (index % 7) * 0.024, 0.55, 0.4 + (index % 5) * 0.05);
        canopies.current!.setColorAt(index, color);
      });
      canopies.current.instanceColor!.needsUpdate = true;
    }
    void dummy;
  }, [data]);

  const sway = useRef<THREE.ShaderMaterial | null>(null);
  void sway;

  return (
    <group>
      <instancedMesh ref={reeds} args={[undefined, undefined, Math.max(1, data.reeds.length)]} castShadow>
        <coneGeometry args={[0.05, 1.25, 5]} />
        <meshStandardMaterial color="#5fd8a8" emissive="#2f8f6a" emissiveIntensity={0.35} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, Math.max(1, data.trunks.length)]} castShadow>
        <cylinderGeometry args={[0.7, 1, 2, 6]} />
        <meshStandardMaterial color="#3a3230" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, Math.max(1, data.canopies.length)]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.75} flatShading />
      </instancedMesh>
      <instancedMesh ref={crystals} args={[undefined, undefined, Math.max(1, data.crystals.length)]}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#b28aff" emissive="#8a5aff" emissiveIntensity={1.4} roughness={0.15} metalness={0.4} transparent opacity={0.92} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Grazers — gentle six-legged valley fauna                             */
/* ------------------------------------------------------------------ */

function Grazers({ seed }: { seed: string }) {
  const group = useRef<THREE.Group>(null);
  const beasts = useMemo(() => {
    const random = seededRandom(seed, "verdant-grazers");
    return Array.from({ length: 16 }, (_, index) => ({
      id: index,
      anchor: [(random() - 0.5) * 300, 0, (random() - 0.5) * 300] as [number, number, number],
      angle: random() * Math.PI * 2,
      speed: 0.14 + random() * 0.2,
      scale: 0.7 + random() * 0.9,
      hue: 0.36 + random() * 0.3,
      phase: random() * Math.PI * 2,
    }));
  }, [seed]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, index) => {
      const beast = beasts[index];
      if (!beast) return;
      beast.angle += Math.sin(t * 0.24 + beast.phase) * delta * 0.4;
      const x = beast.anchor[0] + Math.cos(beast.angle) * t * beast.speed * 2.2;
      const z = beast.anchor[2] + Math.sin(beast.angle) * t * beast.speed * 2.2;
      const y = verdantHeight(x, z) + 0.62 * beast.scale;
      child.position.set(x, y + Math.abs(Math.sin(t * 3 + beast.phase)) * 0.05, z);
      child.rotation.y = -beast.angle + Math.PI / 2;
      child.rotation.z = Math.sin(t * 2.6 + beast.phase) * 0.04;
    });
  });

  return (
    <group ref={group}>
      {beasts.map((beast) => (
        <group key={beast.id} scale={beast.scale}>
          <mesh scale={[1, 0.72, 1.35]} castShadow>
            <sphereGeometry args={[0.55, 14, 10]} />
            <meshStandardMaterial color={new THREE.Color().setHSL(beast.hue, 0.42, 0.55)} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.16, 0.62]} scale={0.3}>
            <sphereGeometry args={[0.55, 10, 8]} />
            <meshStandardMaterial color={new THREE.Color().setHSL(beast.hue, 0.42, 0.62)} roughness={0.85} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.16, 0.22, 0.74]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshBasicMaterial color="#eafff4" toneMapped={false} />
            </mesh>
          ))}
          {[[-0.3, 0.42], [0.3, 0.42], [-0.3, -0.4], [0.3, -0.4], [-0.18, 0], [0.18, 0]].map(([side, fore], leg) => (
            <mesh key={leg} position={[side * 0.42, -0.34, fore * 0.5]}>
              <cylinderGeometry args={[0.045, 0.03, 0.55, 5]} />
              <meshStandardMaterial color="#3a3230" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, -0.1, -0.72]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.1, 0.5, 6]} />
            <meshStandardMaterial color={new THREE.Color().setHSL(beast.hue, 0.5, 0.4)} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Drifting spores                                                      */
/* ------------------------------------------------------------------ */

function Spores({ seed }: { seed: string }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(seed, "verdant-spores");
    const count = 340;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 120;
      pos[i * 3 + 1] = random() * 22 - 1;
      pos[i * 3 + 2] = (random() - 0.5) * 120;
    }
    return pos;
  }, [seed]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.008;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.2) * 0.6;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d9ffe9" size={0.14} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* The Verdant Expanse layer                                            */
/* ------------------------------------------------------------------ */

export function VerdantLayer({ seed, quality, env, portalSlot }: LayerProps & { env: EnvState }) {
  return (
    <>
      <WorldSky env={env} seed={seed} quality={quality} dayStart={0.33} />
      <Terrain />
      <Ocean env={env} seed={seed} quality={quality} />
      <WaterfallCliffs seed={seed} env={env} />
      <SkyWhales seed={seed} />
      <Flora seed={seed} quality={quality} />
      <Grazers seed={seed} />
      <Spores seed={seed} />
      {portalSlot}
    </>
  );
}
