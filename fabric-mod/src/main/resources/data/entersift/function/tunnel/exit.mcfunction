# 0.17: reached the far end -> the destination picked when the rift was entered (sift.dest).
effect give @s entersift:rift_transit 1 0 true
function entersift:travel/transit_go
# 0.22: still here (destination not ready)? Fall back to the Overworld surface, not a fixed coordinate.
execute at @s if dimension entersift:rift_tunnel if score @s sift.dest matches 5 run scoreboard players set @s sift.dest 0
execute at @s if dimension entersift:rift_tunnel in minecraft:overworld positioned 0 0 0 positioned over motion_blocking_no_leaves run tp @s ~ ~ ~
execute at @s if dimension entersift:rift_tunnel in minecraft:overworld positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
