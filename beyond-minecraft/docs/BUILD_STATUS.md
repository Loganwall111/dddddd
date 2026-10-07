# Beyond Minecraft — build and runtime verification

**Target:** Minecraft Java **1.21.1 exactly**, Fabric, Java 21.

## Current verified record

**Verified source commit:** `617eff0299f0956e5f3c1ebb2c5b6032ea40befa`
**Evidence:** [build, in-world playtest and captures, run 37691437469](https://github.com/Loganwall111/dddddd/actions/runs/37691437469) — **all checks green**, and this run published its own evidence to [`docs/runtime/`](runtime/index.html).

| Layer | Evidence |
|---|---|
| Generated resources | 530 generated resources reproduced byte-for-byte from seed 84921603; 19 Python tests passed; resource, shader, mixin and generator contracts validated |
| Native GLSL | Both GLSL 150 programs compiled **and linked** with glslangValidator, plus the structural shader lint |
| Java | Common and client sources compiled for Java 21; **30 JUnit tests, zero failures** |
| Real dedicated server | Actual Minecraft registry codecs loaded; every realm generated chunks and a safe landing; journey/root/realm NBT and scale checks passed |
| Real Minecraft client | Mesa/Xvfb software OpenGL, 960×540: native programs loaded, post-process frames rendered, and the in-world integration suite passed |
| In-world integration | World travel (root → realm → nested realm → root), inventory clone/mutation/restore, player NBT persistence, keepInventory-OFF death and non-resurrection, scale extremes 1/1024× → 4096×, sky well as a persistent client node, measurable lensing, tidal stretch applied to a rendered creature, tear → hub → fractal → labyrinth travel, an armed and torn-down wormhole corridor, the Umbrella branch rewrite, and foreground depth occlusion |
| Screenshots | 25 real client captures uploaded with the run (`Beyond-verification` artifact, `run/screenshots/beyond-*.png`) and rendered as a gallery at [`docs/runtime/GALLERY.md`](runtime/GALLERY.md) |

**Installable alpha from that run:** `beyond-minecraft-0.1.0-alpha.jar` — 478,070 bytes,
SHA-256 `c11fac12a9774fc40fa70d467097d903fab12012f7cce0aa6c9293e9476884d4`
(`-sources.jar` 403,559 bytes, SHA-256 `e197807199a872be4c02616105ee206fff23396176393713a4d97f21285819f8`).
The JAR is built by CI; commit documentation edits only, so a later commit does not invalidate it.

The publishing job now runs automatically after every push to a session branch (`arena/*`), so the
captures and the verified JAR from a green run land in `docs/runtime/` and `releases/` on their own;
**Actions → Beyond the Threshold — build, playtest & capture → Run workflow** with **publish_snapshot**
enabled remains as a manual path. Each publish replaces the previous snapshot's frames rather than
accumulating them, refuses to attach an old binary to edited sources, and never force-pushes.

## Defects found and corrected on the way to this record

- **Realms could not load at all.** The 1.21.1 biome spawner codec takes lower-case registry ids
  (`creature`, `water_creature`, `ambient`); the generator wrote upper-case enum names.
- **Boreal Memory filled its whole world.** The plateau density was inverted, so the realm was solid
  up to the build limit and had no safe arrival.
- **Arrival searches landed in crawl spaces.** Safe landings now require a block of headroom above
  the body, so an opening can be formed where you arrive.
- **The fractal hollow had no reachable landing.** The Menger sponge repeats to the world ceiling,
  so it now builds a small deterministic arrival pad.
- **Tidal stretching never applied to mobs.** Mob renderers replace the render method, and the
  compositor hook the harness asserted on was never reached; the stretch is now hooked at the
  renderer and at the entity render dispatcher (deduplicated by a depth guard).
- **The wormhole corridor was invisible.** The tunnel session advanced on the server but was never
  synced, so the client never started the time-tunnel overlay.
- **Foreground occlusion was broken for off-centre pixels.** The lens rejected occlusion with a
  ray-entry heuristic that fails whenever the ray meets the integration domain to one side of a
  nearby well. It now compares the surface distance with the near edge of the lens
  (`max(0, |centre| - 2.6·rs)`), which the fixture measures as **drift 68 → 0** against a scene
  control of 1.

## Limits of this verification

Java and Minecraft execution run in GitHub Actions under **software OpenGL**; no target-GPU FPS claim
is made, and Iris/Sodium or real vendor drivers still need their own passes. The harness fixtures are
disposable (`beyond-ci`); servers, multiplayer, VR and long-session play are not covered here.
See [TEST_PLAN.md](TEST_PLAN.md) for the manual matrix that remains.

The screenshots committed under `docs/runtime/` are real, unedited Minecraft captures of the newest
green run on this branch — CI writes them there after each successful in-world suite, alongside
`index.html`, `verification.json` and the tail of the client log. The same frames always accompany
the run itself in the `Beyond-verification` artifact.
