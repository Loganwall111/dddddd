# 0.17 rift travel: no cutscene. The return point is saved HERE, in the dimension the player is
# leaving (the tunnel would otherwise be saved as "home"), then the player walks the rift tunnel.
# dest: 0 overworld, 1 nether, 2 end, 3 sift (rifts), 4 sift (blue portal), 5 return anchor.
execute if score @s sift.transit matches 1.. run return 0
execute if dimension entersift:rift_tunnel run return 0
$scoreboard players set @s sift.dest $(dest)
execute unless score @s sift.dest matches 5 unless score @s sift.return matches 1 run function entersift:travel/save
# Wait for the corridor instead of playing a cutscene or sending a player into unbuilt space.
execute unless data storage entersift:tunnel {v:2b} run return 0
function entersift:tunnel/enter
