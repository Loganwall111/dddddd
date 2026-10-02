# Rift Extension for Enter the SIFT

Trailer-accurate rift structures for the Enter the SIFT mod. This is a **standalone development sandbox** — rifts are developed and refined here in isolation, then merged into the main mod when ready.

## What is this?

The main `Enter the SIFT` mod (`fabric-mod/`) has rift structures that don't fully match the Dungeons II trailer. This extension mod provides a clean environment to iterate on the rift visuals until they're trailer-perfect.

## How it works

### Phase 1 (this mod — current)
- **Inventory-placeable rifts**: 5 rift seed items in the Tools & Utilities creative tab
  - `Rift Seed — Sift` (pink/white, cross shape)
  - `Rift Seed — Overworld` (golden, staircase shape)
  - `Rift Seed — Nether` (crimson, slab shape)
  - `Rift Seed — End` (violet, wall shape)
  - `Rift Seed — Portal` (cyan, rectangle shape)
- Place the block → it vanishes and tears open a `RiftPortalEntity` with trailer-accurate geometry
- Visual-only: no transport, no gauntlets, no rituals
- Same 4-phase growth animation as the trailer (ripple → seed → fracture → stable)

### Phase 2 (future merge)
- Replace the main mod's rift seed blocks with these improved shapes
- Wire up transport/tunnel system
- Convert from inventory items to gauntlet/staff activation

## Trailer accuracy improvements over main mod

1. **Deeper centre box** (1.65 vs 1.45 depth) — more pronounced recessed alcove effect
2. **Wider flange frame** (COLLAR=0.35, FLANGE=0.18) — chunkier frame matching trailer
3. **More satellites** for Sift type (10 vs 8) — busier rim matching trailer silhouette
4. **Extra Sift silhouette details**: stepped cap, bottom irregularity, arm tips
5. **Wider depth range** (0.55-1.65) — more dramatic stepped depth contrast

## Project structure

```
rift-extension/
├── build.gradle              # Fabric Loom build config
├── gradle.properties         # MC 26.3, Fabric API 0.161.0
├── src/
│   ├── main/java/dev/logan/riftext/
│   │   ├── RiftExtension.java        # Main mod initializer
│   │   ├── RiftContent.java          # Block/item registration
│   │   ├── RiftType.java             # Destination enum
│   │   ├── RiftSeedBlock.java        # Placeable seed block
│   │   ├── RiftPortalEntity.java     # Rift entity (visual only)
│   │   ├── RiftExtEntities.java      # Entity type registration
│   │   └── RiftAnchorBlock.java      # Invisible anchor
│   ├── client/java/dev/logan/riftext/client/
│   │   ├── RiftPortalRenderer.java   # Main renderer
│   │   ├── RiftShape.java            # Trailer-accurate geometry
│   │   ├── SiftRenderTypes.java      # GPU pipelines
│   │   ├── SiftBudget.java           # Per-frame vertex budget
│   │   └── RiftExtensionClient.java  # Client init
│   └── main/resources/
│       ├── fabric.mod.json
│       ├── assets/riftextension/
│       │   ├── blockstates/          # 5 rift seed blockstates
│       │   ├── models/block/         # 5 block models
│       │   ├── models/item/          # 5 item models
│       │   ├── textures/block/       # 5 placeholder textures
│       │   └── shaders/core/         # rift.vsh + rift.fsh
│       └── data/riftextension/function/rift/
│           ├── seed.mcfunction       # Spawn rift from seed
│           └── close.mcfunction      # Remove rift
```

## Building

```bash
cd rift-extension
./gradlew build
```

The JAR will be in `build/libs/`.

## Mod ID

`riftextension` — separate from the main mod's `entersift`, so both can be loaded simultaneously for testing.