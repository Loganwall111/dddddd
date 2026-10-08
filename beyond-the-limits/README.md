# Beyond the Limits — Chapter One: The Never Ending World

> Minecraft stops being Minecraft.

Something in the world has been revised. It starts with a hairline: a place where the air does not
agree with itself. Then the sky develops cracks, the mobs begin to learn, the ground starts to bleed,
and a surveyor's journal you were handed on your first day turns out to have been written by someone
who is no longer surveying.

**Beyond the Limits** is a reality-collapse survival experience for Minecraft 1.21.1. It is not a
dimension mod with a portal frame. There is no rift block. Rifts are *lenses* — animated GLSL
geometry that bends the sky around itself — and the world's own integrity is a number that falls
whether or not you are watching it.

---

## What is in Chapter One

### Twenty anomalies, all live

| # | Anomaly | How it behaves |
|---|---|---|
| 1 | **Reality Tear** | Grows over days. Another world is visible through it. Things come through. |
| 2 | **World Beneath the World** | Six layers under bedrock: abandoned structures → industrial tunnels → black void → a giant white maze → a second overworld → whatever is holding Minecraft together. |
| 3 | **The Observer** | Distant. Vanishes when looked at. Follows you for weeks. Appears in your base, and in reflections. |
| 4 | **World Collision** | Nether and End terrain merging into the Overworld, permanently. |
| 5 | **Infinite Structure** | A house inside a house, looping halls, and copies of you. |
| 6 | **Fog Dimension** | Ten to twenty blocks of visibility. Moving shapes. Brief reveals. |
| 7 | **The Wrong Minecraft** | A subtly corrupted parallel world: wrong textures, impossible villages, backwards music, coordinates that do not add up. |
| 8 | **Time Infection** | Past, present and future zones in one world. Mobs age into ruin as you watch. |
| 9 | **The Sky Is Fake** | Cracks spread across the sky, another world shows behind it, and eventually it falls apart. |
| 10 | **Evolutionary Mobs** | Zombies, skeletons, spiders, creepers and endermen learn from every encounter and adapt. |
| 11 | **Mirror World** | Your reflection acts first. Step through and find a civilization it built. |
| 12 | **The Chunk That Moves** | A living chunk of terrain, fleeing something, with you standing on it. |
| 13 | **The Bleeding World** | Black particles → leaking fluids → black veins → mutations → the Overworld bleeding into another dimension. |
| 14 | **The Civilization That Wasn't There** | Ruins, maps and statues appear every time you sleep. The world is rebuilding a civilization it lost. |
| 15 | **The Signal** | `[UNKNOWN TRANSMISSION]` → a buried machine → coordinates that point at your own location. |
| 16 | **Impossible Biome** | Hundred-block trees, floating rivers, giant insects, black grass, white leaves, gravity anomalies — and it reacts to how you behave in it. |
| 17 | **Reality Difficulty** | 100% → flickering → distorted → gravity failing → chunks joining → impossible geometry → a different game-reality at 0%. |
| 18 | **The Black Sun** | A black sphere replaces the sun. The world darkens daily. It is approaching, and it is an entity. |
| 19 | **Dimensional Storms** | Transparency, spontaneous structures, gravity glitches, rift lightning, other dimensions visible through the weather, cross-dimension spawns, permanent terrain change. |
| 20 | **The Last Chunk** | A far coordinate containing a perfect reconstruction of everywhere you have ever been, still being built, with a copy of you in it. |

### The systems underneath them

**Dimensional gravity (the butterfly effect).** Every change you make in another dimension alters the
Overworld. Leave and come back after more than two Minecraft days and the return is procedurally
generated: villagers with too much blood, roots that are alive, a house that is gone and replaced by
a pyramid, lakes of something that is not water, a black hole eating the terrain, tubes in the ground
that take people. No two returns are the same, because the generator is seeded from the world's own
history rather than from a list.

**Corrupted Land.** Reachable through a seamless portal (never a block frame). Staying too long in
any dimension accumulates dementia; dementia follows you home and the Overworld starts to corrupt.
Fall through corrupted ground and you drop into the Backrooms, with no way back that you can see.

**The Backrooms.** A procedurally generated maze: strange stairs down to pool rooms, entities that
hunt, endless stores, glitchy environments, enormous cities, structures that do not resolve. Exactly
three ways in:

1. The giant see-through animated rift inside the **Abandoned Warehouse** at the centre of the City —
   the City is at a seed-based location and is found through the journal. It has stories and buildings
   of its own.
2. Falling through corrupted ground (or no-clipping after dementia).
3. `/teleport backrooms`.

**The fourth wall.** Rifts tear in space and time; there is a dimension whose terrain *is* Minecraft's
own source code; and the Code Verse terminal shows you the real classes the world is built from,
in the real packages, with the real inheritance. Nothing about it is a joke. That is the point.

### Presentation

- **Custom GLSL core shaders** — `rift`, `sky_warp`, `screen_glitch` and `scan`, shipped inside the
  jar and registered through Fabric's core shader API. No resource pack required.
- **A procedural sky** — stars, clouds, sun and horizon are generated from the view direction in a
  fragment shader, which is what allows *gravitational lensing*: the sky is resampled through a warp
  around a mass, so the stars genuinely bend around a rift or the Black Sun.
- **Eleven sky modes** — one per anomaly and one per dimension, including a dimension that is only an
  animated skybox with no terrain effect at all.
- **Screen-space interference** — the glitch/dementia pass, the scanner, the memory wash.
- **Ten custom particle types** driven by one parametric particle.
- **Twenty-three synthesised sounds**, generated from oscillators and shaped noise.

---

## Requirements

| | |
|---|---|
| Minecraft | 1.21.1 |
| Fabric Loader | 0.16.14 or newer |
| Fabric API | 0.116.17+1.21.1 (any 1.21.1 build) |
| Java | 21 |
| Optional | Iris or Sodium (suggested, not required) |

## Installing

Drop the built jar into `.minecraft/mods` alongside Fabric API. Nothing else is needed — all the
assets, data, dimensions, textures and sounds are inside the jar.

## Controls

| Key | Action |
|---|---|
| `G` | Open the Surveyor's Guide |
| `B` | Reality Scanner sweep |
| `H` | Toggle the reality readout |

## Commands

```
/beyondthelimits status              — report reality, collision, sky, rifts, signal
/beyondthelimits reality <0-100>     — set reality integrity
/beyondthelimits rift [dimension]    — open a rift at your position
/beyondthelimits storm <intensity>   — begin a dimensional storm
/beyondthelimits city                — locate the City and its warehouse
/beyondthelimits blacksun [stage]    — advance the Black Sun
/beyondthelimits signal              — take a reading
/beyondthelimits evolve <family>     — advance a mob family
/beyondthelimits guide               — get the journal back
/beyondthelimits dimension <id>      — travel to a dimension
/backrooms  /btl                     — aliases
```

## Building from source

```bash
cd beyond-the-limits
./gradlew build          # jar lands in build/libs/
```

The mod is built against the versions pinned in `gradle.properties`: Minecraft 1.21.1, Yarn
`1.21.1+build.3`, Fabric Loader 0.16.14, Fabric API 0.116.17+1.21.1, Loom 1.9.2, Gradle 8.12, Java 21.
A GitHub Actions workflow (`.github/workflows/build.yml`) compiles every push.

## Regenerating the assets

Nothing in this repository is a hand-edited binary. Textures, models, blockstates, loot tables,
dimensions, biomes and all twenty-three sound effects are generated by scripts, so they can be
reviewed, diffed and rebuilt:

```bash
python3 tools/gen_textures.py     # 102 textures + the 128x128 mod icon
python3 tools/gen_models.py       # blockstates, block models, item models, effect textures
python3 tools/gen_datapack.py     # 7 dimensions, 7 dimension types, 7 biomes, 36 loot tables, tags
python3 tools/gen_lang.py         # 258 language keys, including all of the journal's prose
python3 tools/gen_sounds.py       # 23 Ogg Vorbis sounds (needs numpy + soundfile)
```

`tools/syn.js` parses every Java source as a syntax check, and `tools/yarn_index.py` looks up
symbols and descriptors against the real 1.21.1 Yarn mappings.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the simulation, the client and the data fit together
- [`docs/FEATURES.md`](docs/FEATURES.md) — every requested concept mapped to where it is implemented
- [`docs/BUILD.md`](docs/BUILD.md) — building, running, testing and troubleshooting

## Licence

MIT. See [`LICENSE`](LICENSE).
