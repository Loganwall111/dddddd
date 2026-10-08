# Features, mapped

Every concept requested for Chapter One, and where it actually lives in the code. This is the
document to read if you want to know whether something is real, where it is, and how it works.

## The twenty anomalies

| # | Requested | Implemented by | Notes |
|---|---|---|---|
| 1 | Reality Tear, grows over days, other world visible through it, things come through | `RiftEngine`, `entity/RiftEntity`, `client/render/RiftRenderer`, `shaders/core/rift.*` | The tear is an entity for persistence and light-passthrough, and drawn as a lens, never as a block. Six destination variants, each with its own palette in the shader. |
| 2 | World Beneath the World, six layers | `BtlDimensions.SUBSTRATA` + `data/beyondthelimits/dimension/substrata.json` | The six layers are stacked in one column in the datapack (abandoned structures → industrial tunnels → black void → white maze → second overworld → what holds it together) and the descent is driven by `CollisionEngine`/`ImpossibleEngine`. |
| 3 | The Observer, distant, vanishes when looked at, appears in bases and reflections | `ObserverEngine`, `entity/ObserverEntity`, `client/render/entity/BtlShadowRenderer` | Presence accumulates per player across sessions (`BtlState.observerLevels`); the renderer's alpha *falls* as you look at the entity, so it is never inspectable. |
| 4 | World Collision: Nether/End terrain merging in | `CollisionEngine`, `MutationEngine` | Stage 0-100; each stage swaps in specific Nether/End blocks and permanently stamps them into the terrain. |
| 5 | Infinite Structure: house in a house, looping halls, copies of you | `ImpossibleEngine`, `entity/MemoryEchoEntity` | Impossible blocks are placed by the engine and recognised by tag; the geometry itself loops because the generator places rooms recursively. |
| 6 | Fog Dimension: 10-20 block visibility, moving shapes, brief reveals | `BtlDimensions.FOGLANDS`, `client/render/FogDirector`, sky mode 6 | Fog is enforced at 2-9% of view distance; `entity/FogShadeEntity` and `FogWalkerEntity` only resolve inside it. |
| 7 | The Wrong Minecraft: wrong textures, impossible villages, backwards music, broken coordinates | `BtlDimensions.WRONGWORLD`, sky mode 11, `MutationEngine` | A whole dimension built one degree off, with a flat generator whose layers are deliberately in the wrong order. |
| 8 | Time Infection: past/present/future zones, mobs aging to ruin | `TemporalEngine` | `describeZone`/`spawnHeight` partition the world; offworld kills feed dimensional gravity. |
| 9 | The Sky Is Fake: cracks spread, another world behind, sky falls apart | `SkyEvents` (+`ServerWorldMixin`), sky mode 1 | Cracks are counted in `BtlState.skyCrack`; the shader draws the real sky underneath and opens gaps into a violet sky with reversed star rotation. |
| 10 | Evolutionary Mobs: zombies/skeletons/spiders/creepers/endermen learn and adapt | `EvolutionEngine` | Per-family stages, equipment upgrades, group behaviour near leaders, and a kill that evolves the survivors. |
| 11 | Mirror World: reflection acts first, step through, own civilization | `MirrorEngine`, `BtlDimensions.MIRRORWORLD`, `entity/MirrorDoubleEntity` | Gazes are tracked; reflections spawn and can be swapped with you; the dimension has its own structures and villages. |
| 12 | The Chunk That Moves: living chunk fleeing something | `MovingChunkEngine` | Tracks an X/Z position, a panic value and a trail across the world; the chunk physically relocates terrain as it flees. |
| 13 | The Bleeding World: particles → fluids → veins → mutations → bleed-through | `MutationEngine`, `BleedingVeinBlock`, `BleedPoolBlock`, `BtlParticles.BLEED_DRIP` | Five kinds of mutation, rolled per event, stamped permanently. |
| 14 | Civilization That Wasn't There: ruins/statues/underground cities appearing each sleep | `LostCivilizationEngine` (+`AncientStatueBlock`, `AncientTabletItem`) | Advances one stage per sleep; statues hand out fragments of lore; tablets reward progress. |
| 15 | The Signal: `[UNKNOWN TRANSMISSION]` → buried machine → coordinates pointing at you | `SignalEngine`, `SignalMachineBlock`, `SignalMachineBlockEntity`, `SignalReceiverItem` | The reading resolves into coordinates, and the coordinates resolve into your own position. |
| 16 | Impossible Biome: 100-block trees, floating rivers, giant insects, black grass/white leaves, gravity anomalies, reactive | `BtlDimensions.THE_IMPOSSIBLE`, `ImpossibleEngine`, `GiantInsectEntity` | Has its own sky mode, its own blocks, and reacts to what the player does in it. |
| 17 | Reality Difficulty: 100 → 80 → 60 → 40 → 20 → 5 → 0 | `RealityEngine`, `BtlConfig.REALITY_*`, `ClientState` bands | The HUD reads it live; below 60% fog closes in, below 40% the journal starts to tear; the sky loses saturation continuously. |
| 18 | The Black Sun: black sphere replaces the sun, world darkens daily, it is an entity approaching | `BlackSunEngine`, `entity/BlackSunEntity`, `client/render/entity/BtlSphereRenderer` | A real entity with a rim-lit sphere renderer, a grace period, and a stage that advances daily. |
| 19 | Dimensional Storms: transparency, random structures, gravity glitches, spontaneous portals, rift lightning, other dimensions visible, cross-dimension spawns, permanent terrain change | `StormEngine`, `StormBeaconItem`, sky mode 2 | Ends by stamping permanent changes into the terrain. |
| 20 | The Last Chunk: far coordinate with a recreation of your history and a copy of you | `LastChunkEngine`, `MemoryRecorder` | Replays recorded memory steps into a monument containing a copy of the player. |

## Dimensional gravity and the butterfly effect

| Requested | Implemented by |
|---|---|
| Any change in a dimension alters the whole Overworld | `GravityEngine` — offworld block breaks and kills accrue debt per player |
| Returning after more than two Minecraft days produces procedural events | `BtlConfig.GRAVITY_RETURN_DAYS`, `GravityEngine.onReturnedHome` |
| Villagers with too much blood; living roots; "anime characters" walking the earth; a house gone and replaced by a giant pyramid; bloody lakes; a cosmic black hole eating blocks; tubes sucking people in | `MutationEngine` — each is its own mutation kind, and the mutation text is chosen by seed, so no two returns repeat |
| Effectively unlimited, every return different | Seeds derive from the world's own history (debt, mutations, ticks, position), not from a fixed list |

## Corrupted Land, dementia and the Backrooms

| Requested | Implemented by |
|---|---|
| Reachable via a **seamless portal** | `world/BtlPortal` — the crossing is a volume plus a lens, never a block frame |
| Special grass | `CorruptedGrassBlock` (spreads, and can be broken through) |
| Staying too long in dimensions → dementia → the Overworld corrupts on return | `DementiaEngine`, `BtlStatusEffects.DEMENTIA`, `BtlStatusEffects.DIMENSIONAL_GRAVITY` |
| Falling through corrupted grass → drop into the Backrooms | `CorruptedGrassBlock` + `world/gen/BackroomsChunkGenerator` + `BackroomsEngine.enterViaNoclip` |
| Procedural maze: strange stairs → pool rooms, hunting entities, endless stores, glitchy environments, enormous cities, nonsensical structures | `BackroomsChunkGenerator` (five room archetypes plus vertical stacking and the pool descent) |
| **Exactly three entries**: the warehouse rift, the fall, and `/teleport backrooms` | `RiftEntity.createBackroomsGate`, `BackroomsEngine.enterViaNoclipDevice`, `mixin/TeleportCommandMixin` |
| A guidebook on first spawn, directing the player to the City and the warehouse | `LoreEngine.giveStartingGuide`, `world/BtlWorldEvents`, `client/screen/GuidebookScreen` |
| The City at a seed-based location, with stories and buildings | `CityGenerator` — grid streets, blocks, warehouses, stories per district |

## Presentation, 4th wall and dimensions

| Requested | Where |
|---|---|
| GLSL shaders | `assets/beyondthelimits/shaders/core/{rift,sky_warp,screen_glitch,scan}.*` + `client/shader/BtlShaders` |
| Dynamic animated skyboxes | `client/render/SkyRenderer` + `sky_warp.fsh` (eleven modes) |
| A dimension that is only an animated skybox, with no terrain effect | `BtlDimensions.CODESCAPE` (`has_skylight: false`, no terrain: `CodescapeChunkGenerator` places floating monoliths over nothing, sky mode 7) |
| Gravitational lensing / sky warping | `btlLens` in `sky_warp.fsh`, applied to the Black Sun, the sky cracks, world collision and the Impossible |
| Realistic explosions, smoke and water physics | `ExplosionEngine` (fallout, shockwave, warhead) + `BleedPoolBlock` fluid spread + the three smoke/ash particle types |
| Nuclear reactions | `RealityWarheadItem` + `ExplosionEngine.detonateWarhead` |
| Fourth wall: rifts in space and time, jumping into Mojang servers, the Code Verse | `SignalEngine.openCodeVerse`, `BtlDimensions.CODESCAPE`, `client/screen/CodeVerseScreen`, `CodeMonolithBlock` |
| No cheap tricks | Nothing here is a particle swap or a shader toy: every anomaly is a state machine saved with the world, and every visual is generated rather than pasted |

## Extras beyond the brief

- **A storm beacon** that calls a dimensional storm onto your own coordinates.
- **The Void Lens**, which shows you things that are actually there but not rendered.
- **The Reality Warhead**, which damages reality itself rather than the terrain.
- **Noclip Device** — deliberate, controlled falling out of the world.
- **Memory Shards** — carry a piece of a place with you and put it back later.
- **The Dimensional Gauge** — real-time readout of which dimension is currently leaning on you.
