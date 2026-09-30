# 0.21: tick 60 of the rift warp. The screen is covered by the orange flare: hand over to the tunnel.
scoreboard players set @s sift.transit 0
execute if score @s sift.dest matches 0 run return run function entersift:travel/begin {dest:0}
execute if score @s sift.dest matches 1 run return run function entersift:travel/begin {dest:1}
execute if score @s sift.dest matches 2 run return run function entersift:travel/begin {dest:2}
execute if score @s sift.dest matches 3 run return run function entersift:travel/begin {dest:3}
