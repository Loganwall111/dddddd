# Rift gauntlet or staff (right-click, or left-click): tear a rift open in front of the player.
execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.cooldown matches 1.. run return 0
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run title @s actionbar {"text":"The gauntlet needs 10 souls (kill mobs to collect them).","color":"red"}
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run return 0
# First use awakens the rift cycle for this player: natural rift waves every 5 minutes, in every dimension.
execute unless entity @s[tag=sift.awakened] run title @s actionbar {"text":"The gauntlet wakes the veil. Rifts will bleed through every five minutes.","color":"light_purple"}
tag @s add sift.awakened
execute store result storage entersift:rift punch_yaw float 1 run data get entity @s Rotation[0]
# 0.22: rift base raised one block (~-0.5 instead of ~-1.5) so it opens at ground level, not buried.
execute anchored eyes positioned ^ ^ ^4 positioned ~ ~-0.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^3 positioned ~ ~-0.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^2.5 positioned ~ ~-0.2 ~ if block ~ ~1 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
data remove storage entersift:rift punch_yaw
title @s actionbar {"text":"No room to tear space here: look at open air.","color":"red"}
