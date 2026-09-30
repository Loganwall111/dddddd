# 0.21 rift warp: stepping into a rift starts a 60-tick overlay on the client (RGB split for 40 ticks,
# then a solid orange flare). At tick 60, under the flare, the player is moved into the rift tunnel;
# the flare then fades over 20 ticks. The hidden entersift:rift_transit effect (80 ticks) drives the HUD.
execute if score @s sift.transit matches 1.. run return 0
execute if dimension entersift:rift_tunnel run return 0
$scoreboard players set @s sift.dest $(dest)
scoreboard players set @s sift.transit 100
effect give @s entersift:rift_transit 4 0 true
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
playsound minecraft:block.portal.trigger player @s ~ ~ ~ 0.5 1.6
