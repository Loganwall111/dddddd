execute if predicate {type:"minecraft:random_chance",chance:0.04} run particle minecraft:end_rod ~ ~2 ~ 0.12 0.5 0.35 0.005 1 normal
execute unless entity @e[type=entersift:rift_portal,tag=sift.return_anchor,distance=..1] run summon entersift:rift_portal ~ ~ ~ {Tags:["sift.return_anchor"],Age:100,RiftType:0,Width:3f,Height:4f,Rotation:[90f,0f]}
