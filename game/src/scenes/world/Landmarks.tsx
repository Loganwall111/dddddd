import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type EnvState } from "../../game/bus";
import { seededRandom } from "../../game/procedural";

/* ------------------------------------------------------------------ */
/* Gigantic cliffs with waterfalls                                     */
/* ------------------------------------------------------------------ */

function makeMistTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(235,250,255,0.5)");
    gradient.addColorStop(0.55, "rgba(220,245,255,0.18)");
    gradient.addColorStop(1, "rgba(220,245,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

const WATERFALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  float whash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float wnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(whash(i), whash(i + vec2(1.0, 0.0)), f.x), mix(whash(i + vec2(0.0, 1.0)), whash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float n = wnoise(vec2(vUv.x * 7.0, vUv.y * 2.6 + uTime * 1.35));
    float n2 = wnoise(vec2(vUv.x * 18.0 + 4.7, vUv.y * 5.0 + uTime * 2.6));
    float streak = smoothstep(0.28, 0.78, n * 0.58 + n2 * 0.42);
    float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    float cap = smoothstep(1.0, 0.9, vUv.y);
    float alpha = (0.22 + streak * 0.55) * edge * cap;
    vec3 col = mix(vec3(0.55, 0.8, 0.92), vec3(1.0), streak * 0.65);
    gl_FragColor = vec4(col, alpha * 0.9);
  }
`;

const WATERFALL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface CliffSpec {
  id: number;
  position: [number, number, number];
  height: number;
  radius: number;
  tilt: number;
}

export function WaterfallCliffs({ seed, env }: { seed: string; env: EnvState }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const mist = useRef<THREE.Group>(null);
  const texture = useMemo(() => makeMistTexture(), []);
  const cliffs = useMemo<CliffSpec[]>(() => {
    const random = seededRandom(seed, "cliff-specs");
    const base: CliffSpec[] = [
      { id: 0, position: [-38, -4.5, -16], height: 22, radius: 6.4, tilt: 0.05 },
      { id: 1, position: [24, -4.5, -38], height: 27, radius: 7.8, tilt: -0.04 },
      { id: 2, position: [-8, -4.5, -60], height: 31, radius: 9.5, tilt: 0.03 },
    ];
    return base.map((cliff) => ({ ...cliff, tilt: cliff.tilt + (random() - 0.5) * 0.03 }));
  }, [seed]);

  const rocks = useMemo(() => {
    // Jitter the cone vertices so each cliff reads as weathered alien basalt.
    const random = seededRandom(seed, "cliff-rocks");
    return cliffs.map((cliff) => {
      const geometry = new THREE.CylinderGeometry(cliff.radius * 0.62, cliff.radius, cliff.height, 10, 4);
      const attr = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i += 1) {
        const y = attr.getY(i);
        const wobble = 0.72 + random() * 0.56;
        attr.setX(i, attr.getX(i) * wobble);
        attr.setZ(i, attr.getZ(i) * wobble);
        if (y > cliff.height * 0.4) attr.setX(i, attr.getX(i) * (0.82 + random() * 0.3));
      }
      geometry.computeVertexNormals();
      return geometry;
    });
  }, [seed, cliffs]);

  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
    if (mist.current) {
      mist.current.children.forEach((child, index) => {
        const t = (clock.elapsedTime * (0.14 + (index % 3) * 0.035) + index * 0.37) % 1;
        const baseY = index < 3 ? 0.6 : -1.6;
        child.position.y = baseY + t * 2.4;
        const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
        mat.opacity = (0.34 * Math.sin(t * Math.PI) + 0.08) * 0.9;
        child.scale.setScalar(3.2 + t * 5.4);
      });
    }
  });

  return (
    <group>
      {cliffs.map((cliff, index) => (
        <group key={cliff.id} position={cliff.position} rotation={[cliff.tilt, index * 2.1, cliff.tilt * 0.5]}>
          <mesh geometry={rocks[index]} castShadow receiveShadow>
            <meshStandardMaterial color="#141d20" roughness={0.94} metalness={0.06} flatShading />
          </mesh>
          {/* moss glow collar near the lip */}
          <mesh position={[0, cliff.height * 0.47, 0]}>
            <torusGeometry args={[cliff.radius * 0.58, 0.22, 8, 26]} />
            <meshStandardMaterial color="#123a2e" emissive="#2f8f6a" emissiveIntensity={0.85} roughness={0.7} />
          </mesh>
          {/* waterfall sheets */}
          <mesh position={[cliff.radius * 0.18, cliff.height * 0.48 - 0.4, cliff.radius * 0.55]} rotation={[0.05, 0, 0]}>
            <planeGeometry args={[cliff.radius * 0.72, cliff.height * 0.96]} />
            <shaderMaterial
              ref={index === 0 ? material : undefined}
              vertexShader={WATERFALL_VERTEX}
              fragmentShader={WATERFALL_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              uniforms={{ uTime: { value: index * 3.1 } }}
            />
          </mesh>
          <mesh position={[cliff.radius * 0.1, cliff.height * 0.46 - 0.6, cliff.radius * 0.5 + 0.5]} rotation={[0.05, 0.2, 0]}>
            <planeGeometry args={[cliff.radius * 0.4, cliff.height * 0.9]} />
            <shaderMaterial
              vertexShader={WATERFALL_VERTEX}
              fragmentShader={WATERFALL_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              uniforms={{ uTime: { value: index * 3.1 + 1.7 } }}
            />
          </mesh>
          {/* foam + mist at the plunge pool */}
          <mesh position={[0, env.waterLevel - 3.9 + 1.85, cliff.radius * 0.58]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[cliff.radius * 0.34, cliff.radius * 0.62, 28]} />
            <meshBasicMaterial color="#eafaff" transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <group ref={index === 0 ? mist : undefined} position={[0, 0, cliff.radius * 0.58]}>
            {Array.from({ length: 6 }, (_, puff) => (
              <sprite key={puff} position={[(puff % 3) * 1.4 - 1.4, 0, (puff % 2) * 1.2]}>
                <spriteMaterial map={texture} transparent depthWrite={false} opacity={0.2} color="#dff4ff" />
              </sprite>
            ))}
          </group>
          <pointLight position={[0, env.waterLevel - 2, cliff.radius * 0.7]} color="#aef0ff" intensity={5} distance={16} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Whales that swim through the sky                                    */
/* ------------------------------------------------------------------ */

interface WhaleSpec {
  id: number;
  radius: number;
  height: number;
  speed: number;
  scale: number;
  phase: number;
  hue: string;
}

export function SkyWhales({ seed }: { seed: string }) {
  const group = useRef<THREE.Group>(null);
  const whales = useMemo<WhaleSpec[]>(() => {
    const random = seededRandom(seed, "sky-whales");
    return Array.from({ length: 2 }, (_, index) => ({
      id: index,
      radius: 42 + random() * 26,
      height: 14 + random() * 9,
      speed: 0.018 + random() * 0.012,
      scale: 2.6 + random() * 1.8,
      phase: random() * Math.PI * 2,
      hue: index === 0 ? "#7fe8ff" : "#c89fff",
    }));
  }, [seed]);
  const tails = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const whale = whales[index];
      if (!whale) return;
      const angle = whale.phase + t * whale.speed;
      child.position.set(Math.cos(angle) * whale.radius, whale.height + Math.sin(t * 0.22 + whale.phase) * 2.2, Math.sin(angle) * whale.radius - 18);
      child.rotation.y = -angle + Math.PI / 2;
      child.rotation.z = Math.sin(t * 0.5 + whale.phase) * 0.07;
      const tail = tails.current[index];
      if (tail) tail.rotation.x = Math.sin(t * 1.7 + whale.phase) * 0.38;
    });
  });

  return (
    <group ref={group}>
      {whales.map((whale, index) => (
        <group key={whale.id} scale={whale.scale}>
          {/* body */}
          <mesh scale={[3.6, 1.15, 1.2]} castShadow>
            <sphereGeometry args={[1, 26, 18]} />
            <meshStandardMaterial color="#24384e" roughness={0.55} metalness={0.12} />
          </mesh>
          {/* belly glow */}
          <mesh position={[0, -0.52, 0]} scale={[3.1, 0.62, 1.02]}>
            <sphereGeometry args={[1, 22, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38]} />
            <meshStandardMaterial color={whale.hue} emissive={whale.hue} emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          {/* tail flukes */}
          <group ref={(tail) => { tails.current[index] = tail; }} position={[-3.4, 0.1, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.5, 1.6, 8]} />
              <meshStandardMaterial color="#1d2f42" roughness={0.6} />
            </mesh>
            <mesh position={[-1.15, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.35, 0.55, 0.1]}>
              <sphereGeometry args={[1, 14, 10]} />
              <meshStandardMaterial color="#1d2f42" roughness={0.6} />
            </mesh>
          </group>
          {/* side fins */}
          <mesh position={[0.6, -0.5, 1.15]} rotation={[0.4, 0.5, 0.7]} scale={[0.85, 0.28, 0.1]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#1d2f42" roughness={0.6} />
          </mesh>
          <mesh position={[0.6, -0.5, -1.15]} rotation={[-0.4, -0.5, 0.7]} scale={[0.85, 0.28, 0.1]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#1d2f42" roughness={0.6} />
          </mesh>
          {/* bioluminescent runner dots */}
          {Array.from({ length: 6 }, (_, dot) => (
            <mesh key={dot} position={[1.6 - dot * 0.66, 0.28 + Math.sin(dot) * 0.2, 0.86]}>
              <sphereGeometry args={[0.062, 8, 8]} />
              <meshBasicMaterial color={whale.hue} toneMapped={false} />
            </mesh>
          ))}
          <pointLight color={whale.hue} intensity={7} distance={26} position={[0, -1, 0]} />
        </group>
      ))}
    </group>
  );
}
