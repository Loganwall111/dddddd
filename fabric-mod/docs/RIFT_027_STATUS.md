# Rift correction pass 0.27

Baseline: the user's Actions build 36919666703, commit `ad86c346702279d2b0b06d3778c0ae6f9671a08e`.
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
