# Minecraft Dungeons II Rift: visual-reference notes

**Reference:** screenshots supplied in chat on 2026-10-05; user-linked video [Looking at Sift Blocks in Java](https://www.youtube.com/watch?v=-YJCe4wA3SU).

## What the images support

- The front view shows a bright, stepped cross-shaped opening, a hot white/pink rim, warm pink-to-gold interior energy, a soft colored halo, and several detached rectangular pieces.
- The oblique view shows visible top/side faces and perspective depth on the stepped frame and floating pieces. That strongly suggests a **cuboid/extruded structure** in the rendered result; the images alone do not prove whether the game's implementation uses meshes, ray-marched shapes, or a hybrid.
- The interior's color movement, white bloom, translucency and halo look like material/shader work layered over the shape. The exact division of work between geometry and shaders remains unverified until a lawful game build or technical source is available.
- The linked video's title/transcript concern Sift block textures and a Java resource-pack preview, not a technical breakdown of the Rift renderer. It should not be used to infer the Rift's exact mesh or shader implementation.

## Current Fabric implementation decision (superseded in 0.37)

**Superseded 2026-10-05 by the user's own direction on the same four photos.** The note below was the
0.27–0.36 architecture: a 2D SDF silhouette with shader-only extrusion (`shaderQuadCanvas`, 14 bilateral
slices). The user rejected the result as "a flat 2D piece" and asked for the rift to be built as real
geometry, the outer frame included. 0.37 therefore deletes the slice canvas and emits the stepped shell
as extruded slabs (`boxFaces` front pane on the lip plane + dissolving back pane, `walls` cavity and
reveal, `frame` rails proud of the glass). See `RIFT_STATUS.md` §0.37 for the parts list.

> Historical note, kept for the record: *keep the project's established renderer architecture — the
> active GPU Rift is a 2D SDF silhouette plus shader-controlled bevels, viewport, and volumetric
> extrusion, not a return to a forest of 3D block meshes.* `shaderQuadCanvas` emitted 14 bilateral
> slices spanning roughly `z = ±0.844`, with per-slice alpha lowered so the aggregate front-on
> brightness stayed near the previous stack.

## Validation status

- The 0.37 shell is covered by `test_v037_real_geometry_shell_retires_the_2d_shader_slice_canvas` and
  `test_v037_thick_3d_shell_revealed_membrane_and_mixed_lightning`. 0.36's extrusion-count test (and the
  slice canvas it guarded) is gone. GitHub Actions run [37349186470](https://github.com/Loganwall111/dddddd/actions/runs/37349186470) completed successfully on commit `8a98e8d`; the matching Fabric build, shader checks, and 26.3 server smoke test also passed in [run 37349186454](https://github.com/Loganwall111/dddddd/actions/runs/37349186454).
- The headless capture workflow launched a real Minecraft 26.3 Fabric dev client and server under Xvfb/llvmpipe. Its sequence requires at least eight PNG captures before returning success. The uploaded 2.50 MB artifact is [available from the run](https://github.com/Loganwall111/dddddd/actions/runs/37349186470/artifacts/11363160280); captures/logs are artifacts and are not committed to the source branch.
- This is an actual Minecraft client render of the mod, **not** a Dungeons II client test. Since the
  sandbox's `gh run download` cannot fetch artifacts (the signed storage host ends with `EOF`), the
  capture workflow also commits its PNGs to `captures/run-<id>/` on the branch, which is how the pixels
  in this thread were reviewed.
- `/siftshot` remains available after `/function entersift:dev/riftcheck` for a local client capture. The Dungeons II installation/assets are still not accessible in this sandbox, so comparison against a running Dungeons II build remains outstanding.
