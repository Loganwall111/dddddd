# 0.17: portal blocks broken (player, explosion, piston...) -> the portal closes.
$execute unless block $(ix1) $(iy1) $(iz1) entersift:sift_portal run return run function entersift:portal/close with entity @s data
$execute unless block $(ix0) $(iy0) $(iz0) entersift:sift_portal_base run return run function entersift:portal/close with entity @s data
$particle minecraft:glow $(gx) $(iy0) $(gz) $(gdx) 0.1 $(gdz) 0 3 normal
$particle minecraft:end_rod $(gx) $(iy0) $(gz) $(gdx) 0.05 $(gdz) 0.01 1 normal
