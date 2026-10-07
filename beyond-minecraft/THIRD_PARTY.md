# Third-party provenance

- Minecraft is by Mojang/Microsoft. This is an unofficial Fabric mod; it does not ship
  Minecraft executable code, original game textures, paid assets or reference-image crops.
- Fabric Loader, Fabric API, Yarn and Loom are resolved by Gradle under their upstream
  licenses. See https://fabricmc.net/ and https://github.com/FabricMC/fabric.
- The Gradle wrapper, copied from this repository's existing wrapper, is Apache-2.0.
  It downloads the pinned Gradle 8.10.2 distribution for this project.
- `tools/templates/end-1.21.1.json` is the vanilla 1.21.1 End noise-settings data obtained
  from the `1.21.1-data` snapshot of https://github.com/misode/mcmeta, path
  `data/minecraft/worldgen/noise_settings/end.json`. It is used as a schema scaffold;
  the authoring compiler replaces the density router, palette, surface rule and height.
- All Beyond GLSL, generated pixel/armor art, field-guide content and Java/Python source
  in this module were authored for this project. The user's images were visual references,
  not pasted into the mod or represented as runtime screenshots.
- The optional local GPU tests use Playwright and Sparticuz Chromium, installed into an
  ignored tooling directory. Their executables are not bundled into the mod.
- `docs/runtime/beyond-*.png` are unedited screenshots captured by the actual Minecraft
  client in CI. They are evidence of the alpha, not generated concept art or a claim of
  matching the supplied references one-for-one.
