# 0.17: the shared rift tunnel, built once (storage flag) in entersift:rift_tunnel along +Z.
# Interior: x -2..2, y 64..68, z 0..47. Walls/floor/ceiling glow reddish-gold; bright ribs every 6 blocks.
fill -3 63 -2 3 69 49 entersift:tunnel_wall
fill -2 64 -1 2 68 48 minecraft:air
fill -3 63 4 3 69 4 entersift:tunnel_rib hollow
fill -3 63 10 3 69 10 entersift:tunnel_rib hollow
fill -3 63 16 3 69 16 entersift:tunnel_rib hollow
fill -3 63 22 3 69 22 entersift:tunnel_rib hollow
fill -3 63 28 3 69 28 entersift:tunnel_rib hollow
fill -3 63 34 3 69 34 entersift:tunnel_rib hollow
fill -3 63 40 3 69 40 entersift:tunnel_rib hollow
fill -3 63 46 3 69 46 entersift:tunnel_rib hollow
fill -2 64 -1 2 68 48 minecraft:air
data modify storage entersift:tunnel built set value 1b
