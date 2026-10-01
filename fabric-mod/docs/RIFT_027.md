# Rift corrections — 0.27.0-alpha

Baseline: `ad86c346702279d2b0b06d3778c0ae6f9671a08e` (the user's linked successful 0.26 any-hour fix; that build still declared version 0.25.0-alpha). Imported the mod tree, not an older 0.21 implementation.

## Changes

- Server-owned swept plane crossing, using the same stepped cell layout and recess depths as the renderer. Standing nearby, walking alongside, or crossing a missing corner does not enter. Both directions and rotated rifts work. Existing cooldowns and per-player destinations remain authoritative.
- Direct corridor entry; removed the 60-tick entry gate. A short first-person white-pixel glitch does not lock controls. A ten-tick world-space white voxel humanoid echo breaks apart at the crossing for other viewers. This is a stylized silhouette, **not** an armor/skin-accurate player dissolve shader.
- Opening order: small hot cube, rotating/extending rectangular bar with lightning, brief expanding fracture ring, stepped cross. Travel unlocks at tick 100.
- Alpha-blended, non-depth-writing inner surfaces and walls; thinner bright outline; crisp orthogonal frame rather than deforming the actual voxel edges. Removed the fake secondary-FBO/blur helper.
- Removed the tall rift light curtains. Night aura is now translucent, rising cubes shrinking/fading to zero, not stretched pillars.
- Rear lens samples a separate opaque-scene texture once per frame (shared by all rifts, recreated on resize). It is depth-tested and does not sample its own output. **This path is disabled with an active Iris shader pack**, whose framebuffer cannot safely be assumed to be vanilla's main target. Translucent surfaces and the procedural destination still work as the fallback. The destination view itself is not a live render of the other dimension.
- Both staffs have item-definition entry points, solid 3D shaft/head/floating-tip geometry, explicit hand/GUI transforms and deterministic texture atlases. `tools/staff_assets.py` regenerates them.
- Destination search starts at the actual heightmap and requires dry, sturdy ground and six blocks of headroom across a 3x3 footprint. No cave carving, fixed-y test, artificial plaza or unsafe origin fallback. Nether deliberately searches below its bedrock roof. If no landing is found, the player stays in the tunnel and can retry.
- Arrival creates an already-grown, matching-type/width/height stepped return rift, rather than a blue ritual portal. Return gates persist independently of the timed source rift. Entry appearance is stored in per-player scores across disconnects.

## Verification

Offline resource tests and regeneration checks are separate from runtime verification. See the GitHub build for Java compilation, JUnit geometric crossing tests, GLSL compilation and dedicated-server smoke results.

Required client review (not established by a server smoke test):

1. At noon and night, summon a staff rift, watch the entire 100-tick birth; compare front/side/rear against supplied reference frames.
2. Stand 0.2, 1 and 3 blocks from the plane, move parallel, cross a missing corner, then walk through the center. Repeat yaw 0/45/90/135 degrees and both directions.
3. Two players enter different destinations; one observes the white echo. Test first-person and F5; no orange cutscene, no forced camera or movement lock.
4. Enter Sift from a new save and an upgraded save. Exit on open dry ground, turn around, verify the matching stepped return rift and use it after the cooldown. Repeat after reconnecting in the tunnel.
5. Check staffs in inventory, either hand, on ground and in item frames. Resource reload must not produce missing-model or missing-texture warnings.
6. Vanilla renderer: inspect actual terrain bending behind the frame, resize the window, switch worlds, and check foreground blocks occlude the lens. Iris on/off: confirm clean fallback without stale framebuffer or shadow artifacts.

Visual one-to-one accuracy and arbitrary third-party shader-pack refraction are not claimed by this patch.
