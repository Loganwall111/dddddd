# 0.18: the shared rift tunnel, rebuilt as INVISIBLE barriers (the warp burst is drawn by the client).
# Interior: x -2..2, y 64..68, z -1..32. Old 0.17 glowing walls and ribs are cleared first.
fill -3 63 -2 3 69 49 minecraft:air
fill -3 63 -2 3 69 33 minecraft:barrier hollow
data modify storage entersift:tunnel built set value 1b
data modify storage entersift:tunnel v set value 2b
