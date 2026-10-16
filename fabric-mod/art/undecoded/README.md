# Undecoded Dungeons sources

These 13 PNGs are **recorded, not shipped**. They are the output of the 0.40 BC7 conversion of the
Minecraft Dungeons environment share, kept here so the failure is not repeated and the source is not lost.
Nothing under `src/` may reference them, and `SiftWindowArtContracts.test_v043_nothing_undecoded_can_reach_the_game`
enforces that: the mod draws no noise.

| file | source | why it is here |
| --- | --- | --- |
| `sky_fd_face0-5.png` | `T_FD_Cubemap_faceN.png` | the BC7 payload is not a BC7 block stream |
| `sky_wellspring_plains_face0-5.png` | `T_WellspringPlains_Cubemap_01_faceN.png` | same |
| `rift_view_meadow_back.png` | `T_PortalView_Singer_Back.png` | same |

## What was measured

BC7 blocks begin with a mode indicator: the mode is the number of leading zero bits, so a real BC7
texture shows a *concentrated* mode histogram (typically mode 6 or 5 for photographs, a couple of modes
for a matte). Scored over 256 blocks at every 4-byte offset in each file, the best candidate in
`T_FD_Cubemap.uasset` reached a mode-6 share of **0.12** and the two most common modes covered only 0.58
of the blocks — a uniform spread, i.e. the bytes are not a BC7 block stream at all. `T_PortalView_Singer_Back.uasset`
is 524,849 bytes, exactly 1024x512 mip 0 (524,288 B) plus a 561-byte header, and its payload is random by
the same measure. Visually the decoded results are per-pixel noise (mean horizontal neighbour delta 48 of
255; a real image of this size is under 10), which is why they were pulled out of the jar.

The same signature — high-entropy, structure-free bulk data with no zlib stream anywhere — is what the UE
static meshes showed (`SM_RavineBG_01`, `SM_MA2_Portal`), and the usual cause is **Oodle bulk
compression**, which this project has no decoder for. The `PF_BC7` label comes from the texture header, so
the format is known; the *bytes* are wrapped.

## What would change the verdict

1. A mode-complete BC7 decoder is not the problem — the payload offsets are (mode 6 is decoded exactly
   today, and no offset in these files yields a plausible histogram), so first find the real payload, for
   example in a `.ubulk` sibling, which most of these textures do not have on the share.
2. Otherwise the wrapper has to be unwrapped first: Oodle (`oo2`/Kraken/Leviathan) decompression, which
   needs a licensed Oodle library, or a container that already holds uncompressed bytes.

Until then the Sift sky keeps using its own procedural shader, and the rift window uses the two DXT5
mattes, which *are* decoded and verified (`assets/sift/textures/entity/rift_view_meadow_front.png`,
`..._deepdark_front.png`).
