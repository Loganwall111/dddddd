# Rift night gate. Sets #rift_night sift.day to 1 while a rift may open or stay open here, else to 0.
# Use it as:   function entersift:rift/night
#              execute unless score #rift_night sift.day matches 1 run return 0
#
# Minecraft 26.x keeps time in world clocks. "time query daytime" and "time query day" no longer exist: the
# word after "query" is now read as a timeline id, so any function containing them fails to load. The reads
# below name their clock explicitly, so they work from every dimension (the Nether has no default clock):
#   * The Sift runs on its own clock, entersift:sift. Rifts bleed through during Endure, ticks 13000-23999.
#   * Every other dimension follows the Overworld clock. Rifts bleed through at night, ticks 13000-22999.
# "query time" is the clock's total elapsed ticks; the modulo turns that into the tick of the day.
# These windows must match SiftTides.isRiftNight on the client, which hides rifts outside them.
scoreboard players set #rift_night sift.day 0
scoreboard players set #day_ticks sift.day 24000
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query time
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query time
scoreboard players operation #rift_time sift.day %= #day_ticks sift.day
execute if dimension entersift:the_sift if score #rift_time sift.day matches 13000..23999 run scoreboard players set #rift_night sift.day 1
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 13000..22999 run scoreboard players set #rift_night sift.day 1
