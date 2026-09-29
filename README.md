# Enter the Sift — Fabric mod project

The requested Minecraft mod is in **[`fabric-mod/`](fabric-mod/README.md)**. It targets **Minecraft Java 26.3 / Fabric / JDK 25** and includes source, original animated textures, dimension/worldgen data, gameplay functions, vanilla-Java rendering (no shader pack), tests and a GitHub Actions build workflow.

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

## 0.8.0-alpha — the ritual sings, blueprint sky, cubed clouds, new mobs & biomes

**Ritual fixes and the song:**
- **Outline offset fixed.** Note outlines sat half a block off diagonally: integer coordinates in `execute positioned` are block-centred, and the functions added another half block. Every note position is now passed as `x.0`.
- **Feedback at every step.** Striking a note with no ancient-city frame (reinforced deepslate) within 24 blocks now says so. Completing the song announces *"The song is complete. The city sings it back..."*, and the server log records the frame.
- **Stuck retries fixed.** Ritual markers older than 20 s (left over from older versions) are cleared, so the song can be sung again.
- **Right-click light shafts.** Right-click a note block and a coloured shaft of light rises from it.
- **The replay.** After the 8th note, your music (`art/audio/ritual_song.wav`, encoded to `sounds/ritual/song.ogg` in CI) plays. The city then replays the melody note by note, and each block flickers twice and sends up a tall beam. At 11.6 s all eight beams rise together, and the portal assembles and opens.

**Rifts:**
- **Gauntlet.** Right-click (or left-click) to tear a rift in front of you. It tries 4, 3 and 2.5 blocks ahead, faces you, and tells you why when it can't open: souls, cooldown, no room, or a rift already there.
- **Creative `rift_*` blocks** are seeds now. Placing one removes the block and opens a real rift facing you.
- **Natural rift waves** snap to the terrain surface, so they no longer fail on hills.
- **Diagnostics.** The smoke test checks that anchors carry the `rift_anchor` block state. The client logs `[Sift] RiftRenderer: drawing N rift/portal opening(s)`.

**Sift sky (blueprint, inverted cycle):**
- Day is mint-cyan (#39A59E–#5BBFB7) with cyan and pearl aurora and pink/pearl rays. Night is amber/peach (#DE7E7A–#C96253) with crimson and dusty-rose pillars.
- **Panoramas** come from `tools/sky_panorama.py`. **Put your own panorama at `fabric-mod/art/sky/sift_panorama_day.png` and rerun it**: the night sky is generated by colour-dragging your day image.
- **Shader sky:** a noise-warped panorama, plus rainbow rays fanning out from the sun whose hues drift with the time of day. A `Rainbow rays` slider controls them.
- **No more seam at the horizon.** With shaders, terrain fades into the exact sky colour behind it. Without shaders, sky and fog colours are identical at every keyframe.
- The vanilla sky layer follows the day cycle and steps aside when an Iris shaderpack is active.

**Shaders (`Sift-Cinematic-0.8`):**
- **Cubed volumetric clouds**, Dungeons style: a real voxel DDA through 12×6×12-block cubes, with flat shading per face, self-shadowing and silver rims. They appear in the overworld and in the Sift, where they are tinted pearl by day and peach at night.
- **Shadow acne** (the "z-fighting" stripes on flat ground) is removed with a larger normal offset and a distance-scaled bias.

**Mobs:**
- **Blub** matches the ref: indigo eyes, purple nose, pink mouth ledge, long floppy ears with pink insides, and legs. The ears flop on every hop, and it squishes and squeaks.
- **Twisted Warden**: big glowing cyan bracket antlers, a brass-toothed chest maw with a cyan glow, and brass knuckles.
- **Drift jelly** is massive: 3.2× the model and a 3×4.2 hitbox.
- **New Note Bird**: a mint songbird with glowing wing tips. It swoops across most Sift biomes and chirps random notes. Spawn egg included.

**Biomes (9 total):**
- **Boneyard**: giant skulls with soul-lantern eyes, curved tusks, dense ribcages.
- **Coral Expanse**: branching coral trees with froglight tips, dense corals.
- **Titan Crags**: a gigantic rocky area with 20–30-block banded crags crowned by twisted trees, boulders and big standalone trees.

**Items:** hand-drawn vanilla-style sprites for the gauntlets, soul potion and ichor bucket (`tools/item_art.py`).

**Known limits:**
- Water sections vanishing on fast camera turns is chunk occlusion culling in vanilla/Sodium, not mod code. Overworld waterfall springs are halved to reduce the constant re-meshing that makes it worse.
- None of the visuals can be screenshot-tested in CI, only compiled and smoke-tested on a server.

Generator run order: … → `phase6.py` → `phase8.py` → `sky_panorama.py` → `creatures.py` → `item_art.py` → `phase9.py`.

## 0.12.0-alpha: Sift sky works with shader packs, accurate trailer rifts

**The Sift sky under the Dungeons II pack (and Iris in general)**
- Found the cause: with a shader pack active, Iris replaces every render pipeline with a pack program. The mod's own sky and rift pipelines were missing from its list, so they were drawn with the vanilla shader into the pack's buffers, and the sky rendered wrongly.
- The mod now registers its pipelines through the public Iris API. It uses reflection, so Iris stays optional:
  - the sky dome (new `entersift:pipeline/sift_sky`) goes to `gbuffers_skybasic`;
  - the aurora, beams and rift frames go to `gbuffers_basic`.
- Iris flips the reverse-Z depth tests itself, so the depth states stay valid.
- The bundled pack is now `Dungeons-II-Overworld-0.12.zip`. It adds `gbuffers_basic` (root, Overworld and Sift) and `gbuffers_skybasic` (Sift), which draw the mod's exact vertex colours with no lighting, fog or grading.
- The Sift looks the same with the pack on as with it off. `world_sift` adds only an optional soft **Sift sky glow** around the aurora, the sun ray and the rift rims, with no warping.
- The pack is still OFF by default. Older copies are left alone, so select the 0.12 zip in Iris.

**Rifts, 1-to-1 with the new trailer shots**
- **No Z-fighting.** The interior canvas is inset 0.01 from every wall and frame edge, and the walls reach just behind it. Fully grown cells merge into row runs, so there are no seams or jagged top borders. Satellites never share a plane with the main canvas.
- **Neon outline.** Each rim is one additive, anti-aliased gradient band: a thin white core fading to translucent pink, then to nothing. Behind the whole cluster there is a faint wide bloom.
- **Dual-dimension projection.** The view is chosen every frame from the client level, so it swaps instantly when you change dimension:
  - Outside the Sift, SIFT rifts show a new coral, orange and yellow pixel sunset with white square sparkles. The ritual portal keeps its cyan mosaic.
  - Inside the Sift, SIFT rifts, the portal and Overworld rifts show a new flat, tileable Overworld panorama (sky, blocky clouds, hills, oak trees, golden field) inside a yellow frame.
  - Nether and End rifts keep their own canvases.
- **Look-through illusion without shaders.** The interior UVs zoom from about 1.0× at 24+ blocks to about 1.8× at 2 blocks, with a subtle sideways parallax from the camera position. The interior is still a single flat quad.
- **Shapes from the refs:**
  - the SIFT rift is a central cross: a tall column with a stepped cap and wide jagged arms;
  - satellites now include hollow L and Z tetromino pieces;
  - the floating cubes are hollow, with open fronts and pale cream inner walls;
  - a soft white-pink glow sits in the heart of the opening.
- New generator: `tools/phase12.py`, which writes `textures/rift/view_sift.png` and `view_overworld.png`.

## 0.11.0-alpha: aurora sky and beams, flicker fix, custom Sift rock and turf, foliage, sounds and music, optional Overworld shader pack

**Sky (Sift only, vanilla Java).**
- The sky is stricter about where it draws. It renders only when the dimension id is in the `entersift` namespace and is `entersift:the_sift`.
- Every `pushPose` has a matching `popPose` in a `finally` block, in both the sky and the rift renderer.
- The sky is drawn in 3 layers:
  1. The lava-lamp dome: cyan, then mint, then magenta, then golden amber.
  2. Linear diagonal aurora streaks that scroll sideways. On top of them, flat semi-transparent rectangular "voxel shard" panels, grouped in sweeping arcs like the big pale rectangles in the trailer sky.
  3. World-space diagonal light beams that slice down into the terrain. They take their colours from the 4-stage timeline, fade with distance, and leave a soft tint pool on the ground where they land.
- There is one sun god ray: an additive quad at alpha 0.35 at the sun, fading to 0 at the horizon, following the clock.

**Flicker fix.** Until 0.10 the sky and rifts used `RenderTypes.debugQuads()`. That type goes through the transparency (OIT) pass, and the huge dome in that pass made leaves and ichor flicker when the camera moved. The new `SiftRenderTypes` has 2 types with no transparency pass and no sorting:
- SOLID: opaque, and writes depth.
- GLOW: additive, depth-tested, and does not write depth.

Ichor stays on the same translucent layer as water.

**Portal.** The PORTAL rift is now a glowing cyan rectangle with a crenellated rim, stepped corners and a new bright cyan pixel-mosaic interior, matching the blue portal ref. Walls and hollow cubes are opaque, and halos, edges and flashes are additive.

**Custom Sift blocks.** No vanilla blocks remain in Sift worldgen:
- Rock and coral replacements: `crag_rock` (dusty rose-mauve strata), `crag_rock_dark`, `crag_band` (rust), `pale_crust`, `crag_moss`, `coral_pink_block`, `coral_orange_block` and `sift_earth`. They replace stone, andesite, tuff, calcite, mossy cobblestone, pink concrete and orange terracotta.
- Canyon walls and everything underground are now crag rock. Before, they were the brick-patterned saltstone, which showed up as a weird floor on every cliff.
- The carapace texture no longer looks like End stone.

**Blue and pink grass.**
- New `blue_turf` and `pink_turf` surfaces, laid in noise patches: blue with pink patches in the Singer Meadow, pink with blue in the Pale Grove, blue with mossy crag in the Titan Crags. The Boneyard floor is pale crust.
- New foliage in every biome: blue grass, pink grass, glowing cyan tufts (light 9) and sift blooms. For example, the meadow gets 40 blue, 20 pink and 10 glowing tufts per chunk.
- More ambient particles: cyan glow motes and floating spores.
- Block loot tables are fixed to the 26.x single `condition` format.

**Sound.** Everything is synthesised by `tools/audio11.py` and encoded to OGG in CI. Every creature has ambient, hurt and death sounds with its own character:
- Blub: bloops. Sculker: clicks and growls. Antlerling: hollow knocks and "hoo" calls. Drift Jelly: a whale hum. Licker: slurps. Overseer: an electronic whine. Twisted Warden: a heartbeat and a roar. Note Bird: pentatonic chirps. Singer: a sung "ah" choir.

The Sift also has 2 streamed music tracks (D lydian lullaby, and E dorian with a distant choir) plus an ambience loop, mood sound and chime additions.

**Shader pack (optional, OFF by default).** `Dungeons-II-Overworld-0.11.zip` is copied into `shaderpacks/` only if it is missing, and is never enabled. It is for the Overworld:
- Warm sun and lavender-blue shadows.
- Chunky volumetric clouds with white tops and a peach horizon.
- Stronger god rays, reflections, waterfall foam and a more saturated grade.

In the Sift it is a pure passthrough, and all Sift sky code has been removed from the pack. The pack is compile-checked with glslang in CI.

## 0.10.0-alpha: rifts become entities (Dungeons II trailer pipeline), rift waves every 5 minutes, Blub and Singer remade

**Rifts are a real entity now.** Every rift, the ritual portal and the Sift return gate are `entersift:rift_portal`
(`RiftPortalEntity`): a hollow volume with no collision, drawn only by `RiftPortalRenderer` using vanilla client rendering.
No shader pack, no stencil and no world see-through. The old block_display anchors are removed automatically.

| RiftType | Leads to | Edge colour | Cluster shape |
|---|---|---|---|
| 0 OVERWORLD | overworld | gold | stepped staircase |
| 1 NETHER | Nether | #FF3333 | chaotic overlapping squares |
| 2 END | the End | violet | tall offset stack |
| 3 SIFT | the Sift | #FFBFE0 | wide jagged puzzle cross |
| 4 PORTAL | ritual portal | cyan | pixel-mosaic frame |

**Growth timeline (80 ticks):**
- 0–20: a puddle ripple of shockwave rings.
- 21–50: a white-hot incubation seed with erratic lightning that snaps to nearby blocks.
- 51–80: the voxel cluster snaps in tier by tier, each cell popping in with a white flash; satellites arrive last.

**Once grown:**
- A flat destination canvas scrolls slowly behind cream walls, with thick emissive edges and bloom.
- Around the rim: a lens-jitter shell (`sin(t*0.4)*0.05`), floating hollow cubes, rising sparkles and arcs.
- You can only pass through once the rift is fully assembled.

**Rift waves:** these start once you first use the Rift gauntlet (tag `sift.awakened`).
- A wave hits every 5 minutes, and the rifts seal after 2 minutes.
- Waves happen in every dimension, including the Nether, where rifts open at your own level.
- A rift never leads to the dimension it opened in, and any rift may lead to the End.

**Creatures:**
- Blub is all blue, with navy bar eyes and mouth. The pink ears and purple are gone.
- Singer is rebuilt from the MCD2 art: scaled teal robe, pale ridged mask, cream antlers, wide teal wing-arms and a peach chest flower.

## 0.9.0-alpha — clean slate: Java lava-lamp sky, true 3D rift windows, swimmable ichor

**The old sky is deleted.** The floating blue panes and shards, the overhead portal mosaic, the horizon bands, the panorama images and their generators (`sky_panorama.py`, `paint_skies.py`) are all gone. So is the **Iris shader pack**: no zip is bundled or installed, and the mod deletes the `Sift-Cinematic-*.zip` files that older versions copied into `shaderpacks/`. This also removes the warping effect and every non-sun god ray. Vanilla clouds are made invisible in the Sift (cloud alpha 0).

**Lava-lamp sky (`client/SiftSky.java`, pure Java):**
- Drifting, merging colour blobs from domain-warped 3D Perlin noise, recomputed every frame on a 72×36 sphere with per-vertex colours.
- **Four stages on the world clock:**
  - **Day:** pale cyan-teal.
  - **Noon:** neon mint and pearl white.
  - **Evening:** magenta, dusty rose and crimson.
  - **Night:** heavy amber-gold with soft crimson vertical pillars.
  - Preview: `fabric-mod/art/sky/lava_lamp_stages.png`, made by `tools/preview_sky.py`, which uses the same maths.
- **How it's drawn.** Fabric 26.3 has no sky hook, so the sphere is submitted with `RenderTypes.debugQuads()`. The CI probe showed this uses the core `position_color` shader, which has no fog and depth-tests normally. The sphere sits beyond the last chunk and inside the far plane, so terrain always stays in front.
- **No horizon seam.** The lowest band fades to exactly the timeline's fog colour. A test checks that the Java keyframes match the timeline.
- **Sun and rays.** The sun has a corona and 14 slowly turning rays. These are the only god rays in the Sift.

**Ground and ichor follow the sky.** The same stages drive `sky_light_color` in `timeline/sift_cycle.json`, so the lightmap tints the ground and ichor cyan → mint → rose → amber. `water_fog_color` does the same for the fog inside ichor. Per-biome sky and fog colours were removed so the whole dimension shares one sky.

**Rifts and portal: interior mapping.**
- **The window.** For every window vertex, a ray from the camera is cast through it onto a virtual plane 16 blocks behind the rift, and the hit point becomes the texture coordinate. The view inside is one continuous, non-repeating image with real 3D parallax.
- **Clouds.** A nearer cloud layer 6 blocks back parallaxes faster.
- **Rim.** The rim is a thick extruded, glowing white frame with two bloom layers. The lightning arcs and floating hollow cubes remain.
- Blaze3D 26.x doesn't let mods use a stencil buffer; interior mapping gives the same visual result.

**Return portal.** You now land on the real surface at 0,0, on a teal plaza, facing a 3×4 cyan-mosaic return portal 3 blocks east. Previously you landed on a pad at y=300 and drifted away from its small gate. The old pad and gate are cleaned up automatically.

**Ichor:**
- It's in `#minecraft:water`, so you can swim and float in it, and it has underwater fog.
- New textures are torus-periodic noise in pastel lava-lamp colours, so there's no seam at block edges and the animation loops without a jump. The flow sprite repeats every half-sprite because the fluid renderer samples half-sprite windows.

**World:**
- **Trees.** Pale trees are now 18 tall with 9-radius drooping white canopies and hanging teal strands. Weeping soul trees are 14 tall with teal canopies.
- **Rose spires.** These are now 32-block banded red-brick mesa towers with flat 7-radius caps, grass, and a pale tree on top.
- **Floors.** The olive moss and khaki salt floors are now a bluish flagstone `teal_path`.
- Preview: `fabric-mod/art/feature_preview.png`.

**Known limits (honest):**
- Vanilla fluids are always drawn one sprite per block. The ichor is seamless and low-frequency, so no cut is visible, but it can't be one giant non-tiling image.
- If a future Fabric/MC build makes `debugQuads` skip depth testing, the sky sphere would cover terrain. The client logs `[Sift] lava-lamp sky radius N blocks` when it's active.
- None of this can be screenshot-tested in CI. It's compiled and server smoke-tested only.

Generator run order: … → `phase9.py` → `phase10.py` (then `preview_sky.py` / `preview_features.py` for previews).

