scoreboard players add #time sift.clock 1
execute as @a at @s run function entersift:player/tick
execute in minecraft:overworld run function entersift:world/tick
execute in minecraft:the_nether run function entersift:world/tick
execute in minecraft:the_end run function entersift:world/tick
execute in entersift:the_sift run function entersift:world/tick
execute if score #time sift.clock matches 600.. run function entersift:world/pulse
