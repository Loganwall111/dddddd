# 0.22: arrive on the Overworld surface using surface detection (no more sky pad at y=300).
execute in minecraft:overworld unless loaded 0 64 0 run return 0
execute in minecraft:overworld positioned 0 64 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
# Find the surface using motion_blocking_no_leaves (highest solid block at 0,0).
execute in minecraft:overworld positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 4 0 true
