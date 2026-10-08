# Acceptance matrix

## Automated checkpoints that passed

- [x] 451 resource/metadata documents; 530 byte-reproducible generated artifacts.
- [x] 16 Python authoring tests and 30 JUnit simulation/vault tests.
- [x] Native GLSL 150 compile/link for every core program, `beyond:titan` included.
- [x] Dedicated-server registry load and chunk/safe-landing generation in every compiled realm.
- [x] Actual Minecraft client shader load, first-person compositing and six equipped-glasses lenses.
- [x] Root -> A -> B -> root -> A using a real integrated-server player; separate inventory snapshots.
- [x] The real player's vanilla NBT contains the journey through the server mixin.
- [x] keepInventory OFF: death in A, root respawn restores root inventory, revisit does not reload dropped inventory.
- [x] Shrink and normal-scale reset, including same-tick dimension recalculation.
- [x] A native opaque wall occludes a singularity; twenty compared samples have zero RGB difference.
- [x] Actual-client screenshots inspected; field-guide text is crisp after removing double background blur.
- [x] Living World Titan: the voxel body is cut from the blocks the world is made of, uploaded once
      and posed on the GPU by `beyond:titan`; the smoke test stands the player off from it, looks up,
      and asserts it was really drawn in the world before reporting integration.

These are automated checkpoints, **not** a claim that the following interactive/multiplayer matrix is signed off.

## Interactive acceptance — still open

Use disposable Fabric 1.21.1 worlds. Back up both world and playerdata between save tests.
The automated workflow is useful evidence, not a substitute for these checks.

## Rendering / resource safety

- [ ] First Overworld join: eye above the initial view direction, arm silhouette, code dissolve; no camera lock.
- [ ] Rejoin: no repeated introduction. `/beyond witness` replays it.
- [ ] O immediately removes every Beyond post-process effect; HUD remains legible.
- [ ] Each lens requires glasses equipped in the HEAD slot; hand-held glasses do not count.
- [ ] Fullscreen/windowed resize, FOV 30/70/110, first/third person, view bobbing, crouch and scale.
- [ ] No mirrored/inverted scene; local singularity/rift stays fixed to its world coordinates.
- [ ] A wall and the player's hand occlude a local anomaly where they should.
- [ ] F3+T reloads assets without stale shader references, leaked FBOs or a black screen.
- [ ] Invalid override shader: log error, safe visual suspension, ordinary gameplay remains usable.
- [ ] Walk up to the colossus on foot: the body is the countryside's own materials, limbs and head
      move as it walks, the eyes read as unshaded `#FF0000`, and `titanSky` off removes it cleanly.
- [ ] Nether/End remain visually unchanged without glasses or placed anomalies.
- [ ] Low/Balanced/High at 1080p; measure GPU timings on actual NVIDIA/AMD/Intel hardware.
- [ ] Iris pack ON suspends effects; OFF restores. Unknown Iris API suspends conservatively.
- [ ] No claim of Sodium/other post-process compatibility until independently tested.

## Travel / physics

- [ ] Aim into stone rejects the knife/relic; clear space succeeds and item cooldown applies.
- [ ] Walk across both sides; sprint at an angle; walk just outside the rounded corners.
- [ ] No bounce loops after arrival; crouching/elytra/small player crossings remain consistent.
- [ ] Creator is attracted; another player is not; creative flight is not accelerated.
- [ ] Dropped items and mobs receive bounded motion. Terrain is not excavated.
- [ ] Per-world/per-player caps, lifetime expiry and `/beyond clear` remove all snapshots.
- [ ] Logout/server restart: transient anomalies do not survive or retain chunk tickets.
- [ ] Travel through every realm, inspect custom blocks, biome fog, feature columns and recipes.
- [ ] Root return from nested realm trips chooses a safe position near the ORIGINAL root origin.
- [ ] Block original return area: safe failure, no terrain destruction or inventory loss.
- [ ] Void recovery, beds/anchors, unusual world borders and scaled players.
- [ ] Scale growth blocked by ceiling; normal reset removes only Beyond's own modifier.

## Inventory persistence (highest-risk integration area)

- [ ] Root -> A (first copy); modify A -> root (original); revisit A (modified).
- [ ] A -> B -> A and root. Different players have independent vaults.
- [ ] Save/restart in each scope; selected hotbar, named/enchant/component items, armor, offhand.
- [ ] Death in realm with keepInventory off: dropped items do not resurrect on revisit.
- [ ] Death with keepInventory on; same-dimension respawn and cross-dimension root respawn.
- [ ] Death while holding cursor stack / crafting grid items; ordinary and modded containers.
- [ ] Cross a membrane with the player crafting screen open and a cursor stack; no orphaned stacks.
- [ ] External /execute dimension teleport, other mods' portals and respawn modifications.
- [ ] Disable isolation while away; root still restored; re-enable after returning.
- [ ] Full inventory when receiving guide/tools; item components survive NBT round trip.
- [ ] Incompatible journal schema fails visibly, not by silently dropping saved inventories.

Intentional: first-visit copies + ordinary chests permit copied items to be moved around.
Do not deploy this alpha as an anti-duplication survival-economy system.
