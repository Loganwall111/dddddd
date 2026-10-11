import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, GodRays, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { AnimatePresence, motion } from "motion/react";
import { Play, Home, Film, Volume2, MousePointer2, Waves, CloudLightning, CloudRain, Cloud, Sun, Sparkles, Compass } from "lucide-react";
import { createEnvState, worldBus, type EnvState } from "../game/bus";
import { cinematicAudio } from "../audio/engine";
import { LAYER_AUDIO, layerInfo, type LayerId, type MultiverseSettings } from "../game/lore";
import { Player } from "./Player";
import { VerdantLayer, verdantHeight } from "../world/Verdant";
import { RealityLayer, portalSlotFor } from "../world/Layers";

interface GameShellProps {
  layer: LayerId;
  seed: string;
  settings: MultiverseSettings;
  onTravel: (layer: LayerId) => void;
  onExit: () => void;
  onReplayIntro: () => void;
  onVolume: (value: number) => void;
}

/* ------------------------------------------------------------------ */
/* Post-processing — god rays from the living sun on Verdant            */
/* ------------------------------------------------------------------ */

function PostFX({ layer, env, quality, bloom, vignette, godRays }: { layer: LayerId; env: EnvState; quality: MultiverseSettings["quality"]; bloom: boolean; vignette: boolean; godRays: boolean }) {
  const [sun, setSun] = useState<THREE.Mesh | null>(null);
  useFrame(() => {
    if (layer === "verdant" && env.sunMesh && env.sunMesh !== sun) setSun(env.sunMesh);
    else if (layer !== "verdant" && sun) setSun(null);
  });
  const rays = godRays && sun;
  return (
    <EffectComposer multisampling={quality === "ultra" ? 4 : 0}>
      {rays ? (
        <GodRays sun={sun} samples={quality === "ultra" ? 60 : 32} density={0.95} decay={0.92} weight={0.34} exposure={0.46} clampMax={1} blur />
      ) : null}
      {bloom && !rays ? <Bloom intensity={layer === "verdant" ? 0.9 : 1.25} luminanceThreshold={0.32} luminanceSmoothing={0.72} mipmapBlur /> : null}
      <Noise opacity={0.014} blendFunction={BlendFunction.SOFT_LIGHT} />
      {vignette && <Vignette offset={0.14} darkness={0.68} />}
    </EffectComposer>
  );
}

/* ------------------------------------------------------------------ */
/* Weather icon                                                         */
/* ------------------------------------------------------------------ */

function WeatherIcon({ kind, rain }: { kind: string; rain: number }) {
  if (kind === "storm") return <CloudLightning size={13} />;
  if (kind === "rain") return <CloudRain size={13} />;
  if (kind === "clouds" || rain > 0.2) return <Cloud size={13} />;
  return <Sun size={13} />;
}

/* ------------------------------------------------------------------ */
/* The in-reality shell                                                 */
/* ------------------------------------------------------------------ */

export function GameShell({ layer, seed, settings, onTravel, onExit, onReplayIntro, onVolume }: GameShellProps) {
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intro, setIntro] = useState(true);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [speed, setSpeed] = useState(0);
  const [weatherKind, setWeatherKind] = useState("clear");
  const [rain, setRain] = useState(0);
  const [clockLabel, setClockLabel] = useState("--:--");
  const [underwater, setUnderwater] = useState(false);
  const [fade, setFade] = useState(0);
  const [travelToast, setTravelToast] = useState<string | null>(null);
  const travelBusy = useRef(false);
  const env = useMemo(() => createEnvState(), []);
  const info = layerInfo(layer);

  const blocked = paused || intro;

  useEffect(() => {
    const off = worldBus.on((event) => {
      if (event.type === "weather") {
        setWeatherKind(event.kind);
        setRain(event.rain);
        cinematicAudio.setRain(event.rain);
      } else if (event.type === "clock") setClockLabel(event.label);
      else if (event.type === "underwater") setUnderwater(event.active);
    });
    return () => {
      off();
      cinematicAudio.setRain(0);
      cinematicAudio.setUnderwater(false);
    };
  }, []);

  useEffect(() => {
    cinematicAudio.setScene(layer, settings.audio, LAYER_AUDIO[layer]);
    return () => cinematicAudio.setScene("menu", settings.audio);
  }, [layer, settings.audio]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "KeyP" || event.code === "Escape") {
        if (intro) return;
        setPaused((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [intro]);

  const travel = useCallback(
    (target: LayerId) => {
      if (travelBusy.current) return;
      travelBusy.current = true;
      setFade(1);
      cinematicAudio.transition(true);
      window.setTimeout(() => {
        onTravel(target);
        setTravelToast(layerInfo(target).name);
        window.setTimeout(() => {
          setFade(0);
          setTravelToast(null);
          travelBusy.current = false;
        }, 500);
      }, 620);
    },
    [onTravel],
  );

  const begin = useCallback(() => {
    setIntro(false);
    window.setTimeout(() => window.dispatchEvent(new Event("mv-bind-camera")), 120);
  }, []);

  const portalSlot = useMemo(() => portalSlotFor(layer, travel, layer === "verdant" ? (x, z) => verdantHeight(x, z) : undefined), [layer, travel]);

  const coordinates = position.map((value) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}`).join("  ");

  return (
    <div className="game-stage">
      <Canvas
        shadows={settings.quality !== "low"}
        dpr={Math.max(0.6, Math.min(2, (settings.quality === "ultra" ? 1.6 : settings.quality === "medium" ? 1.25 : 1) * (settings.renderScale / 100)))}
        camera={{ position: [0, 2, 12], fov: settings.fov, near: 0.05, far: layer === "verdant" ? 3200 : 600 }}
        gl={{ antialias: settings.quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.18;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Player layer={layer} env={layer === "verdant" ? env : null} paused={blocked || fade > 0} onLockChange={setLocked} onPosition={(pos, spd) => { setPosition(pos); setSpeed(spd); }} sensitivity={50} />
        {layer === "verdant" ? (
          <VerdantLayer seed={seed} quality={settings.quality} env={env} onTravel={travel} portalSlot={portalSlot} />
        ) : (
          <RealityLayer layer={layer} seed={seed} quality={settings.quality} onTravel={travel} portalSlot={portalSlot} />
        )}
        <PostFX layer={layer} env={env} quality={settings.quality} bloom godRays vignette />
      </Canvas>

      {/* grade + underwater tint */}
      <div className="game-grade" />
      {underwater && <div className="underwater-grade" />}
      {underwater && (
        <div className="underwater-badge">
          <Waves size={14} /> UNDERWATER — SPACE TO SURFACE
        </div>
      )}

      {/* HUD */}
      <div className="game-hud">
        <header className="hud-top">
          <div className="hud-brand">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="2.5" fill="currentColor" />
              <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" />
              <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" transform="rotate(60 16 16)" />
              <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" transform="rotate(120 16 16)" />
            </svg>
            <strong>THE MULTIVERSE</strong>
            <span>LODEMUS LINK ACTIVE</span>
          </div>
          <div className="hud-layer">
            <span style={{ color: info.color }}>
              <Compass size={13} /> {info.name}
            </span>
            <strong>{info.tagline}</strong>
            <em>
              <WeatherIcon kind={weatherKind} rain={rain} /> {clockLabel} · {weatherKind.toUpperCase()}
            </em>
          </div>
        </header>

        <div className="reticle">
          <i />
          <i />
        </div>

        <footer className="hud-bottom">
          <div className="hud-controls">
            <span>
              <kbd>WASD</kbd> MOVE
            </span>
            <span>
              <kbd>SHIFT</kbd> {layer === "verdant" ? "RUN" : "SURGE"}
            </span>
            <span>
              <kbd>SPACE</kbd> {layer === "verdant" ? "JUMP / RISE" : "ASCEND"}
            </span>
            {layer === "verdant" && (
              <span>
                <kbd>C</kbd> {underwater ? "DIVE" : "DESCEND"}
              </span>
            )}
            <span>
              <kbd>P</kbd> PAUSE
            </span>
          </div>
          <div className="hud-coords">
            {coordinates}
            <i />
            {speed.toFixed(1)} u/s
          </div>
        </footer>

        {!locked && !blocked && fade === 0 && (
          <div className="pointer-hint">
            <MousePointer2 size={15} /> CLICK TO LOOK AROUND
          </div>
        )}
      </div>

      {/* gateway arrival toast */}
      <AnimatePresence>
        {travelToast && (
          <motion.div className="travel-toast" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Sparkles size={15} /> ENTERING {travelToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* awakening card */}
      <AnimatePresence>
        {intro && (
          <motion.div className="awakening" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} onClick={begin}>
            <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8 }}>
              <span className="awakening-eyebrow">LODEMUS LINK ESTABLISHED</span>
              <h1>
                {info.name}
              </h1>
              <p>{info.description}</p>
              <div className="awakening-actions">
                <button className="btn btn-primary" onClick={(event) => { event.stopPropagation(); begin(); }}>
                  STEP FORWARD <Play size={15} />
                </button>
              </div>
              <span className="awakening-hint">CLICK ANYWHERE TO BEGIN</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* pause */}
      <AnimatePresence>
        {paused && (
          <motion.div className="pause-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="pause-panel" initial={{ scale: 0.96, y: 14 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <span className="pause-kicker">REALITY SUSPENDED</span>
              <h2>{info.name}</h2>
              <div className="pause-actions">
                <button className="btn btn-primary" onClick={() => setPaused(false)}>
                  <Play size={15} /> RESUME
                </button>
                <button className="btn" onClick={onExit}>
                  <Home size={15} /> REALITY SELECT
                </button>
                <button className="btn" onClick={onReplayIntro}>
                  <Film size={15} /> GENESIS FILM
                </button>
              </div>
              <label className="pause-volume">
                <Volume2 size={15} />
                <input type="range" min="0" max="100" value={settings.audio} onChange={(event) => onVolume(Number(event.target.value))} />
                <b>{settings.audio}%</b>
              </label>
              <small>THE MULTIVERSE REMEMBERS YOU · LODEMUS v1.0</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* travel fade */}
      <div className="travel-fade" style={{ opacity: fade }} />
    </div>
  );
}

/* volume passthrough (kept simple — settings live in App) */
