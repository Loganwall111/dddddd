# Verification record — 2026-09-27

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
