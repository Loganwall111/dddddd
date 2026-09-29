scoreboard players add @s sift.transit 1
execute if score @s sift.transit matches 42 run playsound minecraft:entity.firework_rocket.large_blast player @s ~ ~ ~ 0.9 0.7
execute if score @s sift.transit matches 61.. run function entersift:travel/transit_go
