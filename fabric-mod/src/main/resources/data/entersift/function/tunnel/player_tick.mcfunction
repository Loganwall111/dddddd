# 0.18: every tick while a player is inside the tunnel dimension. The warp burst and the particles
# rushing past are drawn client-side (SiftTunnel); the server only moves the player along.
effect give @s minecraft:speed 1 1 true
execute store result score @s sift.tz run data get entity @s Pos[2]
# Fell out or teleported away inside the dimension: back to the start.
execute unless entity @s[y=60,dy=12] run tp @s 0.5 64 1.5 0 0
execute if score @s sift.tz matches 28.. run function entersift:tunnel/exit
# The entrance is also an escape route if no destination clearing is available.
execute if score @s sift.tz matches ..0 if score @s sift.return matches 1 run return run function entersift:travel/return
execute if score @s sift.tz matches ..-3 run tp @s 0.5 64 1.5 0 0
