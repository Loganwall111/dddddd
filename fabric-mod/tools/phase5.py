#!/usr/bin/env python3
"""Phase 5 generator: survival integration.

  * Loot tables for all nine Sift creatures (the Twisted Warden drops the Rift Gauntlet).
  * Crafting / stonecutting recipes for every Phase 4 block.
  * An "Enter the Sift" advancement tab that walks the player through the whole journey.
Run after tools/phase4.py:  python3 tools/phase5.py
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
A = RES / "assets/entersift"
D = RES / "data/entersift"


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


# --------------------------------------------------------------------------- loot
def entry(item, lo=1, hi=1, chance=None, looting=True):
    e = {"type": "minecraft:item", "name": item, "functions": []}
    if (lo, hi) != (1, 1):
        e["functions"].append({"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}})
    if looting:
        e["functions"].append({"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
                               "count": {"type": "minecraft:uniform", "min": 0, "max": 1}})
    if not e["functions"]:
        del e["functions"]
    pool = {"rolls": 1, "entries": [e]}
    if chance is not None:
        pool["conditions"] = [{"condition": "minecraft:random_chance", "chance": chance}]
    return pool


LOOT = {
    "blub": [entry("minecraft:slime_ball", 0, 2), entry("entersift:blub_jelly", chance=0.2, looting=False)],
    "sculker": [entry("minecraft:sculk", 1, 3), entry("minecraft:echo_shard", chance=0.12, looting=False)],
    "sculkling": [entry("minecraft:sculk_vein", 0, 2), entry("entersift:glow_bulb", chance=0.25, looting=False)],
    "antlerling": [entry("minecraft:bone", 0, 2), entry("entersift:sift_grass", 1, 2, looting=False)],
    "drift_jelly": [entry("minecraft:glow_ink_sac", 1, 2), entry("minecraft:prismarine_crystals", 0, 1)],
    "licker": [entry("minecraft:slime_ball", 0, 1), entry("entersift:sift_coral_red", 1, 2, looting=False)],
    "overseer": [entry("minecraft:echo_shard", 1, 2), entry("minecraft:ender_pearl", 0, 1),
                 entry("entersift:soul_potion", chance=0.35, looting=False)],
    "twisted_warden": [entry("minecraft:echo_shard", 4, 8), entry("minecraft:sculk_catalyst", looting=False),
                       entry("entersift:rift_gauntlet", looting=False), entry("entersift:soul_lantern_stone", 2, 4)],
    "singer": [],
}


def loot():
    for kind, pools in LOOT.items():
        write(D / f"loot_table/entities/{kind}.json", {"type": "minecraft:entity", "pools": pools})


# --------------------------------------------------------------------------- recipes
def shaped(name, pattern, key, result, count=1):
    write(D / f"recipe/{name}.json", {"type": "minecraft:crafting_shaped", "pattern": pattern, "key": key,
                                      "result": {"id": result, "count": count}})


def shapeless(name, ingredients, result, count=1):
    write(D / f"recipe/{name}.json", {"type": "minecraft:crafting_shapeless", "ingredients": ingredients,
                                      "result": {"id": result, "count": count}})


def stonecut(name, ingredient, result, count=1):
    write(D / f"recipe/{name}.json", {"type": "minecraft:stonecutting", "ingredient": ingredient,
                                      "result": {"id": result, "count": count}})


def recipes():
    shaped("spire_bricks", ["RR", "RR"], {"R": "entersift:rose_spire"}, "entersift:spire_bricks", 4)
    stonecut("spire_bricks_from_rose_spire_stonecutting", "entersift:rose_spire", "entersift:spire_bricks")
    stonecut("rose_path_from_rose_spire_stonecutting", "entersift:rose_spire", "entersift:rose_path")
    shapeless("rose_spire", ["minecraft:terracotta", "minecraft:pink_dye", "entersift:salt"], "entersift:rose_spire", 2)
    shapeless("teal_path", ["entersift:singer_moss", "minecraft:gravel"], "entersift:teal_path", 2)
    shapeless("reef_stone", ["minecraft:tuff", "minecraft:prismarine_shard"], "entersift:reef_stone", 2)
    shapeless("pale_canopy", ["entersift:soul_canopy", "minecraft:white_dye"], "entersift:pale_canopy")
    shapeless("sift_mosaic", ["minecraft:glass", "minecraft:amethyst_shard", "minecraft:prismarine_crystals"], "entersift:sift_mosaic", 2)
    shapeless("glow_bulb", ["entersift:sift_grass", "minecraft:glow_berries"], "entersift:glow_bulb")
    shapeless("sift_coral_yellow", ["entersift:sift_coral_red", "minecraft:yellow_dye"], "entersift:sift_coral_yellow")
    for block, dye in {"rift_pink": "pink", "rift_orange": "orange", "rift_yellow": "yellow",
                       "rift_red": "red", "rift_olive": "green"}.items():
        shapeless(block, ["entersift:rift_membrane", f"minecraft:{dye}_dye"], f"entersift:{block}")


# --------------------------------------------------------------------------- advancements
ADV = D / "advancement"


def adv(name, parent, icon, title, desc, criteria, frame="task", hidden=False, reward_xp=0, background=None):
    display = {"icon": {"id": icon}, "title": {"text": title}, "description": {"text": desc}, "frame": frame,
               "show_toast": True, "announce_to_chat": True, "hidden": hidden}
    if background:
        display["background"] = background
        display["show_toast"] = False
        display["announce_to_chat"] = False
    data = {"display": display, "criteria": criteria, "requirements": [[k] for k in criteria] if len(criteria) > 1 and name == "cartographer" else [list(criteria)]}
    if parent:
        data["parent"] = f"entersift:{parent}"
    if reward_xp:
        data["rewards"] = {"experience": reward_xp}
    write(ADV / f"{name}.json", data)


def has_item(item):
    return {"trigger": "minecraft:inventory_changed", "conditions": {"items": [{"items": item}]}}


def killed(kind):
    # 26.3: "entity" must be a single entity predicate object (a list of loot conditions fails to parse).
    return {"trigger": "minecraft:player_killed_entity", "conditions": {"entity": {"type": f"entersift:{kind}"}}}


def in_biome(biome):
    return {"trigger": "minecraft:location", "conditions": {"player":
        {"type": "minecraft:entity_properties", "entity": "this", "predicate": {"minecraft:location": {"biomes": f"entersift:{biome}"}}}}}


def advancements():
    adv("root", None, "entersift:sonorous_deepslate", "Enter the Sift",
        "Craft Sonorous Deepslate: stone that remembers a song", {"deepslate": has_item("entersift:sonorous_deepslate")},
        background="minecraft:gui/advancements/backgrounds/stone")
    adv("guardian", "root", "entersift:twisted_warden_spawn_egg", "Twisted Guardian",
        "Defeat the Twisted Warden that guards the ancient city's threshold", {"kill": killed("twisted_warden")},
        frame="challenge", reward_xp=200)
    adv("enter", "guardian", "entersift:threshold_stage_7", "Beyond the Threshold",
        "Sing the eight notes, open the portal and step into the Sift",
        {"enter": {"trigger": "minecraft:changed_dimension", "conditions": {"to": "entersift:the_sift"}}}, frame="goal", reward_xp=100)
    adv("cartographer", "enter", "entersift:rose_spire", "Sift Cartographer", "Visit every biome of the Sift",
        {b: in_biome(b) for b in ["carapace", "singer_meadow", "saltwound_expanse", "rose_spires", "pale_grove", "tidepool_reef"]},
        frame="challenge", reward_xp=150)
    blub = {"blub": killed("blub")}
    adv("blub", "enter", "entersift:blub_spawn_egg", "Blub?", "Meet a Blub... the hard way", blub, hidden=True)
    adv("overseer", "enter", "entersift:overseer_spawn_egg", "Close Your Eyes", "Defeat an Overseer", {"kill": killed("overseer")}, frame="goal")
    adv("gauntlet", "guardian", "entersift:rift_gauntlet", "Tear the Veil", "Obtain a Rift Gauntlet",
        {"gauntlet": has_item("entersift:rift_gauntlet")})
    adv("red_gauntlet", "gauntlet", "entersift:red_rift_gauntlet", "Red Handed", "Dye your Rift Gauntlet red",
        {"red": has_item("entersift:red_rift_gauntlet")})
    adv("ichor", "enter", "entersift:ichor_bucket", "Liquid Light", "Collect a bucket of Ichor", {"ichor": has_item("entersift:ichor_bucket")})


def main():
    loot()
    recipes()
    advancements()
    print("phase5: done")


if __name__ == "__main__":
    main()
