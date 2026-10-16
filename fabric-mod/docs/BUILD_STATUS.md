# Build and verification record — 2026-10-16

## Sift Overhaul 0.25.0-alpha: GitHub Actions passed

- Source commit: `e8cbf9d2b6bce5842d0444bf7dc2a46299674b3c` on the assigned branch `arena/01a0f72f-dddddd`.
- [GitHub Actions run #251](https://github.com/Loganwall111/dddddd/actions/runs/38967318760) — all steps passed on the Temurin JDK 25 runner for Minecraft 26.3.
- `./gradlew --no-daemon build` passed and produced `sift-overhaul-0.25.0-alpha.jar`.
- Resource/data validation and all 60 data-contract tests passed; the live generator reproducibility check passed.
- The shader pack passed `glslangValidator`, and CI confirmed the bundled shader ZIP is inside the mod JAR.
- The real Minecraft 26.3 dedicated-server smoke test passed.
- CI uploaded the **`Sift-Overhaul-0.25.0-alpha-26.3`** artifact. [Download the artifact](https://github.com/Loganwall111/dddddd/actions/runs/38967318760/artifacts/12075181903).

## Local checks

- `python3 tools/validate.py` — passed: 603 JSON/metadata files, 152 functions, local model/texture links, animation metadata, wrapper integrity, and 12 Sift biomes.
- `python3 tools/test_data.py` — all 60 data-contract tests passed.
- `git diff --check` — passed.

The sandbox itself has no Java runtime, so the Gradle compilation was performed by GitHub Actions rather than locally.

## Remaining verification limits

The server smoke test checks the mod's data, registries, functions, and world startup, but it cannot judge the rendered visuals. There has been no interactive Minecraft client/GPU playtest yet; rift animation, sky/fog, Ichor appearance, Blub visuals/spawning, and biome aesthetics still need in-game review. Treat this as an experimental alpha and test in a disposable world first.
