# Rift status: 0.28

## 0.28 — back fading (this pass)

The supplied reference shows frosted voxel shells whose near faces stay crisp while the recessed and rear
faces dissolve instead of ending on a hard backside. Rift geometry now fades with depth behind the opening
plane:

- `backFade(z)` is 1 at the front plane and 0 once geometry has receded `FADE_FAR = 0.85` blocks behind it
  (`FADE_NEAR = 0.06` keeps the front lip and flange untouched), so a recessed wall strip reads solid at the
  lip and transparent at the membrane, and the rear veil thins to almost nothing (`0.20 + 0.80 * backFade`)
  instead of hiding the back of the rift.
- Edges, rims, tendrils and glow bands use `edgeA(...)`, which keeps a 45% floor: the wireframe dims as it
  recedes but stays readable rather than vanishing before the faces do.
- Detached satellite boxes and the five floating cubes additionally use `spokeFade(...)`, a gentle falloff
  with distance from the opening centre, so the perimeter pieces read fainter than the central cross.
- The opening itself is exempt: main-body window quads pass a fade of 1, and only detached window panels are
  faded. The fade travels in the window vertex colour (`riftData.a`) and the shader multiplies its output by
  it, so the clear portal view never dims.
- `config/entersift-client.properties` gained `rift_back_fade` (default true) to disable the effect.

## 0.27 — corrections on the linked baseline

Baseline for 0.27: the user's Actions build 36919666703, commit `ad86c346702279d2b0b06d3778c0ae6f9671a08e`.
This snapshot was imported onto the session branch before editing. The substantial baseline changes
versus the session's older checkout are intentional.

## Implemented

Gameplay and lifecycle

- Missing modern item definitions for both staff models and their existing textures.
- One shared silhouette between client and server. Swept player movement must cross an actual recessed
  membrane cell; proximity alone never triggers. Players are tracked individually; spectators, immature
  rifts and long position jumps are ignored; cooldowns are retained.
- Entry is immediate: no three-second delay, no opaque orange cutscene. First person gets a short white
  pixel HUD; observers get white particles at the crossing.
- Membranes and walls use alpha blending and do not write depth. The opaque procedural destination image
  was replaced by a clear tinted membrane with thin bright edges.
- Seed/bar, a short ring, then a tiered stepped assembly over roughly five seconds (`CLUSTER_START = 8`,
  one tier every 25 ticks). The crystal seed is a 0.5-block cube. The huge night curtains stay removed:
  rising energy cubes with equal dimensions fade and shrink to nothing.
- Surface arrival requires two clear air blocks above explicitly allowed ground and does not excavate a
  plaza. Nether arrivals search below bedrock. If no checked destination is available the player stays in
  the tunnel rather than being teleported to an unchecked fallback.
- Arrival rifts inherit type/width/height, open fully formed, allow return travel, and persist for five
  minutes instead of being deleted by legacy marker cleanup. Legacy blue return anchors are retired.

Rendering (0.27 additions, in the mod's own renderer, never vanilla overrides)

- `RiftScene`: copies the frame colour and depth into two mod-owned textures (registered through the
  `TextureManager` as borrowed views of a `TextureTarget`) and exposes them as `Sampler1`/`Sampler0` on a
  dedicated `entersift_rift_refract` render type. The shader bends the sampled screen UVs inside the
  opening, with a depth guard that drops the displacement wherever the warped sample would be in front of
  the membrane. Resizing, logout and shutdown release the target. Everything degrades to the plain
  translucent membrane when a future/renamed API is missing, or when an Iris shader pack is active, since
  Iris binds different attachments.
- `RIFT_REFRACT` keeps the mod's palette, tide modulation and seven-phase flare instead of a global
  three-tone wash, because this pipeline is shared with the Sift sky and tunnel.
- Inflated glare shells: a three-layer seed shell around the crystal, and a three-layer rim-only shell
  around the grown opening (no filled rectangle that would obscure the clear interior).
- Six step-locked rotating tendrils (six segments each, pale pink tips) and fifteen small rim teeth per
  boundary. A brief non-destructive white cross appears at ticks 0-3; terrain is never cleared.
- `RiftCoreBlock` + `RiftBlockEntity` + `RiftBlockEntities`: a placeable, registered rift core that grows,
  summons a rift once (persisted before summoning, so a reload cannot duplicate it), emits `rift.growth`
  at each of the four assembly beats, and carries a `power` blockstate driven by the nearest player so the
  light is genuine vanilla block light rather than fake lightmap writes.
- `RiftSounds`: one positional, looping `ambient` instance per loaded rift core or rift entity, pitched to
  the growth age, faded by distance, restarted by a watchdog if a resource reload or device change stops
  the channel.
- Original audio synthesis in `tools/rift_audio.py` (integer-cycle 4 s hum for a seamless loop, plus a
  growth crackle). CI encodes the WAVs to mono Vorbis; the sound files themselves are not committed.

## Validation

0.28 adds `test_v028_back_fade_dissolves_the_receding_structure` (65 tests total); the 0.27 numbers below
were 64.

- `python3 tools/validate.py`: PASS (613 JSON/metadata files, 155 functions).
- `python3 tools/test_data.py`: PASS (64 tests).
- `python3 tools/regen_check.py`: PASS, seven live generators reproduce their owned files.
- `python3 tools/check_shaders.py`: structure PASS; local GLSL compilation is skipped because
  `glslangValidator` is not installed here. CI compiles the shaderpack and the core shaders.
- JUnit swept-crossing cases for both directions, standing nearby, parallel motion, notches, heights and
  swept movement.
- GitHub Actions run 36931015775: PASS end to end on this source, including the 26.3 client compile, the
  shader-pack bundling check and the dedicated-server smoke test (which now also places a rift core and
  asserts the registered block entity ticks to age 100).

## Still outstanding — do not call this one-to-one

- Nothing here has been seen on a screen. There is no GPU/client harness in this environment: the
  silhouette, alpha layering, glare intensity, tendril motion, flare ordering and the refraction offset
  all still need a capture comparison against the supplied references.
- Refraction uses a copy of the opaque-terrain frame, so entities, particles and translucent terrain do
  not bend, and the copy is one submit cycle behind; fast camera motion slightly lags.
- With an Iris shader pack the rift falls back to the transparent membrane (no refraction), by design.
- The staffs keep the baseline handheld sprite art, not newly modelled 3D geometry.
- Arrivals preserve type and dimensions, not a paired entity/UUID, satellite seed or traversal
  orientation. The permanent ritual portals remain separate from natural rifts.
- The surface search covers a small fixed region near the origin and keeps those chunks loaded.
- Third-person player-model dissolution (white pixel mask on the player mesh) is still not implemented;
  only white particles are emitted at the crossing.
- The rift core's growth timeline restarts at age 0 when its chunk is unloaded, because only the age cap
  and the "opened" latch are persisted and client growth uses the latch.

## Manual acceptance checklist

1. Give both staffs; inspect inventory and both hands, reload resources; no missing-model checkerboard.
2. Spawn all four rift variants at noon and night. Walk parallel to the face, stand close, cross a notch,
   then walk through a membrane from each side. Only the last action should travel. Repeat with two
   players and rotated rifts.
3. Confirm seed/bar/ring/assembly ordering and straight narrow edges. Terrain should remain visible
   through surfaces, and the terrain behind the opening should visibly bend inside it. No light curtains.
4. Enter with first/third-person cameras: no pause, no orange cutscene, third person has no fullscreen HUD.
5. Exit into Overworld, Sift, End and Nether; verify safe support/clearance, matching non-blue rift and
   successful return. Test unloaded and obstructed destination columns.
6. Place `entersift:rift_core`; confirm it ticks, summons once, lights up near players, hums, and does not
   duplicate after a save/reload.
7. Repeat without shaders, with the bundled Iris pack (expect the transparent fallback), with
   `rift_refraction=false` / `rift_glow=false` / `enable_flares=false` / `rift_spill=false` in
   `config/entersift-client.properties`, and with pre-0.27 return gates.

## 0.29 — no flat back, box cavity, placement lightning + shockwave (CI verified)

- The flat translucent `backsideVeil` quad is gone: it is what made the rift read as "just a window".
  The back is now carried by the stepped box walls, the rim outline and the depth fade (opens at the
  front, dissolves once it has receded `FADE_FAR = 1.0` behind the opening).
- `mainDepth` is 0.60 with the left attached boxes stepped at 0.32 / 0.44, and the frosted box faces
  render at `alpha * 0.82` (was 0.24) against a `0.50` window plane, so the box structure is visible
  around the bright opening instead of only the neon lines.
- Placement reads in three beats, matching the reference frames: a tall tilted glowing seed slab that
  turns while it grows, lightning crawling off it and later off the finished rift (out to ~38 blocks,
  more and brighter at night), and the white ground shockwave — band one appears on the land and dies,
  then the gigantic band crosses the gap it left, out to ~46 blocks, with cracks trailing each front.
- Both new effect groups are switchable (`rift_bolts`, `rift_shockwave`).

Still not one-to-one: the blast radius, the window plane depth and the exact frost opacity were chosen
from measured reference proportions and have never been compared against a running client. Those three
numbers are the dials to turn next.

## 0.30 — frosted box with one square window, single blast, white birth

- The rift is now a stepped frosted BOX. Only the central 3x3 cell square stays glazed; every other body
  cell (and every satellite) is a frosted grey-white panel at its own recess depth, with a lit border
  around the square hole. That is the "square box behind it" the reference frames show, instead of the
  previous fully-transparent stepped cross.
- The placement blast fires ONCE: a single gigantic white band out to ~62 blocks, cracks trailing the
  front, then the rift snaps in, flares white and dissolves into its colours over about six ticks
  (`RIFT_BIRTH = 42`, `RIFT_COLOUR = 48`). The 0.29 two-pulse version is superseded.
- Lightning still crawls off the assembling seed and off the finished rift (out to ~38 blocks).
- Switchable: `rift_box_face`, `rift_shockwave`, `rift_bolts`, `rift_back_fade`.

Dials that are still guesswork and can only be settled in a client: how frosted the panels look
(`0.95` face alpha through `faceA`), how wide the square window should be (currently 3x3 cells of an
11x8 grid), and whether the band should read thicker or thinner at its widest.

## 0.31 — eight styles, two silhouettes, proximity frost, pane aura

- Eight rift styles now exist: the five destination looks plus the white reference cross (17345525) and
  the steep olive wall (The_Nether). Each has its own inner tint and its own frosted tone measured from
  the reference crops, so rifts in the world come out green, lime/yellow, red, orange, pink or white —
  the spread the reference screenshots show. Roughly a third of overworld/sift rifts and two fifths of
  end rifts take the white style.
- Two silhouettes: the usual wide stepped cross, and the TALL tower variant (rolled one in five, spawned
  as a genuinely taller entity). Variant selection is derived from width/height, so collisions and
  rendering always agree.
- The glazed square is a frosted pane at range and clears as you walk up (7.5 blocks -> 1.6 blocks),
  but never goes fully clear, so the dimension stays "seen through glass".
- The aura above the rift is now flat luminous panes, one texture pixel thick and roughly twice the
  previous size, rising from the top lip and disintegrating around half way up.

Still unverified in a client, and the dials to turn first: how strong the frost reads at range
(`0.62` in the shader), how fast it clears (`FROST_NEAR`/`FROST_CLEAR`), and the pane size/spacing.

## 0.32 — thicker, wavy, dissolving edges; real staffs; worn gauntlets; entry hardening

- Rift edges are thicker: the bevel lip is 0.05 wide (was 0.018) and every rim band roughly doubled
  (bright band 0.15 + 0.10 x flash, halo 0.46 + 0.20 x flash, core line 0.075). The recessed back steps
  keep a quarter-strength wave so the opening still reads as a clean rectangle.
- The side borders are WAVY, as asked: `borderWave(along, time)` is the sum of two sines
  (`0.14 sin(1.9a + 1.1t) + 0.06 sin(3.7a - 1.7t)`), driven along the border in blocks and damped to
  0.55 across the horizontal runs. `rift_tip_fade` switches it back to the plain frame.
- The tips dissolve to nothing: `tipFade(sh, x, y)` is 1 through the middle and falls to 0 past the
  arms, so the outer boxes, their rims and the frosted panels all fade out completely at the ends
  instead of stopping in a hard cut. This is the "basically nothing at the end" the reference frames
  show, and it is what makes the 13-pixel reference mass read as a tunnel that evaporates at its mouth.
- The rift staffs are real 3D items now: a slim obsidian shaft with gold bindings and a rift CRYSTAL
  that FLOATS clear of the tip (a separate element with a visible gap), violet for `rift_staff`, cyan
  for `rift_staff_blue`. Their textures were also byte-identical to the gauntlet's before this batch;
  `tools/rift_item_art.py` now draws both staff sheets deterministically.
- The gauntlets can be WORN: sneak-right-click swaps a held gauntlet onto the chest slot (the arm), and
  the same gesture with an empty hand takes a worn one back. A worn gauntlet casts the rift magic from
  the arm, by right- OR left-click, without being held.
- Crash hardening: `RiftPortalEntity.tick` now contains every rider-entry command in a try/catch that
  logs and leaves the rift open rather than propagating, and it rebuilds a degenerate shape instead of
  walking a zero-sized grid. `SiftSmokeTest` stages a real entry (summon -> `travel/begin` -> walk the
  tunnel -> assert arrival) so a regression fails CI instead of the game.

Still not seen in a client: whether the thicker rims and the sine wave read as "thicker wavy borders"
at gameplay distance, and whether the floating crystal sits where the reference staffs hold theirs.
Dials: `FLANGE`, the band widths inside `rim(...)`, and `borderWave`'s amplitudes.

### 0.32 arrival fix (found by the new smoke stage)

A staged rift crossing in CI exposed that the destination search could come up empty (ocean, lava or void
at the anchor column) and quietly leave the traveler walking the corridor forever, retrying every tick.
`travel/surface` now ends with `travel/fallback_ledge`: a 5x5 saltstone ledge at the top of the anchor
column, so an arrival always lands somewhere walkable and the return rift always opens. A second bug — a
fallback line that started with `positioned` instead of `execute positioned` — killed the whole function
at datapack load; `validate.py` now fails the build on that entire class of typo.

The staged crossing is green in CI (run 36939932907, artifact `Sift-Overhaul-0.32.0-alpha-26.3`): entry,
corridor hand-off, destination search, arrival and the return rift all happen with no thrown error. The
staff's ranged spell (`rift/staff_cast`: crystal flash, eight-block bolt, rift torn open where it lands)
is a data-side function and is NOT covered by the smoke stage — only its existence and its call sites are
asserted by `tools/test_data.py`.
