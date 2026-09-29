# 0.17 block portal: compute the interior once (also migrates pre-0.17 markers), fill it, then check it.
execute unless data entity @s data.ix0 run function entersift:portal/migrate
execute unless data entity @s data.gx run function entersift:portal/glow_centre
execute unless data entity @s {data:{filled:1b}} run function entersift:portal/fill with entity @s data
function entersift:portal/cross with entity @s data
function entersift:portal/check with entity @s data
