# Direct entry. No particle pre-roll, freeze, or three-second orange cutscene.
execute if score @s sift.transit matches 1.. run return 0
execute if dimension entersift:rift_tunnel run return 0
scoreboard players set @s sift.cooldown 40
$function entersift:travel/begin {dest:$(dest)}
