kill @e[type=minecraft:block_display,tag=sift.singer,distance=..6]
tag @s remove sift.ritual
tag @s add sift.portal
playsound minecraft:block.end_portal.spawn ambient @a[distance=..48] ~ ~ ~ 0.7 0.7
function entersift:portal/visual with entity @s data
