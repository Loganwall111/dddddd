#!/usr/bin/env python3
"""Phase 6: shader-like rifts and portals.

Rifts, the ritual portal and the Sift return gate are no longer rigs of solid block displays.
Each is ONE invisible anchor display (block entersift:rift_anchor); the client RiftRenderer
draws the opening: glowing hollow outline, recessed window into another world with parallax,
floating outline cubes, lightning arcs and a white-hot tearing flash. Anchor fields:
  glow_color_override = style (0 overworld, 1 sift day, 2 end, 3 sift night, 4 nether, 5 portal)
  width / height      = opening size in blocks, Rotation[0] = facing yaw.
Idempotent; run after phase5.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
F = ROOT / "src/main/resources/data/entersift/function"
ANCHOR = 'block_state:{id:"entersift:rift_anchor"},view_range:4f'


def write(rel, text):
    path = F / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n")


def append_once(rel, line):
    path = F / rel
    text = path.read_text() if path.exists() else ""
    if line not in text:
        path.write_text(text.rstrip("\n") + "\n" + line + "\n")


def rifts():
    write("rift/create.mcfunction", """
execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..12] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] store result score @s sift.target run random value 0..3
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] at @s run function entersift:rift/style
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
playsound minecraft:block.respawn_anchor.set_spawn ambient @a[distance=..24] ~ ~ ~ 0.6 1.6
""")
    # Runs as/at the rift marker: style follows the destination, size and facing vary.
    write("rift/style.mcfunction", """
kill @e[type=minecraft:block_display,tag=sift.rift_visual,distance=..3]
execute store result storage entersift:rift style int 1 run scoreboard players get @s sift.target
execute if score @s sift.target matches 1 if predicate {type:"minecraft:random_chance",chance:0.35} run data modify storage entersift:rift style set value 3
execute if score @s sift.target matches 3 if predicate {type:"minecraft:random_chance",chance:0.3} run data modify storage entersift:rift style set value 4
execute if dimension minecraft:the_nether run data modify storage entersift:rift style set value 4
execute store result storage entersift:rift w float 1 run random value 3..5
execute store result storage entersift:rift h float 1 run random value 3..4
execute store result storage entersift:rift yaw float 45 run random value 0..3
function entersift:rift/anchor with storage entersift:rift
""")
    write("rift/anchor.mcfunction",
          '$summon minecraft:block_display ~ ~ ~ {Tags:["sift.rift_visual","sift.rift_anchor"],' + ANCHOR +
          ',glow_color_override:$(style),width:$(w)f,height:$(h)f,Rotation:[$(yaw)f,0f]}')
    # The old solid rig's pose/warp animations are replaced by the client opening animation.
    tick = F / "rift/tick.mcfunction"
    lines = [l for l in tick.read_text().splitlines() if "rift/pose_" not in l and "rift/warp" not in l]
    tick.write_text("\n".join(lines).strip() + "\n")
    # Bigger openings: step anywhere into the window.
    tr = F / "rift/transport.mcfunction"
    tr.write_text(tr.read_text().replace("distance=..1.5,", "distance=..2.2,"))


def portal():
    # Forming: the cyan portal anchor appears and pixelates inward (client animation, ~5 s).
    write("portal/form.mcfunction",
          '$execute unless entity @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] run summon minecraft:block_display ~ ~ ~ '
          '{Tags:["sift.forming","sift.portal_anchor"],' + ANCHOR + ',glow_color_override:5,width:$(pw)f,height:$(sy)f,Rotation:[$(yaw)f,0f]}')
    op = F / "portal/open.mcfunction"
    text = op.read_text().replace(
        "kill @e[type=minecraft:block_display,tag=sift.forming,distance=..1]",
        "tag @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] add sift.portal_visual\n"
        "kill @e[type=minecraft:block_display,tag=sift.forming,tag=!sift.portal_anchor,distance=..1]\n"
        "tag @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] remove sift.forming")
    op.write_text(text)
    write("portal/visual.mcfunction",
          '$execute unless entity @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] run summon minecraft:block_display ~ ~ ~ '
          '{Tags:["sift.portal_visual","sift.portal_anchor"],' + ANCHOR + ',glow_color_override:5,width:$(pw)f,height:$(sy)f,Rotation:[$(yaw)f,0f]}')
    # Portals opened before 0.7 still have solid threshold slabs: swap them for the new opening once.
    write("portal/upgrade.mcfunction", """
execute unless data entity @s data.pw run return 0
kill @e[type=minecraft:block_display,tag=sift.portal_visual,tag=!sift.portal_anchor,distance=..2]
function entersift:portal/visual with entity @s data
""")
    append_once("portal/tick.mcfunction",
                "execute unless entity @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] run function entersift:portal/upgrade")


def return_gate():
    append_once("portal/return_tick.mcfunction",
                'execute unless entity @e[type=minecraft:block_display,tag=sift.return_anchor,distance=..1] run summon minecraft:block_display ~ ~ ~ '
                '{Tags:["sift.return_anchor"],' + ANCHOR + ',glow_color_override:0,width:2.5f,height:3f,Rotation:[90f,0f]}')
    append_once("world/tick.mcfunction",
                "execute as @e[type=minecraft:block_display,tag=sift.return_anchor] at @s unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..1] run kill @s")


def main():
    rifts()
    portal()
    return_gate()
    print("phase6: done")


if __name__ == "__main__":
    main()
