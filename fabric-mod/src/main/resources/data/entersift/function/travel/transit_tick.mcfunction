scoreboard players add @s sift.transit 1
execute if score @s sift.transit matches 42 run playsound minecraft:entity.firework_rocket.large_blast player @s ~ ~ ~ 0.9 0.7
execute if score @s sift.transit matches 61..99 run function entersift:travel/transit_go
# Contact glitch only; no timed flare/cutscene.
execute if score @s sift.transit matches 101..107 run particle minecraft:end_rod ~ ~0.9 ~ 0.25 0.65 0.25 0.005 8 normal
execute if score @s sift.transit matches 108.. run function entersift:travel/warp_go
