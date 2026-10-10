# QA And Reproduction

For the **Aetherforged: Reincarnated / Worlds Reborn 0.2** changes, also run the scenarios in `worlds-reborn.md`. The browser suite now includes character persistence, expanded spawn-egg inventory, the resonance puzzle, and Sift travel. Older steps below remain useful for the preserved core loop; button labels now use the classic UI terminology.

## Verification Boundary

Dependencies and browser binaries are not installed in the current workspace. **No production build, TypeScript/unit tests, Playwright run, manual gameplay pass, or GPU validation has been executed here.** The following commands and scenarios are pending acceptance work, not a list of claimed passes.

## Automated Checks

Run `node scripts/verify.mjs` for TypeScript and unit checks. Install Chromium with `npx playwright install chromium`, then run `node scripts/verify.mjs --browser`.

The Playwright configuration starts Vite automatically and selects software WebGL for reproducibility. It does not benchmark hardware performance or validate browser WebGPU on a physical device. Screenshots and traces are retained on failure.

The `?qa=1` development hook exposes the live `Game` instance for deterministic scene fixtures. Browser tests still use actual UI, keyboard, and mouse actions for movement, mining, placement, inventory, and menu flows.

## Manual Smoke Pass

1. Open the title at 1440 x 900, 1280 x 720, and 390 x 844. Confirm artwork loads, controls remain inside the viewport, keyboard focus is visible, and dialogs close with Escape.
2. Open Graphics. Switch presets, distance, reflections, shadows, bloom, and the software ray-traced reflections toggle. Confirm Balanced/Cinematic SSR behavior, then try the toggle off and on while viewing wet ground and water. Open Accessibility and enable reduced motion. Reopen the browser and confirm settings persist.
3. Create a Creative world with seed `QA-ALPINE-2026`. Wait for real spawn generation. Click Begin exploring, verify pointer lock, look, move, jump, sprint, crouch, and fly. Test the Alt look fallback separately.
4. Mine a grass/stone/log block. Confirm the outline, progressive cracks in Survival, world mesh change, pickup, inventory count, hotbar selection, and placement. Attempt placement inside the player and against an occupied cell.
5. Move at least 600 blocks in two directions. Observe full-resolution chunk count, background horizon, loading boundaries, returning edits, and disposed meshes using the browser memory/performance tools.
6. Search Creative inventory for glass, TNT, portals, and tools. Click to equip, drag into another slot, switch to Backpack, split a stack, quick-move it, and close with a cursor stack. Check no item loss or duplication.
7. Switch to Survival. Mine wood, craft planks and sticks, use a crafting bench for a pickaxe, and verify ingredient consumption and tool durability. Attempt an invalid recipe and a full-inventory craft.
8. Put iron ore into a furnace and coal or wood into fuel. Wait five seconds in its interface. Verify ore/fuel consumption, output, blocked output behavior, and saved processing state.
9. Fill a chest, close/reopen it, save/reload, then mine it. Its contents should drop and the container record should disappear. Test the same with a furnace and an explosion.
10. Place a three-charge TNT chain near terrain. Right-click the first charge. Verify timed fuses, flashes, sound, particles, block destruction, chain activation, resistance of obsidian, player knockback, and saved craters.
11. Check sheep wandering/fleeing and pickup of drops after combat. Set night and wait for shades to spawn. Verify Peaceful suppresses new hostiles and disables their attacks.
12. Activate a natural portal, then visit each realm through the pause menu. Mine and place distinct blocks in each. Return to Overworld and confirm dimension-specific edits and return positions.
13. Fight Riftwing and the Cinder Warden. Verify the attack warning is visible before damage, attacks can be dodged, health changes, low-health phases alter behavior, defeat rewards appear, and a defeated boss stays defeated after reload.
14. Change time to sunset/night. Verify sky, lighting, stars, shadows, and water reflections. Swim below the water surface. Check rain/storm response, all four seasonal palettes, and the Winter nighttime aurora.
15. Take fall damage, eat, recover health, run hunger down, die, and respawn. Test a death far from the origin to exercise spawn streaming. Reload a world saved on the death screen.
16. Save and quit. Rename, export, delete, and import the exported world. Reload and inspect inventory, coordinates, player changes, containers, furnaces, dimension edits, and clock. Reject malformed and oversized imports.
17. Repeat key rendering/interactions with the browser's WebGPU backend (`?renderer=webgpu`), then force `?renderer=webgl`. Inspect errors, warnings, workers, requests, shader compilation, texture orientation, and graphics-resource cleanup.
18. Record actual frame time, minimum/median FPS, chunk count, memory usage, browser, GPU, resolution, and preset. Do not infer a performance guarantee from the presence of an FPS display.

## Known Verification Risks

- Custom GLSL/WGSL world-space atlas plugin requires real GPU compilation tests; production bundling alone cannot validate shaders.
- Headless browsers can deny pointer lock; use a headed Playwright run for pointer-lock-specific failures.
- Babylon WebGPU initialization may request its shader translation resources from Babylon's CDN; offline deployments should self-host those resources.
- Private browsing, quotas, eviction, or blocked IndexedDB can prevent saving. Export backups before clearing site data.
- Loose entities and primed TNT are intentionally not in save schema v1. Do not treat reloading as a supported way to preserve an active explosion or dropped items.
