scoreboard players add @s sift.age 1
execute if score @s sift.age matches 1..80 as @e[type=minecraft:block_display,tag=sift.singer,distance=..5] at @s run tp @s ~ ~0.025 ~
particle minecraft:soul ~ ~ ~ 1 0.3 1 0.01 2 normal
execute if score @s sift.age matches 80 run function entersift:ritual/note_0 with entity @s data
execute if score @s sift.age matches 80 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 104 run function entersift:ritual/note_1 with entity @s data
execute if score @s sift.age matches 104 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 128 run function entersift:ritual/note_2 with entity @s data
execute if score @s sift.age matches 128 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 152 run function entersift:ritual/note_3 with entity @s data
execute if score @s sift.age matches 152 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 176 run function entersift:ritual/note_4 with entity @s data
execute if score @s sift.age matches 176 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 200 run function entersift:ritual/note_5 with entity @s data
execute if score @s sift.age matches 200 run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal
execute if score @s sift.age matches 160 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 168 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 176 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 184 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 192 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 200 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 208 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 216 run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal
execute if score @s sift.age matches 220.. run function entersift:portal/open
