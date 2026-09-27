execute if entity @e[type=minecraft:marker,tag=sift.encounter,distance=..1] run return 0
scoreboard players add #encounter sift.link 1
summon minecraft:marker ~ ~ ~ {Tags:["sift.encounter","sift.new_encounter"]}
scoreboard players operation @e[type=minecraft:marker,tag=sift.new_encounter,distance=..1,limit=1] sift.link = #encounter sift.link
tag @e[type=minecraft:marker,tag=sift.new_encounter,distance=..1] remove sift.new_encounter
execute positioned ~ ~ ~3 run function entersift:creature/twisted_warden/spawn
scoreboard players operation @e[type=entersift:twisted_warden,tag=sift.guardian,distance=..8,sort=nearest,limit=1] sift.link = #encounter sift.link
playsound minecraft:entity.warden.emerge hostile @a[distance=..40] ~ ~ ~ 1 0.7
tellraw @a[distance=..40] {"text":"The Twisted Warden guards the threshold. Defeat it to awaken the Singer.","color":"dark_aqua"}
