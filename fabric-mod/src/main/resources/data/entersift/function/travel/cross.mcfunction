# Capture appearance before entering the tunnel; scores persist through saves/reconnects.
$scoreboard players set @s sift.rstyle $(style)
$scoreboard players set @s sift.rwidth $(width)
$scoreboard players set @s sift.rheight $(height)
# Short white voxel silhouette stays at the actual crossing for all observers.
# Spawned this tick, then travel immediately: no particle pre-roll.
summon entersift:rift_portal ~ ~ ~ {Tags:["sift.transit_echo"],TransitEcho:1b}
data modify entity @e[type=entersift:rift_portal,tag=sift.transit_echo,distance=..0.1,sort=nearest,limit=1] Rotation set from entity @s Rotation
$function entersift:travel/warp {dest:$(dest)}
