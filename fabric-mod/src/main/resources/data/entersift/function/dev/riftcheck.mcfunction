# /function entersift:dev/riftcheck - live rift diagnostic. Run it as a player.
# Prints the local time of day and whether the rift window is open, then tears a debug rift open in
# front of the player. The debug rift ignores the window (creative-seed rules), so the visuals and the
# travel route can be inspected at any hour.
scoreboard players set #rift_time sift.day 13000
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query minecraft:day
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query entersift:sift_cycle
tellraw @s [{"text":"[Sift] local time of day: ","color":"gray"},{"score":{"name":"#rift_time","objective":"sift.day"},"color":"white"},{"text":"  (rifts open at night 13000-22999, or during Endure 13000-23999 in the Sift)","color":"dark_gray"}]
execute if function entersift:rift/gate run tellraw @s {"text":"[Sift] the window is open: rifts can tear open here.","color":"green"}
execute unless function entersift:rift/gate run tellraw @s {"text":"[Sift] the window is closed: rifts stay sealed right now.","color":"red"}
# Debug rift in front of the player, facing like a punched rift. Same destination rule as natural rifts.
execute store result score #rift_dest sift.target run random value 0..3
execute if dimension minecraft:overworld if score #rift_dest sift.target matches 0 run scoreboard players set #rift_dest sift.target 3
execute if dimension minecraft:the_nether if score #rift_dest sift.target matches 1 run scoreboard players set #rift_dest sift.target 3
execute if dimension minecraft:the_end if score #rift_dest sift.target matches 2 run scoreboard players set #rift_dest sift.target 3
execute if dimension entersift:the_sift if score #rift_dest sift.target matches 3 run scoreboard players set #rift_dest sift.target 0
execute store result storage entersift:rift target int 1 run scoreboard players get #rift_dest sift.target
execute store result storage entersift:rift yaw float 1 run data get entity @s Rotation[0]
function entersift:rift/seed with storage entersift:rift
