# Worlds Reborn / 0.2

The game is now **Aetherforged: Reincarnated**. This update extends the modular 0.2 gameplay and preserves its existing worlds; the separate database used by the older 0.1 ZIP is not automatically migrated. It is an original voxel sandbox, not an official Minecraft product; the Sift is an interpretation of the requested concept, not a claim about an upcoming official dimension.

## Verification

This file records implementation intent and scope, not acceptance results. For the current merged workspace, dependencies are not installed and **the production build, TypeScript checks, unit suite, Playwright scenarios, GPU shader compilation, and manual gameplay have not been run**. The included tests are not represented as passed, and no frame-rate or browser-console claim is made. See `source-merge.md` for merge-specific verification status and `README.md` for the current commands.

## Update Checklist

| Requested feature | Implementation | Scope and remaining limitations |
| --- | --- | --- |
| New name | Implemented | Visible UI, document title, exports, credits, and current documentation say Aetherforged: Reincarnated. The 0.2 `mass-awakening` database and stable world-generation/block IDs remain unchanged. The older 0.1 ZIP uses a separate `aetherforged-db` schema; automatic migration from that database is not implemented. |
| Classic main menu and UI | Implemented | Centered extruded pixel wordmark, animated splash, beveled original buttons, stone-style menus, pixel settings, light inventory, classic hotbar/loading UI. No proprietary UI artwork is copied. |
| Rotating 3D panorama | Implemented | A real Babylon scene, generated terrain, village, sky, water, slow camera rotation, and resource cleanup. Original artwork remains during initialization or rendering failure. |
| Character creator | Implemented | Name, skin, eyes, hair, clothes, trousers, boots, three hairstyles, presets, color pickers, random/reset, draggable real 3D preview, persisted preferences/world appearance. |
| First-/third-person character | Implemented | Textured arm/sleeve, sprite-held tools, complete articulated humanoid head/body/arms/legs, walking/mining animation, matching inventory preview. Not a full animation-blending or armor-appearance system. |
| PBR voxel textures | Implemented | Expanded original pixel atlas plus generated roughness/metallic and normal data, emissive maps, vertex AO, world-space tile repetition on greedy meshes, wet clear coat. No parallax or displacement mapping. |
| Mirrors and glass | Implemented | Up to eight active planar mirrors, fixed north-facing reflection planes, alpha-blended glass chunk meshes. Mirrors are not arbitrary-oriented recursive reflectors. |
| Underwater upgrade | Implemented, approximation | Depth-based color absorption, slight refraction distortion, dynamic caustic shading on submerged terrain, shaft approximation, fog, kelp and fish. Fluids are not fully simulated; seabed/shore coverage uses an eight-block distant terrain grid. |
| Volumetric clouds | Implemented, scalable | GLSL ray marching through actual 3D noise density with wind and a self-shadow sample, up to 28 ray steps. No temporal-reprojection or physically calibrated multiple-scattering solver. |
| Sun shafts / god rays | Implemented, approximate | Screen-space post-process that marches from each pixel toward the sun and accumulates only sky-depth samples, so occluders cast shafts. The old pillar meshes were removed. Weak in the tested day view and not validated on real GPUs. Not full volumetric scattering, and it is disabled underwater.
| Reflective ground in rain | Implemented, hardware-dependent | PBR roughness/clear-coat response and optional Babylon SSR on supported backends. Off-screen surfaces cannot appear in SSR. |
| Software ray tracing | Implemented, limited and unverified | An opt-in setting enables screen-space SSR ray marching against visible depth. This is a software shader approximation, not hardware RT, global illumination, or full-scene path tracing; unsupported backends may not provide it. |
| Four adapting seasons | Implemented | Spring pollen, summer ambient motes, fall colors/leaves, winter snow/ice blocks and snow precipitation, thaw on season change, player-edit priority. Legacy worlds retain old terrain generation and only receive appearance changes. |
| Weather and tornadoes | Implemented, bounded | Rain/storms, snow, lightning strikes with delayed thunder audio, a shader-ray-marched rotating funnel, player lift/pull/damage, and sparse terrain destruction. Not a general-purpose rigid-body weather engine. |
| Blood moons / eclipses | Implemented, scheduled visual event | A red-moon event appears on the seventh in-game day of each seven-day cycle during the Overworld night, with tinted light/fog, a visible red disc/halo, and a one-time warning/thunder cue. It is a scripted sky/lighting effect, not a full orbital or shadow-accurate eclipse simulation. |
| Cascaded shadows | Implemented, capability-dependent | Three filtered directional cascades are attempted; if initialization fails, the renderer falls back to a filtered single shadow map. Actual backend/device behavior remains unverified. |
| Cinematic biome tour | Implemented, unverified | TourSystem streams through all 32 defined Overworld biomes and adds village/ancient-stair landmarks. Its browser acceptance scenario has not been run. |
| Scene-aware ambient music | Implemented, procedural | Synthesized drones/chimes change with biome and scene; this is generated ambience, not a recorded or composed soundtrack. |
| Aurora, rings, stars, shooting stars | Implemented | GLSL night-sky dome: animated aurora curtains, twinkling stars, Milky Way band, periodic shooting stars; full-time Sift aurora with moving zenith rings. Verified visually in headless Chromium at night (aurora and stars confirmed; a shooting star was not captured in the test frames). |
| Rainbows | Implemented, shader approximation | Animated sky-spectrum arc after rain clears in daylight, separate spatial iridescence on Sift water. |
| More blocks/items | Implemented | 330 registered non-air entries. All generated items have defined block/tool/food/spawn behavior. Wood/mineral crafting and smelting extend real progression. |
| Procedural artwork script | Implemented; exporter not executed | Runtime original icons/textures/skins plus `scripts/generate-art.ts` exporting item SVGs, generated creature portraits, and a manifest. The generator does not claim unlimited distinct hand-designed content. |
| More biomes/open terrain | Implemented | 32 Overworld definitions plus coherent seeded emergent combinations, open plains, coasts, dunes, forests, wetlands, mushroom valleys, fossils, boneyards, toxic regions, cliffs, caves, crystals. Emergent regions recombine a finite grammar rather than produce infinite new code. |
| Distinct main dimensions | Implemented | Nether roof/ceiling/caverns, lava basins, warped/crimson vegetation and basalt; End central/outer islands, void gaps, chorus regions and obsidian pillars. Legacy worlds retain their old generators. |
| Expanded mobs and spawn eggs | Implemented, initial behaviors | 23 archetypes and 16 generated variants, original jointed models, animated walking/wings/tails/heads. Eggs summon actual entities with a 42-creature area cap. Archetypes use local steering, not full vanilla AI. |
| Dragon / wither / sniffer | Partially implemented | Original Rift Dragon, Ash Wither, and Moss Sniffer archetypes. Boss damage/health/phases/projectiles/rewards and sniffer item discovery exist; combat is not a full vanilla recreation. |
| Villages and talking villagers | Implemented, limited | Repeating seeded village settlements, authored speech/subtitles, lore, and a real three-coal-for-two-bread trade. Speech depends on browser/device voices. No online generative conversations or complex economies. |
| Woodland content | Partially implemented | Woodland/dark-woodland biomes and villages are present. A dedicated large Woodland Mansion structure is not implemented. |
| Framed portals | Implemented | Non-solid portal data is rendered as a flat animated shader aperture, not a wall of purple cubes. Keystone creates a frame; an igniter activates a valid empty frame. Frames currently align to the X/Y plane. |
| See the other world through rifts | Partially implemented | A separate render-target scene shows actual destination-seed terrain, with camera-angle response, opening animation, pixelated edge noise and distortion. It is a bounded low-resolution preview, not a recursively rendered, exact linked-camera view. |
| Ancient-city note puzzle | Implemented | Underground chamber, stair entrance, four functional notes, correct five-note sequence, reset on mistakes, persistent Sift unlock, actual portal block edits. It is one guaranteed starter structure, not a complete ancient-city generator. |
| The Sift | Implemented, initial realm | Teal sky, aurora/rings, green/red vegetation, chromium pillar regions, spectral wildlife, rainbow-water damage, return portal, mining/building/saving. No claim of official Minecraft affiliation. |
| Natural fabric-of-space rifts | Implemented, limited | Rare generated Overworld rifts unlock after the ancient-city melody; Sift has its own rare rifts. They use the same bounded destination-preview shader and real travel system. |

## Save Compatibility

- The modular 0.2 build retains its `mass-awakening` IndexedDB name and schema. The earlier 0.1 source uses a separate `aetherforged-db` database with a different schema; this merge leaves that database untouched but does not automatically import or expose its worlds.
- Original IDs 0-63 are unchanged. New content is append-only; chunk buffers are now 16-bit to avoid corrupting IDs above 255.
- New saves specify `generationVersion: 2`. Missing/old versions are normalized to version one and use `legacyGenerator.ts`.
- Terrain edits, chests, furnaces, inventory, player state, dimension return positions, clock and weather continue to persist.
- Character appearance, resonance progress, and Sift unlock state persist. Loose mobs/items, projectiles, primed explosives, and active tornadoes are still ephemeral.
- Create a new world to receive the new terrain distribution, village layout, Nether ceiling, and ancient-city chamber. Loading an old world is deliberately not a destructive terrain migration.

## New QA Scenarios

1. Confirm the title reads Aetherforged: Reincarnated at desktop and mobile sizes. Wait for the actual canvas panorama, observe rotation, enable reduced motion, and verify initialization/failure fallback.
2. Change every character color and hairstyle, drag the preview, save, reload, create a world, and compare the arm, third-person model, and inventory preview. Check changing a character mid-world releases old meshes/materials.
3. Check all new blocks and every spawn egg, including IDs greater than 255. Place/mine/save/reload a high-ID mineral block. Confirm recipes, fuel, and food effects use real items.
4. Swim in a river and look down/up. Observe terrain caustics, depth absorption, waves, fish, kelp, and reflected clouds. Visit the underground ancient city and confirm it is not treated as submerged simply because its elevation is below sea level.
5. Switch through all four seasons. Confirm snowy surfaces, frozen shallow water, snowflakes, fall palettes, spring pollen, and thaw. Confirm saved player structures survive remeshing and a player is not trapped in newly frozen ice.
6. Set rain/storm on Balanced and Cinematic. Check wet PBR surfaces and SSR, disable each effect independently, and clear the rain during daytime to reveal a rainbow. Force night and inspect twinkling stars, comets, and aurora.
7. Summon a tornado with the totem or World Rules. Check the funnel, drift, local player forces and damage, sparse real block removal, expiration, realm changes, and the disable switch.
8. Examine the Nether roof/ceiling, lava depressions and unique plants. Fly from the End central island over void to outer islands. Compare the Sift's geometry, palette, sky, pillars, and harmful water.
9. Visit the starter village. Right-click NPCs, listen/read, request Sift lore, complete a trade, attempt a trade without ingredients, and verify the voice/volume switches stop speech.
10. Walk to X 42, Z -62, descend to the ancient city, and play C-G-E-B-C. Verify wrong notes reset, correct notes visibly open the gate, entry performs a real transition, and the unlock survives reload.
11. Build a 5 x 6 obsidian frame in the X/Y plane, activate it, and inspect the flat shader aperture and live destination preview. Test rift opening, dimension return cooldown, breaking the frame, unloading, and loading edits. Test a Silver Mirror while moving past its north face.
12. Inspect actual shader compilation and console errors on WebGL and WebGPU. Profile with reflective water, rain SSR, cloud ray marching, multiple portals/mirrors, and maximum local creatures enabled together. Record hardware and frame statistics before claiming performance.

## Next Work

The highest-value next step is executing the supplied tests and GPU smoke pass. After that: precise linked portal cameras, persistent entity/weather state, per-surface water depths, less expensive reflection scheduling, more sophisticated navigation and boss mechanics, a woodland mansion, additional authored structures, and a real authoritative multiplayer server. Existing working systems should be extended, not replaced with new prototypes.
