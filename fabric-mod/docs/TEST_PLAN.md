# Minecraft acceptance checklist

Use a disposable world and a dedicated server with two clients. Never use a valuable save for an initial alpha test.

## Build / initialization
- [ ] JDK 25: Gradle build and all JUnit ritual tests succeed.
- [ ] Dedicated server starts with Fabric API and this mod, without loading client classes.
- [ ] Client connects; all mod blocks/items and both fluid variants register.
- [ ] No JSON codec, unknown-feature, command parsing, macro, missing texture or missing-model warnings.
- [ ] Save/restart and `/reload` preserve souls and return scores without duplicating arrival gates.

## World generation
- [ ] New Sift chunks generate all three biomes and continuous terrain with no chunk seams.
- [ ] Salt terrain, soul crystals, surface ribcages, fossils and meadow flowers appear.
- [ ] Ichor lakes flow correctly at exposed edges, have animated still/flow textures and can be bucketed.
- [ ] Validate the 26.3 `overlay`, `simple_block`, `offset`, block-predicate and material-rule codecs specifically.
- [ ] Confirm custom flower-support tagging and fluid rendering behavior.

## Ritual
- [ ] Demo arena works for both frame axes; actual ancient-city centre rectangle is recognized.
- [ ] Correct six-colour order succeeds. Right-click tuning alone does not advance it.
- [ ] Wrong order, timeout, one reused/recoloured note and simultaneous different cities do not combine progress.
- [ ] Client and server note sounds do not double-play; clicking a ritual note in creative does not break it.
- [ ] Singer rises; six replies play at the six saved note positions; portal flickers before opening.
- [ ] Portal display fits the detected frame; collision detection covers its full aperture.
- [ ] Repeating the sequence does not duplicate an existing portal; restart mid-song resumes safely.

## Travel / encounters
- [ ] Each rift destination produces a usable pad and a working return gate.
- [ ] The two test players return to their own source dimensions and positions, including negative coordinates.
- [ ] Nested rifts preserve the first source; death invalidates the old return.
- [ ] Unloaded/blocked destination guards refuse unsafe entry; no terrain overwritten by arrival pads.
- [ ] Confirm behavior when source terrain is altered or obstructed before returning; implement a safe-location search before production release.
- [ ] Gauntlet air/blocked-target handling, 10-soul cost and cooldown are authoritative and exploit-resistant.
- [ ] Random encounters respect the server toggle. Riftcallers strike ground without modifying blocks.
- [ ] Rifts expire after 900 loaded ticks; unload/reload does not leak entities.
- [ ] Replace the provisional Nether-roof/high-altitude pads with tested exploration exits before release.

## Souls / entities / visual
- [ ] Ichor damages once per second, drains souls to zero but not below, and causes the depletion effect.
- [ ] Interrupting drinking does not grant effects or consume a potion. Completion returns a bottle correctly, including full inventory.
- [ ] Ghost effects last 600 ticks without game-mode changes; death/disconnect/rejoin behavior is consistent.
- [ ] Haunting is disabled by default and never affects spectators.
- [ ] Blub crawls, collides with ground, follows nearby players, has visible red eyes and can take damage.
- [ ] Killing a Blub cleans up all display passengers without deleting nearby living Blubs.
- [ ] Iris pack installs only once, does not overwrite edits/settings and compiles on target GPUs.
- [ ] Test with Iris absent, enabled and disabled; check fluid overlay, accessibility and low-end performance.
- [ ] Check long sessions for selector costs, frame-search latency, forced-chunk overhead and unbounded encounter counts.

## 0.2 reference-driven visuals

Run the additional sky, glow, rift and particle checks in [VISUAL_STATUS.md](VISUAL_STATUS.md).
