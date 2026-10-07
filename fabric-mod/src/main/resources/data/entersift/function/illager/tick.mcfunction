scoreboard players add @s sift.age 1
execute if score @s sift.age matches 100 run particle minecraft:block{block_state:"minecraft:deepslate"} ~ ~0.2 ~ 1 0.2 1 0.1 30 normal
execute if score @s sift.age matches 100 run playsound minecraft:entity.evoker.prepare_attack hostile @a[distance=..24] ~ ~ ~ 1 0.5
execute if score @s sift.age matches 120 positioned ~2 ~ ~ run function entersift:rift/create
execute if score @s sift.age matches 200.. run scoreboard players set @s sift.age 0
