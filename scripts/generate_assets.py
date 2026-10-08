#!/usr/bin/env python3
"""Generate the small, original pixel-art textures and JSON resources for the mod."""
from __future__ import annotations

import json
import math
import random
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/main/resources/assets/beyondlimits"
DATA = ROOT / "src/main/resources/data/beyondlimits"


def png(path: Path, width: int, height: int, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    body = b"\x89PNG\r\n\x1a\n"
    body += chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0))
    body += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    body += chunk(b"IEND", b"")
    path.write_bytes(body)


def blank(w: int, h: int, color=(0, 0, 0, 0)):
    return [[color for _ in range(w)] for _ in range(h)]


def setp(image, x, y, color):
    if 0 <= y < len(image) and 0 <= x < len(image[0]):
        image[y][x] = tuple(color)


def line(image, x0, y0, x1, y1, color, radius=0):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1) * 2
    for i in range(steps + 1):
        t = i / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy <= (radius + 0.6) ** 2:
                    setp(image, x + dx, y + dy, color)


def make_stone():
    rng = random.Random(1601)
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            n = rng.randrange(-16, 17)
            base = (55 + n, 54 + n, 78 + n, 255)
            if ((x // 4) + (y // 4)) % 2 == 0:
                base = (base[0] + 7, base[1] + 6, base[2] + 8, 255)
            setp(img, x, y, base)
    for seg in [((1, 2), (5, 5)), ((5, 5), (6, 9)), ((6, 9), (11, 12)), ((11, 12), (14, 15)),
                ((9, 0), (8, 3)), ((8, 3), (12, 6)), ((12, 6), (14, 7)), ((0, 11), (3, 10))]:
        line(img, *seg[0], *seg[1], (154, 87, 194, 255), 0)
    for x, y in [(4, 5), (6, 9), (11, 12), (8, 3), (12, 6)]:
        setp(img, x, y, (228, 150, 255, 255))
    return img


def make_nullstone():
    rng = random.Random(2205)
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            n = rng.randrange(-7, 8)
            setp(img, x, y, (20 + n, 16 + n, 37 + n, 255))
    paths = [((0, 3), (4, 5)), ((4, 5), (5, 9)), ((5, 9), (10, 10)), ((10, 10), (12, 15)),
             ((10, 0), (9, 3)), ((9, 3), (13, 5)), ((13, 5), (15, 4)), ((2, 15), (3, 12))]
    for a, b in paths:
        line(img, *a, *b, (98, 40, 141, 255), 0)
        line(img, *a, *b, (236, 83, 235, 255), 0)
    for x, y in [(4, 5), (5, 9), (10, 10), (9, 3), (13, 5), (12, 15)]:
        setp(img, x, y, (255, 170, 255, 255))
    return img


def make_codeglass():
    rng = random.Random(8812)
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            edge = (x % 8 == 0) or (y % 8 == 0)
            n = rng.randrange(-5, 6)
            if edge:
                color = (35, 149, 182, 210)
            else:
                color = (13 + n, 42 + n, 75 + n, 165)
            setp(img, x, y, color)
    for x, y in [(3, 3), (4, 3), (11, 4), (12, 4), (10, 11), (11, 11), (4, 12)]:
        setp(img, x, y, (115, 255, 241, 245))
    return img


def make_memory():
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            d = abs(x - 7.5) + abs(y - 7.5)
            if d > 11:
                c = (30, 29, 60, 255)
            elif d > 7:
                c = (74, 50, 123, 255)
            elif d > 3:
                c = (54 + x * 5, 73 + y * 4, 154 + x * 3, 255)
            else:
                c = (100 + x * 7, 180 + y * 4, 238, 255)
            setp(img, x, y, tuple(min(255, v) for v in c))
    line(img, 7, 2, 10, 6, (237, 245, 255, 255))
    line(img, 10, 6, 7, 14, (104, 244, 255, 255))
    return img


def make_anchor(active=False):
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            border = x in (1, 2, 13, 14) or y in (1, 2, 13, 14)
            inner = 5 <= x <= 10 and 5 <= y <= 10
            if border:
                c = (95, 92, 126, 255) if (x + y) % 3 else (152, 134, 180, 255)
            elif inner:
                c = (30, 205, 226, 255) if active else (102, 68, 174, 255)
            else:
                c = (26, 27, 52, 255)
            setp(img, x, y, c)
    line(img, 3, 3, 5, 5, (230, 230, 255, 255))
    line(img, 12, 12, 10, 10, (230, 230, 255, 255))
    return img


def make_core(charged=False):
    img = blank(16, 16)
    for y in range(16):
        for x in range(16):
            d = abs(x - 7.5) + abs(y - 7.5)
            if d < 2.4:
                c = (255, 222, 126, 255) if charged else (255, 128, 80, 255)
            elif d < 5:
                c = (246, 72, 142, 255) if charged else (149, 54, 125, 255)
            elif (x + y) % 4 == 0:
                c = (73, 53, 101, 255)
            else:
                c = (27, 25, 47, 255)
            setp(img, x, y, c)
    for i in range(3, 13, 3):
        setp(img, i, 2, (245, 91, 210, 255))
        setp(img, 15 - i, 13, (75, 223, 255, 255))
    return img


def make_shard():
    img = blank(16, 16)
    for y in range(3, 14):
        for x in range(3, 13):
            if abs(x - 7.5) * 0.62 + abs(y - 8) * 0.72 < 6.0:
                if y < 7:
                    c = (174, 244, 255, 255) if x < 8 else (117, 150, 255, 255)
                else:
                    c = (202, 87, 234, 255) if x > 7 else (74, 234, 231, 255)
                setp(img, x, y, c)
    line(img, 7, 3, 8, 12, (255, 255, 255, 255))
    setp(img, 5, 6, (255, 255, 255, 255))
    return img


def make_key():
    img = blank(16, 16)
    line(img, 3, 12, 11, 4, (181, 160, 215, 255), 1)
    line(img, 10, 5, 13, 8, (105, 235, 244, 255), 1)
    line(img, 9, 6, 11, 8, (220, 113, 248, 255), 0)
    for x, y in [(3, 12), (2, 13), (4, 11)]:
        setp(img, x, y, (255, 222, 162, 255))
    return img


def make_compass():
    img = blank(16, 16)
    for y in range(1, 15):
        for x in range(1, 15):
            d = math.hypot(x - 7.5, y - 7.5)
            if d <= 6.5:
                if d >= 5.1:
                    c = (234, 197, 126, 255)
                else:
                    c = (30, 48, 76, 255)
                setp(img, x, y, c)
    line(img, 7, 12, 9, 4, (248, 91, 216, 255), 1)
    line(img, 7, 12, 5, 7, (96, 238, 255, 255), 0)
    setp(img, 7, 7, (255, 250, 220, 255))
    return img


def make_rift_frame(stage: int, frame: int):
    img = blank(16, 16)
    width = [1.4, 2.8, 4.6, 6.3][stage]
    pulse = math.sin(frame * math.pi / 2.0) * 0.7
    for y in range(1, 15):
        center = 7.5 + math.sin(y * 0.77 + frame * 0.9 + stage) * (1.2 + stage * 0.25)
        local_width = width + math.sin(y * 1.41 + frame) * 0.8 + pulse * 0.25
        for x in range(16):
            dx = abs(x - center)
            if dx < local_width + 3.0:
                strength = max(0.0, 1.0 - dx / (local_width + 3.0))
                c = (int(65 + 175 * strength), int(20 + 88 * strength), int(121 + 132 * strength), int(20 + 235 * strength))
                setp(img, x, y, c)
            if dx < local_width and (x + y + frame) % 5 != 0:
                core = (255, 195 + (frame % 2) * 35, 252, 255) if dx < 1.0 else (204, 78, 255, 245)
                setp(img, x, y, core)
        if y % (5 - min(stage, 3)) == 0:
            setp(img, max(0, round(center - width - 2)), y, (120, 250, 255, 210))
    return img


def make_observer(variant="observer"):
    img = blank(64, 32)
    palettes = {
        "observer": ((34, 29, 59), (113, 71, 143), (126, 239, 190), (89, 28, 113)),
        "mirror": ((28, 49, 74), (79, 166, 193), (255, 113, 215), (95, 45, 146)),
        "frayling": ((38, 65, 88), (114, 220, 226), (255, 226, 146), (49, 140, 171)),
    }
    shadow, edge_color, iris_color, ring_color = palettes[variant]
    # A dark, many-faceted shroud occupies the body UV region.
    for y in range(0, 16):
        for x in range(0, 24):
            edge = x in (0, 23) or y in (0, 15)
            n = (x * 7 + y * 11) % 24
            base = tuple(min(255, channel + n // 3) for channel in shadow)
            setp(img, x, y, (*base, 255) if not edge else (*edge_color, 255))
    # A luminous iris on the second cuboid's UV island.
    for y in range(9, 17):
        for x in range(28, 42):
            d = math.hypot((x - 35) * 0.75, y - 13)
            if d <= 4:
                c = ring_color if d > 2.7 else iris_color
                if d < 1.4:
                    c = (15, 17, 29)
                setp(img, x, y, (*c, 255))
    line(img, 32, 11, 34, 10, (246, 227, 255, 255))
    return img


def write_text(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def generate_textures():
    block = ASSETS / "textures/block"
    item = ASSETS / "textures/item"
    entity = ASSETS / "textures/entity"
    png(block / "fractured_stone.png", 16, 16, make_stone())
    png(block / "nullstone.png", 16, 16, make_nullstone())
    png(block / "codeglass.png", 16, 16, make_codeglass())
    png(block / "memory_crystal.png", 16, 16, make_memory())
    png(block / "reality_anchor.png", 16, 16, make_anchor())
    png(block / "resonant_core.png", 16, 16, make_core(False))
    png(block / "resonant_core_active.png", 16, 16, make_core(True))
    for stage in range(4):
        frames = [make_rift_frame(stage, frame) for frame in range(4)]
        sheet = [row[:] for frame in frames for row in frame]
        target = block / f"reality_tear_stage{stage}.png"
        png(target, 16, 64, sheet)
        target.with_suffix(".png.mcmeta").write_text(
            json.dumps({"animation": {"frametime": 3, "interpolate": True}}, indent=2) + "\n",
            encoding="utf-8",
        )
    png(item / "rift_shard.png", 16, 16, make_shard())
    png(item / "fracture_key.png", 16, 16, make_key())
    png(item / "rift_compass.png", 16, 16, make_compass())
    png(entity / "observer.png", 64, 32, make_observer("observer"))
    png(entity / "mirror_echo.png", 64, 32, make_observer("mirror"))
    png(entity / "frayling.png", 64, 32, make_observer("frayling"))
    png(ASSETS / "icon.png", 16, 16, make_shard())


def generate_models_and_data():
    block_names = ["fractured_stone", "nullstone", "codeglass", "memory_crystal", "reality_anchor"]
    for name in block_names:
        write_text(ASSETS / f"blockstates/{name}.json", {"variants": {"": {"model": f"beyondlimits:block/{name}"}}})
        write_text(ASSETS / f"models/block/{name}.json", {
            "parent": "minecraft:block/cube_all",
            "textures": {"all": f"beyondlimits:block/{name}"},
        })
        write_text(ASSETS / f"models/item/{name}.json", {"parent": f"beyondlimits:block/{name}"})

    write_text(ASSETS / "blockstates/resonant_core.json", {
        "variants": {
            "charged=false": {"model": "beyondlimits:block/resonant_core"},
            "charged=true": {"model": "beyondlimits:block/resonant_core_active"},
        }
    })
    for name, texture in [("resonant_core", "resonant_core"), ("resonant_core_active", "resonant_core_active")]:
        write_text(ASSETS / f"models/block/{name}.json", {
            "parent": "minecraft:block/cube_all",
            "textures": {"all": f"beyondlimits:block/{texture}"},
        })
    write_text(ASSETS / "models/item/resonant_core.json", {"parent": "beyondlimits:block/resonant_core"})

    write_text(ASSETS / "blockstates/reality_tear.json", {
        "variants": {f"stage={stage}": {"model": f"beyondlimits:block/reality_tear_stage{stage}"} for stage in range(4)}
    })
    for stage in range(4):
        write_text(ASSETS / f"models/block/reality_tear_stage{stage}.json", {
            "parent": "minecraft:block/cross",
            "textures": {"cross": f"beyondlimits:block/reality_tear_stage{stage}"},
        })

    for name in ["rift_shard", "fracture_key", "rift_compass"]:
        write_text(ASSETS / f"models/item/{name}.json", {
            "parent": "minecraft:item/generated",
            "textures": {"layer0": f"beyondlimits:item/{name}"},
        })

    recipes = {
        "rift_shard": {
            "type": "minecraft:crafting_shaped", "pattern": [" A ", "AEA", " A "],
            "key": {"A": {"item": "minecraft:amethyst_shard"}, "E": {"item": "minecraft:echo_shard"}},
            "result": {"item": "beyondlimits:rift_shard", "count": 4},
        },
        "fractured_stone": {
            "type": "minecraft:crafting_shaped", "pattern": ["DDD", "DRD", "DDD"],
            "key": {"D": {"item": "minecraft:deepslate"}, "R": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:fractured_stone", "count": 8},
        },
        "memory_crystal": {
            "type": "minecraft:crafting_shaped", "pattern": [" A ", "ARA", " A "],
            "key": {"A": {"item": "minecraft:amethyst_shard"}, "R": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:memory_crystal", "count": 1},
        },
        "nullstone": {
            "type": "minecraft:crafting_shaped", "pattern": ["OOO", "ORO", "OOO"],
            "key": {"O": {"item": "minecraft:obsidian"}, "R": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:nullstone", "count": 8},
        },
        "codeglass": {
            "type": "minecraft:crafting_shaped", "pattern": ["GGG", "GRG", "GGG"],
            "key": {"G": {"item": "minecraft:tinted_glass"}, "R": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:codeglass", "count": 8},
        },
        "reality_anchor": {
            "type": "minecraft:crafting_shaped", "pattern": ["NAN", "ACA", "NAN"],
            "key": {"N": {"item": "beyondlimits:nullstone"}, "A": {"item": "minecraft:amethyst_shard"}, "C": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:reality_anchor", "count": 1},
        },
        "resonant_core": {
            "type": "minecraft:crafting_shaped", "pattern": ["RTR", "TET", "RTR"],
            "key": {"R": {"item": "beyondlimits:rift_shard"}, "T": {"item": "minecraft:tnt"}, "E": {"item": "minecraft:echo_shard"}},
            "result": {"item": "beyondlimits:resonant_core", "count": 1},
        },
        "fracture_key": {
            "type": "minecraft:crafting_shaped", "pattern": ["  A", " R ", "S  "],
            "key": {"A": {"item": "minecraft:amethyst_shard"}, "R": {"item": "beyondlimits:rift_shard"}, "S": {"item": "minecraft:stick"}},
            "result": {"item": "beyondlimits:fracture_key", "count": 1},
        },
        "rift_compass": {
            "type": "minecraft:crafting_shaped", "pattern": [" A ", "ARA", " A "],
            "key": {"A": {"item": "minecraft:amethyst_shard"}, "R": {"item": "beyondlimits:rift_shard"}},
            "result": {"item": "beyondlimits:rift_compass", "count": 1},
        },
    }
    for name, recipe in recipes.items():
        write_text(DATA / f"recipes/{name}.json", recipe)

    loot_names = [*block_names, "resonant_core"]
    for name in loot_names:
        write_text(DATA / f"loot_tables/blocks/{name}.json", {
            "type": "minecraft:block",
            "pools": [{
                "rolls": 1,
                "entries": [{"type": "minecraft:item", "name": f"beyondlimits:{name}"}],
                "conditions": [{"condition": "minecraft:survives_explosion"}],
            }],
        })

    write_text(DATA / "advancements/enter_codeverse.json", {
        "display": {
            "icon": {"item": "beyondlimits:rift_shard"},
            "title": {"text": "Past the Seam"},
            "description": {"text": "Cross the edge of the world and enter the Codeverse."},
            "frame": "challenge",
            "show_toast": True,
            "announce_to_chat": True,
            "hidden": False,
        },
        "criteria": {
            "cross_the_seam": {
                "trigger": "minecraft:changed_dimension",
                "conditions": {"from": "minecraft:overworld", "to": "beyondlimits:codeverse"},
            }
        },
    })

    language = {
        "block.beyondlimits.fractured_stone": "Fractured Stone",
        "block.beyondlimits.nullstone": "Nullstone",
        "block.beyondlimits.codeglass": "Codeglass",
        "block.beyondlimits.memory_crystal": "Memory Crystal",
        "block.beyondlimits.reality_anchor": "Reality Anchor",
        "block.beyondlimits.resonant_core": "Resonant Core",
        "block.beyondlimits.reality_tear": "Reality Tear",
        "item.beyondlimits.rift_shard": "Rift Shard",
        "item.beyondlimits.fracture_key": "Fracture Key",
        "item.beyondlimits.rift_compass": "Rift Compass",
        "entity.beyondlimits.observer": "The Observer",
        "entity.beyondlimits.mirror_echo": "Mirror Echo",
        "entity.beyondlimits.frayling": "Frayling",
        "dimension.beyondlimits.codeverse": "The Codeverse",
        "death.attack.outOfWorld": "%1$s fell out of the world",
    }
    write_text(ASSETS / "lang/en_us.json", language)

    tag_dir = ROOT / "src/main/resources/data/minecraft/tags/blocks/mineable"
    write_text(tag_dir / "pickaxe.json", {
        "replace": False,
        "values": [
            "beyondlimits:fractured_stone", "beyondlimits:nullstone", "beyondlimits:codeglass",
            "beyondlimits:memory_crystal", "beyondlimits:reality_anchor", "beyondlimits:resonant_core",
        ],
    })


def main():
    generate_textures()
    generate_models_and_data()
    print("Generated textures, models, language, recipes, loot tables, and dimension data.")


if __name__ == "__main__":
    main()
