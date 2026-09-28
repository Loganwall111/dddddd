kill @e[type=minecraft:block_display,tag=sift.rift_visual,distance=..3]
execute store result storage entersift:rift style int 1 run scoreboard players get @s sift.target
execute if score @s sift.target matches 1 if predicate {type:"minecraft:random_chance",chance:0.35} run data modify storage entersift:rift style set value 3
execute if score @s sift.target matches 3 if predicate {type:"minecraft:random_chance",chance:0.3} run data modify storage entersift:rift style set value 4
execute if dimension minecraft:the_nether run data modify storage entersift:rift style set value 4
execute store result storage entersift:rift w float 1 run random value 3..5
execute store result storage entersift:rift h float 1 run random value 3..4
execute store result storage entersift:rift yaw float 45 run random value 0..3
function entersift:rift/anchor with storage entersift:rift
