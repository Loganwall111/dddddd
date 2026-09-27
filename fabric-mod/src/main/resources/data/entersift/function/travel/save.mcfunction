execute store result score @s sift.rx run data get entity @s Pos[0] 1
execute store result score @s sift.ry run data get entity @s Pos[1] 1
execute store result score @s sift.rz run data get entity @s Pos[2] 1
execute if dimension minecraft:overworld run scoreboard players set @s sift.rdim 0
execute if dimension minecraft:the_nether run scoreboard players set @s sift.rdim 1
execute if dimension minecraft:the_end run scoreboard players set @s sift.rdim 2
execute if dimension entersift:the_sift run scoreboard players set @s sift.rdim 3
scoreboard players set @s sift.return 1
