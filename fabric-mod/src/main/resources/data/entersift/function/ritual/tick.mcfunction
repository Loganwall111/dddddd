scoreboard players add @s sift.age 1
execute if score @s sift.age matches 60 run function entersift:ritual/note_0 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_0 with entity @s data
execute if score @s sift.age matches 84 run function entersift:ritual/note_1 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_1 with entity @s data
execute if score @s sift.age matches 108 run function entersift:ritual/note_2 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_2 with entity @s data
execute if score @s sift.age matches 132 run function entersift:ritual/note_3 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_3 with entity @s data
execute if score @s sift.age matches 156 run function entersift:ritual/note_4 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_4 with entity @s data
execute if score @s sift.age matches 180 run function entersift:ritual/note_5 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_5 with entity @s data
execute if score @s sift.age matches 204 run function entersift:ritual/note_6 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_6 with entity @s data
execute if score @s sift.age matches 228 run function entersift:ritual/note_7 with entity @s data
execute if score @s sift.age matches 1 run function entersift:ritual/note_7 with entity @s data
execute if score @s sift.age matches 240 run function entersift:portal/form with entity @s data
execute if score @s sift.age matches 350.. run function entersift:portal/open

execute if score @s sift.age matches 242 run function entersift:portal/assemble_0 with entity @s data

execute if score @s sift.age matches 250 run function entersift:portal/assemble_1 with entity @s data

execute if score @s sift.age matches 258 run function entersift:portal/assemble_2 with entity @s data

execute if score @s sift.age matches 266 run function entersift:portal/assemble_3 with entity @s data

execute if score @s sift.age matches 274 run function entersift:portal/assemble_4 with entity @s data

execute if score @s sift.age matches 282 run function entersift:portal/assemble_5 with entity @s data

execute if score @s sift.age matches 290 run function entersift:portal/assemble_6 with entity @s data

execute if score @s sift.age matches 298 run function entersift:portal/assemble_7 with entity @s data
execute if score @s sift.age matches 240..349 run particle minecraft:electric_spark ~ ~2 ~ 1.6 2 0.3 0.4 10 normal
execute if score @s sift.age matches 240..349 run particle minecraft:end_rod ~ ~2 ~ 1.4 2 0.2 0.02 4 normal
execute if score @s sift.age matches 240 run playsound minecraft:block.beacon.activate ambient @a[distance=..48] ~ ~ ~ 2 0.6
execute if score @s sift.age matches 68 run function entersift:ritual/flicker_0 with entity @s data
execute if score @s sift.age matches 76 run function entersift:ritual/flicker_0 with entity @s data
execute if score @s sift.age matches 92 run function entersift:ritual/flicker_1 with entity @s data
execute if score @s sift.age matches 100 run function entersift:ritual/flicker_1 with entity @s data
execute if score @s sift.age matches 116 run function entersift:ritual/flicker_2 with entity @s data
execute if score @s sift.age matches 124 run function entersift:ritual/flicker_2 with entity @s data
execute if score @s sift.age matches 140 run function entersift:ritual/flicker_3 with entity @s data
execute if score @s sift.age matches 148 run function entersift:ritual/flicker_3 with entity @s data
execute if score @s sift.age matches 164 run function entersift:ritual/flicker_4 with entity @s data
execute if score @s sift.age matches 172 run function entersift:ritual/flicker_4 with entity @s data
execute if score @s sift.age matches 188 run function entersift:ritual/flicker_5 with entity @s data
execute if score @s sift.age matches 196 run function entersift:ritual/flicker_5 with entity @s data
execute if score @s sift.age matches 212 run function entersift:ritual/flicker_6 with entity @s data
execute if score @s sift.age matches 220 run function entersift:ritual/flicker_6 with entity @s data
execute if score @s sift.age matches 236 run function entersift:ritual/flicker_7 with entity @s data
execute if score @s sift.age matches 244 run function entersift:ritual/flicker_7 with entity @s data
execute if score @s sift.age matches 232 run function entersift:ritual/finale with entity @s data
