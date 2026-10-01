# 0.22: Nether arrival - find open air at a safe height.
execute in minecraft:the_nether unless loaded 0 64 0 run return 0
execute in minecraft:the_nether positioned 0 64 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
# Try the default nether height first, then fall back to the player-relative position.
execute in minecraft:the_nether positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 4 0 true
