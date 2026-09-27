execute store result score #chance sift.roll run random value 0..2
title @s actionbar {"text":"The veil thins… rifts bleed through.","color":"light_purple"}
playsound minecraft:block.respawn_anchor.charge ambient @s ~ ~ ~ 0.6 0.5
execute if score #chance sift.roll matches 0..1 positioned ~12 ~ ~6 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
execute if score #chance sift.roll matches 0 positioned ~-10 ~ ~-12 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural
