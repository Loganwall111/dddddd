function entersift:rift/night
execute unless score #rift_night sift.day matches 1 run return 0
function entersift:rift/create
tag @e[type=minecraft:marker,tag=sift.rift,distance=..1,limit=1,sort=nearest] add sift.natural
