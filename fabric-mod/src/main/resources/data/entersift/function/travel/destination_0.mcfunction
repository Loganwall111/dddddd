execute in minecraft:overworld unless loaded 0 300 0 run return 0
execute in minecraft:overworld positioned 0 300 0 unless block ~ ~ ~ minecraft:air run return 0
execute in minecraft:overworld positioned 0 301 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in minecraft:overworld positioned 0 300 0 run function entersift:travel/pad
execute in minecraft:overworld run tp @s 0 300 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 120 0 true
