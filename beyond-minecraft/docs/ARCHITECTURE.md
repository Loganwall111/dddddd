# Architecture

## 1. Authoring boundary

`tools/generate_multiverse.py` -> `src/main/generated` -> `RealmCatalog` -> static
registries. Default catalog: 8 realms / 24 blocks / 8 echoes. Textures, loot, recipes,
biomes, custom 3D density fields and animated crystal columns share that catalog.
No Python interpreter, external process, arbitrary script execution or registry mutation
runs on a player's computer. The generator's output is deterministic and bounded.

## 2. Server boundary

`RealityManager` owns transient anomalies. Item use creates an anomaly after server
validation. Clients receive at most four nearby immutable snapshots; no C2S spawn API
exists. Ticking has caps for lifetime, influence radius, velocity and processed entities.
No `setBlockState` runs for gravity or explosions. Arrival plinths are the only runtime
block-writing path and require an entirely clear bounded volume in a Beyond dimension.

A membrane is a swept segment/plane intersection with a rounded-rectangle boundary.
The GLSL uses the same fourth-power silhouette. Both directions are supported. A cool-
down, rider rejection and resetting previous positions prevent repeated crossing loops.

The gravity integrator is softened Newtonian-like gameplay acceleration with a tapered
finite radius. It is intentionally distinct from the client light-ray integrator.

## 3. Player persistence boundary

`ServerPlayerJourneyMixin` appends one `BeyondJourney` compound to vanilla playerdata.
The journey contains the first external origin, intro state, realm cursor and a
`InventoryLedger<NbtCompound>`. `InventoryLedger` is copy-on-boundary and has no Minecraft
imports: its isolation, serialization failure, death and capacity semantics have unit tests.

The live vanilla inventory remains authoritative in the active scope. A boundary first
copies the outgoing live snapshot, then selects a deep copy of the existing destination
snapshot (or clones live on its first visit). The scope changes only after copying succeeds.
Live inventory + journal are serialized in the same player save; no second file can drift.

World-change and respawn callbacks cover normal mod travel and external dimension changes.
External cross-dimension chest/cursor behavior and multiplayer remain manual test obligations.
This is intentional inventory cloning, NOT protection against economic duplication.

## 4. Client rendering boundary

Fabric's `CoreShaderRegistrationCallback` registers two GLSL 150 programs. The vanilla
resource loader owns shader-program lifetimes. `WorldRenderEvents.LAST` captures the
current projection and view matrices; a tail injection into `GameRenderer.renderWorld`
runs the composite before HUD/screens. A single owned scratch color framebuffer avoids
read/write feedback. Vanilla's depth buffer is read, never replaced, and remains intact.

The shader reconstructs rays using inverse projection and inverse view, so anomalies are
world anchored, not fixed screen stickers. Original depth masks foreground occlusion.
Shader failure disables visuals; the original color attachment is untouched until a complete
scratch pass exists. FBO resources are released on disconnect/shutdown and resized as needed.

A supported Iris API reports active packs; the compositor suspends itself when their depth
conventions may differ. No untested promise of universal shader-pack interoperability is made.

## 5. Light-ray approximation

In Schwarzschild-radius units, the shader integrates

```
p'' = -1.5 * |p × v|² * p / |p|⁵
```

using adaptive velocity-Verlet steps. In the orbital plane this corresponds to the null
orbit equation `u'' + u = 1.5 u²`. Rays are captured inside the horizon; a finite-thickness
emissive disk is sampled along the path. The display adds stylized spectral grading,
Doppler-inspired beaming and photon-ring emphasis. Sampled scene colors are screen-space,
so hidden/off-screen geometry cannot be reconstructed. This is not Kerr ray tracing,
full radiative transfer, physically calibrated astronomy or physically realistic gameplay.
The step budget and domain truncate near-critical orbits; no infinite ray loop is possible.

## 6. Portals and Mandela lenses

Membrane interiors raymarch an original, finite-budget procedural vista (floating strata,
crystals, vegetation forms and waterfall ribbons). It is seeded and styled by the real
realm catalog, but is not the actual destination chunk mesh. The real world loads on
crossing. Supporting multiple live worlds, recursion, entity clipping, network ownership
and portal collision would be a separate renderer/engine integration project.

Glasses select six fixed procedural shader families. Their spatial variations are seeded/
noise driven; they do not generate or compile arbitrary new GLSL programs during gameplay.
Menus expose only implemented controls. Reduced motion freezes animation; O disables all
Beyond post-processing. These controls do not disable server-authoritative interactions.
