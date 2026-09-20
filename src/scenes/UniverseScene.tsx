import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, GodRays, Noise } from "@react-three/postprocessing";
import { Float, Sparkles } from "@react-three/drei";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { creatures, seededRandom } from "../game/procedural";
import { CreatureModel } from "../components/CreatureModel";

function StarField({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const [positions, colors] = useMemo(() => {
    const random = seededRandom(seed, "menu-stars");
    const count = 4200;
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const radius = 16 + random() * 95;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi) * 0.65;
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.52 + random() * 0.22, 0.4 + random() * 0.5, 0.6 + random() * 0.35);
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
    }
    return [pos, cols];
  }, [seed]);

  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.003;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} vertexColors transparent opacity={0.78} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function CelestialRingPlanet({ reducedMotion }: { reducedMotion: boolean }) {
  const planetRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    if (planetRef.current) planetRef.current.rotation.y = t * 0.02;
    if (ringsRef.current) ringsRef.current.rotation.z = t * 0.035;
  });

  return (
    <group ref={planetRef} position={[9.5, 3.8, -14]} rotation={[0.4, 0.2, -0.3]}>
      {/* Planet Sphere */}
      <mesh>
        <sphereGeometry args={[2.8, 36, 28]} />
        <meshPhysicalMaterial
          color="#1e1b4b"
          emissive="#3b82f6"
          emissiveIntensity={0.25}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>
      {/* Atmosphere Glow Halo */}
      <mesh scale={1.08}>
        <sphereGeometry args={[2.8, 28, 20]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.15} side={THREE.BackSide} />
      </mesh>
      {/* Planet Rings */}
      <mesh ref={ringsRef} rotation={[Math.PI / 2.3, 0, 0]}>
        <ringGeometry args={[3.8, 6.2, 64]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ShootingStars({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.LineSegments>(null);
  const [positions] = useMemo(() => {
    const pos = new Float32Array(12 * 6);
    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = 5 + Math.random() * 20;
      const z = -10 - Math.random() * 30;
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x - 4;
      pos[i * 6 + 4] = y - 3;
      pos[i * 6 + 5] = z;
    }
    return [pos];
  }, []);

  useFrame((_, delta) => {
    if (!ref.current || reducedMotion) return;
    const posAttr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < 12; i++) {
      arr[i * 6] += delta * -16;
      arr[i * 6 + 1] += delta * -12;
      arr[i * 6 + 3] += delta * -16;
      arr[i * 6 + 4] += delta * -12;
      if (arr[i * 6 + 1] < -15) {
        const x = 15 + Math.random() * 30;
        const y = 15 + Math.random() * 15;
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 3] = x - 4;
        arr[i * 6 + 4] = y - 3;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#e0f2fe" transparent opacity={0.65} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

function SwirlingNebula({ seed }: { seed: string }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(seed, "swirling-nebula");
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const arm = (i % 4) * (Math.PI / 2);
      const distance = 1.5 + random() * 16;
      const angle = arm + distance * 0.42 + (random() - 0.5) * 0.8;
      pos[i * 3] = 2.5 + Math.cos(angle) * distance;
      pos[i * 3 + 1] = (random() - 0.5) * (2.2 + distance * 0.28);
      pos[i * 3 + 2] = -9 + Math.sin(angle) * distance;
    }
    return pos;
  }, [seed]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = clock.elapsedTime * 0.015;
  });

  return (
    <points ref={ref} rotation={[0.4, -0.15, -0.2]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a855f7" size={0.34} transparent opacity={0.24} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function AsteroidField({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const count = 28;

  const asteroids = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      pos: [
        -12 + (i % 7) * 3.8 + (Math.random() - 0.5) * 2,
        -4 + Math.floor(i / 7) * 2.8 + (Math.random() - 0.5) * 2,
        -11 + (Math.random() - 0.5) * 6,
      ] as [number, number, number],
      rotSpeed: [Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5] as [number, number, number],
      scale: 0.18 + Math.random() * 0.35,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return;
    group.current.children.forEach((child, idx) => {
      const a = asteroids[idx];
      child.rotation.x += delta * a.rotSpeed[0];
      child.rotation.y += delta * a.rotSpeed[1];
    });
  });

  return (
    <group ref={group}>
      {asteroids.map((a) => (
        <mesh key={a.id} position={a.pos} scale={a.scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function ForegroundMotes({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(seed, "foreground-motes");
    const count = 450;
    const pos = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      pos[index * 3] = (random() - 0.5) * 28;
      pos[index * 3 + 1] = (random() - 0.5) * 16;
      pos[index * 3 + 2] = 1 + random() * 11;
    }
    return pos;
  }, [seed]);

  useFrame(({ clock }, delta) => {
    if (!ref.current || reducedMotion) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.08) * 0.025;
    ref.current.position.y += delta * 0.03;
    if (ref.current.position.y > 1.2) ref.current.position.y = -1.2;
  });

  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#67e8f9" size={0.022} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function MenuCreatureProcession({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const set = useMemo(() => {
    const random = seededRandom(seed, "menu-procession");
    return [2, 23, 41, 66, 89, 107].map((creatureIndex, slot) => ({
      creature: creatures[creatureIndex % creatures.length],
      base: [8.5 + slot * 2.2 + (random() - 0.5) * 1.4, -3.2 + (random() - 0.5) * 2.4, -8 - slot * 3.5] as [number, number, number],
      scale: 0.38 + random() * 0.45,
      speed: 0.08 + random() * 0.14,
      phase: random() * Math.PI * 2,
    }));
  }, [seed]);

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const time = clock.elapsedTime;
    group.current.children.forEach((child, slot) => {
      const item = set[slot];
      const drift = ((time * item.speed + item.phase) % (Math.PI * 2));
      child.position.x = item.base[0] - drift * 2.4;
      child.position.y = item.base[1] + Math.sin(time * 0.6 + item.phase) * 0.35;
      child.position.z = item.base[2] + Math.cos(drift * 0.8) * 1.2;
      if (child.position.x < -18) child.position.x = 18;
    });
  });

  return (
    <group ref={group}>
      {set.map((item) => (
        <Float key={item.creature.id} speed={reducedMotion ? 0 : 2.2} rotationIntensity={reducedMotion ? 0 : 0.6} floatIntensity={reducedMotion ? 0 : 0.9}>
          <CreatureModel creature={item.creature} scale={item.scale} reducedMotion={reducedMotion} />
        </Float>
      ))}
    </group>
  );
}

function InteractiveParallaxCamera({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame(({ camera, pointer, clock }) => {
    if (reducedMotion) return;
    camera.position.x += (pointer.x * 0.65 - camera.position.x) * 0.02;
    camera.position.y += (pointer.y * 0.45 - camera.position.y) * 0.02;
    camera.rotation.z = Math.sin(clock.elapsedTime * 0.1) * 0.008;
  });
  return null;
}

interface UniverseSceneProps {
  seed: string;
  reducedMotion?: boolean;
  quality?: "low" | "medium" | "ultra";
}

function MenuEffects({ quality }: Pick<UniverseSceneProps, "quality">) {
  const [sun, setSun] = useState<THREE.Mesh | null>(null);
  return (
    <>
      <mesh ref={setSun} position={[5.05, 2.35, -4.6]} scale={0.76}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color="#fff5df" transparent opacity={0.68} depthWrite={false} toneMapped={false} />
      </mesh>
      <EffectComposer multisampling={quality === "ultra" ? 4 : 0}>
        {sun && <GodRays sun={sun} samples={quality === "ultra" ? 60 : 32} density={0.96} decay={0.93} weight={0.32} exposure={0.42} clampMax={1} blur />}
        <Bloom intensity={1.15} luminanceThreshold={0.35} luminanceSmoothing={0.75} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.00025, 0.00018)} radialModulation modulationOffset={0.65} />
        <Noise opacity={0.018} blendFunction={BlendFunction.SOFT_LIGHT} />
      </EffectComposer>
    </>
  );
}

export function UniverseScene({ seed, reducedMotion = false, quality = "ultra" }: UniverseSceneProps) {
  return (
    <Canvas
      dpr={quality === "low" ? 1 : [1, quality === "ultra" ? 1.8 : 1.35]}
      camera={{ position: [0, 0, 12], fov: 48, near: 0.1, far: 200 }}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance", alpha: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <fog attach="fog" args={["#060814", 16, 95]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[-5, 7, 9]} color="#bae6fd" intensity={1.6} />
      <pointLight position={[9, 4, -12]} color="#60a5fa" intensity={2.5} distance={25} />

      <StarField seed={seed} reducedMotion={reducedMotion} />
      <CelestialRingPlanet reducedMotion={reducedMotion} />
      <ShootingStars reducedMotion={reducedMotion} />
      <SwirlingNebula seed={seed} />
      <AsteroidField reducedMotion={reducedMotion} />
      <ForegroundMotes seed={seed} reducedMotion={reducedMotion} />
      <MenuCreatureProcession seed={seed} reducedMotion={reducedMotion} />

      <Sparkles count={220} position={[6, -1, -10]} scale={[30, 16, 32]} size={2.0} speed={0.3} color="#93c5fd" opacity={0.5} />
      <InteractiveParallaxCamera reducedMotion={reducedMotion} />
      {quality !== "low" && <MenuEffects quality={quality} />}
    </Canvas>
  );
}
