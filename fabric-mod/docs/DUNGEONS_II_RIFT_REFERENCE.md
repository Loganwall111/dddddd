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

## Validation still required

The new extrusion count is covered by an offline contract test; the next GitHub Actions run will compile the Java and GLSL changes. No Minecraft client render has been captured after this change. The client-only `/siftshot` command can save a frame after `/function entersift:dev/riftcheck`; a real client screenshot is needed before judging the depth tuning. The game installation/assets are not yet present in the sandbox.
