# Engine Architecture

## Application Boundary

`src/App.tsx` owns React screens, saved-world selection, settings, and the engine lifecycle. `src/core/Game.ts` coordinates simulation and publishes throttled, immutable HUD snapshots through `GameEvent`. React does not rebuild scene meshes or participate in the physics frame loop.

The renderer is a Babylon `AbstractEngine` that attempts browser WebGPU when supported and otherwise uses WebGL. `?renderer=webgpu` requires WebGPU and reports why initialization failed; `?renderer=webgl` forces the fallback. WebGPU needs HTTPS or localhost and can be restricted by browser/page policy. This is not a native Vulkan renderer, and the app cannot select or verify the browser's underlying platform backend. No hardware ray-tracing path is implemented. The canvas resizes with the window, and scene systems are disposed when leaving a world.

## Terrain And Streaming

`src/world/generator.ts` is pure seeded generation. `noise.ts` implements deterministic lattice noise and layered fractal height fields. Biomes are data-driven; dimension branches change density, materials, decoration, and atmosphere rather than only changing a sky color.

Full-resolution chunks are 16 x 16 x 128 `Uint16Array` buffers, allowing stable IDs above 255. An 18 x 18 generation halo includes neighboring columns and structures. Tree candidates are evaluated in world-space grids outside chunk boundaries, so cross-boundary canopies are deterministic. The original terrain generator is retained in `legacyGenerator.ts`; saved `generationVersion` prevents terrain replacement on upgrade.

Two inline Vite workers generate and greedily mesh chunks. Six directional masks merge maximal contiguous, same-material rectangles after hidden-face removal. Vertex colors provide directional shading and corner occlusion. A Babylon material plugin supplies GLSL and WGSL world-space atlas UVs, preserving one pixel tile per voxel over merged quads. Ordinary item meshes use a separate, non-repeating material.

The main thread uploads transferred typed arrays into opaque and optional transparent-glass chunk meshes. Worker results also include portal/note/mirror markers, avoiding repeated full-voxel scans. Revision numbers reject obsolete remesh results. Epochs reject results from previous dimensions. Only an edited chunk and affected edge neighbors are rebuilt. Empty chunks remain valid collision data without allocating empty GPU vertex buffers.

Edits are spatially indexed into chunk buckets before worker requests. Generation data is unloaded beyond the render radius; edits are retained independently. A third worker builds a coarse, stepped horizon and seeded, low-polygon tree silhouettes from the same seed. This distant representation is not authoritative collision geometry and does not show player edits or full-resolution structure/vegetation detail; those resolve when their chunks load.

## Player And Interaction

`src/player/Player.ts` owns keyboard state, camera angles, AABB terrain collision, substepped vertical movement, gravity, jumping, crouch edge checks, step-up movement, fluid movement, and Creative flight. Movement stops at unloaded chunk boundaries.

Voxel DDA traverses the exact block grid and returns a target plus outward face normal. Placement rejects occupied cells and player overlap. Progressive mining uses hardness and tool effectiveness. The block registry defines drops, stack caps, tool durability, food nutrition, and armor values.

`BreakOverlay` generates ten stages of original alpha-textured cracks. The held block and selection outline are separate scene meshes. Menus pause input and deliberately release pointer lock. No gameplay listener is attached to a DOM menu element.

## Inventory And Machines

`inventory.ts` contains mutation helpers for stack conservation. UI slot transfers validate machine and equipment destinations. A cursor stack is returned to inventory, or physically dropped if full, before the inventory closes.

Recipes are currently shapeless but specify grid size and exact occupied-ingredient counts. A recipe fills real grid slots after consuming inventory ingredients; crafting resolves the grid, checks output capacity, consumes ingredients, and creates a real stack. Recipes have distinct ingredient signatures.

Furnaces have persistent input, fuel, output, progress, and remaining burn time. Each output requires five simulation seconds and fuel. Furnaces continue ticking while UI menus are open. Chest contents are keyed by dimension and block position. Destroying a chest or furnace releases stored stacks and deletes its container state.

## Entities And Explosions

`Entities.ts` implements bounded creature lists, local wander/pursue/flee behaviors, direct terrain queries, melee targeting, physical drops, pickups, ranged attacks, and boss telegraphs. `registry.ts` supplies base and generated mob definitions; `VoxelRig.ts` builds original pixel-textured jointed models and animates limbs, wings, heads, and tails. Spawn eggs use the same entity system. Villagers expose authored dialogue and a real inventory trade. Bosses have reduced-health attack phases and rewards. Ordinary entities are recreated after dimension transitions rather than serialized.

`Explosions.ts` caps simultaneous primed charges, processes at most 120 queued block-destruction candidates per frame, checks material blast resistance, and primes nearby TNT with short randomized fuses. A shared particle system, temporary light, synthesized sound, and optional camera shake provide feedback. Blast resistance is implemented; ray-based obstruction propagation is not.

## Cinematic Tour

`TourSystem.ts` scans for samples of each registered Overworld biome, then adds village and ancient-stair landmarks. It reports mapping/chunk-loading progress, streams the live world around the destination, and moves the camera through short orbiting shots. Tour mode uses the spectator camera and can be cancelled; absent biomes in a constrained seed are labeled rather than silently described as present. The end-to-end browser scenario exists but has not been run.

## Rendering And Audio

`Environment.ts` orchestrates water, lighting, weather, and post-processing. It attempts three filtered directional shadow cascades and falls back to one filtered shadow map if cascade initialization fails. `SkyAtmosphere.ts` ray-marches a bounded 3D cloud field and shades stars, comets, aurora, Sift rings, and rainbows. `LightShafts.ts` supplies camera-following translucent sun-aligned meshes with a simple animated alpha shader; it is a visual approximation, not shadow-aware volumetric transport. `Underwater.ts` uses scene depth for absorption, color shift, subtle distortion, and shaft approximation; the terrain PBR plugin animates seabed caustics. An optional software ray-tracing toggle enables Babylon SSR's screen-space ray marching against visible depth; it can add reflections to visible surfaces but cannot hit off-screen geometry and is not full-scene path tracing. Water and mirrors also use bounded planar reflection textures. Nearby emissive blocks/furnaces receive a limited number of point lights, and rain can enable reflective puddle decals. Storm lightning invokes synthesized, delayed thunder. A scheduled red blood-moon night tints the visible disc, ambient light, and fog; it is not a physically modeled orbital eclipse. Lower presets reduce sample counts, resolution, shadow-map size, and reflection updates. SSAO, path tracing, and participating-media integration remain future work.

Textures and item artwork are procedurally original. A 512 x 512 atlas holds two 16-pixel tiles per block with metallic/roughness, normal, and emissive maps. Greedy-mesh UVs repeat each block tile using a GLSL/WGSL material plugin. Seasonal colors modify foliage; version-two generation also creates winter snow and shallow ice, then thaws it by remeshing without touching player edits. Rain adds PBR clear coat and lower roughness. `Tornado.ts` ray-marches a rotating funnel and applies bounded player forces and sparse terrain destruction. These systems are not a full climate/fluid simulator.

`Audio.ts` synthesizes effects, biome-responsive drones and occasional notes, filtered wind/rain, water ambience, bird calls, and resonance sounds after a user gesture. Storm strikes can schedule a low synthesized thunder roll. Optional NPC speech uses browser speech synthesis. Effect and music gains are managed independently; the score is lightweight procedural synthesis, not a recorded soundtrack, and a full spatial mixer remains future work.

## Portals And Characters

`Portals.ts` groups non-solid portal markers into flat shader apertures instead of rendering portal cubes. Each active destination has a small separate Babylon scene, actual seeded terrain, and a render target used by the animated pixel-rift shader. Previews are bounded and lower frequency than the main renderer. They are not recursively rendered or geometrically exact portal-camera transforms. Mirrors use bounded planar reflection textures.

`portalRules.ts` defines a testable five-note sequence. The ancient-city gate writes actual Sift portal markers, persists the unlock, and enables rare natural rifts through generator configuration. Sift water has spatial iridescence and a Survival damage rule.

`PlayerVisual.ts` uses the same animated humanoid rig as the real 3D character-creation/inventory preview. The first-person arm uses the chosen skin and sleeve colors. Character preferences live in IndexedDB and each world's save. `Panorama.ts` renders an independently disposable low-cost terrain scene behind the classic title menu, with artwork retained only as a startup/unavailable-renderer fallback.

## Persistence

IndexedDB database `mass-awakening` has `worlds` and `settings` stores. World schema version 1 contains world identity, seed/preset, player state, inventory/equipment, dimension edits/return positions, machines, clock, weather, seasons, and boss defeat flags. Autosaves and explicit saves are awaited in a serialized sequence. Regenerable chunk arrays are never stored. The earlier 0.1 ZIP uses a separate `aetherforged-db` layout; this build does not migrate those records and leaves that database untouched.

Imports validate dimensions, inventories, finite coordinates, registered blocks, and machine state before assigning a new world ID. Export preserves the complete current save. Corrupt local records are retained on disk and excluded from the playable list with a diagnostic warning, rather than deleted.

## Multiplayer Boundary

`Transport` abstracts messaging. `WebSocketTransport` connects, reports status, sends typed packets, rejects malformed top-level messages, and can be replaced without changing terrain generation. The UI explicitly offers a connection diagnostic, not a fake join button.

A production server must own authentication, world identity, chunk edits, inventory/crafting transactions, entity spawning and damage, dimension transitions, clock, saves, and anti-cheat validation. Add sequence numbers, snapshots/deltas, edit reconciliation, spatial subscriptions, bandwidth limits, and reconnect recovery before connecting this transport to gameplay. Never trust the current client `edit` message as authoritative.

## Extension Points

Add content through `BLOCKS`, `BIOMES`, `RECIPES`, `SMELTING`, and `DIMENSIONS`. Split storage into vertical sections when increasing world height. Add protocol adapters above the simulation boundary rather than moving authority into React. Preserve world schema migrations when extending persistent entity state.
