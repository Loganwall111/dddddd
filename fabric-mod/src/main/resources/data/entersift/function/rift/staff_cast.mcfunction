# Rift staff (right-click, or left-click): the crystal charges, a bolt runs out along the sight line,
# and the rift tears open where the bolt lands. Longer reach than the gauntlet's touch — the staff is
# the ranged spell, the gauntlet is the touch spell.
execute unless function entersift:rift/gate run return run function entersift:rift/gate_denied
execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.cooldown matches 1.. run return 0
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run title @s actionbar {"text":"The staff is cold: it needs 10 souls (kill mobs to collect them).","color":"red"}
execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9 run return 0
# First use awakens the rift cycle for this player, exactly as the gauntlet does.
execute unless entity @s[tag=sift.awakened] run title @s actionbar {"text":"The staff cracks the veil. Rifts will bleed through every five minutes.","color":"light_purple"}
tag @s add sift.awakened
execute store result storage entersift:rift punch_yaw float 1 run data get entity @s Rotation[0]
# Muzzle flash: the crystal spits before the bolt leaves it.
execute anchored eyes positioned ^ ^ ^0.6 run particle minecraft:electric_spark ~ ~ ~ 0.05 0.05 0.05 0.02 6 normal
execute anchored eyes positioned ^ ^ ^0.6 run particle minecraft:end_rod ~ ~ ~ 0.02 0.02 0.02 0.0 3 normal
playsound minecraft:entity.evoker.cast_spell player @a[distance=..24] ~ ~ ~ 0.7 1.2
playsound minecraft:block.amethyst_block.chime ambient @a[distance=..16] ~ ~ ~ 0.8 1.6
# The bolt: a spark for every block of the first eight blocks of the sight line.
execute anchored eyes positioned ^ ^ ^1 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
execute anchored eyes positioned ^ ^ ^2 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
execute anchored eyes positioned ^ ^ ^3 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
execute anchored eyes positioned ^ ^ ^4 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
execute anchored eyes positioned ^ ^ ^5 run particle minecraft:electric_spark ~ ~ ~ 0.03 0.03 0.03 0.02 2 normal
execute anchored eyes positioned ^ ^ ^6 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
execute anchored eyes positioned ^ ^ ^7 run particle minecraft:electric_spark ~ ~ ~ 0.03 0.03 0.03 0.02 2 normal
execute anchored eyes positioned ^ ^ ^8 run particle minecraft:end_rod ~ ~ ~ 0.0 0.0 0.0 0.01 1 normal
# Tear it open where the bolt lands: eight blocks out, then six, then four (the gauntlet stops at four).
execute anchored eyes positioned ^ ^ ^8 positioned ~ ~-1.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^6 positioned ~ ~-1.5 ~ if block ~ ~1 ~ #entersift:rift_passable if block ~ ~2 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
execute anchored eyes positioned ^ ^ ^4 positioned ~ ~-1.2 ~ if block ~ ~1 ~ #entersift:rift_passable run return run function entersift:rift/punch_at
data remove storage entersift:rift punch_yaw
title @s actionbar {"text":"The bolt finds no open air to tear.","color":"red"}
