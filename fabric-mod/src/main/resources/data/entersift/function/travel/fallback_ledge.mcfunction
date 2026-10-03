# 0.32: guaranteed landing. Runs only when no natural surface column was ready in the destination, so
# a traveler is never left walking the corridor while the search quietly fails (ocean, lava or void).
# Called with the execution position at the fallback column, one block ABOVE its world surface.
fill ~-2 ~-1 ~-2 ~2 ~-1 ~2 entersift:saltstone
fill ~-1 ~ ~-1 ~1 ~2 ~1 minecraft:air
execute positioned ~ ~ ~ run function entersift:travel/arrive
