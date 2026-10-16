# 0.27: After the eight-tick contact glitch, hand over immediately to the tunnel.
scoreboard players set @s sift.transit 0
execute if score @s sift.dest matches 0 run return run function entersift:travel/begin {dest:0}
execute if score @s sift.dest matches 1 run return run function entersift:travel/begin {dest:1}
execute if score @s sift.dest matches 2 run return run function entersift:travel/begin {dest:2}
execute if score @s sift.dest matches 3 run return run function entersift:travel/begin {dest:3}
