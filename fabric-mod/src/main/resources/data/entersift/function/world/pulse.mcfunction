scoreboard players set #time sift.clock 0
execute if score #rifts sift.roll matches 1 as @a[gamemode=survival] at @s run function entersift:world/roll


execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[type=entersift:blub,distance=..48] positioned ~4 ~ ~4 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/blub/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[type=entersift:antlerling,distance=..48] positioned ~6 ~ ~ if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/antlerling/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[type=entersift:drift_jelly,distance=..48] positioned ~5 ~3 ~ if block ~ ~ ~ minecraft:air run function entersift:creature/drift_jelly/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:pale_grove unless entity @e[type=entersift:drift_jelly,distance=..48] positioned ~-5 ~3 ~ if block ~ ~ ~ minecraft:air run function entersift:creature/drift_jelly/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:pale_grove unless entity @e[type=entersift:sculkling,distance=..48] positioned ~5 ~ ~-3 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/sculkling/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:rose_spires unless entity @e[type=entersift:licker,distance=..48] positioned ~-8 ~ ~6 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/licker/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:tidepool_reef unless entity @e[type=entersift:drift_jelly,distance=..48] positioned ~4 ~3 ~-4 if block ~ ~ ~ minecraft:air run function entersift:creature/drift_jelly/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:tidepool_reef unless entity @e[type=entersift:sculker,distance=..48] positioned ~-7 ~ ~-7 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/sculker/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:carapace unless entity @e[type=entersift:sculker,distance=..48] positioned ~8 ~ ~ if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/sculker/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:saltwound_expanse unless entity @e[type=entersift:sculkling,distance=..48] positioned ~0 ~ ~7 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/sculkling/spawn
