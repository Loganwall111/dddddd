execute if entity @e[type=minecraft:marker,tag=sift.portal,distance=..2] run return 0
execute if entity @e[type=minecraft:marker,tag=sift.ritual,distance=..2] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.ritual"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] sift.age 0
particle minecraft:soul ~ ~5 ~ 1 1 1 0.01 20 normal
playsound minecraft:block.sculk_shrieker.shriek ambient @a[distance=..32] ~ ~ ~ 0.6 0.6
