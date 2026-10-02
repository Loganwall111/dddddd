# Close a rift: remove the marker and the visual entity.
kill @e[type=minecraft:marker,tag=riftext.rift,distance=..3]
kill @e[type=riftextension:rift_portal,tag=riftext.rift_visual,distance=..3]
particle minecraft:end_rod ~ ~1.5 ~ 0.5 1.0 0.5 0.1 30 force
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.6 0.8