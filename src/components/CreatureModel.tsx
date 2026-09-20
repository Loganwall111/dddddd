import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CreatureDefinition, CustomCreatureConfig } from "../game/procedural";

interface CreatureModelProps {
  creature?: CreatureDefinition;
  custom?: CustomCreatureConfig;
  position?: [number, number, number];
  scale?: number;
  active?: boolean;
  reducedMotion?: boolean;
  animationMode?: "idle" | "attack" | "defend" | "spin";
}

function resolveCreature(creature?: CreatureDefinition, custom?: CustomCreatureConfig) {
  if (custom) return custom;
  const c = creature!;
  return {
    name: c.genus,
    bodyPlan: c.bodyPlan,
    hue: c.hue,
    accentHue: (c.hue + 140) % 360,
    saturation: 75,
    lightness: 55,
    emissiveIntensity: 0.75,
    emissiveHue: (c.hue + 35) % 360,
    finish: (c.bodyPlan === "crystalline" ? "crystal" : c.bodyPlan === "plasma" ? "holographic" : "organic") as CustomCreatureConfig["finish"],
    pattern: "biolum-veins" as CustomCreatureConfig["pattern"],
    headwear: "none" as CustomCreatureConfig["headwear"],
    outfit: "none" as CustomCreatureConfig["outfit"],
    backWings: "none" as CustomCreatureConfig["backWings"],
    accessory: "none" as CustomCreatureConfig["accessory"],
    eyeType: "two" as CustomCreatureConfig["eyeType"],
    eyeColor: "#6ee7b7",
    scale: c.scale || 1.0,
    limbs: Math.min(c.limbs || 4, 10),
    segments: Math.min(c.segments || 3, 6),
    spineArch: 0,
    tailLength: 1.0,
    auraIntensity: 0.6,
  };
}

export function CreatureModel({
  creature,
  custom,
  position = [0, 0, 0],
  scale = 1,
  active = false,
  reducedMotion = false,
  animationMode = "idle",
}: CreatureModelProps) {
  const config = useMemo(() => resolveCreature(creature, custom), [creature, custom]);
  const root = useRef<THREE.Group>(null);
  const limbsGroup = useRef<THREE.Group>(null);
  const wingsGroup = useRef<THREE.Group>(null);
  const orbsGroup = useRef<THREE.Group>(null);
  const haloGroup = useRef<THREE.Group>(null);

  // Colors and Materials based on finish and hues
  const { bodyColor, accentColor, glowColor, materialProps } = useMemo(() => {
    const primary = new THREE.Color().setHSL(config.hue / 360, config.saturation / 100, config.lightness / 100);
    const accent = new THREE.Color().setHSL(config.accentHue / 360, 0.85, 0.6);
    const glow = new THREE.Color().setHSL(config.emissiveHue / 360, 0.95, 0.55);

    let props: Partial<THREE.MeshPhysicalMaterialParameters> = {
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      emissive: glow,
      emissiveIntensity: config.emissiveIntensity,
    };

    switch (config.finish) {
      case "crystal":
        props = {
          roughness: 0.12,
          metalness: 0.35,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          transmission: 0.35,
          opacity: 0.9,
          transparent: true,
          emissive: glow,
          emissiveIntensity: config.emissiveIntensity * 1.2,
        };
        break;
      case "metallic":
        props = {
          roughness: 0.2,
          metalness: 0.88,
          clearcoat: 0.4,
          emissive: glow,
          emissiveIntensity: config.emissiveIntensity * 0.8,
        };
        break;
      case "void":
        primary.setHSL(config.hue / 360, 0.9, 0.08);
        props = {
          roughness: 0.95,
          metalness: 0.1,
          emissive: glow,
          emissiveIntensity: config.emissiveIntensity * 1.8,
        };
        break;
      case "magma":
        props = {
          roughness: 0.75,
          metalness: 0.2,
          emissive: new THREE.Color("#ff4500"),
          emissiveIntensity: config.emissiveIntensity * 1.5,
        };
        break;
      case "holographic":
        props = {
          roughness: 0.05,
          metalness: 0.2,
          transmission: 0.75,
          transparent: true,
          opacity: 0.75,
          emissive: glow,
          emissiveIntensity: config.emissiveIntensity * 2.2,
        };
        break;
      case "organic":
      default:
        props = {
          roughness: 0.4,
          metalness: 0.05,
          clearcoat: 0.7,
          clearcoatRoughness: 0.3,
          emissive: glow,
          emissiveIntensity: config.emissiveIntensity,
        };
        break;
    }

    return { bodyColor: primary, accentColor: accent, glowColor: glow, materialProps: props };
  }, [config]);

  useFrame(({ clock }, delta) => {
    if (!root.current || reducedMotion) return;
    const time = clock.elapsedTime;

    // Movement & animations
    if (animationMode === "spin") {
      root.current.rotation.y += delta * 3.5;
      root.current.position.y = position[1] + Math.sin(time * 3) * 0.15;
    } else if (animationMode === "attack") {
      root.current.rotation.y = Math.sin(time * 6) * 0.35;
      root.current.position.y = position[1] + Math.abs(Math.sin(time * 5)) * 0.2;
      root.current.position.z = Math.sin(time * 5) * 0.25;
    } else if (animationMode === "defend") {
      root.current.rotation.x = 0.35;
      root.current.scale.setScalar((scale * config.scale) * 0.92);
      root.current.position.y = position[1] - 0.1;
    } else {
      // Idle
      root.current.rotation.y += delta * (active ? 0.35 : 0.12);
      root.current.rotation.z = Math.sin(time * 0.8) * 0.04;
      root.current.position.y = position[1] + Math.sin(time * 1.4) * (active ? 0.09 : 0.04);
    }

    // Wings flapping
    if (wingsGroup.current) {
      const flap = Math.sin(time * (animationMode === "attack" ? 14 : 7)) * 0.45;
      wingsGroup.current.children.forEach((wing, idx) => {
        wing.rotation.y = (idx % 2 === 0 ? 1 : -1) * (0.35 + flap);
      });
    }

    // Limbs undulation
    if (limbsGroup.current) {
      limbsGroup.current.children.forEach((limb, idx) => {
        limb.rotation.z = Math.sin(time * 2.2 + idx * 0.6) * 0.18;
      });
    }

    // Shield orbs orbit
    if (orbsGroup.current) {
      orbsGroup.current.rotation.y = time * 2.2;
      orbsGroup.current.rotation.x = Math.sin(time * 1.2) * 0.2;
    }

    // Halo spin
    if (haloGroup.current) {
      haloGroup.current.rotation.y = time * 1.1;
      haloGroup.current.rotation.z = Math.sin(time * 0.9) * 0.08;
    }
  });

  const limbCount = Math.max(0, Math.min(config.limbs, 12));
  const radialLimbs = Array.from({ length: limbCount }, (_, index) => {
    const angle = (index / Math.max(limbCount, 1)) * Math.PI * 2;
    return { angle, x: Math.cos(angle) * 0.82, z: Math.sin(angle) * 0.82 };
  });
  const segments = Array.from({ length: Math.max(1, Math.min(config.segments, 8)) }, (_, i) => i);

  return (
    <group ref={root} position={position} scale={scale * config.scale}>
      {/* BASE BODY GEOMETRY ACCORDING TO BODY PLAN */}
      {config.bodyPlan === "crystalline" ? (
        <group>
          <mesh castShadow>
            <octahedronGeometry args={[0.78, 0]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
          <mesh position={[0, 0.45, 0]} scale={0.42} castShadow>
            <icosahedronGeometry args={[0.7, 0]} />
            <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.8} />
          </mesh>
        </group>
      ) : config.bodyPlan === "fractal" ? (
        <group>
          <mesh castShadow scale={[1.15, 0.65, 0.8]}>
            <dodecahedronGeometry args={[0.68, 0]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
          {radialLimbs.slice(0, 6).map(({ angle, x, z }, index) => (
            <mesh key={index} position={[x * 0.65, Math.sin(index * 1.5) * 0.15, z * 0.65]} scale={0.24} rotation={[angle, angle * 0.7, 0]}>
              <dodecahedronGeometry args={[0.8, 0]} />
              <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.6} />
            </mesh>
          ))}
        </group>
      ) : config.bodyPlan === "radial" ? (
        <group>
          <mesh castShadow scale={[0.9, 0.82, 0.9]}>
            <sphereGeometry args={[0.72, 32, 24]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
          {radialLimbs.map(({ angle, x, z }, index) => (
            <mesh key={index} position={[x * 0.5, 0, z * 0.5]} rotation={[0, -angle, Math.PI / 2]} scale={[0.18, 0.45, 0.18]}>
              <coneGeometry args={[0.7, 1.4, 6]} />
              <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.7} />
            </mesh>
          ))}
        </group>
      ) : config.bodyPlan === "colonial" ? (
        <group>
          <mesh castShadow scale={[0.75, 0.65, 0.85]}>
            <sphereGeometry args={[0.65, 24, 20]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
          {segments.map((seg) => {
            const angle = (seg / Math.max(segments.length, 1)) * Math.PI * 2;
            return (
              <mesh key={seg} position={[Math.cos(angle) * 0.68, Math.sin(angle * 2) * 0.18, Math.sin(angle) * 0.68]} scale={0.3 + seg * 0.02}>
                <sphereGeometry args={[0.6, 16, 12]} />
                <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.8} />
              </mesh>
            );
          })}
        </group>
      ) : (
        /* Bilateral / Plasma / Default */
        <group>
          <mesh castShadow scale={config.bodyPlan === "bilateral" ? [1.14, 0.68, 0.72] : [0.85, 0.85, 0.85]}>
            <sphereGeometry args={[0.74, 32, 24]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.22, 0.68]} scale={[0.48, 0.42, 0.48]} castShadow>
            <sphereGeometry args={[0.7, 24, 18]} />
            <meshPhysicalMaterial color={bodyColor} {...materialProps} />
          </mesh>
        </group>
      )}

      {/* EYES */}
      <group position={[0, 0.26, 0.95]}>
        {config.eyeType === "cyclops" ? (
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.13, 20, 16]} />
            <meshBasicMaterial color={config.eyeColor} />
          </mesh>
        ) : config.eyeType === "spider-four" ? (
          <>
            <mesh position={[-0.15, 0.06, 0]}><sphereGeometry args={[0.05, 12, 10]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
            <mesh position={[0.15, 0.06, 0]}><sphereGeometry args={[0.05, 12, 10]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
            <mesh position={[-0.24, -0.04, -0.04]}><sphereGeometry args={[0.04, 12, 10]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
            <mesh position={[0.24, -0.04, -0.04]}><sphereGeometry args={[0.04, 12, 10]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
          </>
        ) : config.eyeType === "hex-six" ? (
          <>
            {[-0.18, 0, 0.18].map((x, i) => (
              <group key={i}>
                <mesh position={[x, 0.08, 0]}><cylinderGeometry args={[0.04, 0.04, 0.04, 6]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
                <mesh position={[x, -0.06, 0]}><cylinderGeometry args={[0.04, 0.04, 0.04, 6]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
              </group>
            ))}
          </>
        ) : config.eyeType === "seraph-ring" ? (
          <group rotation={[Math.PI / 4, 0, 0]}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0]}>
                  <sphereGeometry args={[0.035, 10, 8]} />
                  <meshBasicMaterial color={config.eyeColor} />
                </mesh>
              );
            })}
          </group>
        ) : config.eyeType === "blind-sonar" ? (
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.2, 1]}>
            <torusGeometry args={[0.2, 0.03, 8, 24]} />
            <meshBasicMaterial color={config.eyeColor} />
          </mesh>
        ) : (
          /* Standard 2 eyes */
          <>
            <mesh position={[-0.16, 0.03, 0]}><sphereGeometry args={[0.07, 16, 12]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
            <mesh position={[0.16, 0.03, 0]}><sphereGeometry args={[0.07, 16, 12]} /><meshBasicMaterial color={config.eyeColor} /></mesh>
          </>
        )}
      </group>

      {/* HEADWEAR / HELMS */}
      {config.headwear === "void-crown" && (
        <group position={[0, 0.72, 0.42]}>
          {[-0.24, -0.12, 0, 0.12, 0.24].map((x, i) => (
            <mesh key={i} position={[x, Math.abs(x) * -0.2 + 0.2, 0]} rotation={[0, 0, x * -0.8]} castShadow>
              <coneGeometry args={[0.045, 0.4 + (i === 2 ? 0.2 : 0), 4]} />
              <meshPhysicalMaterial color="#1a0b2e" emissive="#c084fc" emissiveIntensity={1.4} roughness={0.1} />
            </mesh>
          ))}
        </group>
      )}

      {config.headwear === "chrono-visor" && (
        <group position={[0, 0.28, 0.98]}>
          <mesh scale={[0.55, 0.12, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshPhysicalMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.06]} scale={[0.48, 0.04, 0.02]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </group>
      )}

      {config.headwear === "crystal-horns" && (
        <group position={[0, 0.58, 0.52]}>
          <mesh position={[-0.26, 0.24, -0.1]} rotation={[0.4, 0.2, -0.5]}>
            <coneGeometry args={[0.08, 0.65, 5]} />
            <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.9} roughness={0.1} clearcoat={1} />
          </mesh>
          <mesh position={[0.26, 0.24, -0.1]} rotation={[0.4, -0.2, 0.5]}>
            <coneGeometry args={[0.08, 0.65, 5]} />
            <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.9} roughness={0.1} clearcoat={1} />
          </mesh>
        </group>
      )}

      {config.headwear === "biome-antennae" && (
        <group position={[0, 0.54, 0.6]}>
          {[-0.18, 0.18].map((x, i) => (
            <group key={i} position={[x, 0, 0]} rotation={[0.2, i === 0 ? -0.3 : 0.3, i === 0 ? -0.4 : 0.4]}>
              <mesh position={[0, 0.26, 0]}>
                <cylinderGeometry args={[0.02, 0.035, 0.55, 8]} />
                <meshPhysicalMaterial color={bodyColor} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.56, 0]}>
                <sphereGeometry args={[0.07, 14, 10]} />
                <meshBasicMaterial color={glowColor} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {config.headwear === "elder-halo" && (
        <group ref={haloGroup} position={[0, 0.88, 0.35]} rotation={[Math.PI / 6, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.44, 0.03, 12, 36]} />
            <meshPhysicalMaterial color="#fef08a" emissive="#eab308" emissiveIntensity={1.8} metalness={0.8} roughness={0.1} />
          </mesh>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0]} scale={0.06}>
                <octahedronGeometry />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            );
          })}
        </group>
      )}

      {config.headwear === "cyber-mask" && (
        <group position={[0, 0.22, 0.94]}>
          <mesh scale={[0.46, 0.42, 0.2]}>
            <dodecahedronGeometry args={[0.5, 0]} />
            <meshPhysicalMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.06, 0.12]} scale={[0.24, 0.06, 0.02]}>
            <boxGeometry />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
        </group>
      )}

      {config.headwear === "seraph-crest" && (
        <group position={[0, 0.62, 0.48]}>
          {[-0.14, 0, 0.14].map((x, i) => (
            <mesh key={i} position={[x, 0.18 + (i === 1 ? 0.08 : 0), 0]} rotation={[0.2, 0, x * -0.5]}>
              <boxGeometry args={[0.05, 0.42 + (i === 1 ? 0.14 : 0), 0.02]} />
              <meshPhysicalMaterial color="#ffffff" emissive={glowColor} emissiveIntensity={1.4} transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {config.headwear === "shadow-hood" && (
        <group position={[0, 0.38, 0.42]}>
          <mesh scale={[0.7, 0.62, 0.68]}>
            <sphereGeometry args={[0.65, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
            <meshPhysicalMaterial color="#0b0f19" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* OUTFITS / ARMOR */}
      {config.outfit === "exo-carapace" && (
        <group position={[0, 0.08, 0]}>
          {[-0.32, -0.1, 0.12, 0.34].map((z, i) => (
            <mesh key={i} position={[0, 0.4 - i * 0.06, z]} scale={[1.1 - i * 0.08, 0.2, 0.32]} castShadow>
              <cylinderGeometry args={[0.7, 0.75, 0.4, 6]} />
              <meshPhysicalMaterial color="#1e293b" metalness={0.7} roughness={0.3} emissive={accentColor} emissiveIntensity={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {config.outfit === "astral-robe" && (
        <group position={[0, -0.22, 0]}>
          <mesh scale={[0.92, 0.75, 0.9]}>
            <cylinderGeometry args={[0.68, 0.95, 0.85, 16, 1, true]} />
            <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.65} transparent opacity={0.72} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {config.outfit === "cyber-harness" && (
        <group position={[0, 0.05, 0]}>
          {/* Spinal conduits */}
          <mesh position={[0, 0.15, -0.52]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.95, 8]} />
            <meshPhysicalMaterial color="#0f172a" metalness={0.9} />
          </mesh>
          {[-0.2, 0, 0.2].map((y, i) => (
            <mesh key={i} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.62, 0.03, 8, 24]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
          ))}
        </group>
      )}

      {config.outfit === "nomad-mantle" && (
        <group position={[0, 0.15, 0.1]}>
          <mesh scale={[0.95, 0.38, 0.9]}>
            <torusGeometry args={[0.6, 0.18, 10, 16]} />
            <meshPhysicalMaterial color="#78350f" roughness={0.85} />
          </mesh>
          {/* Bronze clasp */}
          <mesh position={[0, 0.15, 0.65]}>
            <cylinderGeometry args={[0.1, 0.1, 0.04, 12]} />
            <meshPhysicalMaterial color="#d97706" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      )}

      {config.outfit === "quantum-shroud" && (
        <group position={[0, 0, 0]}>
          <mesh scale={[1.2, 0.85, 0.95]}>
            <icosahedronGeometry args={[0.82, 1]} />
            <meshPhysicalMaterial color="#a855f7" wireframe emissive="#c084fc" emissiveIntensity={0.8} transparent opacity={0.6} />
          </mesh>
        </group>
      )}

      {config.outfit === "runic-plate" && (
        <group position={[0, 0.08, 0.58]}>
          <mesh scale={[0.55, 0.45, 0.1]}>
            <boxGeometry />
            <meshPhysicalMaterial color="#334155" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.06]} scale={[0.35, 0.3, 0.02]}>
            <ringGeometry args={[0.2, 0.35, 6]} />
            <meshBasicMaterial color={glowColor} />
          </mesh>
        </group>
      )}

      {config.outfit === "abyssal-chitin" && (
        <group position={[0, 0.1, 0]}>
          {[-0.3, 0, 0.3].map((z, i) => (
            <mesh key={i} position={[0, 0.48, z]} rotation={[0.4, 0, 0]}>
              <coneGeometry args={[0.12, 0.45, 4]} />
              <meshPhysicalMaterial color="#064e3b" emissive="#10b981" emissiveIntensity={0.6} roughness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {config.outfit === "celestial-gilded" && (
        <group position={[0, 0.1, 0]}>
          <mesh scale={[1.05, 0.72, 0.76]}>
            <torusGeometry args={[0.65, 0.04, 8, 32]} />
            <meshPhysicalMaterial color="#fbbf24" metalness={0.92} roughness={0.15} />
          </mesh>
          <mesh position={[0, 0.32, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.3, 0.06, 0.3]} />
            <meshPhysicalMaterial color="#fbbf24" metalness={0.92} roughness={0.15} />
          </mesh>
        </group>
      )}

      {/* BACK / WINGS */}
      {config.backWings === "photonic-wings" && (
        <group ref={wingsGroup} position={[0, 0.28, -0.45]}>
          {/* Left Wing */}
          <group position={[-0.2, 0, 0]}>
            <mesh position={[-0.7, 0.4, 0]} rotation={[0, 0, 0.2]}>
              <planeGeometry args={[1.2, 0.85]} />
              <meshPhysicalMaterial color="#38bdf8" emissive="#60a5fa" emissiveIntensity={1.2} transparent opacity={0.65} side={THREE.DoubleSide} />
            </mesh>
          </group>
          {/* Right Wing */}
          <group position={[0.2, 0, 0]}>
            <mesh position={[0.7, 0.4, 0]} rotation={[0, 0, -0.2]}>
              <planeGeometry args={[1.2, 0.85]} />
              <meshPhysicalMaterial color="#38bdf8" emissive="#60a5fa" emissiveIntensity={1.2} transparent opacity={0.65} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      )}

      {config.backWings === "solar-tendrils" && (
        <group ref={wingsGroup} position={[0, 0.2, -0.5]}>
          {[-0.35, -0.12, 0.12, 0.35].map((x, i) => (
            <mesh key={i} position={[x, -0.2, 0]} rotation={[0.4, 0, x * 0.8]}>
              <cylinderGeometry args={[0.03, 0.08, 1.2, 8]} />
              <meshPhysicalMaterial color="#f59e0b" emissive="#ea580c" emissiveIntensity={1.8} />
            </mesh>
          ))}
        </group>
      )}

      {config.backWings === "jet-thrusters" && (
        <group position={[0, 0.15, -0.65]}>
          {[-0.32, 0.32].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.15, 0.55, 12]} />
                <meshPhysicalMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
              </mesh>
              {/* Exhaust flame */}
              <mesh position={[0, 0, -0.42]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.1, 0.45, 8]} />
                <meshBasicMaterial color="#38bdf8" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {config.backWings === "energy-spikes" && (
        <group position={[0, 0.2, -0.4]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 0.25 - i * 0.1, -i * 0.14]} rotation={[-0.5 - i * 0.08, 0, 0]}>
              <coneGeometry args={[0.07, 0.65 - i * 0.08, 4]} />
              <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={1.4} />
            </mesh>
          ))}
        </group>
      )}

      {config.backWings === "void-cape" && (
        <group position={[0, 0.25, -0.55]} rotation={[0.3, 0, 0]}>
          <mesh position={[0, -0.6, 0]}>
            <planeGeometry args={[0.9, 1.3]} />
            <meshPhysicalMaterial color="#090d16" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {config.backWings === "orbiting-sigils" && (
        <group ref={wingsGroup} position={[0, 0.2, -0.65]}>
          {[0.5, 0.72, 0.95].map((r, i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
              <ringGeometry args={[r, r + 0.03, 32]} />
              <meshBasicMaterial color={glowColor} transparent opacity={0.7} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      )}

      {config.backWings === "crystal-fins" && (
        <group position={[0, 0.35, -0.3]}>
          <mesh rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.06, 0.75, 0.45]} />
            <meshPhysicalMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.8} roughness={0.1} clearcoat={1} />
          </mesh>
        </group>
      )}

      {/* ACCESSORIES */}
      {config.accessory === "core-relic" && (
        <mesh position={[0, 0.05, 0.45]} rotation={[Math.PI / 4, Math.PI / 4, 0]}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshPhysicalMaterial color="#ffffff" emissive="#38bdf8" emissiveIntensity={2.5} />
        </mesh>
      )}

      {config.accessory === "biome-lantern" && (
        <group position={[0, 0.75, 0.85]}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.14, 16, 12]} />
            <meshBasicMaterial color="#4ade80" />
          </mesh>
          <pointLight color="#4ade80" intensity={2} distance={3} />
        </group>
      )}

      {config.accessory === "shield-orbs" && (
        <group ref={orbsGroup} position={[0, 0.2, 0]}>
          {[-1.2, 1.2].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]}>
              <sphereGeometry args={[0.12, 16, 12]} />
              <meshPhysicalMaterial color="#1e293b" metalness={0.9} emissive="#38bdf8" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      )}

      {config.accessory === "data-halo" && (
        <group position={[0, 0.3, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[1.05, 0.02, 8, 36]} />
            <meshBasicMaterial color={glowColor} transparent opacity={0.6} />
          </mesh>
        </group>
      )}

      {/* LIMBS */}
      <group ref={limbsGroup}>
        {radialLimbs.map(({ angle, x, z }, index) => (
          <group key={index} rotation={[0, -angle, 0]} position={[x * 0.5, -0.15 + (index % 2) * 0.08, z * 0.5]}>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0.52, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.09, 1.05 + (index % 3) * 0.1, 8]} />
              <meshPhysicalMaterial color={bodyColor} {...materialProps} />
            </mesh>
            {/* Claws or foot glowing nodes */}
            <mesh position={[1.04, 0, 0]} scale={0.1}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color={glowColor} />
            </mesh>
          </group>
        ))}
      </group>

      {/* LIGHT SOURCE */}
      <pointLight color={glowColor} intensity={active ? 2.5 : 1.2} distance={5} />
    </group>
  );
}
