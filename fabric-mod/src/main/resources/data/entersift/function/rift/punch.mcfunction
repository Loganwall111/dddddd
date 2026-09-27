execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.cooldown matches 1.. run return 0
execute if score @s sift.souls matches ..9 run title @s actionbar {"text":"The gauntlet needs 10 souls.","color":"red"}
execute if score @s sift.souls matches ..9 run return 0
execute anchored eyes positioned ^ ^-0.8 ^3 unless block ~ ~ ~ minecraft:air run return 0
execute anchored eyes positioned ^ ^-0.8 ^3 if entity @e[type=minecraft:marker,tag=sift.rift,distance=..12] run return 0
scoreboard players remove @s sift.souls 10
scoreboard players set @s sift.cooldown 60
execute anchored eyes positioned ^ ^-0.8 ^3 run function entersift:rift/create
