#!/usr/bin/env python3
"""Phase 4 generator: real entities, new blocks/biomes, staged portal, rift waves, sky textures.

Run AFTER generate_data.py / expansion.py / visual_pass.py / extract_textures.py / creatures.py:
    python3 tools/phase4.py
It only rewrites the files it owns and patches a few generated functions idempotently.
"""
from __future__ import annotations
import json, math, random, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
A = RES / "assets/entersift"
D = RES / "data/entersift"
F = D / "function"


def write(path: Path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(content, str):
        content = json.dumps(content, indent=2) + "\n"
    path.write_text(content)


def patch(path: Path, old: str, new: str):
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"patch anchor missing in {path}: {old[:60]!r}")
    path.write_text(text.replace(old, new))


def append_once(path: Path, line: str):
    text = path.read_text() if path.exists() else ""
    if line not in text:
        path.write_text(text.rstrip("\n") + "\n" + line + "\n")


# --------------------------------------------------------------------------- blocks
CUBES = ["rose_spire", "spire_bricks", "rose_path", "teal_path", "reef_stone", "pale_canopy", "sift_mosaic",
         "rift_pink", "rift_orange", "rift_yellow", "rift_red", "rift_olive"] + [f"threshold_stage_{i}" for i in range(8)]
PLANTS = ["sift_grass", "glow_bulb", "sift_coral_red", "sift_coral_yellow"]
NICE = {"sift_coral_red": "Red Sift Coral", "sift_coral_yellow": "Yellow Sift Coral", "sift_grass": "Sift Grass",
        "glow_bulb": "Glow Bulb", "sift_mosaic": "Sift Mosaic", "pale_canopy": "Pale Canopy", "reef_stone": "Reef Stone"}

EGGS = ["blub", "sculker", "sculkling", "antlerling", "drift_jelly", "licker", "overseer", "twisted_warden", "singer"]
ENTITY_NAMES = {"blub": "Blub", "sculker": "Sculker", "sculkling": "Sculkling", "antlerling": "Antlerling",
                "drift_jelly": "Drift Jelly", "licker": "Licker", "overseer": "Overseer",
                "twisted_warden": "Twisted Warden", "singer": "The Singer"}


def title(name):
    return NICE.get(name) or " ".join(w.capitalize() for w in name.split("_")).replace("Stage ", "Stage ")


def blocks_and_items():
    lang_path = A / "lang/en_us.json"
    lang = json.loads(lang_path.read_text())
    for name in CUBES + PLANTS:
        plant = name in PLANTS
        write(A / f"blockstates/{name}.json", {"variants": {"": {"model": f"entersift:block/{name}"}}})
        if plant:
            write(A / f"models/block/{name}.json", {"parent": "minecraft:block/cross", "textures": {"cross": f"entersift:block/{name}"}})
            write(A / f"models/item/{name}.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"entersift:block/{name}"}})
            write(A / f"items/{name}.json", {"model": {"type": "minecraft:model", "model": f"entersift:item/{name}"}})
        else:
            write(A / f"models/block/{name}.json", {"parent": "minecraft:block/cube_all", "textures": {"all": f"entersift:block/{name}"}})
            write(A / f"items/{name}.json", {"model": {"type": "minecraft:model", "model": f"entersift:block/{name}"}})
        write(D / f"loot_table/blocks/{name}.json", {"type": "minecraft:block", "pools": [{"rolls": 1, "entries": [
            {"type": "minecraft:item", "name": f"entersift:{name}"}], "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
        lang[f"block.entersift.{name}"] = title(name)
    for egg in EGGS:
        write(A / f"models/item/{egg}_spawn_egg.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"entersift:item/{egg}_spawn_egg"}})
        write(A / f"items/{egg}_spawn_egg.json", {"model": {"type": "minecraft:model", "model": f"entersift:item/{egg}_spawn_egg"}})
        lang[f"item.entersift.{egg}_spawn_egg"] = f"{ENTITY_NAMES[egg].replace('The ', '')} Spawn Egg"
        lang[f"entity.entersift.{egg}"] = ENTITY_NAMES[egg]
    for stale in ["models/item/chestmaw_spawn_egg.json", "items/chestmaw_spawn_egg.json", "textures/item/chestmaw_spawn_egg.png"]:
        (A / stale).unlink(missing_ok=True)
    lang.pop("item.entersift.chestmaw_spawn_egg", None)
    write(lang_path, lang)
    pick = D.parent / "minecraft/tags/block/mineable/pickaxe.json"
    tag = json.loads(pick.read_text())
    for name in ["rose_spire", "spire_bricks", "rose_path", "teal_path", "reef_stone"]:
        if f"entersift:{name}" not in tag["values"]:
            tag["values"].append(f"entersift:{name}")
    write(pick, tag)


# --------------------------------------------------------------------------- functions
def creature_functions():
    for kind in EGGS:
        extra = ""
        if kind == "twisted_warden":
            continue
        if kind == "singer":
            extra = ',Invulnerable:1b,Tags:["sift.singer"]'
        write(F / f"creature/{kind}/spawn.mcfunction",
              f"summon entersift:{kind} ~ ~ ~ {{PersistenceRequired:1b{extra}}}\n"
              f"particle minecraft:reverse_portal ~ ~0.8 ~ 0.3 0.5 0.3 0.05 20 normal\n")
    write(F / "creature/twisted_warden/spawn.mcfunction",
          'summon entersift:twisted_warden ~ ~ ~ {Tags:["sift.guardian"],PersistenceRequired:1b,'
          'CustomName:{text:"Twisted Warden",color:"dark_aqua"}}\n'
          'bossbar add entersift:guardian {"text":"Twisted Warden","color":"dark_aqua"}\n'
          'bossbar set entersift:guardian color blue\nbossbar set entersift:guardian style notched_10\n'
          'bossbar set entersift:guardian max 300\nbossbar set entersift:guardian players @a[distance=..48]\n'
          'playsound minecraft:entity.warden.emerge hostile @a[distance=..40] ~ ~ ~ 1 0.6\n'
          'particle minecraft:sculk_soul ~ ~1 ~ 1 1.5 1 0.02 60 normal\n')
    (F / "creature/chestmaw").exists() and [p.unlink() for p in (F / "creature/chestmaw").glob("*")]
    if (F / "creature/chestmaw").exists():
        (F / "creature/chestmaw").rmdir()
    write(F / "blub/spawn.mcfunction", "function entersift:creature/blub/spawn\n")
    write(F / "ritual/singer.mcfunction",
          'summon entersift:singer ~ ~ ~ {PersistenceRequired:1b,Invulnerable:1b,Tags:["sift.singer"],'
          'CustomName:{text:"The Singer",color:"light_purple"}}\n'
          'particle minecraft:end_rod ~ ~1.5 ~ 1 1.5 1 0.05 60 normal\n'
          'playsound minecraft:block.amethyst_block.resonate neutral @a[distance=..48] ~ ~ ~ 2 0.5\n')

    begin = F / "guardian/begin.mcfunction"
    text = begin.read_text().replace("type=minecraft:warden,", "type=entersift:twisted_warden,")
    text = "\n".join(l for l in text.splitlines() if "minecraft:resistance" not in l) + "\n"
    write(begin, text)
    append_once(F / "guardian/slain.mcfunction", "bossbar remove entersift:guardian")

    wt = F / "world/tick.mcfunction"
    append_once(wt, "execute as @e[type=entersift:twisted_warden,tag=sift.guardian,limit=1] store result bossbar entersift:guardian value run data get entity @s Health")
    append_once(wt, "execute as @e[type=entersift:twisted_warden,tag=sift.guardian,limit=1] at @s run bossbar set entersift:guardian players @a[distance=..48]")

    open_ = F / "portal/open.mcfunction"
    patch(open_, "kill @e[type=minecraft:block_display,tag=sift.singer,distance=..6]",
          "kill @e[type=minecraft:block_display,tag=sift.singer,distance=..6]\n"
          "execute as @e[type=entersift:singer,distance=..14] at @s run particle minecraft:end_rod ~ ~1.5 ~ 0.6 1.2 0.6 0.2 80 normal\n"
          "tp @e[type=entersift:singer,distance=..14] ~ -200 ~\nkill @e[type=entersift:singer,distance=..14]")

    # Natural spawn pulse (fallback / supplement to biome spawn lists).
    pulse = F / "world/pulse.mcfunction"
    lines = [l for l in pulse.read_text().splitlines()
             if not any(k in l for k in ("function entersift:blub/spawn", "creature/drift_jelly/spawn", "creature/antlerling/spawn"))]
    table = [("singer_meadow", "blub", "~4 ~ ~4", True), ("singer_meadow", "antlerling", "~6 ~ ~", True),
             ("singer_meadow", "drift_jelly", "~5 ~3 ~", False), ("pale_grove", "drift_jelly", "~-5 ~3 ~", False),
             ("pale_grove", "sculkling", "~5 ~ ~-3", True), ("rose_spires", "licker", "~-8 ~ ~6", True),
             ("tidepool_reef", "drift_jelly", "~4 ~3 ~-4", False), ("tidepool_reef", "sculker", "~-7 ~ ~-7", True),
             ("carapace", "sculker", "~8 ~ ~", True), ("saltwound_expanse", "sculkling", "~0 ~ ~7", True)]
    for biome, kind, off, ground in table:
        cond = " unless block ~ ~-1 ~ minecraft:air" if ground else ""
        lines.append(f"execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:{biome} unless entity "
                     f"@e[type=entersift:{kind},distance=..48] positioned {off} if block ~ ~ ~ minecraft:air{cond} "
                     f"run function entersift:creature/{kind}/spawn")
    write(pulse, "\n".join(lines) + "\n")

    kit = F / "dev/kit.mcfunction"
    text = kit.read_text().replace("give @s entersift:chestmaw_spawn_egg\n", "")
    write(kit, text)
    for egg in EGGS:
        append_once(kit, f"give @s entersift:{egg}_spawn_egg")


def portal_functions():
    # Panels start as a bare rim and pixelate inward through eight threshold stages.
    form = F / "portal/form.mcfunction"
    write(form, form.read_text().replace('Name:\\"entersift:threshold\\"', 'Name:\\"entersift:threshold_stage_0\\"')
          .replace('Name:"entersift:threshold"', 'Name:"entersift:threshold_stage_0"'))
    for k in range(8):
        path = F / f"portal/assemble_{k}.mcfunction"
        append_once(path, f"execute as @e[type=minecraft:block_display,tag=sift.forming,distance=..1] run data merge entity @s "
                          f"{{block_state:{{Name:\"entersift:threshold_stage_{k}\"}}}}")
        append_once(path, f"playsound minecraft:block.amethyst_block.chime ambient @a[distance=..32] ~ ~ ~ 1.5 {0.5 + k * 0.1:.1f}")
    rt = F / "ritual/tick.mcfunction"
    append_once(rt, "execute if score @s sift.age matches 240..349 run particle minecraft:electric_spark ~ ~2 ~ 1.6 2 0.3 0.4 10 normal")
    append_once(rt, "execute if score @s sift.age matches 240..349 run particle minecraft:end_rod ~ ~2 ~ 1.4 2 0.2 0.02 4 normal")
    append_once(rt, "execute if score @s sift.age matches 240 run playsound minecraft:block.beacon.activate ambient @a[distance=..48] ~ ~ ~ 2 0.6")
    append_once(F / "portal/tick.mcfunction", "execute if predicate {condition:\"minecraft:random_chance\",chance:0.15} run particle minecraft:electric_spark ~ ~2 ~ 1.5 2 0.1 0.3 4 normal")
    # Beacon-like note beams: tall, thicker, longer-lived.
    for beam in (F / "notes").glob("beam_*.mcfunction"):
        text = beam.read_text().replace("~0.48 ~1 ~0.48", "~0.42 ~1 ~0.42").replace("scale:[0.04f,9.0f,0.04f]", "scale:[0.16f,40.0f,0.16f]")
        write(beam, text)
    write(F / "world/tick.mcfunction", (F / "world/tick.mcfunction").read_text().replace("sift.age=80..", "sift.age=160.."))


def rift_functions():
    # Every 5 minutes (half a 12000-tick cycle) the veil thins: a wave of rifts opens near players in
    # every dimension, then they all seal at tick 6000 and reappear at the next wave.
    write(F / "rift/wave_player.mcfunction",
          "execute store result score #chance sift.roll run random value 0..2\n"
          "title @s actionbar {\"text\":\"The veil thins… rifts bleed through.\",\"color\":\"light_purple\"}\n"
          "playsound minecraft:block.respawn_anchor.charge ambient @s ~ ~ ~ 0.6 0.5\n"
          "execute if score #chance sift.roll matches 0..1 positioned ~12 ~ ~6 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural\n"
          "execute if score #chance sift.roll matches 0 positioned ~-10 ~ ~-12 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/natural\n")
    tick = F / "tick.mcfunction"
    append_once(tick, "execute if score #riftcycle sift.clock matches 20 as @a[gamemode=!spectator] at @s run function entersift:rift/wave_player")
    append_once(tick, "execute if score #riftcycle sift.clock matches 6000 run title @a actionbar {\"text\":\"The rifts seal… for now.\",\"color\":\"dark_purple\"}")
    # More rift looks: a random rim palette, independent of the destination membrane.
    style = F / "rift/style.mcfunction"
    append_once(style, "execute store result score #look sift.roll run random value 0..5")
    for i, block in enumerate(["rift_pink", "rift_orange", "rift_yellow", "rift_red", "rift_olive", "rift_edge"]):
        append_once(style, f"execute if score #look sift.roll matches {i} as @e[type=minecraft:block_display,tag=sift.rift_visual,tag=!sift.membrane,distance=..4] "
                           f"run data merge entity @s {{block_state:{{Name:\"entersift:{block}\"}}}}")
    append_once(F / "rift/tick.mcfunction", "execute if predicate {condition:\"minecraft:random_chance\",chance:0.2} run particle minecraft:electric_spark ~ ~1.5 ~ 1 1.3 0.2 0.3 3 normal")


# --------------------------------------------------------------------------- biomes
def overlay(points):
    return {"type": "minecraft:overlay", "features": [
        {"feature": {"type": "minecraft:simple_block", "to_place": {"id": f"entersift:{b}"}},
         "placement": [{"type": "minecraft:offset", "x": x, "y": y, "z": z},
                       {"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:air"}}]}
        for (x, y, z, b) in points]}


def placed(feature, placement_head):
    return {"feature": f"entersift:{feature}", "placement": placement_head + [
        {"type": "minecraft:in_square"}, {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"}, {"type": "minecraft:biome"}]}


def features():
    rng = random.Random(4)
    # Rose spire: tapering mesa pillar with a brick band, like the pink spires in the refs.
    pts = []
    for y in range(12):
        r = 2 if y < 4 else (1 if y < 9 else 0)
        for x in range(-r, r + 1):
            for z in range(-r, r + 1):
                if abs(x) + abs(z) <= r + (1 if y < 4 else 0):
                    pts.append((x, y, z, "spire_bricks" if y in (4, 5) else "rose_spire"))
    write(D / "worldgen/feature/rose_spire.json", overlay(pts))
    # Rose arch: two legs and a curved lintel.
    pts = []
    for y in range(7):
        for x in (-4, 4):
            pts += [(x, y, 0, "rose_spire"), (x, y, 1, "rose_spire")]
    for x in range(-4, 5):
        yy = 7 + (1 if abs(x) < 3 else 0)
        pts += [(x, yy, 0, "spire_bricks"), (x, yy, 1, "spire_bricks")]
    write(D / "worldgen/feature/rose_arch.json", overlay(pts))
    # Pale weeping tree: trunk of spire bricks? no — carapace trunk with drooping pale canopy strands.
    pts = [(0, y, 0, "soulwood") for y in range(6)]
    for x in range(-3, 4):
        for z in range(-3, 4):
            if x * x + z * z <= 10:
                pts.append((x, 6, z, "pale_canopy"))
                if x * x + z * z >= 5 and rng.random() < 0.7:
                    for d in range(1, 2 + rng.randint(0, 3)):
                        pts.append((x, 6 - d, z, "pale_canopy"))
            if x * x + z * z <= 4:
                pts.append((x, 7, z, "pale_canopy"))
    write(D / "worldgen/feature/pale_tree.json", overlay(pts))
    # Reef boulder.
    pts = [(x, y, z, "reef_stone") for x in range(-2, 3) for y in range(0, 3) for z in range(-2, 3) if x * x + (y * 1.6) ** 2 + z * z <= 5]
    pts += [(0, 3, 0, "sift_coral_red"), (1, 2, 1, "sift_coral_yellow")]
    write(D / "worldgen/feature/reef_boulder.json", overlay(pts))
    for plant in PLANTS:
        write(D / f"worldgen/feature/{plant}.json", {"type": "minecraft:simple_block", "to_place": {"id": f"entersift:{plant}"}})

    counts = {"sift_grass": 28, "glow_bulb": 5, "sift_coral_red": 14, "sift_coral_yellow": 12}
    for plant, n in counts.items():
        write(D / f"worldgen/placed_feature/{plant}.json", placed(plant, [{"type": "minecraft:count", "count": n}]))
    write(D / "worldgen/placed_feature/rose_spire.json", placed("rose_spire", [{"type": "minecraft:rarity_filter", "chance": 2}]))
    write(D / "worldgen/placed_feature/rose_arch.json", placed("rose_arch", [{"type": "minecraft:rarity_filter", "chance": 9}]))
    write(D / "worldgen/placed_feature/pale_tree.json", placed("pale_tree", [{"type": "minecraft:rarity_filter", "chance": 2}]))
    write(D / "worldgen/placed_feature/reef_boulder.json", placed("reef_boulder", [{"type": "minecraft:rarity_filter", "chance": 3}]))


BIOMES = {
    "rose_spires": dict(water="#d98aa6", fog="#c99aa9", sky="#e7b3c3", particle="minecraft:cherry_leaves", prob=0.004,
                        floor="rose_path", feats=["entersift:rose_spire", "entersift:rose_arch", "entersift:sift_coral_red", "entersift:sift_grass"]),
    "pale_grove": dict(water="#7ad6cf", fog="#8fc4c2", sky="#a6dde0", particle="minecraft:white_ash", prob=0.01,
                       floor="teal_path", feats=["entersift:pale_tree", "entersift:sift_grass", "entersift:glow_bulb"]),
    "tidepool_reef": dict(water="#2fd2c4", fog="#4fa7a5", sky="#6cc7c9", particle="minecraft:glow", prob=0.002,
                          floor="reef_stone", feats=["entersift:reef_boulder", "entersift:sift_coral_red", "entersift:sift_coral_yellow",
                                                     "entersift:crystals", "entersift:glow_bulb"]),
}


def biomes():
    template = json.loads((D / "worldgen/biome/singer_meadow.json").read_text())
    for name, b in BIOMES.items():
        data = json.loads(json.dumps(template))
        data["effects"]["water_color"] = b["water"]
        data["attributes"]["minecraft:visual/fog_color"] = b["fog"]
        data["attributes"]["minecraft:visual/sky_color"] = b["sky"]
        data["attributes"]["minecraft:visual/ambient_particles"]["argument"] = [{"particle": {"type": b["particle"]}, "probability": b["prob"]}]
        data["features"] = [[] for _ in range(11)]
        data["features"][9] = b["feats"]
        write(D / f"worldgen/biome/{name}.json", data)
    # Existing biomes pick up the new ground cover too.
    for name, extra in {"singer_meadow": ["entersift:sift_grass", "entersift:glow_bulb"], "saltwound_expanse": ["entersift:sift_coral_yellow"]}.items():
        p = D / f"worldgen/biome/{name}.json"
        data = json.loads(p.read_text())
        for f in extra:
            if f not in data["features"][9]:
                data["features"][9].append(f)
        write(p, data)

    rule_path = D / "worldgen/material_rule/the_sift.json"
    rule = json.loads(rule_path.read_text())
    seq = rule["sequence"]
    have = {json.dumps(s) for s in seq}
    default_idx = next(i for i, s in enumerate(seq) if isinstance(s, dict) and s.get("type") == "minecraft:condition"
                       and s.get("if_true") == "minecraft:on_floor")
    for name, b in BIOMES.items():
        cond = {"type": "minecraft:condition", "if_true": {"type": "minecraft:biome", "biome_is": f"entersift:{name}"},
                "then_run": {"type": "minecraft:condition", "if_true": "minecraft:on_floor",
                             "then_run": {"type": "minecraft:block", "result_state": f"entersift:{b['floor']}"}}}
        if json.dumps(cond) not in have:
            seq.insert(default_idx, cond)
            default_idx += 1
    write(rule_path, rule)

    dim_path = D / "dimension/the_sift.json"
    dim = json.loads(dim_path.read_text())
    lst = dim["generator"]["biome_source"]["biomes"]
    for name in ["rose_spires", "pale_grove", "tidepool_reef"]:
        full = name if ":" in name else f"entersift:{name}"
        if full not in lst:
            lst.append(full)
    dim["generator"]["biome_source"]["scale"] = 4
    write(dim_path, dim)


# --------------------------------------------------------------------------- sky textures (vanilla layer)
def sky_textures():
    env = A / "textures/environment"
    env.mkdir(parents=True, exist_ok=True)
    # Shard: glowing outlined rectangle with a soft translucent fill (refs: outlined aurora panes).
    s = 64
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([2, 2, s - 3, s - 3], fill=(255, 255, 255, 70))
    d.rectangle([2, 2, s - 3, s - 3], outline=(255, 255, 255, 255), width=3)
    glow = img.filter(ImageFilter.GaussianBlur(2.5))
    out = Image.alpha_composite(glow, img)
    out.save(env / "sky_shard.png")
    # Portal: cyan pixel mosaic with a white jagged rim, like the threshold reference.
    rng = random.Random(9)
    w, h = 40, 24
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            edge = min(x, y, w - 1 - x, h - 1 - y)
            if edge == 0 or (edge == 1 and rng.random() < 0.5):
                px[x, y] = (240, 255, 255, 255)
            else:
                t = rng.random()
                base = (40 + int(60 * t), 200 + int(55 * t), 230 + int(25 * t))
                if rng.random() < 0.06:
                    base = (255, 170, 220)
                px[x, y] = (*base, 235)
    img.resize((w * 4, h * 4), Image.NEAREST).save(env / "sky_portal.png")


def main():
    blocks_and_items()
    creature_functions()
    portal_functions()
    rift_functions()
    features()
    biomes()
    sky_textures()
    print("phase4: done")


if __name__ == "__main__":
    main()
