execute store result score #rift_time sift.day run time query daytime
execute if dimension entersift:the_sift unless score #rift_time sift.day matches 13000..23999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches ..12999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 23000.. run return 0
function entersift:rift/create
tag @e[type=minecraft:marker,tag=sift.rift,distance=..1,limit=1,sort=nearest] add sift.natural
