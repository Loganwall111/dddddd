scoreboard players add @s sift.souls 40
execute if score @s sift.souls matches 101.. run scoreboard players set @s sift.souls 100
scoreboard players set @s sift.ghost 600
tag @s add sift.ghost
effect give @s minecraft:invisibility 30 0 true
effect give @s minecraft:slow_falling 30 0 true
playsound minecraft:entity.allay.ambient_without_item player @s ~ ~ ~ 0.8 0.7
title @s actionbar {"text":"Your body fades. 30 seconds between worlds.","color":"aqua"}
