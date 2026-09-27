execute in minecraft:the_nether unless loaded 0 130 0 run return 0
execute in minecraft:the_nether positioned 0 130 0 unless block ~ ~ ~ minecraft:air run return 0
execute in minecraft:the_nether positioned 0 131 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in minecraft:the_nether positioned 0 130 0 run function entersift:travel/pad
execute in minecraft:the_nether run tp @s 0 130 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 120 0 true
