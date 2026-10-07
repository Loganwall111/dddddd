execute unless score @s sift.return matches 1 run return 0
execute store result storage entersift:transit x double 1 run scoreboard players get @s sift.rx
execute store result storage entersift:transit y double 1 run scoreboard players get @s sift.ry
execute store result storage entersift:transit z double 1 run scoreboard players get @s sift.rz
execute if score @s sift.rdim matches 0 run data modify storage entersift:transit dimension set value "minecraft:overworld"
execute if score @s sift.rdim matches 1 run data modify storage entersift:transit dimension set value "minecraft:the_nether"
execute if score @s sift.rdim matches 2 run data modify storage entersift:transit dimension set value "minecraft:the_end"
execute if score @s sift.rdim matches 3 run data modify storage entersift:transit dimension set value "entersift:the_sift"
function entersift:travel/return_macro with storage entersift:transit
scoreboard players set @s sift.return 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 10 0 true
