# Beyond Minecraft — verification record

Date: 2026-10-06. Target: Minecraft Java 1.21.1, Fabric, JDK 21.

## Passed locally

- Resource validation: 199 JSON/metadata documents, 8 dimensions/biomes, 24 blocks and 37 items.
- All model/texture, recipe/result and shader descriptor/uniform links checked.
- 233 generated artifacts reproduced byte-for-byte from the pinned seed.
- 10 Python authoring-compiler tests, including alternate seeds and the 32-realm cap.

## In progress

A branch-scoped GitHub Actions build will compile both Java environments, run JUnit,
compile and link native GLSL, boot an isolated dedicated server to load/generate the
real dimensions, and load resources in a software-OpenGL Minecraft client.
No success for these checks is claimed until the corresponding logs are available.

## Environment limitation

This workspace has no Java installation. Direct TLS downloads from Fabric, Mojang and
Maven endpoints fail. GitHub access is available, so actual compilation is being done
on this session's branch rather than inventing a local build result.

## Still requires interactive testing

Actual gameplay rendering, shader depth alignment while moving, first/third person,
FOV/hand effects, resolution changes, reload failures, gameplay balances, multiplayer,
respawn/death/keepInventory, inventory cursor/crafting slots, target GPUs and renderer
mod compatibility. A successful compilation or software-GL resource load does not
establish AAA fidelity, smooth frame rates or compatibility with other shader packs.
