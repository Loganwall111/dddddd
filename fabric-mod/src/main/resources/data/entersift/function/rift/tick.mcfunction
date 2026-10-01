scoreboard players add @s sift.age 1
# Outside the local window (night, or Endure inside the Sift) ordinary rifts seal; creative seeds age out.
execute unless entity @s[tag=sift.seeded] unless function entersift:rift/gate run return run function entersift:rift/close
# Sparse motes only; most of the rift's visible energy is drawn by the client renderer.
execute if predicate {type:"minecraft:random_chance",chance:0.06} run particle minecraft:end_rod ~ ~0.5 ~ 0.9 0.7 0.12 0.003 1 normal
# Passable once the voxel cluster has fully assembled (RiftPortalEntity growth = 100 ticks).
execute if score @s sift.age matches 100..5990 run function entersift:rift/transport

execute if score @s sift.age matches 6000.. run function entersift:rift/close

execute if entity @s[tag=sift.natural] if score #riftcycle sift.clock matches 2400.. run function entersift:rift/close

execute if predicate {type:"minecraft:random_chance",chance:0.05} run particle minecraft:electric_spark ~ ~1.2 ~ 0.8 0.9 0.15 0.2 1 normal
