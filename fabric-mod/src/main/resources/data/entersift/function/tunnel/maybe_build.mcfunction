# Runs from world/tick until the tunnel exists (the area is forceloaded in load).
execute unless loaded 0 64 0 run return 0
execute unless loaded 0 64 47 run return 0
function entersift:tunnel/build
