particle minecraft:soul ~ ~0.7 ~ 0.2 0.4 0.2 0.002 1 normal
execute if score #haunt sift.roll matches 1 as @a[distance=0.1..3,gamemode=!spectator] run effect give @s minecraft:glowing 1 0 true
