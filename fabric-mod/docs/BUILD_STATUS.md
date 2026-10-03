# Verification record

## 2026-10-03 — the mod compiles and boots (CI green)

GitHub Actions (`Enter the Sift — build & validate`) now does what this workspace cannot: it installs a JDK
and Gradle, resolves Minecraft 26.3 + Fabric, and builds. Runs **37088920699** (first full compile) and
**37090005761** (with the `/sifttide` runtime checks below) finished with every step green:

- `python3 tools/validate.py` — 601 JSON/metadata files, 149 functions, models/textures, animations, wrapper, nine biomes.
- `python3 tools/test_data.py` — 52 offline contract tests.
- shaderpack compile check (glslang) — the optional Iris pack in `shaderpack/` compiles.
- `./gradlew build` — **the whole mod compiles**: `compileJava` (server) and `compileClientJava` (sky, rift
  renderer, models...) both produced class files, and the JAR is remapped and uploaded.
- "built-in shader pack inside the jar" check — the bundled Iris pack is really in the artifact.
- **server smoke test** — a real Minecraft 26.3 dedicated server boots with the mod, and `SIFT-SMOKE`
  loads Sift chunks, every custom feature, all nine biomes, every creature, the rift anchors and the
  1,3,7,6,5,2,4,8 ritual, then halts. `tools/smoke_report.py` turns any registry, codec, command or
  exception in that log into a CI error; there were none.

Fixes that got it there, all found by CI rather than by hand: the `/sifttide` feedback now goes through
`Component` instead of hand-built JSON (which is why the raw string literal broke the parser), the command
tree's missing closing paren, `SharedSuggestionProvider.suggest(String[])` not existing in 26.3 (the bare
literals tab-complete on their own), a scalar `mix` helper in the rift renderer and a `double` sky-ray
spread that had to be `float`. The client source set had never compiled before; now it does.

Runtime checks added in the same pass: the smoke test now **executes** every `/sifttide` and `/sift tide`
branch against the real dispatcher and reads the Overworld clock back, so the command can no longer be
"compiled but dead". It found three real bugs the compiler could not see:

- `LAVA_LAMP` parked the clock at 6000, which is inside the **flow** clock band, so `/sifttide lava_lamp`
  used to show the flow dome. Its canonical tick is now 18000, and `tools/test_data.py` asserts that every
  tide's tick sits inside its own band.
- The whole `/sifttide ...` path was **dead**: it was registered with the alias node, so the dispatcher
  wanted `/sifttide tide ...` and answered "Incorrect argument for command" to every documented spelling.
  The alias tree is now built per name (`/sifttide <subcommand>` and `/sift tide <subcommand>`), and a bare
  `/sifttide` prints the summary.
- The locked clock could wander up to 100 ticks between re-asserts; `syncIfDrifted` is now called every
  server tick, and `/sifttide time <ticks>` parks the lock on that tick (so a tide can be walked through
  its own stages) while adopting the tide of the time it lands in.

The real-server proof, straight from run 37090005761's annotations:

```
SIFT-SMOKE anchors: rifts=1 portals=1 wrongType=0
SIFT-SMOKE tide locked on thrive: tide=THRIVE (want THRIVE), locked=true, clock=13020 (want ~13000)
SIFT-SMOKE tide cycle off after time 1000: tide=FLOW (want FLOW), locked=true, clock=1020 (want ~1000)
SIFT-SMOKE ritual: portalMarker=true portalAnchor=false portalBlocks=true stillOpening=false  (0.17+: the anchor is retired once the block portal fills the frame)
```

Honest limits of this record: there is no client run, no screenshot, no audio check and no GPU/GLSL check of
the in-game rift shaders (`rift.vsh`/`rift.fsh` are only checked for includes and structure, and the Iris
pack only for compiling). Nobody has played it yet. Everything below is the older, pre-CI record.

## 2026-09-27 — offline pass (superseded by the run above)

## Passed in this workspace — 0.2 visual pass

- Parsed 99 JSON / animation metadata files.
- Resolved references among 67 server functions.
- Checked local model and texture links, animated PNG frame metadata and PNG headers.
- Checked shader include paths, dimension routing declarations, day/night clock declarations, six-note glow mapping, rift visual cleanup contracts and a 27-display per-rift budget. These are static checks, not GLSL compilation.
- Checked the Gradle wrapper JAR signature and three biome definitions.
- Passed all 20 offline data-contract tests in `tools/test_data.py`.
- Re-ran the deterministic asset generator and compared generated file hashes: no differences.
- Preserved the existing browser application without editing its source or dependencies.

## Blocked / not run

- `./gradlew --no-daemon build`: stopped before compilation because `JAVA_HOME` is unset and Java is not installed.
- Tried fetching a Temurin 25 JDK via GitHub Releases: TLS connection to `release-assets.githubusercontent.com` failed.
- Tried Mojang/Fabric metadata and Maven endpoints: TLS connection failed.
- Tried installing a local JDK and GLSL validator from Debian packages: repository network connections failed; packages unavailable.
- Therefore **no compiled mod JAR**, Java/JUnit result, Minecraft startup result, worldgen-codec validation, command-loader validation or GPU shader result exists for this build.
- GitHub Actions is configured, but not executed or claimed successful.

The code follows the 26.3 Fabric example and uses current-version vanilla data templates. That reduces version drift; it does not establish compatibility. Treat this as an experimental source alpha, not a released mod.
