# 0.16 fallback, only used before the tunnel exists: short transition, silent teleport at tick 20.
scoreboard players set @s sift.transit 41
effect give @s entersift:rift_transit 2 0 true
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
