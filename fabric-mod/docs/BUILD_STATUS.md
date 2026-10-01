# Verification record — 2026-10-01

## Sift Overhaul 0.25.0-alpha: passed locally

- `python3 tools/validate.py` — passed: 603 JSON/metadata files, 149 functions, local model/texture references, animation metadata, wrapper integrity, and 12 Sift biome registrations.
- `python3 tools/test_data.py` — all 53 data-contract tests passed.
- `python3 -m py_compile tools/phase19.py tools/validate.py tools/test_data.py` — passed.
- `git diff --check` — passed.

## GitHub Actions build

The 0.25.0-alpha source is being built with the repository's GitHub Actions workflow, which runs validation, data-contract tests, shader compilation, the Fabric/Gradle build, shader-pack bundling checks, and a 26.3 server smoke test. The result will be recorded here after the run completes. The CI artifact—not a locally compiled JAR—is the intended build output.

## Runtime limitations

Even a successful server smoke test cannot establish client-side visual quality. Rift timing/opening animation, sky and fog blending, animated Ichor appearance, Blub appearance/spawning, portal return behavior, and biome terrain density still need an in-game client playtest. Worldgen codecs and command behavior are only runtime-verified to the extent covered by the Actions server smoke test.
