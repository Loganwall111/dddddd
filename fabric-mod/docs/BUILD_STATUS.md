# Verification record — 2026-10-03

## Passed in this workspace & GitHub Actions CI — Sift Rift & Sky Dome Overhaul

- **Offline integrity (`tools/validate.py`)**: Passed 601 JSON / metadata files, 149 server functions, local models/textures, animations, wrapper, and 12 biomes.
- **Data & visual contracts (`tools/test_data.py`)**: Passed all 51 unit tests (including `test_v022_sift_rift_sky_dome_and_time_states`).
- **GLSL compilation (`tools/check_shaders.py` + `glslangValidator 16.6.0`)**: Compiled all 82 shader programs (`rift.vsh`, `rift.fsh`, `tunnel.vsh`, `tunnel.fsh`, and all `Dungeons-II-Overworld-0.15.zip` programs) with zero errors.
- **Java 25 / Loom 1.18-SNAPSHOT Gradle Build (`./gradlew --no-daemon build`)**: Compiled server/common and client Java sources cleanly against Minecraft 26.3 and bundled `Dungeons-II-Overworld-0.15.zip` inside `enter-the-sift-0.21.0-alpha.jar`.
- **Real Minecraft 26.3 Dedicated Server Smoke Test (`SIFT_SMOKE=1 ./gradlew --no-daemon runServer`)**:
  - Verified Rift and Portal entity anchors (`SIFT-SMOKE anchors: rifts=1 portals=1 wrongType=0`).
  - Verified `/sift time set thrive`, `/sift time set lymph`, `/sift time set flow`, and `/sift time` query (`SIFT-SMOKE time state verified: state=FLOW, locked=true`).
  - Verified full 8-note Ancient City ritual sequence (`SIFT-SMOKE ritual: portalMarker=true portalAnchor=false portalBlocks=true stillOpening=false`).
  - Reached `SIFT-SMOKE DONE` with zero runtime errors.
- Preserved the existing browser application in root `src/` untouched.
