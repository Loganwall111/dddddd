#!/usr/bin/env python3
"""Beyond Minecraft's deterministic authoring compiler. Python 3.11+, standard library only.

Possible seeds are effectively unbounded; a built mod deliberately registers 1..32 realms.
It does NOT run in Minecraft, mutate live registries, copy copyrighted textures, or execute
untrusted scripts. Its manifest allows --check to detect stale/missing/extra generated files.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEED = 84921603
DEFAULT_REALMS = 8
THEMES = [
    ("Lucent Canopy", (38, 117, 86), (116, 240, 192), 0x122238, 0x78CCA1),
    ("The Violet Fold", (68, 43, 111), (200, 125, 255), 0x1C123D, 0xAF83FF),
    ("Cinder Cathedral", (92, 37, 31), (255, 136, 52), 0x2A111C, 0xDB7752),
    ("Boreal Memory", (80, 112, 143), (142, 227, 255), 0x172C49, 0x99D8ED),
    ("Rose Continuum", (123, 65, 117), (255, 171, 221), 0x30243D, 0xF29BDA),
    ("Pelagic Dream", (25, 75, 108), (60, 214, 237), 0x081C30, 0x4DB5D7),
    ("Obsidian Hymn", (44, 43, 64), (144, 253, 230), 0x101020, 0xB0DFD3),
    ("The Ochre Archive", (123, 106, 58), (255, 231, 155), 0x312B28, 0xD4C097),
]


def png(width, height, rgba):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\0" + bytes(rgba[y * width * 4:(y + 1) * width * 4]) for y in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def texture(seed, base, glow, kind):
    rng = random.Random(seed)
    frames = 4 if kind == "crystal" else 1
    pixels = []
    noise = [rng.uniform(-1, 1) for _ in range(256)]
    for frame in range(frames):
        for y in range(16):
            for x in range(16):
                grain = noise[y * 16 + x]
                vein = abs(math.sin(x * .42 + math.sin(y * .68) * 1.6)) < .20
                bevel = .80 if x in (0, 15) or y in (0, 15) else 1.0
                if kind == "crystal":
                    pulse = .62 + .20 * math.sin(frame * math.pi / 2 + (x + y) * .28)
                    color = [c * (pulse if vein else .25 + grain * .06) * bevel for c in glow]
                elif kind == "surface":
                    color = [(base[i] * .7 + glow[i] * .3) * (1 + grain * .22) for i in range(3)]
                else:
                    color = [base[i] * (1 + grain * .25) + (glow[i] * .20 if vein else 0) for i in range(3)]
                pixels.extend([min(255, max(0, round(c))) for c in color] + [255])
    return png(16, 16 * frames, pixels)


def icon(kind, size=32):
    pixels = []
    for y in range(size):
        for x in range(size):
            u, v = (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1
            color = (0, 0, 0, 0)
            if kind == "reality_knife":
                blade = abs(u + v + .22) < .19 and -.77 < v < .19
                handle = abs(u + v + .2) < .23 and .15 < v < .73
                if blade: color = (166, 247, 248, 255) if u + v < -.22 else (111, 63, 204, 255)
                if handle: color = (52, 37, 77, 255)
                if abs(v - .19) < .08 and abs(u) < .4: color = (226, 181, 101, 255)
            elif kind == "radiate_reality_glasses":
                lens = abs(abs(u) - .37) < .28 and abs(v) < .28
                frame = abs(abs(u) - .37) < .34 and abs(v) < .36
                bridge = abs(u) < .15 and abs(v) < .08
                if frame or bridge: color = (213, 179, 104, 255)
                if lens: color = (69 + int(70 * (1 - abs(v))), 177, 205, 230)
            elif kind == "field_guide":
                if abs(u) < .61 and abs(v) < .79: color = (22, 42, 51, 255)
                if -.59 < u < -.46 and abs(v) < .79: color = (181, 142, 78, 255)
                if .15 < abs(v) < .20 and abs(u) < .30: color = (113, 219, 217, 255)
                if abs(math.hypot(u - .07, v) - .30) < .055: color = (228, 193, 126, 255)
                if math.hypot(u - .07, v) < .09: color = (211, 251, 238, 255)
            else:
                shape = abs(u) * .8 + abs(v) < .77
                cut = abs(u + .15 * math.sin(v * 8)) < .085
                if shape:
                    color = (180, 138, 245, 255) if u < 0 else (73, 222, 225, 255)
                    if kind == "shattered_relic" and cut: color = (19, 17, 33, 255)
                    if abs(v) < .05 or abs(u) < .05: color = (235, 234, 255, 255)
            pixels.extend(color)
    return png(size, size, pixels)


def density(kind, **args):
    return {"type": "minecraft:" + kind, **args}


def generate(seed=DEFAULT_SEED, count=DEFAULT_REALMS):
    if not 1 <= count <= 32:
        raise ValueError("Realm count must be 1..32; live registry growth is deliberately forbidden")
    rng = random.Random(seed)
    files = {}
    def put(path, value):
        files[path] = value if isinstance(value, bytes) else (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
    lang = {
        "itemGroup.beyond": "Beyond Minecraft",
        "key.category.beyond": "Beyond Minecraft",
        "key.beyond.guide": "Open the Field Guide",
        "key.beyond.mandela": "Cycle Mandela lens",
        "key.beyond.panic": "Toggle all Beyond visual effects",
        "item.beyond.reality_knife": "Reality Knife",
        "item.beyond.shattered_relic": "Shattered Relic",
        "item.beyond.radiate_reality_glasses": "Radiate Reality Glasses",
        "item.beyond.field_guide": "The Beyond Field Guide",
        "item.beyond.scale_prism": "Scale Prism",
    }
    catalog = {"schema": 1, "seed": seed, "realms": []}
    dirt, pickaxe, crystals = [], [], []
    template = json.loads((ROOT / "tools/templates/end-1.21.1.json").read_text())
    for i in range(count):
        key = f"realm_{i:02}"
        theme = i % len(THEMES)
        name, base, glow, sky, fog = THEMES[theme]
        if i >= len(THEMES): name += f" / Echo {i // len(THEMES) + 1}"
        realm_seed = rng.randrange(1, 1 << 23)  # exactly representable in a float shader uniform
        blocks = [f"{key}_{kind}" for kind in ("stratum", "surface", "crystal")]
        catalog["realms"].append({"id": key, "name": name, "theme": theme, "color": fog,
                                  "seed": realm_seed, "blocks": blocks})
        for kind, block in zip(("stratum", "surface", "crystal"), blocks):
            put(f"assets/beyond/textures/block/{block}.png", texture(realm_seed, base, glow, kind))
            if kind == "crystal":
                put(f"assets/beyond/textures/block/{block}.png.mcmeta", {"animation": {"frametime": 8, "interpolate": True}})
            put(f"assets/beyond/blockstates/{block}.json", {"variants": {"": {"model": f"beyond:block/{block}"}}})
            put(f"assets/beyond/models/block/{block}.json", {"parent": "minecraft:block/cube_all", "textures": {"all": f"beyond:block/{block}"}})
            put(f"assets/beyond/models/item/{block}.json", {"parent": f"beyond:block/{block}"})
            put(f"data/beyond/loot_table/blocks/{block}.json", {
                "type": "minecraft:block", "pools": [{"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"beyond:{block}"}],
                "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
            lang[f"block.beyond.{block}"] = name + " " + kind.title()
            pickaxe.append(f"beyond:{block}")
        dirt.append(f"beyond:{blocks[1]}")
        crystals.append(f"beyond:{blocks[2]}")
        echo = f"{key}_echo"
        lang[f"item.beyond.{echo}"] = name + " Echo"
        put(f"assets/beyond/textures/item/{echo}.png", texture(realm_seed ^ 9741, base, glow, "surface"))
        put(f"assets/beyond/models/item/{echo}.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"beyond:item/{echo}"}})
        put(f"data/beyond/recipe/{echo}.json", {"type": "minecraft:crafting_shapeless", "ingredients": [{"item": f"beyond:{blocks[2]}"}], "result": {"id": f"beyond:{echo}", "count": 4}})
        put(f"data/beyond/recipe/{key}_crystal.json", {"type": "minecraft:crafting_shaped", "pattern": ["EE", "EE"],
            "key": {"E": {"item": f"beyond:{echo}"}}, "result": {"id": f"beyond:{blocks[2]}"}})
        settings = copy.deepcopy(template)
        settings.update(default_block={"Name": f"beyond:{blocks[0]}"}, legacy_random_source=False)
        settings["noise"] = {"min_y": -64, "height": 384, "size_horizontal": 1, "size_vertical": 2}
        height = density("y_clamped_gradient", from_y=-40 + theme * 3, to_y=216 - theme * 2, from_value=-1.5, to_value=1.5)
        terrain = density("noise", noise=f"beyond:{key}_terrain", xz_scale=.65 + theme * .065, y_scale=1.15 + theme * .06)
        final = density("add", argument1=density("mul", argument1=1.4, argument2=terrain),
            argument2=density("add", argument1=-.06, argument2=density("mul", argument1=-1.0, argument2=density("abs", argument=height))))
        settings["noise_router"] = {k: 0.0 for k in settings["noise_router"]}
        settings["noise_router"].update(final_density=density("squeeze", argument=density("interpolated", argument=final)),
                                        initial_density_without_jaggedness=final)
        settings["surface_rule"] = {"type": "minecraft:sequence", "sequence": [
            {"type": "minecraft:condition", "if_true": {"type": "minecraft:stone_depth", "offset": 0,
                "add_surface_depth": False, "secondary_depth_range": 0, "surface_type": "floor"},
             "then_run": {"type": "minecraft:block", "result_state": {"Name": f"beyond:{blocks[1]}"}}},
            {"type": "minecraft:block", "result_state": {"Name": f"beyond:{blocks[0]}"}}]}
        put(f"data/beyond/worldgen/noise_settings/{key}.json", settings)
        put(f"data/beyond/worldgen/noise/{key}_terrain.json", {"firstOctave": -6 - i % 2,
            "amplitudes": [1.0, round(rng.uniform(.6, 1.2), 4), .45, .18]})
        features = [[] for _ in range(11)]
        features[4] = [f"beyond:{key}_pillars"]
        if theme in (0, 4): features[9] = ["minecraft:trees_plains"]
        put(f"data/beyond/worldgen/biome/{key}.json", {
            "has_precipitation": False, "temperature": .6, "downfall": 0.0,
            "effects": {"sky_color": sky, "fog_color": fog, "water_color": 0x2A899C, "water_fog_color": 0x133745,
                        "grass_color": fog, "foliage_color": fog},
            "spawners": {}, "spawn_costs": {}, "carvers": {}, "features": features})
        put(f"data/beyond/worldgen/configured_feature/{key}_pillars.json", {
            "type": "minecraft:block_column", "config": {
                "layers": [{"height": {"type": "minecraft:uniform", "min_inclusive": 3, "max_inclusive": 18 + theme},
                            "provider": {"type": "minecraft:simple_state_provider", "state": {"Name": f"beyond:{blocks[2]}"}}}],
                "direction": "up", "allowed_placement": {"type": "minecraft:matching_blocks", "blocks": ["minecraft:air"]},
                "prioritize_tip": False}})
        put(f"data/beyond/worldgen/placed_feature/{key}_pillars.json", {"feature": f"beyond:{key}_pillars", "placement": [
            {"type": "minecraft:count", "count": 7}, {"type": "minecraft:in_square"},
            {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"}, {"type": "minecraft:biome"}]})
        put(f"data/beyond/dimension/{key}.json", {"type": "beyond:membrane", "generator": {"type": "minecraft:noise",
            "biome_source": {"type": "minecraft:fixed", "biome": f"beyond:{key}"}, "settings": f"beyond:{key}"}})
    put("data/beyond/dimension_type/membrane.json", {
        "ultrawarm": False, "natural": False, "piglin_safe": False, "respawn_anchor_works": False,
        "bed_works": False, "has_raids": False, "has_skylight": True, "has_ceiling": False,
        "coordinate_scale": 1.0, "ambient_light": .22, "logical_height": 384, "min_y": -64, "height": 384,
        "infiniburn": "#minecraft:infiniburn_overworld", "effects": "minecraft:overworld", "fixed_time": 6000,
        "monster_spawn_block_light_limit": 0, "monster_spawn_light_level": 0})
    for tag, values in (("dirt", dirt), ("mineable/pickaxe", pickaxe)):
        put(f"data/minecraft/tags/block/{tag}.json", {"replace": False, "values": values})
    put("data/beyond/tags/item/realm_crystals.json", {"replace": False, "values": crystals})
    ingredients = {
        "reality_knife": ["minecraft:iron_sword", "minecraft:echo_shard", "minecraft:ender_pearl"],
        "shattered_relic": ["minecraft:echo_shard", "minecraft:ender_eye", "minecraft:amethyst_shard"],
        "radiate_reality_glasses": ["minecraft:spyglass", "minecraft:ender_eye", "minecraft:gold_ingot"],
        "field_guide": ["minecraft:book", "minecraft:amethyst_shard"],
        "scale_prism": ["minecraft:amethyst_shard", "minecraft:clock", "minecraft:ender_pearl"],
    }
    for item, recipe in ingredients.items():
        put(f"assets/beyond/textures/item/{item}.png", icon(item))
        put(f"assets/beyond/models/item/{item}.json", {"parent": "minecraft:item/handheld" if item == "reality_knife" else "minecraft:item/generated", "textures": {"layer0": f"beyond:item/{item}"}})
        put(f"data/beyond/recipe/{item}.json", {"type": "minecraft:crafting_shapeless", "ingredients": [{"item": r} for r in recipe], "result": {"id": f"beyond:{item}"}})
    armor = [0] * (64 * 32 * 4)
    for y in range(11, 14):
        for x in range(0, 32):
            lens = 8 <= x < 11 or 13 <= x < 16
            color = (105, 213, 233, 190) if lens and y == 12 else (203, 172, 103, 255)
            armor[(y * 64 + x) * 4:(y * 64 + x + 1) * 4] = color
    put("assets/beyond/textures/models/armor/radiate_layer_1.png", png(64, 32, armor))
    put("assets/beyond/textures/models/armor/radiate_layer_2.png", png(64, 32, [0] * (64 * 32 * 4)))
    put("assets/beyond/icon.png", icon("shattered_relic", 128))
    put("assets/beyond/catalog.json", catalog)
    put("assets/beyond/lang/en_us.json", lang)
    manifest = {"schema": 1, "seed": seed, "realms": count, "files": {k: hashlib.sha256(v).hexdigest() for k, v in sorted(files.items())}}
    put("beyond-generated.json", manifest)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--realms", type=int, default=DEFAULT_REALMS)
    parser.add_argument("--output", type=Path, default=ROOT / "src/main/generated")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    files = generate(args.seed, args.realms)
    output = args.output.resolve()
    actual = {p.relative_to(output).as_posix() for p in output.rglob("*") if p.is_file()} if output.exists() else set()
    if args.check:
        errors = [key for key, data in files.items() if not (output / key).is_file() or (output / key).read_bytes() != data]
        extra = sorted(actual - files.keys())
        if errors or extra:
            print("Generated resources differ:", *errors, *extra, sep="\n  ", file=sys.stderr)
            return 1
        print(f"PASS: {len(files)} generated resources are byte-for-byte reproducible ({args.realms} realms, seed {args.seed}).")
        return 0
    # Do not silently remove unrelated files or follow symlinks in a user-supplied output directory.
    old_manifest = output / "beyond-generated.json"
    old_keys = set(json.loads(old_manifest.read_text())["files"]) | {"beyond-generated.json"} if old_manifest.is_file() else set()
    if actual - old_keys - files.keys():
        raise ValueError("Output directory contains unowned files; choose an empty directory")
    for key in files.keys() | old_keys:
        target = output / key
        if not target.resolve().is_relative_to(output):
            raise ValueError("Output path escapes generated directory")
    for key in sorted(old_keys - files.keys()):
        (output / key).unlink(missing_ok=True)
    for key, data in sorted(files.items()):
        target = output / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(f"Generated {len(files)} resources; {args.realms} realms, {args.realms * 3} blocks, {args.realms} echo items. Seed {args.seed}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
