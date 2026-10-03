# Natural surface, no carved plaza or blue substitute portal.
execute unless score @s sift.rstyle matches 0..4 run scoreboard players set @s sift.rstyle 3
execute unless score @s sift.rwidth matches 150..1200 run scoreboard players set @s sift.rwidth 700
execute unless score @s sift.rheight matches 150..1200 run scoreboard players set @s sift.rheight 500
execute store result storage entersift:arrival style int 1 run scoreboard players get @s sift.rstyle
execute store result storage entersift:arrival w float 0.01 run scoreboard players get @s sift.rwidth
execute store result storage entersift:arrival h float 0.01 run scoreboard players get @s sift.rheight
function entersift:travel/exit_rift with storage entersift:arrival
tp @s ~ ~ ~ 0 0
scoreboard players set @s sift.cooldown 100
scoreboard players set @s sift.transit 0
