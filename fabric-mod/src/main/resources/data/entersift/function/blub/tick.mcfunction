execute if entity @p[distance=2..8,gamemode=!spectator] facing entity @p[distance=..8,gamemode=!spectator] feet run tp @s ~ ~ ~ ~ 0
execute if entity @p[distance=2..8,gamemode=!spectator] positioned ^ ^ ^0.035 if block ~ ~ ~ minecraft:air unless block ~ ~-0.3 ~ minecraft:air run tp @s ~ ~ ~
