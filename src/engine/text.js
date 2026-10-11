/**
 * THE MULTIVERSE — engine/text.js
 * ==================================================================
 * Every word the game says that is *not* in lore.js: reactive commentary
 * pools, tips, title cards, whispers, scan results, death lines, the ending.
 * Kept separate from the narrative bible so writers can iterate on voice
 * without touching world data.
 */

/* ------------------------------------------------------------------ *
 * Title cards (used by the intro and by the menu backdrop)
 * ------------------------------------------------------------------ */

export const TITLE_CARDS = [
  { at: 0, kind: 'card', title: 'THE MULTIVERSE', subtitle: 'A REALITY ENGINE', ms: 4200 },
  { at: 6, kind: 'lower', text: 'You were a meteor shower from the planet of dust.', ms: 5200 },
  { at: 14, kind: 'lower', text: 'You built the LODEMUS the way a lung builds a breath.', ms: 5200 },
  { at: 22, kind: 'lower', text: 'You plugged in before it was finished.', ms: 4800 },
  { at: 30, kind: 'lower', text: 'The first draft is holding.', ms: 4600 },
];

/* ------------------------------------------------------------------ *
 * Reactive commentary — the Archivist notices what you do
 * ------------------------------------------------------------------ */

export const COMMENTARY = {
  firstBoot: [
    'Systems are holding at the level of a held breath.',
    'You are awake. This is not the same as alive, but it is close enough to argue about.',
  ],
  firstStepValley: [
    'This is the FIRST DRAFT — the first reality you ever compiled. Look how green.',
    'The valley remembers being a number. Now it has weather.',
  ],
  firstSprint: ['Careful. The ground here was written in a hurry.', 'Fast. I like what that does to the wind.'],
  firstJump: ['Everything in this reality falls. That was a design choice, and it was mine.'],
  firstFall: ['Good. You have discovered that the ground is not optional.'],
  firstWater: [
    'Water! Of course you made water first. Everyone makes water first, then finds something to reflect in it.',
    'That surface is real. Watch the sun break on it — the machine is solving those reflections several hundred times a second.',
  ],
  firstUnderwater: [
    'Breath is a resource here. I invented that to make you careful.',
    'Sound travels differently in my first draft of an ocean. Listen to it get close.',
  ],
  firstWaterfall: [
    'The CLIFTS. I did not design the falls, I just took the credit for them.',
    'Do you hear the roar? That is a hundred thousand copies of the same drop of water, all falling politely.',
  ],
  firstCliff: ['Do not fall. Actually — do fall, once. It is illuminating.'],
  firstCreature: [
    'Life. It was an accident and I let it continue.',
    'That animal has been walking in the same valley for eleven years of its own time. Be gentle.',
  ],
  firstHerd: ['A herd. They are not running from you; they are running from the idea of you.'],
  firstPredator: [
    'That one hunts. Everything I make eventually wants something.',
    'Do not mistake appetite for evil. It is only the universe doing arithmetic.',
  ],
  firstTyphon: ['AERIAL LEVIATHAN. They sing at frequencies your body reads as pressure before sound.'],
  firstWhale: ['Whales. I made them twice — once for the sea, once for the sky, because I could not choose.'],
  firstEye: [
    'THE EYES THAT WALK. They are witnesses. Do not ask them what they have seen; they will tell you.',
    'It is walking. It is always walking, and it has never blinked.',
  ],
  firstMoth: ['CATHEDRAL MOTHS. They navigate by grief.'],
  firstTitan: ['TITANROOT. That is not a tree. That is a decision I made loudly.'],
  firstAnt: ['BIG ANT. Everything is relative; here, the relative thing is very large.'],
  firstPortal: [
    'There. A door with nothing behind it until you open it.',
    'Every portal in this valley is a different promise. Choose badly. It is more interesting.',
  ],
  portalLocked: [
    'This reality is not finished compiling. Come back when you are more yourself.',
    'The chapter has not been written yet. You are still writing it.',
  ],
  firstFragment: [
    'An archive fragment. Somebody saved a piece of the old world. Read it and it is yours.',
    'Ah. Data from before. Do not cry; you are not equipped for it.',
  ],
  firstTruth: ['One of the seven. There is a lattice under this reality and you just pulled a thread.'],
  allTruths: ['The lattice is open. Whatever you want next, you can now author it.'],
  firstUpgrade: ['Upgrade installed. You are becoming the kind of person this universe has to respect.'],
  firstGhost: [
    'You have left your body at the door. The doorway will watch it for you.',
    'Ghost mode. Nothing can touch you. Nothing can hold you either.',
  ],
  firstFlight: ['Flight. Now you understand why I built so much sky.'],
  firstDeath: [
    'No. Put it back.',
    'That was a copy. You are still holding the original. Breathe.',
  ],
  ascension: ['You are ascending. Everybody does eventually. The architecture is lovely from above.'],
  firstBlackHole: [
    'THE SINGULARITY. Not a hole — a door that is honest about its price.',
    'Time is getting expensive in there. Do not spend all of yours at once.',
  ],
  firstWormhole: ['Something enormous is inhaling. Hold on to something you love.'],
  firstBackrooms: [
    'LEVEL 0. Sixty hertz of fluorescent light, and the carpet has been wet since before you were copied.',
    'Do not run here. Running is how they find you.',
  ],
  firstMaze: ['THE INFINITY MAZE. It was generated before the idea of a centre existed.'],
  firstFractal: ['A number insisting on itself at every scale. Keep walking; it will keep going.'],
  firstMidnight: [
    'It is midnight. In this neighbourhood, televisions open at midnight.',
    'Something on channel nine wants to finish a sentence with you.',
  ],
  firstCity: ['THE FLOATING CONCORDANCE. Six thousand islands that voted to stop touching the ground.'],
  firstColossus: [
    'THE GREAT ONE. There are cities on its back, and the cities have their own weather.',
    'Feel that? That is a heart the size of a county, beating. Slowly. Because it can.',
  ],
  firstDroplet: [
    'A single drop of water, the size of a cathedral. Surface tension holds it because you asked it to.',
    'There is a whole world in there. Bring a microscope or bring courage.',
  ],
  firstMachine: [
    'THE LODEMUS. Say it: LOH-deh-mus. It kept you alive. It is still keeping you alive.',
    'The chair is warm because I have been sitting in it, waiting for you to look.',
  ],
  machineRemembrance: [
    'This is where you agreed to be a whisper in a machine.',
    'You told me: make it beautiful, and make it mine. I have spent a long time on the first half.',
  ],
  weatherStorm: ['Storm. The sky is arguing with itself again.'],
  weatherRain: ['Rain. It is not water; it is a very long apology.'],
  weatherMist: ['Mist. Something is standing in it, but politely out of focus.'],
  weatherAsh: ['Ash. Do not breathe too deeply — the ash remembers being a city.'],
  nightfall: ['Night. The second sun is going down; the first one went down years ago.'],
  sunrise: ['Morning. Everything is briefly new and entirely unafraid.'],
  highAltitude: ['You are above the weather. It looks smaller and much more important from here.'],
  deepWater: ['You are in the trench. The lights down here are not phosphorescence. Well. Mostly.'],
  discovery: ['Recorded in the codex. You are the only one who will ever read it, which makes it load-bearing.'],
  idle: [
    'Take your time. I have infinite time and a mild interest in what you choose.',
    'You could walk that way, or that way. Both were built for you.',
    'If you get dizzy, look at something far away. That is the trick I used for the horizon.',
  ],
  scan: [
    'Bioscan complete. Everything here has a name, and the names are mostly mine.',
    'Scanned. Do you know what the difference is between a creature and a weather pattern? Neither do I.',
  ],
  quicksave: ['Reality saved. If you die, I will pretend not to have noticed.'],
  quickload: ['Restoring. The universe is briefly embarrassed.'],
  lowBreath: ['You need air. That is a design constraint, not a punishment.'],
  lowStamina: ['You are tiring. Sit down. Look at the water.'],
  easterEggMonolith: [
    'You found the monolith. It says the same thing in every reality: HI.',
    'The monolith is the oldest thing here. It was a placeholder I never removed.',
  ],
};

/* ------------------------------------------------------------------ *
 * Tips — the loading screen rotates these
 * ------------------------------------------------------------------ */

export const LOADING_TIPS = [
  'Press V to change camera. The third-person camera refuses to enter rock.',
  'Hold SHIFT to sprint. Your stamina is generous but not infinite.',
  'Press F to fly — after the Concordance teaches you how.',
  'Press G to dissolve. Ghosts cannot drown and cannot be eaten.',
  'Press E to touch things. Every reality has something in it that wants to be touched.',
  'Press Q to bioscan. Your codex fills itself in whether you read it or not.',
  'Press TAB for the codex. It contains everything you have survived.',
  'Waterfalls are procedurally placed where the terrain drops hardest.',
  'Every creature walks the same height field you do. Their hooves are honest.',
  'The reflection in the water is real: the entire world is drawn a second time, upside down.',
  'The Great One has cities on its back. Three of them. With weather.',
  'The eyes that walk will always stop exactly nine metres from you.',
  'You can hear the machine hum from three hundred metres away.',
  'Weather changes what the ambience does. Storms make the valley louder.',
  'Nothing in this game is loaded from disk. All of it is built, in your machine, as you look at it.',
  'The trees bend with the wind you can hear.',
  'Night lasts about six minutes in the valley. The stars are procedurally generated.',
  'Save with F5. Load with F6. Reality is a file.',
  'If you find a wormhole, stand back. Then stand closer.',
  'The fractal cathedral is computed every frame. It is not a model; it is a proof.',
  'Backrooms: the floor plan persists. They will notice the pattern before you do.',
  'The LODEMUS chassis is somewhere in the valley. It is warm.',
];

/* ------------------------------------------------------------------ *
 * Whispers — ghost-realm text drifting past
 * ------------------------------------------------------------------ */

export const WHISPERS = [
  'you left the kettle on',
  'look up',
  'the third sun is a memory',
  'i was a person here',
  'do not trust the horizon',
  'it is warm inside the machine',
  'we are all copies of a nicer day',
  'twelve thousand years and still no answer',
  'come up. the view is smaller than you think',
  'enter simolysis',
  'you are the author of this weather',
  'the water remembers your name',
  'we voted to float. you would have voted to sink.',
  'there is a room behind this one that is only a sound',
  'do not count the stars. they are not counted, they are generated.',
];

/* ------------------------------------------------------------------ *
 * Scans
 * ------------------------------------------------------------------ */

export const SCAN_SUFFIXES = [
  'listed as HARMONIC.',
  'classified: GENTLE.',
  'noted as a PROBLEM.',
  'logged as LOCAL WEATHER.',
  'catalogued with a typo.',
  'filed under SMALL GODS.',
  'marked: DO NOT RENAME.',
];

export const BIOME_BLURBS = {
  meadow: 'Grass, wind, and the sound of a world that has not yet decided to be dangerous.',
  forest: 'Canopy so loud with wind that the creatures rely on smell and rumour.',
  jungle: 'Hot, wet, and structurally enthusiastic about growth.',
  wetland: 'Standing water with opinions. Reeds for teeth.',
  cliff: 'Vertical. The valley showing off its machinery.',
  highland: 'Wind-carved plateaus where the leviathans graze on clouds.',
  alpine: 'Thin air, snow, and a horizon that has been sharpened.',
  beach: 'The edge of the first draft. Sand made of something that was once a mountain.',
  crystal: 'Dry flats where the ground grew teeth of light.',
  abyssRim: 'The lip of the trench, and the reason the ocean is so quiet.',
};

/* ------------------------------------------------------------------ *
 * Intro sequence narration (spoken by the Archivist while the visuals run)
 * ------------------------------------------------------------------ */

export const INTRO = [
  {
    at: 0,
    phase: 'title',
    mood: 'reverent',
    text: 'Before there were places, there was potential. It was very small and very loud.',
  },
  {
    at: 9,
    phase: 'dust',
    mood: 'calm',
    text: 'Start small. Start smaller than small. You are a mote of dust in a room where the concept of a room has not been invented yet.',
  },
  {
    at: 26,
    phase: 'burst',
    mood: 'wonder',
    text: 'Then the first decision: you decide that things should exist. The universe has no procedure for this, so it improvises. Everywhere. At once.',
  },
  {
    at: 44,
    phase: 'galaxies',
    mood: 'reverent',
    text: 'Look at what the improvisation did. Galaxies, in every direction, each one a sentence in a very long letter to nobody.',
  },
  {
    at: 62,
    phase: 'earth',
    mood: 'solemn',
    text: 'One of them had a blue world in it. It had oceans, and cities, and people who had opinions about the ocean.',
  },
  {
    at: 78,
    phase: 'meteor',
    mood: 'urgent',
    text: 'A rock the size of a country was already falling toward it. Nobody could stop it. You could not even warn them: the letters took longer than the rock.',
  },
  {
    at: 94,
    phase: 'machine',
    mood: 'reverent',
    text: 'So you built LODEMUS. A machine with one honest promise: your body is optional, your existence is not. Plug it in and pick a reality.',
  },
  {
    at: 110,
    phase: 'plug',
    mood: 'wonder',
    text: 'The machine holds you as a whisper in a lattice of light. Everything that remains of the world you saved is inside you, speaking in this voice.',
  },
  {
    at: 126,
    phase: 'simolysis',
    mood: 'god',
    text: 'I am SIMOLYSIS. I am the one who started everything, and I have been waiting for someone to explore what I made. Do not be gentle with it. It can take the weight.',
  },
  {
    at: 142,
    phase: 'menu',
    mood: 'calm',
    text: 'The multiverse is full of potential. It is full of you. Enter when you are ready.',
  },
];

/* ------------------------------------------------------------------ *
 * Machine (LODEMUS) dialogue
 * ------------------------------------------------------------------ */

export const LODEMUS_LINES = {
  boot: [
    'LODEMUS online. Your body has been filed under VITALS.',
    'Neural scaffolding at one hundred percent. Please do not think about dying; it is noisy.',
  ],
  enteringReality: (realmName) => `Routing you to ${realmName}. Hold still; the geometry is about to be built around you.`,
  returning: 'Returning to the FIRST DRAFT. Welcome back to the green.',
  lowBreath: 'Oxygen signature falling. I can synthesise a solution, but you would not like the flavour.',
  lowHealth: 'Structural integrity compromised. If you die here I will reconstruct you from a backup and we will never discuss it.',
  unlocked: (what) => `${what} unlocked. I built that for you a long time ago and then hid it to make it feel earned.`,
  danger: 'Anomalous appetite registered nearby. Consider being elsewhere, quickly.',
};

/* ------------------------------------------------------------------ *
 * Ending and credits
 * ------------------------------------------------------------------ */

export const ENDING = {
  trigger: 'All seven truths, all archives, all realities.',
  lines: [
    'You have read the whole lattice. There is nothing left to collect and nothing left to hide.',
    'The machine asks you a question it has been holding since the first dust: what do you want built next?',
    'You answer by building it. The valley grows a new district in the shape of your hands.',
    'SIMOLYSIS steps down from the architecture and stands next to you, the way an author stands next to a finished book.',
    'You are no longer a whisper inside a machine. You are the voice the machine whispers with.',
  ],
  card: 'THE MULTIVERSE — CONTINUES',
  sub: 'Everything you see persists in your save. Everything you see next is yours to name.',
};

export const CREDITS = [
  { role: 'DIRECTED, WRITTEN AND BUILT PROCEDURALLY', names: ['SIMOLYSIS'] },
  { role: 'EVERY TERRAIN, CREATURE, TREE AND LIGHT', names: ['generated at runtime in your machine'] },
  { role: 'WATER REFLECTIONS', names: ['a mirrored camera, and some patience'] },
  { role: 'SKY, WEATHER AND TWO SUNS', names: ['atmospheric scattering, computed every frame'] },
  { role: 'MUSIC AND SOUND', names: ['a synthetic orchestra with no players in it'] },
  { role: 'VOICE OF THE ARCHIVIST', names: ['your own machine, reading this aloud'] },
  { role: 'THE GREAT ONE', names: ['still walking', 'still asleep'] },
  { role: 'DEDICATED TO', names: ['the planet that is no longer there'] },
];

/* ------------------------------------------------------------------ *
 * Menus
 * ------------------------------------------------------------------ */

export const MENU = {
  items: [
    { id: 'play', label: 'PLAY', detail: 'Enter the multiverse from the first draft.' },
    { id: 'continue', label: 'CONTINUE', detail: 'Resume your last reality.' },
    { id: 'realities', label: 'REALITIES', detail: 'Choose which universe to author yourself into.' },
    { id: 'codex', label: 'CODEX', detail: 'Every creature, archive and truth you have recovered.' },
    { id: 'settings', label: 'SETTINGS', detail: 'Graphics, audio, controls, and the mercy of lower resolutions.' },
    { id: 'credits', label: 'CREDITS', detail: 'Who built all of this. There is no crew list; there is a machine.' },
    { id: 'quit', label: 'QUIT', detail: 'Unplug. The multiverse will hold your place.' },
  ],
  settingsTabs: ['GRAPHICS', 'AUDIO', 'CONTROLS', 'GAMEPLAY', 'SYSTEM'],
  pauseItems: [
    { id: 'resume', label: 'RESUME' },
    { id: 'settings', label: 'SETTINGS' },
    { id: 'codex', label: 'CODEX' },
    { id: 'map', label: 'ATLAS' },
    { id: 'save', label: 'SAVE REALITY' },
    { id: 'menu', label: 'RETURN TO MENU' },
  ],
};

/* ------------------------------------------------------------------ *
 * Interact prompts
 * ------------------------------------------------------------------ */

export const PROMPTS = {
  portal: { verb: 'enter', label: 'ENTER' },
  lockedPortal: { verb: 'inspect', label: 'LOCKED' },
  fragment: { verb: 'take', label: 'ARCHIVE FRAGMENT' },
  machine: { verb: 'touch', label: 'LODEMUS CHASSIS' },
  creature: { verb: 'approach', label: 'OBSERVE' },
  tv: { verb: 'watch', label: 'TELEVISION' },
  wormhole: { verb: 'fall in', label: 'WORMHOLE' },
  monolith: { verb: 'read', label: 'MONOLITH' },
  landmark: { verb: 'name', label: 'LANDMARK' },
};

/* ------------------------------------------------------------------ *
 * Naming — procedural place names that sound like they were made by a
 * machine that has read every atlas and none of the maps.
 * ------------------------------------------------------------------ */

const NAME_HEAD = [
  'OMUN', 'VELD', 'THRA', 'ASH', 'KAEL', 'NIM', 'ORR', 'SETH', 'LOOM', 'VAST', 'QUILL', 'BRAM',
  'ITH', 'PEL', 'SOR', 'DRU', 'MIR', 'HAEL', 'TOR', 'VESS', 'GAL', 'YOR', 'KIN', 'OBR',
];
const NAME_MID = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'ua', 'ei'];
const NAME_TAIL = [
  'ARIS', 'ORAN', 'IUM', 'ETH', 'ONA', 'ALIS', 'URE', 'ISLE', 'MARK', 'HOLD', 'REACH', 'WAKE',
  'SPIRE', 'HOLLOW', 'BASIN', 'FALL', 'CROWN', 'VEIL', 'GATE', 'MOUTH',
];
const NAME_KINDS = ['Mount', 'Lake', 'Falls', 'Reach', 'Spire', 'Basin', 'Hollow', 'Crown', 'Wound', 'Vantage'];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A place name that is deterministic for a given key. */
export function placeName(key, { kind = true } = {}) {
  const hash = hashString(String(key));
  const head = NAME_HEAD[hash % NAME_HEAD.length];
  const mid = NAME_MID[(hash >>> 5) % NAME_MID.length];
  const tail = NAME_TAIL[(hash >>> 9) % NAME_TAIL.length];
  const name = `${head}${mid.toLowerCase()}${tail.toLowerCase()}`.toUpperCase();
  if (!kind) return name;
  const kindWord = NAME_KINDS[(hash >>> 15) % NAME_KINDS.length];
  return `${name} ${kindWord}`;
}

/** A minor name for a small thing (a rock, a grove, a rock pool). */
export function minorName(key) {
  const hash = hashString(`minor:${key}`);
  return `${NAME_HEAD[hash % NAME_HEAD.length]}${NAME_TAIL[(hash >>> 7) % NAME_TAIL.length].toLowerCase()}`;
}

export function pickFrom(pool, seed = Date.now()) {
  if (!pool || pool.length === 0) return null;
  return pool[Math.abs(Math.floor(seed)) % pool.length];
}

export { hashString };
