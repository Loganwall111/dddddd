summon minecraft:block_display ~0.5 ~1 ~0.5 {Tags:["sift.beam","sift.beam_new"],block_state:{id:"entersift:resonance_red"},brightness:{block:15,sky:15},view_range:8f,transformation:{translation:[-0.07f,0.0f,-0.07f],scale:[0.14f,6.0f,0.14f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
scoreboard players set @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] sift.age 130
tag @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] remove sift.beam_new
particle minecraft:dust{color:[1.0f,0.1f,0.13f],scale:1.6f} ~0.5 ~2.5 ~0.5 0.06 1.4 0.06 0 24 normal
particle minecraft:end_rod ~0.5 ~1.2 ~0.5 0.1 0.1 0.1 0.04 4 normal
