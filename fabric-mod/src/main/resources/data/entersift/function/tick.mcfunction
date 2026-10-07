scoreboard players add #time sift.clock 1
execute as @a at @s run function entersift:player/tick
execute in minecraft:overworld run function entersift:world/tick
execute in minecraft:the_nether run function entersift:world/tick
execute in minecraft:the_end run function entersift:world/tick
execute in entersift:the_sift run function entersift:world/tick
execute if score #time sift.clock matches 600.. run function entersift:world/pulse


scoreboard players add #riftcycle sift.clock 1
# 0.10: a rift wave every 5 minutes (6000 ticks), only for players who have activated the Rift gauntlet.
execute if score #riftcycle sift.clock matches 6000.. run scoreboard players set #riftcycle sift.clock 0
execute if score #riftcycle sift.clock matches 20 as @a[gamemode=!spectator,tag=sift.awakened] at @s run function entersift:rift/wave_player
execute if score #riftcycle sift.clock matches 2400 if entity @a[tag=sift.awakened] run title @a[tag=sift.awakened] actionbar {"text":"The rifts seal… for now.","color":"dark_purple"}
