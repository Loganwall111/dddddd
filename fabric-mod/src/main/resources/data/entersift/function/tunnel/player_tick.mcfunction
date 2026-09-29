# 0.17: every tick while a player is inside the tunnel dimension.
particle minecraft:dust{color:[1.0f,0.66f,0.22f],scale:1.3f} ~ ~1.2 ~5 2 1.8 4 0 5 normal @s
particle minecraft:dust{color:[1.0f,0.25f,0.18f],scale:1.0f} ~ ~1.2 ~5 2 1.8 4 0 3 normal @s
particle minecraft:end_rod ~ ~1.5 ~8 2 1.6 4 0.01 1 normal @s
effect give @s minecraft:speed 1 1 true
execute store result score @s sift.tz run data get entity @s Pos[2]
# Fell out or teleported away inside the dimension: back to the start.
execute unless entity @s[y=60,dy=12] run tp @s 0.5 64 1.5 0 0
execute if score @s sift.tz matches 44.. run function entersift:tunnel/exit
execute if score @s sift.tz matches ..-3 run tp @s 0.5 64 1.5 0 0
