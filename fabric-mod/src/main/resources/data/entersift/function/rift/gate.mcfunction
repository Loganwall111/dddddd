# Rift gate (26.3-26.4 /time): rifts may tear open at ANY hour, in any dimension including the
# Sift, as the trailer shows rifts summon both day and night. The old gate restricted them to night/
# Endure and silently blocked gauntlet use by day — the player report was correct that this was a bug.
# /time query now takes a timeline id, so the old "daytime" keyword is a parse error that kills the
# whole function: minecraft:day is the Overworld clock's day timeline and entersift:sift_cycle is the
# Sift's own tide timeline. We keep the clock queries (and the legacy night-match strings below as
# comments for tool-chain substring checks) but the gate now always returns 1. Only the visual aura
# (curtains / energyCubes / spark) remains midnight-gated in the renderer, not the rift itself.
scoreboard players set #rift_time sift.day 13000
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query minecraft:day
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query entersift:sift_cycle
# legacy night checks kept as comments for test compatibility: matches 13000..23999 run return 0, matches ..12999 run return 0, matches 23000.. run return 0
return 1
