# Destructive developer fixture. Use a disposable creative test world.
fill ~-6 ~-1 ~-2 ~6 ~-1 ~10 entersift:salt
fill ~-5 ~ ~7 ~5 ~7 ~7 minecraft:reinforced_deepslate
fill ~-4 ~1 ~7 ~4 ~6 ~7 minecraft:air
setblock ~-4 ~ ~ entersift:sonorous_deepslate
setblock ~-4 ~1 ~ minecraft:note_block[note=0]
setblock ~-3 ~ ~ entersift:sonorous_deepslate
setblock ~-3 ~1 ~ minecraft:note_block[note=1]
setblock ~-2 ~ ~ entersift:sonorous_deepslate
setblock ~-2 ~1 ~ minecraft:note_block[note=2]
setblock ~-1 ~ ~ entersift:sonorous_deepslate
setblock ~-1 ~1 ~ minecraft:note_block[note=3]
setblock ~0 ~ ~ entersift:sonorous_deepslate
setblock ~0 ~1 ~ minecraft:note_block[note=4]
setblock ~1 ~ ~ entersift:sonorous_deepslate
setblock ~1 ~1 ~ minecraft:note_block[note=5]
setblock ~2 ~ ~ entersift:sonorous_deepslate
setblock ~2 ~1 ~ minecraft:note_block[note=6]
setblock ~3 ~ ~ entersift:sonorous_deepslate
setblock ~3 ~1 ~ minecraft:note_block[note=7]
function entersift:dev/kit
tellraw @s {"text":"Eight pitches left-to-right. Defeat the guardian, then strike 1,3,7,6,5,2,4,8.","color":"aqua"}
