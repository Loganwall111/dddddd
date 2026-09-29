# 0.16 rift transition (no loading screen, no transit room). Stepping into a rift starts an
# un-skippable 80-tick sequence. The hidden entersift:rift_transit effect (4 s) is synced to the
# client, whose HUD overlay reads its remaining time: ticks 0-40 chromatic RGB jitter, 41-60 a solid
# orange-red lens flare, the silent teleport at tick 60 (under the flare), 61-80 the orange fades out.
# dest: 0 overworld, 1 nether, 2 end, 3 sift (rifts), 4 sift (blue portal), 5 return anchor.
execute if score @s sift.transit matches 1.. run return 0
$scoreboard players set @s sift.dest $(dest)
scoreboard players set @s sift.transit 1
effect give @s entersift:rift_transit 4 0 true
effect give @s minecraft:slowness 3 4 true
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
playsound minecraft:block.respawn_anchor.charge player @s ~ ~ ~ 0.8 0.6
