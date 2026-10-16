# Rifts may open any hour; only their cube aura is night-gated. Clock queries are diagnostic.
scoreboard players set #rift_time sift.day 13000
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query minecraft:day
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query entersift:sift_cycle
return 1
