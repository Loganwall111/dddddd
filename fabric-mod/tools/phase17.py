#!/usr/bin/env python3
"""0.17 generator (idempotent).

  * entersift:sift_portal / sift_portal_base: the ancient-city portal is now a real block sheet like a
    nether portal (collisionless, light 15, translucent, animated vibrant cyan mosaic, 4 random
    variants). The bottom row uses the brighter "base" block: the glowing lower edge of the ref.
  * entersift:tunnel_wall / tunnel_rib: reddish-gold glowing walls of the rift tunnel (unbreakable).
  * entersift:rift_tunnel: void pocket dimension (flat, no layers) with its own orange-fog biome.
    Walking into a rift sends the player into one shared tunnel; walking to its far end exits into
    the destination. This replaces the 0.16 4-second cutscene.
  * datapack functions for the tunnel, the block portal and the save-before-travel fix.
  * Sift biomes: the ash / white_ash / white_smoke ambient particles (the dark floating specks) are
    removed.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / "src/main/resources"
A = R / "assets/entersift"
D = R / "data/entersift"
F = D / "function"
TEX = A / "textures/block"
FRAMES = 16


def dump(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n")


def write(p: Path, text: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.strip("\n") + "\n")


def save_anim(img: np.ndarray, name: str, frametime=2):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA").save(TEX / f"{name}.png")
    dump(TEX / f"{name}.png.mcmeta", {"animation": {"frametime": frametime, "interpolate": True}})


# ------------------------------------------------------------------ textures

def portal_texture(seed: int, base: bool) -> np.ndarray:
    """16 x (16*FRAMES) RGBA. Tiles seamlessly: cells are on the 16 px grid and every wave is 16-periodic."""
    rng = np.random.default_rng(seed)
    tones = np.array([(0, 158, 232), (22, 196, 250), (64, 226, 255), (120, 244, 255), (182, 252, 255), (236, 255, 255)], float)
    cells = np.zeros((16, 16), int)
    for by in range(0, 16, 4):
        for bx in range(0, 16, 4):
            k = rng.choice(6, p=[0.14, 0.24, 0.26, 0.18, 0.12, 0.06])
            cells[by:by + 4, bx:bx + 4] = k
            if rng.random() < 0.55:  # split into 2 px sub-cells
                for sy in range(by, by + 4, 2):
                    for sx in range(bx, bx + 4, 2):
                        if rng.random() < 0.5:
                            cells[sy:sy + 2, sx:sx + 2] = int(np.clip(k + rng.integers(-2, 3), 0, 5))
    flick = rng.random((16, 16))
    out = np.zeros((16 * FRAMES, 16, 4))
    y, x = np.mgrid[0:16, 0:16]
    for f in range(FRAMES):
        ph = f / FRAMES
        wave = 0.5 + 0.5 * np.sin(2 * np.pi * ((x + y) / 16.0 - ph))            # diagonal shimmer
        wave2 = 0.5 + 0.5 * np.sin(2 * np.pi * ((x - y) / 16.0 + 2 * ph))
        k = cells + np.where(np.sin(2 * np.pi * (flick + ph)) > 0.8, 1, 0)       # cells flicker a step brighter
        c = tones[np.clip(k, 0, 5)]
        boost = 0.28 * wave ** 3 + 0.12 * wave2 ** 4
        c = c + (255 - c) * boost[..., None]
        a = 196 + 40 * wave
        if base:  # bottom row block: white-hot lower edge fading up into the mosaic
            g = ((15 - y) / 15.0) ** 1.6  # 1 at the bottom pixel row
            c = c + (np.array((250, 255, 255)) - c) * (0.75 * g)[..., None]
            a = np.maximum(a, 200 + 55 * g)
        # 1 px darker grout between 4 px cells keeps the mosaic readable.
        grout = ((x % 4 == 0) | (y % 4 == 0))
        c = np.where(grout[..., None], c * 0.86, c)
        out[f * 16:(f + 1) * 16, :, :3] = c
        out[f * 16:(f + 1) * 16, :, 3] = a
    return out


def tunnel_texture(seed: int, rib: bool) -> np.ndarray:
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:16, 0:16].astype(float)
    grain = rng.normal(0, 9, (16, 16))
    stops = np.array([(122, 22, 24), (196, 60, 34), (240, 122, 44), (255, 184, 70), (255, 228, 150)], float)
    if rib:
        stops = np.array([(214, 110, 36), (246, 160, 52), (255, 204, 88), (255, 232, 150), (255, 248, 210)], float)
    out = np.zeros((16 * FRAMES, 16, 4))
    for f in range(FRAMES):
        ph = f / FRAMES
        v = (0.5 + 0.25 * np.sin(2 * np.pi * (x / 16 + 0.35 * np.sin(2 * np.pi * (y / 16 + ph)) + ph))
             + 0.25 * np.sin(2 * np.pi * (y / 8 - x / 16 - ph)))
        v = np.clip(v + grain / 255.0 * 2, 0, 1) * (len(stops) - 1)
        i = np.clip(v.astype(int), 0, len(stops) - 2)
        t = (v - i)[..., None]
        c = stops[i] * (1 - t) + stops[i + 1] * t
        out[f * 16:(f + 1) * 16, :, :3] = c
        out[f * 16:(f + 1) * 16, :, 3] = 255
    return out


# ------------------------------------------------------------------ block assets

def assets():
    lang_p = A / "lang/en_us.json"
    lang = json.loads(lang_p.read_text())
    save_anim(portal_texture(1701, False), "sift_portal")
    save_anim(portal_texture(1702, False), "sift_portal_b")
    save_anim(portal_texture(1703, True), "sift_portal_base")
    save_anim(tunnel_texture(1704, False), "tunnel_wall", 3)
    save_anim(tunnel_texture(1705, True), "tunnel_rib", 3)
    for name, tex_list, label in (("sift_portal", ("sift_portal", "sift_portal_b"), "Sift Portal"),
                                  ("sift_portal_base", ("sift_portal_base",), "Sift Portal")):
        variants = []
        for i, tex in enumerate(tex_list):
            model = f"{name}" if i == 0 else f"{name}_{i}"
            dump(A / f"models/block/{model}.json", {"parent": "minecraft:block/cube_all", "textures": {"all": f"entersift:block/{tex}"}})
            variants.append({"model": f"entersift:block/{model}"})
            variants.append({"model": f"entersift:block/{model}", "y": 180})
        while len(variants) < 4:
            variants.append({"model": variants[0]["model"], "y": 90 * len(variants)})
        dump(A / f"blockstates/{name}.json", {"variants": {"": variants[:4]}})
        dump(A / f"items/{name}.json", {"model": {"type": "minecraft:model", "model": f"entersift:block/{name}"}})
        dump(D / f"loot_table/blocks/{name}.json", {"type": "minecraft:block", "pools": []})
        lang[f"block.entersift.{name}"] = label
    for name, label in (("tunnel_wall", "Rift Tunnel Wall"), ("tunnel_rib", "Rift Tunnel Rib")):
        dump(A / f"models/block/{name}.json", {"parent": "minecraft:block/cube_all", "textures": {"all": f"entersift:block/{name}"}})
        dump(A / f"blockstates/{name}.json", {"variants": {"": [{"model": f"entersift:block/{name}"}, {"model": f"entersift:block/{name}", "y": 90},
                                                                 {"model": f"entersift:block/{name}", "y": 180}, {"model": f"entersift:block/{name}", "y": 270}]}})
        dump(A / f"items/{name}.json", {"model": {"type": "minecraft:model", "model": f"entersift:block/{name}"}})
        dump(D / f"loot_table/blocks/{name}.json", {"type": "minecraft:block", "pools": []})
        lang[f"block.entersift.{name}"] = label
    lang["entity.entersift.aura_column"] = "Aura Glow"
    lang["biome.entersift.rift_tunnel"] = "Rift Tunnel"
    dump(lang_p, lang)


# ------------------------------------------------------------------ tunnel dimension

def tunnel_dimension():
    dump(D / "dimension_type/rift_tunnel.json", {
        "ambient_light": 1.0,
        "attributes": {
            "minecraft:visual/fog_color": "#ff8a3c",
            "minecraft:visual/sky_color": "#ff7a30",
            "minecraft:visual/cloud_color": "#00ffffff",
            "minecraft:visual/ambient_light_color": "#ffb070",
            "minecraft:audio/ambient_sounds": {"loop": "entersift:ambient.sift.loop"},
            "minecraft:gameplay/bed_rule": {"can_set_spawn": "never", "can_sleep": "never",
                                            "error_message": {"text": "There is no rest between worlds."}},
        },
        "coordinate_scale": 1.0,
        "default_clock": "minecraft:overworld",
        "has_ceiling": True,
        "has_ender_dragon_fight": False,
        "has_skylight": False,
        "height": 256,
        "infiniburn": "#minecraft:infiniburn_overworld",
        "logical_height": 256,
        "min_y": 0,
        "monster_spawn_block_light_limit": 0,
        "monster_spawn_light_level": 0,
        "timelines": [],
    })
    dump(D / "dimension/rift_tunnel.json", {
        "type": "entersift:rift_tunnel",
        "generator": {"type": "minecraft:flat", "settings": {
            "biome": "entersift:rift_tunnel", "layers": [{"block": "minecraft:air", "height": 1}],
            "lakes": False, "features": False, "structure_overrides": []}},
    })
    dump(D / "worldgen/biome/rift_tunnel.json", {
        "has_precipitation": False, "temperature": 1.0, "downfall": 0,
        "effects": {"water_color": "#ff9a50"},
        "attributes": {
            "minecraft:visual/fog_color": "#ff8a3c",
            "minecraft:visual/sky_color": "#ff7a30",
            "minecraft:visual/ambient_particles": {"modifier": "append", "argument": [
                {"particle": {"type": "minecraft:small_flame"}, "probability": 0.004},
                {"particle": {"type": "minecraft:end_rod"}, "probability": 0.0015}]},
            "minecraft:gameplay/natural_mob_spawns": {"modifier": "overlay", "argument": {"spawn_costs": {}, "spawns_by_category": {}}},
        },
        "carvers": [], "features": [],
    })


# ------------------------------------------------------------------ functions

TUNNEL_LEN = 48   # interior z 0..47; the exit trigger is at z >= 44


def functions():
    write(F / "tunnel/build.mcfunction", f"""
# 0.17: the shared rift tunnel, built once (storage flag) in entersift:rift_tunnel along +Z.
# Interior: x -2..2, y 64..68, z 0..{TUNNEL_LEN - 1}. Walls/floor/ceiling glow reddish-gold; bright ribs every 6 blocks.
fill -3 63 -2 3 69 {TUNNEL_LEN + 1} entersift:tunnel_wall
fill -2 64 -1 2 68 {TUNNEL_LEN} minecraft:air
""" + "\n".join(f"fill -3 63 {z} 3 69 {z} entersift:tunnel_rib hollow" for z in range(4, TUNNEL_LEN, 6)) + f"""
fill -2 64 -1 2 68 {TUNNEL_LEN} minecraft:air
data modify storage entersift:tunnel built set value 1b
""")
    write(F / "tunnel/maybe_build.mcfunction", """
# Runs from world/tick until the tunnel exists (the area is forceloaded in load).
execute unless loaded 0 64 0 run return 0
execute unless loaded 0 64 47 run return 0
function entersift:tunnel/build
""")
    write(F / "tunnel/enter.mcfunction", """
# 0.17: step into a rift -> appear at the start of the tunnel, facing +Z. A brief flash hides the
# dimension change (the client shows it while the entersift:rift_transit effect is short).
effect give @s entersift:rift_transit 1 0 true
execute in entersift:rift_tunnel run tp @s 0.5 64 1.5 0 0
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
playsound minecraft:block.respawn_anchor.charge player @s ~ ~ ~ 0.8 0.6
title @s actionbar {"text":"Walk through...","color":"gold"}
""")
    write(F / "tunnel/player_tick.mcfunction", """
# 0.17: every tick while a player is inside the tunnel dimension.
particle minecraft:dust{color:[1.0f,0.66f,0.22f],scale:1.3f} ~ ~1.2 ~5 2 1.8 4 0 5 normal @s
particle minecraft:dust{color:[1.0f,0.25f,0.18f],scale:1.0f} ~ ~1.2 ~5 2 1.8 4 0 3 normal @s
particle minecraft:end_rod ~ ~1.5 ~8 2 1.6 4 0.01 1 normal @s
effect give @s minecraft:speed 1 1 true
execute store result score @s sift.tz run data get entity @s Pos[2]
# Fell out or teleported away inside the dimension: back to the start.
execute unless entity @s[y=60,dy=12] run tp @s 0.5 64 1.5 0 0
execute if score @s sift.tz matches 44.. run function entersift:tunnel/exit
execute if score @s sift.tz matches ..-3 run tp @s 0.5 64 1.5 0 0
""")
    write(F / "tunnel/exit.mcfunction", """
# 0.17: reached the far end -> the destination picked when the rift was entered (sift.dest).
effect give @s entersift:rift_transit 1 0 true
function entersift:travel/transit_go
# Still here (destination not ready, or no saved return point)? Fall back to the Overworld spawn area.
execute at @s if dimension entersift:rift_tunnel if score @s sift.dest matches 5 run scoreboard players set @s sift.dest 0
execute at @s if dimension entersift:rift_tunnel in minecraft:overworld positioned 0 0 0 positioned over motion_blocking_no_leaves run tp @s ~ ~ ~
""")
    write(F / "travel/begin.mcfunction", """
# 0.17 rift travel: no cutscene. The return point is saved HERE, in the dimension the player is
# leaving (the tunnel would otherwise be saved as "home"), then the player walks the rift tunnel.
# dest: 0 overworld, 1 nether, 2 end, 3 sift (rifts), 4 sift (blue portal), 5 return anchor.
execute if score @s sift.transit matches 1.. run return 0
execute if dimension entersift:rift_tunnel run return 0
$scoreboard players set @s sift.dest $(dest)
execute unless score @s sift.dest matches 5 unless score @s sift.return matches 1 run function entersift:travel/save
# Tunnel not built yet (first seconds of a new world): old flash-and-teleport sequence.
execute unless data storage entersift:tunnel {built:1b} run return run function entersift:travel/legacy_begin
function entersift:tunnel/enter
""")
    write(F / "travel/legacy_begin.mcfunction", """
# 0.16 fallback, only used before the tunnel exists: short transition, silent teleport at tick 20.
scoreboard players set @s sift.transit 41
effect give @s entersift:rift_transit 2 0 true
playsound minecraft:block.beacon.power_select player @s ~ ~ ~ 1 1.5
""")
    # Portal: real block sheet.
    write(F / "portal/migrate.mcfunction", """
# 0.17: work out the frame interior (block coordinates) from the marker position and the frame size.
# Marker: x = rimX + w/2 + 0.5 (along X) or z = rimZ + w/2 + 0.5 (along Z); y = rimY + 1. pw = w - 1, sy = h - 1.
execute store result score #mx sift.roll run data get entity @s Pos[0] 2
execute store result score #my sift.roll run data get entity @s Pos[1] 1
execute store result score #mz sift.roll run data get entity @s Pos[2] 2
execute store result score #w sift.roll run data get entity @s data.pw 1
scoreboard players add #w sift.roll 1
execute store result score #h sift.roll run data get entity @s data.sy 1
scoreboard players set #two sift.roll 2
execute store result score #yaw sift.roll run data get entity @s data.yaw 1
execute if score #yaw sift.roll matches 0 run function entersift:portal/migrate_x
execute unless score #yaw sift.roll matches 0 run function entersift:portal/migrate_z
scoreboard players operation #iy1 sift.roll = #my sift.roll
scoreboard players operation #iy1 sift.roll += #h sift.roll
scoreboard players remove #iy1 sift.roll 1
execute store result entity @s data.iy0 int 1 run scoreboard players get #my sift.roll
execute store result entity @s data.iy1 int 1 run scoreboard players get #iy1 sift.roll
execute store result entity @s data.ix0 int 1 run scoreboard players get #ix0 sift.roll
execute store result entity @s data.ix1 int 1 run scoreboard players get #ix1 sift.roll
execute store result entity @s data.iz0 int 1 run scoreboard players get #iz0 sift.roll
execute store result entity @s data.iz1 int 1 run scoreboard players get #iz1 sift.roll
""")
    for axis, other in (("x", "z"), ("z", "x")):
        write(F / f"portal/migrate_{axis}.mcfunction", f"""
# rim{axis.upper()} = (m{axis} - w - 1) / 2 ; interior {axis} = rim+1 .. rim+w-1 ; {other} = (m{other} - 1) / 2
scoreboard players operation #i{axis}0 sift.roll = #m{axis} sift.roll
scoreboard players operation #i{axis}0 sift.roll -= #w sift.roll
scoreboard players remove #i{axis}0 sift.roll 1
scoreboard players operation #i{axis}0 sift.roll /= #two sift.roll
scoreboard players operation #i{axis}1 sift.roll = #i{axis}0 sift.roll
scoreboard players operation #i{axis}1 sift.roll += #w sift.roll
scoreboard players remove #i{axis}1 sift.roll 1
scoreboard players add #i{axis}0 sift.roll 1
scoreboard players operation #i{other}0 sift.roll = #m{other} sift.roll
scoreboard players remove #i{other}0 sift.roll 1
scoreboard players operation #i{other}0 sift.roll /= #two sift.roll
scoreboard players operation #i{other}1 sift.roll = #i{other}0 sift.roll
""")
    write(F / "portal/fill.mcfunction", """
# 0.17: fill the frame with portal blocks (bottom row = glowing base) and retire the old visuals.
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy1) $(iz1) entersift:sift_portal
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy0) $(iz1) entersift:sift_portal_base
kill @e[type=entersift:rift_portal,tag=sift.portal_anchor,distance=..2]
kill @e[type=minecraft:block_display,tag=sift.portal_visual,distance=..12]
kill @e[type=minecraft:block_display,tag=sift.forming,distance=..12]
data modify entity @s data.filled set value 1b
""")
    write(F / "portal/check.mcfunction", """
# 0.17: portal blocks broken (player, explosion, piston...) -> the portal closes.
$execute unless block $(ix1) $(iy1) $(iz1) entersift:sift_portal run return run function entersift:portal/close with entity @s data
$execute unless block $(ix0) $(iy0) $(iz0) entersift:sift_portal_base run return run function entersift:portal/close with entity @s data
$particle minecraft:glow $(gx) $(iy0) $(gz) $(gdx) 0.1 $(gdz) 0 3 normal
$particle minecraft:end_rod $(gx) $(iy0) $(gz) $(gdx) 0.05 $(gdz) 0.01 1 normal
""")
    write(F / "portal/close.mcfunction", """
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy1) $(iz1) minecraft:air replace entersift:sift_portal
$fill $(ix0) $(iy0) $(iz0) $(ix1) $(iy0) $(iz1) minecraft:air replace entersift:sift_portal_base
particle minecraft:glow ~ ~2 ~ 1.5 2 1.5 0.2 60 normal
playsound minecraft:block.glass.break ambient @a[distance=..32] ~ ~ ~ 1.2 0.6
playsound minecraft:block.beacon.deactivate ambient @a[distance=..32] ~ ~ ~ 1 0.8
tellraw @a[distance=..24] {"text":"The portal shatters. The city will have to sing again.","color":"aqua"}
kill @e[type=entersift:rift_portal,tag=sift.portal_anchor,distance=..2]
kill @s
""")
    write(F / "portal/glow_centre.mcfunction", """
# Glow particles along the bottom edge: centre + spread, stored once.
execute store result score #yaw sift.roll run data get entity @s data.yaw 1
execute store result score #gx sift.roll run data get entity @s data.ix0 10
execute store result score #t sift.roll run data get entity @s data.ix1 10
scoreboard players operation #gx sift.roll += #t sift.roll
scoreboard players add #gx sift.roll 10
execute store result entity @s data.gx double 0.05 run scoreboard players get #gx sift.roll
execute store result score #gz sift.roll run data get entity @s data.iz0 10
execute store result score #t sift.roll run data get entity @s data.iz1 10
scoreboard players operation #gz sift.roll += #t sift.roll
scoreboard players add #gz sift.roll 10
execute store result entity @s data.gz double 0.05 run scoreboard players get #gz sift.roll
execute if score #yaw sift.roll matches 0 store result entity @s data.gdx float 0.3 run data get entity @s data.pw 1
execute if score #yaw sift.roll matches 0 run data modify entity @s data.gdz set value 0.05f
execute unless score #yaw sift.roll matches 0 store result entity @s data.gdz float 0.3 run data get entity @s data.pw 1
execute unless score #yaw sift.roll matches 0 run data modify entity @s data.gdx set value 0.05f
""")
    write(F / "portal/tick.mcfunction", """
# 0.17 block portal: compute the interior once (also migrates pre-0.17 markers), fill it, then check it.
execute unless data entity @s data.ix0 run function entersift:portal/migrate
execute unless data entity @s data.gx run function entersift:portal/glow_centre
execute unless data entity @s {data:{filled:1b}} run function entersift:portal/fill with entity @s data
function entersift:portal/cross with entity @s data
function entersift:portal/check with entity @s data
""")


def patch_functions():
    # player/tick: tunnel handling.
    p = F / "player/tick.mcfunction"
    s = p.read_text()
    line = "execute if dimension entersift:rift_tunnel run function entersift:tunnel/player_tick"
    if line not in s:
        s = s.replace("execute if score @s sift.transit matches 1.. run function entersift:travel/transit_tick",
                      "execute if score @s sift.transit matches 1.. run function entersift:travel/transit_tick\n" + line)
        p.write_text(s)
    # load: tunnel objective + forceload.
    p = F / "load.mcfunction"
    s = p.read_text()
    if "sift.tz" not in s:
        s = s.rstrip("\n") + "\n\n# 0.17 rift tunnel\nscoreboard objectives add sift.tz dummy\nexecute in entersift:rift_tunnel run forceload add -16 -16 15 63\n"
        p.write_text(s)
    # world/tick: build the tunnel once.
    p = F / "world/tick.mcfunction"
    s = p.read_text()
    line = "execute unless data storage entersift:tunnel {built:1b} in entersift:rift_tunnel run function entersift:tunnel/maybe_build"
    if line not in s:
        p.write_text(s.rstrip("\n") + "\n# 0.17 rift tunnel (built once)\n" + line + "\n")
    # portal/open: no RiftPortalEntity visual any more; the tick fills the frame with blocks.
    p = F / "portal/open.mcfunction"
    s = p.read_text()
    s = s.replace("function entersift:portal/visual with entity @s data", "function entersift:portal/migrate\nfunction entersift:portal/glow_centre\nfunction entersift:portal/fill with entity @s data")
    p.write_text(s)
    # transit_tick: the legacy fallback starts at 41 so it teleports at 61 (one second).
    # travel/transit_go already resets transit and routes by sift.dest.


def biome_particles():
    bad = {"minecraft:ash", "minecraft:white_ash", "minecraft:white_smoke"}
    for b in sorted((D / "worldgen/biome").glob("*.json")):
        d = json.loads(b.read_text())
        ap = d.get("attributes", {}).get("minecraft:visual/ambient_particles")
        if not ap:
            continue
        keep = [x for x in ap["argument"] if x["particle"]["type"] not in bad]
        if len(keep) != len(ap["argument"]):
            ap["argument"] = keep or [{"particle": {"type": "minecraft:glow"}, "probability": 0.003}]
            dump(b, d)


def main():
    assets()
    tunnel_dimension()
    functions()
    patch_functions()
    biome_particles()
    print("phase17: block portal, rift tunnel dimension + functions, ash particles removed")


if __name__ == "__main__":
    main()
