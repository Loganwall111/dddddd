# Rifts can open at any hour. These queries are diagnostic only; they do not gate travel.
scoreboard players set #rift_time sift.day 13000
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query minecraft:day
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query entersift:sift_cycle
return 1
