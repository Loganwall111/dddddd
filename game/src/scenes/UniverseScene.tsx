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
    const pos = new Float32Array(3200 * 3);
    const cols = new Float32Array(3200 * 3);
    const color = new THREE.Color();
    for (let i = 0; i < 3200; i += 1) {
      const radius = 18 + random() * 84;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi) * 0.58;
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.53 + random() * 0.17, 0.25 + random() * 0.6, 0.58 + random() * 0.38);
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
    }
    return [pos, cols];
  }, [seed]);

  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.0025;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.065} vertexColors transparent opacity={0.72} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Nebula({ seed }: { seed: string }) {
  const positions = useMemo(() => {
    const random = seededRandom(seed, "nebula");
    const pos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i += 1) {
      const arm = (i % 3) * (Math.PI * 2 / 3);
      const distance = random() * 13;
      const angle = arm + distance * 0.36 + (random() - 0.5) * 0.7;
      pos[i * 3] = 3.2 + Math.cos(angle) * distance;
      pos[i * 3 + 1] = (random() - 0.5) * (1.2 + distance * 0.22);
      pos[i * 3 + 2] = -7 + Math.sin(angle) * distance;
    }
    return pos;
  }, [seed]);
  return (
    <points rotation={[0.35, -0.1, -0.22]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8271bd" size={0.28} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function ForegroundMotes({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(seed, "foreground-motes");
    const pos = new Float32Array(380 * 3);
    for (let index = 0; index < 380; index += 1) {
      pos[index * 3] = (random() - 0.5) * 25;
      pos[index * 3 + 1] = (random() - 0.5) * 13;
      pos[index * 3 + 2] = 1 + random() * 10;
    }
    return pos;
  }, [seed]);
  useFrame(({ clock }, delta) => {
    if (!ref.current || reducedMotion) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.08) * 0.025;
    ref.current.position.y += delta * 0.025;
    if (ref.current.position.y > 1) ref.current.position.y = -1;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#baffef" size={0.018} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function GravitationalArcs({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!root.current || reducedMotion) return;
    root.current.rotation.z = -0.34 + Math.sin(clock.elapsedTime * 0.17) * 0.012;
  });
  return (
    <group ref={root} position={[5.2, 2.65, -3]} rotation={[1.18, 0.14, -0.34]}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} scale={1 + index * 0.16}>
          <torusGeometry args={[2.1, 0.012 + index * 0.006, 8, 180, Math.PI * 1.48]} />
          <meshBasicMaterial color={index === 0 ? "#fff4d7" : "#af91ff"} transparent opacity={0.24 - index * 0.05} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Structures({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    group.current.rotation.x = clock.elapsedTime * 0.035;
    group.current.rotation.y = clock.elapsedTime * -0.06;
  });
  return (
    <group ref={group} position={[-5.6, 2.8, -6]}>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh key={index} scale={1 + index * 0.52} rotation={[index * 0.5, index * 0.24, 0]}>
          <torusKnotGeometry args={[0.58, 0.012, 90, 5, 2 + index, 3]} />
          <meshBasicMaterial color={index % 2 ? "#c6f4ff" : "#8d74ff"} transparent opacity={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function MenuCreatureProcession({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const set = useMemo(() => {
    const random = seededRandom(seed, "menu-procession");
    return [2, 23, 41, 66, 89, 107].map((creatureIndex, slot) => ({
      creature: creatures[creatureIndex % creatures.length],
      base: [7.5 + slot * 2.1 + (random() - 0.5) * 1.4, -3.2 + (random() - 0.5) * 2.4, -8 - slot * 3.5] as [number, number, number],
      scale: 0.35 + random() * 0.45,
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
      child.position.x = item.base[0] - drift * 2.2;
      child.position.y = item.base[1] + Math.sin(time * 0.6 + item.phase) * 0.35;
      child.position.z = item.base[2] + Math.cos(drift * 0.8) * 1.2;
      if (child.position.x < -16) child.position.x = 16;
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

function CameraDrift({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame(({ camera, pointer, clock }) => {
    if (reducedMotion) return;
    camera.position.x += (pointer.x * 0.32 - camera.position.x) * 0.007;
    camera.position.y += (pointer.y * 0.2 - camera.position.y) * 0.007;
    camera.rotation.z = Math.sin(clock.elapsedTime * 0.09) * 0.006;
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
        <Bloom intensity={1.05} luminanceThreshold={0.4} luminanceSmoothing={0.74} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.00022, 0.00016)} radialModulation modulationOffset={0.65} />
        <Noise opacity={0.018} blendFunction={BlendFunction.SOFT_LIGHT} />
      </EffectComposer>
    </>
  );
}

export function UniverseScene({ seed, reducedMotion = false, quality = "ultra" }: UniverseSceneProps) {
  return (
    <Canvas
      dpr={quality === "low" ? 1 : [1, quality === "ultra" ? 1.8 : 1.35]}
      camera={{ position: [0, 0, 12], fov: 48, near: 0.1, far: 180 }}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance", alpha: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <fog attach="fog" args={["#090814", 18, 82]} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[-4, 6, 8]} color="#d7e9ff" intensity={1.4} />
      <StarField seed={seed} reducedMotion={reducedMotion} />
      <Nebula seed={seed} />
      <Structures reducedMotion={reducedMotion} />
      <ForegroundMotes seed={seed} reducedMotion={reducedMotion} />
      <GravitationalArcs reducedMotion={reducedMotion} />
      <MenuCreatureProcession seed={seed} reducedMotion={reducedMotion} />
      <Sparkles count={180} position={[8, -2, -12]} scale={[26, 14, 30]} size={1.8} speed={0.25} color="#b8d8ff" opacity={0.45} />
      <CameraDrift reducedMotion={reducedMotion} />
      {quality !== "low" && <MenuEffects quality={quality} />}
    </Canvas>
  );
}