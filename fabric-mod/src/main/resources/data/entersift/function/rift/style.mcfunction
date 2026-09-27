execute if score @s sift.target matches 0 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{Name:"entersift:rift_overworld"}}
execute if score @s sift.target matches 1 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{Name:"entersift:rift_membrane"}}
execute if score @s sift.target matches 2 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{Name:"entersift:rift_end"}}
execute if score @s sift.target matches 3 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{Name:"entersift:rift_sift"}}
