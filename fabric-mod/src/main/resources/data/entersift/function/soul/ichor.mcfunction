damage @s 2 minecraft:magic
scoreboard players remove @s sift.souls 3
execute if score @s sift.souls matches ..-1 run scoreboard players set @s sift.souls 0
effect give @s minecraft:weakness 3 0 true
execute if score @s sift.souls matches 0 run effect give @s minecraft:wither 2 0 true
particle minecraft:witch ~ ~0.5 ~ 0.4 0.4 0.4 0.01 12 normal
