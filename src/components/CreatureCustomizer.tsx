import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Float, Sparkles } from "@react-three/drei";
import { motion } from "motion/react";
import {
  Sparkles as SparklesIcon,
  Shield,
  Palette,
  Dna,
  Bookmark,
  Shuffle,
  RotateCcw,
  Check,
  Eye,
  Crown,
  Shirt,
  Feather,
  Wand2,
  Trash2,
  X,
} from "lucide-react";
import { CreatureModel } from "./CreatureModel";
import {
  type CreatureDefinition,
  type CustomCreatureConfig,
  type HeadwearType,
  type OutfitType,
  type BackWingsType,
  type AccessoryType,
  type EyeType,
  type SurfaceFinish,
  type BodyPlan,
  creatureBlueprints,
  createDefaultCustomCreature,
} from "../game/procedural";
import { cinematicAudio } from "../audio/CinematicAudio";

interface CreatureCustomizerProps {
  creature: CreatureDefinition;
  initialCustom?: CustomCreatureConfig;
  onSave: (config: CustomCreatureConfig) => void;
  onClose: () => void;
}

const randomNames = [
  "Aethel-01", "Void-Stalker", "Chrono-Hydra", "Zenith-Prime", "Sol-Warden",
  "Nacre-Weaver", "Vesper-IX", "Kera-Titan", "Apex-Chimera", "Lumen-Drifter",
  "Aura-Lotus", "Onyx-Reaper", "Seraph-Null", "Bio-Archon", "Quantum-Beast"
];

const headwearOptions: Array<{ id: HeadwearType; label: string; desc: string }> = [
  { id: "none", label: "None", desc: "Natural unadorned brow" },
  { id: "void-crown", label: "Void Crown", desc: "Regal floating spires forged from dark matter" },
  { id: "chrono-visor", label: "Chrono Visor", desc: "Cybernetic optics with real-time scan slit" },
  { id: "crystal-horns", label: "Crystal Horns", desc: "Prismatic antlers refracting incoming radiation" },
  { id: "biome-antennae", label: "Biome Antennae", desc: "Bioluminescent sensory stalks for detecting prey" },
  { id: "elder-halo", label: "Elder Halo", desc: "Golden orbital ring inscribed with celestial runes" },
  { id: "cyber-mask", label: "Cyber Mask", desc: "Heavy faceted titanium respirator faceplate" },
  { id: "seraph-crest", label: "Seraph Crest", desc: "Plumes of pure radiant photonic energy" },
  { id: "shadow-hood", label: "Shadow Hood", desc: "Draped ethereal cowl blending into the void" },
];

const outfitOptions: Array<{ id: OutfitType; label: string; desc: string }> = [
  { id: "none", label: "Bare Form", desc: "Raw biological skin membrane" },
  { id: "exo-carapace", label: "Exo-Carapace", desc: "Segmented chitin armor plating for defense" },
  { id: "astral-robe", label: "Astral Robe", desc: "Flowing luminous silk woven from nebula dust" },
  { id: "cyber-harness", label: "Cyber Harness", desc: "Exo-vertebrae conduits and power relays" },
  { id: "nomad-mantle", label: "Nomad Mantle", desc: "Weathered desert wrap with circular brass clasp" },
  { id: "quantum-shroud", label: "Quantum Shroud", desc: "Faceted energy cage with probability shielding" },
  { id: "runic-plate", label: "Runic Plate", desc: "Ancient petrified monolith breastplate" },
  { id: "abyssal-chitin", label: "Abyssal Chitin", desc: "Spiked deep-trench shell with biolum gills" },
  { id: "celestial-gilded", label: "Celestial Gilded", desc: "Solar gold filigree and regal trim" },
];

const backWingsOptions: Array<{ id: BackWingsType; label: string; desc: string }> = [
  { id: "none", label: "None", desc: "No dorsal attachments" },
  { id: "photonic-wings", label: "Photonic Wings", desc: "Pair of iridescent flapping light wings" },
  { id: "solar-tendrils", label: "Solar Tendrils", desc: "Four undulating plasma energy whips" },
  { id: "jet-thrusters", label: "Jet Thrusters", desc: "Twin ion booster pods with plasma exhaust" },
  { id: "energy-spikes", label: "Energy Spikes", desc: "Jagged dorsal spines channeling shock energy" },
  { id: "void-cape", label: "Void Cape", desc: "Dimensional cloak trailing behind your stride" },
  { id: "orbiting-sigils", label: "Orbiting Sigils", desc: "Three concentric rotating arcane glyph rings" },
  { id: "crystal-fins", label: "Crystal Fins", desc: "High-density refractive dorsal stabilizers" },
];

const accessoryOptions: Array<{ id: AccessoryType; label: string; desc: string }> = [
  { id: "none", label: "None", desc: "No auxiliary relics" },
  { id: "core-relic", label: "Core Relic", desc: "Floating polyhedral power stone in chest" },
  { id: "biome-lantern", label: "Biome Lantern", desc: "Hanging angler bulb illuminating the dark" },
  { id: "shield-orbs", label: "Shield Orbs", desc: "Pair of kinetic defense spheres orbiting" },
  { id: "data-halo", label: "Data Halo", desc: "Holographic quantum matrix circle" },
];

const eyeOptions: Array<{ id: EyeType; label: string }> = [
  { id: "two", label: "Standard (2)" },
  { id: "cyclops", label: "Cyclops Eye (1)" },
  { id: "spider-four", label: "Arachnid (4)" },
  { id: "hex-six", label: "Hex Matrix (6)" },
  { id: "seraph-ring", label: "Seraph Ring (8)" },
  { id: "blind-sonar", label: "Blind Sonar" },
];

const finishOptions: Array<{ id: SurfaceFinish; label: string; desc: string }> = [
  { id: "organic", label: "Bio-Organic", desc: "Soft subsurface membrane with clearcoat sheen" },
  { id: "crystal", label: "Prismatic Crystal", desc: "Faceted glass with refractive depth" },
  { id: "metallic", label: "Chrome Cyber", desc: "High-specular polished metal" },
  { id: "void", label: "Void Absorption", desc: "Light-eating matte black with intense neon glow" },
  { id: "magma", label: "Molten Core", desc: "Dark volcanic crust with glowing magma fissures" },
  { id: "holographic", label: "Holo Glitch", desc: "Translucent shimmering laser projection" },
];

const bodyPlanOptions: BodyPlan[] = ["bilateral", "radial", "colonial", "fractal", "crystalline", "plasma"];

const colorPresets = [
  { label: "Cyan", hue: 185, accent: 330, glow: 190 },
  { label: "Crimson", hue: 0, accent: 40, glow: 15 },
  { label: "Emerald", hue: 140, accent: 200, glow: 155 },
  { label: "Gold", hue: 45, accent: 10, glow: 50 },
  { label: "Amethyst", hue: 280, accent: 190, glow: 290 },
  { label: "Neon Lime", hue: 95, accent: 180, glow: 110 },
  { label: "Obsidian", hue: 230, accent: 0, glow: 260 },
];

export function CreatureCustomizer({ creature, initialCustom, onSave, onClose }: CreatureCustomizerProps) {
  const [config, setConfig] = useState<CustomCreatureConfig>(() =>
    initialCustom ? { ...initialCustom } : createDefaultCustomCreature(creature)
  );
  const [activeTab, setActiveTab] = useState<"outfits" | "colors" | "anatomy" | "schematics">("outfits");
  const [animationMode, setAnimationMode] = useState<"idle" | "attack" | "defend" | "spin">("idle");
  const [lightPreset, setLightPreset] = useState<"studio" | "deep-space" | "alien-sun" | "abyssal">("deep-space");
  const [savedSchematics, setSavedSchematics] = useState<Array<{ name: string; date: number; config: CustomCreatureConfig }>>(() => {
    try {
      const raw = localStorage.getItem("lumital.user.schematics");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveCustomSchematic = () => {
    const next = [{ name: `${config.name} Blueprint`, date: Date.now(), config: { ...config } }, ...savedSchematics];
    setSavedSchematics(next);
    localStorage.setItem("lumital.user.schematics", JSON.stringify(next));
    cinematicAudio.select();
  };

  const deleteCustomSchematic = (index: number) => {
    const next = savedSchematics.filter((_, i) => i !== index);
    setSavedSchematics(next);
    localStorage.setItem("lumital.user.schematics", JSON.stringify(next));
    cinematicAudio.thump();
  };

  const randomizeName = () => {
    const rand = randomNames[Math.floor(Math.random() * randomNames.length)];
    setConfig((prev) => ({ ...prev, name: rand }));
    cinematicAudio.hover();
  };

  const randomizeAll = () => {
    cinematicAudio.whoosh(1.4);
    const randPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randHue = Math.floor(Math.random() * 360);
    setConfig({
      name: config.name,
      bodyPlan: randPick(bodyPlanOptions),
      hue: randHue,
      accentHue: (randHue + 120 + Math.floor(Math.random() * 120)) % 360,
      saturation: 60 + Math.floor(Math.random() * 40),
      lightness: 40 + Math.floor(Math.random() * 30),
      emissiveIntensity: 0.8 + Math.random() * 1.4,
      emissiveHue: (randHue + 30) % 360,
      finish: randPick(finishOptions).id,
      pattern: randPick(["biolum-veins", "hex-mesh", "nebula", "tiger-striae", "runic", "cyber-traces"]),
      headwear: randPick(headwearOptions).id,
      outfit: randPick(outfitOptions).id,
      backWings: randPick(backWingsOptions).id,
      accessory: randPick(accessoryOptions).id,
      eyeType: randPick(eyeOptions).id,
      eyeColor: `hsl(${Math.floor(Math.random() * 360)}, 90%, 65%)`,
      scale: 0.85 + Math.random() * 0.45,
      limbs: Math.floor(Math.random() * 5) * 2 + 2,
      segments: 2 + Math.floor(Math.random() * 5),
      spineArch: 0,
      tailLength: 1.0,
      auraIntensity: 0.5 + Math.random() * 0.5,
    });
  };

  const applyBlueprint = (blueprint: (typeof creatureBlueprints)[0]) => {
    cinematicAudio.select();
    setConfig((prev) => ({
      ...prev,
      ...blueprint.config,
      name: blueprint.config.name || prev.name,
    }));
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex bg-[#030712]/95 backdrop-blur-xl text-slate-100 overflow-hidden"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
    >
      {/* LEFT PANEL: CUSTOMIZATION CONTROLS */}
      <div className="w-[520px] max-w-[50vw] flex flex-col h-full border-r border-cyan-900/40 bg-slate-950/70">
        {/* Header */}
        <div className="p-5 border-b border-cyan-900/30 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dna className="text-cyan-400 w-5 h-5 animate-pulse" />
              <h2 className="text-lg font-bold tracking-wider text-cyan-200 uppercase">
                Genesis Morphology Forge
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Avatar Name input + Randomize Name */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                placeholder="Name your organism..."
                maxLength={24}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-900/90 border border-cyan-800/60 text-sm font-medium text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
              <span className="absolute right-3 top-2.5 text-[10px] text-slate-500 tracking-wider">
                AVATAR NAME
              </span>
            </div>
            <button
              onClick={randomizeName}
              className="px-3 py-2 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-700/50 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition"
              title="Generate Random Sci-Fi Name"
            >
              <Shuffle size={14} /> Name
            </button>
            <button
              onClick={randomizeAll}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-purple-900/70 to-pink-900/70 hover:from-purple-800 hover:to-pink-800 border border-purple-500/50 text-pink-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-purple-950/50"
              title="Randomize All Attributes"
            >
              <Wand2 size={14} /> Chaos
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900/80 rounded-lg border border-slate-800/80">
            {[
              { id: "outfits", label: "Wardrobe", icon: Shirt },
              { id: "colors", label: "Colors & Finish", icon: Palette },
              { id: "anatomy", label: "Anatomy", icon: Dna },
              { id: "schematics", label: "Blueprints", icon: Bookmark },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    cinematicAudio.hover();
                  }}
                  className={`flex flex-col items-center py-2 px-1 rounded-md text-xs font-semibold transition ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <Icon size={15} className="mb-1" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* TAB 1: OUTFITS & WARDROBE */}
          {activeTab === "outfits" && (
            <div className="space-y-6">
              {/* Headwear / Helms */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                  <Crown size={14} /> Headwear & Helms
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {headwearOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setConfig({ ...config, headwear: opt.id });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                        config.headwear === opt.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-semibold text-xs">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Outfits / Armor */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                  <Shield size={14} /> Body Armor & Carapace
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {outfitOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setConfig({ ...config, outfit: opt.id });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                        config.outfit === opt.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-semibold text-xs">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Back & Wings */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                  <Feather size={14} /> Dorsal Wings & Attachments
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {backWingsOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setConfig({ ...config, backWings: opt.id });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                        config.backWings === opt.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-semibold text-xs">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accessories */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                  <SparklesIcon size={14} /> Auxiliary Relics
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {accessoryOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setConfig({ ...config, accessory: opt.id });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                        config.accessory === opt.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-semibold text-xs">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COLORS & SHADERS */}
          {activeTab === "colors" && (
            <div className="space-y-6">
              {/* Presets */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2 block">
                  Quick Harmonic Palettes
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorPresets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setConfig({
                          ...config,
                          hue: p.hue,
                          accentHue: p.accent,
                          emissiveHue: p.glow,
                        });
                        cinematicAudio.hover();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-medium bg-slate-900/80 hover:border-cyan-500/50 flex items-center gap-2 transition"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                        style={{ backgroundColor: `hsl(${p.hue}, 80%, 55%)` }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Surface Finish */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2.5 block">
                  Material Surface Finish
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {finishOptions.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setConfig({ ...config, finish: f.id });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                        config.finish === f.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-semibold text-xs">{f.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{f.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders: Primary Hue */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Primary Bio-Hue</span>
                  <span className="text-cyan-400 font-mono">{config.hue}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={config.hue}
                  onChange={(e) => setConfig({ ...config, hue: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Sliders: Accent Hue */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Secondary Accent Hue</span>
                  <span className="text-purple-400 font-mono">{config.accentHue}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={config.accentHue}
                  onChange={(e) => setConfig({ ...config, accentHue: Number(e.target.value) })}
                  className="w-full accent-purple-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Sliders: Glow Intensity */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Bioluminescent Emission Intensity</span>
                  <span className="text-amber-400 font-mono">{config.emissiveIntensity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.05"
                  value={config.emissiveIntensity}
                  onChange={(e) => setConfig({ ...config, emissiveIntensity: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Sliders: Saturation & Lightness */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">Saturation</span>
                    <span className="text-slate-400">{config.saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={config.saturation}
                    onChange={(e) => setConfig({ ...config, saturation: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">Lightness</span>
                    <span className="text-slate-400">{config.lightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="85"
                    value={config.lightness}
                    onChange={(e) => setConfig({ ...config, lightness: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ANATOMY & MORPHOLOGY */}
          {activeTab === "anatomy" && (
            <div className="space-y-6">
              {/* Body Plan Selector */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2.5 block">
                  Fundamental Body Plan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {bodyPlanOptions.map((plan) => (
                    <button
                      key={plan}
                      onClick={() => {
                        setConfig({ ...config, bodyPlan: plan });
                        cinematicAudio.select();
                      }}
                      className={`p-2.5 rounded-lg border text-center font-semibold text-xs uppercase tracking-wide transition ${
                        config.bodyPlan === plan
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/40"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eye Types */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Eye size={14} /> Optical Sensory Organs
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {eyeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setConfig({ ...config, eyeType: opt.id });
                        cinematicAudio.hover();
                      }}
                      className={`p-2 rounded-lg border text-left text-xs font-medium transition ${
                        config.eyeType === opt.id
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-200"
                          : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eye Glow Color */}
              <div>
                <label className="text-xs font-bold text-slate-300 mb-1.5 block">Eye Glow Color</label>
                <div className="flex gap-2">
                  {["#6ee7b7", "#38bdf8", "#ef4444", "#fbbf24", "#c084fc", "#ffffff"].map((color) => (
                    <button
                      key={color}
                      onClick={() => setConfig({ ...config, eyeColor: color })}
                      className={`w-7 h-7 rounded-full border transition ${
                        config.eyeColor === color ? "border-white scale-110 shadow-md" : "border-slate-700 opacity-70"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Sliders: Limbs, Segments, Scale */}
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Locomotive Limbs</span>
                    <span className="text-cyan-400 font-mono">{config.limbs}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="12"
                    step="2"
                    value={config.limbs}
                    onChange={(e) => setConfig({ ...config, limbs: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Body Segments</span>
                    <span className="text-cyan-400 font-mono">{config.segments}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={config.segments}
                    onChange={(e) => setConfig({ ...config, segments: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Organism Scale</span>
                    <span className="text-cyan-400 font-mono">{config.scale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={config.scale}
                    onChange={(e) => setConfig({ ...config, scale: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCHEMATICS & BLUEPRINTS */}
          {activeTab === "schematics" && (
            <div className="space-y-6">
              {/* Save current */}
              <div className="p-3.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-cyan-200 uppercase">Save To Schematic Library</h4>
                  <p className="text-[11px] text-slate-400">Save this morphology to your persistent archive.</p>
                </div>
                <button
                  onClick={saveCustomSchematic}
                  className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <Bookmark size={14} /> Save Blueprint
                </button>
              </div>

              {/* Master Presets */}
              <div>
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2.5 block">
                  Author Blueprints
                </label>
                <div className="space-y-2">
                  {creatureBlueprints.map((bp) => (
                    <button
                      key={bp.id}
                      onClick={() => applyBlueprint(bp)}
                      className="w-full p-3 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900 text-left transition flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-xs text-cyan-100 group-hover:text-cyan-300 transition">
                          {bp.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{bp.tagline}</div>
                      </div>
                      <span className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition">
                        Deploy →
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* User Saved Schematics */}
              {savedSchematics.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2.5 block">
                    Your Saved Schematics ({savedSchematics.length})
                  </label>
                  <div className="space-y-2">
                    {savedSchematics.map((s, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                      >
                        <button
                          onClick={() => {
                            setConfig({ ...s.config });
                            cinematicAudio.select();
                          }}
                          className="text-left flex-1"
                        >
                          <div className="font-semibold text-xs text-cyan-200">{s.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(s.date).toLocaleDateString()} • {s.config.bodyPlan}
                          </div>
                        </button>
                        <button
                          onClick={() => deleteCustomSchematic(idx)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition"
                          title="Delete Schematic"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-cyan-900/30 bg-slate-950 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setConfig(createDefaultCustomCreature(creature));
              cinematicAudio.thump();
            }}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            onClick={() => {
              cinematicAudio.select();
              onSave(config);
              onClose();
            }}
            className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-cyan-950/60 flex items-center justify-center gap-2 transition"
          >
            <Check size={16} /> Deploy & Save Organism
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: 3D INTERACTIVE VIEWPORT */}
      <div className="flex-1 relative flex flex-col h-full bg-radial from-slate-900/40 to-slate-950">
        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          {/* Organism Info Badge */}
          <div className="pointer-events-auto px-4 py-2 rounded-xl bg-slate-950/80 border border-cyan-800/40 backdrop-blur-md">
            <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase block">
              MORPHOLOGY SPECIMEN
            </span>
            <span className="text-base font-extrabold text-white tracking-wide">{config.name}</span>
            <span className="text-[11px] text-slate-400 ml-2 font-mono">
              [{config.bodyPlan} // {config.finish}]
            </span>
          </div>

          {/* Animation Poses */}
          <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Pose:</span>
            {[
              { id: "idle", label: "Idle Hover" },
              { id: "attack", label: "Attack Stance" },
              { id: "defend", label: "Defensive Shell" },
              { id: "spin", label: "Flaunt Spin" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setAnimationMode(p.id as any);
                  cinematicAudio.hover();
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  animationMode === p.id
                    ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Environment Lighting */}
          <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Stage:</span>
            {[
              { id: "deep-space", label: "Deep Space" },
              { id: "alien-sun", label: "Solar Flare" },
              { id: "abyssal", label: "Abyssal Bio" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => {
                  setLightPreset(st.id as any);
                  cinematicAudio.hover();
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  lightPreset === st.id
                    ? "bg-purple-500/30 text-purple-200 border border-purple-500/50"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing">
          <Canvas camera={{ position: [0, 1.2, 4.2], fov: 42 }}>
            <ambientLight intensity={lightPreset === "alien-sun" ? 1.2 : lightPreset === "abyssal" ? 0.35 : 0.65} />
            <directionalLight
              position={[5, 8, 5]}
              intensity={lightPreset === "alien-sun" ? 2.5 : 1.2}
              color={lightPreset === "alien-sun" ? "#ffedd5" : "#e0f2fe"}
            />
            <pointLight position={[-4, -2, -3]} intensity={1.5} color={lightPreset === "abyssal" ? "#06b6d4" : "#a855f7"} />

            <Float speed={2.5} rotationIntensity={0.3} floatIntensity={0.6}>
              <CreatureModel
                custom={config}
                scale={1.2}
                active
                animationMode={animationMode}
              />
            </Float>

            <Sparkles count={80} scale={6} size={2.5} speed={0.4} opacity={0.6} color={config.eyeColor} />
            <OrbitControls enablePan={false} minDistance={2.5} maxDistance={7.5} />
          </Canvas>
        </div>

        {/* Bottom Hint */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <div className="px-4 py-1.5 rounded-full bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 tracking-wider">
            DRAG TO ROTATE • SCROLL TO ZOOM • CHANGES REFLECT INSTANTLY
          </div>
        </div>
      </div>
    </motion.div>
  );
}
