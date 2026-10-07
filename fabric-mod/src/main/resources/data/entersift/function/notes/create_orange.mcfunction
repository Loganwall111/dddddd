kill @e[type=minecraft:block_display,tag=sift.note_visual,distance=..0.1]
kill @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1]
summon minecraft:marker ~ ~ ~ {Tags:["sift.note_glow"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1] sift.age 0
summon minecraft:block_display ~ ~ ~ {Tags:["sift.note_visual"],block_state:{id:"entersift:resonance_orange"},brightness:{block:15,sky:0},transformation:{translation:[-0.52f,0.0f,-0.52f],scale:[1.04f,0.035f,0.045f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
summon minecraft:block_display ~ ~ ~ {Tags:["sift.note_visual"],block_state:{id:"entersift:resonance_orange"},brightness:{block:15,sky:0},transformation:{translation:[-0.52f,0.0f,0.475f],scale:[1.04f,0.035f,0.045f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
summon minecraft:block_display ~ ~ ~ {Tags:["sift.note_visual"],block_state:{id:"entersift:resonance_orange"},brightness:{block:15,sky:0},transformation:{translation:[-0.52f,0.0f,-0.475f],scale:[0.045f,0.035f,0.95f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
summon minecraft:block_display ~ ~ ~ {Tags:["sift.note_visual"],block_state:{id:"entersift:resonance_orange"},brightness:{block:15,sky:0},transformation:{translation:[0.475f,0.0f,-0.475f],scale:[0.045f,0.035f,0.95f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
particle minecraft:dust{color:[1.0f,0.55f,0.16f],scale:1.2f} ~ ~0.12 ~ 0.22 0.12 0.22 0 12 normal
