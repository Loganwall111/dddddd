# Minecraft Dungeons II Rift: visual-reference notes

**Reference:** screenshots supplied in chat on 2026-10-05; user-linked video [Looking at Sift Blocks in Java](https://www.youtube.com/watch?v=-YJCe4wA3SU).

## What the images support

- The front view shows a bright, stepped cross-shaped opening, a hot white/pink rim, warm pink-to-gold interior energy, a soft colored halo, and several detached rectangular pieces.
- The oblique view shows visible top/side faces and perspective depth on the stepped frame and floating pieces. That strongly suggests a **cuboid/extruded structure** in the rendered result; the images alone do not prove whether the game's implementation uses meshes, ray-marched shapes, or a hybrid.
- The interior's color movement, white bloom, translucency and halo look like material/shader work layered over the shape. The exact division of work between geometry and shaders remains unverified until a lawful game build or technical source is available.
- The linked video's title/transcript concern Sift block textures and a Java resource-pack preview, not a technical breakdown of the Rift renderer. It should not be used to infer the Rift's exact mesh or shader implementation.

## Current Fabric implementation decision

Keep the project's established renderer architecture: the active GPU Rift is a 2D SDF silhouette plus shader-controlled bevels, viewport, and volumetric extrusion—not a return to a forest of 3D block meshes. To better suggest the depth visible in the oblique reference, `RiftPortalRenderer.shaderQuadCanvas` now emits **14 bilateral shader slices** rather than 10, spanning approximately `z = ±0.844` at the outermost slice. Per-slice alpha was lowered so the aggregate front-on brightness stays near the previous stack. This is a visual hypothesis to validate in the actual client, not a claim that the game uses the same implementation.

The existing 0–100 opening lifecycle, SDF shape, refraction/depth guard, warm fBM energy field, and `RiftEnergyCubeParticle` remain intact. The legacy CPU fallback geometry is separate and unchanged; the shader path does not call its `boxFaces` renderer.

## Validation status

- The extrusion count is covered by an offline contract test. GitHub Actions run [37349186470](https://github.com/Loganwall111/dddddd/actions/runs/37349186470) completed successfully on commit `8a98e8d`; the matching Fabric build, shader checks, and 26.3 server smoke test also passed in [run 37349186454](https://github.com/Loganwall111/dddddd/actions/runs/37349186454).
- The headless capture workflow launched a real Minecraft 26.3 Fabric dev client and server under Xvfb/llvmpipe. Its sequence requires at least eight PNG captures before returning success. The uploaded 2.50 MB artifact is [available from the run](https://github.com/Loganwall111/dddddd/actions/runs/37349186470/artifacts/11363160280); captures/logs are artifacts and are not committed to the source branch.
- This is an actual Minecraft client render of the mod, **not** a Dungeons II client test. The sandbox's `gh run download` could not fetch the artifact because the signed GitHub storage download ended with `EOF`, so the pixels have not yet been visually inspected here. The artifact can be downloaded from the Actions page to finish that review.
- `/siftshot` remains available after `/function entersift:dev/riftcheck` for a local client capture. The Dungeons II installation/assets are still not accessible in this sandbox, so comparison against a running Dungeons II build remains outstanding.
