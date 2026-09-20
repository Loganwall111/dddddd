import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GameExperience } from "./components/GameExperience";
import { MainMenu, defaultSettings, type AppSettings } from "./components/MainMenu";
import { CreatureCustomizer } from "./components/CreatureCustomizer";
import { WorldSaveModal } from "./components/WorldSaveModal";
import { CinematicIntroCutscene } from "./components/CinematicIntroCutscene";
import { cinematicAudio } from "./audio/CinematicAudio";
import {
  creatures,
  expeditionFor,
  generateSeed,
  type ExpeditionId,
  type SaveState,
  type WorldSave,
  type GameMode,
  type CustomCreatureConfig,
  createDefaultCustomCreature,
  saveWorld,
} from "./game/procedural";
import { UniverseScene } from "./scenes/UniverseScene";

const SAVE_KEY = "lumital.reality.v1";
const SETTINGS_KEY = "lumital.settings.v1";
const FORM_KEY = "lumital.form.v1";
const CHARACTER_KEY = "lumital.character.v1";
const CUSTOM_KEY = "lumital.customCreature.v1";

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function LumitalSigil() {
  return (
    <svg className="cinematic-sigil" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="5" fill="currentColor" />
      <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" />
      <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" transform="rotate(120 50 50)" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeDasharray="2 8" />
    </svg>
  );
}

function BootSequence({ onSkip }: { onSkip: () => void }) {
  return (
    <motion.div key="boot" className="boot-sequence" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} onClick={onSkip}>
      <div className="boot-horizon" />
      <motion.div className="boot-identity" initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1 }}>
        <LumitalSigil />
        <motion.strong initial={{ letterSpacing: "1.4em", opacity: 0 }} animate={{ letterSpacing: ".42em", opacity: 1 }} transition={{ delay: 0.35, duration: 1.2 }}>LUMITAL</motion.strong>
        <span>PROCEDURAL REALITY SYSTEMS</span>
      </motion.div>
      <div className="boot-diagnostics"><span>QUANTUM TOPOLOGY</span><i /><span>CAUSAL ENGINE</span><i /><span>GENESIS ARCHIVE</span></div>
      <small>CLICK TO SKIP</small>
    </motion.div>
  );
}

function CreationSequence({ save, creatureName, formLabel }: { save: SaveState; creatureName: string; formLabel: string }) {
  const expedition = expeditionFor(save.scenario);
  return (
    <motion.div className="creation-sequence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="creation-backdrop" />
      <div className="creation-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="creation-topline"><span>// GENESIS ARCHIVE / CREATE NEW</span><span>{save.seed}</span></div>
      <div className="creation-core">
        <div className="creation-orbit creation-orbit--outer" /><div className="creation-orbit creation-orbit--inner" />
        <div className="creation-orb"><span>{formLabel.slice(0, 1)}</span></div>
      </div>
      <div className="creation-copy">
        <span className="creation-kicker">ENTITY BINDING / {expedition.scale}</span>
        <h1>{creatureName}</h1>
        <p>{formLabel} form selected. Its first memory will be {expedition.destination.toLowerCase()}.</p>
        <div className="creation-progress"><i /></div>
        <div className="creation-states"><span>ASSEMBLING MORPHOLOGY</span><span>CALIBRATING SENSES</span><span>OPENING HOST PATH</span></div>
      </div>
      <div className="creation-footer"><span>THE ORGANISM IS NOT A CAMERA</span><span>EVERY SCALE CONTAINS A LIFE</span></div>
    </motion.div>
  );
}

function LoadingSequence({ save, creatureName }: { save: SaveState; creatureName: string }) {
  const expedition = expeditionFor(save.scenario);
  return (
    <motion.div key="loading" className="loading-sequence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className={`loading-vista loading-vista--${expedition.id}`} />
      <div className="loading-content">
        <span className="loading-kicker">COLLAPSING POSSIBILITY / {save.seed} / {expedition.scale}</span>
        <h2>Awakening<br />{creatureName}</h2>
        <p>{expedition.label} awaits. {expedition.description}</p>
        <div className="loading-progress"><i /></div>
        <div className="loading-states"><span>GENERATING ECOSYSTEM</span><span>STABILIZING LOCAL PHYSICS</span><span>STREAMING FIRST CONTACT</span></div>
      </div>
      <div className="loading-scale"><span>10<sup>21</sup></span><i /><span>10<sup>0</sup></span><i /><span>10<sup>-15</sup></span></div>
    </motion.div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<"boot" | "menu" | "intro" | "creation" | "loading" | "game">(() => sessionStorage.getItem("lumital.booted") ? "menu" : "boot");
  const [sandbox, setSandbox] = useState(false);
  const [seed, setSeed] = useState(() => readJson<SaveState>(SAVE_KEY)?.seed ?? generateSeed());
  const [selectedCreature, setSelectedCreature] = useState(() => {
    const id = Number(localStorage.getItem(FORM_KEY) ?? 42);
    return creatures.find((creature) => creature.id === id) ?? creatures[42];
  });
  const [characterName, setCharacterName] = useState(() => localStorage.getItem(CHARACTER_KEY) ?? readJson<SaveState>(SAVE_KEY)?.characterName ?? "Luminary Proto");

  const [customCreature, setCustomCreature] = useState<CustomCreatureConfig>(() => {
    const stored = readJson<CustomCreatureConfig>(CUSTOM_KEY);
    if (stored) return stored;
    return createDefaultCustomCreature(selectedCreature);
  });

  const [save, setSave] = useState<SaveState | null>(() => readJson<SaveState>(SAVE_KEY));
  const [activeSave, setActiveSave] = useState<SaveState | null>(null);
  const [activeWorldSave, setActiveWorldSave] = useState<WorldSave | null>(null);

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isWorldSaveModalOpen, setIsWorldSaveModalOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...defaultSettings,
    ...(readJson<Partial<AppSettings>>(SETTINGS_KEY) ?? {}),
  }));

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(FORM_KEY, String(selectedCreature.id)); }, [selectedCreature]);
  useEffect(() => { localStorage.setItem(CHARACTER_KEY, characterName.trim()); }, [characterName]);
  useEffect(() => { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCreature)); }, [customCreature]);

  useEffect(() => {
    const audioScene = phase === "game" ? activeSave?.layer ?? "menu" : phase;
    cinematicAudio.setScene(audioScene, settings.audio);
  }, [activeSave, phase, settings.audio]);

  useEffect(() => {
    const unlock = () => { void cinematicAudio.unlock(); };
    const hover = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      cinematicAudio.hover();
    };
    const select = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button")) cinematicAudio.select();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("pointerover", hover);
    window.addEventListener("click", select);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("pointerover", hover);
      window.removeEventListener("click", select);
    };
  }, []);

  useEffect(() => {
    if (phase !== "boot") return;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem("lumital.booted", "1");
      setPhase("menu");
    }, settings.reducedMotion ? 500 : 2600);
    return () => window.clearTimeout(timer);
  }, [phase, settings.reducedMotion]);

  useEffect(() => {
    if (phase !== "creation") return;
    const timer = window.setTimeout(() => setPhase("intro"), settings.reducedMotion ? 240 : 1200);
    return () => window.clearTimeout(timer);
  }, [phase, settings.reducedMotion]);

  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setPhase("game"), settings.reducedMotion ? 500 : 2600);
    return () => window.clearTimeout(timer);
  }, [phase, settings.reducedMotion]);

  const start = useCallback((mode: "journey" | "sandbox" = "journey", expeditionId: ExpeditionId = "frontier", explicitGameMode?: GameMode) => {
    const expedition = expeditionFor(expeditionId);
    const resolvedMode: GameMode = explicitGameMode ?? (mode === "sandbox" ? "creative" : "survival");
    const next: SaveState = {
      seed,
      creatureId: selectedCreature.id,
      layer: mode === "sandbox" ? "quantum" : expedition.startLayer,
      scenario: mode === "sandbox" ? undefined : expedition.id,
      evolution: mode === "sandbox" ? 120 : 16,
      cycle: 1,
      traits: [],
      discoveries: [],
      structures: 0,
      bookmarked: true,
      characterName: characterName.trim() || customCreature.name || selectedCreature.genus,
      customCreature: customCreature,
      gameMode: resolvedMode,
      lifeStage: "modern",
      lastPlayed: Date.now(),
    };
    setSandbox(resolvedMode === "creative");
    setActiveSave(next);
    setSave(next);
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    cinematicAudio.cinematicHit(1);
    setPhase("creation");
  }, [characterName, customCreature, seed, selectedCreature.id]);

  const continueJourney = useCallback(() => {
    if (!save) return;
    const form = creatures.find((creature) => creature.id === save.creatureId);
    if (form) setSelectedCreature(form);
    setCharacterName(save.characterName ?? form?.genus ?? characterName);
    if (save.customCreature) setCustomCreature(save.customCreature);
    setSeed(save.seed);
    setSandbox(save.gameMode === "creative");
    setActiveSave(save);
    cinematicAudio.cinematicHit(1);
    setPhase("loading");
  }, [characterName, save]);

  const handleSelectWorld = useCallback((world: WorldSave) => {
    setIsWorldSaveModalOpen(false);
    setActiveWorldSave(world);
    setSeed(world.seed);
    const foundCreature = creatures.find((c) => c.id === world.creatureId) ?? selectedCreature;
    setSelectedCreature(foundCreature);
    setCharacterName(world.creatureName);
    setCustomCreature(world.customCreature);
    setSandbox(world.gameMode === "creative");

    const stateToLoad: SaveState = {
      seed: world.seed,
      creatureId: world.creatureId,
      layer: world.layer,
      scenario: world.scenario,
      evolution: world.evolution,
      cycle: world.cycle,
      traits: world.traits,
      discoveries: world.discoveries,
      structures: world.structures,
      bookmarked: true,
      characterName: world.creatureName,
      customCreature: world.customCreature,
      gameMode: world.gameMode,
      lifeStage: world.lifeStage,
      lastPlayed: Date.now(),
    };

    setActiveSave(stateToLoad);
    setSave(stateToLoad);
    localStorage.setItem(SAVE_KEY, JSON.stringify(stateToLoad));
    cinematicAudio.cinematicHit(1);

    if (!world.hasSeenCutscene) {
      setPhase("intro");
    } else {
      setPhase("loading");
    }
  }, [selectedCreature]);

  const handleCustomizerSave = useCallback((updated: CustomCreatureConfig) => {
    setCustomCreature(updated);
    setCharacterName(updated.name);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));
    localStorage.setItem(CHARACTER_KEY, updated.name);
    setIsCustomizerOpen(false);
    cinematicAudio.discovery();
  }, []);

  const persistSave = useCallback((next: SaveState) => {
    setSave(next);
    setActiveSave(next);
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));

    if (activeWorldSave) {
      const updatedWorld: WorldSave = {
        ...activeWorldSave,
        seed: next.seed,
        layer: (next.layer as any) || "quantum",
        evolution: next.evolution,
        cycle: next.cycle,
        traits: next.traits ?? [],
        discoveries: next.discoveries ?? [],
        structures: next.structures ?? 0,
        scenario: next.scenario,
        lifeStage: next.lifeStage,
        lastPlayed: Date.now(),
      };
      saveWorld(updatedWorld);
      setActiveWorldSave(updatedWorld);
    }
  }, [activeWorldSave]);

  const handleIntroComplete = useCallback(() => {
    if (activeWorldSave) {
      const updated = { ...activeWorldSave, hasSeenCutscene: true };
      saveWorld(updated);
      setActiveWorldSave(updated);
    }
    cinematicAudio.cinematicHit(1);
    if (!activeSave) {
      start("journey", "frontier", "survival");
    } else {
      setPhase("game");
    }
  }, [activeSave, activeWorldSave, start]);

  const exitToMenu = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setPhase("menu");
    setActiveSave(null);
  }, []);

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {phase === "boot" ? (
          <BootSequence onSkip={() => { void cinematicAudio.unlock(); cinematicAudio.cinematicHit(0.8); sessionStorage.setItem("lumital.booted", "1"); setPhase("menu"); }} />
        ) : phase === "menu" ? (
          <motion.div key="menu" className="menu-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: 0.65 }}>
            <div className="menu-world"><UniverseScene seed={seed} reducedMotion={settings.reducedMotion} quality={settings.quality} /></div>
            <MainMenu
              seed={seed}
              selectedCreature={selectedCreature}
              characterName={characterName}
              save={save}
              settings={settings}
              onSeedChange={setSeed}
              onCreatureChange={setSelectedCreature}
              onCharacterNameChange={setCharacterName}
              onSettingsChange={setSettings}
              onStart={start}
              onContinue={continueJourney}
              onOpenCustomizer={() => setIsCustomizerOpen(true)}
              onOpenWorldSaves={() => setIsWorldSaveModalOpen(true)}
              onPlayIntro={() => setPhase("intro")}
            />
          </motion.div>
        ) : phase === "creation" && activeSave ? (
          <CreationSequence save={activeSave} creatureName={activeSave.characterName ?? (characterName.trim() || selectedCreature.genus)} formLabel={selectedCreature.genus} />
        ) : phase === "intro" ? (
          <CinematicIntroCutscene
            key="intro"
            creature={selectedCreature}
            custom={customCreature}
            onComplete={handleIntroComplete}
          />
        ) : phase === "loading" && activeSave ? (
          <LoadingSequence save={activeSave} creatureName={activeSave.characterName ?? (characterName.trim() || selectedCreature.genus)} />
        ) : activeSave ? (
          <motion.div key="game" className="game-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <GameExperience initialSave={activeSave} creature={selectedCreature} settings={settings} sandbox={sandbox} onSave={persistSave} onExit={exitToMenu} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Creature Character Customizer Modal */}
      <AnimatePresence>
        {isCustomizerOpen && (
          <CreatureCustomizer
            creature={selectedCreature}
            initialCustom={customCreature}
            onSave={handleCustomizerSave}
            onClose={() => setIsCustomizerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Multi-World Save Manager Modal */}
      <AnimatePresence>
        {isWorldSaveModalOpen && (
          <WorldSaveModal
            creature={selectedCreature}
            customCreature={customCreature}
            onSelectWorld={handleSelectWorld}
            onClose={() => setIsWorldSaveModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
