# A ritual marker older than 20 s never opened (older versions / unloaded chunk): let the song be sung again.
kill @e[type=minecraft:marker,tag=sift.ritual,distance=..2,scores={sift.age=400..}]
execute if entity @e[type=minecraft:marker,tag=sift.portal,distance=..2] run return 0
execute if entity @e[type=minecraft:marker,tag=sift.ritual,distance=..2] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.ritual"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] sift.age 0
particle minecraft:soul ~ ~5 ~ 1 1 1 0.01 20 normal
playsound minecraft:block.sculk_shrieker.shriek ambient @a[distance=..32] ~ ~ ~ 0.6 0.6
stopsound @a[distance=..96] record entersift:ritual.song
playsound entersift:ritual.song record @a[distance=..96] ~ ~ ~ 1.5 1
