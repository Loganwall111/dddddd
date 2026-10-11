import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { seededRandom } from "../utils/rand";
import { layerInfo, nextLayer, type LayerId } from "../game/lore";
import { SkyWhales } from "./Landmarks";

export interface LayerProps {
  seed: string;
  quality: "low" | "medium" | "ultra";
  onTravel: (layer: LayerId) => void;
  /** Portals are passed in as `portalSlot` so GameShell controls destinations. */
  portalSlot?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Gateway — walk into the light to travel                              */
/* ------------------------------------------------------------------ */

export function Portal({ position, target, onTravel, color = "#9fe8ff" }: { position: [number, number, number]; target: LayerId; onTravel: (layer: LayerId) => void; color?: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const disk = useRef<THREE.Mesh>(null);
  const armed = useRef(performance.now());
  const { camera } = useThree();
  const info = layerInfo(target);

  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(6,12,20,0.75)";
      ctx.beginPath();
      ctx.roundRect(8, 24, 496, 80, 18);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#eaf6ff";
      ctx.font = "600 44px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.name, 256, 66);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [info.name, color]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.z = t * 0.4;
      ring.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.02);
    }
    if (disk.current) {
      (disk.current.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 2.2) * 0.14;
    }
    // Step through the gateway when the traveler gets close.
    if (performance.now() - armed.current > 1400) {
      const dx = camera.position.x - position[0];
      const dy = camera.position.y - position[1];
      const dz = camera.position.z - position[2];
      if (dx * dx + dy * dy + dz * dz < 7.5) {
        armed.current = performance.now() + 1e9; // one shot; scene will remount
        onTravel(target);
      }
    }
  });

  return (
    <group position={position}>
      <mesh ref={ring}>
        <torusGeometry args={[2.1, 0.09, 12, 60]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={disk}>
        <circleGeometry args={[1.95, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color={color} intensity={16} distance={16} />
      <sprite position={[0, 3.2, 0]} scale={[5.4, 1.35, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Standard portal pair: onward to the next reality, home to the Verdant Expanse. */
export function portalSlotFor(layer: LayerId, onTravel: (layer: LayerId) => void, heightAt?: (x: number, z: number) => number): React.ReactNode {
  const onward = nextLayer(layer);
  const onwardColor = layerInfo(onward).color;
  const homeColor = layerInfo("verdant").color;
  const slots: React.ReactNode[] = [];
  const a: [number, number, number] = [10, heightAt ? heightAt(10, -26) + 2.4 : 2.4, -26];
  const b: [number, number, number] = [-14, heightAt ? heightAt(-14, 22) + 2.4 : 2.4, 22];
  slots.push(<Portal key="onward" position={a} target={onward} onTravel={onTravel} color={onwardColor} />);
  if (layer !== "verdant") slots.push(<Portal key="home" position={b} target="verdant" onTravel={onTravel} color={homeColor} />);
  return <>{slots}</>;
}

/* ------------------------------------------------------------------ */
/* THE WHITE VOID — islands adrift in nothing                           */
/* ------------------------------------------------------------------ */

function VoidLayer({ seed, quality, portalSlot }: LayerProps) {
  const group = useRef<THREE.Group>(null);
  const islands = useMemo(() => {
    const random = seededRandom(seed, "void-islands");
    const count = quality === "low" ? 16 : 30;
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      pos: [(random() - 0.5) * 150, (random() - 0.5) * 44, (random() - 0.5) * 150] as [number, number, number],
      scale: 1.4 + random() * 3.4,
      phase: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.3,
    }));
  }, [seed, quality]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const island = islands[index];
      if (!island) return;
      child.position.y = island.pos[1] + Math.sin(clock.elapsedTime * 0.3 + island.phase) * 1.6;
      child.rotation.z = island.tilt + Math.sin(clock.elapsedTime * 0.18 + island.phase) * 0.04;
    });
  });

  return (
    <>
      <color attach="background" args={["#f2f5ff"]} />
      <fogExp2 attach="fog" args={["#f2f5ff", 0.016]} />
      <ambientLight intensity={1.7} color="#f4f8ff" />
      <directionalLight position={[30, 40, 20]} intensity={1.6} color="#ffffff" />
      <group ref={group}>
        {islands.map((island) => (
          <group key={island.id} position={island.pos} scale={island.scale}>
            <mesh castShadow>
              <cylinderGeometry args={[2.6, 2.3, 0.7, 9]} />
              <meshStandardMaterial color="#d8e4d8" roughness={0.9} />
            </mesh>
            <mesh position={[0, -2.4, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[2.3, 4.2, 9, 1]} />
              <meshStandardMaterial color="#e6ecf2" roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[2.62, 2.5, 0.16, 9]} />
              <meshStandardMaterial color="#b8dcc8" roughness={0.85} />
            </mesh>
            {island.scale > 2.4 && (
              <group position={[0.7, 1.2, 0.4]}>
                <mesh>
                  <cylinderGeometry args={[0.08, 0.12, 1.4, 6]} />
                  <meshStandardMaterial color="#9aa8b8" roughness={0.9} />
                </mesh>
                <mesh position={[0, 1, 0]}>
                  <icosahedronGeometry args={[0.7, 0]} />
                  <meshStandardMaterial color="#cfe8da" flatShading roughness={0.8} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      </group>
      <SkyWhales seed={seed + "-void"} />
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              useMemo(() => {
                const random = seededRandom(seed, "void-motes");
                const pos = new Float32Array(500 * 3);
                for (let i = 0; i < 500; i += 1) {
                  pos[i * 3] = (random() - 0.5) * 160;
                  pos[i * 3 + 1] = (random() - 0.5) * 80;
                  pos[i * 3 + 2] = (random() - 0.5) * 160;
                }
                return pos;
              }, [seed]),
              3,
            ]}
          />
        </bufferGeometry>
        <pointsMaterial color="#c8d4f0" size={0.12} transparent opacity={0.4} depthWrite={false} />
      </points>
      {portalSlot}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* THE INFINITE HALLS — rooms without end                               */
/* ------------------------------------------------------------------ */

function InfiniteRooms({ seed, portalSlot }: LayerProps) {
  const grid = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const CELL = 14;
  const SPAN = CELL * 7;

  const room = useMemo(() => {
    const random = seededRandom(seed, "halls-room");
    return { seed: random() };
  }, [seed]);

  // Recenter the repeating room block so the halls never end.
  useFrame(() => {
    if (!grid.current) return;
    grid.current.position.x = Math.round(camera.position.x / SPAN) * SPAN;
    grid.current.position.z = Math.round(camera.position.z / SPAN) * SPAN;
  });

  const cells = useMemo(() => {
    const random = seededRandom(seed, "halls-cells");
    return Array.from({ length: 49 }, (_, index) => ({
      id: index,
      x: (index % 7) - 3,
      z: Math.floor(index / 7) - 3,
      pillar: random() > 0.6,
      flicker: random(),
    }));
  }, [seed]);

  return (
    <>
      <color attach="background" args={["#120d06"]} />
      <fogExp2 attach="fog" args={["#171106", 0.045]} />
      <ambientLight intensity={0.25} color="#c8a860" />
      <group ref={grid}>
        {cells.map((cell) => (
          <group key={cell.id} position={[cell.x * CELL, 0, cell.z * CELL]}>
            {/* floor + ceiling */}
            <mesh position={[0, -0.1, 0]} receiveShadow>
              <boxGeometry args={[CELL, 0.2, CELL]} />
              <meshStandardMaterial color="#8a7248" roughness={0.95} />
            </mesh>
            <mesh position={[0, 3.3, 0]}>
              <boxGeometry args={[CELL, 0.2, CELL]} />
              <meshStandardMaterial color="#6e5a38" roughness={0.95} />
            </mesh>
            {/* walls with occasional open sides */}
            {["x", "z"].map((axis) =>
              [-1, 1].map((side) => {
                const open = ((cell.x * 13 + cell.z * 7 + (axis === "x" ? side : side * 3)) % 5 + 5) % 5 === 0;
                if (open) return null;
                return (
                  <mesh
                    key={`${axis}${side}`}
                    position={axis === "x" ? [(side * CELL) / 2, 1.55, 0] : [0, 1.55, (side * CELL) / 2]}
                    rotation={axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0]}
                  >
                    <boxGeometry args={[CELL, 3.2, 0.3]} />
                    <meshStandardMaterial color="#a8895c" roughness={0.92} />
                  </mesh>
                );
              }),
            )}
            {/* buzzing light panel */}
            <mesh position={[0, 3.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2.6, 2.6]} />
              <meshBasicMaterial color={cell.flicker > 0.85 ? "#ffe8b0" : "#ffd98a"} toneMapped={false} />
            </mesh>
            {cell.flicker > 0.82 && <pointLight position={[0, 2.7, 0]} color="#ffd98a" intensity={9} distance={12} />}
            {/* pillar */}
            {cell.pillar && (
              <mesh position={[0, 1.55, 0]} castShadow>
                <boxGeometry args={[1.1, 3.2, 1.1]} />
                <meshStandardMaterial color="#9a8054" roughness={0.9} />
              </mesh>
            )}
            {/* damp stain detail */}
            <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[5, 5]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.16 + room.seed * 0.08} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
      {portalSlot}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* FRACTALINE — recursive crystal maze                                  */
/* ------------------------------------------------------------------ */

function FractalLayer({ seed, portalSlot }: LayerProps) {
  const outer = useRef<THREE.Group>(null);
  const middle = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const frames = useMemo(() => {
    const random = seededRandom(seed, "fractal-frames");
    return Array.from({ length: 10 }, (_, index) => ({
      id: index,
      angle: (index / 10) * Math.PI * 2,
      radius: 9 + random() * 5,
      height: (random() - 0.5) * 10,
      scale: 1.6 + random() * 2.4,
    }));
  }, [seed]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (outer.current) {
      outer.current.rotation.y = t * 0.08;
      outer.current.rotation.x = Math.sin(t * 0.11) * 0.3;
    }
    if (middle.current) {
      middle.current.rotation.y = -t * 0.16;
      middle.current.rotation.z = Math.cos(t * 0.13) * 0.35;
    }
    if (inner.current) {
      inner.current.rotation.y = t * 0.3;
      inner.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.08);
    }
  });

  return (
    <>
      <color attach="background" args={["#0a0616"]} />
      <fogExp2 attach="fog" args={["#0a0616", 0.028]} />
      <ambientLight intensity={0.3} color="#8a6aff" />
      <directionalLight position={[10, 20, 10]} intensity={0.7} color="#c8a8ff" />
      <group ref={outer}>
        {frames.map((frame) => (
          <mesh key={frame.id} position={[Math.cos(frame.angle) * frame.radius, frame.height, Math.sin(frame.angle) * frame.radius]} scale={frame.scale}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#b28aff" wireframe transparent opacity={0.4} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={middle}>
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const angle = (index / 6) * Math.PI * 2;
          return (
            <mesh key={index} position={[Math.cos(angle) * 6, Math.sin(angle * 2) * 2.4, Math.sin(angle) * 6]} scale={1.4}>
              <octahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#7a4aff" emissive="#5a2aff" emissiveIntensity={0.8} metalness={0.7} roughness={0.2} flatShading />
            </mesh>
          );
        })}
      </group>
      <group ref={inner} position={[0, 0, 0]}>
        <mesh>
          <octahedronGeometry args={[2.2, 0]} />
          <meshStandardMaterial color="#c89fff" emissive="#9a6aff" emissiveIntensity={1.5} metalness={0.8} roughness={0.1} />
        </mesh>
        <pointLight color="#b28aff" intensity={30} distance={30} />
      </group>
      {/* recursive corridors of gates */}
      {[14, 22, 32, 46].map((distance, index) => (
        <mesh key={distance} position={[0, 0, -distance]} rotation={[0, index * 0.4, 0]}>
          <torusGeometry args={[4 + index * 1.6, 0.06, 8, 6]} />
          <meshBasicMaterial color="#d8bcff" transparent opacity={0.6 - index * 0.1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              useMemo(() => {
                const random = seededRandom(seed, "fractal-motes");
                const pos = new Float32Array(700 * 3);
                for (let i = 0; i < 700; i += 1) {
                  pos[i * 3] = (random() - 0.5) * 90;
                  pos[i * 3 + 1] = (random() - 0.5) * 50;
                  pos[i * 3 + 2] = (random() - 0.5) * 90;
                }
                return pos;
              }, [seed]),
              3,
            ]}
          />
        </bufferGeometry>
        <pointsMaterial color="#c8a8ff" size={0.12} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {portalSlot}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* THE SINGULARITY — gravitational heart of the multiverse              */
/* ------------------------------------------------------------------ */

function SingularityLayer({ seed, portalSlot }: LayerProps) {
  const disk = useRef<THREE.Mesh>(null);
  const disk2 = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const debris = useRef<THREE.Points>(null);

  const diskTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 256, 0);
      gradient.addColorStop(0, "rgba(255,120,40,0)");
      gradient.addColorStop(0.35, "rgba(255,160,60,0.9)");
      gradient.addColorStop(0.7, "rgba(255,220,160,1)");
      gradient.addColorStop(1, "rgba(255,240,220,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }, []);

  const debrisData = useMemo(() => {
    const random = seededRandom(seed, "singularity-debris");
    const count = 900;
    const pos = new Float32Array(count * 3);
    const meta = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      meta[i * 2] = 8 + Math.pow(random(), 0.7) * 30;
      meta[i * 2 + 1] = random() * Math.PI * 2;
    }
    return { count, pos, meta };
  }, [seed]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (disk.current) disk.current.rotation.z = t * 0.4;
    if (disk2.current) disk2.current.rotation.z = -t * 0.26;
    if (halo.current) {
      halo.current.rotation.y = t * 0.1;
      halo.current.scale.setScalar(1 + Math.sin(t * 0.8) * 0.03);
    }
    if (debris.current) {
      const attr = debris.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < debrisData.count; i += 1) {
        let radius = debrisData.meta[i * 2] - delta * 0.6;
        let angle = debrisData.meta[i * 2 + 1] + delta * (2.4 / radius);
        if (radius < 6.4) {
          radius = 38;
          angle = Math.random() * Math.PI * 2;
          debrisData.meta[i * 2] = radius;
        }
        debrisData.meta[i * 2] = radius;
        debrisData.meta[i * 2 + 1] = angle;
        arr[i * 3] = Math.cos(angle) * radius;
        arr[i * 3 + 1] = Math.sin(t * 0.4 + i) * (radius * 0.06);
        arr[i * 3 + 2] = Math.sin(angle) * radius;
      }
      attr.needsUpdate = true;
    }
  });

  return (
    <>
      <color attach="background" args={["#030204"]} />
      <fogExp2 attach="fog" args={["#030204", 0.02]} />
      <ambientLight intensity={0.12} color="#5a3a8a" />
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              useMemo(() => {
                const random = seededRandom(seed, "singularity-stars");
                const pos = new Float32Array(1400 * 3);
                for (let i = 0; i < 1400; i += 1) {
                  const theta = random() * Math.PI * 2;
                  const phi = Math.acos(2 * random() - 1);
                  const radius = 80 + random() * 60;
                  pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                  pos[i * 3 + 1] = radius * Math.cos(phi);
                  pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
                }
                return pos;
              }, [seed]),
              3,
            ]}
          />
        </bufferGeometry>
        <pointsMaterial color="#cfd8ff" size={0.28} transparent opacity={0.85} depthWrite={false} sizeAttenuation />
      </points>
      {/* the heart */}
      <mesh>
        <sphereGeometry args={[6, 48, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh ref={halo} scale={1.06}>
        <sphereGeometry args={[6, 32, 24]} />
        <meshBasicMaterial color="#ff9a5c" transparent opacity={0.16} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* accretion disks */}
      <mesh ref={disk} rotation={[Math.PI / 2 - 0.32, 0, 0]}>
        <ringGeometry args={[7, 17, 90, 1]} />
        <meshBasicMaterial map={diskTexture} transparent opacity={0.9} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={disk2} rotation={[Math.PI / 2 - 0.32, 0.2, 0.1]} scale={1.24}>
        <ringGeometry args={[7.6, 19, 90, 1]} />
        <meshBasicMaterial color="#c86aff" transparent opacity={0.22} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color="#ffb066" intensity={80} distance={90} position={[0, 4, 0]} />
      <points ref={debris}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[debrisData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffcf9a" size={0.16} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      {portalSlot}
    </>
  );
}

export function RealityLayer(props: LayerProps & { layer: LayerId; env?: import("../game/bus").EnvState }) {
  const { layer, ...rest } = props;
  const slot = rest.portalSlot ?? null;
  const shared = { ...rest, portalSlot: slot };
  switch (layer) {
    case "void":
      return <VoidLayer {...shared} />;
    case "infinite":
      return <InfiniteRooms {...shared} />;
    case "fractaline":
      return <FractalLayer {...shared} />;
    case "singularity":
      return <SingularityLayer {...shared} />;
    default:
      return null;
  }
}
