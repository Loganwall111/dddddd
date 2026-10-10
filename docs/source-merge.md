# Source archive merge record

This workspace is the merged **Aetherforged: Reincarnated** game, based on the two exact ZIPs the user identified:

1. `mass-awakening-voxel-sandbox (1).zip` — the later **Worlds Reborn 0.2** modular project.
2. `mass-awakening-voxel-sandbox (2).zip` — the earlier **Aetherforged: Reincarnated 0.1** browser game.

## Merge decision

The 0.2 archive is the working foundation because it already refactors the earlier monolithic game into separate world, persistence, rendering, audio, inventory, and simulation modules. It also carries forward stable block IDs and the legacy generator/save path. Copying the 0.1 `src/core/Game.ts` over the newer coordinator would mix incompatible save schemas and duplicate the game loop, so the older source was compared and compatible features were ported into the 0.2 module boundaries instead.

This merge now includes the older source's useful cinematic and visual ideas in the newer architecture:

- Three-cascade directional shadow maps, with a filtered single-shadow-map fallback if the cascaded implementation cannot initialize.
- An in-game cinematic tour entry point, progressive biome discovery, streamed chunk loading between shots, and stops for every one of the 32 defined Overworld biomes (plus the village and ancient-stair landmarks).
- Tour-camera-centered chunk streaming, so long-distance biome shots render generated terrain rather than leaving the camera behind the player stream.
- Connected emissive-block/furnace point lights, rain puddle decals, and debris effects; these were implemented modules but were not previously wired to the game loop/settings.
- A visible volcanic-biome eruption with colored lava sparks, ash, a nearby point light, and a synthesized rumble.
- Scene-aware procedural ambient drones and chimes that change musical mode with the biome, while remaining generated audio rather than a recorded soundtrack.
- Coarse, seeded tree silhouettes in the distant terrain horizon, in addition to the full-resolution trees in loaded chunks.
- A scheduled red blood-moon night and a working storm-lightning-to-synthesized-thunder callback.

The 0.2 generation, chunk workers, renderer, stable block/generation IDs, and `mass-awakening` IndexedDB database remain the compatibility base. The earlier 0.1 source uses a separate `aetherforged-db` database and export schema. That database is not renamed or modified, but automatic migration/import of its records or `.aetherforged-world` files is not implemented. The visible product name is **Aetherforged: Reincarnated**.

## Renderer scope

The delivered app is browser-based Babylon.js. It attempts WebGPU when the browser supports it and falls back to WebGL. The browser may internally use a platform graphics backend, but the app cannot select or verify a native Vulkan device. This source does not implement native Vulkan rendering or hardware ray tracing. Its planar water reflections, optional software screen-space ray-marched reflections, finite-step cloud ray marching, translucent sun-aligned shaft meshes, and dynamic point lights are browser-renderer effects with the limitations described in `worlds-reborn.md`.

## Verification

No dependency installation was performed. A TypeScript production build, Playwright browser run, and GPU/shader validation have **not** been completed in this workspace. The newly added tour acceptance scenario is present in `tests/browser/game.spec.ts`, but remains unverified until run with the project's dependencies and a browser.
