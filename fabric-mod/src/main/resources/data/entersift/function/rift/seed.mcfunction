# Creative rift seed block: a real, night-only rift (transport marker + client-rendered anchor), facing the placer.
execute store result score #rift_time sift.day run time query daytime
execute if dimension entersift:the_sift unless score #rift_time sift.day matches 13000..23999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches ..12999
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 23000.. run return 0
kill @e[type=minecraft:marker,tag=sift.rift,distance=..2.5]
kill @e[type=entersift:rift_portal,tag=sift.rift_visual,distance=..2.5]
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift","sift.seeded"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
$scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.target $(target)
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
$summon entersift:rift_portal ~ ~ ~ {Tags:["sift.rift_visual","sift.rift_anchor"],RiftType:$(target),Width:7.0f,Height:5.0f,Rotation:[$(yaw)f,0f]}
particle minecraft:end_rod ~ ~1.8 ~ 0.2 0.35 0.2 0.08 8 force
particle minecraft:end_rod ~ ~1.8 ~ 0.45 0.65 0.45 0.12 14 force
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6
