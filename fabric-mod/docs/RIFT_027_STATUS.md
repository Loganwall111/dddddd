# Rift correction pass 0.27

Baseline: the user's Actions build 36919666703, commit ad86c346702279d2b0b06d3778c0ae6f9671a08e. This snapshot was imported onto the session branch before editing. The substantial baseline changes versus the session's older checkout are intentional.

## Implemented (not yet game-tested)

- Add missing modern item definitions for both staff models and their existing textures.
- Share the stepped silhouette between client and server. Swept player movement must cross an actual recessed membrane cell, not merely enter a three-block radius. Track players independently; ignore spectators, immature rifts and long position jumps; retain cooldown checks.
- Enter the tunnel immediately. Remove the 60-tick entry delay and opaque orange HUD. A short white pixel HUD only appears in first person; nearby observers receive white particles at crossing.
- Render membranes and walls with alpha blending and no depth writes. Replace the opaque procedural destination image with a clear tinted membrane. Reduce lip thickness and keep the outline straight.
- Seed/bar first, brief ring, then tiered stepped assembly. Remove the huge night curtains; retain rising energy cubes, with equal dimensions and a fade/shrink to zero.
- Surface arrival searches for two clear air blocks over explicitly allowed ground. Do not excavate a plaza. Nether searches below bedrock. If no checked destination is available, stay in the tunnel and retry, rather than teleport to an unchecked fallback.
- Arrival rifts inherit type/width/height, open fully formed, permit return travel, and persist for five minutes instead of being deleted by legacy marker cleanup. Retire legacy blue return anchors.

## Validation

- `python3 tools/validate.py`: PASS (608 JSON/metadata files, 155 functions).
- `python3 tools/test_data.py`: PASS (62 tests). Updated obsolete assertions that required proximity travel, curtains, and orange overlays; added staff-chain and crossing integration contracts.
- `python3 tools/regen_check.py`: PASS, all six live generators reproduce their owned files.
- `git diff --check`: PASS.
- Added JUnit swept-crossing cases for both directions, standing nearby, parallel motion, notches, heights and swept movement. NOT RUN: Java 25 is not installed. Adoptium/GitHub/Oracle JDK downloads failed in this environment. Gradle compilation, Minecraft command codecs, GLSL compilation and runtime rendering remain unverified. No tested binary is supplied.

## Still outstanding — do not advertise this as one-to-one

- True scene refraction requires a copied background framebuffer, depth-aware sampling and an Iris-compatible composition hook. The current translucent membrane/side veils do not bend the real scenery. The previous renderer's misleading `renderSecondaryFboViewportPass` name was removed: it never captured a framebuffer.
- True third-person white pixel dissolution requires a player-model render pass/mask. Current white particles do not dissolve the player mesh.
- Staffs retain the baseline handheld sprite art, not newly authored 3D staff geometry.
- Arrivals preserve type and dimensions, not an exact paired entity/UUID, satellite seed or traversal orientation. Existing permanent ritual portal logic is separate from natural rifts.
- Surface search covers a small fixed region near the origin and keeps those chunks loaded. Sparse landing grounds or heavily built terrain can leave the player waiting in the tunnel. A wider async terrain search and force-load ticket lifecycle would be preferable.
- Opening silhouette, alpha layering, lightning intensity, fallback rendering, transparent sorting under Iris, exit clearance across the whole decorative frame, and all camera angles need client capture comparison against the supplied references.

## Manual acceptance checklist

1. Give both staffs; inspect inventory and both hands, reload resources; no missing-model checkerboard.
2. Spawn all four rift variants at noon and night. Walk parallel to the face, stand close, cross a notch, then walk through a membrane from each side. Only the last action should travel. Repeat with two players and rotated rifts.
3. Confirm seed/bar/ring/assembly ordering and straight narrow edges. Terrain should remain visible through surfaces. No 18–34 block light curtains.
4. Enter with first/third-person cameras: no three-second pause or orange cutscene. Third-person should have no fullscreen HUD.
5. Exit into Overworld, Sift, End and Nether; verify safe support/clearance, matching non-blue rift and successful return. Test unloaded and obstructed destination columns. Verify an unavailable destination leaves the player safely in the tunnel.
6. Repeat without shaders, with bundled Iris pack, after save/reload, and with existing pre-0.27 return gates.
