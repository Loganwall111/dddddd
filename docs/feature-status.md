# Requested Feature Status

> Historical 0.1 baseline only. Aetherforged: Reincarnated 0.2 and the selected-source merge supersede many entries below. See `worlds-reborn.md`, `architecture.md`, and `source-merge.md` for current implementation scope and verification status.

This is an initial implementation checklist, not a release sign-off. **Implemented** means substantive code existed at that historical checkpoint, not that runtime acceptance was signed off. For the current merged workspace, the production build, browser/GPU execution, and supplied automated tests remain unverified. No requirement is considered fully accepted merely because its interface exists.

## Initial Acceptance Checklist

| Requirement | Implementation | Verification and scope |
| --- | --- | --- |
| Project starts successfully | Unverified for current merge | No production compilation or browser start has been run in the current workspace. |
| Main menu works | Implemented | Connected title, world, settings, controls, credits, realm, and multiplayer-diagnostic screens; browser test supplied but not run. |
| Create and load worlds | Implemented | IndexedDB creation/load/rename/delete/import/export; browser persistence test not run. |
| Move, jump, and look | Implemented | AABB controller, pointer lock/fallback, jump/sprint/crouch/swim/flight; NullEngine physics tests not run. |
| Procedural terrain | Implemented | Deterministic seed, biomes, caves, trees, ore, shelter, portals; generation tests not run. |
| Chunks load and unload | Implemented | Worker queues, circular radius, unloading, revision rejection, empty chunks; long-distance browser test still needed. |
| Mine, collect, and place | Implemented | DDA targeting, hardness, tools, cracks, drops, pickup, placement checks; browser test not run. |
| Hotbar and inventory | Implemented | Nine hotbar slots, 27 backpack slots, library search/filter, drag/drop/split/quick moves, equipment; acceptance test pending. |
| Creative mode | Implemented | Registered item library, unlimited placement, fast breaking, flight, no survival damage/hunger; runtime test pending. |
| Survival mode | Partially implemented | Health, hunger, food, healing, fall damage, armor effects, durability, combat, XP, death/respawn. Full vanilla progression, sleeping, and complete equipment tiers absent. |
| Crafting and smelting | Implemented | Real ingredient/fuel consumption and output stacks, recipe book, bench, persistent furnaces; tests supplied, not run. |
| TNT destroys terrain | Implemented | Fuse, bounded destruction, chain reactions, damage, particles/audio/flash/shake, saved edits; browser test not run. |
| Creatures move and interact | Partially implemented | Initial sheep/bird/shade/ember roster and two bosses. Full requested archetypes, robust navigation, and entity collision absent. |
| Principal dimensions playable | Implemented | Overworld, Nether, and End each have substantive generation, collision data, mining/building, and different atmospheres. Direct browser traversal is unverified. |
| Portals transition dimensions | Implemented | Use/touch transitions, return positions, cooldown, loading feedback, dimension-aware edits; manual portal verification pending. |
| Animated reflective water | Partially implemented | Animated WaterMaterial with planar reflection/refraction, Fresnel blending, terrain-masked coverage, underwater depth absorption, and animated seabed caustics. Optional SSR applies to supported rainy surfaces; no shore foam, waterfall simulation, or block-fluid simulation. GPU test pending. |
| Lighting, shadows, day/night | Implemented | Sun/moon-style light cycle, animated sky/stars, shadow maps, bloom controls; GLSL/WGSL visual verification pending. |
| Settings affect application | Implemented | Quality/resolution, distance, map sizes, reflections, bloom, FOV, sensitivity, audio, flight speed, coordinates, contrast, motion, camera shake; browser test pending. |
| Worlds persist across sessions | Implemented | Real IndexedDB stores and awaited saves; cross-reload browser test supplied but not run. Ephemeral entity state excluded. |
| No blocking console errors | Partially implemented | Errors are surfaced and imports bundle. Browser console and shader-error acceptance checks have not been performed. |
| Production build succeeds | Unverified for current merge | Dependencies were not installed; `npm run build` has not been run here. |

## Expanded Requirements

| System | Status | Details |
| --- | --- | --- |
| Babylon, TypeScript, WebGPU/fallback | Implemented | Browser WebGPU is attempted with a WebGL fallback; `?renderer=webgpu` requires/diagnoses it and `?renderer=webgl` forces fallback. This is not a native Vulkan renderer; GPU validation is pending. |
| 256/384 vertical chunks | Partially implemented | Current chunks have 128 vertical cells. Sectioned storage and taller worlds remain. |
| Multithreaded greedy meshing | Implemented | Two terrain workers, maximal same-material face rectangles, repeated atlas tiles, hidden-face removal. |
| Frustum / occlusion culling | Partially implemented | Babylon frustum culling and hidden faces; no hardware hierarchical occlusion system. |
| Distant LOD | Partially implemented | Current 0.2 horizon includes seeded low-polygon tree silhouettes; terrain edits, full distant structures/vegetation detail, and seamless LOD blending remain. |
| Biomes and world types | Partially implemented | Eight biome definitions and five presets, not hundreds of detailed biomes. |
| Caves and structures | Partially implemented | Noise caves, mineral deposits, one deterministic shelter/portal. No aquifer simulation, worm caves, mineshafts, villages, or dungeons. |
| Original assets | Implemented | Title art, atlas, icons, voxel models, crack patterns, normals, particles, and sound synthesis. |
| AAA shader feature set | Partially implemented | Current 0.2 includes filtered cascaded-shadow maps with single-map fallback, PBR materials, optional software screen-space SSR ray marching, bloom, tonemapping, fog, planar water, and finite-step clouds. No full-scene path tracing/PTGI, POM, SSAO, native Vulkan renderer, or hardware-ray-tracing path is implemented; volumetric transport remains approximated. |
| Main-menu 3D panorama | Partially implemented | Animated original artwork and particles, not a live terrain fly-through. Actual 3D starts on entering a world. |
| Exact reference UI | Partially implemented | Original functional voxel-style layout, not a proprietary 1:1 UI asset replica. No offhand or true 3D inventory character preview. |
| Transparent glass | Not implemented | Glass has an opaque stylized texture in this release. |
| Crafting progression | Partially implemented | Sixteen shapeless recipes with 2 x 2 / 3 x 3 requirements. Shaped, enchanted, and specialized recipe systems remain. |
| TNT obstruction model | Partially implemented | Radius/falloff/resistance and chain reactions; no ray-propagated blast shielding. |
| Bosses | Partially implemented | Original Riftwing and Cinder Warden with phases, warnings, attacks, health, rewards. No colossal cosmic encounters. |
| Additional realms | Partially implemented | Crystal Hollows and Skylands are functional initial generators. No Abyssal Void, storm realm, or further rifts. |
| Weather and seasons | Partially implemented | Rain/storm particles/light, wet response, moving clouds, seasonal palette/clock, winter aurora. No tornadoes, snow accumulation, freezing water, or physical weather damage. |
| Boats / controllable balloons | Not implemented | The title artwork contains an atmospheric balloon, not a playable vehicle. |
| Redstone / transport / potions | Not implemented | No disconnected inventory stubs for these systems. |
| Character customization | Not implemented | Basic fixed first-/third-person and CSS inventory avatar only. |
| Spatial audio and biome music | Partially implemented | Original effects plus synthesized biome-responsive drones/notes; storm thunder and scene ambience are included. No full spatial mixer or recorded soundtrack. |
| Entity-state persistence | Partially implemented | Defeated boss flags persist. Ordinary mobs, loose drops, primed charges, projectiles, and transient attacks do not. |
| Multiplayer-ready design | Partially implemented | Transport interface and live endpoint diagnostic; no server, replication, or authoritative validation. |
| Automated tests | Partially implemented | Node and Playwright suites plus reproducible runner are written, not executed in this environment. |

## Continuation Order

1. Run `node scripts/verify.mjs`, then the Playwright suite. Fix failures in the existing modules rather than replacing the foundation.
2. Manually test shader compilation and texture orientation on actual WebGL2 and WebGPU devices; record GPU, browser, resolution, preset, and measured frame statistics.
3. Add schema migrations and transient entity serialization, crash recovery, and edited-chunk LOD.
4. Introduce vertical chunk sections, more robust creature navigation/collision, and transparent-block rendering.
5. Expand survival recipes, shaped crafting, armor tiers, beds, farming, and biome structures.
6. Add fluids, vehicles, advanced atmosphere, and new content only after those acceptance gates pass.
7. Connect a real authoritative multiplayer server through the existing transport abstraction, with protocol validation and reconciliation.
