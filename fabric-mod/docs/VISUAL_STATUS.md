# Visual and world-generation status — current source branch

This report compares the implementation with the reference art already in the repository (`art/ref_crops/rift_*.png`, `art/rift_preview.png`, and `art/ref_crops/blub.png`). It describes source assets and code; **it is not an in-game screenshot or a claim of runtime verification**.

| Request | Implemented in source | Remaining verification |
|---|---|---|
| Night-only rift look | The daytime path retains its existing ripple, seed, rim, center bloom, and fragment behavior. At night the opening uses a small circular ripple, a twisting/growing tear, stronger non-uniform edge stretch and shader lensing, a dimmer destination-coloured centre, tinted/darker wall and rim materials, visible branching edge lightning, and inward-moving fragments. The night state uses Sift **Endure** in the Sift and the Overworld clock elsewhere. | Needs a Minecraft/GPU comparison against the repository rift crops, with both daytime and nighttime captured to confirm the daytime look is unchanged. Shader-pack/Iris rendering has not been compiled or run here. |
| Independent Sift time | The Sift dimension has its own 24,000-tick world clock and timeline, with named **Flow** (0), **Thrive** (6,000), and **Endure** (13,000) markers. Its sky and rift state read that clock; Overworld time remains separate. | Verify `/time` markers, timeline interpolation, and clock persistence in a 26.3 client/server. |
| Rainbow ichor | Still, overlay, and flow sheets are regenerated as animated, seamless pastel-rainbow liquid with bilateral symmetry (flow tiles preserve left/right symmetry). | Inspect actual fluid rendering at block scale, including faces, animation seams, transparency, and swimming. |
| Mostly dry Sift | The Sift uses normal Overworld density functions, an air aquifer fallback, and lower sea level. Ichor lakes are 1–2 block delta puddles behind rare placement filters; springs/hot springs are also rare. | Newly generated chunks must be inspected in-game; existing chunks are not retroactively changed. |
| Canopy / bone desert | The existing Boneyard registry is localized as **Canopy**. Its vegetation step is replaced with sparse, large skull, tusk, and ribcage features assembled from vanilla bone blocks. | Verify surface placement, orientation, spacing, and visibility at terrain scale. |
| Terrain and crags | Amplified density references are replaced with normal Overworld density functions (retaining continental land gaps and caves); crag overlays are scaled down and made rarer. Other Sift biomes, including Singer Meadow, remain registered. | Explore multiple seeds for island/cavern balance, biome distribution, mountain scale, and feature collisions. |
| Agency Portal | Portal routing enters the Sift from outside. In the Sift, the return gate sends players to their saved dimension/coordinates, falling back to the Overworld if no return is stored; a visible rift anchor is created at the Sift gate. | Test multiplayer, blocked/unloaded destinations, and repeated crossings on a running server. |
| Blub | Its generated model and texture now use the reference crop's cyan body, indigo eyes, purple nose, pink mouth, and pink-lined ears. | Compare the rendered entity (not just its UV texture) with `art/ref_crops/blub.png` in-game. |

## Offline verification

- `python3 -m py_compile tools/*.py` — passed.
- `python3 tools/validate.py` — passed: 602 JSON/metadata files, 149 functions, local model/texture references, animation metadata, wrapper, and 12 biomes.
- `python3 -m unittest tools.test_data -v` — passed: 53 resource/data-contract tests, including new clock, dry-terrain, symmetry, portal-routing, and night-rift checks.
- `python3 tools/phase19.py` — ran successfully and is repeatable; it generates the clock, terrain/worldgen, textures, Blub model, and portal resources.

## Runtime limits

Java is not installed in this workspace, so Gradle/Minecraft compilation and client/server testing could not be run. Treat custom dimension codecs, worldgen placement, Java bindings, shaders, and the visual result as **unverified in Minecraft 26.3** until a real build and playtest are completed.
