particle minecraft:portal ~ ~1 ~ 0.6 1 0.6 0.01 4 normal
execute as @a[distance=..1.5,scores={sift.cooldown=0,sift.return=1},gamemode=!spectator] at @s run function entersift:travel/return
