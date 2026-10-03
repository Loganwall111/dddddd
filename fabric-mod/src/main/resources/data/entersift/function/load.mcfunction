scoreboard objectives add sift.souls dummy
scoreboard objectives add sift.ghost dummy
scoreboard objectives add sift.cooldown dummy
scoreboard objectives add sift.transit dummy
scoreboard objectives add sift.dest dummy
scoreboard objectives add sift.age dummy
scoreboard objectives add sift.target dummy
scoreboard objectives add sift.clock dummy
scoreboard objectives add sift.day dummy
scoreboard objectives add sift.roll dummy
scoreboard objectives add sift.rx dummy
scoreboard objectives add sift.ry dummy
scoreboard objectives add sift.rz dummy
scoreboard objectives add sift.rdim dummy
scoreboard objectives add sift.return dummy
scoreboard objectives add sift.deaths deathCount
scoreboard objectives add sift.seen dummy
scoreboard players add #time sift.clock 0
scoreboard players add #rift_time sift.day 0
execute unless score #rifts sift.roll matches 0..1 run scoreboard players set #rifts sift.roll 1
execute unless score #haunt sift.roll matches 0..1 run scoreboard players set #haunt sift.roll 0

execute in minecraft:overworld run forceload add -4 -4 4 4
execute in minecraft:the_nether run forceload add -4 -4 4 4
execute in minecraft:the_end run forceload add -4 -4 4 4
execute in entersift:the_sift run forceload add -4 -4 4 4

execute unless score #souls_fx sift.roll matches 0..2 run scoreboard players set #souls_fx sift.roll 2


scoreboard objectives add sift.link dummy
scoreboard players add #encounter sift.link 0
scoreboard players add #riftcycle sift.clock 0

# 0.17 rift tunnel
scoreboard objectives add sift.tz dummy
execute in entersift:rift_tunnel run forceload add -16 -16 15 63

scoreboard objectives add sift.rstyle dummy
scoreboard objectives add sift.rwidth dummy
scoreboard objectives add sift.rheight dummy
