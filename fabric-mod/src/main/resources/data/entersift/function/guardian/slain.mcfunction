scoreboard players operation #dead sift.link = @s sift.link
execute as @e[type=minecraft:marker,tag=sift.encounter] if score @s sift.link = #dead sift.link at @s run function entersift:guardian/unlock
