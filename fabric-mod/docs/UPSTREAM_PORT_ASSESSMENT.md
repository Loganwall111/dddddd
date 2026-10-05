# Upstream Sift archive: Fabric port assessment

**Audit date:** 2026-10-05
**Archive:** [Loganwall111/siftss](https://github.com/Loganwall111/siftss), commit `f94a1ac080f4`
**Purpose:** determine what can be reused from the supplied NeoForge archive without replacing the existing `entersift` gameplay or shader-driven Rift.

## Finding in one sentence

The supplied tree is an **exploded NeoForge 1.21.1 mod JAR**, not a source repository; however, Mielon already publishes **The Sift 1.1.2 for Fabric 26.3**, so a full-loader port exists upstream. For this project, the safest approach is to use that release as the compatibility reference and selectively bring over assets/ideas, rather than trying to relabel NeoForge bytecode as Fabric.

## What was inspected

The repository contains a single `sift/` tree plus `.gitattributes` (1,422 files inside `sift/`):

| Area | Files / notable contents |
| --- | --- |
| `sift/assets/` | 563 files: block/item/entity textures, models, sounds, translations, shaders, GeckoLib geometry and animation JSON |
| `sift/data/` | 490 files: dimension and dimension type, 10 biome definitions, worldgen, recipes, loot, structures, tags, and advancements |
| `sift/mielon/thesift/` | 366 compiled `.class` files: entity, world, worldgen, rendering, particle, portal, mixin, platform and network code |
| Other archive entries | 3 `META-INF` files; 16 structure `.nbt` files; 26 `.ogg` files; 145 `.png` files; 9 `.fsh`/`.vsh` shader files |

There are **no `.java` files, Gradle/Maven build files, wrapper, README, client launcher, screenshot harness, or standalone JAR** in `siftss`; the contents are already extracted from a built mod. `neoforge.mods.toml` identifies Mielon's The Sift 1.1.2, JavaFML/NeoForge `[21.1.62,21.2)`, Minecraft `[1.21.1]`, and GeckoLib `[4.6.6,5)`. The embedded metadata declares MIT and credits third-party contributions; keep those credits with any copied assets.

## Rift assets and rendering techniques worth reusing

- [`assets/the_sift/geo/rift.geo.json`](https://github.com/Loganwall111/siftss/blob/main/sift/assets/the_sift/geo/rift.geo.json) encodes one Rift outline with **16 cuboids in 8 bones**. Its coordinates are a useful dimensional reference for the current SDF silhouette; it should remain a reference, not restore 3D wireframe geometry to the active renderer.
- [`assets/the_sift/animations/rift.animation.json`](https://github.com/Loganwall111/siftss/blob/main/sift/assets/the_sift/animations/rift.animation.json) contains one `appear` animation, `0.7917` seconds long and held on its last frame. It is a short assembly clip, not the requested 0–100-tick lifecycle. The archive does include this one Rift animation, despite not including a complete Rift life-cycle system.
- [`assets/the_sift/shaders/core/rift.fsh`](https://github.com/Loganwall111/siftss/blob/main/sift/assets/the_sift/shaders/core/rift.fsh) and [`shaders/include/portal_fields.glsl`](https://github.com/Loganwall111/siftss/blob/main/sift/assets/the_sift/shaders/include/portal_fields.glsl) provide portable shader *ideas*: 4–5 octave fBM, warped noise, pale pink/gold energy, sampled scene color, and separate material modes for glow, white rim and walls. The `.fsh` uses the older 1.21.1 GLSL 150 pipeline, so its formulas—not its pipeline declarations—are the part to carry forward to the current 26.3 GLSL 330 shader.
- The Rift has two `360×203` scene textures (`textures/entity/rift/overworld.png` and `sift.png`). They are static references/fallback imagery, not a moving destination camera.
- Rift rendering classes include `RiftAssetModel`, `RiftMesh`, `RiftRenderer`, `MiniRiftRenderer` and `RiftShaderpackRenderer`. The bytecode shows a custom parser for the geometry/animation JSON and separate shader-pack handling. The class files also reference NeoForge, Sponge Mixin, Minecraft internals and GeckoLib; without source they need decompilation/reimplementation, not a metadata edit.

## Dimension, mobs and sky

The archive has a substantial resource/data pack: 10 worldgen biomes, NBT structures, blocks/plants, item/entity textures, sounds and the compiled entity/worldgen/portal classes. Some `data/minecraft/` resources override vanilla tags/advancements and include Ancient City structure templates; these must **not** be copied wholesale without checking their effect on the existing game.

The sky is not shipped as a ready-to-use skybox/cubemap. It appears to be code-driven: the archive contains `SiftProceduralSkyRenderer.class`, sky/cloud mixins, and an Ichor-cloud shader; the only environment PNGs are Ichor rain and snow. The core renderer is bytecode-only, so its look can be referenced, but a Fabric implementation needs to use or extend this project's existing `SiftSky`/shader code.

## Fabric compatibility and conversion paths

The Modrinth version API lists **Mielon's The Sift 1.1.2 for Minecraft 26.3/Fabric** (version `QK8RaspH`), with Fabric API and GeckoLib as required dependencies and LambDynamicLights optional. This is the exact game/loader family used by `fabric-mod`, so converting the NeoForge binary is unnecessary for a full upstream comparison. The binary is served from Modrinth's CDN, which this sandbox could not reach, so I have not embedded or inspected that Fabric JAR. The public Modrinth release page is [here](https://modrinth.com/mod/mielons-the-sift/versions).

| Archive component | Fabric path | Decision |
| --- | --- | --- |
| PNG, OGG, model and animation JSON | Generally portable as resources; retain `the_sift` namespace or explicitly map IDs and update every reference | Selectively reuse after checking dimensions, attribution and references |
| Datapack JSON / NBT | Loader-independent in principle, but registry IDs and worldgen/data schemas changed from 1.21.1 to 26.3 | Port and validate each registry family; do not bulk-copy `data/minecraft/` |
| Rift geometry / animation | JSON can be read directly; current project deliberately uses shader SDFs instead of a GeckoLib mesh | Translate cuboid proportions and the short appear timing into the SDF/lifecycle |
| NeoForge class files / mixins | Loader-specific compiled bytecode; depends on NeoForge/GeckoLib APIs and old Minecraft internals | Cannot turn into Fabric by changing metadata. Use the already-published Fabric release for comparison, or port source-level behavior manually |
| Original sky | Procedural renderer is compiled; no packaged sky panorama | Preserve the current native Fabric sky and port visual ideas from shader/resources |

A nested copy of the upstream 26.3 Fabric mod is technically another route to preserve all original gameplay, but it would remain a separate mod/dimension, add GeckoLib and a large additional artifact, and could duplicate portal/command behavior. That integration should be a deliberate follow-up, not a silent wholesale merge.

## Camera capture / visual validation

The current client already has `RiftScene`, which copies the live camera's opaque color and depth buffers for the Rift's refraction pipeline. That is a **shader input capture**, not a saved screenshot and not a second destination-world camera. The existing API probe also disassembled `Minecraft.grabPanoramixScreenshot(File)`: it temporarily resizes the render target to 4096×4096, turns through six camera directions, saves each face via `Screenshot.grab`, then restores the player's orientation and window size. That is useful for cube-face/panorama inspection, but overkill for a normal visual regression still. I added a client-only `/siftshot` command that calls Minecraft 26.3's `Screenshot.grab(...)` on `gameRenderer.mainRenderTarget()` and saves the final view as `screenshots/entersift-<milliseconds>.png` in the game directory. In a loaded test world, run `/function entersift:dev/riftcheck`, then `/siftshot`; Minecraft also reports the saved image in chat. The command and API signature are checked by the offline contract test, but no PNG has been produced or inspected yet: this sandbox has no local Java/Minecraft client. A headless server smoke test does not prove the GPU appearance, so actual visual verification remains pending a client run.

## Work applied from the audit

- Keep the pure-GLSL plane/SDF and current lifecycle; do not re-enable the archived cube mesh.
- Port the source shader's warped fBM energy field into the existing interior shader while preserving the live scene/depth capture and Sift palette.
- Add an opt-in in-game screenshot command to save a real camera frame for visual review.
