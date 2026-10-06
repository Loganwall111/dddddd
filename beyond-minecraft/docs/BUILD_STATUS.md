# Beyond Minecraft — verified alpha record

**Date:** 2026-10-06 · **Target:** Minecraft Java **1.21.1 exactly**, Fabric, Java 21.

## Installable deliverable

- `releases/beyond-minecraft-0.1.0-alpha.jar` — **213,619 bytes**.
- Tested implementation commit: `5feb4ab977ff7fe8112ba86ef34f755a60cc8c39`.
- Successful [build and in-world checks, run 37465039463](https://github.com/Loganwall111/dddddd/actions/runs/37465039463).
- SHA-256:
  `c211c1ec94f899e752d6174a3ac4c8eba6f043810c4666746ecf70749f6af554`.
- Machine-readable provenance: [runtime/verification.json](runtime/verification.json).
  Subsequent documentation/publication-policy edits do not change the tested Java, shaders or generated resources.

## Checks that actually passed

| Layer | Evidence |
|---|---|
| Resources | 198 JSON/metadata documents; 8 realm definitions, 24 blocks, 37 item definitions; model/texture/recipe/uniform links |
| Generation | 233 artifacts reproduced byte-for-byte from seed 84921603; 10 Python tests passed |
| Java | Common and client sources compiled for Java 21; 30 JUnit tests, zero failures |
| Native GLSL | Both GLSL 150 programs compiled **and linked** using glslangValidator |
| Offscreen GPU | 15 synthetic-buffer regression checks: passthrough, foreground rejection, horizon capture at 32/48/72 steps, nonempty membrane and all six lens families |
| Real dedicated server | Actual Minecraft registry codecs loaded; all 8 realms generated chunks/safe landings; journey/root/realm NBT checks passed |
| Real Minecraft client | Mesa/Xvfb, 960×540; native programs loaded; **681 post-process frames**; real screenshots captured |
| Real-player travel | Root → A → B → root → A; first-copy inventory, independent realm mutation and root restoration passed |
| Real-player persistence | Vanilla player NBT includes the journey; actual keepInventory-OFF death, root respawn and non-resurrection of dropped realm inventory passed |
| Scale | Small scale and same-tick normal reset executed successfully with dimension recalculation |
| Actual depth | A solid wall between camera and a local singularity remained unchanged across effects OFF/ON: **maximum RGB-channel difference 0 across 20 samples** |
| Packaged archive | ZIP integrity, exact Minecraft/version metadata, Java class-file major 65, 8 dimensions, GLSL and production mixin refmap checked; JAR hash matches CI |

The screenshots in `docs/runtime/` are **actual, unedited Minecraft captures**, not concept
art. The offscreen GPU tests are separately identified; their synthetic input is not passed
off as Minecraft gameplay. The native test log is [here](runtime/latest-client-log.txt).

## Defects found and corrected before this snapshot

- Reserved GLSL identifiers (`noise3`, `active`) and a worldgen IntProvider schema mismatch.
- A near-camera lens-domain check that incorrectly painted over foreground geometry.
- A render-tail hook after vanilla's hand depth clear, which incorrectly treated terrain as sky.
  Compositing now runs in `WorldRenderEvents.LAST`, before hand and HUD rendering.
- The sky lens obscuring most of the introductory eye.
- Same-tick scale reset using stale entity dimensions.
- Default screen blur blurring the guide's own text instead of only the world.
- An integration-test kill attempted before vanilla teleport protection ended.
- Client test simulation-distance settings outside Minecraft's permitted range.
- Metadata that previously allowed untested later 1.21.x versions.

## Limits of this verification

Java and actual Minecraft execution ran in GitHub Actions, not in this workspace: this
workspace has no JDK, and direct Fabric/Mojang/Maven downloads fail. Local resource tests,
native GLSL and offscreen rendering also ran successfully. The real client used software
OpenGL; **no target-GPU FPS claim is made**. Native runs used Loom's real development
client/server, followed by inspection of the remapped installable JAR; a launcher-based
customer installation is still part of manual acceptance.

Still open: two-client/dedicated multiplayer, actual walking through every portal orientation,
keepInventory ON and modified respawn rules, full restart/reconnect/component-heavy inventory
matrices, cursor/crafting/modded containers, resize/FOV/third person/view bobbing, resource-pack
failure/reload scenarios, unusual world borders, extended play, balance, accessibility review,
Iris/Sodium/other renderer mods, macOS and real NVIDIA/AMD/Intel drivers. See [TEST_PLAN.md](TEST_PLAN.md).

This is a bounded **0.1 alpha**, not an assertion of infinite live registries, seamless live
portals, realistic fluids/ragdolls/nuclear simulation, a physical humanoid world, or AAA fidelity.
