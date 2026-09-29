# Glow particles along the bottom edge: centre + spread, stored once.
execute store result score #yaw sift.roll run data get entity @s data.yaw 1
execute store result score #gx sift.roll run data get entity @s data.ix0 10
execute store result score #t sift.roll run data get entity @s data.ix1 10
scoreboard players operation #gx sift.roll += #t sift.roll
scoreboard players add #gx sift.roll 10
execute store result entity @s data.gx double 0.05 run scoreboard players get #gx sift.roll
execute store result score #gz sift.roll run data get entity @s data.iz0 10
execute store result score #t sift.roll run data get entity @s data.iz1 10
scoreboard players operation #gz sift.roll += #t sift.roll
scoreboard players add #gz sift.roll 10
execute store result entity @s data.gz double 0.05 run scoreboard players get #gz sift.roll
execute if score #yaw sift.roll matches 0 store result entity @s data.gdx float 0.3 run data get entity @s data.pw 1
execute if score #yaw sift.roll matches 0 run data modify entity @s data.gdz set value 0.05f
execute unless score #yaw sift.roll matches 0 store result entity @s data.gdz float 0.3 run data get entity @s data.pw 1
execute unless score #yaw sift.roll matches 0 run data modify entity @s data.gdx set value 0.05f
