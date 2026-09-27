scoreboard players set #time sift.clock 0
execute if score #rifts sift.roll matches 1 as @a[gamemode=survival] at @s run function entersift:world/roll
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[tag=sift.blub,distance=..48] positioned ~4 ~ ~4 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:blub/spawn
