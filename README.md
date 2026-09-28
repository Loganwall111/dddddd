# Enter the Sift — Fabric mod project

The requested Minecraft mod is in **[`fabric-mod/`](fabric-mod/README.md)**. It targets **Minecraft Java 26.3 / Fabric / JDK 25** and includes source, original animated textures, dimension/worldgen data, gameplay functions, an optional Iris shader pack, tests and a GitHub Actions build workflow.

**Status: experimental, uncompiled source alpha.** Offline integrity checks and 20 data tests pass; Minecraft compilation and playtesting are blocked in this workspace by unavailable Java/dependency downloads. No installable JAR is being claimed. Read the [mod guide](fabric-mod/README.md) and [verification record](fabric-mod/docs/BUILD_STATUS.md) before building or testing.

The **0.2 visual pass** follows the newly supplied screenshots: [comparison and remaining gaps](fabric-mod/docs/VISUAL_STATUS.md).

The existing browser project below is preserved; `npm run dev` starts Lumital, not Minecraft.

---

# Lumital — The Living Reality Engine

A cinematic React + Three.js prototype for a cross-scale open world. Choose a procedural genome, seed a persistent reality, and explore from planetary terrain down through plant cells, digestive acid, sewer tides, and molecular space.

## Cross-scale expeditions

The Living Atlas adds five authored entry routes on top of the seeded world, and the in-game Time panel adds ten traversable life stages from the Hadean Eon through future alien worlds:

- **Leafskin Canopy** — walk a leaf vein, follow a caterpillar and descend into plant cells.
- **Digestive Passage** — be eaten, travel from enamel through saliva, and survive a stomach acid tide.
- **Tidal Underways** — enter storm drains, sewer systems and the open tide.
- **Colossus Range** — traverse the hide and tremors of a giant bull on the route to mountain villages.
- **Planetary Frontier** — explore 75+ biomes, emergent villages, signal castles and floating terrain.

All routes retain a deterministic seed and persistent discoveries. Gathered matter can be consumed, crafted into shelters and tools, or invested into communal signal structures. The world scale navigator exposes 66 generated realms, with procedural city, district and ecosystem systems ready to diverge after first contact.

## Run locally

```bash
npm install
npm run dev
```

For the cinematic presentation, choose **Lumital Cinematic** in Settings. The app opens in third-person by default, with the named organism visible in the world. It supports keyboard and mouse exploration with `WASD`, `Q`, `G`, `E`, `T` (camera), `M` (atlas), `N` (craft), `Z/X` (scale), and `I` (inventory).

## 0.6.0-alpha — 26.3 crash fixes + Dungeons II overworld shader

**World-loading crash fixed.** These were all found by a new CI step that boots a real Minecraft 26.3 dedicated server with the mod, generates the Sift, runs the ritual/rift/creature functions and fails on any error:
- Advancement kill criteria use the 26.3 `minecraft:entity_properties` condition object.
- Loot tables use the 26.3 schema (`condition{type}`, `modifier[]`). `tools/phase5.py` converts them automatically.
- Inline predicates use `{type:"minecraft:random_chance"}`.
- Block displays use `block_state:{id:…}`. The old `Name` key silently stopped rifts, portal panels, note glows and beams from spawning.
- All Sift biomes share one global feature order. Before this, a "Feature order cycle" froze chunk generation on entering the Sift. `tools/test_data.py` now checks for this offline.

**Dungeons II overworld (shaderpack `Sift-Cinematic`, overworld only):**
- Raymarched volumetric clouds between y190 and y240: chunky 8-block voxel cumulus blended with soft fbm, warm lit tops, blue-grey undersides and silver edges.
- Sun shafts, a deep-blue sky with bright horizon haze, and a saturated, contrasty grade.
- Soft depth-of-field for distant terrain.
- Teal water with glints and scrolling white foam on waterfall faces.
- Sliders: Clouds, Cloud steps, Blockiness, Shafts, Depth of field and Waterfall foam.

**Waterfalls:** extra cliff springs across the overworld, many more in mountain, cherry and badlands biomes (`entersift:cliff_waterfall`, `mountain_waterfall`).

## 0.7.0-alpha — shader-like rifts & portal, real shadows, god rays, reflections

**Rifts and the portal are openings, not blocks.** Each rift, ritual portal and Sift return gate is now one invisible anchor display (`entersift:rift_anchor`). The client `RiftRenderer` draws the opening as it appears in the reference footage:
- A blocky "pixel cross" silhouette with glowing white outlines on the front and back rim.
- A recessed window into another world, with parallax and drifting pixel clouds. The scene textures are pixelated crops of the reference interiors (`tools/rift_scenes.py`).
- Floating hollow outline cubes, lightning arcs and sparkles.
- Rifts tear open from the centre as white-hot cells; the ritual portal pixelates inward over about 5 seconds.
- Styles follow the destination: overworld gold-green, Sift peach, Sift night pink, End violet, Nether red, and the portal's cyan mosaic.
- Anchor fields: `glow_color_override` is the style, `width`/`height` the size, and yaw the facing (`tools/phase6.py`).

**Shaderpack `Sift-Cinematic-0.7`** (the file name now changes with each version, so updates actually install):
- Sun and moon shadow map with soft shadows: cool blue shade and warm sunlight.
- Volumetric god rays raymarched through the shadow map.
- Water reflections: Fresnel sky reflection and a sun glint.
- Soft highlight rolloff, so snow and clouds keep their detail instead of blowing out to white.
- Bright blue distance haze, and vanilla clouds turned off so the volumetric clouds show.
- New "Dungeons II Overworld" settings page.
- CI compile-checks every shader program with glslang (`tools/check_shaders.py`).

**Fixed flooding and flicker.** 0.6's extra waterfall springs could spawn in dirt, grass and snow on plains, flooding flat land and causing constant water updates. They are now a few springs in stone cliffs of mountain biomes only. Chunks generated with 0.6 stay as they are.

Generator run order: … → phase5 → `rift_scenes.py` → `phase6.py`.
