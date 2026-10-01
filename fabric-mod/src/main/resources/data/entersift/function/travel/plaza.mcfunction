# 0.22: ensure the return plaza always exists at the arrival point.
execute unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..8] run summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}
# Carve a small teal arrival plaza once, and raise the return portal 3 blocks east of it.
fill ~-3 ~-1 ~-3 ~3 ~-1 ~3 entersift:teal_path
fill ~-3 ~ ~-3 ~3 ~4 ~3 minecraft:air
# The visible rift portal entity is created by portal/return_tick (called by the marker's tick function).
