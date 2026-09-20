import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Atom, BookOpen, Brain, Compass,
  Dna, Eye, Flame, Moon,
  Orbit, Pause, Play, Radio, Shield, ShieldAlert, Sparkles,
  TrendingUp, Wind, Zap, X, Utensils, Heart, Camera,
} from "lucide-react";
import { GameWorld } from "../scenes/GameWorld";
import {
  expeditionFor, getRealm, realmIndexOf, nearestDistrict,
  structureBlueprints, foodsCatalog, saveWorld,
  type CreatureDefinition, type Discovery, type District,
  type GameMode, type InventoryItem,
  type PlacedStructure, type SaveState, type StructureBlueprint,
  type WorldLayer,
} from "../game/procedural";
import type { AppSettings } from "./MainMenu";
import { cinematicAudio } from "../audio/CinematicAudio";

interface GameExperienceProps {
  initialSave: SaveState;
  creature: CreatureDefinition;
  settings: AppSettings;
  sandbox?: boolean;
  onSave: (save: SaveState) => void;
  onExit: () => void;
}

type CameraMode = "first" | "third" | "orbit";
type PanelKind = "journal" | "evolution" | "pause" | "civilization" | "physics" | "inventory" | "crafting" | "atlas" | "stages" | null;

const inventoryCatalog: Record<string, Omit<InventoryItem, "count">> = {
  "lumen-shard": { id: "lumen-shard", name: "Lumen Shard", kind: "shard", essence: 6 },
  "vestige-organ": { id: "vestige-organ", name: "Vestige Organ", kind: "organ", essence: 9 },
  "district-essence": { id: "district-essence", name: "District Essence", kind: "essence", essence: 12 },
  "signal-thread": { id: "signal-thread", name: "Signal Thread", kind: "signal", essence: 16 },
  "aether-mote": { id: "aether-mote", name: "Aether Mote", kind: "mote", essence: 4 },
};

const traitOptions = [
  { id: "Pressure lattice", icon: Shield, cost: 24, copy: "A mineral collagen matrix protects against pressure and collision." },
  { id: "Polarized sight", icon: Eye, cost: 28, copy: "Detect magnetic paths, hidden organisms and radiation gradients." },
  { id: "Social memory", icon: Brain, cost: 32, copy: "Share learned behavior. Enables permanent communal structures." },
  { id: "Vacuum metabolism", icon: Orbit, cost: 40, copy: "Sustain biological processes in sparse atmosphere and hard vacuum." },
  { id: "Thermal vent affinity", icon: Flame, cost: 34, copy: "Harvest energy from chemical hotspots. +ECO yield near vents." },
  { id: "Neural choir", icon: TrendingUp, cost: 48, copy: "Signals synchronize. Structures multiply population growth." },
  { id: "Bioluminescent broadcast", icon: Sparkles, cost: 56, copy: "Project patterns of collective intent across the local web." },
  { id: "Recursive organelle", icon: Atom, cost: 55, copy: "A stable inner ecosystem generates energy across nested scales." },
  { id: "Directed morphogenesis", icon: Dna, cost: 65, copy: "Reconfigure body architecture during a single lifespan." },
  { id: "Reality anchor", icon: Moon, cost: 80, copy: "Your broadcast lingers in the void. Survive dimensional transitions with less stress." },
];

function CombatImpactFlash({ signal }: { signal: number }) {
  const [opacity, setOpacity] = useState(0);
  const lastSignal = useRef(0);
  useEffect(() => {
    if (signal === 0 || signal === lastSignal.current) return;
    lastSignal.current = signal;
    setOpacity(0.55);
    const start = performance.now();
    const fade = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / 320);
      const value = 0.55 * (1 - t * t);
      setOpacity(value);
      if (t < 1) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, [signal]);
  return <div className="combat-impact-flash pointer-events-none fixed inset-0 z-30 bg-red-600/30 transition-opacity" style={{ opacity }} />;
}

function StarvationOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-start pt-16">
      <div className="absolute inset-0 bg-radial from-transparent via-red-950/20 to-red-900/50 animate-pulse" />
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 px-5 py-2 rounded-xl bg-red-950/90 border border-red-500/80 text-red-200 font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 animate-bounce"
      >
        <ShieldAlert className="text-red-400" size={16} />
        Critical Starvation — Consume Foraged Nutrients (Press E)
      </motion.div>
    </div>
  );
}

function GameBrand() {
  return (
    <div className="game-brand">
      <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="2.5" fill="currentColor" /><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" /><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" transform="rotate(60 16 16)" /></svg>
      <strong>LUMITAL</strong><span>LIVE REALITY</span>
    </div>
  );
}

function JournalPanel({ state, onClose }: { state: SaveState; onClose: () => void }) {
  return (
    <motion.section className="game-panel journal-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header><div><span className="hud-label">DISCOVERIES</span><h2>Field Journal</h2></div><button onClick={onClose}><X size={20} /></button></header>
      <div className="journal-list">
        {state.discoveries.map((d) => (
          <article key={d.id}><div><h3>{d.name}</h3><p>{d.note}</p></div></article>
        ))}
      </div>
    </motion.section>
  );
}

function EvolutionPanel({ state, onUnlock, onClose }: { state: SaveState; onUnlock: (id: string, cost: number) => void; onClose: () => void }) {
  return (
    <motion.section className="game-panel evolution-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header><div><span className="hud-label">GENE RECOMBINATION</span><h2>Evolution</h2></div><button onClick={onClose}><X size={20} /></button></header>
      <div className="trait-list">
        {traitOptions.map((t) => {
          const unlocked = (state.traits ?? []).includes(t.id);
          return (
            <article key={t.id} className={unlocked ? "is-unlocked" : ""}>
              <div><h3>{t.id}</h3><p>{t.copy}</p></div>
              <button disabled={unlocked || state.evolution < t.cost} onClick={() => onUnlock(t.id, t.cost)}>
                {unlocked ? "Integrated" : `${t.cost} EV`}
              </button>
            </article>
          );
        })}
      </div>
    </motion.section>
  );
}

function InventoryPanel({ state, onConsume, onClose }: { state: SaveState; onConsume: (id?: string) => void; onClose: () => void }) {
  return (
    <motion.section className="game-panel inventory-panel" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
      <header><div><span className="hud-label">MATTER &amp; RATIONS</span><h2>Inventory</h2></div><button onClick={onClose}><X size={20} /></button></header>
      <div className="inventory-list">
        {(state.inventory ?? []).map((item) => (
          <article key={item.id} className="inventory-item flex items-center justify-between p-3 border-b border-slate-800">
            <div><h3 className="font-bold text-sm text-cyan-200">{item.name}</h3><small className="text-slate-400">ESSENCE: +{item.essence}</small></div>
            <div className="inv-actions flex items-center gap-2"><b className="font-mono text-cyan-400">×{item.count}</b><button className="px-2.5 py-1 bg-cyan-900 rounded text-xs" onClick={() => onConsume(item.id)}>Absorb</button></div>
          </article>
        ))}
      </div>
    </motion.section>
  );
}

function PausePanel({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  return (
    <motion.section className="game-panel pause-panel" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
      <h2>SIMULATION PAUSED</h2>
      <div className="panel-actions">
        <button className="primary-action" onClick={onResume}><Play size={16} /> Resume</button>
        <button onClick={onExit}>Exit to Genesis Main Menu</button>
      </div>
    </motion.section>
  );
}

export function GameExperience({ initialSave, creature, settings, sandbox = false, onSave, onExit }: GameExperienceProps) {
  // Game Mode: "survival" | "creative" | "exploration"
  const gameMode = (initialSave.gameMode ?? (sandbox ? "creative" : "survival")) as GameMode;

  const [state, setState] = useState<SaveState>(() => {
    const base: SaveState = sandbox ? { ...initialSave, evolution: Math.max(140, initialSave.evolution), layer: "quantum" } : initialSave;
    return {
      ...base,
      gameMode,
      energy: base.energy ?? 80,
      hunts: base.hunts ?? 0,
      inventory: base.inventory ?? [{ ...inventoryCatalog["lumen-shard"], count: 2 }],
      districtClaims: base.districtClaims ?? [],
      scenario: base.scenario ?? (sandbox ? undefined : expeditionFor(base.scenario).id),
      crafted: base.crafted ?? [],
      characterName: base.characterName ?? initialSave.customCreature?.name ?? creature.genus,
      lifeStage: base.lifeStage ?? "modern",
      structuresList: base.structuresList ?? [],
      foodsInventory: base.foodsInventory ?? {
        "lumen-berry": gameMode === "creative" ? 99 : 6,
        "spore-fruit": gameMode === "creative" ? 99 : 3,
        "hydro-kelp": gameMode === "creative" ? 99 : 4,
        "organ-marrow": gameMode === "creative" ? 99 : 1,
      },
      health: base.health ?? 100,
      hunger: base.hunger ?? (gameMode === "creative" ? 100 : 92),
      stamina: base.stamina ?? 100,
    };
  });

  // Vitals
  const [health, setHealth] = useState(state.health ?? 100);
  const [hunger, setHunger] = useState(state.hunger ?? (gameMode === "creative" ? 100 : 92));
  const [stamina, setStamina] = useState(state.stamina ?? 100);
  const [foods, setFoods] = useState<Record<string, number>>(() => state.foodsInventory ?? {});
  const [eatFeedback, setEatFeedback] = useState<{ text: string; id: number } | null>(null);

  // Creative Mode features
  const [isFlying, setIsFlying] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState<StructureBlueprint["type"] | null>(null);
  const [placedStructures, setPlacedStructures] = useState<PlacedStructure[]>(() => state.structuresList ?? []);

  // First Arrival Message
  const [firstMessageVisible, setFirstMessageVisible] = useState(true);

  // Exploration Mode features
  const [photoMode, setPhotoMode] = useState(false);

  // Save toast feedback
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Realm & Navigation
  const [realmId, setRealmId] = useState<string>(() => sandbox ? "quantum" : initialSave.layer);
  const realm = useMemo(() => getRealm(realmId), [realmId]);
  const expedition = useMemo(() => expeditionFor(state.scenario), [state.scenario]);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [speed, setSpeed] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>("third");
  const [district, setDistrict] = useState<District | null>(null);
  const [attackSignal, setAttackSignal] = useState(0);
  const [impactFlash, setImpactFlash] = useState(0);

  // Auto-dismiss the first message after 7 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setFirstMessageVisible(false);
    }, 7500);
    return () => clearTimeout(timer);
  }, []);

  // Hunger & Starvation Tick (Survival Mode)
  const isStarving = gameMode === "survival" && hunger <= 0;

  useEffect(() => {
    if (gameMode !== "survival") return;
    const interval = setInterval(() => {
      setHunger((prev) => Math.max(0, prev - 1));
    }, 3800);
    return () => clearInterval(interval);
  }, [gameMode]);

  // Starvation Health Drain
  useEffect(() => {
    if (!isStarving) return;
    cinematicAudio.starvationWarning();
    const interval = setInterval(() => {
      cinematicAudio.starvationWarning();
      setHealth((h) => {
        const next = Math.max(0, h - 4);
        if (next === 0) {
          cinematicAudio.cinematicHit(1.6);
        }
        return next;
      });
      setImpactFlash(Date.now());
    }, 1800);
    return () => clearInterval(interval);
  }, [isStarving]);

  // Sync state changes with local storage
  const persistWorld = useCallback(() => {
    const updated: SaveState = {
      ...state,
      health,
      hunger,
      stamina,
      foodsInventory: foods,
      structuresList: placedStructures,
      structures: placedStructures.length,
      playerPos: position,
      lastPlayed: Date.now(),
    };
    setState(updated);
    onSave(updated);

    if (state.id) {
      saveWorld({
        id: state.id,
        name: state.name || `World ${state.seed.slice(0, 8)}`,
        seed: state.seed,
        gameMode,
        creatureId: creature.id,
        creatureName: state.characterName || creature.genus,
        customCreature: state.customCreature || {
          name: state.characterName || creature.genus,
          bodyPlan: creature.bodyPlan,
          hue: creature.hue,
          accentHue: (creature.hue + 140) % 360,
          saturation: 75,
          lightness: 55,
          emissiveIntensity: 0.7,
          emissiveHue: (creature.hue + 35) % 360,
          finish: "organic",
          pattern: "biolum-veins",
          headwear: "none",
          outfit: "none",
          backWings: "none",
          accessory: "none",
          eyeType: "two",
          eyeColor: "#6ee7b7",
          scale: creature.scale || 1.0,
          limbs: creature.limbs || 4,
          segments: creature.segments || 3,
          spineArch: 0,
          tailLength: 1.0,
          auraIntensity: 0.6,
        },
        health,
        maxHealth: 100,
        hunger,
        stamina,
        evolution: state.evolution,
        cycle: state.cycle,
        structures: placedStructures.length,
        structuresList: placedStructures,
        foodsInventory: foods,
        inventory: state.inventory || [],
        discoveries: state.discoveries,
        traits: state.traits,
        scenario: state.scenario,
        layer: (realm.key || realmId) as WorldLayer,
        position,
        playtimeSeconds: 0,
        createdAt: Date.now(),
        lastPlayed: Date.now(),
        hasSeenCutscene: true,
      });
    }

    setSaveToast("CONTINUUM SAVED // PERSISTENCE SYNCHRONIZED");
    setTimeout(() => setSaveToast(null), 2500);
    cinematicAudio.select();
  }, [creature.bodyPlan, creature.genus, creature.hue, creature.id, creature.limbs, creature.scale, creature.segments, foods, gameMode, health, hunger, onSave, placedStructures, position, realm.key, realmId, stamina, state]);

  // Eating Action
  const handleEat = useCallback((foodId?: string) => {
    let targetFood = foodId;
    if (!targetFood) {
      const keys = Object.keys(foods);
      targetFood = keys.find((k) => (foods[k] ?? 0) > 0);
    }
    if (!targetFood || (foods[targetFood] ?? 0) <= 0) return;

    const meta = foodsCatalog[targetFood] ?? foodsCatalog["lumen-berry"];
    cinematicAudio.eat();

    setFoods((prev) => ({
      ...prev,
      [targetFood!]: Math.max(0, (prev[targetFood!] ?? 0) - 1),
    }));

    setHunger((prev) => Math.min(100, prev + meta.hungerRestore));
    setHealth((prev) => Math.min(100, prev + meta.healthRestore));
    setStamina((prev) => Math.min(100, prev + meta.staminaRestore));

    setEatFeedback({
      text: `+${meta.hungerRestore} HUNGER / +${meta.healthRestore} HP [${meta.name}]`,
      id: Date.now(),
    });
    setTimeout(() => setEatFeedback(null), 2200);
  }, [foods]);

  // Foraged Food Event
  const handleFoodHarvested = useCallback((foodId: string, count: number) => {
    cinematicAudio.pickup();
    setFoods((prev) => ({
      ...prev,
      [foodId]: (prev[foodId] ?? 0) + count,
    }));
    const meta = foodsCatalog[foodId];
    setEatFeedback({
      text: `+${count} ${meta?.name ?? foodId} HARVESTED`,
      id: Date.now(),
    });
    setTimeout(() => setEatFeedback(null), 2000);
  }, []);

  // Google Watcher Damage Event
  const handlePlayerDamage = useCallback((damage: number) => {
    if (gameMode === "creative" || gameMode === "exploration") return;
    setHealth((h) => Math.max(0, h - damage));
    setImpactFlash(Date.now());
    cinematicAudio.googleLaser();
  }, [gameMode]);

  // Google Watcher Defeated Event
  const handleGoogleDefeated = useCallback(() => {
    cinematicAudio.cinematicHit(1.5);
    handleFoodHarvested("google-core", 1);
    const discovery: Discovery = {
      id: `google-watcher-${Date.now()}`,
      name: "G.O.O.G.L.E. Watcher Neutralized",
      category: "Machine Entity",
      layer: realmId,
      time: Date.now(),
      note: "An ancient autonomous surveillance drone was dismantled. Its algorithm core yields immense bio-energy.",
    };
    setState((prev) => ({
      ...prev,
      discoveries: [discovery, ...prev.discoveries],
      evolution: prev.evolution + 40,
    }));
  }, [handleFoodHarvested, realmId]);

  // Structure Placement Event
  const handleStructurePlaced = useCallback((structure: PlacedStructure) => {
    setPlacedStructures((prev) => [...prev, structure]);
    cinematicAudio.structurePlace();
    setActiveBlueprint(null);
  }, []);

  // Radar Scan (Exploration Mode)
  const triggerRadarScan = useCallback(() => {
    cinematicAudio.scanSonar();
    setEatFeedback({
      text: "SONIC RADAR: SCANNING 4 NEAREST ANCIENT DISTRICTS",
      id: Date.now(),
    });
    setTimeout(() => setEatFeedback(null), 2500);
  }, []);

  // Respawn after death
  const handleRespawn = () => {
    setHealth(100);
    setHunger(80);
    setStamina(100);
    cinematicAudio.cinematicHit(1.2);
  };

  const unlockTrait = (id: string, cost: number) => {
    cinematicAudio.select();
    setState((current) => current.evolution >= cost && !current.traits.includes(id)
      ? { ...current, evolution: current.evolution - cost, traits: [...current.traits, id], lastPlayed: Date.now() }
      : current);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyE") {
        handleEat();
      }
      if (e.code === "KeyG") {
        if (gameMode === "creative") {
          setIsFlying((f) => !f);
          cinematicAudio.select();
        }
      }
      if (e.code === "KeyB") {
        if (gameMode === "creative") {
          setActiveBlueprint((curr) => curr ? null : "spire");
          cinematicAudio.hover();
        }
      }
      if (e.code === "KeyV") {
        if (gameMode === "exploration") {
          triggerRadarScan();
        }
      }
      if (e.code === "KeyP") {
        if (gameMode === "exploration") {
          setPhotoMode((p) => !p);
          cinematicAudio.select();
        }
      }
      if (e.code === "KeyQ") {
        attack();
      }
      if (e.code === "KeyT") {
        toggleCamera();
      }
      if (e.code === "KeyJ") setPanel((curr) => curr === "journal" ? null : "journal");
      if (e.code === "KeyI") setPanel((curr) => curr === "inventory" ? null : "inventory");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameMode, handleEat, triggerRadarScan]);

  const updatePosition = useCallback((next: [number, number, number], nextSpeed: number) => {
    setPosition([next[0], next[1], next[2]]);
    setSpeed(nextSpeed);
    const found = nearestDistrict(state.seed, next[0], next[2]);
    setDistrict((current) => (found?.id ?? null) !== (current?.id ?? null) ? found : current);
  }, [state.seed]);

  const changeLayer = useCallback((targetId: string) => {
    if (targetId === realmId || transition) return;
    cinematicAudio.transition(realmIndexOf(targetId) > realmIndexOf(realmId));
    setTransition({ from: realmId, to: targetId });
    setTimeout(() => {
      setRealmId(targetId);
      setState((curr) => ({ ...curr, layer: targetId }));
      setTransition(null);
    }, 800);
  }, [realmId, transition]);

  const toggleCamera = () => {
    setCameraMode((curr) => curr === "first" ? "third" : curr === "third" ? "orbit" : "first");
    cinematicAudio.hover();
  };

  const attack = () => {
    cinematicAudio.attack();
    setAttackSignal((s) => s + 1);
  };

  const onPrey = (count: number) => {
    cinematicAudio.pickup();
    handleFoodHarvested("organ-marrow", count);
  };

  return (
    <main className={`game-experience relative w-full h-full select-none overflow-hidden ${photoMode ? "photo-mode" : ""}`}>
      {/* 3D World Canvas */}
      <div className="world-canvas absolute inset-0 z-0">
        <GameWorld
          seed={state.seed}
          layer={(realm.key ?? realmId) as WorldLayer}
          realmId={realmId}
          structures={state.structures}
          quality={settings.quality}
          bloom={settings.bloom}
          godRays={settings.godRays}
          vignette={settings.vignette}
          chromaticAberration={settings.chromaticAberration}
          antialiasing={settings.antialiasing}
          shadows={settings.shadows}
          filmGrain={settings.filmGrain}
          cameraShake={settings.cameraShake}
          particleDensity={settings.particleDensity}
          renderScale={settings.renderScale}
          fov={settings.fov}
          viewDistance={settings.viewDistance}
          reducedMotion={settings.reducedMotion}
          paused={Boolean(panel || firstMessageVisible || health <= 0)}
          cameraMode={cameraMode}
          creature={creature}
          customCreature={state.customCreature}
          characterName={state.characterName ?? state.customCreature?.name ?? creature.genus}
          scenario={state.scenario}
          lifeStage={state.lifeStage}
          tension={15}
          attackSignal={attackSignal}
          grabSignal={0}
          onPrey={onPrey}
          onRealmEnter={changeLayer}
          onLockChange={() => {}}
          onPosition={updatePosition}
          gameMode={gameMode}
          placedStructures={placedStructures}
          activeBuildingBlueprint={activeBlueprint}
          onStructurePlaced={handleStructurePlaced}
          onFoodHarvested={handleFoodHarvested}
          onPlayerDamage={handlePlayerDamage}
          onGoogleDefeated={handleGoogleDefeated}
          isFlying={isFlying}
        />
      </div>

      <CombatImpactFlash signal={impactFlash} />
      <StarvationOverlay active={isStarving} />

      {/* TOP NOTIFICATION TOAST (SAVING / HARVESTING / EATING) */}
      <div className="fixed top-20 left-0 right-0 z-40 flex flex-col items-center pointer-events-none gap-2">
        <AnimatePresence>
          {saveToast && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="px-4 py-2 rounded-xl bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-xs font-bold font-mono tracking-wider shadow-lg"
            >
              {saveToast}
            </motion.div>
          )}
          {eatFeedback && (
            <motion.div
              key={eatFeedback.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="px-4 py-1.5 rounded-full bg-emerald-950/90 border border-emerald-400 text-emerald-200 text-xs font-bold tracking-wide shadow-md"
            >
              {eatFeedback.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FIRST MESSAGE BANNER: "FIND AND SURVIVE AND FIND US." */}
      <AnimatePresence>
        {firstMessageVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="max-w-2xl w-full p-8 rounded-2xl bg-slate-950/90 border border-cyan-800/80 shadow-2xl shadow-cyan-950/80 text-center space-y-5"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-600/50 text-cyan-400 text-[11px] font-mono tracking-widest uppercase">
                <Sparkles size={13} /> INCOMING DIRECTIVE ARCHIVE
              </div>

              <h1 className="text-3xl md:text-5xl font-black text-cyan-100 tracking-wider uppercase drop-shadow-md">
                FIND AND SURVIVE AND FIND US.
              </h1>

              <p className="text-sm md:text-base text-slate-300 leading-relaxed font-light">
                The Mind Girl's voice fades into the planetary winds. The Old Architects remain stranded beyond the cosmic edge. Forage nutrients to survive starvation, beware the roaming <strong className="text-red-400 font-semibold">G.O.O.G.L.E. Watchers</strong>, build shelters, and seek the ancient spires.
              </p>

              <div className="pt-2">
                <button
                  onClick={() => {
                    cinematicAudio.select();
                    setFirstMessageVisible(false);
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-cyan-950 transition"
                >
                  Acknowledge Directive &amp; Awaken
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DEATH SCREEN MODAL */}
      {health <= 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-red-950/90 backdrop-blur-xl">
          <div className="max-w-md w-full p-8 rounded-2xl bg-black/90 border border-red-600 text-center space-y-5">
            <ShieldAlert size={48} className="mx-auto text-red-500 animate-bounce" />
            <h2 className="text-2xl font-black text-red-100 uppercase tracking-wider">
              ORGANISM DISSOLVED
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your organic envelope suffered structural collapse. The Genesis archive remembers your morphological pattern.
            </p>
            <button
              onClick={handleRespawn}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-widest transition shadow-lg shadow-red-950"
            >
              Reconstitute at Beacon
            </button>
          </div>
        </div>
      )}

      {/* HUD INTERFACE */}
      {!photoMode && (
        <div className="game-hud pointer-events-none relative z-10 w-full h-full flex flex-col justify-between p-6">
          {/* TOP BAR */}
          <header className="hud-top pointer-events-auto flex items-center justify-between">
            <GameBrand />

            {/* Middle: Game Mode & Biome info */}
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider font-mono ${
                gameMode === "creative"
                  ? "bg-blue-950/80 border-blue-500/60 text-blue-300"
                  : gameMode === "exploration"
                  ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-300"
                  : "bg-amber-950/80 border-amber-500/60 text-amber-300"
              }`}>
                {gameMode} MODE
              </span>

              <div className="location-heading text-left">
                <span>{realm.label.toUpperCase()} / {state.seed.slice(0, 8)}</span>
                <strong>{expedition.destination} {district && <span className="text-cyan-400 font-mono text-xs ml-2">• {district.name}</span>}</strong>
              </div>
            </div>

            {/* Actions & Save World */}
            <div className="hud-actions flex items-center gap-2">
              <button
                onClick={persistWorld}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-900/60 hover:bg-cyan-800/80 border border-cyan-500/50 text-cyan-200 text-xs font-bold tracking-wider transition flex items-center gap-1.5"
                title="Save World to Archive"
              >
                <Zap size={14} className="text-cyan-400" /> SAVE WORLD
              </button>

              <button onClick={() => setPanel("evolution")}><Dna size={16} /><span>EVOLVE</span></button>
              <button onClick={() => setPanel("journal")}><BookOpen size={16} /><span>JOURNAL</span></button>
              <button onClick={() => setPanel("inventory")}><Atom size={16} /><span>MATTER</span></button>
              <button onClick={() => setPanel("pause")}><Pause size={16} /></button>
            </div>
          </header>

          {/* VITALS HUD (SURVIVAL / CREATIVE / EXPLORATION) */}
          <div className="pointer-events-auto absolute top-20 left-6 flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-md shadow-xl w-64">
            {/* Health Bar */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold tracking-wider">
                <span className="flex items-center gap-1 text-red-400"><Heart size={12} fill="currentColor" /> HEALTH</span>
                <span className="font-mono text-slate-300">{health}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-rose-400 transition-all duration-300"
                  style={{ width: `${health}%` }}
                />
              </div>
            </div>

            {/* Hunger Bar */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold tracking-wider">
                <span className="flex items-center gap-1 text-amber-400"><Utensils size={12} /> HUNGER</span>
                <span className="font-mono text-slate-300">{hunger}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    hunger < 20 ? "bg-red-500 animate-pulse" : "bg-gradient-to-r from-amber-500 to-yellow-400"
                  }`}
                  style={{ width: `${hunger}%` }}
                />
              </div>
            </div>

            {/* Quick Eat Action Slot */}
            <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
              <button
                onClick={() => handleEat()}
                className="flex-1 py-1 px-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/50 text-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                title="Eat Foraged Biomatter (Press E)"
              >
                <Utensils size={13} /> EAT BIOMATTER (E)
              </button>
            </div>

            {/* Food Rations Count */}
            <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
              <div className="p-1 rounded bg-slate-900 border border-slate-800 text-emerald-300">
                Berry: <b>{foods["lumen-berry"] ?? 0}</b>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800 text-purple-300">
                Spore: <b>{foods["spore-fruit"] ?? 0}</b>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                Kelp: <b>{foods["hydro-kelp"] ?? 0}</b>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800 text-rose-300">
                Meat: <b>{foods["organ-marrow"] ?? 0}</b>
              </div>
            </div>
          </div>

          {/* CREATIVE MODE BUILDING TOOLBAR */}
          {gameMode === "creative" && (
            <div className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-2xl bg-slate-950/90 border border-cyan-800/80 backdrop-blur-md shadow-2xl">
              <button
                onClick={() => {
                  setIsFlying(!isFlying);
                  cinematicAudio.select();
                }}
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                  isFlying
                    ? "bg-cyan-500/30 border-cyan-400 text-cyan-200"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Wind size={15} /> FLY MODE [G]: {isFlying ? "ON" : "OFF"}
              </button>

              <div className="h-6 w-px bg-slate-800" />

              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider px-2">
                Schematics:
              </span>

              {structureBlueprints.map((bp) => (
                <button
                  key={bp.type}
                  onClick={() => {
                    setActiveBlueprint(activeBlueprint === bp.type ? null : bp.type);
                    cinematicAudio.hover();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    activeBlueprint === bp.type
                      ? "bg-cyan-500/40 border-cyan-400 text-white shadow-md shadow-cyan-950"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                  title={bp.description}
                >
                  {bp.name.split(" ")[0]}
                </button>
              ))}

              {placedStructures.length > 0 && (
                <button
                  onClick={() => {
                    setPlacedStructures([]);
                    cinematicAudio.thump();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-bold hover:bg-red-900 transition"
                  title="Clear Placed Structures"
                >
                  Clear ({placedStructures.length})
                </button>
              )}
            </div>
          )}

          {/* EXPLORATION MODE RADAR & CAMERA TOOLBAR */}
          {gameMode === "exploration" && (
            <div className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-2xl bg-slate-950/90 border border-emerald-800/80 backdrop-blur-md shadow-2xl">
              <button
                onClick={triggerRadarScan}
                className="px-3.5 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Radio size={15} className="animate-pulse" /> SONIC RADAR SCAN [V]
              </button>
              <button
                onClick={() => setPhotoMode(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Camera size={15} /> POSTCARD PHOTO MODE [P]
              </button>
            </div>
          )}

          {/* BOTTOM CONTROLS HINTS */}
          <footer className="hud-bottom-rail flex items-center justify-between">
            <div className="movement-readout flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Compass size={14} className="text-cyan-400" />
              <span>{speed.toFixed(1)} m/s • {position[0].toFixed(1)}, {position[2].toFixed(1)}</span>
              <span>• {cameraMode.toUpperCase()} VIEW</span>
            </div>

            <div className="control-hints flex items-center gap-3 text-[11px] text-slate-400">
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">WASD</kbd> Move</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">E</kbd> Eat</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">Q</kbd> Attack</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">T</kbd> Cam</span>
              {gameMode === "creative" && (
                <>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">G</kbd> Fly</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-white">B</kbd> Build</span>
                </>
              )}
            </div>
          </footer>
        </div>
      )}

      {/* PHOTO MODE OVERLAY */}
      {photoMode && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between p-8 pointer-events-auto bg-black/10">
          <div className="flex justify-between items-center">
            <span className="font-mono text-xs tracking-widest text-cyan-300 bg-black/60 px-3 py-1 rounded-lg">
              // PHOTO MODE // SNAPSHOT CAMERA
            </span>
            <button
              onClick={() => setPhotoMode(false)}
              className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-bold hover:bg-slate-800 transition"
            >
              Exit Photo Mode [ESC]
            </button>
          </div>
          <div className="text-center">
            <button
              onClick={() => {
                cinematicAudio.select();
                alert("Postcard snapshot captured to Genesis memory!");
              }}
              className="px-6 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold tracking-widest uppercase shadow-2xl transition"
            >
              Capture Postcard
            </button>
          </div>
        </div>
      )}

      {/* PANELS */}
      <AnimatePresence>
        {panel === "evolution" && <EvolutionPanel state={state} onUnlock={unlockTrait} onClose={() => setPanel(null)} />}
        {panel === "journal" && <JournalPanel state={state} onClose={() => setPanel(null)} />}
        {panel === "inventory" && <InventoryPanel state={state} onConsume={handleEat} onClose={() => setPanel(null)} />}
        {panel === "pause" && <PausePanel onResume={() => setPanel(null)} onExit={onExit} />}
      </AnimatePresence>
    </main>
  );
}
