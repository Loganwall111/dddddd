execute if score @s sift.target matches 0 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_overworld"}}
execute if score @s sift.target matches 1 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_membrane"}}
execute if score @s sift.target matches 2 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_end"}}
execute if score @s sift.target matches 3 as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_sift"}}
execute store result score #look sift.roll run random value 0..5
execute if score #look sift.roll matches 0 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_pink"}}
execute if score #look sift.roll matches 1 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_orange"}}
execute if score #look sift.roll matches 2 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_yellow"}}
execute if score #look sift.roll matches 3 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_red"}}
execute if score #look sift.roll matches 4 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_olive"}}
execute if score #look sift.roll matches 5 as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] run data merge entity @s {block_state:{id:"entersift:rift_edge"}}
