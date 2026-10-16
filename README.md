# Sift Overhaul — Enter the Sift

The Minecraft mod project is in **[`fabric-mod/`](fabric-mod/README.md)**. The new **0.25.0-alpha Sift Overhaul** targets **Minecraft Java 26.3 / Fabric / JDK 25**, preserving the newest 0.24 client/rendering code while adding the independent Sift tides, night-only rifts, small rainbow Ichor features, giant Canopy fossils, Jelly Lands and a cyan return portal.

**Build status:** Python data/resource validation passes. GitHub Actions is the authoritative compiler and artifact build; see the [verification record](fabric-mod/docs/BUILD_STATUS.md) for the current result. In-game visuals still require a client playtest. Read the [mod guide](fabric-mod/README.md) before installing into a world.

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

### 0.25.0-alpha — Sift Overhaul
- Sift time now uses its own 24,000-tick Flow / Thrive / Endure clock; Overworld time no longer drives Sift skies or rift night checks.
- Rifts only render and open at night (Endure inside the Sift). Their opening starts as a small circular lens, twists into an expanding aperture, and keeps the 0.24 warped stepped edges. White motes and server particles are reduced; energy drifts downward and lightning remains.
- Ichor aquifers are dry; tiny 1–2-block rainbow puddles/springs are rare. Animated still/flow/overlay sheets are mirrored and smoothly blended.
- The Boneyard keeps its world key but is named **Canopy**, with a prominent skull, tusks and large ribcages built from visible bone blocks. Crags are smaller and less frequent.
- Added **Jelly Lands**: dense blue distance fog, a deep-blue sky, pink turf/grass and pale trees, with frequent Blub groups.
- The Sift arrival plaza now has a cyan Agency Portal-style return rift, and Blub's generated texture is rebuilt from the current creature model spec.
- Mod display name and artifact are **Sift Overhaul** / `sift-overhaul-0.25.0-alpha`.

### 0.24.0
Complete *Minecraft Dungeons II* / *Minecraft Live 2026* trailer-accuracy overhaul across Rifts, the Dungeons II Overworld shaderpack, the Ancient City Note-Block Portal, and The Sift dimension:
- **Unified Stepped-Cross Rift Cavity & Wavy Sides (`RiftShape.java`, `RiftPortalRenderer.java`, `rift.fsh`).** The main rift is now a single unified stepped-cross window (`box.id() == 0`) with recessed perimeter walls and detached floating hollow square & L-shaped satellite boxes around the corners. Inner walls, outer rims, side curtains (`wavySideVeils`), and the destination viewport (`wavyCoords`) undulate with a real-time multi-frequency sine wave, and rifts open with an expanding crescent flash and concentric spatial ripple ring.
- **Dungeons II Overworld Shaderpack & Voxel Clouds (`voxel_clouds.glsl`, `overworld.glsl`, `composite.fsh`, `SiftClouds.java`).** Rebuilt 3D stepped voxel cumulus clouds (sunlit ivory-peach tops, soft lavender-blue mid-tiers, and two-tone periwinkle-indigo undersides), cerulean-to-peach sky grading, periwinkle-indigo cliff shadows, warm golden-apricot sunlight, golden-lime foliage grading, and diagonal volumetric sunbeams across mid-ground terrain.
- **Ancient City Cyan Tetris-Mosaic Portal & Rainbow Note Columns (`rift.fsh`, `AuraColumns.java`, `SiftSouls.java`, `phase24_textures.py`).** Layered 3D cyan/teal pixel-mosaic portal with a white stepped silhouette core, crenellated cyan-inlaid portal frame (`sonorous_deepslate`), center stone totem statue (`sculkling` / `soul_lantern_stone`), floating pixel musical note glyphs inside the 7-spectrum rainbow Note Block columns, and electric cyan-to-blue soul comet trails.
- **Sift Sky, Iridescent Ichor, Terrain & Creatures (`SiftSky.java`, `creatures.py`, `phase24_textures.py`).** Glowing mint-green & pink diamond aurora panels in a vivid turquoise-teal sky dome; pastel iridescent pink/peach/cyan/mint swirling Ichor bordered by wavy mint-patterned stone tiles (`sinter` / `pale_crust`); salmon-terracotta striated cliffs with mint-turquoise grass tops; cerulean-blue stepped plateaus with pink/chartreuse foliage; and trailer-accurate `blub`, `sculkling`, and `singer` models and textures.

### 0.23.0
Master Architecture Override & trailer-accurate rift orientation, depth, and colour fixes.
- **Front-facing recessed window orientation.** Rifts automatically orient their recessed hollow opening
  toward the viewer (`cam.z < 0` flip), fixing the inside-out protruding centre box when punching a rift
  with the gauntlet or placing a Rift Seed block.
- **Shallow, crisp voxel step depths (`0.18–0.58` blocks).** Nested hollow rectangular boxes frame a wide-open
  destination window with white neon rims instead of deep tunnel walls that obscure the view.
- **High-contrast hazy destination viewport.** Multi-pass 3x3 box-blur matrix loop over the live destination
  viewpoint (`yaw` & `pitch`) with balanced Vibrant Pink (Day) and Deep Amber (Night) emissive overlays.
- **Non-clipped 3D voxel energy cubes.** `RiftEnergyCubeParticle` and `energyCubes` render with translucent
  alpha-blending (`SKY_BLEND`) so Saturated Mint-Green, Electric Cyan, and Pale Pink cubes keep their vivid
  colours against bright daytime skies while drifting strictly upward (`velocity.y += 0.04`) and flattening
  horizontally at `age >= 0.75 * maxAge`.

### 0.22.0
Pure voxel mesh over spheres, secondary FBO viewport engine, and 60-tick R/G/B warp gate into the voxel-ring tunnel.

### 0.21.0
Biome skies, rift awakening, voxel particles and the warp overlay.
- **Biome sky states.** The Sift sky blends between biomes over about 3 s:
  - Singer Meadow: pale mint (#8FC2C4) and pearl-white lava lamp, with bright electric-cyan aurora arcs
    high overhead.
  - Rose Spires and Frostbloom Spires: a heavy magenta, dusty rose and crimson gradient, with much denser
    coloured fog (the fog starts at 12 and ends at 110 blocks).
  - The sky still only draws in the Sift, and every push is paired with a pop.
- **100-tick awakening.**
  - Ticks 0-30: a ripple spreads while erratic lightning flashes. The structure is still invisible.
  - Ticks 31-60: only the tiny centre box, its glow pulsing rapidly.
  - Ticks 61-100: one ring of boxes every 10 ticks, from the centre outward.
  - The rift becomes passable at tick 100.
- **Dissolving voxel energy cubes.** Large 3D cubes (0.25-0.5 blocks) drift out of every rift, glowing
  additively in colours set by the rift type:
  - Sift: mint, cyan and pink.
  - Nether: crimson, orange and ash gold.
  - Overworld: coral and cream. End: blue and violet. Portal: cyan.
  - At 75 % of their life they flatten into wide, thin slabs and fade out.
- **Recessed alcove.** The rift's outer lip stands 0.3 blocks out from the wall with a chunky frame face,
  so the opening sits in a thick alcove.
- **Rim shimmer.** Ghost copies of the rims vibrate on top of the real rims. They are additive overlays,
  so the geometry can never tear.
- **Warp overlay.** Stepping into a rift plays an 80-tick overlay:
  - Ticks 0-40: red/cyan chromatic jitter.
  - Ticks 40-60: a solid orange-and-red flare.
  - Tick 60: you are moved into the walk-through tunnel under the flare.
  - Ticks 60-80: the flare fades out.

### 0.20.0
Rifts rewritten from scratch. The old renderer, textured interiors, veils, screen-copy lens and
per-vertex jitter are all deleted. The walk-through tunnel is unchanged.
- **True window interior.** Every back face samples the destination (sky, blocky Minecraft clouds,
  blocky horizon) by the **world-space view direction** of each pixel. The view moves only with your yaw
  and pitch, stays sharp and un-warped, and is identical across every box, so it never splits at the
  crosshair and there is no flat peach texture. Destinations:
  - Overworld: coral sky with cream clouds.
  - Nether: crimson smoke, a fortress skyline and embers.
  - End: blue starlight, a nebula and islands.
  - Sift: mint sky with pink panels and pillars, glowing pink-white at night.
  - Portal: a cyan mosaic.
  - Overworld seen from inside the Sift: gold.
- **0-80 tick lifecycle.**
  - Ticks 0-20: a puddle ripple expands. It fades by tick 28 and never plays again.
  - Ticks 21-50: a small glowing seed box appears, with lightning snapping to nearby block positions.
  - Ticks 51-80: the boxes snap in tier by tier from the centre outward, each with a white flash.
  - After tick 80 nothing pulses. Sparkles drift, hollow cubes float, and an arc appears now and then.
- **Night curtains.** In the evening and at night, wide, soft curtains glow on the rift's flanks in
  electric blue, pale cyan, deep magenta and purple, replacing the thin laser poles. They are gone by day.
- **Slow wave.** The whole rift sways slowly (periods of 10-15 s), most strongly along the bottom. The
  mesh has no T-junctions (one window per cell, one wall per cell edge), so the wave cannot crack it.
- Removed: the `rift_lens` option, the rift PNGs, the old interior generators and dead datapack pose
  functions.

### 0.19.0
Rifts rebuilt against the trailer frames:
- **Stacked hollow boxes.** The cluster is split into rectangular boxes (big deep centre box, arms and side
  blocks at different depths). Where two boxes meet, the deeper one shows a stepped inner wall with a
  white lip rim, so the rift reads as a 3D voxel structure instead of a flat pale cut-out.
- **No more cracks.** The 0.18.1 tremble moved each vertex by a position-dependent amount, which tore
  seams (grass showing through) between interior strips. The whole rift now trembles as one piece
  (`sin(gameTime*0.4)*0.05`).
- **Trailer interior.** The Overworld view is a saturated coral/salmon canvas with chunky cream and peach
  pixel blotches and warm light in the middle, instead of wavy horizontal stripes. Every destination view
  is sampled on a chunky pixel grid, and the wavy distortion is much gentler.
- Inner walls are near-white at the lip and take the rift colour deeper in; the rims are thinner and crisper.

### 0.18.2
- **The 0.18 GLSL rifts now work under Iris shader packs.** Before, turning on a pack dropped rifts back to
  the old CPU texture interior. Probing Iris 1.11.6 showed that a pipeline with no pack program assigned
  is drawn with its own shader, so the rift pipelines (interior, walls, glow, lens, warp tunnel) are
  deliberately left unassigned. With a pack on, you get the same lensing, per-destination views, jitter
  and neon columns. Iris logs a one-time "missing program" line for these pipelines; this is expected.
- The rift shaders also write a full-bright lightmap and a "not world geometry" normal to
  colortex1/colortex2. The Dungeons II composite therefore does not shadow or re-tint the self-lit rift.
- Rifts and the warp tunnel are skipped during the Iris shadow pass (no rift-coloured shadow map).
- **The bundled Dungeons II pack now updates itself.** It keeps the file name `Dungeons-II-Overworld-0.15.zip`
  (so your Iris selection stays) and is replaced whenever the jar ships a different version. Before, an
  existing copy was never replaced, so 0.15 installs never received the Sift lighting, sunset god rays and
  other pack changes. The zip is built reproducibly, so an unchanged pack is not rewritten.

### 0.18.1

- **A different window for each destination.** In GPU mode the rift interior now shows the world it leads to, with camera parallax across several depth layers:
  - Overworld: a radiant peach-to-pink sky with soft, blocky horizon clouds.
  - Nether: burning dark crimson with rising fiery smoke, a lava glow and flickering embers.
  - End: a deep cosmic purple starlight sheet with a slow nebula.
  - Sift: a pale mint-cyan sky with rows of vertical pillars and soft panels.
  - Overworld rifts seen from inside the Sift turn golden, with a white-hot core, as in the trailer.
  - Soft bokeh lights drift up through every window.
- **Edge jitter.** The whole voxel cluster (walls, rims, interior and satellites) trembles gently. Every vertex moves by `Math.sin(gameTime * 0.4) * 0.05`, phase-shifted by its position, so the silhouette waves like an active reality tear.
- **Evening and night neon columns.** Massive electric blue, cyan and magenta columns stand on the rift's flanks, three on each side and taller than before. They appear only from evening (clock time 11500) through midnight to just before dawn, and never show during the day.

### 0.18.0

- **The whole rift is a shader.** In GPU mode every part of a rift is drawn by the rift GLSL program: the interior, the cream box walls, the white rims and glow, and the lens. The rift is now a large plus-shaped cluster of deep hollow boxes (about one block per box, 1 block deep). Natural rifts are 6-9 blocks wide and 4-6 tall. They have crisp white rims, a pink/orange marble interior with a big white centre glow, and larger floating hollow cubes. The halo blobs and ring bands that made rifts look like a white blob are gone.
- **Real gravitational lensing.** Each frame the rendered scene is copied to a texture, but only while a rift is on screen. A quad behind the rift bends that image with the point-mass lens equation (beta = theta - thetaE^2/theta), with slight chromatic aberration. The world behind and around a rift is really bent around it: an Einstein ring forms and an inner mirrored image appears. The image is one frame behind. Turn it off with `rift_lens=false` in `config/entersift-client.properties`. If the scene cannot be copied, lensing switches itself off and logs a warning.
- **Warp tunnel.** The rift tunnel is no longer a block hallway. Its walls are invisible barriers, and the client draws a warp burst around you: a white-pink core down the tunnel, yellow and orange rings, a red body, radial streaks (some teal/green) rushing outward, and about 120 glowing particles flying at you. The walk is shorter (about 28 blocks with Speed II). Existing worlds rebuild the tunnel automatically.
- **Frostbloom Spires.** Titan Crags is replaced by the MCD2 Sift ambience biome. The ground is pink and blue turf, all stone is red rose spire rock, and the crags and spires are remapped to red spire stone with pale bands. It has giant frosted white and pale-cyan trees, dense blooms, and falling petals and ash.
- **Colossal trees.** Every Sift tree is regenerated as a true giant with a hollow 5x5 trunk, flaring buttress roots, 4-5 thick canopy tiers (5 blocks deep, up to ~13 blocks radius) and long frosted strands. Trees stand up to 46 blocks tall and have 5,000-8,000 blocks each. There are no single-log trees any more.
- **Bigger sky panels.** The Sift sky panels are now huge (17-33 degrees wide), and there are fewer of them. The swirl blobs are about twice as large.
- **Shader pack.** God rays get really intense at sunset and sunrise, and they keep going until the sun touches the horizon. Ground lighting now changes through the day: rosy-gold morning, white noon, deep orange sunset and blue night. The Sift gets its own sky-coloured god rays, gentle by day and strongest around sunset (new `SIFT_SIFT_RAYS` option), plus a stronger time-of-day ground tint.

### 0.17.0

- **Two Sift skies.** The rose, frost, bone and peak biomes show soft, translucent teal, green and pink panels on a deep teal sky. Coral Expanse, Tidepool Reef, Singer Meadow and Soul Valley show slowly swirling pink and teal blobs instead. Crossing a biome border blends between the two skies over about 3 seconds. The colours are more saturated teal overhead, with no milky white. The panels are alpha-blended, not additive, so they keep their colour.
- **GPU rifts.** Rift interiors run a custom GLSL core shader (`shaders/core/rift.vsh/.fsh`). It gives the interior a wavy look and bends the area around the rim to imitate gravitational lensing. The lensing is approximate: it warps the shader's own pattern and does not sample the scene behind the rift. At night only, rifts give off a soft rainbow glow and coloured aura columns.
- **No more loading-screen cutscene.** Walking into a rift puts you in a short, walkable reddish-gold tunnel with particles (the `entersift:rift_tunnel` pocket dimension). Walking out the far end takes you to the destination. A brief gold flash hides each dimension change.
- **Block portal.** The ancient-city portal is now made of real, breakable portal blocks: an animated, vibrant cyan mosaic inside the frame with a glowing bottom row. Breaking any portal block collapses the whole portal.
- **Aura columns on note blocks.** Played note blocks and the ritual show soft rainbow aura columns instead of beacon beams.
- **More souls,** with bluish trails.
- **Retextured Twisted Warden:** navy speckled body, glowing teal bracket horns, green-yellow striped chest plates and green arms. **Blub:** eyes and mouth are now the same dark red (#7a1020), no longer glowing bright red.
- **Overworld clouds** are larger, softer heaps with white tops and bluish shadowed undersides, like the Dungeons look.
- **Shader pack (off by default):** new *Sift lighting* option. It adds soft cast shadows in the Sift and light that follows the Sift sky colour (cyan day, magenta evening, amber night), with teal-violet shadows and a little sky-coloured bounce light on surfaces facing up.

### 0.16.0

- **Terrain-stretching fix.** Terrain, trees and water no longer smear into streaks while you turn. The hand is no longer a black polygon.
  - Cause: the 0.13 Overworld clouds could send about 150,000 vertices in one draw. That forces the game's shared quad index buffer past 16 bits, which Sodium/Iris and some drivers mishandle.
  - Every Sift draw (sky, souls, clouds, rifts) is now capped at 48,000 vertices per batch, dropping whole quads only.
  - The clouds use 10-block cells, which makes them about 3x cheaper.
- **Render switches** in `config/entersift-client.properties`: `overworld_clouds`, `rift_effects`, `transition_hud`. Set one to `false` to turn that pass off.
- **Rift transition** replaces the loading screen. Stepping in gives an un-skippable 80-tick sequence:
  - ticks 0-40: RGB channel split jitter (`sin(t)*0.15`);
  - ticks 41-60: a solid orange-red lens flare;
  - tick 60: a silent teleport under the flare;
  - ticks 61-80: the flare fades out.
  
  It is driven by the hidden `entersift:rift_transit` effect and is drawn over the level-loading screen.
- **Sinkhole faces.** Rifts and the blue portal now have two translucent voxel veils in front of their canvas. They zoom inward at different depths and parallax rates, so the face reads as a receding tunnel.
- **Portal mosaic v3.** Brighter cyan-white, larger blocky cells, frosted grain.
- **Sift sky.**
  - New soft rectangular panel layer: blurred glowing panels sweep across the sky in arcs.
  - The 4-stage colours follow the spec: day `#7FD3CF`, noon `#8FC2C4` with pearl white, evening magenta-rose `#C86A92`, night amber `#DB7840`.
  - The lightmap tint follows each stage.
- **CI** now fails if the built-in shader pack is missing from the jar.

### 0.15.0: trailer-accurate portal and rifts, shader pack install fixed
- **Portal (blue portal ref).** The portal is now a clean glowing rectangle with square tabs on the top and sides, instead of a jagged outline. Inside is a bright, soft mosaic of pale cyan and white squares, like frosted glass. It has a thicker white rim and a wide cyan bloom around it, and looks the same from both dimensions.
- **Rifts (pink and warm rift refs).** Rift interiors are now glowing marble instead of a flat picture of the other world. From the Overworld they look rose-pink and cream with lavender hints; from inside the Sift, coral, peach and gold. A soft bloom band surrounds every edge. Rifts that glowed yellow now glow peach with white rims.
- **Shader pack installs again.** In 0.14 the installer looked for the wrong file name, so Dungeons-II-Overworld never appeared in your shaderpacks folder. It now installs `Dungeons-II-Overworld-0.15.zip` on first launch. It stays off until you select it in Iris, and a test keeps the two names in sync.

### 0.14.1: ritual fix
- **The song now registers every note.** One left click on a note block could reach the server two or three times. The repeat counted as a wrong note and silently reset the song to 1/8. Repeat hits on the same block are now ignored.
- **One frame per ancient city.** Note blocks spread around a big city could each detect a different reinforced-deepslate frame, which split the song's progress. The first frame found, or the one where the Twisted Warden was fought, is now used for every note nearby.
- **Clearer messages.** A wrong note now says which pitch was expected. Striking a note that's already sung explains that each pitch needs its own note block.
- **CI now plays the whole ritual.** The server test builds a frame, strikes 1, 3, 7, 6, 5, 2, 4, 8 (every strike sent twice) and checks that the portal forms.

### 0.14.0: Soul Valley, Campaign Peaks, real terrain, souls, subtle fog, brighter rifts
- **Terrain.** The Sift no longer uses giant biome squares. Biomes now come from overworld-style multi-noise (temperature, humidity, continentalness, erosion). The terrain uses amplified-style shaping, so it has much bigger cliffs, ridges and valleys.
- **Bigger trees.** The tiered giant trees are larger.
- **Soul Valley (new biome).** Green and purple giant trees with verdant and violet wood and glowing canopies, plus valley turf, ferns and violet blooms. Ruins are scattered around: ruined huts, towers, broken walls, wells and huge colossus gates. Soul bees, watchlings, sculkers, sculklings, drift jellies and Blubs live here.
- **Campaign Peaks (new biome).** Tall mountains with a volcanic crust of ash, cinder rock and glowing cinder cracks, and the new Ember Ore. Ichor volcanoes pour ichor down the slopes, and there are ichor springs and bubbling ichor hot springs ringed with sinter, plus ember shrines. Open ichor now bubbles and steams.
- **Two new creatures.** Soul bees and watchlings, each with a spawn egg and its own sounds.
- **Wandering souls.** Small white skull-like souls with dark eyes swoop in loops across the Sift, trailing glowing blue comet tails.
- **Rifts.** A soft white-pink haze now fills the opening, glow bands run along its inner edges, light spills forward out of the rim and small white motes drift out.
- **Shaders.** Fixed the Sift turning completely white with the Dungeons II shader pack on.
- **Per-biome fog.** Each biome has its own very subtle fog tint, such as lavender in Soul Valley, green in Singer Meadow and warm in Campaign Peaks. In the shader pack, *Dimension & Biome Fog* (SIFT_DIM_FOG) controls how strong it is; set it to 0 to turn it off.
- **New blocks (15).** Verdant and violet wood and canopies, valley turf, ruin bricks (plain and mossy), ruin tiles, cinder rock, ash crust, cinder glow, ember ore, sinter, valley fern and violet bloom.

### 0.13.0: pre-beta fixes (Blub, clouds, no sun, coloured god rays, giant trees)
- **Blub.** Pale icy-blue jelly body with glowing red slit eyes and a small red mouth, and shorter upright ears (lighter blue inside, no pink). It now wobbles side to side as it waddles: the body rocks from its feet, it squashes like jelly and the ears lag behind the wobble.
- **Overworld clouds without shaders.** Vanilla clouds are replaced by puffy Dungeons-style voxel clouds: stepped mounds on a 6-block grid, 4 to 16 blocks tall. They have warm white tops, white-to-lavender sides and one flat, uniform lavender-grey underside (no checkerboard). They are tinted by the time of day (peach at dawn and dusk, deep blue at night), drift east and fade out at the edge of your render distance.
  - While they show, the vanilla cloud setting is switched off. Your own setting is restored when you leave the Overworld, turn on a shader pack or quit.
  - If you chose "Clouds: OFF", nothing is drawn.
- **Overworld clouds with the Dungeons II pack.** Fixed the checkerboard: every cloud column now shares one flat base, the underside is one colour, and the bright rim traced around every cell is gone. The pack ships as `Dungeons-II-Overworld-0.13.zip`; select it in Iris to get the fix.
- **No sun in the Sift.** The sun disc and its ray are gone. The day/night cycle stays.
- **Coloured god rays from the sky.** Eleven soft light columns in red, orange, yellow, green, teal, blue, violet and magenta fall from high in the sky toward the horizon. They lean slightly, drift and pulse, with no hard edges. The world beams that land on the ground use the same rainbow colours and a slowly turning slant.
- **Gigantic multi-tier trees.**
  - Pale trees are now about 38 blocks tall, with a 3×3 trunk and buttress roots carrying four stacked canopy tiers. The tiers shrink toward the top, and each has a drooping rim fringed with long icicle strands.
  - Weeping soul trees are about 31 blocks tall with three tiers.
  - Both are a little rarer so the giants have room.
  - Generator: `tools/phase13.py`.
- **Rendering safety.** Every custom vertex (sky, beams, clouds, rifts) is checked, and a NaN or infinite position is collapsed instead of drawn, so it can never streak across the screen. Rift sizes are clamped before rendering.

### 0.12.1: soft aurora curtains, trailer sky colours
- **Hard shapes removed.** The rectangular sky panels are gone, along with the thin bright arcs and the hard-edged beams and sun ray.
- **Trans-aurora curtains.** Seven long, wavy, vertical sheets of light move slowly around the sky. Each one is a finely tessellated grid with alpha on every vertex: smoothstep falloff at both ends and at the top and bottom, and shimmering folds along its length. Colours run from mint, white-cyan or pink at the base to pink or violet at the top. They use strict additive blending with a base alpha of 0.18, so the gradient sky shows through.
- **Trailer colours.** The dome is a smooth three-stop gradient:
  - day and noon: soft teal-blue horizon, radiant mint-green, pale violet overhead;
  - evening: dusty rose, lilac, soft blue-violet;
  - night: hazy amber-gold with dusty crimson highlights.
  The lava-lamp blobs are now a faint pastel shimmer (30% instead of 90%). The fog, ichor fog and ground light timeline follow the new colours.
- **Softer beams.** World beams and the sun's single god ray now fade softly across their width.

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

