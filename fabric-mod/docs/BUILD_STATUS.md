# Verification record — 2026-10-01

## Sift Overhaul 0.25.0-alpha: passed locally

- `python3 tools/validate.py` — passed: 603 JSON/metadata files, 149 functions, local model/texture references, animation metadata, wrapper integrity, and 12 Sift biome registrations.
- `python3 tools/test_data.py` — all 53 data-contract tests passed.
- `python3 -m py_compile tools/phase19.py tools/validate.py tools/test_data.py` — passed.
- `git diff --check` — passed.

## GitHub Actions build

The 0.25.0-alpha source is being built with the repository's GitHub Actions workflow, which runs validation, data-contract tests, shader compilation, the Fabric/Gradle build, shader-pack bundling checks, and a 26.3 server smoke test. The result will be recorded here after the run completes. The CI artifact—not a locally compiled JAR—is the intended build output.

## Toolchain baseline (0.25)

- `python3 tools/regen_check.py` — the six live generators (creatures, phase5, expansion, visual_pass,
  phase24_textures, phase19) reproduce the shipped tree byte-for-byte, with no known drift left. Two
  generator bugs were fixed to get there (creatures.py salted the Licker texture with the builtin
  `hash()`; phase19.py re-scaled the crag overlays in place on every run), and the reviewed crag shapes
  are pinned in `tools/overlays/`. The historical phase chain is marked dead in `tools/baseline.json`
  because several of those scripts crash or revert 0.25 content.
- The check now runs in CI after the offline tests, so a stale generator (or a stale note) fails the build.

## Runtime limitations

Even a successful server smoke test cannot establish client-side visual quality. Rift timing/opening animation, sky and fog blending, animated Ichor appearance, Blub appearance/spawning, portal return behavior, and biome terrain density still need an in-game client playtest. Worldgen codecs and command behavior are only runtime-verified to the extent covered by the Actions server smoke test.


## Sift Overhaul 0.27.0-alpha: CI verified (run 36931015775)

- `python3 tools/validate.py` — passed: 613 JSON/metadata files, 155 functions. Model references are now
  resolved with the JSON key and the full subdirectory, so `"parent": "entersift:block/x"` is checked as a
  model (previously it was misread as a missing texture).
- `python3 tools/test_data.py` — all 64 data-contract tests passed, including the new scene-capture/depth-guard
  and rift-loop/registration contracts.
- `python3 tools/regen_check.py` — seven live generators (creatures, phase5, expansion, visual_pass,
  phase24_textures, phase19, rift_audio) reproduce the shipped tree byte-for-byte.
- GitHub Actions: the 26.3 client compile, shader-pack bundling check and the dedicated-server smoke test all
  passed. The smoke test now also places `entersift:rift_core` and asserts the registered block entity ticks.
- Not verified anywhere yet: client-side rendering on a GPU. `RiftScene` refraction, the inflated shells, the
  tendrils/teeth, the positional hum loop and the accumulated rift changes still need an in-game capture pass.

## Sift Overhaul 0.28.0-alpha: CI verified (run 36932734783)

- 0.28 adds the rift back fade: structure dissolves with depth behind the opening plane, with a 45% floor on
  edges so the wireframe stays readable, a gentler radial falloff for the detached boxes and floating cubes,
  and a per-quad window fade (carried in the vertex colour, applied in `rift.fsh`) that leaves the opening
  itself clear. `rift_back_fade` in `config/entersift-client.properties` disables it.
- `python3 tools/test_data.py` - 65 tests passed (adds `test_v028_back_fade_dissolves_the_receding_structure`).
- `python3 tools/validate.py` - 613 JSON/metadata files, 155 functions. `tools/regen_check.py` - 7 live
  generators reproduce the shipped tree.
- GitHub Actions: 26.3 client compile, shader checks, shader-pack bundling and the dedicated-server smoke
  test (with the registered rift-core assertion) all passed; artifact `Sift-Overhaul-0.28.0-alpha-26.3`.
- Still not verified anywhere: GPU rendering. The fade distances, edge floor and shell alphas are parameter
  choices that need a client capture to judge.

## Sift Overhaul 0.29.0-alpha: CI verified (runs 36934022122 + 36934410974)

Scope: the flat backside veil is deleted, the rift cavity is deeper so the back reads as stepped
boxes instead of one glazed pane, and the placement sequence now has the reference lightning and the
giant white ground shockwave.

- `RiftPortalRenderer`: `backsideVeil(...)` and its call site removed — no flat backdrop quad remains.
- `RiftShape`: `mainDepth` 0.4837 -> 0.60 with the left attached boxes stepped at 0.32 / 0.44, so the
  sides recede as real boxes; `boxes(...)` clamps its maximum to the same 0.60.
- `RiftPortalRenderer`: back fade now runs to `FADE_FAR = 1.0f`, so a 0.60-deep wall keeps roughly
  two thirds of its alpha instead of fading out at half a block.
- Shader `rift.fsh`: box faces `riftData.a * 0.82` (was 0.24) and the window plane `0.50 * edgeFade`
  (was 0.72) — the frosted structure is readable, the opening stays clear.
- Rim segments overlap (`overlap = (0.05f + 0.04f * flash) * k`, spans `x0 - ox` .. `x1 + ox`) so the
  neon outline is a continuous band rather than a row of dots.
- Placement sequence: `seedBox` is now a tall tilted turning glowing slab with an outlined edge
  (0.30 x 0.72+0.42*stretch x 0.11, spin `age * 0.26f`, tilt `0.52 + 0.10*sin(age*0.22)`).
- `riftBolts(...)` (2 arcs by day, 3 at night, re-aimed a few times per second, out to ~38 blocks) and
  `seedBolts(...)` (4 candidate arcs off the assembling slab) — the lightning that crawls off the rift.
- `shockwave(...)` + `groundRing(...)` + `groundCrack(...)` + `shockCracks(...)`: two pulses on the
  reference timing, band one 0..22 ticks out to ~22 blocks, the gigantic band 22..62 ticks out to
  ~46 blocks, three rings each (white core, halo, outer glow) with ground cracks trailing both fronts.
  `groundRing` raises its segment count (56 -> 80 -> 128) as the radius grows so the band stays round.
- Culling box inflates to 52 blocks while the blast runs, otherwise the band popped out when the
  camera pulled back.
- `SiftBudget`: `riftBolts` / `riftShock` flags with `rift_bolts` / `rift_shockwave` properties, so the
  new effects are switchable like the rest.

Verified: `tools/test_data.py` 66 tests, `tools/validate.py` (613 files), `tools/regen_check.py`
(7 generators), `tools/check_shaders.py` (82 programs), `git diff --check` — all clean before both
pushes. Artifact: `Sift-Overhaul-0.29.0-alpha-26.3`.

Not verified: nothing in this batch has been seen in a running client. There is no GPU, no client and
no online-mode session in this workspace, so every visual statement above is a source-level claim.

## Sift Overhaul 0.30.0-alpha: frosted box, one blast, white birth (CI pending at time of writing)

Scope: the user picked "box mass with one small clear square window" and asked for the blast to fire
once and the rift to arrive white before dissolving into colour.

- `RiftShape` now carries a window mask (`private final boolean[][] window`, built in `build(...)`):
  for SIFT and OVERWORLD only the 3x3 cell square at the centre (`|i-5| <= 1 && |j-3| <= 1`) stays
  glazed; every other body cell is a frosted box face. Other rift types keep their old opening.
- New renderer pass `boxFaces(...)`: frosted grey-white panels at each cell's recess depth for the body
  and the detached satellites, plus a lit border around the square hole. Drawn on the glow pipeline
  with `faceA(z, 0.95f)`, so the frosted mass still dissolves as it recedes.
- `windows(...)`/`windowsFlat(...)` now draw only the glazed square (and skip satellites/cubes when the
  box face is on), taking the new per-window fade so the flash can dissolve the opening.
- Placement re-timed: `SHOCK_END = 40`, `RIFT_BIRTH = 42`, `RIFT_COLOUR = 48`. One gigantic white band
  (`radius = 1 + ease * 61`, measured ~62 blocks) with cracks trailing the front — the two-pulse version
  from 0.29 is gone.
- The box steps in at `RIFT_BIRTH - 6 + tier * 2` (36/38/40/42), so the rift appears right behind the
  blast: it snaps in as a white silhouette (`whiteFlash`, `whiten(look, k)` pushes every palette
  towards white) and dissolves into its colours over the next six ticks.
- Culling box inflates 68 blocks while the blast runs. `SiftBudget.riftBoxFace` (`rift_box_face`)
  switches the frosted box on and off.

Verified locally: 66 data tests, 613-file validation, 7 generators, 82 shader programs, `git diff --check`.

Environment note: this turn the sandbox's `.git` was re-cloned at the session base commit while the
working tree held the session's work; recovery was to re-fetch the pushed branch (`b390240`), hard-reset
onto it and restore the six files edited after that push, so no session work was lost.

## Sift Overhaul 0.31.0-alpha: styles, variants, proximity frost, pane aura (CI verified, run 36937269352)

Scope: the rift gets the colour spread and the two silhouettes the references show, the glazed square
frosts and clears as you approach, and the aura becomes one-pixel-thin rising panes.

- `Look` gained a fifth colour, `frost`, and `LOOKS` now holds eight styles: 0-5 the destinations plus
  6 the white reference rift (17345525) and 7 the steep olive wall (The_Nether). Frost tones are the
  measured reference crop averages (red #9a3d36, yellow #d9c96c, olive #6e7781, pink #dfcfd5) lifted to
  a frosted brightness. `lookFor(int)` wraps instead of clamping, so a bad index can never paint a
  different rift's colours.
- `viewCode(type, inSift, seed)` picks a style per rift (overworld/sift: white, coral or gold; nether:
  olive, red or gold; end: white or violet), and `rift.fsh` carries the matching `TINT[8]` / `FROST[8]`
  tables. The window encodes its style with a stride of 32 so eight styles fit alongside the night bit.
- `boxFaces(...)` now paints the frosted mass in the rift's own frost colour, with the cells furthest
  from the window taking a warmer tip tone. The detached satellites stay hollow outlines, as in the
  reference's small boxes.
- Proximity frost: `frostProximity(cam)` smooth-steps 1 -> 0 between `FROST_NEAR = 7.5` and
  `FROST_CLEAR = 1.6` blocks. The window vertex packs `fade/2 + frost/2` into alpha and the shader
  recovers both (`frostAmt`, `fade`), so the glazed square is a frosted pane at range that clears as you
  walk up — `max(0.50 * edgeFade * fade, frostAmt * 0.62 * edgeFade)` is never fully clear.
  `rift_proximity` switches it off.
- Variants: `RiftShape.tallVariant(w, h)` (`h >= w * 1.25`) selects a tall tower silhouette instead of
  the wide stepped cross. It is derived from width/height, so the server collision shape and the client
  renderer cannot disagree. `rift/style.mcfunction` rolls tall (w 4..6, h 9..11) one time in five.
- Aura: `energyCubes(...)` now emits `thinSquare(...)` panes — 0.84-1.68 blocks across, exactly one
  block-texture pixel (1/16) thick, camera-facing, with a bright rim. They rise from the rift's top lip
  and disintegrate around half way up (`f >= 0.34` shrinks to a spark, gone by `f = 0.62`). Still
  midnight-gated with the rest of the aura.

Verified: 67 data tests, 613-file validation, 7 generators, 82 shader programs, `git diff --check`.
Artifact `Sift-Overhaul-0.31.0-alpha-26.3` (5,190,311 bytes). Not seen in a client: no GPU, no client and
no online session here, so every visual statement above is a source-level claim.

Interpretation risk worth recording: the user asked to "use these as backgrounds" for the middle window.
This batch reads that as "these are the look references" and keeps the real destination visible through a
coloured frosted sheet (the shader samples the copied scene, never a baked image). Baking the uploaded
frames in as the window texture would be a different change and has not been done.

## Sift Overhaul 0.32.0-alpha: CI verified (run 36939932907, bf6a65ff)

The Actions run on `bf6a65ff` is green end to end: 68 data-contract tests, 613-file validation
(157 functions), seven regenerated generators, 82 shader programs, the 26.3 client compile, the
shader-pack bundling check and the dedicated-server smoke test, which now stages a REAL rift crossing.
Artifact `Sift-Overhaul-0.32.0-alpha-26.3` (5,202,375 bytes).

What the new smoke stage proves on the server (it failed twice before it was right, which is the point):
- `travel/begin` moves an entity into `entersift:rift_tunnel` and the entry path throws nothing.
- `tunnel/player_tick` hands the traveler over at the far end.
- `travel/surface` finds a destination column, `travel/arrive` re-summons the return rift, and the
  walker is standing in `entersift:the_sift` within 48 blocks of a `RiftPortalEntity`.

Two real bugs were found by that stage, both of which stranded a crossing and neither of which showed up
in any static gate:
- `travel/surface` did not always find a natural column (ocean/lava/void). It now lays a small saltstone
  ledge as a fallback via `travel/fallback_ledge`, so every rift has a walkable far side.
- A one-word typo in the new fallback line (`positioned` instead of `execute positioned`) made the whole
  function fail to load, which is silent in game and only ever printed one line at server start.
  `validate.py` now rejects any `.mcfunction` line that starts with an execute subcommand, and the check
  was verified by re-introducing the typo and watching it fail.

## Sift Overhaul 0.32.0-alpha: local gates

- `python3 tools/validate.py` — passed: 613 JSON/metadata files, 155 functions, 12 Sift biomes.
- `python3 tools/test_data.py` — all 67 data-contract tests passed. The staff contract now asserts the
  3D chain (handheld parent, shaft + floating crystal elements) and that the staff art is no longer
  byte-identical to the gauntlet art.
- `python3 tools/regen_check.py` — seven live generators reproduce the shipped tree.
- `python3 tools/check_shaders.py` — structure ok for 82 programs (no glslangValidator locally).
- `git diff --check` — clean.

### The 26.3 compile is the only gate that can catch a Java signature mistake: `EnterTheSift` gained
`wearsGauntlet`/`toggleGauntlet` (chest-slot equip swap, `LivingEntity.getItemBySlot`/`setItemSlot` and
`Entity.isShiftKeyDown`, all confirmed present in the probe signatures), and `RiftPortalRenderer` gained
`tipFade`/`borderWave` with a new `SiftBudget.riftTipFade` flag. Nothing has been compiled locally.

## Sift Overhaul 0.33.0-alpha: glass-beam edges and a floating blue block

Local gates: 69 data-contract tests, 613-file validation (157 functions), seven regenerated generators,
82 shader programs, `git diff --check` clean.

- `RiftPortalRenderer`: `rim(...)` gained the owning cell's centre so it can draw an inner bright line as
  well as the outer band; bands widened; `borderWave` amplitudes raised; `boxFaces` draws a framed pane
  per frosted slab. All eight `rim(...)` call sites were updated in the same pass (the signature change
  that broke CI once; the call sites and their arguments were checked by grep before the push).
- `rift_staff.json` / `rift_staff_blue.json`: the floating element is now a true 4.4-unit cube with a
  1.5-unit gap above the collar, and `tools/rift_item_art.py` draws a block-face texture for it.
- The staff textures and the gauntlet texture are no longer byte-identical (they were, which is what the
  user was looking at).

## Sift Overhaul 0.33.0-alpha: CI verified (run 36941443986, 543a7d2)

Green end to end on `543a7d2` — 69 data-contract tests, 613-file validation (157 functions), seven
regenerated generators, 82 shader programs, the 26.3 client compile, shader-pack bundling and the
dedicated-server smoke test (entry, corridor hand-off, destination search, arrival, return rift). Artifact
`Sift-Overhaul-0.33.0-alpha-26.3`.

The eight `rim(...)` call sites were changed in the same pass as the signature that now takes the cell
centre; that combination is the one that broke CI once before, so it was checked here by grep and is now
confirmed by the compiler.

## Sift Overhaul 0.34.0-alpha: the gauntlets are worn equipment

The last piece of the user's repeat message that was still only half-done: a gauntlet could be put in
the chest slot, but nothing drew it there. 26.3 renders worn equipment from data, so the gauntlets now
carry the real thing:

- `SiftContent.wearable(...)` attaches `DataComponents.EQUIPPABLE` (chest slot) with
  `Registries.EQUIPMENT_ASSET` pointing at `assets/entersift/equipment/<id>.json`. Both gauntlets use it,
  so vanilla right-click and shift-click equip them onto the arm as well as the mod's sneak-right-click.
- `assets/entersift/equipment/{rift,red_rift}_gauntlet.json`: a `humanoid` layer per gauntlet.
- `assets/entersift/textures/entity/equipment/humanoid/*.png`: 64x32 worn sheets painted ONLY on the
  vanilla arm cells (checked: 160 opaque pixels, every one inside u 40..55 / v 16..31), so the rift
  gauntlet shows as a banded, gold-trimmed, gemmed forearm on both arms and the body, head and legs stay
  bare. Drawn by `tools/rift_item_art.py`, which is now a checked live generator (8 of them).
- `tools/validate.py` refuses to ship an equipment layer whose worn texture is missing.
- `SiftSmokeTest.checkWearable` (tick 145) asserts on a real server that both gauntlets carry the
  component, and dumps an armour stand holding one for the CI log.

Local gates: 70 data tests, 615-file validation, 8 generators, 82 shader programs, `git diff --check`
clean. The Java here touches `DataComponents.EQUIPPABLE`, `Equippable.builder(EquipmentSlot)`,
`setAsset(...)` and `Registries.EQUIPMENT_ASSET` — none of those could be signature-checked in this
sandbox (no local jars), so the 26.3 compile is what confirms them.

## Sift Overhaul 0.34.0-alpha: worn gauntlets, a destination behind the glass, and the probe's verdict

Run 36942346211 failed with `SiftContent.java:34: error: cannot find symbol - variable EQUIPMENT_ASSET,
location: class Registries`. That guess came from the 26.3 class list; the names could not be checked
offline. So the equipment classes were added to `tools/probe/classes.txt` and the API-probe workflow was
run (run 36942751368, commit 729ed46), which dumped the real signatures into `probe-output/signatures.txt`:

- `Equippable.builder(EquipmentSlot)` - exists.
- `Equippable.Builder.setAsset(ResourceKey<EquipmentAsset>)` - exists.
- The registry key is `net.minecraft.world.item.equipment.EquipmentAssets.ROOT_ID`; `Registries` has no
  EQUIPMENT_ASSET entry (only TRIM_MATERIAL / TRIM_PATTERN).
- `EquipmentClientInfo.Builder.addHumanoidLayers(Identifier)` - confirms the `layers.humanoid[].texture`
  JSON shape and that the layer's texture id is what the sheet is looked up by.
- `EquipmentAssetManager.get(ResourceKey<EquipmentAsset>)` - the client-side source of the worn layer.

The gauntlets now use `EquipmentAssets.ROOT_ID` with `setEquipOnInteract(true)`, and the contract asserts
those exact symbols. The one thing the probe could not confirm is the on-disk directory the manager
scans (`assets/<ns>/equipment/`), which follows the 1.21.4+ vanilla layout; if it were wrong the gauntlet
would simply render nothing rather than error.

## Sift Overhaul 0.34.0-alpha: CI verified

Run 36943120185 on the 0.34 tree is green end to end: 71 data-contract tests, 615-file validation
(157 functions), eight regenerated generators, 82 shader programs, the 26.3 client compile (including the
new `EquipmentAssets.ROOT_ID` equipment component), shader-pack bundling and the dedicated-server smoke
test with the staged rift crossing and the new `checkWearable` assertion.

Artifact: `Sift-Overhaul-0.34.0-alpha-26.3`.

## Sift Overhaul 0.35.0-alpha: the client crash - two stray #endif and a gate that never ran

The pasted crash log ended at
`entersift:core/rift:92: error: '#endif' : mismatched statements` followed by
`Failed to load required shader programs` and, after a second failed reload, the client stopping.
Root cause found in `rift.fsh`: the file had more `#endif`s than `#if`s.

- One was pre-existing (present in the 0.31/0.32 shader the user was running - their log says
  `entersift 0.32.0-alpha`, and it crashed the same way).
- One was mine, added in the 0.34 window rewrite (the block it replaced had an `#ifdef/#else/#endif`
  pair; the replacement kept two `#endif`s where one was needed).

Both removed. The shader is balanced now, and `check_shaders.py` counts `#if/#ifdef/#ifndef` against
`#endif` for every core shader and every shaderpack program (105 files), ignoring commented-out
directives. A new `test_data.py` contract calls the same function, so the Java test suite catches it too.

WHY IT SHIPPED: the workflow's glslang step passed `"$(find /tmp/glslang -name glslangValidator ...)"`,
and when that find came up empty the script received an empty path, treated "no compiler" as "skip the
compilation", printed `structure ok ... (compile skipped)` and exited 0. So no core shader had EVER been
compiled in CI. The step now uses `curl --fail` and `test -x "$TOOL"` and fails the build when the
compiler is missing, and `check_shaders.py` fails (instead of skipping) whenever a tool path is passed
but unusable.

## Sift Overhaul 0.36.0-alpha: frosted gloss + the shader result is now provable from the API

- `rift.fsh`: the destination is a `destination(dir, ...)` function of the view ray, sampled four times
  for a frost blur, with a sweeping gloss band and a glass alpha of `mix(0.86, 0.98, frostAmt)`.
- `check_shaders.py` now emits the compile outcome as a GitHub annotation (`::notice title=Shaders
  compiled::...` or `::error`), because run-log downloads are blocked in the dev sandbox while
  annotations are readable. That is how the next run is verified from here.
- Obsolete contract: the 0.20-era assertion that `rift.fsh` must NOT contain a destination function is
  replaced - the destination is now the whole point.

## Sift Overhaul 0.36.0-alpha: CI verified, and the shaders really were compiled this time

Run 36944533363 on `02a4037` is green end to end. The check-run annotation is the evidence that the
shader gate is finally real:

    notice: 82 programs and the core shader variants compiled clean with Glslang Version: 11:15.1.0

Until 0.35 that step silently skipped every compile (its `find` came up empty, the script was handed an
empty tool path and reported "structure ok (compile skipped)" with exit 0). So the four rift pipelines
(`rift`, `rift_wall`, `rift_glow`, `rift_refract`) and the tunnel shader had never been compiled by
anything, and a stray `#endif` in `rift.fsh` shipped all the way into a client, where it failed resource
reload, made Minecraft drop the packs, retry, fail again and exit - the user's black screen.

Artifact `Sift-Overhaul-0.36.0-alpha-26.3` (5,208,195 bytes).

## Sift Overhaul 0.37.0-alpha: per-destination worlds, and the live-view question settled

- `rift.fsh`: `destination(..., int view)` paints a distinct world per style (nether embers / burning
  horizon, end void with a floating island and no sun, temperate clouds), all still blurred behind the
  frost and still opaque over the interior.
- `tools/probe/classes.txt`: queued `LevelRenderer` and `CompoundTag` (and re-queued `ClientLevel`) so the
  next probe run dumps the signatures a live-destination render would need.
- Docs: `RIFT_STATUS.md` records exactly what is reachable in 26.3 (`LevelRenderer.setLevel`,
  `Minecraft.setLevel`/`levelRenderer`, `ClientLevel.hasChunk`) and what is not (the client has only the
  current dimension's level and chunks), plus the fact that a 26.3 Immersive-Portals-style mod exists
  (CurseForge 1511174, updated this week) which proves the technique but needs per-dimension chunk sync.

## Sift Overhaul 0.38.0-alpha: the destination dimension's real terrain behind the glass

- New `RiftTerrainView`: server-side sampling of the destination surface (`Heightmap.Types.WORLD_SURFACE`
  over a 24x24 square spanning 64 blocks around the destination arrival point), a colour table for
  vanilla and Sift surface blocks, a nibble-per-column codec (`min:span:palette:cells`) and a null-safe
  decode. Unit-tested without a server in `RiftTerrainViewTest` (round trip, palette, flat terrain, bad
  input, every `RiftType` has a destination).
- `RiftPortalEntity`: new synched `TERRAIN` string, sampled once per rift on the server when it finishes
  growing, from the dimension `RiftType` names.
- `RiftPortalRenderer`: `State.terrain`, decoded per frame and drawn as six depth-layered skylines behind
  the glazed square, under the frost; the relief flag is the `+16` bit of the existing view code.
- `rift.fsh`: `destination(..., float hasTerrain)`; with a relief present the painted ridges step aside
  (`if (hasTerrain < 0.5)`) so the real and painted land cannot double up, and the glass thins
  (`mix(0.34, 0.72, frostAmt) + (1.0 - hasTerrain) * 0.34`) instead of the near-opaque 0.36 glass.
- `tools/probe/classes.txt`: queued `EntityDataSerializers` to pin the synched-string API.
- `gradle.properties` / workflow artifact: `0.38.0-alpha`.
