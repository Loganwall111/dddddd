execute if dimension entersift:the_sift run function entersift:atmosphere/souls
execute if dimension entersift:the_sift run title @s actionbar [{"text":"THE SIFT  ◇  Souls: ","color":"aqua"},{"score":{"name":"@s","objective":"sift.souls"}},{"text":"  •  Keep away from ichor.","color":"gray"}]
execute if block ~ ~-1 ~ entersift:soul_salt if score @s sift.souls matches ..99 run scoreboard players add @s sift.souls 1
