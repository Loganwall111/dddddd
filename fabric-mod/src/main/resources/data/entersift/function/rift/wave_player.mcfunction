execute store result score #chance sift.roll run random value 0..1
title @s actionbar {"text":"The veil thins… rifts bleed through.","color":"light_purple"}
playsound minecraft:block.respawn_anchor.charge ambient @s ~ ~ ~ 0.6 0.5
execute if score #chance sift.roll matches 0..1 positioned ~12 ~ ~6 positioned over motion_blocking_no_leaves unless dimension minecraft:the_nether if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
execute if score #chance sift.roll matches 0 positioned ~-10 ~ ~-12 positioned over motion_blocking_no_leaves unless dimension minecraft:the_nether if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
# The Nether's heightmap is its bedrock roof, so place Nether rifts at the player's own level instead.
execute if dimension minecraft:the_nether positioned ~9 ~ ~5 if block ~ ~ ~ minecraft:air if block ~ ~1 ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
execute if dimension minecraft:the_nether positioned ~9 ~1 ~5 if block ~ ~ ~ minecraft:air if block ~ ~1 ~ minecraft:air unless block ~ ~-1 ~ minecraft:air unless entity @e[type=minecraft:marker,tag=sift.rift,distance=..6] run function entersift:rift/natural
execute if dimension minecraft:the_nether positioned ~-8 ~ ~-7 if block ~ ~ ~ minecraft:air if block ~ ~1 ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
