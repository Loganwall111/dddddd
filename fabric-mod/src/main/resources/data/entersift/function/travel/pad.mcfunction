fill ~-4 ~-1 ~-4 ~4 ~-1 ~4 entersift:salt replace minecraft:air
execute unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..5] run summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}
