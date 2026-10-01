# 0.22: arrive on the real surface next to a visible return portal (no more sky pad at y=300).
execute unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..8] run function entersift:travel/plaza
tp @s ~ ~ ~ -90 0
title @s actionbar {"text":"The way home shimmers beside you.","color":"aqua"}
