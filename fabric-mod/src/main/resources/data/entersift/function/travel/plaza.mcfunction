# Carve a small teal arrival plaza once, bordered by wavy mint-patterned sinter tiles and cyan soul lanterns, and raise the return portal 3 blocks east of it.
fill ~-4 ~-1 ~-4 ~4 ~-1 ~4 entersift:sinter
fill ~-3 ~-1 ~-3 ~3 ~-1 ~3 entersift:teal_path
fill ~-3 ~ ~-3 ~3 ~4 ~3 minecraft:air
setblock ~-4 ~ ~-4 entersift:soul_lantern_stone
setblock ~-4 ~ ~4 entersift:soul_lantern_stone
setblock ~4 ~ ~-4 entersift:soul_lantern_stone
setblock ~4 ~ ~4 entersift:soul_lantern_stone
setblock ~-2 ~ ~ entersift:sonorous_deepslate
setblock ~-2 ~1 ~ entersift:soul_lantern_stone
summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}
# Clean up the pre-0.9 floating pad, its gate and its anchor.
kill @e[type=minecraft:marker,tag=sift.return_gate,x=-12,y=290,z=-12,dx=24,dy=20,dz=24]
kill @e[type=entersift:rift_portal,tag=sift.return_anchor,x=-12,y=290,z=-12,dx=24,dy=20,dz=24]
fill -4 299 -4 4 299 4 minecraft:air replace entersift:salt
