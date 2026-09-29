$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy1) $(iz1) minecraft:air replace entersift:sift_portal
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy0) $(iz1) minecraft:air replace entersift:sift_portal_base
particle minecraft:glow ~ ~2 ~ 1.5 2 1.5 0.2 60 normal
playsound minecraft:block.glass.break ambient @a[distance=..32] ~ ~ ~ 1.2 0.6
playsound minecraft:block.beacon.deactivate ambient @a[distance=..32] ~ ~ ~ 1 0.8
tellraw @a[distance=..24] {"text":"The portal shatters. The city will have to sing again.","color":"aqua"}
kill @e[type=entersift:rift_portal,tag=sift.portal_anchor,distance=..2]
kill @s
