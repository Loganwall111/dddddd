# Try the safe destination; failure keeps the player in the corridor, not in a cave or void.
execute if score @s sift.cooldown matches 1.. run return 0
function entersift:travel/transit_go
