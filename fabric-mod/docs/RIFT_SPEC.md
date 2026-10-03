# Enter the Sift — rift construction spec (exact, 1:1 target)

This is the **exact description of what a rift is made of**. The renderer (`client/RiftPortalRenderer.java`)
and the blueprint (`client/RiftShape.java`) implement this document. If a future change disagrees with this
file, this file wins. It exists because "make it look like the trailer" produced chaotic meshes: a rift is not
a random cluster, it is a **fixed voxel cross with concentric recessed plates, a crisp white rim, a milky
interior, a white opening animation and floating light squares**.

## 1. Silhouette (fixed, not random)

Every rift is the Dungeons II voxel cross. On a **9 columns x 11 rows** grid (column 0 left, row 0 bottom),
the body is:

```
row 10  . . . # # # . . .      cap (3 wide)
row  9  . . . # # # . . .
row  8  . . . # # # . . .
row  7  . . . # # # . . .
row  6  # # # # # # # # #      arms (9 wide, 3 tall)
row  5  # # # # # # # # #
row  4  # # # # # # # # #
row  3  . . # # # # # . .      lower body (5 wide)
row  2  . . # # # # # . .
row  1  . . # # # # # . .
row  0  . . . # # # . . .      foot
```

Per-destination variants change only **fixed chips** (e.g. the Sift cross loses the two outer cells of the
arm rows, the Nether cross keeps them, the End cross gains one cell on the right shoulder). `RiftShape`
holds these as constant strings — **no per-entity randomness in the silhouette**, so two rifts of the same
type are identical, exactly like the trailer.

Cell size is about one block: `cell = clamp(max(w,h) / 9, 0.7, 1.2)`; `cols/rows` follow from `w/h`, and the
silhouette scales with them.

## 2. Depth: concentric recessed plates

Depth is counted **into the wall**, positive = behind the anchor plane.

```
ring 0  (every cell on the silhouette border)   depth 0.30   <- front lip / frame face
ring 1  (one cell in from the border)           depth 0.66
ring 2                                           depth 1.00
ring 3  (innermost, the throat)                  depth 1.34
```

* `ring(i,j) = min distance (Chebyshev) from (i,j) to any empty cell or to the grid edge`, clamped to 3.
* Cells of one ring form one **plate**: a flat slab at that depth.
* Where a **deeper** plate meets a **shallower** one, the mesh draws the vertical **return wall** between
  `z = -depth(shallower)` and `z = -depth(deeper)`. The two plates share the exact cell boundary, so the
  surface is gapless — there are no T-junctions and no cracks when the wave moves it.
* Where a plate meets the **empty silhouette edge**, the return wall runs from `z = -depth` forward to
  `z = 0` (the anchor plane), which is what makes the opening read as a thick alcove instead of a decal.

## 3. Rim (crisp white neon)

* A **0.075-block-wide white quad** is laid on the outer face of every silhouette-border cell, flush with
  that cell's plate, and on the front edge of every depth step. Rims are pure white `#FFFFFF` at full
  alpha — they are the part of the reference that never changes colour.
* Every rim is flanked by a **soft halo band** (0.16 wide, alpha 0.30, destination tint) so the white line
  glows like the trailer instead of aliasing.
* A second, offset copy of each rim (`±0.03`) jitters at 7.3 Hz / 5.1 Hz — the "reality tearing" shimmer.
  It is additive on top of intact geometry, so it can never open a seam.

## 4. Interior (the milky window)

* Every plate face is filled with the **milky field**: 3 octaves of value noise scrolling slowly
  (`t*0.05`) on the plate's `(u, v)`, mixed between the destination tint and white:
  `col = mix(tint, white, smoothstep(0.25, 0.85, fbm) * 0.85)`.
* A **hot core**: `exp(-d*d * 5)` around the rift centre lifts the middle toward white — the reference
  interiors are brightest in the middle and wash out to the tint at the edges.
* Destination tints: Sift `#FFC2DE`, Overworld `#FFE2A8`, Nether `#FF6242`, End `#C6A4FF`, portal
  `#9BF2FF`. Night shifts every tint 12 % toward white.
* With an Iris shader pack the same look is produced by `shaders/core/rift.fsh`, which mixes the
  destination view into the milk at 0.72 so the window still hints at where the rift leads.

## 5. Back fade and back distortion

* **Back fade:** alpha on a plate face falls with depth — `a = 1 - 0.42 * depth/maxDepth` — and the rear
  rim lines fade to 0.35. Looking into the rift you see the throat dim out instead of hitting a wall.
* **Back distortion:** at every ring boundary the mesh draws one extra additive strip **0.06 behind** the
  step, displaced by `±0.05 * sin(9t + u*3)`: a thin, boiling refraction line along each step.
* The whole rift additionally **sways** (`Warp`): amplitude `0.045 + 0.13 * low²` where `low` grows toward
  the bottom, periods 0.42-0.55 rad/tick (10-15 s). The bottom edge is the waviest — "wavy exteriors".
  Because the mesh is gapless (one face per plate, one return per step, shared cell corners) the wave can
  never tear it.

## 6. Opening animation (server age, 20 ticks = 1 s)

```
ticks   0-14    FADE IN     the rim ghosts in (alpha 0->1) with a wobble, a white glow grows at the
                            centre, and the interior is fully transparent. No solid geometry yet.
ticks  14-54    WHITE       the whole rift is WHITE: white rims, white interior, no destination colour.
                            A slow white wave rolls across the plates.
ticks  54-86    COLOUR      the destination tint bleeds in as a ring travelling outward from the centre:
                            a plate takes colour when its distance from the centre < progress.
ticks  86-130   SETTLE      the wave amplitude decays 1.6x -> 1x and a last sparkle burst fires.
ticks 130+      STABLE      1x wave, floating light squares, small drifting cubes, soft aura.
```

* The rift is passable from the first tick (the anchor is unchanged).
* "Fade" (step 1) and "white before full colour" (step 2) are the two things the old renderer never did.

## 7. Floating light squares

* 26 per rift (16 small, 8 medium, 2 large), additive, camera-facing (`line()` primitive).
* Sizes 0.05-0.14 / 0.16-0.26 / 0.30-0.45 blocks. Colour: white with 25 % destination tint.
* They drift **up** at 0.15-0.75 blocks/s with a slow sideways sway, fade in/out over their life, and are
  spread over the silhouette **and** 0.5-1.5 blocks outside it, at `z` between `-maxDepth` and `+1.4`.
* A few (3) sit inside the throat, dimmer, to give the interior depth.

## 8. Small drifting cubes

* 3 per rift, 0.10-0.18 blocks, white outlines only, drifting slowly out of the throat and fading. These
  are the small white/cyan cubes at the bottom of the red reference frame.

## 9. Aura (soft, always available)

* 5 wide soft vertical sheets (2.0-3.4 blocks) on the rift flanks, additive, bell-shaped alpha, tinted by
  the destination. Alpha 0.18 by day, 0.30 at night. They replace the old hard neon poles.

## 10. What was deleted (do not bring back)

The ripple ring, the seed box, the per-tier "pop in" flash, the tearing lightning bolts, the hollow
floating cubes with their own windows, the energy-cube disintegrators, the destination sky/terrain
paintings in the window, and every texture-based interior. The walk-through tunnel (`entersift:rift_tunnel`
dimension, `SiftTunnel`, `core/tunnel`) is **not** a rift and stays exactly as it is.

## 11. Anchor contract (unchanged)

One invisible `entersift:rift_portal` entity per rift carries `RiftType`, `Width`, `Height` and `Rotation[0]`
(yaw). The datapack (`function/rift/*`) owns lifetime and travel; the renderer only draws. Rifts face the
player, `Width`/`Height` are clamped to 1.5-12 blocks, and the client never re-plays the opening when a
rift is re-tracked (`AGE` is synced until tick 130 and then left alone).
