# 0.22: End arrival on the surface instead of a sky pad at y=300.
execute in minecraft:the_end unless loaded 0 64 0 run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in minecraft:the_end positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 4 0 true
