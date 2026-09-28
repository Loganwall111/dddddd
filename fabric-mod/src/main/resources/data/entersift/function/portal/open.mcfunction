tag @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] add sift.portal_visual
kill @e[type=minecraft:block_display,tag=sift.forming,tag=!sift.portal_anchor,distance=..1]
tag @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] remove sift.forming
kill @e[type=minecraft:block_display,tag=sift.singer,distance=..6]
execute as @e[type=entersift:singer,distance=..14] at @s run particle minecraft:end_rod ~ ~1.5 ~ 0.6 1.2 0.6 0.2 80 normal
tp @e[type=entersift:singer,distance=..14] ~ -200 ~
kill @e[type=entersift:singer,distance=..14]
tag @s remove sift.ritual
tag @s add sift.portal
playsound minecraft:block.end_portal.spawn ambient @a[distance=..48] ~ ~ ~ 0.7 0.7
function entersift:portal/visual with entity @s data
