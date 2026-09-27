execute in entersift:the_sift unless loaded 0 300 0 run return 0
execute in entersift:the_sift positioned 0 300 0 unless block ~ ~ ~ minecraft:air run return 0
execute in entersift:the_sift positioned 0 301 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in entersift:the_sift positioned 0 300 0 run function entersift:travel/pad
execute in entersift:the_sift run tp @s 0 300 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 120 0 true
title @s title {"text":"THE SIFT","color":"aqua"}
title @s subtitle {"text":"Everything lost eventually settles here.","color":"gray"}
