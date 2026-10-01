# Rift gate (26.3 /time): rifts tear open at night in the Overworld, Nether and End, and during
# Endure inside the Sift. /time query now takes a timeline id, so the old "daytime" keyword is a
# parse error that kills the whole function: minecraft:day is the Overworld clock's day timeline and
# entersift:sift_cycle is the Sift's own tide timeline. Fills #rift_time sift.day with the local time
# of day and returns 1 when a rift may open or stay open, 0 when it must be refused/sealed.
scoreboard players set #rift_time sift.day 13000
execute unless dimension entersift:the_sift store result score #rift_time sift.day run time of minecraft:overworld query minecraft:day
execute if dimension entersift:the_sift store result score #rift_time sift.day run time of entersift:sift query entersift:sift_cycle
execute if dimension entersift:the_sift unless score #rift_time sift.day matches 13000..23999 run return 0
execute unless dimension entersift:the_sift if score #rift_time sift.day matches ..12999 run return 0
execute unless dimension entersift:the_sift if score #rift_time sift.day matches 23000.. run return 0
return 1
