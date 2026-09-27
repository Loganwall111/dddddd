summon entersift:twisted_warden ~ ~ ~ {Tags:["sift.guardian"],PersistenceRequired:1b,CustomName:{text:"Twisted Warden",color:"dark_aqua"}}
bossbar add entersift:guardian {"text":"Twisted Warden","color":"dark_aqua"}
bossbar set entersift:guardian color blue
bossbar set entersift:guardian style notched_10
bossbar set entersift:guardian max 300
bossbar set entersift:guardian players @a[distance=..48]
playsound minecraft:entity.warden.emerge hostile @a[distance=..40] ~ ~ ~ 1 0.6
particle minecraft:sculk_soul ~ ~1 ~ 1 1.5 1 0.02 60 normal
