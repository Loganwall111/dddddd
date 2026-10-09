# MASS AWAKENING — Architecture

## Stack

- **TypeScript + Vite** — build tooling; `npm run dev` / `npm run build`.
- **Babylon.js** (`@babylonjs/core`) — rendering engine. WebGPU is attempted first via
  `WebGPUEngine.initAsync()` with a hard fallback to the WebGL/WebGL2 `Engine`
  (`src/core/game.ts` → `createEngine()`).
- **IndexedDB** — world persistence (`src/persistence/storage.ts`).
- **WebAudio** — all sound effects are synthesized procedurally (`src/audio/audio.ts`),
  so no binary audio assets are required.
- **Runtime-generated pixel-art** — the texture atlas and all item icons are drawn to
  canvases at startup (`src/blocks/textureGen.ts`). No external image assets.

## System map

| Directory | Responsibility |
| --- | --- |
| `src/core/game.ts` | Game orchestration: engine/scene setup, render loop, world lifecycle, save/load, mode switching, dimension transitions, boss/weather/drops/mobs/furnace ticking. |
| `src/world/` | Chunk data (`chunk.ts`), deterministic terrain generation (`generator.ts`, `noise.ts`), face-culled meshing (`mesher.ts`), chunk streaming/raycast/persistence (`worldManager.ts`), weather (`weather.ts`). |
| `src/blocks/` | Data-driven block registry (`blocks.ts`) and procedural texture atlas (`textureGen.ts`). |
| `src/player/player.ts` | First-person controller: AABB voxel collision, gravity/jump/flight, DDA raycast targeting, mining progress, placement. |
| `src/inventory/` | Slots/stacks, recipes (`inventory.ts`), chest containers (`chest.ts`). |
| `src/crafting/furnace.ts` | Furnace state machine + smelting recipes. |
| `src/entities/` | Item drops (`drops.ts`), mobs (`mobs.ts`, `mobManager.ts`), End dragon boss (`boss.ts`). |
| `src/dimensions/dimensions.ts` | Dimension registry (Overworld / Nether / End). |
| `src/explosions/explosions.ts` | TNT blast raycasting with falloff + chain reactions. |
| `src/rendering/sky.ts` | Sky dome, sun/moon, stars, clouds, day-night cycle, fog, glow, shadow generator. |
| `src/persistence/storage.ts` | IndexedDB world metadata + per-dimension chunk stores, export/import. |
| `src/ui/ui.ts` | All DOM UI: main menu, world select/create, HUD, pause, inventory/crafting, furnace, chest, boss bar, death screen. |
| `tests/logic.test.ts` | Unit tests for pure logic (`npx tsx tests/logic.test.ts`). |

## Key design decisions

1. **Data-driven content.** Blocks, items, recipes, smelting recipes, fuels, biomes,
   dimensions, and mobs are table-driven. Adding content should not require engine changes.
2. **Chunk streaming.** `WorldManager.update()` generates N chunks and rebuilds M dirty
   meshes per frame (bounded budgets), unloads beyond render distance, and keeps a cap on
   resident chunk count. Block edits mark the chunk + edge neighbors dirty.
3. **Rendering.** One merged opaque mesh + one water mesh per chunk, sharing a single
   nearest-sampled atlas material. Water uses a separate repeating texture with animated UV
   offsets and a Fresnel emissive term. Backface culling is disabled on chunk materials as a
   guard against winding issues (faces are pre-culled in the mesher).
4. **Persistence.** Only chunk block arrays are stored (per dimension store). Chests,
   player state, inventory, time-of-day, and world settings live in the world metadata record.
5. **Singleplayer-first, multiplayer-ready seams.** See `docs/MULTIPLAYER.md`.

## Performance levers

- `settings.renderDistance` (3–16) — chunk radius.
- `settings.graphics` — internal render resolution (hardware scaling level), glow on/off,
  dynamic mob shadows on `high`.
- Generation/mesh budgets in `WorldManager.update(maxGen, maxBuild)`.
- Explosion processing is ray-bounded (fixed ray count) and chain reactions are scheduled via
  timeouts, so a large TNT grid cannot freeze a frame.
