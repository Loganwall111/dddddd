import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IntroCinematic } from "./scenes/IntroCinematic";
import { MenuScene } from "./scenes/MenuScene";
import { MainMenu } from "./ui/MainMenu";
import { GameShell } from "./game/GameShell";
import { cinematicAudio } from "./audio/engine";
import { layerInfo, store, type LayerId, type MultiverseSave, type MultiverseSettings } from "./game/lore";

type Phase = "boot" | "intro" | "menu" | "loading" | "game";

function BootSequence({ onBegin }: { onBegin: () => void }) {
  return (
    <motion.div className="boot-screen" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} onClick={onBegin}>
      <div className="boot-sigil" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="4" fill="currentColor" />
          <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" strokeWidth="0.7" />
          <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" strokeWidth="0.7" transform="rotate(60 50 50)" />
          <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="currentColor" strokeWidth="0.7" transform="rotate(120 50 50)" />
          <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 7" />
        </svg>
      </div>
      <motion.strong initial={{ letterSpacing: "1.2em", opacity: 0 }} animate={{ letterSpacing: "0.5em", opacity: 1 }} transition={{ delay: 0.3, duration: 1.2 }}>
        THE MULTIVERSE
      </motion.strong>
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
        A LODEMUS REALITY ENGINE PRODUCTION
      </motion.span>
      <span className="boot-hint">CLICK TO BEGIN</span>
    </motion.div>
  );
}

function LoadingSequence({ layer }: { layer: LayerId }) {
  const info = layerInfo(layer);
  return (
    <motion.div className="loading-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <span className="loading-kicker">COLLAPSING POSSIBILITY</span>
      <h2>{info.name}</h2>
      <p>{info.tagline}</p>
      <div className="loading-bar">
        <i />
      </div>
      <div className="loading-steps">
        <span>STABILIZING LOCAL PHYSICS</span>
        <span>WEAVING ECOSYSTEM</span>
        <span>OPENING THE GATEWAY</span>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [settings, setSettings] = useState<MultiverseSettings>(() => store.loadSettings());
  const [save, setSave] = useState<MultiverseSave | null>(() => store.loadSave());
  const [layer, setLayer] = useState<LayerId>("verdant");
  const seed = "the-multiverse-genesis";

  useEffect(() => {
    store.writeSettings(settings);
  }, [settings]);

  useEffect(() => {
    const scene = phase === "game" ? layer : phase;
    cinematicAudio.setScene(scene, settings.audio);
  }, [phase, layer, settings.audio]);

  const beginFromBoot = useCallback(() => {
    void cinematicAudio.unlock();
    cinematicAudio.cinematicHit(0.85);
    setPhase("intro");
  }, []);

  const startLayer = useCallback(
    (next: LayerId) => {
      setLayer(next);
      const visited = save?.visited ?? [];
      const nextSave: MultiverseSave = {
        layer: next,
        visited: visited.includes(next) ? visited : [...visited, next],
        travels: (save?.travels ?? 0) + (visited.length > 0 ? 1 : 0),
        lastPlayed: Date.now(),
      };
      setSave(nextSave);
      store.writeSave(nextSave);
      cinematicAudio.cinematicHit(1);
      setPhase("loading");
    },
    [save],
  );

  const travelInGame = useCallback(
    (target: LayerId) => {
      setLayer(target);
      const visited = save?.visited ?? [];
      const nextSave: MultiverseSave = {
        layer: target,
        visited: visited.includes(target) ? visited : [...visited, target],
        travels: (save?.travels ?? 0) + 1,
        lastPlayed: Date.now(),
      };
      setSave(nextSave);
      store.writeSave(nextSave);
    },
    [save],
  );

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {phase === "boot" && <BootSequence key="boot" onBegin={beginFromBoot} />}
        {phase === "intro" && <IntroCinematic key="intro" onDone={() => setPhase("menu")} />}
        {phase === "menu" && (
          <motion.div key="menu" className="menu-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.6 }}>
            <div className="menu-world">
              <MenuScene seed={seed} reducedMotion={settings.reducedMotion} />
            </div>
            <MainMenu
              save={save}
              settings={settings}
              onSelectLayer={startLayer}
              onContinue={() => startLayer(save?.layer ?? "verdant")}
              onReplayIntro={() => setPhase("intro")}
              onSettings={setSettings}
            />
          </motion.div>
        )}
        {phase === "loading" && <LoadingSequence key="loading" layer={layer} />}
        {phase === "game" && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            <GameShell
              layer={layer}
              seed={seed}
              settings={settings}
              onTravel={travelInGame}
              onExit={() => setPhase("menu")}
              onReplayIntro={() => setPhase("intro")}
              onVolume={(audio) => setSettings((current) => ({ ...current, audio }))}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
