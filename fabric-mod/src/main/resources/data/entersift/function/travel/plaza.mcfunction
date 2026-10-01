# 0.22: ensure the return plaza and portal always exist at the arrival point.
kill @e[type=minecraft:marker,tag=sift.return_gate,distance=..8]
summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate","sift.encounter"]}
# Carve a small teal arrival plaza once, and raise the return portal 3 blocks east of it.
fill ~-3 ~-1 ~-3 ~3 ~-1 ~3 entersift:teal_path
fill ~-3 ~ ~-3 ~3 ~4 ~3 minecraft:air
# Summon a visible rift portal entity at the return gate so the player can see and use it to go home.
summon entersift:rift_portal ~3 ~1 ~ {Tags:["sift.return_gate","sift.rift_visual","sift.rift_anchor"],RiftType:5,Width:5.0f,Height:4.0f,Age:120}
title @s actionbar {"text":"The way home shimmers beside you.","color":"aqua"}
