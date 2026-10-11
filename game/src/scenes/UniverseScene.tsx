import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Noise, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { Float } from "@react-three/drei";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { seededRandom } from "../game/procedural";

/* ------------------------------------------------------------------ */
/* Holographic spiral galaxy                                            */
/* ------------------------------------------------------------------ */

function SpiralGalaxy({ seed, reducedMotion }: { seed: string; reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const data = useMemo(() => {
    const random = seededRandom(seed, "holo-galaxy");
    const count = reducedMotion ? 7000 : 15000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const radius = Math.pow(random(), 0.62) * 17;
      const arm = i % 4;
      const angle = (arm * Math.PI) / 2 + radius * 0.42 + (random() - 0.5) * (0.85 - radius * 0.02);
      const scatter = Math.pow(random(), 2) * 1.6;
      pos[i * 3] = Math.cos(angle) * radius + (random() - 0.5) * scatter;
      pos[i * 3 + 1] = (random() - 0.5) * (1.7 - radius * 0.055) + (random() - 0.5) * scatter * 0.4;
      pos[i * 3 + 2] = Math.sin(angle) * radius + (random() - 0.5) * scatter;
      const coreHeat = Math.max(0, 1 - radius / 8);
      if (random() > 0.86) color.setHSL(0.09 + random() * 0.05, 0.85, 0.72);
      else color.setHSL(0.55 + random() * 0.17 - coreHeat * 0.42, 0.6 + random() * 0.3, 0.6 + random() * 0.36);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
      phase[i] = random() * Math.PI * 2;
      size[i] = 0.5 + Math.pow(random(), 2.6) * 2.6;
    }
    return { count, pos, col, phase, size };
  }, [seed, reducedMotion]);

  useFrame(({ clock }) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y = clock.elapsedTime * 0.021;
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <points ref={ref} rotation={[-0.52, 0, 0.16]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[data.phase, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[data.size, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={/* glsl */ `
          attribute float aPhase;
          attribute float aSize;
          varying vec3 vColor;
          varying float vPhase;
          uniform float uTime;
          void main() {
            vColor = color;
            vPhase = aPhase;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float tw = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase * 4.2);
            gl_PointSize = aSize * tw * (240.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec3 vColor;
          varying float vPhase;
          uniform float uTime;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float star = smoothstep(0.5, 0.04, d);
            float flare = 0.5 + 0.5 * sin(uTime * 2.2 + vPhase * 5.0);
            gl_FragColor = vec4(vColor * (0.8 + flare * 0.5), star * 0.92);
          }
        `}
        vertexColors
      />
    </points>
  );
}

function CoreGlow() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, "rgba(255,246,224,1)");
      gradient.addColorStop(0.25, "rgba(255,208,150,0.55)");
      gradient.addColorStop(0.6, "rgba(160,120,255,0.16)");
      gradient.addColorStop(1, "rgba(120,90,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 0.7) * 0.05;
      ref.current.scale.set(11 * pulse, 11 * pulse, 1);
    }
  });
  return (
    <sprite ref={ref} scale={[11, 11, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

function NebulaBanners({ seed }: { seed: string }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const random = seededRandom(seed, "menu-nebula-tex");
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      for (let i = 0; i < 60; i += 1) {
        const x = 128 + (random() - 0.5) * 150;
        const y = 128 + (random() - 0.5) * 130;
        const r = 24 + random() * 66;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(255,255,255,${0.05 + random() * 0.06})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }, [seed]);
  const banners = useMemo(() => {
    const random = seededRandom(seed, "menu-nebulas");
    return Array.from({ length: 6 }, (_, index) => ({
      id: index,
      pos: [(random() - 0.5) * 42, (random() - 0.5) * 12 - 2, -6 - random() * 16] as [number, number, number],
      scale: 14 + random() * 22,
      color: ["#5a3cff", "#ff5a9e", "#2ad8ff", "#7a5aff", "#ff8a5a", "#4a8aff"][index],
      speed: 0.1 + random() * 0.2,
    }));
  }, [seed]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      child.rotation.z = Math.sin(clock.elapsedTime * banners[index].speed * 0.2) * 0.2;
    });
    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.02) * 0.05;
  });
  return (
    <group ref={group}>
      {banners.map((banner) => (
        <sprite key={banner.id} position={banner.pos} scale={[banner.scale, banner.scale * 0.7, 1]}>
          <spriteMaterial map={texture} color={banner.color} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Distant planets + shooting stars                                     */
/* ------------------------------------------------------------------ */

function MenuPlanets() {
  const ringed = useRef<THREE.Group>(null);
  const simple = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ringed.current) ringed.current.rotation.y = clock.elapsedTime * 0.05;
    if (simple.current) simple.current.rotation.y = clock.elapsedTime * 0.03;
  });
  return (
    <group>
      <group ref={ringed} position={[16, 6.5, -26]}>
        <mesh>
          <sphereGeometry args={[1.9, 40, 28]} />
          <shaderMaterial
            uniforms={{ uTime: { value: 0 } }}
            vertexShader={/* glsl */ `
              varying vec3 vNormal;
              varying vec3 vPos;
              void main() {
                vNormal = normalize(normalMatrix * normal);
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={/* glsl */ `
              varying vec3 vNormal;
              varying vec3 vPos;
              uniform float uTime;
              void main() {
                float lit = smoothstep(-0.4, 0.8, dot(normalize(vNormal), normalize(vec3(-0.5, 0.6, 0.6))));
                float bands = 0.5 + 0.5 * sin(vPos.y * 7.0 + sin(vPos.x * 3.0));
                vec3 base = mix(vec3(0.16, 0.1, 0.3), vec3(0.95, 0.72, 0.5), bands * 0.55 + lit * 0.45);
                gl_FragColor = vec4(base * (0.22 + lit * 1.1), 1.0);
              }
            `}
          />
        </mesh>
        <mesh rotation={[1.35, 0.3, 0.2]}>
          <ringGeometry args={[2.6, 3.8, 72]} />
          <meshBasicMaterial color="#d8b98a" transparent opacity={0.4} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[1.35, 0.3, 0.55]}>
          <ringGeometry args={[4.1, 4.35, 72]} />
          <meshBasicMaterial color="#8ab8ff" transparent opacity={0.22} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={simple} position={[-19, 8.5, -34]}>
        <icosahedronGeometry args={[1.25, 2]} />
        <meshStandardMaterial color="#1d2f4a" emissive="#2a4aff" emissiveIntensity={0.32} roughness={0.4} metalness={0.55} flatShading />
      </mesh>
      <pointLight position={[-19, 8.5, -30]} color="#4a6aff" intensity={14} distance={14} />
    </group>
  );
}

function ShootingStars({ seed }: { seed: string }) {
  const group = useRef<THREE.Group>(null);
  const stars = useMemo(() => {
    const random = seededRandom(seed, "shooting");
    return Array.from({ length: 3 }, (_, index) => ({
      id: index,
      offset: random() * 9,
      x: (random() - 0.5) * 40,
      y: 6 + random() * 10,
      z: -8 - random() * 14,
      speed: 14 + random() * 10,
    }));
  }, [seed]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const star = stars[index];
      const cycle = ((clock.elapsedTime + star.offset) % 9) / 9;
      const active = cycle < 0.12;
      child.visible = active;
      if (active) {
        const t = cycle / 0.12;
        child.position.set(star.x + t * star.speed, star.y - t * star.speed * 0.36, star.z);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(t * Math.PI) * 0.9;
      }
    });
  });
  return (
    <group ref={group}>
      {stars.map((star) => (
        <mesh key={star.id} rotation={[0, 0, -0.36]} visible={false}>
          <planeGeometry args={[3.2, 0.05]} />
          <meshBasicMaterial color="#cfe8ff" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The Lodemus holographic sigil                                        */
/* ------------------------------------------------------------------ */

function HoloSigil() {
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = t * 0.24;
      group.current.position.y = 1.4 + Math.sin(t * 0.5) * 0.28;
    }
    if (shell.current) {
      const mat = shell.current.material as THREE.MeshBasicMaterial;
      const glitch = Math.random() > 0.988 ? 0.22 : 0.5;
      mat.opacity = glitch * (0.8 + Math.sin(t * 2.4) * 0.2);
    }
  });
  return (
    <Float speed={1.2} rotationIntensity={0.16} floatIntensity={0.4}>
      <group ref={group} position={[10.4, 1.4, -3]}>
        <mesh ref={shell}>
          <icosahedronGeometry args={[1.7, 0]} />
          <meshBasicMaterial color="#66e0ff" wireframe transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh scale={0.62}>
          <icosahedronGeometry args={[1.7, 1]} />
          <meshBasicMaterial color="#c89fff" wireframe transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0, 0.4]}>
          <torusGeometry args={[2.5, 0.02, 8, 90]} />
          <meshBasicMaterial color="#66e0ff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 1.8, 0.6, -0.3]}>
          <torusGeometry args={[3.05, 0.012, 8, 90]} />
          <meshBasicMaterial color="#c89fff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh scale={0.14}>
          <icosahedronGeometry args={[1.7, 2]} />
          <meshBasicMaterial color="#eafcff" toneMapped={false} />
        </mesh>
        <pointLight color="#66e0ff" intensity={10} distance={12} />
      </group>
    </Float>
  );
}

/* ------------------------------------------------------------------ */
/* Camera rig with pointer parallax                                     */
/* ------------------------------------------------------------------ */

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const parallax = reducedMotion ? 0 : 1;
    const targetX = pointer.current.x * 2.1 * parallax;
    const targetY = -pointer.current.y * 1.15 * parallax;
    const damp = 1 - Math.exp(-delta * 2.4);
    camera.position.x += (targetX + Math.sin(t * 0.05) * 0.8 - camera.position.x) * damp;
    camera.position.y += (targetY + 1.9 + Math.sin(t * 0.075) * 0.5 - camera.position.y) * damp;
    camera.position.z += (21 + Math.sin(t * 0.045) * 1.6 - camera.position.z) * damp * 0.5;
    camera.lookAt(2.4, 0.4, -4);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Exported scene                                                       */
/* ------------------------------------------------------------------ */

export function UniverseScene({ seed, reducedMotion }: { seed: string; reducedMotion: boolean; quality?: string }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.9, 21], fov: 50, near: 0.1, far: 300 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.25;
      }}
    >
      <color attach="background" args={["#01020a"]} />
      <fog attach="fog" args={["#01020a", 30, 90]} />
      <CameraRig reducedMotion={reducedMotion} />
      <SpiralGalaxy seed={seed} reducedMotion={reducedMotion} />
      <CoreGlow />
      <NebulaBanners seed={seed} />
      <MenuPlanets />
      <ShootingStars seed={seed} />
      <HoloSigil />
      <ambientLight intensity={0.25} />
      <EffectComposer>
        <Bloom intensity={1.35} luminanceThreshold={0.28} luminanceSmoothing={0.72} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.0006, 0.0003)} radialModulation modulationOffset={0.4} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.05} blendFunction={BlendFunction.SOFT_LIGHT} />
        <Vignette offset={0.16} darkness={0.74} />
      </EffectComposer>
    </Canvas>
  );
}
