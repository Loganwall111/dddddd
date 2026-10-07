scoreboard players add @s sift.age 1
particle minecraft:end_rod ~ ~0.5 ~ 1.4 1.0 0.15 0.005 2 normal
# Passable once the voxel cluster has fully assembled (RiftPortalEntity growth = 100 ticks).
execute if score @s sift.age matches 100..5990 run function entersift:rift/transport

execute if score @s sift.age matches 6000.. run function entersift:rift/close

execute if entity @s[tag=sift.natural] if score #riftcycle sift.clock matches 2400.. run function entersift:rift/close

execute if predicate {type:"minecraft:random_chance",chance:0.2} run particle minecraft:electric_spark ~ ~1.5 ~ 1 1.3 0.2 0.3 3 normal
