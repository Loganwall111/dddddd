# 0.27: eight ticks of contact glitch, then straight into the walkable tunnel.
execute if score @s sift.transit matches 1.. run return 0
execute if dimension entersift:rift_tunnel run return 0
$scoreboard players set @s sift.dest $(dest)
scoreboard players set @s sift.transit 100
effect give @s entersift:rift_transit 1 0 true
playsound minecraft:block.portal.trigger player @s ~ ~ ~ 0.35 1.6
