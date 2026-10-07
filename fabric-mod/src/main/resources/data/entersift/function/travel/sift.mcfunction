execute in entersift:the_sift unless loaded 0 64 0 run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in entersift:the_sift positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 4 0 true
title @s title {"text":"THE SIFT","color":"aqua"}
title @s subtitle {"text":"Everything lost eventually settles here.","color":"gray"}
