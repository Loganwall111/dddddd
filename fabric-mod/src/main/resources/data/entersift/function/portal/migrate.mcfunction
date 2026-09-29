# 0.17: work out the frame interior (block coordinates) from the marker position and the frame size.
# Marker: x = rimX + w/2 + 0.5 (along X) or z = rimZ + w/2 + 0.5 (along Z); y = rimY + 1. pw = w - 1, sy = h - 1.
execute store result score #mx sift.roll run data get entity @s Pos[0] 2
execute store result score #my sift.roll run data get entity @s Pos[1] 1
execute store result score #mz sift.roll run data get entity @s Pos[2] 2
execute store result score #w sift.roll run data get entity @s data.pw 1
scoreboard players add #w sift.roll 1
execute store result score #h sift.roll run data get entity @s data.sy 1
scoreboard players set #two sift.roll 2
execute store result score #yaw sift.roll run data get entity @s data.yaw 1
execute if score #yaw sift.roll matches 0 run function entersift:portal/migrate_x
execute unless score #yaw sift.roll matches 0 run function entersift:portal/migrate_z
scoreboard players operation #iy1 sift.roll = #my sift.roll
scoreboard players operation #iy1 sift.roll += #h sift.roll
scoreboard players remove #iy1 sift.roll 1
execute store result entity @s data.iy0 int 1 run scoreboard players get #my sift.roll
execute store result entity @s data.iy1 int 1 run scoreboard players get #iy1 sift.roll
execute store result entity @s data.ix0 int 1 run scoreboard players get #ix0 sift.roll
execute store result entity @s data.ix1 int 1 run scoreboard players get #ix1 sift.roll
execute store result entity @s data.iz0 int 1 run scoreboard players get #iz0 sift.roll
execute store result entity @s data.iz1 int 1 run scoreboard players get #iz1 sift.roll
