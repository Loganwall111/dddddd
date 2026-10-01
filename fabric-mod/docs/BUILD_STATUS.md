# Verification record — 2026-10-01

## 0.25.0-alpha: rifts did not work (fixed)

The first CI run of the 0.25.0-alpha source (commit `bc36768`) compiled the jar and passed validation and the
data-contract tests, but **failed the real-server smoke test**, and rifts did not work in game for the same reason:

- 0.25 made rifts night-only by reading the time with `time query daytime`. Minecraft 26.x rebuilt `/time` around
  world clocks and timelines. `daytime` and `day` are no longer keywords, the word after `query` is now read as a
  timeline id, and the server refused to load `rift/create`, `rift/natural`, `rift/punch`, `rift/punch_at`,
  `rift/seed` and `rift/tick` ("Can't find element 'minecraft:daytime' of type 'minecraft:timeline'"). With those
  functions missing, no rift could be created (gauntlet, creative seed block, natural waves, Riftcallers) or ticked.
- The night gate itself was also half-written: two of its three lines were `execute ... ` chains with no `run`, which
  are valid but do nothing, so even a loadable gate would have let rifts open by day.
- `tools/test_data.py` asserted the broken text, which is why validation and the data tests passed.

Fix: one helper, `function entersift:rift/night`, reads the clock explicitly (`time of entersift:sift query time` in
the Sift, `time of minecraft:overworld query time` everywhere else, because the Nether has no default clock) and every
rift function opens with the same two-line gate. The client (`SiftTides.isRiftNight`) uses the identical windows, so
rifts in the Nether and End are drawn exactly while the server keeps them open. Rifts are open during Endure
(13000-23999) in the Sift and 13000-22999 on the Overworld clock elsewhere.

New safeguards: tests that reject legacy `time query` keywords and `execute` chains that never `run`, an interpreter-based
test of the gate across every clock value and dimension, a client/server window-agreement test, and server smoke checks
that drive `rift/natural`, `rift/seed`, `rift/tick` and the gauntlet through day and night in the Sift, Overworld, Nether
and End.

## Checks run locally for the fix

- `python3 tools/validate.py` — passed: 603 JSON/metadata files, 150 functions, local model/texture references,
  animation metadata, wrapper integrity, and 12 Sift biome registrations.
- `python3 tools/test_data.py` — all 61 data-contract tests passed. The new tests fail against the `bc36768` rift
  functions (six failures) and pass against the fix.
- The edited Java files parse with no syntax errors (tree-sitter). Java and Gradle are unavailable in this workspace, so
  nothing was compiled and the 26.3 server was not started locally.

## GitHub Actions build

The workflow runs validation, data-contract tests, shader compilation, the Fabric/Gradle build, shader-pack bundling
checks and the 26.3 server smoke test. It is the authoritative compiler and runtime check; read the latest run on the
branch for the result. The CI artifact, not a locally compiled JAR, is the intended build output.

## Runtime limitations

Even a successful server smoke test cannot establish client-side visual quality. Rift timing/opening animation, sky and
fog blending, animated Ichor appearance, Blub appearance/spawning, portal return behavior, and biome terrain density still
need an in-game client playtest. Worldgen codecs and command behavior are only runtime-verified to the extent covered by
the Actions server smoke test.
