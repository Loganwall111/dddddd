# Destructive test fixture; use only in an empty creative test area.
fill ~-5 ~-1 ~-2 ~5 ~-1 ~8 entersift:salt
fill ~-4 ~ ~5 ~4 ~6 ~5 minecraft:reinforced_deepslate
fill ~-3 ~1 ~5 ~3 ~5 ~5 minecraft:air
setblock ~-3 ~ ~ minecraft:red_wool
setblock ~-3 ~1 ~ minecraft:note_block[note=0]
setblock ~-2 ~ ~ minecraft:magenta_wool
setblock ~-2 ~1 ~ minecraft:note_block[note=4]
setblock ~-1 ~ ~ minecraft:pink_wool
setblock ~-1 ~1 ~ minecraft:note_block[note=7]
setblock ~0 ~ ~ minecraft:cyan_wool
setblock ~0 ~1 ~ minecraft:note_block[note=12]
setblock ~1 ~ ~ minecraft:blue_wool
setblock ~1 ~1 ~ minecraft:note_block[note=14]
setblock ~2 ~ ~ minecraft:purple_wool
setblock ~2 ~1 ~ minecraft:note_block[note=19]
function entersift:dev/kit
tellraw @s {"text":"Left-click the six notes from left to right. The Singer will answer.","color":"aqua"}
