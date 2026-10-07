# rimZ = (mz - w - 1) / 2 ; interior z = rim+1 .. rim+w-1 ; x = (mx - 1) / 2
scoreboard players operation #iz0 sift.roll = #mz sift.roll
scoreboard players operation #iz0 sift.roll -= #w sift.roll
scoreboard players remove #iz0 sift.roll 1
scoreboard players operation #iz0 sift.roll /= #two sift.roll
scoreboard players operation #iz1 sift.roll = #iz0 sift.roll
scoreboard players operation #iz1 sift.roll += #w sift.roll
scoreboard players remove #iz1 sift.roll 1
scoreboard players add #iz0 sift.roll 1
scoreboard players operation #ix0 sift.roll = #mx sift.roll
scoreboard players remove #ix0 sift.roll 1
scoreboard players operation #ix0 sift.roll /= #two sift.roll
scoreboard players operation #ix1 sift.roll = #ix0 sift.roll
