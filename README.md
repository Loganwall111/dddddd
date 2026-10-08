# Beyond the Limits: Chapter One — The Neverending World

A Fabric mod prototype for **Minecraft Java Edition 1.20.1**. Normal survival begins normally; then reality starts to come apart. The first chapter is built as a playable vertical slice, not a pile of disconnected gimmicks: slow-burn world deterioration leads to a growing tear, the tear opens into a deliberately alien void-world, and the player can stabilize the damage—or arm a Resonant Core and make it much worse.

## The first playable slice

- **Reality progression.** A saved world-integrity ledger decays over time and records opened seams and Observer sightings. The HUD shows the current phase: *Quiet Fracture → The Bleeding → World Collision → Reality Failure → Last Light → The Neverending World*. As integrity falls, tears stain nearby Overworld ground with fractured stone; later they physically replace natural terrain with End Stone, Netherrack, and finally Crying Obsidian.
- **Growing reality tears.** The first natural tear can appear after the second in-game day. It begins as a small animated fracture and grows through four stages over several Minecraft days. Mature tears are walk-through gateways. Small obsidian-and-glass scar sites form around them.
- **The Codeverse.** Crossing a mature seam loads a void dimension with no conventional terrain generator. On first arrival, the mod builds a one-off geometric landing sanctum: broken rings, split pylons, floating islands, an obelisk, and a return seam. A custom animated sky renderer draws a deep, moving starfield and gravitational-lens rings even without Iris.
- **Three seam-born entities.** The **Observer** appears far away and slips elsewhere or vanishes when watched. At lower integrity, a **Mirror Echo** dares to reappear closer. In the Codeverse, small **Fraylings** drift around the sanctum; interact with one and it leaves a Rift Shard. The Observer and Echo are not combat or loot mobs; sightings are saved to the world ledger.
- **Tools with purpose.** A **Rift Compass** points to the last recorded seam. A **Fracture Key** forces a tear open. Feed a **Rift Shard** to a **Reality Anchor** to restore eight integrity points.
- **Resonant Core.** Right-click to arm it; five seconds later, the server runs Minecraft's regular explosion pipeline at a large radius, plus a plume of anomalous smoke and portal particles. Block destruction, entity impulse, and fluid interaction are handled by the game engine rather than a fake screen-only blast.
- **New materials.** Fractured Stone, Nullstone, Codeglass, Memory Crystal, Reality Anchor, Resonant Core, Rift Shard, Fracture Key, and Rift Compass have original pixel-art textures, models, and names. Blocks have loot tables; craftable materials and tools have recipes.
- **Optional GLSL lens shader.** The included Iris/OptiFine shader profile adds a subtle chromatic gravitational warp, fracture filaments, sparse far-sky stars, and underwater refraction. It is optional; the mod itself does not depend on a shader loader.

## Install / build

Requirements: **JDK 17**, Minecraft **1.20.1**, and Fabric Loader. Fabric API is a required mod dependency.

```sh
./gradlew build
```

The Fabric jar is written to `build/libs/`. In a development instance:

```sh
./gradlew runClient
```

To create the optional shader-pack ZIP:

```sh
./gradlew shaderpackZip
```

Place `build/distributions/BeyondTheLimits-Iris.zip` in `.minecraft/shaderpacks` and select it in the shader menu. The standard mod visuals and Codeverse sky work without that ZIP.

## Play / test

- Start a new or existing Overworld survival world. The first natural seam is intentionally not immediate; leave the world running and explore.
- Use `/beyondlimits status` to inspect the saved chapter state.
- Operators can use `/beyondlimits rift` to create a mature test seam at their feet, or `/beyondlimits reality set 35` to jump the progression while testing.
- A mature tear can be crossed in either direction. The Codeverse return gate is on the central landing island; the exit returns to the Overworld spawn.
- The Resonant Core is deliberately dangerous. Arm it only in a test area and step away.

## Technical notes

- Loader: Fabric; target: Minecraft 1.20.1; Java: 17.
- World integrity is held in `PersistentState` on the Overworld and therefore survives restarts. Seam stage is stored in the tear's block state; the Codeverse's empty terrain is data-driven, while the landing structure is placed deterministically on first access.
- The Observer is spawned by the server director and rendered by a client-only custom model. HUD and integrity sync use a small Fabric play packet.
- The GLSL ZIP is a separate, optional Iris/OptiFine shader pack; vanilla Minecraft does not automatically load third-party GLSL programs from a mod jar.

## Chapter roadmap

The delivered slice establishes the systems and visual language for **The Bleeding**. The Infinite Structure, White Maze / deeper-under-bedrock layers, mirror-history dimension, time infection, biome evolution, chunk that moves, black sun, and the Last Chunk are story beats for later slices—not features claimed as already implemented. They can be layered onto the saved integrity director and seam network without turning the first release into unrelated novelty mechanics.

## Development checks

`python3 scripts/generate_assets.py` regenerates the small pixel-art textures and resource JSON. `python3 scripts/verify_mod.py` validates metadata, JSON, texture/model references, and shader-pack structure without requiring a Minecraft installation.
