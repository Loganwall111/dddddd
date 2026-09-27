execute as @e[type=minecraft:marker,tag=sift.ritual] at @s run function entersift:ritual/tick
execute as @e[type=minecraft:marker,tag=sift.portal] at @s run function entersift:portal/tick
execute as @e[type=minecraft:marker,tag=sift.return_gate] at @s run function entersift:portal/return_tick
execute as @e[type=minecraft:marker,tag=sift.rift] at @s run function entersift:rift/tick
execute as @e[type=minecraft:rabbit,tag=sift.blub] at @s run function entersift:blub/tick
execute as @e[type=minecraft:evoker,tag=sift.riftcaller] at @s run function entersift:illager/tick
execute as @e[type=minecraft:block_display,tag=sift.blub_visual] at @s unless entity @e[type=minecraft:rabbit,tag=sift.blub,distance=..2] run kill @s


execute as @e[type=minecraft:marker,tag=sift.note_glow] at @s run function entersift:notes/tick
execute as @e[type=minecraft:block_display,tag=sift.note_visual] at @s unless entity @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1] run kill @s
execute as @e[type=minecraft:block_display,tag=sift.rift_visual] at @s unless entity @e[type=minecraft:marker,tag=sift.rift,distance=..4] run kill @s
