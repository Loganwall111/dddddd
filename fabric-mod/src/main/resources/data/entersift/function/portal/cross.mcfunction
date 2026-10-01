# The Agency Portal is two-way: enter the Sift from outside, return through it from inside.
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0},gamemode=!spectator] at @s if dimension entersift:the_sift if score @s sift.return matches 1 run function entersift:travel/begin {dest:5}
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0,sift.return=0},gamemode=!spectator] at @s if dimension entersift:the_sift run function entersift:travel/begin {dest:0}
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0},gamemode=!spectator] at @s unless dimension entersift:the_sift run function entersift:travel/begin {dest:4}
