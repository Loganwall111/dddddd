# 0.22: only kill regular rift visuals, NOT return portals (which have sift.return_gate tag)
kill @e[type=entersift:rift_portal,tag=sift.rift_visual,distance=..4,tag=!sift.return_gate]
kill @s
