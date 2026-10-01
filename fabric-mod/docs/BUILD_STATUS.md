# Verification record — 2026-09-30

## Passed in this workspace

- `python3 -m py_compile tools/*.py` — all Python tools parsed.
- `python3 tools/phase19.py` — completed; deterministic generation is repeatable.
- `python3 tools/validate.py` — passed: 602 JSON/metadata files, 149 functions, local model/texture links, PNG/animation metadata, wrapper signature, and 12 biomes.
- `python3 tools/check_shaders.py` — structure checks passed for 82 programs; `glslangValidator` is unavailable, so actual GLSL compilation was skipped.
- `python3 -m unittest tools.test_data -v` — 53 offline data-contract tests passed, including Sift clock isolation, symmetric animated ichor, rare/dry worldgen, Canopy fossils, two-way portal routing, and night-only rift tint/lensing/lightning behavior.
- Visual source review used repository references in `art/ref_crops/` and `art/`.

## Blocked / not run

- `./gradlew --version` / `./gradlew --no-daemon build` cannot start: this workspace has no `java`/`JAVA_HOME`, and the project targets Java 25. Attempts to reach Adoptium and Debian package repositories failed with outbound connection errors; the Gradle wrapper and dependencies are not cached. Java/JUnit tests, a Minecraft 26.3 launch, worldgen codec/command loading, GLSL compilation, and in-game visual checks remain blocked.
- **No compiled mod JAR or runtime screenshot is claimed.** Treat this as experimental source until a real client/server test is completed.

## Repository version check

The checked-out source is based on `0.21.0-alpha` at `cd4018f` (2026-09-30 17:14 UTC). It is **not the newest mod-containing remote branch found**: `arena/01a0f363-dddddd` points to `92f66ce` (2026-09-30 20:41 UTC), whose `fabric-mod/gradle.properties` reports `0.24.0-alpha`; GitHub reports it six commits ahead of this checkout's base. GitHub `main` (`f541634`, 2026-09-28) has no `fabric-mod/` directory, and the repository has no tags or releases. Thus there is no newer canonical release on `main`, but a newer remote Arena branch exists. Work in this session remains on its assigned branch; it was not switched to or merged from that sibling branch.
