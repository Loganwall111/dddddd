# Aetherforged: Reincarnated

**Worlds Reborn / 0.2** is an original browser-based voxel sandbox, built with React, Vite, TypeScript, and Babylon.js. This merged release uses the later modular source and retains its compatible gameplay, stable block/generation IDs, and `mass-awakening` save database while selectively porting features from the earlier ZIP; see `docs/source-merge.md`. It extends the existing playable singleplayer foundation rather than replacing it. This remains an early-access game, not a completed AAA release or a complete reproduction of Minecraft.

The classic pixel-style title screen has an actual rotating Babylon terrain panorama. Original artwork is retained while it initializes or if the browser cannot render the panorama. Menus, inventory, loading screens, and the HUD use an original beveled voxel UI.

## Run

Requires Node.js 20.19+ or 22.12+ and a modern desktop browser with hardware acceleration.

```sh
npm install
npm run dev
```

Open the Vite address, choose **Singleplayer**, create a world, then click **Begin exploring** to capture the mouse. Creative is the default, so the complete registered item library is immediately accessible. Survival can be selected during creation or from the pause menu.

```sh
npm run build
npm run preview
```

Serve the application over HTTP on localhost or HTTPS in production. Do not open the HTML using `file://`: workers, storage, and WebGPU require an appropriate browser origin. Deploy the entire `dist` directory, including `dist/assets`, not only its HTML file.

WebGPU is attempted automatically when the browser reports support; WebGL is the fallback. Add `?renderer=webgpu` to require WebGPU and show an initialization error instead of silently falling back, or `?renderer=webgl` to explicitly select WebGL. WebGPU requires HTTPS or localhost and may be blocked by browser/page policy.

## Play

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Look |
| Space | Jump or swim upward |
| Shift | Sprint |
| Ctrl / C | Crouch or descend while flying |
| Left mouse, held | Mine or attack |
| Right mouse | Place, eat, use a station, ignite TNT, or activate a portal |
| Shift + right mouse | Place against an interactive block |
| 1-9 / wheel | Select the hotbar |
| E | Inventory |
| Q | Drop one selected item |
| V / double Space | Creative flight |
| F | Animated third-person character |
| Escape | Pause or close a dialog |
| Alt + mouse movement | Look fallback when pointer lock is unavailable |

Open the pause menu in an Overworld to start **Cinematic Tour**. It samples all 32 defined Overworld biomes, loads each stop into the live world, and adds village/ancient-stair landmarks. Terrain generation and route discovery can take time; a dark transition screen is shown while the next area streams. End the tour at any time to return to the paused player view.

Inventory supports click pickup/placement, drag and drop, right-click splitting, and Shift-click quick moves. In Creative, click a library item to put an unlimited-use stack into the selected hotbar slot.

A starter village in new, non-flat Overworlds contains crafting benches, furnaces, chests, and villagers. Right-click a villager to hear/read dialogue and trade coal for bread. A nearby framed obsidian rift provides dimension travel. The pause menu exposes all six realms for exploration.

Use **Character...** on the title screen, or **Character** while paused, to edit skin, hair, eyes, clothing, boots, and hairstyle. Drag the actual 3D preview to rotate it. The chosen appearance is used by your first-person arm, third-person rig, and inventory preview.

## The Sift

In a **new 0.2 world**, find the descending stairway near **X 42, Z -62**. It leads to the ancient-city chamber near **X 42, Y 16, Z -28**. Right-click the four resonance blocks in this order: **C, G, E, B, C**. A mistake resets the sequence. Completing it opens the shader rift and allows rare Sift rifts to appear in subsequently generated Overworld regions.

The Sift has teal skies, animated auroral rings, green/red vegetation, chromium pillars, and prismatic water that damages Survival players. It is an original interpretation of the requested concept, **not an official or announced Minecraft dimension**.

The Creative inventory contains **Portal Keystone** and **Sift Rift** items. Place one where a five-wide, six-high frame will fit to construct an actual framed portal. An empty obsidian frame of that size can also be activated with a Firestarter or Rift Igniter. Portal windows render a low-resolution destination terrain preview, not a static image.

Spawn eggs summon actual animated entities. The **Stormcaller Totem**, or **Pause > World Rules > Summon a tornado**, creates a tornado in the Overworld when tornadoes are enabled. A **Silver Mirror** has a reflective north-facing surface.

Right-click a placed TNT block to start its three-second fuse. It destroys actual terrain, primes nearby charges, deals damage, and preserves its edits in the save.

## Included Systems

- Seeded, horizontally streamed 16 x 16 x 128 terrain chunks generated and greedily meshed in two Web Workers.
- Hidden-face removal, vertex ambient shading, chunk frustum culling, and an additional worker-generated coarse voxel horizon with deterministic distant tree silhouettes (terrain detail, edits, and structures remain simplified there).
- 32 initial Overworld biome definitions, climate-cell procedural variants, caves, minerals, cross-chunk structures, villages, giant mushrooms, fossils, and the ancient-city chamber.
- Standard, Amplified, Superflat, Archipelago, and Extreme world presets.
- Overworld, cavernous Nether with ceilings, separated End islands, Crystal Hollows, Skylands, and the Sift, each with dimension-specific edits and return positions.
- More than 300 original blocks/items, generated mineral/tool/food families, spawn eggs, an expanded 32 x 32 tile atlas, PBR roughness/metallic/normal data, emissive artwork, and transparent glass meshes.
- Collision-based movement, jumping, crouch edge checks, swimming, flight, targeting, staged crack feedback, mining, physical drops, and placement.
- Creative library search/categories, 36 inventory slots, nine hotbar slots, equipment storage, and initial armor effects.
- Survival health, hunger, food, healing, fall damage, melee combat, tool durability, XP, death drops, and respawn.
- Data-driven 2 x 2 / 3 x 3 recipes, expanded wood and mineral progression, fuel-consuming smelting, and persistent chests.
- 23 base creature definitions and 16 generated variants, animated joints, spawn eggs, passive/hostile behaviors, ranged skeletons, explosive creepers, sniffing creatures, speaking/trading villagers, and three initial boss archetypes.
- Reflective/refractive animated water, terrain-masked water coverage, underwater absorption/distortion, animated seabed caustics, PBR terrain, optional screen-space software ray-marched reflections (SSR), and planar mirrors.
- Three-cascade filtered directional shadows where supported (single-map fallback otherwise), up to eight nearby emissive-block/furnace point lights without point-light shadows, and reflective puddle decals while raining.
- Ray-marched 3D clouds, screen-space god rays (sky-depth ray march toward the sun, so terrain casts real shadows into the shafts), a GLSL night-sky dome with twinkling stars, a Milky Way band, animated aurora curtains and periodic shooting stars (also reflected in water), Sift auroral rings, and after-rain rainbow shading.
- Four changing seasons with foliage/pollen/leaves, snow precipitation, actual winter snow/ice blocks, and spring thaw through deterministic remeshing. Scheduled red blood-moon nights tint the Overworld sky/light as a scripted visual event; volumetric tornadoes have limited physical pull and terrain damage.
- Procedural Web Audio wind/rain/water/bird ambience, biome-responsive synth drones and chimes, delayed synthesized thunder, eruption rumble, and optional device speech for NPC dialogue.
- IndexedDB worlds/preferences, periodic and transition saving, rename/delete, and validated JSON import/export.

## Verification

**Build and gameplay status for this merged workspace: unverified.** Dependencies are not installed here, so the production bundle, TypeScript checks, unit tests, Playwright suite, and GPU shader execution have not been run. No frame-rate or browser-console-clean claim is made; save-compatibility notes below describe intended code paths, not a runtime migration test. The older 0.1 database is not automatically imported. Once dependencies and a browser are available, run the checks before treating the release as accepted:

```sh
npm install
node scripts/verify.mjs
npx playwright install chromium
node scripts/verify.mjs --browser
```

The verification script runs TypeScript checks and Node tests for deterministic generation, chunk seams, edits, greedy meshing, recipe uniqueness, inventory conservation, smelting, save validation, AABB movement, and voxel traversal. The Playwright suite covers menus, responsive layout, real world creation, movement, mining/placement, inventory search, TNT destruction, dimension changes, saving/reloading, and uncaught page errors.

`?qa=1` exposes the active engine as `window.__AWAKENING__` for fixture setup in the browser tests. That hook is not exposed on normal visits.

See `docs/feature-status.md` for the complete requested acceptance checklist and `docs/qa.md` for manual verification scenarios.

The detailed **0.2 update status**, shader limitations, and new acceptance scenarios are in `docs/worlds-reborn.md`. The previous feature checklist is retained as a historical 0.1 baseline.

## Procedural Artwork

All registered items already generate their original icons at runtime. To export the deterministic icon library and creature portraits as standalone SVG assets:

```sh
npx tsx scripts/generate-art.ts
```

This writes `public/generated-art/items`, `public/generated-art/mobs`, and a manifest. The exporter is provided but was not run in this environment. It does not alter block IDs or create unregistered gameplay items.

## Saves

Worlds are local to this browser profile and origin. Clearing site data deletes them. Export important worlds from **Your worlds** or the pause menu. Saves store the seed and block edits, not every generated chunk. The active dimension, player, inventory, equipment, furnace/chest contents, clock, weather, seasons, and boss defeat flags persist.

The modular 0.2 IndexedDB name, `mass-awakening`, is retained for compatibility; existing 0.2 worlds use `legacyGenerator.ts` and retain their terrain. **Create a new world for the overhauled biomes, villages, cavern dimensions, and ancient city.** New worlds use generation version 2. Character appearance and the Sift unlock are also persisted, and older 0.2 JSON exports remain importable. The earlier 0.1 source used a separate `aetherforged-db` database and `.aetherforged-world` export schema; this build leaves that data untouched but does not automatically migrate or import it.

Ordinary creature positions, loose item entities, in-flight projectiles, and primed TNT are not serialized in this release. Autosave runs every 30 seconds of active play; browser visibility changes and explicit transitions also request saves. Use **Save & return to title** for a confirmed save.

## Limitations And Next Milestones

The implemented world has 128-block vertical chunks, not the requested 256/384-block subchunk architecture. The distant horizon is a seed-derived approximation: player edits and vegetation become exact when full-resolution chunks load.

Water remains a height-plane system rather than a block-fluid simulator; shoreline coverage is a coarse terrain mask. The optional software ray-tracing toggle uses screen-space SSR ray marching against visible depth; it cannot trace off-screen geometry or provide full-scene path tracing/global illumination. There is no path tracing, fluid waterfall simulation, POM, SSAO, native Vulkan renderer, or verified hardware ray tracing. Browser WebGPU may be backed internally by a platform API, but this application cannot force or verify that backend. Sun shafts are translucent sun-aligned mesh effects, not shadow-accurate volumetric scattering. Cloud ray marching and wet SSR are scalable, finite-step effects; SSR cannot reflect off-screen content. New GPU effects still require actual device validation.

The expanded entity roster and survival progression are initial implementations. There are no redstone circuits, enchanting, complete potion systems, sleeping, full armor tiers, boats, controllable balloons, large woodland mansions, or colossal cosmic bosses. Mobs use simple local steering rather than global pathfinding. Tornado destruction is intentionally bounded, not a general rigid-body simulation. Villager conversations are authored dialogue, not an online conversational model.

Multiplayer contains a transport abstraction and a working WebSocket connection diagnostic, **not a hosted multiplayer game**. No server is bundled. See `docs/architecture.md` for authoritative-server responsibilities.

Next priorities are running browser acceptance checks on WebGL and WebGPU, fixing driver-specific shader issues, expanding vertical subchunks and edited LOD, persisting transient entities, improving portal-camera alignment and fluid simulation, and expanding survival content on the existing architecture.

## Asset Credits

The title artwork, voxel textures/icons, voxel creature geometry, crack patterns, normal texture, particle sprites, and synthesized sounds were created for this project. No proprietary game texture packs, logos, models, or soundtracks are used. Babylon.js, React, Vite, idb, Lucide, and the locally bundled Inter, Rajdhani, and Silkscreen fonts retain their respective open-source licenses.
