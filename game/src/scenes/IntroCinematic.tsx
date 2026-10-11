import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { MeshReflectorMaterial } from "@react-three/drei";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { AnimatePresence, motion } from "motion/react";
import { seededRandom } from "../game/procedural";
import { cinematicAudio } from "../audio/CinematicAudio";

/* ------------------------------------------------------------------ */
/* Chapter script — synced with the recorded narration                  */
/* ------------------------------------------------------------------ */

interface Caption {
  at: number;
  text: string;
}

interface Chapter {
  id: string;
  scene: "atom" | "earth" | "machine" | "dive" | "title";
  kicker: string;
  title: string;
  subtitle: string;
  src: string;
  fallback: number;
  captions: Caption[];
}

const CHAPTERS: Chapter[] = [
  {
    id: "genesis",
    scene: "atom",
    kicker: "CHAPTER I",
    title: "GENESIS",
    subtitle: "the first breath",
    src: "audio/intro/ch1.mp3",
    fallback: 30,
    captions: [
      { at: 0, text: "In the beginning... there was no light. No time. No world." },
      { at: 0.14, text: "Only dust. A single atom, adrift in an endless and silent dark." },
      { at: 0.3, text: "Then — a burst of pure energy tore through the nothing..." },
      { at: 0.42, text: "...radiating across the entire multiverse." },
      { at: 0.54, text: "Galaxies bloomed like flowers in spring. Suns ignited." },
      { at: 0.66, text: "And from that first breath of creation, a god awoke." },
      { at: 0.76, text: "Simolysis... the one who started everything." },
      { at: 0.88, text: "The one who dreamed a trillion worlds into being." },
    ],
  },
  {
    id: "fall",
    scene: "earth",
    kicker: "CHAPTER II",
    title: "THE FALL",
    subtitle: "the last day of Earth",
    src: "audio/intro/ch2.mp3",
    fallback: 30,
    captions: [
      { at: 0, text: "But this story does not begin in the stars." },
      { at: 0.08, text: "It begins on a small blue world. Earth." },
      { at: 0.19, text: "For a hundred thousand years, humanity looked to the heavens..." },
      { at: 0.29, text: "...and wondered if they were alone." },
      { at: 0.37, text: "They never imagined the sky itself would betray them." },
      { at: 0.45, text: "The meteorite came without warning — a killer of worlds, miles wide." },
      { at: 0.6, text: "It struck at dawn. The oceans boiled. The continents burned." },
      { at: 0.78, text: "And in a single day... Earth went silent." },
    ],
  },
  {
    id: "lodemus",
    scene: "machine",
    kicker: "CHAPTER III",
    title: "LODEMUS",
    subtitle: "the machine between realities",
    src: "audio/intro/ch3.mp3",
    fallback: 28,
    captions: [
      { at: 0, text: "But humanity was not finished." },
      { at: 0.07, text: "In their final hour, they built a machine. Not a ship. Not an ark. Something far greater." },
      { at: 0.26, text: "They called it... Lodemus." },
      { at: 0.37, text: "Those who reached it were kept alive — their bodies sustained..." },
      { at: 0.51, text: "...their minds carried safely across the boundary of reality itself." },
      { at: 0.66, text: "As the world they left behind turned to ash..." },
      { at: 0.79, text: "...Lodemus carried the last of them into the multiverse." },
    ],
  },
  {
    id: "traveler",
    scene: "dive",
    kicker: "CHAPTER IV",
    title: "THE TRAVELER",
    subtitle: "plugged into infinity",
    src: "audio/intro/ch4.mp3",
    fallback: 28,
    captions: [
      { at: 0, text: "You are one of the last." },
      { at: 0.07, text: "When you took hold of Lodemus, it reached into your mind..." },
      { at: 0.18, text: "...and plugged you into a reality without limits." },
      { at: 0.29, text: "Floating islands. Endless white voids. Mazes of infinity. Fractals within fractals." },
      { at: 0.47, text: "Gigantic cities in the clouds. Whales swimming through the sky." },
      { at: 0.6, text: "Black holes that pull you into the unknown." },
      { at: 0.71, text: "Here, anything you can imagine... is real." },
    ],
  },
  {
    id: "multiverse",
    scene: "title",
    kicker: "CHAPTER V",
    title: "THE MULTIVERSE",
    subtitle: "your next move is everything",
    src: "audio/intro/ch5.mp3",
    fallback: 22,
    captions: [
      { at: 0, text: "But be warned, traveler. There is far more to your journey than survival." },
      { at: 0.17, text: "The multiverse is awake. It remembers the god who made it... and it knows your name." },
      { at: 0.38, text: "Somewhere, beyond the infinite, something is waiting for you." },
      { at: 0.55, text: "This... is THE MULTIVERSE." },
      { at: 0.78, text: "Your next move... is everything." },
    ],
  },
];

interface IntroFx {
  flash: number;
}

interface ProgressRef {
  chapter: number;
  progress: number;
}

/* ------------------------------------------------------------------ */
/* Chapter I — GENESIS                                                  */
/* ------------------------------------------------------------------ */

function AtomGenesis({ active, progress, fx }: { active: boolean; progress: React.MutableRefObject<ProgressRef>; fx: React.MutableRefObject<IntroFx> }) {
  const camera = useThree((state) => state.camera);
  const swarm = useRef<THREE.Points>(null);
  const rings = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const galaxies = useRef<THREE.Points>(null);
  const fired = useRef(false);

  const data = useMemo(() => {
    const random = seededRandom("intro-atom", "atom");
    const count = 800;
    const swarmPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 7 + random() * 13;
      swarmPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      swarmPos[i * 3 + 1] = radius * Math.cos(phi);
      swarmPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const galaxyCount = 1100;
    const galaxyPos = new Float32Array(galaxyCount * 3);
    const galaxyCol = new Float32Array(galaxyCount * 3);
    const color = new THREE.Color();
    for (let i = 0; i < galaxyCount; i += 1) {
      const radius = Math.pow(random(), 0.6) * 16;
      const arm = i % 3;
      const angle = (arm * Math.PI * 2) / 3 + radius * 0.4 + (random() - 0.5) * 0.8;
      galaxyPos[i * 3] = Math.cos(angle) * radius;
      galaxyPos[i * 3 + 1] = (random() - 0.5) * (1.4 - radius * 0.05);
      galaxyPos[i * 3 + 2] = Math.sin(angle) * radius;
      color.setHSL(0.09 + random() * 0.62, 0.7, 0.62);
      galaxyCol[i * 3] = color.r;
      galaxyCol[i * 3 + 1] = color.g;
      galaxyCol[i * 3 + 2] = color.b;
    }
    return { swarmPos, galaxyPos, galaxyCol };
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const p = progress.current.progress;
    const converge = Math.min(1, p / 0.42);
    const burstT = Math.max(0, (p - 0.48) / 0.52);

    if (swarm.current) {
      const attr = swarm.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = data.swarmPos[i] * (1 - converge * 0.96);
        arr[i + 1] = data.swarmPos[i + 1] * (1 - converge * 0.96);
        arr[i + 2] = data.swarmPos[i + 2] * (1 - converge * 0.96);
      }
      attr.needsUpdate = true;
      (swarm.current.material as THREE.PointsMaterial).opacity = 0.85 * (1 - burstT * 1.4);
    }
    if (rings.current) {
      rings.current.rotation.y = t * 0.85;
      rings.current.rotation.x = Math.sin(t * 0.3) * 0.4;
      rings.current.scale.setScalar(1 + burstT * 5);
    }
    if (core.current) {
      const pulse = 1 + Math.sin(t * 6) * 0.08 + converge * 0.5;
      core.current.scale.setScalar(pulse * (1 - Math.min(1, burstT * 2)));
    }
    if (burst.current) {
      burst.current.visible = burstT > 0;
      burst.current.scale.setScalar(0.4 + burstT * 70);
      (burst.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - burstT * 1.8));
    }
    if (galaxies.current) {
      const grow = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
      galaxies.current.visible = grow > 0;
      galaxies.current.scale.setScalar(0.2 + grow * 0.85);
      galaxies.current.rotation.y = t * 0.06;
      (galaxies.current.material as THREE.PointsMaterial).opacity = grow * 0.95;
    }
    if (p > 0.5 && !fired.current) {
      fired.current = true;
      fx.current.flash = 1.6;
      cinematicAudio.cinematicHit(1);
    }
    camera.position.set(Math.sin(t * 0.1) * 1.2, 0.4, 15 - p * 4);
    camera.lookAt(0, 0, 0);
  });

  return (
    <group>
      <points ref={swarm}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.swarmPos.slice(), 3]} />
        </bufferGeometry>
        <pointsMaterial color="#cfd8ff" size={0.09} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <group ref={rings}>
        {[0, 1, 2].map((ring) => (
          <mesh key={ring} rotation={[Math.PI / 2 + ring * 0.7, ring * 0.9, 0]}>
            <torusGeometry args={[2.1 + ring * 0.35, 0.012, 8, 90]} />
            <meshBasicMaterial color="#8fd0ff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh ref={core}>
        <sphereGeometry args={[0.42, 24, 18]} />
        <meshBasicMaterial color="#fff6e0" toneMapped={false} />
      </mesh>
      <mesh ref={burst} visible={false}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color="#e8dcff" transparent opacity={0.8} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <points ref={galaxies} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.galaxyPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.galaxyCol, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.16} vertexColors transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter II — THE FALL                                                */
/* ------------------------------------------------------------------ */

function makeEarthTexture() {
  const random = seededRandom("earth-tex", "earth");
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const ocean = ctx.createLinearGradient(0, 0, 0, size / 2);
    ocean.addColorStop(0, "#123a6e");
    ocean.addColorStop(0.5, "#17548f");
    ocean.addColorStop(1, "#123a6e");
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, size, size / 2);
    for (let i = 0; i < 26; i += 1) {
      const x = random() * size;
      const y = size / 4 + (random() - 0.5) * size * 0.34;
      ctx.fillStyle = random() > 0.4 ? "#3e7a44" : "#7a7440";
      for (let blob = 0; blob < 9; blob += 1) {
        ctx.beginPath();
        ctx.ellipse(x + (random() - 0.5) * 90, y + (random() - 0.5) * 40, 8 + random() * 30, 5 + random() * 16, random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(230,240,250,0.85)";
    ctx.fillRect(0, 0, size, 8);
    ctx.fillRect(0, size / 2 - 8, size, 8);
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + random() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * (size / 2), 20 + random() * 60, 6 + random() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function EarthFall({ active, progress, fx }: { active: boolean; progress: React.MutableRefObject<ProgressRef>; fx: React.MutableRefObject<IntroFx> }) {
  const camera = useThree((state) => state.camera);
  const planet = useRef<THREE.Mesh>(null);
  const meteor = useRef<THREE.Group>(null);
  const shock = useRef<THREE.Mesh>(null);
  const debris = useRef<THREE.Points>(null);
  const atmosphere = useRef<THREE.Mesh>(null);
  const fired = useRef(false);
  const texture = useMemo(() => makeEarthTexture(), []);
  const ember = useMemo(() => new THREE.Color("#ff5a2a"), []);
  const ash = useMemo(() => new THREE.Color("#5c5f66"), []);
  const oceanBlue = useMemo(() => new THREE.Color("#2a6ea8"), []);

  const debrisData = useMemo(() => {
    const random = seededRandom("earth-debris", "earth");
    const count = 260;
    const pos = new Float32Array(count * 3);
    const dir = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      dir[i * 3] = Math.sin(phi) * Math.cos(theta);
      dir[i * 3 + 1] = Math.cos(phi);
      dir[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
    }
    return { count, pos, dir };
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const p = progress.current.progress;
    const impact = THREE.MathUtils.clamp((p - 0.52) / 0.48, 0, 1);

    if (planet.current) {
      planet.current.rotation.y = 0.4 + t * 0.05;
      const mat = planet.current.material as THREE.MeshStandardMaterial;
      if (impact <= 0) {
        mat.color.lerp(oceanBlue, 0.1);
        mat.emissiveIntensity = 0;
      } else {
        mat.color.copy(oceanBlue).lerp(ember, Math.min(1, impact * 2.4)).lerp(ash, Math.max(0, (impact - 0.45) * 1.6));
        mat.emissive.copy(ember);
        mat.emissiveIntensity = Math.max(0, 0.55 * (1 - impact));
      }
    }
    if (atmosphere.current) {
      (atmosphere.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - impact * 0.8);
    }
    if (meteor.current) {
      const approach = THREE.MathUtils.clamp((p - 0.28) / 0.24, 0, 1);
      const eased = approach * approach;
      meteor.current.position.set(
        THREE.MathUtils.lerp(-17, 1.7, eased),
        THREE.MathUtils.lerp(8.5, 1.6, eased),
        THREE.MathUtils.lerp(-5, 1.2, eased),
      );
      meteor.current.visible = p < 0.56;
      meteor.current.rotation.y = t * 3;
    }
    if (shock.current) {
      shock.current.visible = impact > 0;
      shock.current.scale.setScalar(1 + impact * 9);
      shock.current.lookAt(camera.position);
      (shock.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - impact * 1.5));
    }
    if (debris.current) {
      debris.current.visible = impact > 0;
      const attr = debris.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < debrisData.count; i += 1) {
        const reach = impact * (7 + (i % 7));
        arr[i * 3] = 1.8 + debrisData.dir[i * 3] * reach;
        arr[i * 3 + 1] = 0.4 + debrisData.dir[i * 3 + 1] * reach;
        arr[i * 3 + 2] = 0.6 + debrisData.dir[i * 3 + 2] * reach;
      }
      attr.needsUpdate = true;
      (debris.current.material as THREE.PointsMaterial).opacity = Math.max(0, 0.9 * (1 - impact * 1.1));
    }
    if (p > 0.52 && !fired.current) {
      fired.current = true;
      fx.current.flash = 2.2;
      cinematicAudio.cinematicHit(1);
    }
    camera.position.set(Math.sin(t * 0.07) * 0.8, 1.1, 16 - p * 3.4);
    camera.lookAt(1.4, 0.4, 0);
  });

  return (
    <group>
      <mesh ref={planet} position={[1.8, 0.4, 0]}>
        <sphereGeometry args={[5.4, 48, 32]} />
        <meshStandardMaterial map={texture} roughness={0.72} metalness={0.05} />
      </mesh>
      <mesh ref={atmosphere} position={[1.8, 0.4, 0]} scale={1.09}>
        <sphereGeometry args={[5.4, 32, 24]} />
        <meshBasicMaterial color="#6fb4ff" transparent opacity={0.4} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={meteor}>
        <mesh>
          <sphereGeometry args={[0.24, 14, 10]} />
          <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
        </mesh>
        <mesh position={[1.9, 0.55, 0]} rotation={[0, 0, -0.5]}>
          <coneGeometry args={[0.34, 4.4, 12, 1, true]} />
          <meshBasicMaterial color="#ff8a3c" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <pointLight color="#ffb066" intensity={26} distance={16} />
      </group>
      <mesh ref={shock} position={[1.8, 0.4, 0]} visible={false}>
        <ringGeometry args={[5.5, 6.1, 48]} />
        <meshBasicMaterial color="#ffbe82" transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <points ref={debris} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[debrisData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ff9a5c" size={0.1} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <StarBackdrop seed="earth-stars" count={420} />
      <ambientLight intensity={0.32} color="#8fb4d8" />
      <directionalLight position={[-8, 5, 6]} intensity={3.4} color="#fff0d0" />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter III — LODEMUS                                                */
/* ------------------------------------------------------------------ */

function LodemusRise({ active, progress }: { active: boolean; progress: React.MutableRefObject<ProgressRef> }) {
  const camera = useThree((state) => state.camera);
  const rings = useRef<THREE.Group>(null);
  const motes = useRef<THREE.Points>(null);
  const panels = useRef<THREE.Group>(null);
  const beams = useRef<THREE.Group>(null);

  const moteData = useMemo(() => {
    const random = seededRandom("lodemus-motes", "machine");
    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 1.5 + Math.pow(random(), 0.7) * 8;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = -6 + random() * 30;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const p = progress.current.progress;
    if (rings.current) {
      rings.current.children.forEach((ring, index) => {
        ring.rotation.z = t * (0.3 + index * 0.14) * (index % 2 ? -1 : 1);
        ring.rotation.x = 0.16 * Math.sin(t * 0.4 + index);
      });
    }
    if (motes.current) {
      const attr = motes.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += ((i % 5) * 0.02 + 0.05) * 0.16;
        if (arr[i + 1] > 24) arr[i + 1] = -6;
      }
      attr.needsUpdate = true;
    }
    if (panels.current) {
      panels.current.rotation.y = t * 0.12;
      panels.current.children.forEach((panel, index) => {
        const mat = (panel as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.16 + 0.1 * Math.abs(Math.sin(t * (1.1 + index * 0.37)));
      });
    }
    if (beams.current) {
      beams.current.children.forEach((beam, index) => {
        const phase = (t * 0.5 + index * 0.11) % 1;
        (beam as THREE.Mesh).position.y = -6 + phase * 30;
        const mat = (beam as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.16 * Math.sin(phase * Math.PI);
      });
    }
    camera.position.set(Math.sin(t * 0.08) * 1.4, -3.4 + p * 11, 17 - p * 4.5);
    camera.lookAt(0, 2 + p * 4, 0);
  });

  return (
    <group>
      {/* mirror-black floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6.2, 0]}>
        <planeGeometry args={[80, 80]} />
        <MeshReflectorMaterial
          resolution={1024}
          mirror={0.9}
          blur={[420, 120]}
          mixBlur={1.1}
          mixStrength={3.2}
          depthScale={1.1}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.4}
          color="#05080d"
          metalness={0.62}
          roughness={0.24}
        />
      </mesh>
      {/* the machine */}
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[1.5, 2.6, 26, 8, 1]} />
        <meshStandardMaterial color="#0a1016" metalness={0.85} roughness={0.32} flatShading />
      </mesh>
      <mesh position={[0, 20.6, 0]}>
        <coneGeometry args={[1.7, 3.4, 8]} />
        <meshStandardMaterial color="#0d141c" metalness={0.9} roughness={0.28} flatShading />
      </mesh>
      <mesh position={[0, 21.4, 0]}>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshBasicMaterial color="#bff4ff" toneMapped={false} />
      </mesh>
      {/* vertical light seams */}
      {Array.from({ length: 8 }, (_, seam) => {
        const angle = (seam / 8) * Math.PI * 2;
        return (
          <mesh key={seam} position={[Math.cos(angle) * 2.06, 7, Math.sin(angle) * 2.06]} rotation={[0, -angle, 0]}>
            <planeGeometry args={[0.24, 24]} />
            <meshBasicMaterial color="#6fe3ff" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
      <group ref={rings} position={[0, 7, 0]}>
        {[4.2, 5.3, 6.4].map((radius, index) => (
          <mesh key={radius}>
            <torusGeometry args={[radius, 0.07, 10, 80]} />
            <meshBasicMaterial color={index === 1 ? "#c89fff" : "#6fe3ff"} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={beams}>
        {Array.from({ length: 14 }, (_, beam) => {
          const angle = (beam / 14) * Math.PI * 2;
          const radius = 3.2 + (beam % 4) * 0.9;
          return (
            <mesh key={beam} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
              <cylinderGeometry args={[0.03 + (beam % 3) * 0.02, 0.03, 3.2, 6]} />
              <meshBasicMaterial color="#8feaff" transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
      <group ref={panels}>
        {[0, 1, 2, 3].map((panel) => {
          const angle = (panel / 4) * Math.PI * 2 + 0.4;
          return (
            <mesh key={panel} position={[Math.cos(angle) * 7.4, 4.4 + (panel % 2) * 3.4, Math.sin(angle) * 7.4]} rotation={[0, -angle + Math.PI / 2, 0]}>
              <planeGeometry args={[2.6, 1.5]} />
              <meshBasicMaterial color="#7fe3ff" transparent opacity={0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
      <points ref={motes}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[moteData, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#a8ecff" size={0.085} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <pointLight position={[0, 8, 0]} color="#6fe3ff" intensity={60} distance={40} />
      <pointLight position={[0, -3, 6]} color="#c89fff" intensity={26} distance={30} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter IV — THE TRAVELER (dive montage)                             */
/* ------------------------------------------------------------------ */

function DiveMontage({ active, progress }: { active: boolean; progress: React.MutableRefObject<ProgressRef> }) {
  const camera = useThree((state) => state.camera);
  const islands = useRef<THREE.Group>(null);
  const whale = useRef<THREE.Group>(null);
  const fractal = useRef<THREE.Group>(null);

  const islandData = useMemo(() => {
    const random = seededRandom("dive-islands", "dive");
    return Array.from({ length: 11 }, (_, index) => ({
      id: index,
      pos: [(random() - 0.5) * 16, (random() - 0.5) * 9, 6 - index * 9.5] as [number, number, number],
      scale: 0.7 + random() * 1.5,
      spin: (random() - 0.5) * 0.2,
    }));
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const p = progress.current.progress;
    if (islands.current) {
      islands.current.children.forEach((child, index) => {
        child.rotation.y = t * islandData[index].spin * 0.3;
        child.position.y = islandData[index].pos[1] + Math.sin(t * 0.5 + index * 1.3) * 0.5;
      });
    }
    if (whale.current) {
      const cross = THREE.MathUtils.clamp((p - 0.3) / 0.32, 0, 1);
      whale.current.visible = cross > 0 && cross < 1;
      whale.current.position.set(THREE.MathUtils.lerp(-34, 34, cross), 6.5, -20);
      whale.current.rotation.y = Math.PI / 2;
      whale.current.rotation.z = Math.sin(t * 0.6) * 0.06;
    }
    if (fractal.current) {
      fractal.current.visible = p > 0.4;
      fractal.current.rotation.x = t * 0.35;
      fractal.current.rotation.y = t * 0.5;
      fractal.current.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);
    }
    camera.position.set(Math.sin(t * 0.24) * 1.6 + Math.sin(p * 9) * 0.4, Math.sin(t * 0.2) * 0.9, 12 - p * 78);
    camera.lookAt(Math.sin(t * 0.1) * 2, 0, camera.position.z - 14);
  });

  return (
    <group>
      <ambientLight intensity={1.4} color="#f2f8ff" />
      <directionalLight position={[6, 12, 4]} intensity={2.6} color="#ffffff" />
      <group ref={islands}>
        {islandData.map((island) => (
          <group key={island.id} position={island.pos} scale={island.scale}>
            <mesh rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[2.2, 3.6, 7, 1]} />
              <meshStandardMaterial color="#4a4238" roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[2.34, 2.1, 0.5, 9]} />
              <meshStandardMaterial color="#6fd898" roughness={0.8} />
            </mesh>
            {[0, 1, 2].map((tree) => (
              <group key={tree} position={[Math.sin(tree * 2.4) * 1.2, 0.7, Math.cos(tree * 2.1) * 1.2]}>
                <mesh>
                  <coneGeometry args={[0.34, 0.9, 6]} />
                  <meshStandardMaterial color="#3fae7a" roughness={0.8} flatShading />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -1.6, 0]}>
              <sphereGeometry args={[0.5, 10, 8]} />
              <meshBasicMaterial color="#bfeaff" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
      {/* sky whale silhouette */}
      <group ref={whale} visible={false} scale={5.4}>
        <mesh scale={[3.6, 1.15, 1.2]}>
          <sphereGeometry args={[1, 22, 16]} />
          <meshStandardMaterial color="#33475e" roughness={0.6} />
        </mesh>
        <mesh position={[-3.4, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.5, 1.6, 8]} />
          <meshStandardMaterial color="#2b3d52" roughness={0.6} />
        </mesh>
        {Array.from({ length: 5 }, (_, dot) => (
          <mesh key={dot} position={[1.4 - dot * 0.7, 0.24, 1.02]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshBasicMaterial color="#7fe8ff" toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* recursive fractal gate */}
      <group ref={fractal} position={[0, 0.5, -72]} visible={false}>
        <mesh>
          <octahedronGeometry args={[6, 0]} />
          <meshBasicMaterial color="#b26bff" wireframe transparent opacity={0.75} toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((child) => {
          const angle = (child / 6) * Math.PI * 2;
          return (
            <mesh key={child} position={[Math.cos(angle) * 3.4, Math.sin(angle * 2) * 1.4, Math.sin(angle) * 3.4]} scale={0.4}>
              <octahedronGeometry args={[6, 0]} />
              <meshBasicMaterial color="#e0b3ff" wireframe transparent opacity={0.55} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
      {/* drifting void rings */}
      {[14, 38].map((z, index) => (
        <mesh key={z} position={[0, 0, -z]} rotation={[0, 0, index * 0.8]}>
          <torusGeometry args={[6.5 + index * 2, 0.05, 8, 70]} />
          <meshBasicMaterial color={index === 0 ? "#8fd0ff" : "#c89fff"} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter V — TITLE                                                    */
/* ------------------------------------------------------------------ */

function TitleReveal({ active, progress, fx }: { active: boolean; progress: React.MutableRefObject<ProgressRef>; fx: React.MutableRefObject<IntroFx> }) {
  const camera = useThree((state) => state.camera);
  const rays = useRef<THREE.Group>(null);
  const core = useRef<THREE.Sprite>(null);
  const dust = useRef<THREE.Points>(null);
  const fired = useRef(false);
  const glow = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255,244,220,1)");
      gradient.addColorStop(0.3, "rgba(255,214,150,0.55)");
      gradient.addColorStop(1, "rgba(255,200,130,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  const dustData = useMemo(() => {
    const random = seededRandom("title-dust", "title");
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 70;
      pos[i * 3 + 1] = (random() - 0.5) * 40;
      pos[i * 3 + 2] = (random() - 0.5) * 60 - 10;
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const p = progress.current.progress;
    if (rays.current) rays.current.rotation.z = t * 0.06;
    if (core.current) core.current.scale.setScalar(14 + Math.sin(t * 1.3) * 1.4 + p * 8);
    if (dust.current) {
      dust.current.rotation.y = t * 0.014;
      (dust.current.material as THREE.PointsMaterial).opacity = 0.55 + p * 0.3;
    }
    if (!fired.current) {
      fired.current = true;
      fx.current.flash = 1.3;
      cinematicAudio.cinematicHit(0.9);
    }
    camera.position.set(Math.sin(t * 0.05) * 1.4, Math.sin(t * 0.04) * 0.7, 30 + p * 7);
    camera.lookAt(0, 0, -6);
  });

  return (
    <group>
      <color attach="background" args={["#050310"]} />
      <StarBackdrop seed="title-stars" count={900} radius={60} />
      <sprite ref={core} scale={[16, 16, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <group ref={rays}>
        {Array.from({ length: 12 }, (_, ray) => (
          <mesh key={ray} rotation={[0, 0, (ray / 12) * Math.PI * 2]} position={[0, 0, -4]}>
            <planeGeometry args={[1.1, 90]} />
            <meshBasicMaterial
              color={ray % 2 ? "#c9a8ff" : "#ffd9a0"}
              transparent
              opacity={0.05}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustData, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#d8c8ff" size={0.12} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <ambientLight intensity={0.4} />
    </group>
  );
}

function StarBackdrop({ seed, count = 500, radius = 46 }: { seed: string; count?: number; radius?: number }) {
  const positions = useMemo(() => {
    const random = seededRandom(seed, "backdrop");
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const r = radius * (0.55 + random() * 0.45);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return pos;
  }, [seed, count, radius]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} color="#cfe0ff" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Scene director — keeps WebGL scenes in sync with narration           */
/* ------------------------------------------------------------------ */

function SceneDirector({ chapter, progress, fx, flashRef }: { chapter: number; progress: React.MutableRefObject<ProgressRef>; fx: React.MutableRefObject<IntroFx>; flashRef: React.MutableRefObject<HTMLDivElement | null> }) {
  useFrame(() => {
    // Apply DOM flash from inside the render loop (single writer).
    if (fx.current.flash > 0.005 && flashRef.current) {
      flashRef.current.style.opacity = String(Math.min(1, fx.current.flash));
      fx.current.flash *= 0.9;
    } else if (flashRef.current && flashRef.current.style.opacity !== "0") {
      flashRef.current.style.opacity = "0";
    }
  });
  const backdrops = ["#020210", "#030612", "#020409", "#e9f1f6", "#050310"];
  return (
    <>
      <color key={`bg-${chapter}`} attach="background" args={[backdrops[chapter]]} />
      {chapter === 2 && <fogExp2 key="fog-machine" attach="fog" args={["#020409", 0.026]} />}
      {chapter === 3 && <fogExp2 key="fog-dive" attach="fog" args={["#e2ecf2", 0.028]} />}
      <AtomGenesis active={chapter === 0} progress={progress} fx={fx} />
      <EarthFall active={chapter === 1} progress={progress} fx={fx} />
      <LodemusRise active={chapter === 2} progress={progress} />
      <DiveMontage active={chapter === 3} progress={progress} />
      <TitleReveal active={chapter === 4} progress={progress} fx={fx} />
      <EffectComposer>
        <Bloom intensity={1.15} luminanceThreshold={0.32} luminanceSmoothing={0.7} mipmapBlur />
        <Noise opacity={0.05} blendFunction={BlendFunction.SOFT_LIGHT} />
        <Vignette offset={0.18} darkness={0.78} />
      </EffectComposer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The cinematic shell                                                  */
/* ------------------------------------------------------------------ */

export function IntroCinematic({ onDone }: { onDone: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [caption, setCaption] = useState(CHAPTERS[0].captions[0].text);
  const [leaving, setLeaving] = useState(false);
  const progress = useRef<ProgressRef>({ chapter: 0, progress: 0 });
  const fx = useRef<IntroFx>({ flash: 0 });
  const flashRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const advanced = useRef(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    window.setTimeout(onDone, 700);
  }, [onDone]);

  // Chapter lifecycle: narration playback + timed fallback.
  useEffect(() => {
    advanced.current = false;
    const info = CHAPTERS[chapter];
    progress.current = { chapter, progress: 0 };
    const audio = new Audio(`${import.meta.env.BASE_URL}${info.src}`);
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;
    const advance = () => {
      if (advanced.current) return;
      advanced.current = true;
      if (chapter + 1 >= CHAPTERS.length) finish();
      else setChapter(chapter + 1);
    };
    audio.addEventListener("ended", advance);
    let fallbackTimer = 0;
    audio.play().catch(() => {
      fallbackTimer = window.setTimeout(advance, info.fallback * 1000);
    });
    audio.addEventListener("loadedmetadata", () => {
      window.clearTimeout(fallbackTimer);
    });
    fallbackTimer = window.setTimeout(advance, (info.fallback + 2) * 1000);
    // Preload the next chapter.
    if (chapter + 1 < CHAPTERS.length) {
      const next = new Audio(`${import.meta.env.BASE_URL}${CHAPTERS[chapter + 1].src}`);
      next.preload = "auto";
      next.load();
    }
    return () => {
      window.clearTimeout(fallbackTimer);
      audio.removeEventListener("ended", advance);
      audio.pause();
    };
  }, [chapter, finish]);

  // Smooth progress + caption tracking.
  useEffect(() => {
    const info = CHAPTERS[chapter];
    let raf = 0;
    let captionIndex = -1;
    const tick = () => {
      const audio = audioRef.current;
      const duration = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : info.fallback;
      const current = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : (performance.now() / 1000) % duration;
      const p = Math.min(1, current / duration);
      progress.current.progress = p;
      let index = 0;
      for (let i = 0; i < info.captions.length; i += 1) {
        if (p >= info.captions[i].at) index = i;
      }
      if (index !== captionIndex) {
        captionIndex = index;
        setCaption(info.captions[index].text);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chapter]);

  const skip = useCallback(() => {
    cinematicAudio.select();
    finish();
  }, [finish]);

  const info = CHAPTERS[chapter];
  const barPercent = Math.round(((chapter + progress.current.progress) / CHAPTERS.length) * 100);

  return (
    <motion.div
      className={`intro-cinematic ${leaving ? "is-leaving" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <Canvas
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 15], fov: 55, near: 0.1, far: 400 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <SceneDirector chapter={chapter} progress={progress} fx={fx} flashRef={flashRef} />
      </Canvas>

      <div className="intro-bar intro-bar--top" />
      <div className="intro-bar intro-bar--bottom" />
      <div className="intro-grain" />
      <div className="intro-vignette" />
      <div className="intro-flash" ref={flashRef} />

      <AnimatePresence mode="wait">
        <motion.div
          key={info.id}
          className="intro-copy"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="intro-kicker">{info.kicker} — {info.subtitle.toUpperCase()}</span>
          <h1 className={info.scene === "title" ? "intro-title intro-title--final" : "intro-title"}>{info.title}</h1>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.p
          key={`${info.id}-${caption}`}
          className="intro-caption"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          {caption}
        </motion.p>
      </AnimatePresence>

      <button className="intro-skip" onClick={skip}>
        SKIP INTRO
      </button>
      <div className="intro-progress">
        <i style={{ width: `${barPercent}%` }} />
      </div>
      <span className="intro-brandmark">A LODEMUS REALITY ENGINE FILM</span>
    </motion.div>
  );
}
