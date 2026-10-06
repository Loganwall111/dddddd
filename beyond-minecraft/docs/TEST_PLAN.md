# Interactive acceptance matrix — not yet signed off

Use disposable Fabric 1.21.1 worlds. Back up both world and playerdata between save tests.
The automated workflow is useful evidence, not a substitute for these checks.

## Rendering / resource safety

- [ ] First Overworld join: north-facing eye, arm silhouette, code dissolve; no camera lock.
- [ ] Rejoin: no repeated introduction. `/beyond witness` replays it.
- [ ] O immediately removes every Beyond post-process effect; HUD remains legible.
- [ ] Each lens requires glasses equipped in the HEAD slot; hand-held glasses do not count.
- [ ] Fullscreen/windowed resize, FOV 30/70/110, first/third person, view bobbing, crouch and scale.
- [ ] No mirrored/inverted scene; local singularity/rift stays fixed to its world coordinates.
- [ ] A wall and the player's hand occlude a local anomaly where they should.
- [ ] F3+T reloads assets without stale shader references, leaked FBOs or a black screen.
- [ ] Invalid override shader: log error, safe visual suspension, ordinary gameplay remains usable.
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
- [ ] Root return from nested realm trips restores the ORIGINAL coordinates.
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
