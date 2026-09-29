execute if score @s sift.target matches 0 as @a[distance=..3.0,scores={sift.cooldown=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:0}
execute if score @s sift.target matches 1 as @a[distance=..3.0,scores={sift.cooldown=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:1}
execute if score @s sift.target matches 2 as @a[distance=..3.0,scores={sift.cooldown=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:2}
execute if score @s sift.target matches 3 as @a[distance=..3.0,scores={sift.cooldown=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:3}
