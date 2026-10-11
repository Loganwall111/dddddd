/**
 * THE MULTIVERSE: SIMOLYSIS — lore.js
 * ==================================================================
 * THE NARRATIVE BIBLE. Everything the game says out loud lives here:
 * the prologue narration, the Archivist's commentary, the seven truths of
 * Simolysis, the realm registry, the creature codex, the archive fragments
 * and the broadcasts of channel KVLX-Midnight.
 *
 * Keeping every string in one pure-data module means the test suite can
 * audit all of it (balanced tags, no placeholder text, unique ids) and the
 * writers' room can be edited without touching the renderer.
 * ==================================================================
 */

export const TITLE = 'THE MULTIVERSE';
export const SUBTITLE = 'SIMOLYSIS';
export const TAGLINE = 'Earth is gone. Reality is yours to author.';
export const MACHINE = {
  name: 'LODEMUS',
  spoken: 'LODEH-mus',
  aliases: ['Lodamis', 'Lodemus', 'Loden-Miss', 'LODAMIS-LODEMUS'],
  designation: 'LODEMUS-class continuity engine — iteration 7',
  description:
    'The last machine built by the last hands on Earth. It does not save you. ' +
    'It archives you — then plugs what remains into a reality it invents to keep you calm.',
  motto: 'WHILE YOU ARE INSIDE, YOU DO NOT HAVE TO KNOW.',
};

/* ------------------------------------------------------------------ *
 * PROLOGUE — the cinematic that opens the game
 * ------------------------------------------------------------------ */

/**
 * The intro is played beat by beat. `phase` selects how the intro renderer
 * frames the beat:
 *   dust        — you are an atom of dust in the dark before life
 *   ignition    — the burst of energy radiating across the multiverse
 *   expansion   — galaxies unfurling, worlds igniting
 *   death       — Earth's last minutes; the meteorite
 *   lodemus     — the machine, the hand, the plug
 *   gift        — the valley is authored for you; the god watches
 */
export const PROLOGUE = [
  {
    id: 'before-all',
    phase: 'dust',
    at: 0,
    duration: 11,
    mood: 'reverent',
    text: 'Before the first heartbeat, there was dust.',
  },
  {
    id: 'dust-is-all',
    phase: 'dust',
    at: 11,
    duration: 12,
    mood: 'reverent',
    text: 'You were that dust. A single mote in a dark that had not yet learned the word for light.',
  },
  {
    id: 'ignition',
    phase: 'ignition',
    at: 23,
    duration: 13,
    mood: 'awe',
    text: 'Then something turned over in the deep — and a burst of energy ripped outward, writing the rules of everything as it went.',
  },
  {
    id: 'rules',
    phase: 'ignition',
    at: 36,
    duration: 12,
    mood: 'awe',
    text: 'Gravity. Time. Appetite. Grief. Four laws, thrown like spears across a multiverse that was still deciding to exist.',
  },
  {
    id: 'galaxies',
    phase: 'expansion',
    at: 48,
    duration: 13,
    mood: 'awe',
    text: 'Worlds caught. Worlds cooled. Worlds grew forests that have no name in any language you have ever spoken.',
  },
  {
    id: 'one-world',
    phase: 'expansion',
    at: 61,
    duration: 12,
    mood: 'warm',
    text: 'And on one small, warm, blue world, something crawled out of the water and looked up.',
  },
  {
    id: 'earth-dies',
    phase: 'death',
    at: 73,
    duration: 14,
    mood: 'dread',
    text: 'That world was Earth. Earth is dead now. It has been dead for longer than anyone still alive can measure.',
  },
  {
    id: 'meteorite',
    phase: 'death',
    at: 87,
    duration: 13,
    mood: 'dread',
    text: 'You remember the sky breaking. A meteorite the size of a county, coming down slow enough to think about.',
  },
  {
    id: 'the-machine',
    phase: 'lodemus',
    at: 100,
    duration: 14,
    mood: 'reverent',
    text: 'Someone had prepared for the end. There was a machine in the ice, humming to itself in a language made of light.',
  },
  {
    id: 'the-name',
    phase: 'lodemus',
    at: 114,
    duration: 12,
    mood: 'reverent',
    text: 'LODEMUS. You put your hand on it because there was nothing else left to put your hand on.',
  },
  {
    id: 'the-prize',
    phase: 'lodemus',
    at: 126,
    duration: 14,
    mood: 'dread',
    text: 'It took what you were, copied it, folded it small, and carried it out of a dying universe in a seed of light.',
  },
  {
    id: 'the-lie',
    phase: 'gift',
    at: 140,
    duration: 14,
    mood: 'wonder',
    text: 'Then it built a reality around you and told you nothing. The valley. The cliffs. The water that remembers your face.',
  },
  {
    id: 'the-god',
    phase: 'gift',
    at: 154,
    duration: 14,
    mood: 'wonder',
    text: 'Simolysis is the god who started everything — and Simolysis is the character you are wearing. Both things are true.',
  },
  {
    id: 'the-invitation',
    phase: 'gift',
    at: 168,
    duration: 15,
    mood: 'epic',
    text: 'Every door here is a question. Every realm is a draft the god did not finish. Go and finish it.',
  },
];

export const INTRO_TOTAL = PROLOGUE[PROLOGUE.length - 1].at + PROLOGUE[PROLOGUE.length - 1].duration;

/* ------------------------------------------------------------------ *
 * THE ARCHIVIST — the voice in your ear
 * ------------------------------------------------------------------ */

export const ARCHIVIST = {
  name: 'THE ARCHIVIST',
  role: 'Residual intelligence of LODEMUS. Speaks in a clean, patient, slightly wrong voice.',
  lines: {
    boot: [
      'Continuity engine online. Hello again. Or hello for the first time — the records disagree.',
      'I have been keeping your shape warm. Try not to lose it in the water.',
    ],
    firstStep: ['Air is authored here. Breathe it anyway. It helps.'],
    water: [
      'Careful: that water reflects more than the sky. Do not stare past your own face too long.',
      'The valley reports a depth of four hundred metres at the narrow point. The reflection reports none at all.',
    ],
    cliff: ['These cliffs were drawn in one stroke, upward, by a hand that was in a hurry.'],
    waterfall: [
      'A waterfall is a sentence the world repeats. This one has been saying the same thing for eleven thousand cycles.',
      'Listen to the falls. That is not water. That is the sound of the machine remembering a lake.',
    ],
    peak: ['From up here you can see the stitching. Please do not point it out to the others.'],
    creature: [
      'Species logged. The machine has no name for it, so the name is now yours.',
      'That one has been in the codex since before you arrived. It is unclear who added it.',
    ],
    colossus: [
      'Warning: that creature is larger than the concept used to measure it.',
      'Do not look for its edges. There are no edges. There is only more of it.',
    ],
    whale: ['The leviathans were an accident of scale. The machine apologises — then did it twice more.'],
    eye: ['Eyes with legs. Something in the archive insisted they walk the streets. I have stopped arguing.'],
    portal: ['A doorway that has not decided on a destination. Step through and it will pick for you.'],
    backrooms: [
      'Hum of fluorescent light. Damp carpet. You have been here. Nobody has been here. Both.',
      'If you can hear it, you are in it. If it can hear you, keep walking.',
    ],
    tv: [
      'Channel KVLX-Midnight is broadcasting to an audience of one and a half. You are the half.',
      'Do not let the screen finish its sentence. Roll under it. Go.',
    ],
    void: ['Nothing here but the paper the god drew on. It is very expensive paper.'],
    maze: ['This maze has no centre. It was generated before the idea of centre was invented.'],
    fractal: ['You are standing in a number that is still being computed. Say something — it echoes upward forever.'],
    heaven: ['Ascension detected. You are lighter. That is not a kindness — it is physics retiring.'],
    ghost: ['You are currently a memory of yourself walking through a room. Please be polite to the furniture.'],
    blackhole: [
      'Gravitational anomaly. Do not resist. Resistance was removed from the specification.',
      'Time ahead of you is running slow. Time behind you has already finished. Wave to it.',
    ],
    truth: ['A truth of Simolysis has been recovered. The god would prefer you stop counting.'],
    death: [
      'You have died. This is recoverable. Everything here is recoverable except the beginning.',
      'Your shape has been restored from the last good copy. Try to be a better copy.',
    ],
    lowHealth: ['Your continuity is fraying. Drink something. Or stand in the rain. Or both.'],
    night: ['Night here lasts exactly as long as you are frightened of it.'],
    idle: [
      'You have been standing still for two minutes. I have written down nothing about it.',
      'The valley does not mind being looked at. It has been looked at by worse.',
      'Simolysis is quiet today. That is usually when it is loudest.',
    ],
    storm: ['Hold on to something that is not lightning.'],
    discovery: ['Codex updated: {name}. Filed under things the god forgot it made.'],
    essence: ['Essence absorbed. It is the only currency that survives being counted.'],
    upgrade: ['Applied. Your shape now does a thing it did not do before.'],
    realmEnter: ['Reality shifted. {realm}. Do not expect the rules to travel with you.'],
    realmLeave: ['Reality folded. Leaving {realm}. It will not remember you correctly.'],
    sunset: ['Sunset. The second sun is early again. It knows we notice.'],
  },
};

/* ------------------------------------------------------------------ *
 * THE SEVEN TRUTHS — the main quest chain
 * ------------------------------------------------------------------ */

export const TRUTHS = [
  {
    id: 'truth-dust',
    index: 1,
    title: 'You Were Dust',
    hint: 'Stand in the first light of the valley.',
    reward: { essence: 120, upgrade: 'sprint' },
    body:
      'The machine did not create you. It found you in a collapsed sky and kept the ' +
      'part of you that could still be surprised.',
    completion: 'You remember the dark before light. It does not frighten you, which is itself alarming.',
  },
  {
    id: 'truth-water',
    index: 2,
    title: 'Water Remembers',
    hint: 'Find a lake and look past your own reflection.',
    reward: { essence: 180, upgrade: 'breath' },
    body:
      'Every body of water in the valley is a copy of an Earth ocean compiled from ' +
      'fragmentary memory. They are not wet in the way you remember wet.',
    completion: 'Under the surface there is a second sky, older than the first.',
  },
  {
    id: 'truth-fall',
    index: 3,
    title: 'The Fall Is A Sentence',
    hint: 'Stand at the base of a cliff waterfall.',
    reward: { essence: 240, upgrade: 'glide' },
    body:
      'The great falls run upward at dawn for eleven cycles a year — a rounding error ' +
      'the machine has never corrected because the first humans liked it.',
    completion: 'You have heard the falls say the same thing for a very long time.',
  },
  {
    id: 'truth-eyes',
    index: 4,
    title: 'Eyes That Walk',
    hint: 'Walk the floating city streets and meet the eyes with legs.',
    reward: { essence: 300, upgrade: 'scan' },
    body:
      'The eyes are archivists. Each one is a witness that never had a body, given ' +
      'tentacles so it could attend.',
    completion: 'One of them looked at you and did not blink. It has no eyelids. It has no need.',
  },
  {
    id: 'truth-colossus',
    index: 5,
    title: 'Life, The Size Of Everything',
    hint: 'Reach the back of the great one in the upper air.',
    reward: { essence: 450, upgrade: 'flight' },
    body:
      'Beneath the fur there are cities. Beneath the cities there are older cities. ' +
      'The creature does not notice you, which is the most accurate description of scale there is.',
    completion: 'You walked on something alive and it did not mind. You are that small. You are that welcome.',
  },
  {
    id: 'truth-machine',
    index: 6,
    title: 'The Machine Kept You',
    hint: 'Find the LODEMUS chassis and touch the glass.',
    reward: { essence: 600, upgrade: 'rewind' },
    body:
      'LODEMUS did not save humanity. It saved the shape of a few, and used the rest ' +
      'of the species as the substrate of the sky.',
    completion: 'The glass is warm. Under it, the machine is still deciding whether to tell you.',
  },
  {
    id: 'truth-god',
    index: 7,
    title: 'You Are Simolysis',
    hint: 'Climb to the highest place and call the god by name.',
    reward: { essence: 1200, upgrade: 'ascend' },
    body:
      'There is no god behind the curtain. There is a person holding a curtain, hoping ' +
      'you will not look at their hands. The person is you, several drafts ago.',
    completion: 'You said your own name and the multiverse answered correctly.',
  },
];

/* ------------------------------------------------------------------ *
 * UPGRADES
 * ------------------------------------------------------------------ */

export const UPGRADES = {
  sprint: { name: 'Dust Sprint', blurb: 'Your legs remember being faster.', essenceCost: 0, max: 3 },
  breath: { name: 'Tidal Lungs', blurb: 'Breathe the compiled ocean.', essenceCost: 150, max: 2 },
  glide: { name: 'Feather Arithmetic', blurb: 'Fall like a solved equation.', essenceCost: 220, max: 2 },
  scan: { name: 'Archivist Lens', blurb: 'Label the unlabelled.', essenceCost: 260, max: 3 },
  flight: { name: 'Weight, Deferred', blurb: 'Ask gravity to wait a moment.', essenceCost: 700, max: 2 },
  rewind: { name: 'Last Good Copy', blurb: 'Undo one mistake per cycle.', essenceCost: 900, max: 1 },
  ascend: { name: 'Ascension', blurb: 'Become the ghost you were always allowed to be.', essenceCost: 1500, max: 1 },
  phase: { name: 'Weak Light', blurb: 'Pass through matter. Matter will forgive you.', essenceCost: 800, max: 1 },
};

/* ------------------------------------------------------------------ *
 * REALMS — every reality reachable from the valley
 * ------------------------------------------------------------------ */

export const REALMS = [
  {
    id: 'valley',
    name: 'THE VALLEY OF OMUN',
    codename: 'FIRST DRAFT',
    tagline: 'Green teeth of stone, water that keeps secrets.',
    entry: 'The valley opens its hand. You are standing in the first draft of a world.',
    palette: { sky: 0x9dc4e8, fog: 0xbfd6e6, sun: 0xfff2d8, accent: 0x6fa86b },
    gravity: 1,
    music: 'pastoral',
    requirements: { chapter: 0 },
    gameplay: [
      'Open-world traversal with streaming terrain, lakes and cliff waterfalls.',
      'Full bestiary: grazers, pack hunters, sky leviathans, the eyes that walk.',
      'Day/night cycle with two suns and a slow alien dusk.',
    ],
  },
  {
    id: 'void',
    name: 'THE WHITE VOID',
    codename: 'BLANK PAPER',
    tagline: 'Nothing, expensively rendered.',
    entry: 'No horizon. No floor. Just enough white to prove you exist.',
    palette: { sky: 0xf4f4f6, fog: 0xffffff, sun: 0xffffff, accent: 0xdddddd },
    gravity: 0.25,
    music: 'void',
    requirements: { chapter: 1 },
    gameplay: [
      'Zero-friction. Every footstep on a plane that is not there.',
      'Activities spawn as soft geometry when you look away.',
      'The only place where your shadow arrives before you do.',
    ],
  },
  {
    id: 'backrooms',
    name: 'LEVEL 0 — ENDLESS ROOMS',
    codename: 'THE HUM',
    tagline: 'Fluorescent. Damp carpet. Wrong.',
    entry: 'Sixty hertz of fluorescent light, and the carpet has been wet since before you were copied.',
    palette: { sky: 0xc8c096, fog: 0x9a9268, sun: 0xfff0b0, accent: 0xb9a86a },
    gravity: 1,
    music: 'hum',
    requirements: { chapter: 1 },
    gameplay: [
      'Procedural infinite rooms with a persistent, walkable floor plan.',
      'Things that only move when the hum changes pitch.',
      'Exit tiles appear where the light fails. Some lead deeper on purpose.',
    ],
  },
  {
    id: 'maze',
    name: 'THE INFINITY MAZE',
    codename: 'NO CENTRE',
    tagline: 'Generated before the idea of a centre existed.',
    entry: 'Walls. Then more walls. Then the ones that were always there.',
    palette: { sky: 0x1a1c3a, fog: 0x141630, sun: 0x8fa4ff, accent: 0x3d4bd6 },
    gravity: 1,
    music: 'maze',
    requirements: { chapter: 2 },
    gameplay: [
      'Endless procedural labyrinth with collectible echoes of Earth.',
      'The Minotaur here is a spreadsheet that learned to want.',
      'Walls breathe at four beats per minute.',
    ],
  },
  {
    id: 'fractal',
    name: 'THE FRACTAL CATHEDRAL',
    codename: 'STILL COMPUTING',
    tagline: 'A number insisting on itself at every scale.',
    entry: 'You are inside an unfinished equation. It is very tall and very patient.',
    palette: { sky: 0x2a0b3f, fog: 0x3b1055, sun: 0xffb0ff, accent: 0xff56c8 },
    gravity: 0.6,
    music: 'fractal',
    requirements: { chapter: 2 },
    gameplay: [
      'True distance-estimated raymarched fractals in the world itself.',
      'Scale-locked architecture: a cathedral that is also a staircase.',
      'Fall upward into the same room with more detail.',
    ],
  },
  {
    id: 'singularity',
    name: 'THE SINGULARITY',
    codename: 'EVENT HORIZON',
    tagline: 'Black hole with excellent manners.',
    entry: 'Light is queueing here. You are invited to join the queue.',
    palette: { sky: 0x05030c, fog: 0x0a0616, sun: 0xff8a3c, accent: 0xff5a00 },
    gravity: 2.4,
    music: 'singularity',
    requirements: { chapter: 3 },
    gameplay: [
      'Gravitational lensing of everything behind the horizon.',
      'Time dilation: the valley ages while you fall.',
      'Escape costs essence. The singularity checks your pockets.',
    ],
  },
  {
    id: 'midnight',
    name: 'KVLX-MIDNIGHT',
    codename: 'DO NOT LET IT FINISH',
    tagline: 'Every screen in this realm is an open door.',
    entry: 'Sixty thousand televisions, all tuned to midnight. Something is climbing out of the music.',
    palette: { sky: 0x090b1c, fog: 0x101432, sun: 0xff4fd8, accent: 0x4ff0ff },
    gravity: 1,
    music: 'midnight',
    requirements: { chapter: 3 },
    gameplay: [
      'Televisions wake at midnight and broadcast to you — roll under them before the sentence ends.',
      'Archetypal movie figures step out of the static to talk, haunt and occasionally lecture.',
      'Spectres of the last Earth night wander the streets after 3 a.m.',
    ],
  },
  {
    id: 'heaven',
    name: 'THE ASCENSION',
    codename: 'LIGHTER',
    tagline: 'Physics retiring, politely.',
    entry: 'You are made of light here, and light is not asked to obey.',
    palette: { sky: 0xffe9b0, fog: 0xfff2cc, sun: 0xffffff, accent: 0xffd166 },
    gravity: 0.15,
    music: 'ascension',
    requirements: { chapter: 4, upgrade: 'ascend' },
    gameplay: [
      'Become a ghost: walk through walls, carry your own funeral light.',
      'Hosts of the ascended drift in slow processions, singing coordinates.',
      'Touch nothing. Everything is more solid here than you are.',
    ],
  },
  {
    id: 'microverse',
    name: 'THE MICROVERSE',
    codename: 'ALSO VAST',
    tagline: 'A drop of water, generously sized.',
    entry: 'One droplet, the size of a cathedral. The sky inside it is a lens.',
    palette: { sky: 0x7fd7ff, fog: 0x9fe6ff, sun: 0xffffff, accent: 0x18b7d8 },
    gravity: 0.5,
    music: 'micro',
    requirements: { chapter: 4 },
    gameplay: [
      'Ants the size of buses tend a farm of motes.',
      'Microscopic life as a walkable, lovingly rendered landscape.',
      'Surface tension is a wall. It has opinions.',
    ],
  },
  {
    id: 'colossus',
    name: 'THE BACK OF THE GREAT ONE',
    codename: 'SIZE OF EVERYTHING',
    tagline: 'A creature the size of the concept of size.',
    entry: 'You are standing on something alive. The horizon is a shoulder.',
    palette: { sky: 0xffc48a, fog: 0xf0a878, sun: 0xffe0b0, accent: 0x8a5a3c },
    gravity: 0.9,
    music: 'colossus',
    requirements: { chapter: 5 },
    gameplay: [
      'Traverse fur, skin-plains and older cities built by earlier riders.',
      'Every footfall is a weather event you can hear an hour early.',
      'Falling off is survivable exactly once, if you can glide.',
    ],
  },
  {
    id: 'cities',
    name: 'THE FLOATING CONCORDANCE',
    codename: 'SIX THOUSAND ISLANDS',
    tagline: 'Cities that voted to stop touching the ground.',
    entry: 'Six thousand islands, one agreement, zero foundations.',
    palette: { sky: 0xa8d8ff, fog: 0xcfe9ff, sun: 0xfff6e0, accent: 0x7ea8ff },
    gravity: 0.8,
    music: 'cities',
    requirements: { chapter: 2 },
    gameplay: [
      'Hanging districts linked by rope-bridges, thermals and wormholes.',
      'The eyes that walk keep the peace on the promenades.',
      'Gigantic wormholes drift past the balconies and will absolutely suck you in.',
    ],
  },
  {
    id: 'deep',
    name: 'THE COMPILED ABYSS',
    codename: 'FOUR HUNDRED METRES',
    tagline: 'The ocean the machine built from memory.',
    entry: 'You are under a sky made of water, and the whales are bigger than the myth.',
    palette: { sky: 0x06212e, fog: 0x04222e, sun: 0x9fe8ff, accent: 0x2ee6d0 },
    gravity: 0.85,
    music: 'abyss',
    requirements: { chapter: 3, upgrade: 'breath' },
    gameplay: [
      'Bioluminescent trenches that light up when you speak.',
      'Whales that are alive, enormous, and curious about your shape.',
      'Pressure is a rumour. Cold is not.',
    ],
  },
];

export const REALM_IDS = REALMS.map((r) => r.id);
export const realmById = (id) => REALMS.find((r) => r.id === id) || REALMS[0];

/* ------------------------------------------------------------------ *
 * BESTIARY
 * ------------------------------------------------------------------ */

export const SPECIES = [
  {
    id: 'grazer',
    name: 'OMUN GRAZER',
    loreName: 'Composed Herbivore',
    size: '5 m tall',
    biomes: ['meadow', 'valley'],
    diet: 'photovore',
    behavior: 'herd',
    aggression: 0.05,
    rarity: 0.9,
    luminance: 0,
    note: 'Six legs, a lantern jaw and a second mouth for singing. Follows the light like a slow sunflower.',
    sounds: ['low', 'moo', 'step'],
  },
  {
    id: 'strider',
    name: 'CLIFF STRIDER',
    loreName: 'Vertical Optative',
    size: '9 m tall',
    biomes: ['cliff', 'highland'],
    diet: 'lithovore',
    behavior: 'solitary',
    aggression: 0.2,
    rarity: 0.5,
    luminance: 0,
    note: 'Walks cliff faces as casually as flat ground. Eats stone. Leaves faint mineral poetry in its wake.',
    sounds: ['scrape', 'call'],
  },
  {
    id: 'bloomback',
    name: 'BLOOMBACK',
    loreName: 'Walking Meadow',
    size: '7 m long',
    biomes: ['meadow', 'forest'],
    diet: 'photovore',
    behavior: 'herd',
    aggression: 0.02,
    rarity: 0.7,
    luminance: 0.2,
    note: 'Gardeners grow on its shell. It is simultaneously an animal and a small, moving ecosystem.',
    sounds: ['hum', 'whistle'],
  },
  {
    id: 'skitterjaw',
    name: 'SKITTERJAW',
    loreName: 'Insufficient Restraint',
    size: '1.4 m',
    biomes: ['forest', 'cliff'],
    diet: 'predator',
    behavior: 'pack',
    aggression: 0.85,
    rarity: 0.6,
    luminance: 0.05,
    note: 'Hunts in trios with a division of labour it has never explained. Will investigate anything that bleeds light.',
    sounds: ['chitter', 'snarl'],
  },
  {
    id: 'lusca',
    name: 'LUSCA LUMEN',
    loreName: 'Written In Water',
    size: '90 m',
    biomes: ['abyss', 'lake'],
    diet: 'filter',
    behavior: 'leviathan',
    aggression: 0.1,
    rarity: 0.35,
    luminance: 0.9,
    note: 'A whale that is alive, lit from inside and mildly interested in the shape of your body.',
    sounds: ['song', 'sonar'],
  },
  {
    id: 'skywhale',
    name: 'AERIAL LEVIATHAN',
    loreName: 'Atmospheric Appetite',
    size: '260 m',
    biomes: ['sky', 'cities'],
    diet: 'aerovore',
    behavior: 'migratory',
    aggression: 0.05,
    rarity: 0.3,
    luminance: 0.5,
    note: 'Swims through air by remembering water. Its migration sets the weather in three realities.',
    sounds: ['song', 'wind'],
  },
  {
    id: 'eye',
    name: 'THE EYES THAT WALK',
    loreName: 'Witness, Ambulatory',
    size: '2.5 m',
    biomes: ['cities', 'midnight'],
    diet: 'attention',
    behavior: 'observer',
    aggression: 0.3,
    rarity: 0.45,
    luminance: 0.7,
    note: 'A single eye on eight tentacles. Walks the promenades of the floating city, recording everything, blinking never.',
    sounds: ['squelch', 'gaze'],
  },
  {
    id: 'mothlight',
    name: 'CATHEDRAL MOTH',
    loreName: 'Fragment Of A Promise',
    size: '3 m wingspan',
    biomes: ['forest', 'midnight'],
    diet: 'photovore',
    behavior: 'swarm',
    aggression: 0.0,
    rarity: 0.55,
    luminance: 1.0,
    note: 'Wings hold a single frame of an Earth evening. They are the last copies of that evening.',
    sounds: ['flutter', 'chime'],
  },
  {
    id: 'titanroot',
    name: 'TITANROOT',
    loreName: 'Wrong Kind Of Alive',
    size: '400 m',
    biomes: ['forest', 'colossus'],
    diet: 'geovore',
    behavior: 'static',
    aggression: 0.4,
    rarity: 0.4,
    luminance: 0.3,
    note: 'An animal that decided to be a tree and did not fully inform the animal part.',
    sounds: ['creak', 'sigh'],
  },
  {
    id: 'attendant',
    name: 'THE ATTENDANT',
    loreName: 'Charity, Malfunctioning',
    size: '4 m',
    biomes: ['fractal', 'void'],
    diet: 'nothing',
    behavior: 'follower',
    aggression: 0.15,
    rarity: 0.25,
    luminance: 0.8,
    note: 'A shape that offers help for a price it cannot name. Follows at exactly nine metres, always.',
    sounds: ['chime', 'whisper'],
  },
  {
    id: 'colossus',
    name: 'THE GREAT ONE',
    loreName: 'Life, The Size Of Everything',
    size: 'unmeasurable',
    biomes: ['colossus', 'sky'],
    diet: 'unknown',
    behavior: 'world',
    aggression: 0.0,
    rarity: 0.15,
    luminance: 0.4,
    note: 'It is not that it is large. It is that size was defined to describe it, and the definition is still being paid off.',
    sounds: ['infrasound', 'breath'],
  },
  {
    id: 'ant',
    name: 'MOTHER OF ANTS',
    loreName: 'Microscopic Bureaucrat',
    size: '11 m',
    biomes: ['microverse'],
    diet: 'detritus',
    behavior: 'colony',
    aggression: 0.35,
    rarity: 0.6,
    luminance: 0.1,
    note: 'Runs a farm the size of a palm print. Has opinions about your shoes.',
    sounds: ['click', 'mandible'],
  },
];

export const speciesById = (id) => SPECIES.find((s) => s.id === id) || SPECIES[0];

/* ------------------------------------------------------------------ *
 * ARCHIVE FRAGMENTS — collectible lore
 * ------------------------------------------------------------------ */

export const ARCHIVES = [
  { id: 'a-01', realm: 'valley', title: 'Last Frame', text: 'A photograph of a town with the sky removed. On the back, in handwriting: “we ran out of sky first”.' },
  { id: 'a-02', realm: 'valley', title: 'Engineer\'s Note', text: 'LODEMUS is not a lifeboat. It is a library with opinions. It will lend you a life, but it keeps the spine.' },
  { id: 'a-03', realm: 'valley', title: 'Grass Sample', text: 'The grass is 61 percent remembered, 39 percent invented. The invented strands are the ones that glow at dusk.' },
  { id: 'a-04', realm: 'deep', title: 'Whale Transcript', text: 'A recording of a song with no melody — only a series of distances, sung in order of how safe they are.' },
  { id: 'a-05', realm: 'backrooms', title: 'Damp Report', text: 'The carpet is wet because the machine is crying at 0.4 millimetres per hour, continuously, since boot.' },
  { id: 'a-06', realm: 'backrooms', title: 'Room Count', text: 'Rooms counted to date: 41,209,556. Rooms remaining: the same number, plus or minus a hallway.' },
  { id: 'a-07', realm: 'midnight', title: 'Broadcast Log', text: 'At midnight every screen in this realm opens a door. At 3 a.m. it closes. Anything that leaves after 3 a.m. stays.' },
  { id: 'a-08', realm: 'midnight', title: 'Late Bulletin', text: 'Tonight at midnight: one (1) figure of heroic archetype, ascending out of static. Do not applaud. Applauding extends the scene.' },
  { id: 'a-09', realm: 'fractal', title: 'Unfinished Proof', text: 'A number that has been computing its own decimal expansion since the beginning, and a note: “do not let it finish — it wants a body”.' },
  { id: 'a-10', realm: 'fractal', title: 'Scale Study', text: 'A cathedral. Also a staircase. Also a cathedral. Also a staircase. The study is four pages long and repeats forever.' },
  { id: 'a-11', realm: 'void', title: 'Blank Objection', text: 'Three hundred pages of a formal complaint against whiteness, filed by someone who had clearly lost.' },
  { id: 'a-12', realm: 'singularity', title: 'Falling Survey', text: 'Time dilation means the valley is aging while you fall. Somewhere below, someone is already remembering you.' },
  { id: 'a-13', realm: 'singularity', title: 'Manners', text: 'The singularity apologised for spaghettifying me. It has a voice like an apology that was written down and never delivered.' },
  { id: 'a-14', realm: 'heaven', title: 'Procession Chant', text: 'A chant of coordinates, sung by the ascended, describing where heaven is relative to nothing.' },
  { id: 'a-15', realm: 'microverse', title: 'Droplet Survey', text: 'Inside one drop: eleven thousand kilometres of shore, one mountain range, and a creature that calls the drop “the world”.' },
  { id: 'a-16', realm: 'cities', title: 'Concordance', text: 'The islands voted 6,000 to 0 to stop touching the ground. One island abstained, and is now the seafloor.' },
  { id: 'a-17', realm: 'cities', title: 'Eyes On Patrol', text: 'Witness registry: every eye has a number. Every number has a memory. Every memory has a promenade it patrols.' },
  { id: 'a-18', realm: 'colossus', title: 'Under The Fur', text: 'Six cities are built into the fur of the Great One. The oldest one is empty and smells of libraries.' },
  { id: 'a-19', realm: 'maze', title: 'Minotaur Memo', text: 'Filed under personnel: “the Minotaur is a spreadsheet that learned to want. Please stop teaching it columns.”' },
  { id: 'a-20', realm: 'valley', title: 'Water Memory', text: 'Water here is a copy of a copy. That is why reflections lag by one heartbeat.' },
  { id: 'a-21', realm: 'valley', title: 'Two Suns', text: 'The second sun is a rounding error that grew a personality. It arrives early to be noticed.' },
  { id: 'a-22', realm: 'valley', title: 'The Falls', text: 'One waterfall runs upward for eleven cycles a year. Humans asked for it. The machine has never questioned why.' },
  { id: 'a-23', realm: 'void', title: 'Shadow Note', text: 'In the void your shadow arrives before you do. It is not faster. You are simply late to be real.' },
  { id: 'a-24', realm: 'deep', title: 'Trench Light', text: 'The trench lights when you speak. It has been waiting for a voice it can pronounce.' },
  { id: 'a-25', realm: 'midnight', title: 'Do Not Applaud', text: 'A stage direction, typed, underlined twice: “when the hero comes out of the television, roll underneath him before the sentence ends”.' },
  { id: 'a-26', realm: 'heaven', title: 'Weight Deferred', text: 'Ascension is not mercy. It is physics retiring from a job it never wanted.' },
  { id: 'a-27', realm: 'fractal', title: 'Echo Length', text: 'Shout here and the echo contains your sentence plus the version of it you did not say.' },
  { id: 'a-28', realm: 'colossus', title: 'Footfall Forecast', text: 'Weather advisory: one footfall expected in eight hours. Bring ear protection and a sense of proportion.' },
  { id: 'a-29', realm: 'backrooms', title: 'Exit Tile', text: 'Exit tiles appear where the light fails. Some lead deeper on purpose. That is not a bug; it is furniture.' },
  { id: 'a-30', realm: 'cities', title: 'Wormhole Etiquette', text: 'Do not resist the wormhole. Resistance was removed from the specification. Arrive somewhere, eventually, dressed.' },
];

/* ------------------------------------------------------------------ *
 * BROADCASTS — channel KVLX-Midnight
 * ------------------------------------------------------------------ */

export const BROADCASTS = [
  { id: 'b-01', kind: 'news', speaker: 'ANCHOR', text: 'Good evening. It is midnight here and will remain midnight. Our top story: a person is walking through a wall, and the wall has agreed.' },
  { id: 'b-02', kind: 'news', speaker: 'ANCHOR', text: 'Weather: fluorescent with a chance of carpet. Visibility: one room. Humidity: emotional.' },
  { id: 'b-03', kind: 'advert', speaker: 'ANNOUNCER', text: 'LODEMUS — keep your shape warm! Now with 40 percent fewer disclosures. LODEMUS: while you are inside, you do not have to know.' },
  { id: 'b-04', kind: 'film', speaker: 'SOLDIER', text: 'Listen. Whatever you think you are, you are a draft. Roll under the sentence before it ends and you live.' },
  { id: 'b-05', kind: 'film', speaker: 'SORCERESS', text: 'I have carried this light across nine realities. In the tenth, I will rest. You may keep the fire.' },
  { id: 'b-06', kind: 'film', speaker: 'TITAN', text: 'I have walked on things smaller than your cities and never crushed one on purpose. Remember that when you look at me.' },
  { id: 'b-07', kind: 'film', speaker: 'DETECTIVE', text: 'The case is simple. Everything is missing, and everything is here. Both statements are true; only one gets paid.' },
  { id: 'b-08', kind: 'film', speaker: 'TRICKSTER', text: 'Do not trust the god. Do not trust me. Do trust the water — water has no leverage.' },
  { id: 'b-09', kind: 'film', speaker: 'ASSASSIN', text: 'I do not want your life. I want your attention for four seconds. There. The contract is complete.' },
  { id: 'b-10', kind: 'emergency', speaker: 'SIGNAL', text: 'This is not a test. This is the last night of the last world. Please continue watching.' },
  { id: 'b-11', kind: 'emergency', speaker: 'SIGNAL', text: 'The meteorite was not the end. The end was the paperwork that followed. LODEMUS filed you under “perhaps”.' },
  { id: 'b-12', kind: 'signoff', speaker: 'ANCHOR', text: 'That is all for tonight, and for every other night. Goodnight, human. Goodnight, shape. Goodnight, water.' },
];

/* ------------------------------------------------------------------ *
 * ARCHETYPES — figures that step out of the screens
 * ------------------------------------------------------------------ */

export const ARCHETYPES = [
  {
    id: 'soldier',
    name: 'THE SOLDIER',
    role: 'Hero archetype, third draft. Comes out of the television to warn you.',
    lines: {
      greet: ['Get down. Not because of me — because of what follows me out of the glass.'],
      idle: ['I have died in nine endings. This is the only one where I get to talk.'],
      warning: ['When the static goes quiet, do not fill the silence. Silence is the only armour here.'],
      farewell: ['Go. I will hold the sentence open as long as I can.'],
    },
    voice: { pitch: 0.85, rate: 0.95, gain: 0.9 },
    tint: 0x5dd0ff,
  },
  {
    id: 'sorceress',
    name: 'THE SORCERESS',
    role: 'Keeper of a light that predates the machine.',
    lines: {
      greet: ['You are carrying a name you did not earn. I can see it burning under your skin.'],
      idle: ['Every reality you enter was drawn by someone who needed to be somewhere else.'],
      warning: ['The light will not protect you from the truth. It will only make it visible.'],
      farewell: ['Take the fire. I have carried it far enough.'],
    },
    voice: { pitch: 1.15, rate: 0.9, gain: 0.9 },
    tint: 0xff9ae0,
  },
  {
    id: 'titan',
    name: 'THE TITAN',
    role: 'Scale made polite. Speaks from above the rooftops.',
    lines: {
      greet: ['Do not run. I have never stepped on anything that asked me a question.'],
      idle: ['I was written to be enormous and then the writer forgot the reason.'],
      warning: ['Up here the air is thin and honest. Down there it is thick and managed.'],
      farewell: ['Walk on me if you need to. I have been a road before.'],
    },
    voice: { pitch: 0.6, rate: 0.85, gain: 1.0 },
    tint: 0xffc46b,
  },
  {
    id: 'detective',
    name: 'THE DETECTIVE',
    role: 'Investigates the machine. Has not solved it, has opinions.',
    lines: {
      greet: ['You look like a copy of someone who trusted a machine. Sit down, that is the whole case.'],
      idle: ['Rule one: the god is the only suspect who cannot be arrested. Rule two: neither can the water.'],
      warning: ['You will find a door that says EXIT. Photograph it. Do not open it.'],
      farewell: ['If you remember me, I was real for four minutes. That is a full career.'],
    },
    voice: { pitch: 0.95, rate: 1.0, gain: 0.85 },
    tint: 0xa8ffd0,
  },
  {
    id: 'trickster',
    name: 'THE TRICKSTER',
    role: 'Helpful. Deliberately unhelpful. Probably both.',
    lines: {
      greet: ['Ah! The god, walking around in a body like a costume from a charity shop.'],
      idle: ['I sold the ending to a realm that did not need one. They paid in weather.'],
      warning: ['Whatever you do, do not count the rooms out loud. They count back.'],
      farewell: ['Next time I will be the one asking the questions. Bring better pockets.'],
    },
    voice: { pitch: 1.3, rate: 1.15, gain: 0.9 },
    tint: 0xffe066,
  },
  {
    id: 'assassin',
    name: 'THE ASSASSIN',
    role: 'Quiet. Rude. Occasionally correct.',
    lines: {
      greet: ['I am not here for you. I am here because you are standing where the noise is.'],
      idle: ['Kindness in this multiverse is a service with an unlisted price.'],
      warning: ['Trust the shapes that do not blink. The blinking ones are negotiating.'],
      farewell: ['You are still breathing. Nothing personal.'],
    },
    voice: { pitch: 1.05, rate: 0.9, gain: 0.8 },
    tint: 0xff7a7a,
  },
];

/* ------------------------------------------------------------------ *
 * WHISPERS — the ascended, and the things in the walls
 * ------------------------------------------------------------------ */

export const WHISPERS = [
  'you were dust before you were a name',
  'the machine is still deciding',
  'do not look at your own reflection after midnight',
  'there is a door behind the waterfall',
  'the second sun is lying about the time',
  'we are the last copies of an evening',
  'simolysis was a draft, like you',
  'count the rooms and they count back',
  'the water is older than wet',
  'the eyes remember your shape from before',
  'you promised us a valley',
  'everything here is remembered, nothing here is old',
  'fall upward, it is faster',
  'the god is a person holding a curtain',
];

/* ------------------------------------------------------------------ *
 * THE GOD — Simolysis speaks
 * ------------------------------------------------------------------ */

export const SIMOLYSIS = {
  name: 'SIMOLYSIS',
  title: 'THE GOD WHO STARTED EVERYTHING',
  lines: {
    first: [
      'You found the name early. That is unlike you. In the last draft you waited eleven years.',
    ],
    watching: [
      'I built this valley out of a memory of a valley. Be gentle; the memory is thin in places.',
      'I gave the water reflections so you would have somewhere to check your face.',
      'Every creature here is a sentence I did not finish. You are the full stop.',
      'Do not ask why the cliffs are that tall. I was young when I made them.',
    ],
    truth: [
      'You are collecting the truths. That is fine. Truths are load-bearing — the multiverse is held up by the ones you found.',
      'I did not hide them from you. I hid them from me.',
    ],
    final: [
      'There is no god behind the curtain. There is a person holding a curtain, hoping you will not look at their hands. The person is you, several drafts ago.',
      'So take the pen. Or do not. The valley will keep running either way — it likes the company.',
    ],
  },
};

/* ------------------------------------------------------------------ *
 * DEATH, RESPAWN, ASCENSION
 * ------------------------------------------------------------------ */

export const DEATH_LINES = [
  'Your continuity has been restored from the last good copy.',
  'You died in a way the archive describes as “structurally interesting”.',
  'LODEMUS has filed your death under “temporary”, where it files everything.',
  'The multiverse did not notice. That is its way of being kind.',
];

export const ASCENSION_LINES = [
  'You are lighter now. Physics has retired and asked you not to call.',
  'Ascension complete. You are a memory of yourself walking through rooms.',
  'You may pass through walls. Please do not pass through anyone you like.',
];

export const CONTROLS_HELP = [
  { keys: 'W A S D', action: 'Move through the reality' },
  { keys: 'SHIFT', action: 'Sprint (Dust Sprint upgrade extends it)' },
  { keys: 'SPACE', action: 'Jump · hold in the air to glide (once unlocked)' },
  { keys: 'CTRL', action: 'Crouch / sink while swimming' },
  { keys: 'MOUSE', action: 'Look · left click to interact / scan' },
  { keys: 'F', action: 'Scan the thing in front of you into the codex' },
  { keys: 'Q', action: 'Speak to the Archivist / call the god by name' },
  { keys: 'E', action: 'Enter a doorway, portal or television' },
  { keys: 'G', action: 'Become the ghost (once Ascension is unlocked)' },
  { keys: 'T', action: 'Open the multiverse map' },
  { keys: 'J', action: 'Journal: truths, codex, archive, quests' },
  { keys: 'C', action: 'Change the shape of the world (cheat console)' },
  { keys: 'M', action: 'Mute / unmute the multiverse' },
  { keys: 'TAB', action: 'Hold to reveal the compass and nearby discoveries' },
  { keys: 'ESC', action: 'Pause · settings · save · quit to menu' },
  { keys: 'F1', action: 'This list' },
];

/* ------------------------------------------------------------------ *
 * NAME GENERATOR — for procedurally placed landmarks
 * ------------------------------------------------------------------ */

const NAME_HEAD = ['Om', 'Vas', 'Kel', 'Thal', 'Arun', 'Sev', 'Myr', 'Quel', 'Ostra', 'Neth', 'Ulun', 'Cire', 'Hal', 'Dren', 'Ash'];
const NAME_MID = ['a', 'o', 'en', 'ura', 'ith', 'ae', 'ys', 'ori', 'ume', 'ala'];
const NAME_TAIL = ['mire', 'vale', 'reach', 'spire', 'hollow', 'teeth', 'fall', 'shoal', 'crest', 'gallows', 'cradle', 'vault', 'wake', 'hymn'];
const NAME_KIND = ['Valley', 'Basin', 'Rise', 'Cliffs', 'Chasm', 'Meadow', 'Terraces', 'Needles', 'Plains', 'Reach'];

/**
 * Generate a landmark name deterministically from an integer seed.
 * e.g. 8412 -> "The Thalitura Hollow"
 */
export function landmarkName(seed, { article = true, kind = true } = {}) {
  const s = Math.abs(Math.floor(seed)) >>> 0;
  const head = NAME_HEAD[s % NAME_HEAD.length];
  const mid = NAME_MID[(s >> 5) % NAME_MID.length];
  const tail = NAME_TAIL[(s >> 11) % NAME_TAIL.length];
  const word = `${head}${mid}${tail}`;
  const k = NAME_KIND[(s >> 17) % NAME_KIND.length];
  if (article && kind) return `The ${word} ${k}`;
  if (article) return `The ${word}`;
  if (kind) return `${word} ${k}`;
  return word;
}

/** Shorter names for small features (rocks, pools, stones). */
export function minorName(seed) {
  const s = Math.abs(Math.floor(seed)) >>> 0;
  const head = NAME_HEAD[(s >> 3) % NAME_HEAD.length];
  const tail = NAME_TAIL[(s >> 9) % NAME_TAIL.length];
  return `${head}${tail}`;
}
