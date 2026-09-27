execute if entity @e[type=minecraft:marker,tag=sift.portal,distance=..2] run return 0
execute if entity @e[type=minecraft:marker,tag=sift.ritual,distance=..2] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.ritual"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] sift.age 0
function entersift:ritual/singer
playsound minecraft:block.sculk_shrieker.shriek ambient @a[distance=..32] ~ ~ ~ 0.6 0.6
