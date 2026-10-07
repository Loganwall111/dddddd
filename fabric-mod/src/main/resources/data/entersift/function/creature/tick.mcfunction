scoreboard players add @s sift.age 1
execute if entity @s[tag=sift.drift_jelly] run particle minecraft:soul ~ ~-0.6 ~ 0.2 0.2 0.2 0 1 normal
execute if entity @s[tag=sift.chestmaw] if score @s sift.age matches 40 run data merge entity @e[type=minecraft:block_display,tag=sift.maw_lid,distance=..3,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:12,transformation:{translation:[-0.5f,0.05f,-0.38f],scale:[1f,0.35f,0.76f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute if entity @s[tag=sift.chestmaw] if score @s sift.age matches 80 run data merge entity @e[type=minecraft:block_display,tag=sift.maw_lid,distance=..3,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:12,transformation:{translation:[-0.5f,-0.43f,-0.38f],scale:[1f,0.35f,0.76f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute if score @s sift.age matches 100.. run scoreboard players set @s sift.age 0
