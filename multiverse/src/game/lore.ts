/* THE MULTIVERSE — lore, realities and persistence */

export type LayerId = "verdant" | "void" | "infinite" | "fractaline" | "singularity";

export interface LayerInfo {
  id: LayerId;
  index: number;
  name: string;
  tagline: string;
  description: string;
  color: string;
  accent: string;
}

export const LAYERS: LayerInfo[] = [
  {
    id: "verdant",
    index: 0,
    name: "VERDANT EXPANSE",
    tagline: "a living valley world",
    description: "Lush valleys, gigantic cliffs and waterfalls. Whales drift through the sky. Dive beneath the mirrored water and the world watches back.",
    color: "#7fe8c8",
    accent: "#2f8f6a",
  },
  {
    id: "void",
    index: 1,
    name: "THE WHITE VOID",
    tagline: "islands adrift in nothing",
    description: "Floating islands hang in an endless white silence. There is no ground. There is no edge. Only the soft hum of the space between realities.",
    color: "#dfe8ff",
    accent: "#8fa8ff",
  },
  {
    id: "infinite",
    index: 2,
    name: "THE INFINITE HALLS",
    tagline: "rooms without end",
    description: "Backroom corridors that repeat beyond reason. The lights buzz. The walls breathe. Nobody has ever found the last room.",
    color: "#ffe08a",
    accent: "#c8963c",
  },
  {
    id: "fractaline",
    index: 3,
    name: "FRACTALINE",
    tagline: "geometry dreaming of itself",
    description: "An infinite maze of recursive crystal gates, each one containing a smaller copy of the whole. Mind-boggling is the local dialect.",
    color: "#c89fff",
    accent: "#7a4aff",
  },
  {
    id: "singularity",
    index: 4,
    name: "THE SINGULARITY",
    tagline: "the gravitational heart",
    description: "A gigantic wormhole heart wrapped in a burning accretion disk. It pulls at more than your body. Do not stare longer than you must.",
    color: "#ff9a5c",
    accent: "#c84a2c",
  },
];

export function layerInfo(id: LayerId): LayerInfo {
  return LAYERS.find((layer) => layer.id === id) ?? LAYERS[0];
}

export function nextLayer(id: LayerId): LayerId {
  const info = layerInfo(id);
  return LAYERS[(info.index + 1) % LAYERS.length].id;
}

/* ---------------------------- persistence ---------------------------- */

export interface MultiverseSave {
  layer: LayerId;
  visited: LayerId[];
  travels: number;
  lastPlayed: number;
}

export interface MultiverseSettings {
  quality: "low" | "medium" | "ultra";
  audio: number;
  reducedMotion: boolean;
  subtitles: boolean;
  renderScale: number;
  fov: number;
}

export const defaultSettings: MultiverseSettings = {
  quality: "ultra",
  audio: 60,
  reducedMotion: false,
  subtitles: true,
  renderScale: 100,
  fov: 68,
};

const SAVE_KEY = "multiverse.save.v1";
const SETTINGS_KEY = "multiverse.settings.v1";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const store = {
  loadSave(): MultiverseSave | null {
    return read<MultiverseSave>(SAVE_KEY);
  },
  writeSave(save: MultiverseSave) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch { /* storage unavailable */ }
  },
  loadSettings(): MultiverseSettings {
    return { ...defaultSettings, ...(read<Partial<MultiverseSettings>>(SETTINGS_KEY) ?? {}) };
  },
  writeSettings(settings: MultiverseSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* storage unavailable */ }
  },
};

/* --------------------------- audio profiles -------------------------- */

export const LAYER_AUDIO: Record<LayerId, { frequencies: [number, number, number]; filter: [number, number]; shimmer: [number, number]; noiseLevel: number; melodyBase: number }> = {
  verdant: { frequencies: [52, 78, 156], filter: [720, 0.8], shimmer: [980, 1.1], noiseLevel: 0.08, melodyBase: 196 },
  void: { frequencies: [38, 76, 152], filter: [420, 0.9], shimmer: [1180, 0.9], noiseLevel: 0.014, melodyBase: 146.83 },
  infinite: { frequencies: [49, 98, 196], filter: [520, 1.4], shimmer: [640, 2.2], noiseLevel: 0.05, melodyBase: 130.81 },
  fractaline: { frequencies: [41, 123, 369], filter: [1100, 4], shimmer: [1480, 1.1], noiseLevel: 0.03, melodyBase: 261.63 },
  singularity: { frequencies: [24, 36, 72], filter: [220, 0.8], shimmer: [820, 0.8], noiseLevel: 0.035, melodyBase: 110 },
};
