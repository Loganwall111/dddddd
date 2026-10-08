#!/usr/bin/env python3
"""Generates blockstates, block models, item models and the Effect texture set.

Every model is derived from the texture names the texture generator produces, so the two
scripts stay in sync: add a block texture and the model appears. Texture packs can override
any individual PNG without touching the models, because the models only ever reference
vanilla parents (cube_all, cube_column, ...) and the mod's own texture paths.
"""
import json
import os
import random
import struct
import zlib

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                      "src", "main", "resources", "assets", "beyondthelimits")

# block name -> (model kind, texture map, render_type or None)
#   kind: "all"    = cube_all with one texture
#         "column" = cube_column (side + end)
#         "grass"  = cube_bottom_top (top + side + bottom)
BLOCKS = {
    # --- corrupted land
    "corrupted_grass":  ("grass",  {"top": "corrupted_grass_top", "side": "corrupted_grass_side", "bottom": "corrupted_soil"}, None),
    "corrupted_soil":   ("all",    {"all": "corrupted_soil"}, None),
    "corrupted_stone":  ("all",    {"all": "corrupted_stone"}, None),
    "bleeding_vein":    ("all",    {"all": "bleeding_vein"}, None),
    "bleed_pool":       ("all",    {"all": "bleed_pool"}, "translucent"),
    # --- rifts
    "rift_anchor":      ("all",    {"all": "rift_anchor"}, None),
    "rift_frame":       ("all",    {"all": "rift_frame"}, None),
    "void_glass":       ("all",    {"all": "void_glass"}, "translucent"),
    "sky_shard":        ("all",    {"all": "sky_shard"}, "translucent"),
    "gravity_core":     ("all",    {"all": "gravity_core"}, None),
    # --- memory / mirrors
    "memory_stone":     ("all",    {"all": "memory_stone"}, None),
    "memory_lamp":      ("all",    {"all": "memory_lamp"}, None),
    "mirror_block":     ("all",    {"all": "mirror_block"}, None),
    # --- code verse
    "code_monolith":    ("all",    {"all": "code_monolith"}, "cutout"),
    "code_brick":       ("all",    {"all": "code_brick"}, None),
    "code_panel":       ("all",    {"all": "code_panel"}, "cutout"),
    # --- backrooms
    "backrooms_carpet": ("all",    {"all": "backrooms_carpet"}, None),
    "backrooms_wall":   ("all",    {"all": "backrooms_wall"}, None),
    "backrooms_ceiling":("all",    {"all": "backrooms_ceiling"}, None),
    "backrooms_light":  ("all",    {"all": "backrooms_light"}, None),
    "pool_tile":        ("all",    {"all": "pool_tile"}, None),
    "pool_tile_dark":   ("all",    {"all": "pool_tile_dark"}, None),
    "store_shelf":      ("all",    {"all": "store_shelf"}, None),
    "warehouse_concrete":("all",   {"all": "warehouse_concrete"}, None),
    "warehouse_floor":  ("all",    {"all": "warehouse_floor"}, None),
    # --- the wrong minecraft / the impossible
    "wrong_grass":      ("grass",  {"top": "wrong_grass_top", "side": "wrong_grass_side", "bottom": "corrupted_soil"}, None),
    "impossible_grass": ("all",    {"all": "impossible_grass"}, None),
    "impossible_leaves":("all",    {"all": "impossible_leaves"}, "cutout_mipped"),
    "impossible_log":   ("column", {"side": "impossible_log", "end": "impossible_log_top"}, None),
    # --- the civilization that was not there
    "ancient_brick":    ("all",    {"all": "ancient_brick"}, None),
    "ancient_pillar":   ("column", {"side": "ancient_pillar_side", "end": "ancient_pillar_top"}, None),
    "ancient_statue":   ("all",    {"all": "ancient_statue"}, None),
    # --- the signal
    "signal_casing":    ("all",    {"all": "signal_casing"}, None),
    "signal_machine":   ("all",    {"all": "signal_machine"}, None),
    # --- dimensions
    "fog_moss":         ("all",    {"all": "fog_moss"}, None),
    "fog_stone":        ("all",    {"all": "fog_stone"}, None),
}

ITEMS = [
    "guidebook", "reality_scanner", "dimensional_gauge", "noclip_device", "memory_shard",
    "signal_receiver", "rift_stabilizer", "void_lens", "storm_beacon", "ancient_tablet",
    "reality_warhead", "reality_fragment", "black_sun_fragment", "code_key",
]

# Blocks whose model needs per-axis variants (vanilla PillarBlock).
PILLARS = {"impossible_log", "ancient_pillar"}

# Blocks that are effectively invisible from outside and should not block light.
EFFECT = {
    "rift_noise": 64,
    "sky_noise": 64,
    "glitch_noise": 64,
}


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        json.dump(data, handle, indent=2, sort_keys=False)
        handle.write("\n")


def block_model(name, spec):
    kind, textures, render_type = spec
    model = {}
    if kind == "all":
        model["parent"] = "minecraft:block/cube_all"
        model["textures"] = {"all": f"beyondthelimits:block/{textures['all']}"}
    elif kind == "column":
        model["parent"] = "minecraft:block/cube_column"
        model["textures"] = {"side": f"beyondthelimits:block/{textures['side']}",
                             "end": f"beyondthelimits:block/{textures['end']}"}
    elif kind == "grass":
        model["parent"] = "minecraft:block/cube_bottom_top"
        model["textures"] = {"top": f"beyondthelimits:block/{textures['top']}",
                             "side": f"beyondthelimits:block/{textures['side']}",
                             "bottom": f"beyondthelimits:block/{textures['bottom']}"}
    if render_type:
        # Render-type override lives in the model in 1.21.1; no blockstate-level hook is needed.
        model["render_type"] = f"minecraft:{render_type}"
    return model


def blockstate(name, pillar):
    if pillar:
        return {"variants": {
            "axis=y": {"model": f"beyondthelimits:block/{name}"},
            "axis=z": {"model": f"beyondthelimits:block/{name}", "x": 90},
            "axis=x": {"model": f"beyondthelimits:block/{name}", "x": 90, "y": 90},
        }}
    return {"variants": {"": {"model": f"beyondthelimits:block/{name}"}}}


def item_model(name):
    return {"parent": "minecraft:item/generated",
            "textures": {"layer0": f"beyondthelimits:item/{name}"}}


# ---------------------------------------------------------------------------------------
# effect textures (used by the GLSL programs, not by any block)
# ---------------------------------------------------------------------------------------


def write_png(path, pixels, width, height):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(blob)


def tileable_noise(size, seed, octaves=4):
    """Value noise that wraps, built from sum of sine lattices — cheap and seamless."""
    import math
    rng = random.Random(seed)
    points = []
    for octave in range(octaves):
        freq = 2 ** (octave + 1)
        grid = [[rng.random() for _ in range(freq)] for _ in range(freq)]
        points.append((freq, grid))

    def sample(x, y):
        total = 0.0
        weight = 1.0
        norm = 0.0
        for freq, grid in points:
            fx = x / size * freq
            fy = y / size * freq
            x0, y0 = int(fx), int(fy)
            tx, ty = fx - x0, fy - y0
            tx = tx * tx * (3 - 2 * tx)
            ty = ty * ty * (3 - 2 * ty)
            a = grid[y0 % freq][x0 % freq]
            b = grid[y0 % freq][(x0 + 1) % freq]
            c = grid[(y0 + 1) % freq][x0 % freq]
            d = grid[(y0 + 1) % freq][(x0 + 1) % freq]
            total += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * weight
            norm += weight
            weight *= 0.5
        return total / norm

    return [[sample(x, y) for x in range(size)] for y in range(size)]


def effect_textures():
    made = 0
    # rift noise: a seamless flow field sampled by the rift shader.
    field = tileable_noise(EFFECT["rift_noise"], 4242, 5)
    sec = tileable_noise(EFFECT["rift_noise"], 999)
    size = EFFECT["rift_noise"]
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            row.append((int(max(0, min(255, field[y][x] * 255))),
                        int(max(0, min(255, sec[y][x] * 255))),
                        int(max(0, min(255, field[x][y] * 255))), 255))
        pixels.append(row)
    write_png(os.path.join(ASSETS, "textures", "effect", "rift_noise.png"), pixels, size, size)
    made += 1

    # sky noise: cloud field, alpha-weighted so the shader can use it directly.
    field = tileable_noise(EFFECT["sky_noise"], 77, 6)
    size = EFFECT["sky_noise"]
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            v = field[y][x]
            row.append((int(v * 255), int(v * 235), int(v * 255), int(min(1.0, v * 1.4) * 255)))
        pixels.append(row)
    write_png(os.path.join(ASSETS, "textures", "effect", "sky_noise.png"), pixels, size, size)
    made += 1

    # glitch noise: hard-edged blocks for the channel-shift pass.
    rng = random.Random(31337)
    size = EFFECT["glitch_noise"]
    pixels = [[(rng.randrange(256), rng.randrange(256), rng.randrange(256), 255)
               for _ in range(size)] for _ in range(size)]
    write_png(os.path.join(ASSETS, "textures", "effect", "glitch_noise.png"), pixels, size, size)
    made += 1
    return made


def main():
    for name, spec in BLOCKS.items():
        write_json(os.path.join(ASSETS, "blockstates", f"{name}.json"),
                   blockstate(name, name in PILLARS))
        write_json(os.path.join(ASSETS, "models", "block", f"{name}.json"), block_model(name, spec))
    for name in ITEMS:
        write_json(os.path.join(ASSETS, "models", "item", f"{name}.json"), item_model(name))
    effects = effect_textures()
    print(f"models: {len(BLOCKS)} blocks, {len(ITEMS)} items, {effects} effect textures")


if __name__ == "__main__":
    main()
