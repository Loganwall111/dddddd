summon minecraft:block_display ~0.5 ~1 ~0.5 {Tags:["sift.beam","sift.beam_new"],block_state:{id:"entersift:resonance_purple"},brightness:{block:15,sky:15},view_range:8f,transformation:{translation:[-0.21f,0.0f,-0.21f],scale:[0.42f,56.0f,0.42f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
scoreboard players set @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] sift.age 0
tag @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] remove sift.beam_new
summon minecraft:block_display ~0.5 ~1 ~0.5 {Tags:["sift.beam","sift.beam_new"],block_state:{id:"entersift:resonance_purple"},brightness:{block:15,sky:15},view_range:8f,transformation:{translation:[-0.06f,0.0f,-0.06f],scale:[0.12f,80.0f,0.12f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
scoreboard players set @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] sift.age 0
tag @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] remove sift.beam_new
particle minecraft:dust{color:[0.58f,0.2f,1.0f],scale:2.4f} ~0.5 ~6 ~0.5 0.25 5 0.25 0 90 force
particle minecraft:end_rod ~0.5 ~1.5 ~0.5 0.3 0.3 0.3 0.12 16 force
