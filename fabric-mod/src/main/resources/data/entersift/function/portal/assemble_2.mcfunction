$data merge entity @e[type=minecraft:block_display,tag=sift.panel1,distance=..1,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:40,transformation:{translation:[$(p1x)f,0f,$(p1z)f],scale:[$(bx)f,$(sy)f,$(bz)f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute as @e[type=minecraft:block_display,tag=sift.forming,distance=..1] run data merge entity @s {block_state:{id:"entersift:threshold_stage_2"}}
playsound minecraft:block.amethyst_block.chime ambient @a[distance=..32] ~ ~ ~ 1.5 0.7
