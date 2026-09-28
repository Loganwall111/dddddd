execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..12] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] store result score @s sift.target run random value 0..3
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] at @s run function entersift:rift/style
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6
