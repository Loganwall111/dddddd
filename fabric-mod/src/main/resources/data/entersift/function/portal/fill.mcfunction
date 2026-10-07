# 0.17: fill the frame with portal blocks (bottom row = glowing base) and retire the old visuals.
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy1) $(iz1) entersift:sift_portal
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy0) $(iz1) entersift:sift_portal_base
kill @e[type=entersift:rift_portal,tag=sift.portal_anchor,distance=..2]
kill @e[type=minecraft:block_display,tag=sift.portal_visual,distance=..12]
kill @e[type=minecraft:block_display,tag=sift.forming,distance=..12]
data modify entity @s data.filled set value 1b
