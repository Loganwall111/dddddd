# MASS AWAKENING

A cinematic, fully playable voxel sandbox game that runs in the browser — built with **Babylon.js**, **TypeScript**, and **Vite**.

Mass Awakening pairs the nostalgia of classic block-building sandboxes with modern rendering: a dynamic day/night cycle, animated reflective water, procedural multi-biome terrain across three dimensions, TNT chain explosions, crafting + smelting, survival stats, mobs, an End dragon boss, weather, and a creative sandbox mode — all with original, runtime-generated pixel-art and synthesized audio (no ripped assets).

## Quick Start

```bash
npm install
npm run dev        # dev server → http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build
npm test           # run logic unit tests
```

Open the app in a desktop browser (Chrome/Edge/Firefox). WebGPU is used automatically when
available, otherwise it falls back to WebGL2/WebGL. Click the canvas to lock the mouse and play.

## Controls

| Input            | Action                                         |
| ---------------- | ---------------------------------------------- |
| **W A S D**      | Move                                            |
| **Mouse**        | Look                                            |
| **Space**        | Jump / fly up (creative)                        |
| **Shift**        | Sprint (survival) / fly down (creative)         |
| **Left Click**   | Mine block / attack mob or boss                 |
| **Right Click**  | Place block / use item / interact (furnace, chest, portal) |
| **T**            | Prime the TNT block you're aiming at            |
| **1–9 / Wheel**  | Select hotbar slot                              |
| **E**            | Open/close inventory (crafting grid)            |
| **F**            | Toggle flight (creative)                        |
| **V / F5**       | Cycle camera: first person ↔ third person       |
| **Enter**        | Chat (in multiplayer)                           |
| **Esc**          | Pause menu / close open UI                      |

## Feature status

| Area | Status |
| --- | --- |
| Main menu (blurred live 3D panorama, stone logo + splash, Minecraft-style screens) | ✅ Implemented |
| Procedural terrain, 10+ biomes (birch forest, taiga, desert w/ sandstone, frozen lakes), caves, ores, 3 tree species, ruins | ✅ Implemented |
| Chunk streaming + face-culled meshing + dirty rebuilds | ✅ Implemented |
| Mining with progress/hardness/tools, placing, item drops, pickup | ✅ Implemented |
| Hotbar + XP bar + hearts/hunger, inventory with portrait & armor slots, creative tabs with icons | ✅ Implemented |
| Crafting grid (shapeless recipes) + furnace smelting with fuel | ✅ Implemented |
| Survival: health, hunger, fall damage, eating, death/respawn | ✅ Implemented |
| TNT explosions with falloff, blast resistance, chain reactions | ✅ Implemented |
| Mobs (zombie, skeleton, pig, cow, sheep, chicken, polar bear) with pixel-art skins | ✅ Implemented |
| Three dimensions (Overworld / Nether / End) + working portals | ✅ Implemented |
| End dragon boss with boss bar and loot drop | ✅ Implemented |
| Chests with persistent storage UI | ✅ Implemented |
| Day/night cycle, sun/moon, stars, clouds, fog, glow, optional shadows | ✅ Implemented |
| Animated water with Fresnel + underwater tint | ✅ Implemented |
| Weather: rain particles + thunder | ✅ Implemented |
| IndexedDB persistence (chunks, player, inventory, chests, time) | ✅ Implemented |
| Settings that change behavior (render distance, FOV, sensitivity, volume, graphics) | ✅ Implemented |
| WebGPU with WebGL2 fallback | ✅ Implemented |
| Multiplayer (host/join across tabs of one browser, synced positions/blocks/chat) | ✅ Local transport (see `docs/MULTIPLAYER.md`) |

## Documentation

- `docs/ARCHITECTURE.md` — system map, key design decisions, performance levers.
- `docs/MULTIPLAYER.md` — multiplayer status, seams, and server-authoritative requirements.
- `docs/CONTINUATION.md` — honest remaining-work checklist and how to continue.

## Notes & limitations

- Water "reflections" are specular + Fresnel approximations, not screen-space reflections.
- Mob models are stylized box-creatures (original, non-infringing).
- Crafting is shapeless-multiset; shaped-grid recipes are a future extension.
- The End dragon is a simplified encounter (circle → dive loop), not a multi-phase scripted fight.

Mass Awakening is in active development.
