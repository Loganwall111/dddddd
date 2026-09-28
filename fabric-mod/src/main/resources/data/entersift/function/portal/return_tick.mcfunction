particle minecraft:portal ~ ~1 ~ 0.6 1 0.6 0.01 4 normal
execute as @a[distance=..1.5,scores={sift.cooldown=0,sift.return=1},gamemode=!spectator] at @s run function entersift:travel/return
execute unless entity @e[type=minecraft:block_display,tag=sift.return_anchor,distance=..1] run summon minecraft:block_display ~ ~ ~ {Tags:["sift.return_anchor"],block_state:{id:"entersift:rift_anchor"},view_range:4f,glow_color_override:0,width:2.5f,height:3f,Rotation:[90f,0f]}
