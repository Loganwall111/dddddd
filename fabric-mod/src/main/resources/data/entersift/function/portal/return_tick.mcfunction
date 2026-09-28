particle minecraft:end_rod ~ ~2 ~ 0.2 1.6 1.2 0.01 2 normal
execute as @a[distance=..1.8,scores={sift.cooldown=0,sift.return=1},gamemode=!spectator] at @s run function entersift:travel/return
execute unless entity @e[type=minecraft:block_display,tag=sift.return_anchor,distance=..1] run summon minecraft:block_display ~ ~ ~ {Tags:["sift.return_anchor"],block_state:{id:"entersift:rift_anchor"},view_range:4f,glow_color_override:5,width:3f,height:4f,Rotation:[90f,0f]}
execute as @e[type=minecraft:block_display,tag=sift.return_anchor,distance=..1] unless data entity @s {glow_color_override:5} run data merge entity @s {glow_color_override:5,width:3f,height:4f}
