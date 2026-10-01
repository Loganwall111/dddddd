# Runs as the player, positioned at the rift base; never charge souls for a daytime attempt.
execute store result score #rift_time sift.day run time query daytime
execute if dimension entersift:the_sift unless score #rift_time sift.day matches 13000..23999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches ..12999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 23000.. run return 0
execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..5] run title @s actionbar {"text":"A rift is already open here.","color":"light_purple"}
execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..5] run return run data remove storage entersift:rift punch_yaw
execute unless entity @s[gamemode=creative] run scoreboard players remove @s sift.souls 10
scoreboard players set @s sift.cooldown 60
function entersift:rift/create
data remove storage entersift:rift punch_yaw
particle minecraft:end_rod ~ ~1.8 ~ 0.22 0.42 0.22 0.08 10 force
title @s actionbar {"text":"You tear space open.","color":"light_purple"}
return 1
