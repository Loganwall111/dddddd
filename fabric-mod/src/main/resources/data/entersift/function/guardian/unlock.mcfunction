execute if entity @s[tag=sift.ready] run return 0
tag @s add sift.ready
execute positioned ~ ~6 ~ run function entersift:creature/singer/spawn
playsound minecraft:block.end_portal.spawn ambient @a[distance=..48] ~ ~ ~ 0.7 1.3
tellraw @a[distance=..48] {"text":"The Singer awakens. Tune eight blocks on Sonorous Deepslate. Sing: 1, 3, 7, 6, 5, 2, 4, 8.","color":"aqua"}
