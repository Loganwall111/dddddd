import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CreatureDefinition } from "../game/procedural";

interface CreatureModelProps {
  creature: CreatureDefinition;
  position?: [number, number, number];
  scale?: number;
  active?: boolean;
  reducedMotion?: boolean;
}

function BioMaterial({ creature, emissive = 0.35 }: { creature: CreatureDefinition; emissive?: number }) {
  const color = useMemo(() => new THREE.Color().setHSL(creature.hue / 360, 0.55, 0.56), [creature.hue]);
  const glow = useMemo(() => new THREE.Color().setHSL(((creature.hue + 30) % 360) / 360, 0.8, 0.42), [creature.hue]);
  return (
    <meshPhysicalMaterial
      color={color}
      emissive={glow}
      emissiveIntensity={emissive}
      roughness={0.28}
      metalness={creature.bodyPlan === "crystalline" ? 0.38 : 0.05}
      clearcoat={0.7}
      clearcoatRoughness={0.2}
      transparent={creature.bodyPlan === "plasma"}
      opacity={creature.bodyPlan === "plasma" ? 0.78 : 1}
    />
  );
}

export function CreatureModel({ creature, position = [0, 0, 0], scale = 1, active = false, reducedMotion = false }: CreatureModelProps) {
  const root = useRef<THREE.Group>(null);
  const feelers = useRef<THREE.Group>(null);
  const limbCount = Math.min(creature.limbs, 10);

  useFrame(({ clock }, delta) => {
    if (!root.current || reducedMotion) return;
    const time = clock.elapsedTime;
    root.current.rotation.y += delta * (active ? 0.24 : 0.08);
    root.current.rotation.z = Math.sin(time * 0.7 + creature.id) * 0.045;
    root.current.position.y = position[1] + Math.sin(time * 1.1 + creature.id) * (active ? 0.08 : 0.025);
    if (feelers.current) feelers.current.rotation.y = Math.sin(time * 1.7) * 0.18;
  });

  const radialLimbs = Array.from({ length: limbCount }, (_, index) => {
    const angle = (index / limbCount) * Math.PI * 2;
    return { angle, x: Math.cos(angle) * 0.82, z: Math.sin(angle) * 0.82 };
  });
  const segments = Array.from({ length: Math.min(creature.segments, 6) }, (_, index) => index);

  return (
    <group ref={root} position={position} scale={scale * creature.scale}>
      {creature.bodyPlan === "crystalline" ? (
        <mesh castShadow>
          <icosahedronGeometry args={[0.78, 1]} />
          <BioMaterial creature={creature} emissive={0.6} />
        </mesh>
      ) : creature.bodyPlan === "fractal" ? (
        <group>
          <mesh castShadow scale={[1.15, 0.48, 0.7]}>
            <dodecahedronGeometry args={[0.7, 0]} />
            <BioMaterial creature={creature} emissive={0.42} />
          </mesh>
          {radialLimbs.slice(0, 6).map(({ angle, x, z }, index) => (
            <mesh key={index} position={[x * 0.74, Math.sin(index) * 0.12, z * 0.74]} scale={0.28} rotation={[angle, angle, 0]}>
              <dodecahedronGeometry args={[0.8, 0]} />
              <BioMaterial creature={creature} emissive={0.55} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh castShadow scale={creature.bodyPlan === "bilateral" ? [1.16, 0.64, 0.58] : [0.9, 0.78, 0.9]}>
          <sphereGeometry args={[0.78, 32, 24]} />
          <BioMaterial creature={creature} emissive={creature.bodyPlan === "plasma" ? 1.2 : 0.35} />
        </mesh>
      )}

      {creature.bodyPlan === "colonial" && segments.map((segment) => {
        const angle = (segment / Math.max(segments.length, 1)) * Math.PI * 2;
        return (
          <mesh key={segment} position={[Math.cos(angle) * 0.7, Math.sin(angle * 2) * 0.22, Math.sin(angle) * 0.7]} scale={0.34 + segment * 0.015}>
            <sphereGeometry args={[0.7, 18, 14]} />
            <BioMaterial creature={creature} emissive={0.7} />
          </mesh>
        );
      })}

      <group ref={feelers}>
        {radialLimbs.map(({ angle, x, z }, index) => (
          <group key={index} rotation={[0, -angle, 0]} position={[x * 0.5, -0.05 + (index % 2) * 0.1, z * 0.5]}>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0.52, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.105, 1.05 + (index % 3) * 0.12, 8]} />
              <BioMaterial creature={creature} emissive={0.45} />
            </mesh>
            <mesh position={[1.03, 0, 0]} scale={0.11 + (index % 2) * 0.04}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color={index % 2 ? "#eaffff" : "#c8ff85"} />
            </mesh>
          </group>
        ))}
      </group>

      <group position={[0.52, 0.18, 0.48]}>
        <mesh position={[-0.18, 0, 0]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color="#f5fff7" />
        </mesh>
        <mesh position={[0.18, 0, 0]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color="#f5fff7" />
        </mesh>
      </group>

      <pointLight color={new THREE.Color().setHSL(creature.hue / 360, 0.9, 0.62)} intensity={active ? 2 : 0.55} distance={4} />
    </group>
  );
}