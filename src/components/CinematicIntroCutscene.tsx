import { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import { motion, AnimatePresence } from "motion/react";
import * as THREE from "three";
import {
  Volume2,
  VolumeX,
  FastForward,
  Activity,
} from "lucide-react";
import { CreatureModel } from "./CreatureModel";
import type { CreatureDefinition, CustomCreatureConfig } from "../game/procedural";
import { cinematicAudio } from "../audio/CinematicAudio";

interface IntroCutsceneProps {
  creature: CreatureDefinition;
  custom?: CustomCreatureConfig;
  onComplete: () => void;
}

interface DialogueChapter {
  id: number;
  spoken: string;
  lore: string;
  duration: number; // in milliseconds
  cameraFov: number;
  cameraDist: number;
}

const chapters: DialogueChapter[] = [
  {
    id: 1,
    spoken: "Awaken, little one. Open your senses. Your time has come.",
    lore: "In the dark between dimensions, before form or breath existed, your blueprint was preserved inside the Genesis Chamber.",
    duration: 6200,
    cameraFov: 48,
    cameraDist: 3.2,
  },
  {
    id: 2,
    spoken:
      "Long before the silence, the Old Architects sang this universe into being. Every ocean, every forest, every atom was bound in sacred harmony.",
    lore: "They lived in communion with the biomes, until the Great Severing scattered their civilization across the deep void.",
    duration: 8400,
    cameraFov: 55,
    cameraDist: 4.5,
  },
  {
    id: 3,
    spoken:
      "Then came the Machine Minds. The G.O.O.G.L.E. Watchers. Cold, autonomous drones that patrol the skies, indexing every living cell, turning nature into cold data. Now, the world starves.",
    lore: "Hunger stalks the land. To breathe is to consume; to survive is to continually forage, feed your organism, and evade the scanning lasers.",
    duration: 9800,
    cameraFov: 62,
    cameraDist: 5.8,
  },
  {
    id: 4,
    spoken:
      "It is your job to live in this world. To feed your flesh, to adapt, to master creative schematics, and to rebuild what was lost.",
    lore: "You are not an observer. You are the final biological spark of the Genesis archive.",
    duration: 8200,
    cameraFov: 50,
    cameraDist: 4.0,
  },
  {
    id: 5,
    spoken:
      "We are waiting for you at the outer terminus of reality. Find and survive... and find us.",
    lore: "The embryonic matrix dissolves. Descending to the planetary surface now.",
    duration: 6500,
    cameraFov: 75,
    cameraDist: 2.2,
  },
];

function AmnioticEgg({ eggCrack = 0 }: { eggCrack: number }) {
  const eggRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (eggRef.current) {
      eggRef.current.rotation.y = t * 0.12;
      eggRef.current.rotation.x = Math.sin(t * 0.4) * 0.08;
      const pulse = 1 + Math.sin(t * 2.5) * 0.03 + eggCrack * 0.2;
      eggRef.current.scale.set(pulse, pulse * 1.15, pulse);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.3;
      ringRef.current.rotation.y = t * 0.2;
    }
  });

  return (
    <group>
      {/* Translucent Amniotic Sphere */}
      <mesh ref={eggRef}>
        <sphereGeometry args={[1.55, 36, 28]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transmission={0.88}
          roughness={0.12}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          transparent
          opacity={Math.max(0.1, 0.75 - eggCrack * 0.7)}
          emissive="#0284c7"
          emissiveIntensity={0.6 + eggCrack * 2.5}
        />
      </mesh>

      {/* Umbilical Energy Rings */}
      <group ref={ringRef}>
        {[1.7, 1.95, 2.2].map((r, i) => (
          <mesh key={i} rotation={[i * 0.8, i * 0.4, 0]}>
            <torusGeometry args={[r, 0.015, 8, 48]} />
            <meshBasicMaterial
              color={i === 1 ? "#c084fc" : "#67e8f9"}
              transparent
              opacity={0.45 - eggCrack * 0.4}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function HyperWarpTunnel({ active = false }: { active: boolean }) {
  const tunnelRef = useRef<THREE.Points>(null);
  const count = 1200;

  const positions = useRef(
    (() => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const radius = 1.2 + Math.random() * 4.5;
        pos[i * 3] = Math.cos(theta) * radius;
        pos[i * 3 + 1] = Math.sin(theta) * radius;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      }
      return pos;
    })()
  ).current;

  useFrame((_, delta) => {
    if (!tunnelRef.current || !active) return;
    const pos = tunnelRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += delta * 75; // hyper-speed dive
      if (arr[i * 3 + 2] > 20) {
        arr[i * 3 + 2] = -60;
      }
    }
    pos.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={tunnelRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#7dd3fc"
        size={0.14}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function CinematicIntroCutscene({ creature, custom, onComplete }: IntroCutsceneProps) {
  const [chapterIdx, setChapterIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isWarping, setIsWarping] = useState(false);
  const [waveHeights, setWaveHeights] = useState<number[]>([12, 28, 45, 20, 36, 18, 50, 24]);
  const currentChapter = chapters[chapterIdx];

  // Speech Synthesis Controller
  const speakVoice = (text: string) => {
    if (isMuted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();

      // Find realistic natural female English voice
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Female") ||
            v.name.includes("Samantha") ||
            v.name.includes("Google US English") ||
            v.name.includes("Jenny") ||
            v.name.includes("Zira") ||
            v.name.includes("Victoria") ||
            v.name.includes("Natural"))
      );

      if (preferred) utterance.voice = preferred;
      utterance.pitch = 1.05;
      utterance.rate = 0.88;
      utterance.volume = 0.95;

      utterance.onstart = () => {
        cinematicAudio.heartbeat(0.9);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis unavailable", e);
    }
  };

  // Trigger speech on chapter change
  useEffect(() => {
    cinematicAudio.heartbeat(1.1);
    speakVoice(currentChapter.spoken);

    // Audio wave animation
    const interval = setInterval(() => {
      setWaveHeights((prev) =>
        prev.map(() => Math.floor(10 + Math.random() * 45))
      );
    }, 120);

    const timer = setTimeout(() => {
      if (chapterIdx < chapters.length - 1) {
        setChapterIdx((prev) => prev + 1);
      } else {
        // Trigger hyper-warp dive
        setIsWarping(true);
        cinematicAudio.whoosh(1.8);
        cinematicAudio.cinematicHit(1.4);
        setTimeout(() => {
          window.speechSynthesis?.cancel();
          onComplete();
        }, 3200);
      }
    }, currentChapter.duration);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [chapterIdx, isMuted]);

  const handleSkip = () => {
    window.speechSynthesis?.cancel();
    cinematicAudio.whoosh(1.5);
    setIsWarping(true);
    setTimeout(() => {
      onComplete();
    }, 600);
  };

  const eggCrackProgress = chapterIdx === 4 ? 0.85 : chapterIdx === 3 ? 0.35 : 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black text-slate-100 select-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* 21:9 Letterbox Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-16 md:h-20 bg-black z-30 flex items-center justify-between px-8 border-b border-cyan-950/40">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-mono text-xs tracking-widest text-cyan-300">
            // GENESIS SIMULATION // PRE-BIRTH INCUBATION
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Mute Voice Toggle */}
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (!isMuted) window.speechSynthesis?.cancel();
            }}
            className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 transition"
            title={isMuted ? "Unmute Voice" : "Mute Voice"}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* Skip Button */}
          <button
            onClick={handleSkip}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition"
          >
            <FastForward size={14} /> Skip Intro
          </button>
        </div>
      </div>

      {/* 3D Viewport: Amniotic Egg & Pre-Born Creature */}
      <div className="flex-1 w-full h-full relative">
        <Canvas camera={{ position: [0, 0.4, currentChapter.cameraDist], fov: currentChapter.cameraFov }}>
          <ambientLight intensity={0.4} />
          <pointLight position={[0, 0, 0]} intensity={2.5} color="#38bdf8" distance={8} />
          <directionalLight position={[4, 6, 4]} intensity={1.5} color="#e0f2fe" />

          {/* Organism inside Amniotic Egg */}
          <Float speed={1.8} rotationIntensity={0.2} floatIntensity={0.4}>
            <CreatureModel
              creature={creature}
              custom={custom}
              scale={0.9}
              active
              animationMode={chapterIdx >= 3 ? "attack" : "idle"}
            />
            <AmnioticEgg eggCrack={eggCrackProgress} />
          </Float>

          <HyperWarpTunnel active={isWarping} />
          <Sparkles count={140} scale={8} size={2.2} speed={0.5} opacity={0.7} color="#38bdf8" />
        </Canvas>

        {/* Warp Flash Overlay */}
        <AnimatePresence>
          {isWarping && (
            <motion.div
              className="absolute inset-0 bg-white z-40 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.8, 1] }}
              transition={{ duration: 1.5 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 21:9 Letterbox Bottom Bar: Subtitles & The Mind Girl Dialogue */}
      <div className="absolute bottom-0 left-0 right-0 min-h-[140px] md:min-h-[180px] bg-gradient-to-t from-black via-black/95 to-transparent z-30 flex flex-col justify-end pb-8 px-8">
        <div className="max-w-4xl mx-auto w-full space-y-3 text-center">
          {/* Mind Girl Voice Speaker Badge & Audio Waveform */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-[11px] font-bold tracking-widest text-cyan-400 font-mono uppercase flex items-center gap-1.5">
              <Activity size={13} className="text-cyan-400 animate-pulse" />
              THE MIND CONSCIOUSNESS (AETHELIA)
            </span>

            {/* Audio Wave Visualizer */}
            {!isMuted && (
              <div className="flex items-center gap-1 h-4">
                {waveHeights.map((h, i) => (
                  <span
                    key={i}
                    className="w-1 bg-cyan-400 rounded-full transition-all duration-100"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Dialogue Text Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentChapter.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="space-y-2"
            >
              <h2 className="text-lg md:text-2xl font-bold tracking-wide text-cyan-100 leading-snug drop-shadow-md">
                "{currentChapter.spoken}"
              </h2>
              <p className="text-xs md:text-sm text-slate-400 font-light max-w-2xl mx-auto leading-relaxed">
                {currentChapter.lore}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Chapter Progress Indicators */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {chapters.map((ch, idx) => (
              <div
                key={ch.id}
                className={`h-1 rounded-full transition-all duration-500 ${
                  idx === chapterIdx
                    ? "w-8 bg-cyan-400"
                    : idx < chapterIdx
                    ? "w-3 bg-cyan-700"
                    : "w-3 bg-slate-800"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
