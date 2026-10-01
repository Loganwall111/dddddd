# Executed in the verified destination clearing. No platform or cave carving.
execute unless score @s sift.rstyle matches 0..3 run scoreboard players set @s sift.rstyle 3
execute unless score @s sift.rwidth matches 150..1200 run scoreboard players set @s sift.rwidth 700
execute unless score @s sift.rheight matches 150..1200 run scoreboard players set @s sift.rheight 500
execute store result storage entersift:arrival style int 1 run scoreboard players get @s sift.rstyle
execute store result storage entersift:arrival width float 0.01 run scoreboard players get @s sift.rwidth
execute store result storage entersift:arrival height float 0.01 run scoreboard players get @s sift.rheight
# Same stepped rift at the threshold, already grown. Never the blue ritual portal.
execute unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..1] run function entersift:travel/exit_rift with storage entersift:arrival
# Face away from the plane. Cooldown prevents bouncing straight back.
tp @s ~ ~ ~0.9 0 0
scoreboard players set @s sift.cooldown 100
particle minecraft:end_rod ~ ~0.9 ~0.9 0.24 0.65 0.24 0.01 24 normal
