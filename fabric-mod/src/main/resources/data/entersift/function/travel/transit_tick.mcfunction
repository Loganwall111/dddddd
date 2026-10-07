scoreboard players add @s sift.transit 1
execute if score @s sift.transit matches 42 run playsound minecraft:entity.firework_rocket.large_blast player @s ~ ~ ~ 0.9 0.7
execute if score @s sift.transit matches 61..99 run function entersift:travel/transit_go
# 0.21 rift warp (100 = tick 0): flare at tick 40, tunnel at tick 60.
execute if score @s sift.transit matches 141 run playsound minecraft:entity.firework_rocket.large_blast player @s ~ ~ ~ 0.9 0.7
execute if score @s sift.transit matches 160.. run function entersift:travel/warp_go
