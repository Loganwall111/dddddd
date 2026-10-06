# Beyond Minecraft

### The world is not empty. Something is looking back.

**Minecraft Java 1.21.1 · Fabric · Java 21 · 0.1.0-alpha**

A standalone, shader-driven first playable slice inspired by the supplied cosmic-eye,
fractured-world and black-hole references. It does not replace Enter the Sift or the
Lumital browser app elsewhere in this repository.

**Verification is in progress.** See [BUILD_STATUS.md](docs/BUILD_STATUS.md) for actual
results rather than assuming authored source is a tested release. Use a disposable,
backed-up world. Both the client and server need this mod and Fabric API.

## The first slice

- **The Witness:** an enormous procedural human-like eye, a celestial arm silhouette,
  spectral veins, stars, and a code-dissolve introduction behind the Overworld's actual
  terrain. The sky singularity is decorative; it does not secretly exert server gravity.
  Your player is not forcibly moved, grabbed or killed by the introduction.
- **Shattered Relic:** opens a local singularity with a ray-integrated accretion disk,
  depth-aware lensing, capped server-side attraction and real dimension travel through
  its horizon. No terrain destruction, forced PvP, damage blasts or permanent chunk tickets.
- **Reality Knife:** opens a finite, double-sided, violet-rimmed membrane. The fragment
  shader renders an original destination-inspired floating-island vista. Walking across
  the plane performs a real, safety-checked Minecraft dimension change. **The vista is
  not a live rendering of destination chunks; crossing is not a seamless recursive portal.**
- **Radiate Reality Glasses:** actual wearable head equipment, original armor/item textures,
  and six Mandela lenses: Lucid, Aurora, Prismatic, Negative Space, Living Membrane and
  Echo Memory. Press **V** to cycle. These change perception, not terrain collisions.
- **Scale Prism:** cycles **1/8× → 1/2× → 1× → 3×**, using Minecraft's scale attribute and
  a namespaced modifier. Growing is rejected if the new body intersects solid terrain.
- **The Field Guide:** a real in-game book and visual settings screen. Quality, intensity,
  motion, introduction and sky controls affect the real renderer. **O** is the visual
  emergency toggle; gameplay and return commands remain active when effects are off.
- **Seeded multiverse compiler:** one standard-library Python authoring script generates
  eight registered realms, eight biomes, 24 blocks, eight echo items, noise settings,
  animated textures, recipes, loot tables, feature placements and a shared catalog.
- **Realm inventory vault:** first entry into a realm copies the current inventory once;
  subsequent visits restore that realm's independent snapshot. Root reality retains its
  own inventory. Vault and origin data live inside the same playerdata NBT as vanilla's
  live inventory, rather than in a separate, crash-inconsistent save file.

There are **37 registered items in total**, counting block items and the five tools.

## Install / build

Use a **Fabric 1.21.1** installation with **Java 21** and **Fabric API 0.102.1+1.21.1
or a compatible 1.21.1 release**. Fabric Loader must be at least 0.16.9.

```sh
cd beyond-minecraft
./gradlew build             # Windows: gradlew.bat build
```

After a successful build, the installable file is:

```
build/libs/beyond-minecraft-0.1.0-alpha.jar
```

Put that JAR in the client's `mods` directory (and the server's for multiplayer).
**Do not install the `-sources.jar`, source ZIP or the 26.3 Enter the Sift mod into this
1.21.1 instance.** The separate GitHub workflow publishes artifacts only after its checks pass.
No external shader pack is required. Python is not needed by players or by normal Java builds.

### Renderer compatibility

- Written for the **vanilla 1.21.1 OpenGL renderer**. Rendering is isolated to the client source set.
- A supported Iris API reporting an active shader pack suspends this mod's effects instead of
  fighting for its depth buffers. If the Iris API is unrecognized, suspension is conservative.
- Sodium, other post-process mods, macOS and actual NVIDIA/AMD/Intel drivers require their own
  compatibility passes. Do not infer support from a successful software-OpenGL CI smoke test.
- Shaders compile at resource reload. Failures disable Beyond visuals and log an error; particles
  provide a limited fallback. The field guide reports shader status. The HUD is not post-processed.
- Four nearby anomalies at most are sent to each renderer; ray budgets are 32 / 48 / 72 steps.
  The effect uses one scratch color framebuffer, reads vanilla depth and never writes it.
  It is not a deferred renderer, PBR texture pack, DLSS implementation or path tracer.

## Five-minute test

1. Create a **new Creative test world with cheats**; start with no other renderer mods.
2. Look **north and upward** for the eye; the introduction lasts approximately 14 seconds.
3. Run `/beyond kit` for the five tools. Open the guide with **B** or by using its item.
4. Equip the glasses in the head slot. Press **V** through all six views; **O** must disable them.
5. Aim the knife at clear air at walking height, use it, wait briefly, and walk through the membrane.
6. Note the realm in `/beyond where`. Change a few inventory items.
7. **Sneak-use the knife**, or run **`/beyond return`**. Confirm the original inventory is restored.
8. Use the relic; approach its dark center to cross. Creative flight disables attraction, not travel.
9. Use the scale prism in open space. Finish at normal scale before testing enclosed rooms.

### Commands

| Command | Permission | Purpose |
|---|---|---|
| `/beyond` | Everyone | Help |
| `/beyond where` | Everyone | Dimension and inventory scope |
| `/beyond return` | Everyone | Escape a Beyond realm without needing an item |
| `/beyond kit` | Operator / cheats | Give the tools |
| `/beyond rift` | Operator / cheats | Open a membrane |
| `/beyond singularity` | Operator / cheats | Open a gravitational anomaly |
| `/beyond realm 0` … `7` | Operator / cheats | Visit a compiled realm |
| `/beyond witness` | Operator / cheats | Replay the encounter |
| `/beyond clear` | Operator / cheats | Remove this world's temporary anomalies |
| `/beyond scale 0.125` … `3` | Operator / cheats | Adjust scale; `1` removes our modifier |

All five tool recipes are shapeless; consult generated recipes or your recipe-viewing mod:
knife = iron sword + echo shard + ender pearl; relic = echo shard + eye of ender + amethyst;
glasses = spyglass + eye of ender + gold ingot; guide = book + amethyst;
scale prism = amethyst + clock + ender pearl. Realm crystals craft into four echo items and back.

## Safety and inventory semantics

- Default limits: 12 anomalies per world, two per creator, 50-second lifetime, 24-block attraction
  radius, 0.85-block/tick velocity cap and 96 processed entities per well/tick. Configuration is
  clamped on load. No client packet can request arbitrary spawn coordinates or dimensions.
- Gravity affects only the creator among players. It does not pull other players into a PvP trap.
- Arrival searches are bounded. If no ground is suitable, a small plinth can be placed **only
  in empty space inside a generated realm**. Return never carves or builds in your original world.
- Nested realm trips retain the first non-Beyond origin. A blocked return refuses the teleport
  rather than clearing blocks. An operator may need to clear that position. Void recovery tries
  the same safe return; it is not a guarantee against death if the original location is obstructed.
- Vault snapshots include main inventory, armor, offhand and selected slot. They do **not** clone
  health, XP, ender chests or placed containers. Snapshot isolation is NOT an anti-duplication
  economy: first-visit copies are intentional, and ordinary chests can transfer copied items.
- Death policy follows vanilla for the active realm: the post-death live inventory is captured,
  then an independent root inventory is restored on cross-world respawn. Same-world respawn
  does not reload a stale snapshot. Multiplayer/death/keepInventory must be playtested.
- If inventory isolation is disabled while someone is away, an existing vault is still restored
  when they return to root. Do not edit vault NBT or remove realms while players are inside them.
- **Back up the complete world, especially `playerdata`, before changing seeds, realm counts or
  versions.** Generated registries are a world compatibility contract, not disposable shader data.

Settings: `config/beyond-visuals.json` on each client; `config/beyond-server.json` on the server.
Server settings take effect after restart. Before uninstalling, return every player to root,
restore normal scale, and back up; custom blocks/dimensions cannot remain usable without the mod.

## Procedural authoring (not infinite runtime registry creation)

```sh
python3 tools/generate_multiverse.py                       # default 8 realms, seed 84921603
python3 tools/generate_multiverse.py --check               # no-write reproducibility check
python3 tools/generate_multiverse.py --seed 1234 --realms 16
```

Minecraft freezes block/item/dimension registries during startup. Therefore this script produces
**a finite catalog before building**, and the Java initializer registers exactly that catalog.
Different seeds give different original textures and world-generation parameters; the world's
own seed also affects actual terrain. A maximum of 32 realms prevents runaway resource growth.
The script uses vanilla model templates and a vanilla noise-settings schema, not extracted or
AI-generated copies of Minecraft textures. All authored pixels are generated locally by code.

## What is deliberately NOT claimed

This alpha does **not** contain: truly infinite blocks/dimensions, procedural guns, tornado/weather
simulation, a physical human Overworld or grabbing hand, dynamic fluid simulation, ragdolls,
realistic nuclear physics, physically accurate black-hole dynamics, Kerr lensing, seamless
recursive Immersive-Portals-style world rendering, infinite non-Euclidean geometry, giant
authored civilizations, or AAA/photorealistic production quality.

The shaders, server mechanics and generated content are real code. Those larger systems are
future engineering milestones, not feature names attached to a fake menu.

## Verification commands

```sh
python3 tools/validate.py
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/check_shaders.py             # requires glslangValidator; fails if unavailable
./gradlew test build
```

The isolated CI test server accepts the Minecraft EULA for that disposable automated test
instance only; installing or operating your own server requires your own agreement to its terms.
`BEYOND_SMOKE=1` enables the server harness and shuts down after registry/worldgen/NBT checks.
`BEYOND_CLIENT_SMOKE=1` enables the client shader-load harness and exits after resource loading.
Neither harness runs in normal installations.

See [architecture](docs/ARCHITECTURE.md), [verification](docs/BUILD_STATUS.md) and the
[manual test matrix](docs/TEST_PLAN.md). Original code and generated art: Apache-2.0.
Minecraft is a Mojang/Microsoft product; this is an unofficial mod.
