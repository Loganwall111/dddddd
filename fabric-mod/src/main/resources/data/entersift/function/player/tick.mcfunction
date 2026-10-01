execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.deaths > @s sift.seen run function entersift:player/death
scoreboard players operation @s sift.seen = @s sift.deaths
scoreboard players remove @s[scores={sift.cooldown=1..}] sift.cooldown 1
execute if score @s sift.transit matches 1.. run function entersift:travel/transit_tick
execute if dimension entersift:rift_tunnel run function entersift:tunnel/player_tick
scoreboard players remove @s[scores={sift.ghost=1..}] sift.ghost 1
execute if score @s sift.ghost matches 1.. run function entersift:soul/ghost_tick
execute if score @s sift.ghost matches 0 if entity @s[tag=sift.ghost] run function entersift:soul/end
# 0.22: the server's own tick counter (#time, incremented by entersift:tick) drives the per-second
# logic. 26.x /time query takes a TIMELINE id, so the old "gametime"/"daytime" keywords are a parse
# error that takes the whole function (and everything calling it) down.
scoreboard players operation #second sift.roll = #time sift.clock
scoreboard players set #twenty sift.roll 20
scoreboard players operation #second sift.roll %= #twenty sift.roll
execute if score #second sift.roll matches 0 if block ~ ~ ~ entersift:ichor run function entersift:soul/ichor
execute if score #second sift.roll matches 0 if dimension entersift:the_sift run function entersift:player/second
