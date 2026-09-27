# Screenshot comparison — 0.2 source alpha

The fifteen screenshots attached in the latest request replace the earlier sci-fi moodboard as the primary visual reference. They show **two distinct portal families**, a bright aurora sky, opalescent liquid and rose/cyan terrain. The following is an implementation inventory, **not a claim of an in-game visual match**.

| Asked-for detail | What now exists in source | Still missing / unverified |
|---|---|---|
| Ribbon sky / wavy aurora | Sift-only procedural sky shader with five cyan/green/pink ribbons, world-direction anchoring, slow motion and adjustable intensity/speed. | Iris/GPU validation, final art tuning, exact reference sky geometry. No ribbon sky without Iris. |
| Day and night | Normal Overworld clock/timelines, skylight enabled; shader transitions from teal day to rose dusk to indigo night with stars. | Minecraft 26.3 lighting/timeline behavior needs testing. Time is shared with the Overworld, not an independent realm clock. |
| Ancient City connection | Six coloured wool-backed note blocks feed the existing reinforced-frame detector. Completing the song opens a dimension-crossing aperture in that frame. | Still needs verification against a real vanilla Ancient City. It does not automatically activate every city on load. |
| Cyan rectangular portal | New 32px, 64-frame tiled cyan mosaic texture, bright perimeter, full-bright display scaled to the detected aperture. | Actual bloom/scale testing; no view into the destination world through the surface. |
| Orange fragmented rift | Separate coral/gold animated membrane; stepped silhouette with white outer trim; four drifting/rotating detached fragments. 27 display entities per rift. | No literal lightning bolts, refracted world view, true translucent membrane or exact recreation. |
| Coloured note glow | Red, magenta, pink, cyan, blue and purple full-bright rims and particles. Responds to both player input and the Singer's six replies. Clears after four seconds. | This is visual emission/bloom, **not RGB light cast onto adjacent blocks**. Notes must be near a valid ritual frame. |
| Souls everywhere | Richer recipient-local soul/flame particles, with off/subtle/rich control and no persistent ambient-entity population. | These are atmospheric particles, not a new population of sentient soul mobs. |
| Rainbow ichor | New 32px, 64-frame pastel/oil-slick animation with glints. Real registered fluid gameplay is unchanged. | Reflections/refraction, terrain interaction, fluid rendering and damage need a runtime pass. |
| Landscape palette | Rose saltstone under salt caps; brighter teal meadow surfaces; biome fog adjusted to the supplied landscapes. | No matching authored canyon layout, giant cyan trees, ruins, decorative arch structures or reference vegetation yet. |
| Animals | Existing red-eyed crawling Blub display/rabbit prototype remains. | No newly added fauna in 0.2. Large spirit creatures, full custom AI/renderers and an animal ecosystem are not implemented. |

## Selecting the new shader

The mod now bundles and installs **Sift-Cinematic-0.2.zip**. This is a new filename so an old user-edited pack is not overwritten. After building and installing with compatible Iris, select the **0.2** pack in Video Settings → Shader Packs. Selecting an older pack will not show the new ribbons.

- `Sift sky ribbons`: set to `0.0` to disable the effect.
- `Ribbon motion speed`: set to `0.0` to stop ribbon movement.
- The custom sky is mapped only to `entersift:the_sift`; the Overworld/Nether/End do not receive this sky.
- Shader bloom now thresholds peak colour rather than only luminance, to retain saturated red/blue note glows.
- No lightning strobe, camera shake or forced motion blur has been added.

## Atmospheric controls

```mcfunction
/scoreboard players set #souls_fx sift.roll 0
# 0 = extra scripted ambience off; biome particles still follow Minecraft particle settings.
/scoreboard players set #souls_fx sift.roll 1
# 1 = subtle: 6 soul particles per nearby player per second, sent only to that player.
/scoreboard players set #souls_fx sift.roll 2
# 2 = rich (default): 22 souls + 8 small soul flames per second, recipient-local.
```

These controls do not suppress gameplay feedback, ritual particles or potion effects.

## Runtime checks still required

1. Compile the Fabric project and load all functions and worldgen registries without errors.
2. Confirm Iris routes the custom dimension to `world_sift` and both composite programs compile.
3. Test at `/time set day`, `/time set sunset`, `/time set midnight`, with and without the shader.
4. Turn the camera, hide the horizon behind terrain and hold an item: sky ribbons must stay world-anchored and never paint over geometry or the hand.
5. Test saturated note glows, cleanup on repeat activation and display cleanup on unload/reload.
6. Watch a wandering rift for its full lifetime: fragments drift, traversal works, and all 27 visual pieces disappear when it closes.
7. Check server and GPU performance with several players/rifts; particle quality reductions must remain usable.

**No installable JAR or Minecraft screenshot has been produced.** The image `visual-assets.png` is a flat review of generated source textures, not a rendering of the mod in Minecraft.
