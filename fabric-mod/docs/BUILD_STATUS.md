# Verification record — 2026-10-01

## Sift Overhaul 0.25.0-alpha: passed locally

- `python3 tools/validate.py` — passed: 603 JSON/metadata files, 149 functions, local model/texture references, animation metadata, wrapper integrity, and 12 Sift biome registrations.
- `python3 tools/test_data.py` — all 53 data-contract tests passed.
- `python3 -m py_compile tools/phase19.py tools/validate.py tools/test_data.py` — passed.
- `git diff --check` — passed.

## GitHub Actions build

The 0.25.0-alpha source is being built with the repository's GitHub Actions workflow, which runs validation, data-contract tests, shader compilation, the Fabric/Gradle build, shader-pack bundling checks, and a 26.3 server smoke test. The result will be recorded here after the run completes. The CI artifact—not a locally compiled JAR—is the intended build output.

## Toolchain baseline (0.25)

- `python3 tools/regen_check.py` — the six live generators (creatures, phase5, expansion, visual_pass,
  phase24_textures, phase19) reproduce the shipped tree byte-for-byte, with no known drift left. Two
  generator bugs were fixed to get there (creatures.py salted the Licker texture with the builtin
  `hash()`; phase19.py re-scaled the crag overlays in place on every run), and the reviewed crag shapes
  are pinned in `tools/overlays/`. The historical phase chain is marked dead in `tools/baseline.json`
  because several of those scripts crash or revert 0.25 content.
- The check now runs in CI after the offline tests, so a stale generator (or a stale note) fails the build.

## Runtime limitations

Even a successful server smoke test cannot establish client-side visual quality. Rift timing/opening animation, sky and fog blending, animated Ichor appearance, Blub appearance/spawning, portal return behavior, and biome terrain density still need an in-game client playtest. Worldgen codecs and command behavior are only runtime-verified to the extent covered by the Actions server smoke test.


## Sift Overhaul 0.27.0-alpha: CI verified (run 36931015775)

- `python3 tools/validate.py` — passed: 613 JSON/metadata files, 155 functions. Model references are now
  resolved with the JSON key and the full subdirectory, so `"parent": "entersift:block/x"` is checked as a
  model (previously it was misread as a missing texture).
- `python3 tools/test_data.py` — all 64 data-contract tests passed, including the new scene-capture/depth-guard
  and rift-loop/registration contracts.
- `python3 tools/regen_check.py` — seven live generators (creatures, phase5, expansion, visual_pass,
  phase24_textures, phase19, rift_audio) reproduce the shipped tree byte-for-byte.
- GitHub Actions: the 26.3 client compile, shader-pack bundling check and the dedicated-server smoke test all
  passed. The smoke test now also places `entersift:rift_core` and asserts the registered block entity ticks.
- Not verified anywhere yet: client-side rendering on a GPU. `RiftScene` refraction, the inflated shells, the
  tendrils/teeth, the positional hum loop and the accumulated rift changes still need an in-game capture pass.
