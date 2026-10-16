# Rift gauntlet (right-click, or left-click): tear a rift open in front of the player, any time
# (day or night, any dimension). The gate now always allows; only the midnight aura/curtains are
# time-gated in the renderer. Particles/cubes that are aura-only are checked for night client-side.
execute unless function entersift:rift/gate run return run function entersift:rift/gate_denied
execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.cooldown matches 1.. run return 0
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run title @s actionbar {"text":"The gauntlet needs 10 souls (kill mobs to collect them).","color":"red"}
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run return 0
# First use awakens the rift cycle for this player: natural rift waves every 5 minutes, in every dimension.
execute unless entity @s[tag=sift.awakened] run title @s actionbar {"text":"The gauntlet wakes the veil. Rifts will bleed through every five minutes.","color":"light_purple"}
tag @s add sift.awakened
execute store result storage entersift:rift punch_yaw float 1 run data get entity @s Rotation[0]
# Ground-level anchor: eyes - 1.5 = ~0.1 above the feet. RiftShape draws the cluster upward from
# BASE = 0.85 (0.25 sat in the ground), so the rift's bottom lip lands ~0.97 above the ground and
# the rift reads as standing in front of you with a clean ground line (Image 2, 6). Keep -1.5 / -1.2.
execute anchored eyes positioned ^ ^ ^4 positioned ~ ~-1.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^3 positioned ~ ~-1.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^2.5 positioned ~ ~-1.2 ~ if block ~ ~1 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
data remove storage entersift:rift punch_yaw
title @s actionbar {"text":"No room to tear space here: look at open air.","color":"red"}
