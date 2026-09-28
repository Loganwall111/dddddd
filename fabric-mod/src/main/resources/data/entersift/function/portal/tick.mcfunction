particle minecraft:reverse_portal ~ ~2 ~ 1.5 2 0.1 0.025 5 normal
function entersift:portal/cross with entity @s data
execute if predicate {type:"minecraft:random_chance",chance:0.15} run particle minecraft:electric_spark ~ ~2 ~ 1.5 2 0.1 0.3 4 normal
