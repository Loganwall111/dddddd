# 0.17: step into a rift -> appear at the start of the tunnel, facing +Z. A brief flash hides the
# dimension change (the client shows it while the entersift:rift_transit effect is short).
effect give @s entersift:rift_transit 1 0 true
execute in entersift:rift_tunnel run tp @s 0.5 64 1.5 0 0
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
playsound minecraft:block.respawn_anchor.charge player @s ~ ~ ~ 0.8 0.6
title @s actionbar {"text":"Walk through...","color":"gold"}
