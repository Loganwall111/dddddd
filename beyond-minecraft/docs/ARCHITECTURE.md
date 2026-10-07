# Architecture

## 1. Authoring boundary

`tools/generate_multiverse.py` → `src/main/generated` → `RealmCatalog` → static registries.
Default catalog: **12 realms / 60 blocks / 78 items**, 530 generated resources. Textures, block and
item models, blockstates, loot tables, recipes, biomes, noise settings, placed features, spawners
and animated crystal metadata all come from that one catalog. No Python interpreter, external
process or registry mutation runs on a player's computer; the generator is deterministic, bounded
(≤ 32 realms) and byte-checked by `--check` and by `validate.py`.

Runtime generation is a different thing and is unbounded: the three custom chunk generators are
closed-form functions of the coordinates, so a realm has no finite edge and no per-block storage
growth.

## 2. Server boundary

`RealityManager` owns transient anomalies. Item use, commands or a horizon crossing create an
anomaly only after server validation (world border, chunk loaded, clear volume, per-world and
per-player budgets, travel cooldown). Clients receive at most **six** immutable snapshots, encoded
and validated on both sides (`RealityPayload.Node` rejects non-finite coordinates, radii outside
0.25–512, unknown kinds, ages beyond lifetime). No C2S spawn API exists.

Subsystems, each with its own file and its own budget:

| System | Responsibility | Hard limits |
|---|---|---|
| `SkyWells` | one persistent **prime** well per root world (and per realm if enabled), anchored to spawn at build-limit height, fed by particles | 1 well per world, radius ≤ `maxNodeRadius` |
| `Suction` | softened inverse-square pull on living entities, items and falling blocks; tidal damage inside the inner reach; horizon consumption; tornado of real blocks; horizon devouring (the sky well included) | ≤128 entities/well/tick, ≤4000 torn blocks (×4 for the prime well), ≤24 blocks/tick, no block entities/fluids/bedrock/barriers |
| `Tunnels` | wormhole flight: the walker is carried along a curved path for a bounded run while the client paints the tunnel; **no blocks are placed at all** | fixed 52-block run, zero block writes, cancels on disconnect/shutdown |
| `Umbrella` | branch rewrite around a return point, deterministic from the era seed | 18 columns/tick, radius ≤40, refuses bedrock/barriers/fluids/block entities |
| `SafeLanding` | bounded arrival search | 9 candidate columns + optional plinth in a Beyond space only |

A membrane is a swept segment/plane intersection with a rounded-rectangle boundary; the GLSL uses
the same fourth-power silhouette. Both directions are supported, and a cooldown plus resetting
forward samples prevent repeated crossing loops. The gravity integrator is softened Newtonian-like
gameplay acceleration with a tapered finite radius and an explicit velocity cap — deliberately
distinct from the client's light-ray integrator.

Consumption is a *deliberate* gameplay destruction budget: eaten entities are discarded, torn blocks
become real `FallingBlockEntity` instances and are then eaten too. Nothing deletes terrain silently;
every write path is bounded and refuses protected block classes.

## 3. Player persistence boundary

`ServerPlayerJourneyMixin` appends one `BeyondJourney` compound to vanilla playerdata: first external
origin, intro state, realm cursor, **era and era seed**, and an `InventoryLedger<NbtCompound>`.
`InventoryLedger` is copy-on-boundary and has no Minecraft imports, so its isolation and failure
semantics are unit-tested. Live inventory stays authoritative in the active scope; a boundary copies
the outgoing live snapshot, then selects a deep copy of the destination snapshot (or clones live on
first visit). Scope changes only after copying succeeds. World-change and respawn callbacks cover
mod travel and external dimension changes.

## 4. Client rendering boundary

Fabric's `CoreShaderRegistrationCallback` registers two GLSL 150 programs; the vanilla resource
loader owns shader-program lifetimes. `WorldRenderEvents.LAST` captures projection and view matrices
and composites immediately — after world rendering, before the hand clears world depth, and before
HUD/screens. A single owned scratch color framebuffer avoids read/write feedback: the scene is copied
into it, the cosmos pass reads the scene color and vanilla depth, and a blit pass writes back. World
depth is read, never replaced or written.

Uniforms: inverse projection/projection, camera-to-world/world-to-camera, resolution, camera
position, Witness direction and anchor, time, motion, intro phase, effect strength, ray steps, lens
mode, transition, realm theme, cosmic presence, nebula proximity, era, tunnel state and phase, and
six `Node`/`Style` pairs. `Style.x` is `kind + 1`; `Style.yzw` carry yaw, realm seed and realm theme,
so the same program renders every anomaly kind, every realm vista and every era treatment without
recompiling.

Anomaly envelopes are computed on the client from snapshot age and lifetime (persistent wells ramp
in and never fade), and `Spaghettification` derives its stretch from the same snapshots, so the lens
and the tidal stretch always agree without extra packets.

## 5. Light-ray approximation

In Schwarzschild-radius units the shader integrates

```
p'' = -1.5 * |p × v|² * p / |p|⁵
```

with adaptive velocity-Verlet steps. Rays are captured inside the horizon; near-miss rays bend real
sampled scene geometry, which is why the sky well distorts terrain, water and cloud rather than
painting an image. A finite-thickness emissive disk is sampled along the path, with spectral
grading, beam emphasis and an Einstein ring. Non-lensing kinds (membranes and tears) instead show a
seeded, parallaxed procedural vista of the realm behind the opening. Sampled scene colors are
screen-space, so hidden geometry cannot be reconstructed; this is not Kerr ray tracing, not full
radiative transfer, and the step budget truncates near-critical orbits by design.

## 6. Client presentation layers

- **Witness:** person-shaped figure (head, shoulders, torso, reaching arm, opening eye) anchored to
  the sky well's world position, drawn behind the scene through the real depth buffer, animated by
  time and by the camera's proximity to the well.
- **Reality treatments (12):** whole-screen re-authoring for the visor, keyed by `LensMode`, from
  photoreal-ish city blocks and traffic streaks to Backrooms, Poolrooms, cel shading, an eighties CRT
  broadcast and psychedelic folding. `Wave0…5` remain reserved for future per-node ripple shaping
  and are declared but driven at zero today.
- **Rift:** layered tear rendering — jagged silhouette, glass bubbles, lightning discharge and a rag
  of dragged geometry — with a birth envelope so the tear opens rather than popping into place.
- **Tunnel:** time-wave overlay driven by the corridor's real progress plus phase.
- **Era:** per-era grade (giant wood, neon city, primeval, alien, veined, bleached, ashen).
- **Spaghettification:** `EntityRendererStretchMixin` pushes a matrix at the head of every entity
  render, rescales along the pull axis expressed in the entity's own rotated frame (unambiguous for
  vertical pulls since yaw does not change Y), applies a volume-preserving thin-out, and pops at
  return. It is a render transform only; collision, health and inventory are untouched.
- **Seamless travel:** loading screens are dismissed by class-name match (never by compile-time
  reference) while a transition is in flight or while the player stands in a Beyond space. Gameplay
  is unchanged: the server still sends the world, the client still loads it.
- **Ambience:** vanilla sounds retuned far below normal pitch assembled into a hum-dominant
  soundscape for generated spaces, plus a proximity rumble near colossal wells.

## 7. Evidence boundaries

The real-client harness uses a copied, disposable world and asserts against live objects: scale
extremes, the sky well reaching the client as a persistent node, measured lens difference, applied
entity stretch, tear → hub → fractal → maze travel, corridor arming and teardown without leftover
barriers, Umbrella rewrites of real columns, and zero-drift native foreground occlusion. Screenshots
in `docs/runtime/` are unedited Minecraft captures, not mockups.

What this still does not establish: multiplayer behaviour, long-running persistence guarantees,
third-party renderer compatibility, a performance budget on real GPUs, recursive live portal
rendering, or photoreal asset fidelity.
