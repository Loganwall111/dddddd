# 0.25: land on the Nether surface at the world origin instead of a floating pad at y=300.
execute in minecraft:the_nether unless loaded 0 64 0 run return 0
execute in minecraft:the_nether positioned 0 64 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
# Drop to the highest solid (non-leaf) block at 0,0 and raise the return gate beside it.
execute in minecraft:the_nether positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 4 0 true
