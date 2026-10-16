# Minecraft Dungeons environment assets — conversion record (0.40.0)

Everything in this file was produced from the user's exported Minecraft Dungeons project share
(Drive root `1-baEE2gsiF4G-lY2_2GUZttTOv39lBXo`). No asset here is hand-drawn, and nothing is claimed
as working in-game until someone loads it — see **Verification status** below.

## Where the files went

| Path | What it is |
| --- | --- |
| `assets/sift/textures/block/` | environment tiles: the overworld atlas, blurred pixel noise, two sky cubemaps (6 faces each) |
| `assets/sift/textures/entity/` | the rift window masks (portal-view front/back) and the Deep Dark portal light ray |
| `data/sift/structures/<ROOM>.json` | converted room records: footprint, heightfield, doors, tags |
| `data/sift/structures/gltf/<ROOM>.gltf` | terrain meshes for those rooms, openable in Blockbench |
| `data/sift/structures/rift/<LEVEL>.json` | the level layout sheets (`Meadow_Rift_1/2/3`, `Ravines_Dungeon_1`, `Meadow_Boss`) |
| `data/sift/structures/index.json` | machine-readable inventory of every shipped asset with its source |

**Namespace note:** the mod's own id stays `entersift`; these files sit in a `sift` namespace exactly as
requested, which is legal — any resource on the classpath is reachable as `new ResourceLocation("sift", …)`.
Code that reads them must use `sift`, not `entersift`.

## How each piece was converted

`tools/ue_tex.py` — cooked UE texture to PNG, stdlib only (plus `texture2ddecoder` when installed for
BC7/ASTC; `pip install texture2ddecoder`).

* The pixel payload of a cooked texture starts **16 bytes after the `PF_…` string** that sits in the
  header. That offset is confirmed on a file whose decoded 1024×512 landscape silhouette was inspected by
  eye, and the 8-byte-early variant of the same file decodes to the same silhouette with colour noise —
  which is how the offset was pinned down.
* Dimensions cannot be derived from the payload (a DXT5 stream resliced at the wrong width stays locally
  smooth), so the tool looks for the mip pair in the header first (`header_dims`) and reports where the
  dimensions came from in `index.json`: `header mip sizes`, `ue_dims.json (eye-verified)`, or
  `shape prior (not verified)`.
* The hand-written BC3 decoder was cross-checked against `texture2ddecoder`; the check found a real bug
  (the colour half was writing opaque alpha over the alpha half — fixed, comment in `decode_bc3`). It now
  agrees with the reference on 93.5% of pixels exactly, with the rest being endpoint-rounding on the
  3-colour mode.

`tools/dungeons_geo.py` — level data to glTF + structure records.

* `height-plane`, `walkable-plane`, `region-plane`, `region-y-plane` are zlib+base64 and decompress to
  exactly `sizeX × sizeZ` bytes — one height byte per ground column. Verified for all 12 shipped rooms.
* Meshes are built from the height plane with skirts down to lower neighbours, `--mesh-step 2` (shipped)
  so the twelve models total ~5.4 MB instead of ~20 MB. Full resolution: drop `--mesh-step`.
* Level sheets carry a `//` art banner and are parsed with comments stripped.

## Verification status (read this before trusting anything)

* **Inspected by eye:** `T_PortalView_Singer_Front` (1024×512 landscape with a walled meadow, banner
  poles and a ridge — its alpha channel is the terrain mask), `T_PortalView_DD_Front` (512×1024, a
  striped Deep Dark curtain over a ground plane) and the 512×1024/1024×512 dimension call itself.
* **Structurally validated only:** every other PNG (correct format, size and header-derived dimensions —
  no human has looked at the pixels), all twelve glTF meshes (buffer lengths, index ranges, triangle
  counts) and all room records (heightfield length vs footprint).
* **Not in-game:** none of this has been rendered by Minecraft. Wiring it into the rift is the next step.

## What did not convert

| Asset | Why |
| --- | --- |
| `T_Lobby_Forground`, `T_Lobby_Mountains_Left` | header says `PF_DXT5` but the remaining bytes match no single-mip or mip-chain payload for any power-of-two shape (tried every offset ±8 KB); needs the real header layout, not a guess |
| `T_SoulPath_Flowmap01_256.ubulk` | a bare `.ubulk` payload with no `.uasset` twin — no pixel format, dimensions or offsets to work from |
| `blocks` (voxel ids, 2.5 bytes/voxel) | packing undecoded, so meshes come from the height plane only; recorded per room in `blocks.layout` |
| minimap textures (`*_Minimap`) | **filtered by request** — UI only. They are the footprint maps for tiles like `MD_DE_STAIR_001_MW`; say the word and they can be added |
| everything under `UI/`, `Fonts/`, `Text/`, quest and combat data | filtered by request |

## Regenerating

```bash
python3 tools/ue_tex.py <dir-of-uasset-files> <outdir>          # cooked textures -> PNG
python3 tools/dungeons_geo.py <dir-of-json-sheets> <outdir> --mesh-step 2
python3 -m unittest tools/test_data.py                          # the gates below
```

`test_data.py` now gates the shipped result: every texture is a real PNG of the size `index.json`
records and no texture path mentions UI/menu/HUD/icon/font; every room's heightfield decodes to exactly
`sizeX × sizeZ` bytes with min/max inside the volume and doors inside the footprint; every glTF's buffer
length, buffer views, triangle count and index range are self-consistent; every rift sheet has an id,
object groups, and stretches that are either tiles or a single anchor encounter.
