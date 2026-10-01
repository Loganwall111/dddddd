execute store result score #rift_time sift.day run time query daytime
execute if dimension entersift:the_sift unless score #rift_time sift.day matches 13000..23999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches ..12999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 23000.. run return 0
execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..5] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] store result score @s sift.target run random value 0..3
# A rift never leads to the dimension it opens in: bleed through to a different one (any may lead to the End).
execute if dimension minecraft:overworld as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] if score @s sift.target matches 0 run scoreboard players set @s sift.target 3
execute if dimension minecraft:the_nether as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] if score @s sift.target matches 1 run scoreboard players set @s sift.target 3
execute if dimension minecraft:the_end as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] if score @s sift.target matches 2 run scoreboard players set @s sift.target 3
execute if dimension entersift:the_sift as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] if score @s sift.target matches 3 run scoreboard players set @s sift.target 0
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] at @s run function entersift:rift/style
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6
