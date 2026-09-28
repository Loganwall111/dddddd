scoreboard players add @s sift.age 1
particle minecraft:end_rod ~ ~0.5 ~ 1.4 1.0 0.15 0.005 2 normal
execute if score @s sift.age matches 50..5990 run function entersift:rift/transport

scoreboard players operation #riftphase sift.roll = @s sift.age
scoreboard players set #eighty sift.roll 80
scoreboard players operation #riftphase sift.roll %= #eighty sift.roll
execute if score #riftphase sift.roll matches 0 if score @s sift.age matches ..5999 run function entersift:rift/pose_0
execute if score #riftphase sift.roll matches 20 if score @s sift.age matches ..5999 run function entersift:rift/pose_20
execute if score #riftphase sift.roll matches 40 if score @s sift.age matches ..5999 run function entersift:rift/pose_40
execute if score #riftphase sift.roll matches 60 if score @s sift.age matches ..5999 run function entersift:rift/pose_60

execute if score @s sift.age matches 6000.. run function entersift:rift/close

execute if entity @s[tag=sift.natural] if score #riftcycle sift.clock matches 6000.. run function entersift:rift/close

execute if score @s sift.age matches 5 run function entersift:rift/warp
execute if predicate {type:"minecraft:random_chance",chance:0.2} run particle minecraft:electric_spark ~ ~1.5 ~ 1 1.3 0.2 0.3 3 normal
