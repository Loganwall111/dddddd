export type BodyPlan = "radial" | "bilateral" | "colonial" | "fractal" | "crystalline" | "plasma";
export type WorldLayer = "void" | "galaxy" | "cosmos" | "planet" | "micro" | "atomic" | "quantum";

/**
 * A route is a deliberately authored entry point into the procedural universe.
 * The world is still seeded, but the first few minutes have a readable story:
 * a leaf vein, a digestive tract, a storm drain, a megafauna host or a frontier.
 */
export type ExpeditionId = "leaf" | "digestion" | "sewer" | "colossus" | "frontier";

export interface ExpeditionDefinition {
  id: ExpeditionId;
  label: string;
  subtitle: string;
  description: string;
  host: string;
  scale: string;
  destination: string;
  startLayer: WorldLayer;
  color: string;
  danger: string;
  landmarks: string[];
  resources: string[];
}

export const expeditions: ExpeditionDefinition[] = [
  {
    id: "leaf",
    label: "Leafskin Canopy",
    subtitle: "Walk the green frontier",
    description: "Step from a leaf surface into its veins, follow a caterpillar trail and descend through living plant cells.",
    host: "A rain-fed garden leaf",
    scale: "cellular / 10⁻⁶ m",
    destination: "The chloroplast terraces",
    startLayer: "micro",
    color: "#b9ff9c",
    danger: "sun shock",
    landmarks: ["Veinbridge", "Stoma Gate", "Chloroplast terraces", "Caterpillar trail"],
    resources: ["lumen shard", "cellulose fiber", "pollen memory"],
  },
  {
    id: "digestion",
    label: "Digestive Passage",
    subtitle: "Survive the human interior",
    description: "Be eaten, ride saliva from enamel to the stomach, read the acid tide and build a membrane shelter before the next contraction.",
    host: "Inside a sleeping human host",
    scale: "organ / 10⁻² m",
    destination: "The gastric sea",
    startLayer: "micro",
    color: "#ff9fb9",
    danger: "acid tide",
    landmarks: ["Enamel canyon", "Peristaltic chute", "Gastric sea", "Pyloric gate"],
    resources: ["protein thread", "mucus pearl", "acid catalyst"],
  },
  {
    id: "sewer",
    label: "Tidal Underways",
    subtitle: "Sewers, drains and the open tide",
    description: "Enter through a storm drain, ride the current under a city and surface wherever the next tide decides.",
    host: "A coastal megacity",
    scale: "organism / 10⁰ m",
    destination: "Third Tide Basin",
    startLayer: "planet",
    color: "#8fd8e7",
    danger: "surge current",
    landmarks: ["Storm drain mouth", "Grate cathedral", "Sewer delta", "Tide lift"],
    resources: ["rust filament", "saltglass", "signal thread"],
  },
  {
    id: "colossus",
    label: "Colossus Range",
    subtitle: "Climb the moving world",
    description: "Cross the hide of a giant bull, read its heat and use the tremors of each footfall to find a mountain route.",
    host: "The bronze-horned bull Aurochs-9",
    scale: "megafauna / 10⁰ m",
    destination: "Ox-bellow Fields",
    startLayer: "planet",
    color: "#ffc77e",
    danger: "impact tremor",
    landmarks: ["Horn shadow", "Hide valleys", "Bellow pass", "Mountain villages"],
    resources: ["keratin shard", "warm bloodstone", "dust memory"],
  },
  {
    id: "frontier",
    label: "Planetary Frontier",
    subtitle: "Villages, castles and mountains",
    description: "Take the open-world route: seed new cities, follow unfamiliar species and build a home wherever the physics holds.",
    host: "A living planet with 75+ biomes",
    scale: "planetary / 10⁰ m",
    destination: "Pelagic Shelf Nacre-7",
    startLayer: "planet",
    color: "#d7ffb3",
    danger: "ecological cascade",
    landmarks: ["Village of Smoke-Dancers", "The Spine Choir", "Floating islets", "Signal castle"],
    resources: ["district essence", "lumen shard", "aether mote"],
  },
];

export function expeditionFor(id?: string | null): ExpeditionDefinition {
  return expeditions.find((expedition) => expedition.id === id) ?? expeditions[expeditions.length - 1];
}

export type LifeStageId = "hadean" | "archean" | "cambrian" | "carboniferous" | "jurassic" | "cretaceous" | "modern" | "future" | "ocean" | "mars";

export interface LifeStageDefinition {
  id: LifeStageId;
  name: string;
  era: string;
  description: string;
  scale: string;
  color: string;
  atmosphere: string;
  landmarks: string[];
}

export const lifeStages: LifeStageDefinition[] = [
  { id: "hadean", name: "HADEAN EON", era: "4.5B YEARS AGO", description: "A molten young Earth, before the first stable memory of life.", scale: "planetary", color: "#ff6c45", atmosphere: "iron vapor / lava rain", landmarks: ["Magma ocean", "First crust", "Impact basin"] },
  { id: "archean", name: "ARCHEAN", era: "4.0B YEARS AGO", description: "Mineral coastlines and the first microbial metabolisms shaping the air.", scale: "planetary", color: "#ffad5b", atmosphere: "methane haze", landmarks: ["Stromatolite shelf", "Black smoker", "Sulfur coast"] },
  { id: "cambrian", name: "CAMBRIAN EXPLOSION", era: "541M YEARS AGO", description: "A sudden abundance of body plans turns the sea into an experiment.", scale: "pelagic", color: "#49d982", atmosphere: "oxygen rise", landmarks: ["Trilobite shelf", "Reef forest", "Anomalocaris trench"] },
  { id: "carboniferous", name: "CARBONIFEROUS", era: "359M YEARS AGO", description: "Giant forests breathe through warm mist while insects learn to fly.", scale: "forest canopy", color: "#b5e65b", atmosphere: "oxygen-rich", landmarks: ["Fern cathedral", "Dragonfly marsh", "Coal swamp"] },
  { id: "jurassic", name: "JURASSIC", era: "201M YEARS AGO", description: "Sauropod shadows move through conifers beneath a humid green sky.", scale: "megafauna", color: "#5ecb8c", atmosphere: "warm jungle", landmarks: ["Dinosaur valley", "Volcanic ridge", "Amber forest"] },
  { id: "cretaceous", name: "CRETACEOUS", era: "145M YEARS AGO", description: "Flowering plants recruit insects while a giant world listens overhead.", scale: "leaf / giant", color: "#6fcf67", atmosphere: "flowering world", landmarks: ["Pollen basin", "Cretaceous sea", "Meteor horizon"] },
  { id: "modern", name: "MODERN JUNGLE", era: "NOW", description: "The familiar world, full of hidden cities, hosts, tides and microscopic weather.", scale: "open world", color: "#c9ffd9", atmosphere: "breathable", landmarks: ["Leafskin canopy", "Human host", "Tidal underways"] },
  { id: "future", name: "FUTURE ALIEN", era: "+100M YEARS", description: "Evolution has no obligation to keep the shape of the present.", scale: "speculative", color: "#c084fc", atmosphere: "violet haze", landmarks: ["Glass forest", "Signal desert", "Adaptive city"] },
  { id: "ocean", name: "PRIMORDIAL OCEAN", era: "OCEAN WORLD", description: "No land interrupts the current. Every surface is a tide and every tide carries life.", scale: "aquatic", color: "#7dd3f7", atmosphere: "salt / pressure", landmarks: ["Abyssal vent", "Cyanobacteria bloom", "Whale fall"] },
  { id: "mars", name: "MARS — RED PLANET", era: "OTHER PLANET", description: "A cold red frontier where shelters, dust and small organisms make a new history.", scale: "extraterrestrial", color: "#ef6c5b", atmosphere: "thin / dry", landmarks: ["Olympus Mons", "Ice cave", "Red dune city"] },
];

export function lifeStageFor(id?: string | null): LifeStageDefinition {
  return lifeStages.find((stage) => stage.id === id) ?? lifeStages.find((stage) => stage.id === "modern")!;
}

export interface CreatureDefinition {
  id: number;
  name: string;
  genus: string;
  bodyPlan: BodyPlan;
  locomotion: string;
  sense: string;
  metabolism: string;
  role: string;
  habitat: string;
  social: string;
  tolerance: string;
  potential: number;
  endurance: number;
  mobility: number;
  cognition: number;
  hue: number;
  limbs: number;
  segments: number;
  scale: number;
  description: string;
}

export interface Discovery {
  id: string;
  name: string;
  category: string;
  layer: string;
  time: number;
  note: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: "shard" | "organ" | "signal" | "mote" | "essence";
  count: number;
  essence: number;
}

export interface SaveState {
  seed: string;
  creatureId: number;
  layer: string;
  evolution: number;
  cycle: number;
  traits: string[];
  discoveries: Discovery[];
  structures: number;
  bookmarked: boolean;
  lastPlayed: number;
  inventory?: InventoryItem[];
  hunts?: number;
  energy?: number;
  districtClaims?: string[];
  scenario?: ExpeditionId;
  crafted?: string[];
  characterName?: string;
  lifeStage?: LifeStageId;
}

export type DistrictType = "crystal" | "falls" | "ash" | "reef" | "spire" | "jungle" | "ruins" | "hive-city" | "floating-islets" | "graveyard" | "geode-cave" | "spores";

export interface District {
  id: string;
  name: string;
  type: DistrictType;
  x: number;
  z: number;
  radius: number;
  color: string;
  lore: string;
  biome: string;
}

export const districtTypeMeta: Record<DistrictType, { color: string; biome: string; lores: string[] }> = {
  crystal: { color: "#b9f0ff", biome: "Crystalline", lores: ["Crystals still grow toward a star that no longer exists.", "The lattice remembers being liquid light."] },
  falls: { color: "#9fd8ff", biome: "Hydrochoric", lores: ["The water here falls upward during storms of self.", "Every drop carries a memory of the sky it left."] },
  ash: { color: "#c8b096", biome: "Pyroclastic", lores: ["Everything here chose to become ash at once.", "Wind no longer lands. It just passes through what heat left behind."] },
  reef: { color: "#ffb8c8", biome: "Litric Coral", lores: ["A reef older than the ocean it currently eats.", "Soft structures hold for decades and resent interruption."] },
  spire: { color: "#d8ffb8", biome: "Signalhorn", lores: ["The spires harmonize with migratory biology overhead.", "A choir the size of the horizon refuses to stop."] },
  jungle: { color: "#9fe89f", biome: "Overgrown", lores: ["Roots negotiate territory with the wind.", "The canopy feeds on light no one else bothered to use."] },
  ruins: { color: "#c8c0b0", biome: "Fossil Society", lores: ["Something organized once lived here. Its appetite was architecture.", "Stones still wait for instructions."] },
  "hive-city": { color: "#ffd8a0", biome: "Polyvocal", lores: ["Ten thousand hexes rehearse a single thought.", "The city has doors but no concept of private."] },
  "floating-islets": { color: "#b0cfff", biome: "Antigravitic", lores: ["Pieces of the land refused to obey and were rewarded with distance.", "Islands here gossip about the ground."] },
  graveyard: { color: "#d0b8e8", biome: "Mortifera", lores: ["A migration ended here, and the bones politely declined to leave.", "Ribs arch like a cathedral rebelling against being empty."] },
  "geode-cave": { color: "#b0e8ff", biome: "Geodesic", lores: ["Beneath a smooth ordinary shell hides a cathedral of trapped starlight.", "The cave collects light, never spends it."] },
  spores: { color: "#e8ffb0", biome: "Mycaenic", lores: ["A conversation held in molecules excuses no one from joining.", "The forest hired a billion messengers and pays them in weather."] },
};

const districtNames = [
  "The Humming Lattice", "Veil of the Second Wind", "Cinder Hollow", "Diploiden Reef", "The Spine Choir", "Glasskeeper's Field", "The Slow Abyss", "Aurora Shelf",
  "Marrow Steps", "The Quiet Generator", "Third Tide Basin", "Signal Orchard", "The Friendly Cemetery", "Vault of Lunar Venoms", "Shore of the Faired",
  "Chickenbrook Hollow", "The Argent Reef", "The Last Isolate", "Weft of Glowcurrents", "Beacon Alley", "The Redtinge", "Feralisk Salt", "Cephalopod Chorus",
  "The Toxic Pasture", "Veil District", "Seedless Plateau", "Ox-bellow Fields", "Vine Choir", "Crossroads of Eyes", "The Sleeping Aquifer",
];

export function districtsFor(seed: string): District[] {
  const random = seededRandom(seed, "districts");
  const types = Object.keys(districtTypeMeta) as DistrictType[];
  const count = 75;
  const districts: District[] = [];
  for (let index = 0; index < count; index += 1) {
    const type = types[Math.floor(random() * types.length)];
    const meta = districtTypeMeta[type];
    // Spiral distribution across a 1400m open world
    const arm = index % 5;
    const t = Math.floor(index / 5) / Math.ceil(count / 5);
    const angle = (Math.PI * 2 / 5) * arm + t * (Math.PI * 2) * 2.2 + (random() - 0.5) * 0.5;
    const distance = 60 + t * 640 + (random() - 0.5) * 50;
    districts.push({
      id: `${seed}-district-${index}`,
      name: `${districtNames[index % districtNames.length]} locus ${Math.floor(index / districtNames.length) + 1}`,
      type,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      radius: 14 + random() * 16,
      color: meta.color,
      biome: meta.biome,
      lore: meta.lores[Math.floor(random() * meta.lores.length)],
    });
  }
  return districts;
}

export function nearestDistrict(seed: string, x: number, z: number): District | null {
  let best: District | null = null;
  let bestDist = Infinity;
  for (const district of districtsFor(seed)) {
    const dx = district.x - x;
    const dz = district.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestDist) { bestDist = d; best = district; }
  }
  return best && bestDist < best.radius * 1.6 ? best : null;
}

export function districtsNear(seed: string, x: number, z: number, radius = 480): District[] {
  const list = districtsFor(seed);
  return list.filter((district) => {
    const dx = district.x - x;
    const dz = district.z - z;
    return dx * dx + dz * dz < radius * radius;
  });
}

export interface EcosystemState {
  biomass: number;
  predator: number;
  grazer: number;
  stress: number;
  bloom: number;
  tension: number;
}

export interface SettlementRecord {
  id: string;
  name: string;
  era: string;
  founded: number;
  pop: number;
}

const prefixes = [
  "Astra", "Velo", "Nacre", "Cyr", "Thalo", "Orphi", "Kera", "Myr", "Sola", "Umbra",
  "Prax", "Iona", "Zeo", "Lyri", "Eido", "Ossa", "Quori", "Rheo", "Syn", "Vitra",
];
const suffixes = ["phage", "lume", "ceron", "vane", "morph", "spira", "drix", "nema", "vora", "theon"];
const epithets = [
  "the lantern grazer", "the tide listener", "the glass burrower", "the cloud weaver",
  "the pressure pilgrim", "the thermal hunter", "the chorus colony", "the gravity skater",
  "the mineral dreamer", "the light shepherd", "the abyssal architect", "the signal bloom",
];
const locomotions = ["ciliary drift", "six-limbed stride", "buoyant pulsing", "electrostatic flight", "rooted migration", "rolling contraction", "gravity sail", "phase tunneling"];
const senses = ["polarized light", "pressure song", "chemical memory", "magnetic fields", "thermal silhouettes", "gravitational gradients", "electrical intent", "quantum resonance"];
const metabolisms = ["photosynthetic", "chemosynthetic", "thermoelectric", "radiotrophic", "mineral catalytic", "predatory symbiosis", "vacuum metabolic", "probabilistic"];
const roles = ["primary producer", "apex filter-feeder", "symbiotic scout", "mineral decomposer", "ambush pollinator", "colony engineer", "migratory archivist", "ecosystem catalyst"];
const habitats = ["sunlit pelagic shelf", "methane cloudbank", "basalt vent forest", "subglacial ocean", "crystal desert", "high atmosphere", "cellular estuary", "folded-space reef"];
const socials = ["solitary", "paired memory", "seasonal swarm", "distributed colony", "choral hierarchy", "hive consensus", "mutualist network", "nonlocal collective"];
const tolerances = ["high pressure", "hard radiation", "violent temperature flux", "low gravity", "acidic fluid", "vacuum exposure", "tidal shear", "reality noise"];
const bodyPlans: BodyPlan[] = ["radial", "bilateral", "colonial", "fractal", "crystalline", "plasma"];

export function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: string, salt = "") {
  return mulberry32(hashString(`${seed}:${salt}`));
}

export function generateSeed() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint32Array(3));
  const part = (n: number) => Array.from({ length: 4 }, (_, i) => alphabet[(n >>> (i * 5)) % alphabet.length]).join("");
  return `LM-${part(random[0])}-${part(random[1])}-${part(random[2])}`;
}

export const creatures: CreatureDefinition[] = Array.from({ length: 400 }, (_, index) => {
  const random = mulberry32(90210 + index * 7919);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const bodyPlan = bodyPlans[index % bodyPlans.length];
  const genus = `${pick(prefixes)}${pick(suffixes)}`;
  const locomotion = pick(locomotions);
  const sense = pick(senses);
  const habitat = pick(habitats);
  return {
    id: index,
    name: `${genus} ${String(index + 1).padStart(3, "0")}`,
    genus,
    bodyPlan,
    locomotion,
    sense,
    metabolism: pick(metabolisms),
    role: pick(roles),
    habitat,
    social: pick(socials),
    tolerance: pick(tolerances),
    potential: Math.round(28 + random() * 70),
    endurance: Math.round(25 + random() * 74),
    mobility: Math.round(20 + random() * 79),
    cognition: Math.round(10 + random() * 89),
    hue: Math.round((index * 47 + random() * 80) % 360),
    limbs: 2 + Math.floor(random() * 7) * 2,
    segments: 2 + Math.floor(random() * 6),
    scale: 0.7 + random() * 0.7,
    description: `${pick(epithets)}. It navigates by ${sense}, using ${locomotion} to survive the ${habitat}.`,
  };
});

export const layerOrder: WorldLayer[] = ["void", "galaxy", "cosmos", "planet", "micro", "atomic", "quantum"];

export const layerInfo: Record<WorldLayer, { label: string; exponent: number; place: string; description: string; color: string }> = {
  void: {
    label: "Universe Core",
    exponent: 27,
    place: "The Origin Between",
    description: "The membrane where all branches of this universe breathe against each other.",
    color: "#f0d6ff",
  },
  galaxy: {
    label: "Galactic",
    exponent: 11,
    place: "The Vesper Spiral",
    description: "Four billion suns wound around a silence that predates light.",
    color: "#ffd8a8",
  },
  cosmos: {
    label: "Cosmic",
    exponent: 16,
    place: "Vesper Continuum",
    description: "A sparse filament surrounding an unclassified gravitational aperture.",
    color: "#9db8ff",
  },
  planet: {
    label: "Organism",
    exponent: 0,
    place: "Pelagic Shelf Nacre-7",
    description: "A living mineral ocean under the amber light of a collapsed binary.",
    color: "#d8ffb5",
  },
  micro: {
    label: "Cellular",
    exponent: -6,
    place: "Vascular Garden",
    description: "The intercellular sea inside a migratory megafauna specimen.",
    color: "#ffb5cb",
  },
  atomic: {
    label: "Molecular",
    exponent: -10,
    place: "Cathedral of Bonds",
    description: "A lattice of valence shells and shared light where water remembers its form.",
    color: "#9be8ff",
  },
  quantum: {
    label: "Quantum",
    exponent: -15,
    place: "The Recursion Below",
    description: "A coherent probability reef where distance remembers being geometry.",
    color: "#c9b7ff",
  },
};

export const discoveriesByLayer: Record<WorldLayer, Array<Omit<Discovery, "id" | "layer" | "time">>> = {
  void: [
    { name: "The First Breath", category: "Phenomenon", note: "Expansion has a rhythm. It repeats every 10^-32 seconds forever." },
    { name: "Branching Membrane", category: "Boundary", note: "Seven sibling universes press through with measurable intent." },
    { name: "Silent Mass", category: "Structure", note: "Something outweighs this universe. It is not in it." },
  ],
  galaxy: [
    { name: "Vesper Spiral", category: "Galaxy", note: "Its arms align with the player's own gravitational signature." },
    { name: "The Ember Bridge", category: "Structure", note: "A tidal stream of suns crossing into a smaller, terrified galaxy." },
    { name: "Central Shadow", category: "Black hole", note: "The galaxy's heart beats slower the closer you observe." },
  ],
  cosmos: [
    { name: "Orrery Without a Sun", category: "Anomaly", note: "Seven cold worlds orbit a shared absence." },
    { name: "Vanta Aperture", category: "Black hole", note: "Its accretion flow contains biological spectra." },
    { name: "Murmuration Galaxy", category: "Structure", note: "The stellar filament changes shape when observed." },
  ],
  planet: [
    { name: "Choirgrass", category: "Flora", note: "Conductive reeds synchronize before electrical storms." },
    { name: "Glassback Drifter", category: "Species", note: "A grazing organism with a transparent mineral carapace." },
    { name: "Nacre Thermal Vent", category: "Biome", note: "Superheated fluid sustains an ecosystem without sunlight." },
    { name: "The Sleeping Calcite", category: "Geology", note: "The shelf is exoskeleton. Something beneath it is slow-breathing." },
  ],
  micro: [
    { name: "Mnemonic Vesicle", category: "Organelle", note: "Stores environmental stress as folded proteins." },
    { name: "Lumen Phage", category: "Species", note: "A viral swarm that repairs damaged photosynthetic tissue." },
    { name: "Axon Estuary", category: "Biome", note: "Electrical impulses produce temporary current and weather." },
    { name: "The Heart That Hears", category: "Organ", note: "This body is aware of the blood it carries." },
  ],
  atomic: [
    { name: "Benzene Cathedral", category: "Molecule", note: "Six carbons share a ring of light older than any crystal." },
    { name: "Salt Lattice Ocean", category: "Structure", note: "Ionic order forms dunes of pure geometry." },
    { name: "Electron Weather", category: "Phenomenon", note: "Probability clouds storm across the molecule every femtosecond." },
    { name: "Helix Archive", category: "Molecule", note: "A folded polymer carries instructions for a world it cannot see." },
  ],
  quantum: [
    { name: "Recursive Boson", category: "Phenomenon", note: "Contains a smaller but measurably older version of itself." },
    { name: "Probability Reef", category: "Biome", note: "Geometry branches around possible movement." },
    { name: "Silent Constant", category: "Law", note: "A region where entropy becomes directional." },
    { name: "The Ladder Back", category: "Anomaly", note: "Every layer can be re-entered upward. Nothing caps the stack." },
  ],
};

export function universeProfile(seed: string) {
  const random = seededRandom(seed, "profile");
  const spectral = ["amber", "pearl", "violet", "iron", "ultraviolet"];
  const topology = ["open", "recursive", "braided", "closed", "locally infinite"];
  return {
    age: (3.5 + random() * 92).toFixed(2),
    gravity: (0.25 + random() * 2.8).toFixed(2),
    entropy: (0.6 + random() * 1.8).toFixed(3),
    dimensions: 3 + Math.floor(random() * 5),
    spectral: spectral[Math.floor(random() * spectral.length)],
    topology: topology[Math.floor(random() * topology.length)],
  };
}

export function worldParams(seed: string) {
  const random = seededRandom(seed, "world-params");
  return {
    oceanOpacity: 0.55 + random() * 0.32,
    stormBias: random(),
    cloudHeight: 22 + random() * 11,
    ventCount: 3 + Math.floor(random() * 5),
    monolithHueShift: random(),
    atmosphereHue: 0.34 + random() * 0.18,
    faunaDensity: 0.8 + random() * 0.4,
    mineralType: random() > 0.6 ? "basalt" : random() > 0.5 ? "ferrite" : "silica",
  };
}

export type RealmKind = "authored" | "procedural";
export type SceneArchetype = "foam" | "vascular" | "crystal-grove" | "storm" | "helix" | "plasma-sea" | "forest-depth" | "circuit" | "marrow" | "hive" | "nebula-hollow" | "mirror-field" | "titan";

export interface RealmPhysics { label: string; gravity: number; wind: [number, number, number]; damage: boolean; color: string; }

export interface Realm {
  id: string;
  kind: RealmKind;
  key: WorldLayer | null;
  label: string;
  short: string;
  exponent: number;
  archetype: SceneArchetype | "authored";
  place: string;
  description: string;
  color: string;
  fog: string;
  physics: RealmPhysics;
  habitable: boolean;
}

const authoredRealms: Realm[] = [
  { id: "void", kind: "authored", key: "void", label: "Universe Core", short: "VOID", exponent: 27, archetype: "authored", place: "The Origin Between", description: "The membrane where all branches of this universe breathe against each other.", color: "#f0d6ff", fog: "#140529", physics: { label: "Parent Universe", gravity: 0.0001, wind: [0.02, 0, -0.03], damage: false, color: "#f0d6ff" }, habitable: false },
  { id: "galaxy", kind: "authored", key: "galaxy", label: "Galactic", short: "SPIRAL", exponent: 11, archetype: "authored", place: "The Vesper Spiral", description: "Four billion suns wound around a silence that predates light.", color: "#ffd8a8", fog: "#110a19", physics: { label: "Galactic Drift", gravity: 0.0008, wind: [0.008, 0.001, -0.012], damage: false, color: "#ffd8a8" }, habitable: false },
  { id: "cosmos", kind: "authored", key: "cosmos", label: "Cosmic", short: "COSMOS", exponent: 16, archetype: "authored", place: "Vesper Continuum", description: "A sparse filament surrounding an unclassified gravitational aperture.", color: "#9db8ff", fog: "#03020a", physics: { label: "Tidal Field", gravity: 0.003, wind: [0.004, 0, -0.022], damage: false, color: "#9db8ff" }, habitable: false },
  { id: "planet", kind: "authored", key: "planet", label: "Organism", short: "WORLD", exponent: 0, archetype: "authored", place: "Pelagic Shelf Nacre-7", description: "A living mineral ocean under the amber light of a collapsed binary.", color: "#d8ffb5", fog: "#243c39", physics: { label: "Planetary", gravity: 1, wind: [0.012, 0.0005, -0.008], damage: false, color: "#d8ffb5" }, habitable: true },
  { id: "micro", kind: "authored", key: "micro", label: "Cellular", short: "CELL", exponent: -6, archetype: "authored", place: "Vascular Garden", description: "The intercellular sea inside a migratory megafauna specimen.", color: "#ffb5cb", fog: "#321220", physics: { label: "Intercellular", gravity: 0.06, wind: [0.05, 0.01, -0.03], damage: false, color: "#ffb5cb" }, habitable: true },
  { id: "atomic", kind: "authored", key: "atomic", label: "Molecular", short: "MOL", exponent: -10, archetype: "authored", place: "Cathedral of Bonds", description: "A lattice of valence shells and shared light where water remembers its form.", color: "#9be8ff", fog: "#0a1e39", physics: { label: "Coulombic", gravity: 0.0002, wind: [0.001, 0.001, 0.001], damage: false, color: "#9be8ff" }, habitable: true },
  { id: "quantum", kind: "authored", key: "quantum", label: "Quantum", short: "REEF", exponent: -15, archetype: "authored", place: "The Recursion Below", description: "A coherent probability reef where distance remembers being geometry.", color: "#c9b7ff", fog: "#140529", physics: { label: "Probabilistic", gravity: -0.04, wind: [0.09, -0.04, 0.07], damage: true, color: "#c9b7ff" }, habitable: true },
];

const archetypeMeta: Record<SceneArchetype, { base: [number, number, number]; fogHue: [number, number, number]; particles: string; names: string[] }> = {
  "foam": { base: [0.52, 0.6, 0.55], fogHue: [0.56, 0.5, 0.22], particles: "#b8fff0", names: ["Foamed Ocean", "Bubble Sea", "Suds Depth", "Wave Foam"] },
  "vascular": { base: [0.97, 0.6, 0.62], fogHue: [0.98, 0.55, 0.14], particles: "#ff9cbe", names: ["Vascular Jungle", "Vein Sea", "Capillary Field", "Flow Garden"] },
  "crystal-grove": { base: [0.58, 0.85, 0.66], fogHue: [0.62, 0.5, 0.18], particles: "#b8e8ff", names: ["Crystal Grove", "Lattice Field", "Refracted Garden", "Prism Sea"] },
  "storm": { base: [0.62, 0.7, 0.55], fogHue: [0.66, 0.65, 0.12], particles: "#ffe08a", names: ["Charged Field", "Ion Sea", "Lightning Province", "Voltage Plain"] },
  "helix": { base: [0.86, 0.55, 0.68], fogHue: [0.85, 0.5, 0.18], particles: "#e8b8ff", names: ["Spiral Archive", "Fold Repository", "Code Ocean", "Twin Helix"] },
  "plasma-sea": { base: [0.7, 0.85, 0.62], fogHue: [0.72, 0.7, 0.16], particles: "#a88aff", names: ["Plasma Ocean", "Ionized Sea", "Glow Tide", "Liquid Light"] },
  "forest-depth": { base: [0.33, 0.55, 0.4], fogHue: [0.4, 0.45, 0.12], particles: "#b8e8a8", names: ["Underforest", "Root Abyss", "Chapel of Fungus", "Silent Canopy"] },
  "circuit": { base: [0.5, 0.7, 0.5], fogHue: [0.55, 0.6, 0.12], particles: "#8a8aff", names: ["Silicon Plain", "Circuit Dunes", "Logic Sea", "Pattern Grid"] },
  "marrow": { base: [0.08, 0.3, 0.72], fogHue: [0.08, 0.4, 0.2], particles: "#ffe8d8", names: ["Marrow Valley", "Bone Shell", "Cortex Cave", "Skeletal Province"] },
  "hive": { base: [0.11, 0.7, 0.68], fogHue: [0.12, 0.65, 0.2], particles: "#ffd86a", names: ["Hive Field", "Honey Sea", "Cell Cluster", "Swarm Home"] },
  "nebula-hollow": { base: [0.78, 0.5, 0.55], fogHue: [0.78, 0.45, 0.15], particles: "#ffb88a", names: ["Nebula Hollow", "Cloud Nest", "Stellar Nursery", "Dust Cathedral"] },
  "mirror-field": { base: [0.58, 0.3, 0.82], fogHue: [0.6, 0.2, 0.25], particles: "#e8e8ff", names: ["Mirror Field", "Reflection Sea", "Infinite Plain", "Echo Surface"] },
  "titan": { base: [0.02, 0.5, 0.7], fogHue: [0.04, 0.45, 0.22], particles: "#ffb88a", names: ["Titan's Rest", "Giant's Skin", "The Scale Ocean", "Steppe of Skin"] },
};

const realmById = new Map<string, Realm>();

function makeProceduralRealm(index: number, globalIndex: number): Realm {
  const random = mulberry32(hashString(`realm-seed-${index}-${globalIndex}`));
  const archetypeKeys = Object.keys(archetypeMeta) as SceneArchetype[];
  const archetype = archetypeKeys[Math.floor(random() * archetypeKeys.length)];
  const meta = archetypeMeta[archetype];
  const nameIndex = Math.floor(random() * meta.names.length);
  const hueShift = (random() - 0.5) * 0.12;
  const color = new THREEColor(...meta.base).offsetHSL(hueShift, 0, (random() - 0.5) * 0.12).getHexString();
  const label = `${meta.names[nameIndex]} · ${["Lower", "Upper", "Deep", "Vest", "Outer", "Inner"][Math.floor(random() * 6)]} Realm`;
  const exponent = Math.floor(random() * 12) - 18;
  const gravity = (random() - 0.35) * 1.6;
  return {
    id: `realm-${index}`,
    kind: "procedural",
    key: null,
    label,
    short: label.split(" ")[0].toUpperCase().slice(0, 8),
    exponent,
    archetype,
    place: `${meta.names[nameIndex]} Station ${index + 1}`,
    description: `${meta.names[nameIndex]} lives in a ${["breathing", "pulsing", "humming", "weeping", "still", "screaming"][Math.floor(random() * 6)]} tide below the visible world.`,
    color: `#${color}`,
    fog: `#${new THREEColor(...meta.fogHue).offsetHSL(hueShift * 0.4, 0, 0).getHexString()}`,
    physics: {
      label: `${archetype} Current`,
      gravity: Math.abs(gravity) < 0.05 ? gravity * 8 : gravity,
      wind: [(random() - 0.5) * 0.2, (random() - 0.5) * 0.12, (random() - 0.5) * 0.2],
      damage: gravity < -0.4 || random() > 0.88,
      color: `#${new THREEColor(...meta.base).offsetHSL(hueShift, 0, 0.06).getHexString()}`,
    },
    habitable: true,
  };
}

class THREEColor {
  private h: number; private s: number; private l: number;
  constructor(h: number, s: number, l: number) {
    this.h = h; this.s = s; this.l = l;
  }
  offsetHSL(dh: number, ds: number, dl: number) {
    this.h = (this.h + dh + 1) % 1;
    this.s = Math.max(0, Math.min(1, this.s + ds));
    this.l = Math.max(0, Math.min(1, this.l + dl));
    return this;
  }
  getHexString() {
    return hslToHex(this.h, this.s, this.l);
  }
}

function hslToHex(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

const targetRealmCount = 66;
const proceduralRealms: Realm[] = [];
let intervalIndex = 0;
while (authoredRealms.length + proceduralRealms.length < targetRealmCount) {
  const realm = makeProceduralRealm(proceduralRealms.length, proceduralRealms.length + authoredRealms.length);
  realm.exponent = 24 - (intervalIndex * (24 - (-24)) / (targetRealmCount - authoredRealms.length)) + (proceduralRealms.length % 3);
  intervalIndex += 1;
  proceduralRealms.push(realm);
}

// Interleave procedural realms between authored ones sorted by exponent.
export const realmList: Realm[] = [...authoredRealms, ...proceduralRealms].sort((a, b) => b.exponent - a.exponent).map((realm, index) => ({
  ...realm,
  id: realm.kind === "authored" ? realm.id : `realm-${index}`,
}));

realmList.forEach((realm) => realmById.set(realm.id, realm));

export function getRealm(id: string): Realm {
  const realm = realmById.get(id);
  if (realm) return realm;
  // Unknown realm ids (older saves) fall back to planet.
  return realmById.get("planet")!;
}

export function realmAtIndex(index: number): Realm {
  const clamped = Math.max(0, Math.min(realmList.length - 1, index));
  return realmList[clamped];
}

export function realmIndexOf(id: string): number {
  return Math.max(0, realmList.findIndex((realm) => realm.id === id));
}

export function realmDiscoveries(seed: string, realm: Realm): Array<Omit<Discovery, "id" | "layer" | "time">> {
  const random = seededRandom(`${seed}:${realm.id}:discoveries`);
  const pool: Array<{ name: string; category: string; note: string }> = [
    { name: `The ${realm.place.split(" ")[0]} Chorus`, category: "Organism", note: `A chorus of ${archetypeMeta[realm.archetype as SceneArchetype]?.names[0] ?? realm.place} organisms sings in frequencies below light.` },
    { name: "Still Water Memory", category: "Anomaly", note: `The fluid here contains a perfect recording of your last movement.` },
    { name: `${realm.short} Jay Engine`, category: realm.kind === "procedural" ? "Realm Engine" : "Phenomenon", note: `A structure older than the world it sustains keeps this realm cohering.` },
    { name: "Looping Predator", category: "Species", note: `It hunts in a small closed orbit and has never noticed its path repeats.` },
    { name: "Fold Gate", category: "Boundary", note: `Approach within three body-lengths and the ladder flexes upward.` },
    { name: `Color of ${realm.place.split(" ")[0]}`, category: "Phenomenon", note: `Physics assigns this field a mood. It is contagious.` },
  ];
  return Array.from({ length: 3 }, () => pool[Math.floor(random() * pool.length)]);
}

export function realmReadings(realm: Realm): Array<[string, string]> {
  return [
    ["SCALE", `10${realm.exponent >= 0 ? "+" : ""}${realm.exponent} m`],
    ["GRAVITY", `${realm.physics.gravity.toFixed(3)} g`],
    ["WIND", `[${realm.physics.wind.map((w) => w.toFixed(2)).join(", ")}]`],
  ];
}

export function realmSCaleMeter(realm: Realm): string {
  return `10${realm.exponent >= 0 ? "⁺" : "⁻"}${Math.abs(realm.exponent)}`;
}

export function realmPhysics(seed: string, realm: Realm): RealmPhysics {
  if (realm.kind === "authored") {
    const existing: Record<WorldLayer, RealmPhysics> = {
      void: { label: "Parent Universe", gravity: 0.0001, wind: [0.02, 0, -0.03], damage: false, color: "#f0d6ff" },
      galaxy: { label: "Galactic Drift", gravity: 0.0008, wind: [0.008, 0.001, -0.012], damage: false, color: "#ffd8a8" },
      cosmos: { label: "Tidal Field", gravity: 0.003, wind: [0.004, 0, -0.022], damage: false, color: "#9db8ff" },
      planet: { label: "Planetary", gravity: parseFloat(universeProfile(seed).gravity), wind: [0.012, 0.0005, -0.008], damage: false, color: "#d8ffb5" },
      micro: { label: "Intercellular", gravity: 0.06, wind: [0.05, 0.01, -0.03], damage: false, color: "#ffb5cb" },
      atomic: { label: "Coulombic", gravity: 0.0002, wind: [0.001, 0.001, 0.001], damage: false, color: "#9be8ff" },
      quantum: { label: "Probabilistic", gravity: -0.04, wind: [0.09, -0.04, 0.07], damage: true, color: "#c9b7ff" },
    };
    return existing[realm.key ?? "planet"];
  }
  const derived = seededRandom(seed, realm.id);
  return {
    ...realm.physics,
    gravity: realm.physics.gravity + (derived() - 0.5) * 0.1,
    wind: [
      realm.physics.wind[0] + (derived() - 0.5) * 0.03,
      realm.physics.wind[1] + (derived() - 0.5) * 0.02,
      realm.physics.wind[2] + (derived() - 0.5) * 0.03,
    ],
  };
}

export function realmSceneAudio(realm: Realm): { frequencies: [number, number, number]; filter: [number, number]; shimmer: [number, number]; noiseLevel: number; melodyBase: number } {
  if (realm.kind === "authored") {
    const map: Record<WorldLayer, { frequencies: [number, number, number]; filter: [number, number]; shimmer: [number, number]; noiseLevel: number; melodyBase: number }> = {
      void: { frequencies: [19, 38, 76], filter: [280, 0.9], shimmer: [1480, 1.1], noiseLevel: 0.02, melodyBase: 146.83 },
      galaxy: { frequencies: [24, 48, 96], filter: [310, 0.9], shimmer: [1380, 1.1], noiseLevel: 0.025, melodyBase: 146.83 },
      cosmos: { frequencies: [31, 46, 92], filter: [310, 0.8], shimmer: [1380, 1.1], noiseLevel: 0.025, melodyBase: 164.81 },
      planet: { frequencies: [52, 78, 156], filter: [720, 0.8], shimmer: [980, 1.1], noiseLevel: 0.09, melodyBase: 196 },
      micro: { frequencies: [67, 101, 202], filter: [720, 0.8], shimmer: [720, 1.1], noiseLevel: 0.06, melodyBase: 220 },
      atomic: { frequencies: [89, 178, 356], filter: [900, 0.9], shimmer: [1480, 1.2], noiseLevel: 0.04, melodyBase: 246.94 },
      quantum: { frequencies: [41, 123, 369], filter: [1100, 4], shimmer: [1480, 1.1], noiseLevel: 0.03, melodyBase: 261.63 },
    };
    return map[realm.key ?? "planet"];
  }
  const meta = archetypeMeta[realm.archetype as SceneArchetype];
  const base = meta.base;
  return {
    frequencies: [
      Math.round(24 + base[0] * 120),
      Math.round(base[0] * 160),
      Math.round(base[0] * 280),
    ],
    filter: [Math.round(280 + meta.base[1] * 900), 0.6 + meta.base[2] * 2.4],
    shimmer: [Math.round(600 + meta.fogHue[2] * 1800), 1.1],
    noiseLevel: 0.02 + meta.base[2] * 0.08,
    melodyBase: 120 + base[0] * 160,
  };
}

export function physicsProfile(layer: WorldLayer, seed: string) {
  const p = universeProfile(seed);
  const g = parseFloat(p.gravity);
  const profiles: Record<WorldLayer, { label: string; gravity: number; wind: [number, number, number]; damageZone: boolean; color: string }> = {
    void: { label: "Parent Universe", gravity: 0.0001, wind: [0.02, 0, -0.03], damageZone: false, color: "#f0d6ff" },
    galaxy: { label: "Galactic Drift", gravity: 0.0008, wind: [0.008, 0.001, -0.012], damageZone: false, color: "#ffd8a8" },
    cosmos: { label: "Tidal Field", gravity: 0.003, wind: [0.004, 0, -0.022], damageZone: false, color: "#9db8ff" },
    planet: { label: "Planetary", gravity: g, wind: [0.012, 0.0005, -0.008], damageZone: false, color: "#d8ffb5" },
    micro: { label: "Intercellular", gravity: 0.06, wind: [0.05, 0.01, -0.03], damageZone: false, color: "#ffb5cb" },
    atomic: { label: "Coulombic", gravity: 0.0002, wind: [0.001, 0.001, 0.001], damageZone: false, color: "#9be8ff" },
    quantum: { label: "Probabilistic", gravity: -0.04, wind: [0.09, -0.04, 0.07], damageZone: true, color: "#c9b7ff" },
  };
  return profiles[layer];
}

const settlementNames = ["Ember-Ash", "The Choir", "Signal Smoke", "Pale Vane", "Ridgeborn", "Salt Choir", "Saltglass"];

export function settlementProfile(seed: string, index: number) {
  const random = seededRandom(seed, `settlement-${index}`);
  const name = `${settlementNames[Math.floor(random() * settlementNames.length)]} ${index + 1}`;
  const era = index === 0
    ? "Proto-signal Clan"
    : index < 3
      ? "Stone Mirror Clan"
      : index < 6
        ? "Village of Smoke-Dancers"
        : index < 10
          ? "Town of Seven Spires"
          : index < 15
            ? "The Distant Coast"
            : index < 22
              ? "Signal Hegemony"
              : "Multi-Continental Choir";
  return {
    name,
    era,
    pop: Math.floor(12 + Math.pow(index + 1, 2.1) * (6 + random() * 4)),
    color: `hsl(${Math.floor(160 + random() * 90)}, 60%, 62%)`,
  };
}
