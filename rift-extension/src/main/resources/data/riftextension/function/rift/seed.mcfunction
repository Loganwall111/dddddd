# Placeable rift seed: a real rift (transport marker + client-rendered entity), facing the placer.
kill @e[type=minecraft:marker,tag=riftext.rift,distance=..2.5]
kill @e[type=riftextension:rift_portal,tag=riftext.rift_visual,distance=..2.5]
summon minecraft:marker ~ ~ ~ {Tags:["riftext.rift","riftext.new_rift","riftext.seeded"]}
scoreboard players set @e[type=minecraft:marker,tag=riftext.new_rift,distance=..1] riftext.age 0
$scoreboard players set @e[type=minecraft:marker,tag=riftext.new_rift,distance=..1] riftext.target $(type)
tag @e[type=minecraft:marker,tag=riftext.new_rift,distance=..1] remove riftext.new_rift
$summon riftextension:rift_portal ~ ~ ~ {Tags:["riftext.rift_visual","riftext.rift_anchor"],RiftType:$(type),Width:7.0f,Height:5.0f,Rotation:[$(yaw)f,0f]}
particle minecraft:end_rod ~ ~1.8 ~ 0.3 0.6 0.3 0.3 40 force
particle minecraft:end_rod ~ ~1.8 ~ 0.8 1.2 0.8 0.15 60 force
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6