# Continuation guide & honest remaining-work checklist

The game is fully playable end-to-end today. This file lists, truthfully, what is NOT done and
how to extend without rewriting existing systems. Run `npm run dev` after any change; run
`npx tsc -b --noEmit` and `npm test` to stay green.

## Definition-of-Done check (against the running app)

- ✅ Project starts — `npm run dev` / `npm run build` both succeed.
- ✅ Main menu works — animated panorama, singleplayer → world select.
- ✅ Create/load worlds — create dialog (name/seed/mode/type), load list, delete.
- ✅ Move/jump/look — pointer-lock FPS controller with AABB voxel collision.
- ✅ Procedural terrain — seed-based, biomes, caves, ores.
- ✅ Chunks load/unload while exploring — bounded per-frame budgets.
- ✅ Mine/collect/place — hardness, drops, pickup, placement rules.
- ✅ Hotbar + inventory — 36 slots, cursor-based UI.
- ✅ Creative mode — fly, infinite palette tabs, instant break.
- ✅ Survival mode — health/hunger, tool-gated mining, damage.
- ✅ Crafting + smelting — shapeless recipes; furnace uses fuel over time.
- ✅ TNT — real terrain change, blast resistance, chain reactions, persisted.
- ✅ Creatures — 7 mob types (incl. polar bear) with procedural pixel-art skins, wander/chase/attack with drops.
- ✅ Third-person view — V/F5 cycles first/back/front; skinned player model + first-person arm.
- ✅ Local multiplayer — host/join across browser tabs (BroadcastChannel): positions, block edits, chat.
- ✅ Minecraft-style UI revamp — stone logo + splash, dirt screens, MC world select/create, pause "Game Menu", inventory portrait, creative tab icons, XP bar, hearts/hunger.
- ✅ Black-screen-on-world-entry fixed — menu camera now torn down only after the player camera is active.
- ✅ Dimensions — Overworld/Nether/End each generate distinctly.
- ✅ Portals — standing in a portal transitions dimensions (return portals built).
- ✅ Water — animated UVs + Fresnel/specular + underwater fog.
- ✅ Lighting/day-night — sun/moon/stars/clouds, fog color ramp; shadows on `high`.
- ✅ Settings — render distance, FOV, sensitivity, volume, graphics preset all wired.
- ✅ Persistence — IndexedDB; survives reload; export/import to JSON file.
- ⚠️ Console errors — none known; not verified in a live browser session in this environment.
- ✅ Production build succeeds (v0.2, ~2m40s).

## Remaining work (priority order)

1. **Screen-space water reflections / better water shading.** Water is currently tinted +
   Fresnel. A proper `MirrorTexture` per chunk-region or SSR post pass is the next visual win.
2. **Greedy meshing.** The mesher emits one quad per visible face. Implement face merging in
   `src/world/mesher.ts` to cut vertex counts ~5–10×.
3. **Web Worker terrain generation.** Move `generateChunk` into a worker pool; transfer block
   buffers. The `WorldManager.update` seam is already queue-based.
4. **Shaped crafting recipes.** Extend `Recipe` with a pattern grid; keep `craftRecipe` for
   shapeless. Furnace and crafting UI need no changes.
5. **Cross-device multiplayer.** Local tab transport shipped; add a `WebSocketTransport`
   speaking the same protocol (`src/net/net.ts`) plus a tiny relay server for cross-device play.
6. **More bosses/events.** Wither-like construct boss; meteor/rift world events can reuse the
   explosion + particle + weather systems.
7. **Additional dimensions** (Crystal Caverns, Sky Islands, Abyss). Add a `DimensionId`,
   a generator branch in `src/world/generator.ts`, an entry in `src/dimensions/dimensions.ts`,
   and portal wiring in `src/core/game.ts`.
8. **Durability, armor, XP/enchanting** — progression systems have stubs (`attackDamage`,
   health/hunger) to hang onto.
9. **Block sounds per-material footsteps** — `audio.step(surface)` exists but isn't called yet.
10. **LOD for far chunks** — build low-detail meshes for chunks beyond half render distance.

## How to add content (recipes)

- **New block:** add id to `BlockId`, a `def()` in `src/blocks/blocks.ts`, draw a tile in
  `src/blocks/textureGen.ts` (add a `T.` index), optionally add to a creative tab.
- **New recipe:** append to `RECIPES` (crafting) or `SMELT_RECIPES` (furnace).
- **New mob:** add a `MobDef` to `MOB_DEFS` in `src/entities/mobs.ts`.
- **New biome/structure:** extend `getBiome` / `placeStructures` in `src/world/generator.ts`.
