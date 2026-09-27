$data merge entity @e[type=minecraft:block_display,tag=sift.panel3,distance=..1,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:40,transformation:{translation:[$(p3x)f,0f,$(p3z)f],scale:[$(bx)f,$(sy)f,$(bz)f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute as @e[type=minecraft:block_display,tag=sift.forming,distance=..1] run data merge entity @s {block_state:{Name:"entersift:threshold_stage_6"}}
playsound minecraft:block.amethyst_block.chime ambient @a[distance=..32] ~ ~ ~ 1.5 1.1
