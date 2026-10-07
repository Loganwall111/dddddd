# Tick 60: the screen is fully covered by the orange flare; teleport silently.
scoreboard players set @s sift.transit 0
scoreboard players set @s sift.cooldown 60
execute if score @s sift.dest matches 0 run return run function entersift:travel/destination_0
execute if score @s sift.dest matches 1 run return run function entersift:travel/destination_1
execute if score @s sift.dest matches 2 run return run function entersift:travel/destination_2
execute if score @s sift.dest matches 3 run return run function entersift:travel/destination_3
execute if score @s sift.dest matches 4 run return run function entersift:travel/sift
execute if score @s sift.dest matches 5 run return run function entersift:travel/return
