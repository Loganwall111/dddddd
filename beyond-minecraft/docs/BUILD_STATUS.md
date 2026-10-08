# Beyond Minecraft — verified alpha record

**Date:** 2026-10-08 · **Target:** Minecraft Java **1.21.1 exactly**, Fabric, Java 21 · **Version:** 0.2.0-alpha

This page is the human summary of the newest completed CI run. The machine-readable record it
describes is [runtime/verification.json](runtime/verification.json), which the publish job rewrites
after every green run — if the two ever disagree, that file wins.

## Installable deliverable

- `releases/beyond-minecraft-0.2.0-alpha.jar` — **486,203 bytes**, sha256
  `a3444415eb078cada38a1aa0bf45aae82f0329b12e9fee25825d12b72feefaf2`
  ([`releases/SHA256SUMS.txt`](../releases/SHA256SUMS.txt) is kept in step with the checked-in JAR).
- The JAR is published only when **compilation and the full dedicated-server gate pass**; the
  in-client smoke stage is advisory and never blocks it.
- Last full evidence set: [run 37702987490](https://github.com/Loganwall111/dddddd/actions/runs/37702987490)
  — 30 JUnit tests / 0 failures, every realm loaded and generated on a real dedicated server, native
  GLSL 150 compile + link, real screenshots in `docs/runtime/`.
- Install with [INSTALL.md](../INSTALL.md). This is a bounded alpha, not production-certified: use a
  disposable, backed-up world.

## What a green run proves

| Layer | Evidence |
|---|---|
| Resources | 451 JSON/metadata documents: 12 realms, 60 blocks, 78 items, model/texture/recipe/uniform, mixin and generator contracts |
| Generation | 530 artifacts reproduced byte-for-byte from seed 84921603; 16 Python authoring tests passed |
| Java | Common and client sources compiled for Java 21; 30 JUnit tests, zero failures |
| Native GLSL | All five core programs (`cosmos`, `blit`, `titan`, plus the fullscreen vertex stage) compile **and link** with glslangValidator |
| Real dedicated server | Actual Minecraft registry codecs loaded; every realm generated chunks and a safe landing; the Between's abyss and plate, the sky well, journey/NBT, scale and era tables asserted in-world |
| Real Minecraft client (advisory) | Mesa/Xvfb, 960×540: native programs loaded, real world travel, death/respawn, scale extremes, spaghettification, and screenshots of the tear, Between, fractal hollow and labyrinth; the newest stages stand the voxel colossus in the Overworld and photograph it |

The screenshots in `docs/runtime/` are **actual, unedited Minecraft captures**, not concept art.

## Recent CI history worth knowing

- `37704743043` failed at compile: `TitanWorld.status()` called `Vec3d.x()/y()/z()` instead of reading
  the fields. Fixed in the next commit; the JAR was not published from the failed run.
- The advisory in-client stage used to stop at its wormhole fixture. The fixture now waits for the
  arrival teleport to land, retries aiming higher, and `RealityManager.spawn` names the clause that
  refused, so a refusal is diagnosable from the log instead of guesswork.

## Known-open items

- Interactive multiplayer acceptance from [TEST_PLAN.md](TEST_PLAN.md) is still open.
- True stencil/FBO portals (as opposed to the current shader-side, server-driven ones), runtime
  registry/asset injection, and unbounded dimensions are **not implemented**.
- The Living World Titan is a real voxel body cut from the blocks the world is made of and posed by
  `beyond:titan`; the terrain it stands on is not itself deformed by the chunk programs.
