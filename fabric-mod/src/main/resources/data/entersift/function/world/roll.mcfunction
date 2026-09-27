execute store result score #chance sift.roll run random value 0..11
execute if score #chance sift.roll matches 0 positioned ~8 ~ ~8 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/create
execute if dimension minecraft:overworld if score #chance sift.roll matches 1 unless entity @e[tag=sift.riftcaller,distance=..96] positioned ~16 ~ ~16 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:illager/spawn
