# Creative rift seed block: a real rift (transport marker + client-rendered anchor), facing the placer.
kill @e[type=minecraft:marker,tag=sift.rift,distance=..2.5]
kill @e[type=entersift:rift_portal,tag=sift.rift_visual,distance=..2.5]
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift","sift.seeded"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
$scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.target $(target)
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
$summon entersift:rift_portal ~ ~ ~ {Tags:["sift.rift_visual","sift.rift_anchor"],RiftType:$(target),Width:4.5f,Height:3.5f,Rotation:[$(yaw)f,0f]}
particle minecraft:end_rod ~ ~1.8 ~ 0.3 0.6 0.3 0.3 40 force
particle minecraft:end_rod ~ ~1.8 ~ 0.8 1.2 0.8 0.15 60 force
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6
