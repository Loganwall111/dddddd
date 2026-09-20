import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Globe2,
  Plus,
  Play,
  Trash2,
  Copy,
  Download,
  X,
  Compass,
  Hammer,
  ShieldAlert,
  Sparkles,
  Clock,
  Dna,
} from "lucide-react";
import {
  type GameMode,
  type WorldSave,
  type CreatureDefinition,
  type CustomCreatureConfig,
  type ExpeditionId,
  expeditions,
  generateSeed,
  getWorldSaves,
  saveWorld,
  deleteWorld,
  createNewWorld,
} from "../game/procedural";
import { cinematicAudio } from "../audio/CinematicAudio";

interface WorldSaveModalProps {
  creature: CreatureDefinition;
  customCreature?: CustomCreatureConfig;
  onSelectWorld: (world: WorldSave) => void;
  onClose: () => void;
}

export function WorldSaveModal({ creature, customCreature, onSelectWorld, onClose }: WorldSaveModalProps) {
  const [worlds, setWorlds] = useState<WorldSave[]>(() => getWorldSaves());
  const [isCreating, setIsCreating] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldSeed, setNewWorldSeed] = useState(() => generateSeed());
  const [selectedMode, setSelectedMode] = useState<GameMode>("survival");
  const [selectedExpedition, setSelectedExpedition] = useState<ExpeditionId>("frontier");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreate = () => {
    cinematicAudio.cinematicHit(0.9);
    const created = createNewWorld(
      newWorldName || `World ${newWorldSeed.slice(3, 8)}`,
      newWorldSeed,
      selectedMode,
      creature,
      customCreature,
      selectedExpedition
    );
    setWorlds(getWorldSaves());
    setIsCreating(false);
    onSelectWorld(created);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    cinematicAudio.thump();
    deleteWorld(id);
    setWorlds(getWorldSaves());
  };

  const handleDuplicate = (world: WorldSave, e: React.MouseEvent) => {
    e.stopPropagation();
    cinematicAudio.select();
    const duplicate: WorldSave = {
      ...world,
      id: `world-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${world.name} (Copy)`,
      createdAt: Date.now(),
      lastPlayed: Date.now(),
    };
    saveWorld(duplicate);
    setWorlds(getWorldSaves());
  };

  const handleExport = () => {
    cinematicAudio.hover();
    const data = JSON.stringify(worlds, null, 2);
    navigator.clipboard.writeText(data);
    setCopiedId("all-copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030712]/90 backdrop-blur-2xl text-slate-100"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-950 border border-cyan-900/50 shadow-2xl shadow-cyan-950/80 overflow-hidden">
        {/* Top Header */}
        <div className="p-6 border-b border-cyan-900/30 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Globe2 size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide text-white flex items-center gap-2">
                Genesis World Archives
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                  {worlds.length} Realities
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Persistent seeded continuum saves across survival, creative, and exploration modes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <button
                onClick={() => {
                  setNewWorldSeed(generateSeed());
                  setIsCreating(true);
                  cinematicAudio.select();
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950 transition"
              >
                <Plus size={16} /> New World
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <AnimatePresence mode="wait">
            {isCreating ? (
              /* CREATE WORLD FORM */
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-2xl mx-auto"
              >
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-cyan-300 uppercase tracking-wider">
                    Configure New Continuum
                  </h3>

                  {/* World Name & Seed */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">World Name</label>
                      <input
                        type="text"
                        value={newWorldName}
                        onChange={(e) => setNewWorldName(e.target.value)}
                        placeholder="e.g. Vesper Prime"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-slate-300">Quantum Seed</label>
                        <button
                          onClick={() => {
                            setNewWorldSeed(generateSeed());
                            cinematicAudio.hover();
                          }}
                          className="text-[10px] text-cyan-400 hover:underline font-mono"
                        >
                          Roll Random
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newWorldSeed}
                        onChange={(e) => setNewWorldSeed(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-400 transition"
                      />
                    </div>
                  </div>

                  {/* Game Mode Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Choose Reality Mode</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          id: "survival",
                          title: "Survival Mode",
                          desc: "Hunger & starvation mechanics active. Forage nutrients, maintain body vitals, fight Google Watchers.",
                          icon: ShieldAlert,
                          color: "from-amber-600/30 to-red-600/20 border-amber-500/50 text-amber-300",
                        },
                        {
                          id: "creative",
                          title: "Creative Mode",
                          desc: "Unlimited structure schematics. Free 3D flight mode ('G'), god vitals, instant architectural building.",
                          icon: Hammer,
                          color: "from-cyan-600/30 to-blue-600/20 border-cyan-500/50 text-cyan-300",
                        },
                        {
                          id: "exploration",
                          title: "Exploration Mode",
                          desc: "Peaceful discovery. No starvation or damage. Long-range sonic radar ('V'), lore monoliths, photo mode ('P').",
                          icon: Compass,
                          color: "from-emerald-600/30 to-teal-600/20 border-emerald-500/50 text-emerald-300",
                        },
                      ].map((mode) => {
                        const Icon = mode.icon;
                        const isSelected = selectedMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            onClick={() => {
                              setSelectedMode(mode.id as GameMode);
                              cinematicAudio.select();
                            }}
                            className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                              isSelected
                                ? `bg-gradient-to-b ${mode.color} shadow-lg shadow-black/40`
                                : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            <div>
                              <Icon size={24} className="mb-2 text-current" />
                              <h4 className="font-bold text-sm text-white">{mode.title}</h4>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{mode.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Starting Route / Expedition */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Starting Biome & Entry Route</label>
                    <div className="grid grid-cols-2 gap-2">
                      {expeditions.map((exp) => (
                        <button
                          key={exp.id}
                          onClick={() => {
                            setSelectedExpedition(exp.id);
                            cinematicAudio.hover();
                          }}
                          className={`p-3 rounded-xl border text-left transition ${
                            selectedExpedition === exp.id
                              ? "bg-slate-800 border-cyan-400 text-cyan-200"
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="font-semibold text-xs text-white">{exp.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{exp.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Create Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-cyan-950 flex items-center gap-2 transition"
                  >
                    <Sparkles size={16} /> Ignite Reality & Enter
                  </button>
                </div>
              </motion.div>
            ) : worlds.length === 0 ? (
              /* EMPTY STATE */
              <div className="py-16 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400 animate-pulse">
                  <Globe2 size={32} />
                </div>
                <h3 className="text-lg font-bold text-white">No World Saves Recorded</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your archive is waiting for its first genesis point. Forge a new reality across Survival, Creative, or Exploration mode.
                </p>
                <button
                  onClick={() => {
                    setNewWorldSeed(generateSeed());
                    setIsCreating(true);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/60 transition"
                >
                  <Plus size={16} /> Create Your First World
                </button>
              </div>
            ) : (
              /* SAVED WORLDS LIST */
              <div className="space-y-3">
                {worlds.map((world) => {
                  const modeBadge =
                    world.gameMode === "creative"
                      ? { label: "Creative", bg: "bg-blue-950/70 border-blue-500/50 text-blue-300" }
                      : world.gameMode === "exploration"
                      ? { label: "Exploration", bg: "bg-emerald-950/70 border-emerald-500/50 text-emerald-300" }
                      : { label: "Survival", bg: "bg-amber-950/70 border-amber-500/50 text-amber-300" };

                  return (
                    <div
                      key={world.id}
                      onClick={() => onSelectWorld(world)}
                      className="group p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition flex items-center justify-between"
                    >
                      {/* Left: Info */}
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-cyan-400 font-bold text-sm shadow-inner">
                          {world.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-white group-hover:text-cyan-300 transition">
                              {world.name}
                            </h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${modeBadge.bg}`}>
                              {modeBadge.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              SEED: {world.seed}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
                            <span className="flex items-center gap-1">
                              <Dna size={12} className="text-cyan-400" />
                              {world.creatureName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Hammer size={12} className="text-blue-400" />
                              {world.structuresList?.length || 0} structures
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="text-slate-500" />
                              Played {new Date(world.lastPlayed).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDuplicate(world, e)}
                          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                          title="Duplicate Reality"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(world.id, e)}
                          className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-950 text-slate-400 hover:text-red-400 transition"
                          title="Delete Reality"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => onSelectWorld(world)}
                          className="px-4 py-2 rounded-xl bg-cyan-600 group-hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition"
                        >
                          <Play size={14} fill="currentColor" /> Enter World
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cyan-900/30 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition"
            >
              <Download size={14} /> {copiedId === "all-copied" ? "Saves Copied to Clipboard!" : "Export Archives"}
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            AUTO-SYNC: LOCAL STORAGE PERSISTENCE ACTIVE
          </div>
        </div>
      </div>
    </motion.div>
  );
}
