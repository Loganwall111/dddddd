particle minecraft:end_rod ~ ~2 ~ 0.2 1.6 1.2 0.01 2 normal
execute as @a[distance=..1.8,scores={sift.cooldown=0,sift.return=1},gamemode=!spectator] at @s run function entersift:travel/begin {dest:5}
execute as @a[distance=..1.8,scores={sift.cooldown=0,sift.return=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:0}
execute unless entity @e[type=entersift:rift_portal,tag=sift.return_anchor,distance=..1] run summon entersift:rift_portal ~ ~ ~ {Tags:["sift.return_anchor"],RiftType:0,Width:3f,Height:4f,Rotation:[90f,0f]}
