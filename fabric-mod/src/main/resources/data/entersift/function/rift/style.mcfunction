kill @e[type=entersift:rift_portal,tag=sift.rift_visual,distance=..3]
# 0.10: the RiftType (colour + cluster shape) IS the destination: 0 overworld gold, 1 nether red, 2 end violet, 3 sift pink.
execute store result storage entersift:rift style int 1 run scoreboard players get @s sift.target
execute store result storage entersift:rift w float 1 run random value 6..9
execute store result storage entersift:rift h float 1 run random value 4..6
execute store result storage entersift:rift yaw float 45 run random value 0..3
execute if data storage entersift:rift punch_yaw run data modify storage entersift:rift yaw set from storage entersift:rift punch_yaw
function entersift:rift/anchor with storage entersift:rift
