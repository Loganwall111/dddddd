#!/usr/bin/env python3
"""Sift Overhaul 0.25: independent tides, natural-scale terrain, Canopy fossils, Jelly Lands, and assets.

Run this idempotent pass after the earlier worldgen/texture phases. It intentionally uses only Python's
standard library, so it can regenerate the shipped PNG/data assets without Pillow or numpy.

* The Sift gets its own 24,000-tick world clock and Flow / Thrive / Endure markers.
* Normal (not amplified) Overworld density functions retain caves and continental land gaps; the
  aquifer fallback is air, so low areas stay dry rather than becoming ichor oceans.
* Campaign Peaks keep only rare one-to-two-block ichor puddles, springs, and short natural flows.
* The Boneyard registry ID is preserved for existing worlds but named Canopy in-game, with a giant
  skull, tusks, and broad ribcages made from visible bone blocks.
* Jelly Lands gets a dense blue fog, deep-blue sky, pink grass, pale trees, and its own climate region.
* Crag features are scaled down and less frequent.
* Ichor sheets are regenerated as seamless, soft, animated rainbow water. Blub is rebuilt from the
  repository creature spec (cyan cube, indigo eyes, purple nose, pink mouth, long pink-lined ears).
* The Sift return gate uses the same cyan portal presentation as the Agency Portal and keeps its
  saved-dimension return behavior.
"""
from __future__ import annotations

import importlib.util
import json
import math
import random
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
DATA = RES / "data/entersift"
TEXTURES = RES / "assets/entersift/textures"

# Keyframes deliberately hold each tide, then ease into the next. These match SiftSky.STAGE_TICKS.
STAGE_TICKS = [0, 5000, 6000, 11000, 13000, 22500]
STAGE_AT = [0, 0, 1, 1, 2, 2]  # Flow, Flow, Thrive, Thrive, Endure, Endure
PERIOD = 24000


def load(path: Path):
    return json.loads(path.read_text())


def dump(path: Path, data, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":") if compact else None,
                               indent=None if compact else 2) + "\n")


def offsets(x: int, y: int, z: int):
    """Minecraft 26.3 caps each offset component at 16; chained offsets are additive."""
    out, rest = [], [int(x), int(y), int(z)]
    while True:
        step = [max(-16, min(16, value)) for value in rest]
        out.append({"type": "minecraft:offset", "x": step[0], "y": step[1], "z": step[2]})
        rest = [value - delta for value, delta in zip(rest, step)]
        if not any(rest):
            return out


def overlay(points):
    seen, entries = set(), []
    for x, y, z, block in points:
        key = (int(x), int(y), int(z), block)
        if key in seen:
            continue
        seen.add(key)
        entries.append({
            "feature": {"type": "minecraft:simple_block", "to_place": {"id": block}},
            "placement": offsets(x, y, z) + [{
                "type": "minecraft:block_predicate_filter",
                "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:air"},
            }],
        })
    return {"type": "minecraft:overlay", "features": entries}


def placed(feature: str, chance: int):
    return {
        "feature": f"entersift:{feature}",
        "placement": [
            {"type": "minecraft:rarity_filter", "chance": chance},
            {"type": "minecraft:in_square"},
            {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"},
            {"type": "minecraft:biome"},
        ],
    }


# --------------------------------------------------------------------------- custom clock and palette timeline

def tides():
    dump(DATA / "world_clock/sift.json", {})

    horizon = ["#7fd3cf", "#8fc2c4", "#db7840"]
    light = ["#dcf4fa", "#e6fff4", "#ffd89a"]
    water_fog = ["#5aa8bc", "#62b8c0", "#c08a3a"]
    light_factor = [1.0, 1.0, 0.8]
    light_level = [1.0, 1.0, 0.78]

    def track(values, modifier=None):
        result = {"keyframes": [{"ticks": tick, "value": values[stage]}
                                for tick, stage in zip(STAGE_TICKS, STAGE_AT)]}
        if modifier:
            result["modifier"] = modifier
        return result

    timeline_path = DATA / "timeline/sift_cycle.json"
    timeline = load(timeline_path) if timeline_path.exists() else {}
    tracks = timeline.setdefault("tracks", {})
    # Keep the 0.24 sun/moon and ambient tracks; only replace the tide-controlled attributes.
    tracks.update({
        "minecraft:visual/sky_color": track(horizon),
        "minecraft:visual/fog_color": track(horizon, "multiply"),
        "minecraft:visual/water_fog_color": track(water_fog),
        "minecraft:visual/cloud_color": track(["#00ffffff"] * 3),
        "minecraft:visual/sky_light_color": track(light, "multiply"),
        "minecraft:visual/sky_light_factor": track(light_factor, "multiply"),
        "minecraft:gameplay/sky_light_level": track(light_level, "multiply"),
    })
    timeline.update({
        "clock": "entersift:sift",
        "period_ticks": PERIOD,
        "time_markers": {
            "entersift:flow": {"ticks": 0, "show_in_commands": True},
            "entersift:thrive": {"ticks": 6000, "show_in_commands": True},
            "entersift:endure": {"ticks": 13000, "show_in_commands": True},
        },
        "tracks": tracks,
    })
    dump(timeline_path, timeline)

    dim_path = DATA / "dimension_type/the_sift.json"
    dim = load(dim_path)
    dim["default_clock"] = "entersift:sift"
    dim["timelines"] = ["entersift:sift_cycle"]
    dim["attributes"]["minecraft:visual/sky_color"] = horizon[0]
    # Keep the white dimension base so each biome's own fog tint remains visible.
    dim["attributes"]["minecraft:visual/fog_color"] = "#ffffff"
    dim["attributes"]["minecraft:visual/water_fog_color"] = water_fog[0]
    dump(dim_path, dim)

    # Named marker labels are harmless on clients that show the raw registry ID instead.
    lang_path = TEXTURES.parent / "lang/en_us.json"
    lang = load(lang_path)
    lang.update({
        "biome.entersift.boneyard": "Canopy",
        "time_marker.entersift.flow": "Flow",
        "time_marker.entersift.thrive": "Thrive",
        "time_marker.entersift.endure": "Endure",
    })
    dump(lang_path, lang)


def jelly_lands():
    """Add a temperate Sift biome: pink groundcover, pale trees, and a short blue fog wall."""
    source = load(DATA / "worldgen/biome/pale_grove.json")
    biome = json.loads(json.dumps(source))
    biome["effects"] = dict(biome.get("effects", {}), water_color="#2869b8")
    attributes = biome.setdefault("attributes", {})
    attributes.update({
        "minecraft:visual/sky_color": "#091b55",
        "minecraft:visual/fog_color": "#173b95",
        "minecraft:visual/fog_start_distance": 5.0,
        "minecraft:visual/fog_end_distance": 54.0,
        "minecraft:visual/water_fog_color": "#123078",
    })
    features = [list(step) for step in biome["features"]]
    while len(features) <= 9:
        features.append([])
    features[9] = [
        "entersift:pale_tree",
        "entersift:pink_grass_pale_grove",
        "entersift:glow_tuft_pale_grove",
        "entersift:sift_bloom_pale_grove",
        "entersift:glow_bulb",
    ]
    biome["features"] = features
    dump(DATA / "worldgen/biome/jelly_lands.json", biome)

    # Keep Jelly Lands inside the temperate, moist Soul Valley climate envelope. The smaller box is
    # listed first, so it forms a distinct sub-biome without erasing any of the existing climate bands.
    dim_path = DATA / "dimension/the_sift.json"
    dim = load(dim_path)
    entries = [entry for entry in dim["generator"]["biome_source"]["biomes"]
               if entry.get("biome") != "entersift:jelly_lands"]
    jelly = {
        "biome": "entersift:jelly_lands",
        "parameters": {
            "temperature": [0.05, 0.24],
            "humidity": [0.50, 0.88],
            "continentalness": [-0.11, 1.0],
            "erosion": [-0.22, 1.0],
            "weirdness": [-1.0, 1.0],
            "depth": [0.0, 1.0],
            "offset": 0.0,
        },
    }
    index = next((i for i, entry in enumerate(entries) if entry.get("biome") == "entersift:soul_valley"), len(entries))
    entries.insert(index, jelly)
    dim["generator"]["biome_source"]["biomes"] = entries
    dump(dim_path, dim)

    # Give the biome a mostly pink turf surface with occasional blue ridge bands.
    rule_path = DATA / "worldgen/material_rule/the_sift.json"
    rule = load(rule_path)
    sequence = rule["sequence"]
    sequence[:] = [entry for entry in sequence if not (
        isinstance(entry, dict)
        and isinstance(entry.get("if_true"), dict)
        and entry["if_true"].get("type") == "minecraft:biome"
        and entry["if_true"].get("biome_is") == "entersift:jelly_lands") ]
    jelly_surface = {
        "type": "minecraft:condition",
        "if_true": {"type": "minecraft:biome", "biome_is": "entersift:jelly_lands"},
        "then_run": {
            "type": "minecraft:condition",
            "if_true": "minecraft:on_floor",
            "then_run": {
                "type": "minecraft:sequence",
                "sequence": [
                    {
                        "type": "minecraft:condition",
                        "if_true": {"type": "minecraft:noise_threshold", "noise": "minecraft:surface",
                                     "min_threshold": 0.45, "max_threshold": 10.0},
                        "then_run": {"type": "minecraft:block", "result_state": "entersift:blue_turf"},
                    },
                    {"type": "minecraft:block", "result_state": "entersift:pink_turf"},
                ],
            },
        },
    }
    index = next((i for i, entry in enumerate(sequence)
                  if isinstance(entry, dict)
                  and isinstance(entry.get("if_true"), dict)
                  and entry["if_true"].get("type") == "minecraft:biome"
                  and entry["if_true"].get("biome_is") == "entersift:pale_grove"), len(sequence))
    sequence.insert(index, jelly_surface)
    dump(rule_path, rule)

    lang_path = TEXTURES.parent / "lang/en_us.json"
    lang = load(lang_path)
    lang["biome.entersift.jelly_lands"] = "Jelly Lands"
    lang["biome.entersift.boneyard"] = "Canopy"
    dump(lang_path, lang)


# --------------------------------------------------------------------------- terrain and rare liquid features

def dry_terrain():
    path = DATA / "worldgen/noise_settings/the_sift.json"
    data = load(path)
    router = data["noise_router"]
    router["final_density"] = "minecraft:overworld/final_density"
    router["depth"] = "minecraft:overworld/depth"
    router["chunk_surface_level"] = "minecraft:overworld/chunk_surface_level"
    data["aquifers"]["surface_level"] = "minecraft:overworld/preliminary_surface_level"
    exclusion = data["aquifers"]["exclusion"]["right"]["left"]
    exclusion["left"] = "minecraft:overworld/depth"
    data["default_fluid"] = "minecraft:air"
    data["sea_level"] = 40
    for debug in data.get("debug_functions", []):
        fn = debug.get("function")
        if isinstance(fn, str):
            debug["function"] = fn.replace("minecraft:overworld_amplified/", "minecraft:overworld/")
    dump(path, data)

    # Keep the existing configured IDs, but the former "lake" is now a one-to-two-block puddle.
    tiny_delta = {
        "type": "minecraft:delta_feature",
        "contents": "entersift:ichor",
        "rim": "entersift:sinter",
        "rim_size": {"type": "minecraft:uniform", "min_inclusive": 1, "max_inclusive": 1},
        "size": {"type": "minecraft:uniform", "min_inclusive": 1, "max_inclusive": 2},
    }
    dump(DATA / "worldgen/feature/ichor_lake.json", tiny_delta)
    # The old configured feature was a full lake; use the same tiny delta codec as the puddle.
    dump(DATA / "worldgen/feature/ichor_hot_spring.json", tiny_delta)

    lake_placement = placed("ichor_lake", 64)
    dump(DATA / "worldgen/placed_feature/ichor_lake.json", lake_placement)
    dump(DATA / "worldgen/placed_feature/ichor_hot_spring.json", placed("ichor_hot_spring", 96))

    spring_placement = [
        {"type": "minecraft:rarity_filter", "chance": 96},
        {"type": "minecraft:in_square"},
        {"type": "minecraft:height_range", "height": {
            "type": "minecraft:uniform",
            "min_inclusive": {"absolute": 60},
            "max_inclusive": {"absolute": 180},
        }},
        {"type": "minecraft:biome"},
    ]
    dump(DATA / "worldgen/placed_feature/ichor_spring.json", {
        "feature": "entersift:ichor_spring", "placement": spring_placement,
    })
    dump(DATA / "worldgen/placed_feature/ichor_volcano.json", placed("ichor_volcano", 256))


# --------------------------------------------------------------------------- large but sparse fossil structures in the Canopy desert

def giant_skull():
    points = []
    rx, ry, rz = 12.0, 8.0, 10.0
    for y in range(0, 17):
        for x in range(-12, 13):
            for z in range(-10, 11):
                shell = (x / rx) ** 2 + ((y - 8.0) / ry) ** 2 + (z / rz) ** 2
                if not 0.82 <= shell <= 1.18:
                    continue
                # Deep eye sockets and a central nasal opening, cut through the forward (-Z) shell.
                if z <= -7 and (
                    (x + 5) ** 2 + (y - 10) ** 2 <= 8
                    or (x - 5) ** 2 + (y - 10) ** 2 <= 8
                    or abs(x) <= 1 and 4 <= y <= 6
                ):
                    continue
                points.append((x, y, z, "minecraft:bone_block"))

    # The broad lower jaw and five blocky teeth make the skull legible from the ground.
    for x in range(-8, 9):
        if x % 2 == 0:
            points.append((x, 1, -8, "minecraft:bone_block"))
    for x in (-7, -4, 0, 4, 7):
        points.extend([(x, 2, -9, "minecraft:bone_block"), (x, 3, -9, "minecraft:bone_block")])

    # Curved, heavy brow tusks rise above the skull on both sides.
    for side in (-1, 1):
        for step in range(10):
            f = step / 9.0
            x = side * (8 + round(3 * f * f))
            y = 2 + step
            z = -7 - round(2 * math.sin(f * math.pi / 2))
            for dx, dz in ((0, 0), (side, 0), (0, 1)):
                points.append((x + dx, y, z + dz, "minecraft:bone_block"))

    # Small soul lanterns are recessed into the sockets; the skull itself remains bone-block white.
    points.extend([(-5, 10, -6, "minecraft:soul_lantern"), (5, 10, -6, "minecraft:soul_lantern")])
    return points


def bone_ribcage():
    points = []
    # A long spine under seven huge arched ribs (about 20 blocks wide and 28 long).
    for z in range(-14, 15):
        points.extend([(0, 3, z, "minecraft:bone_block"), (0, 4, z, "minecraft:bone_block")])
        if z % 2 == 0:
            points.append((0, 8, z, "minecraft:bone_block"))
    for station in range(-12, 13, 4):
        for side in (-1, 1):
            for step in range(13):
                f = step / 12.0
                x = side * (2 + round(7 * math.sin(f * math.pi)))
                y = 1 + round(8 * math.sin(f * math.pi))
                points.append((x, y, station, "minecraft:bone_block"))
                if 3 <= step <= 9:
                    points.append((x, y + 1, station, "minecraft:bone_block"))
            # Small vertebra caps at the attachment point.
            points.extend([(side * 2, 2, station, "minecraft:bone_block"),
                           (side * 2, 3, station, "minecraft:bone_block")])
    return points


def giant_tusks():
    points = []
    for side in (-1, 1):
        for y in range(0, 18):
            f = y / 17.0
            cx = side * (5 + round(7 * f * f))
            cz = round(2 * math.sin(f * math.pi))
            radius = 1 if f < 0.72 else 0
            for dx in range(-radius, radius + 1):
                for dz in range(-radius, radius + 1):
                    points.append((cx + dx, y, cz + dz, "minecraft:bone_block"))
    return points


def bone_worldgen():
    dump(DATA / "worldgen/feature/giant_skull.json", overlay(giant_skull()), compact=True)
    rib = overlay(bone_ribcage())
    dump(DATA / "worldgen/feature/ribcage.json", rib, compact=True)
    dump(DATA / "worldgen/feature/bone_tusk.json", overlay(giant_tusks()), compact=True)

    # The same large ribcage can appear in Carapace and Canopy, but remains rare in both.
    dump(DATA / "worldgen/placed_feature/giant_skull.json", placed("giant_skull", 24))
    dump(DATA / "worldgen/placed_feature/bone_tusk.json", placed("bone_tusk", 18))
    dump(DATA / "worldgen/placed_feature/ribcage.json", placed("ribcage", 22))
    dump(DATA / "worldgen/placed_feature/boneyard_ribcage.json", placed("ribcage", 18))

    biome_path = DATA / "worldgen/biome/boneyard.json"
    biome = load(biome_path)
    biome["features"][9] = [
        "entersift:bones", "entersift:soul_salt", "entersift:boneyard_ribcage",
        "entersift:giant_skull", "entersift:bone_tusk",
    ]
    dump(biome_path, biome)

    # Keep one consistent ordering for all placed features in the shared vegetation step.
    order = [
        "bones", "soul_salt", "crystals", "ribcage", "boneyard_ribcage", "ruined_arch",
        "rose_spire", "rose_arch", "reef_boulder", "titan_crag", "crag_spire", "crag_boulder",
        "giant_skull", "bone_tusk", "coral_tree", "weeping_soul_tree", "pale_tree", "crag_tree",
        "flowers", "sift_grass", "sift_coral_red", "dense_coral", "sift_coral_yellow", "glow_bulb",
        "pink_grass_pale_grove", "glow_tuft_pale_grove", "sift_bloom_pale_grove",
    ]
    rank = {f"entersift:{name}": index for index, name in enumerate(order)}
    for path in (DATA / "worldgen/biome").glob("*.json"):
        data = load(path)
        if len(data.get("features", [])) > 9:
            data["features"][9] = sorted(data["features"][9], key=lambda feature: (rank.get(feature, 999), feature))
            dump(path, data)


# --------------------------------------------------------------------------- lower, sparser mountain features

def scale_overlay(name: str, xz: float, y_scale: float):
    """Historical in-place crag scaling. NOT idempotent - retained for reference only.

    Applying it repeatedly keeps shrinking the feature (see moderate_crags()), which is why
    the 0.25 crag shapes are pinned in tools/overlays/ instead.
    """
    path = DATA / f"worldgen/feature/{name}.json"
    data = load(path)
    for entry in data.get("features", []):
        placements = entry.get("placement", [])
        xyz = [0, 0, 0]
        for placement in placements:
            if placement.get("type") == "minecraft:offset":
                for axis, i in (("x", 0), ("y", 1), ("z", 2)):
                    xyz[i] += placement[axis]
        if not any(item.get("type") == "minecraft:offset" for item in placements):
            continue
        sx, sy, sz = round(xyz[0] * xz), round(xyz[1] * y_scale), round(xyz[2] * xz)
        non_offsets = [item for item in placements if item.get("type") != "minecraft:offset"]
        entry["placement"] = offsets(sx, sy, sz) + non_offsets
    dump(path, data, compact=True)


def set_rarity(name: str, chance: int):
    path = DATA / f"worldgen/placed_feature/{name}.json"
    data = load(path)
    placements = [item for item in data["placement"] if item.get("type") not in
                  ("minecraft:rarity_filter", "minecraft:count")]
    data["placement"] = [{"type": "minecraft:rarity_filter", "chance": chance}] + placements
    dump(path, data)


# The 0.25 crag shapes are PINNED, not re-derived.
#
# moderate_crags() used to scale the feature files in place (scale_overlay). That transform is not
# idempotent: it divided every offset by 0.82/0.68 again on every run, so titanium_crag went
# 38 -> 12 -> 8 -> 5 blocks tall across runs and the shipped worldgen could never be reproduced.
# (The shipped 0.25 file is the 0.24 shape scaled twice, i.e. 0.82^2 / 0.68^2.)
#
# The scaled shapes were reviewed and shipped, so they live in tools/overlays/ as the base and this
# pass now copies them verbatim - same output on every run, and the shipped tree stays authoritative.
CRAG_OVERLAYS = ("titan_crag", "crag_spire")


def moderate_crags():
    for name in CRAG_OVERLAYS:
        base = ROOT / f"tools/overlays/{name}.json"
        (DATA / f"worldgen/feature/{name}.json").write_bytes(base.read_bytes())
    set_rarity("titan_crag", 6)
    set_rarity("crag_spire", 4)


# --------------------------------------------------------------------------- seamless animated rainbow texture sheets (pure PNG/zlib)

def png_chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # PNG filter: None
        for x in range(width):
            raw.extend(pixels[y * width + x])
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # RGBA8, non-interlaced
    payload = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
    payload += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def lerp_color(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


RAINBOW = [
    (255, 137, 189), (214, 139, 255), (129, 171, 255), (91, 220, 232),
    (102, 230, 175), (239, 228, 115), (255, 164, 132),
]


def rainbow_at(t):
    t %= len(RAINBOW)
    index = int(t)
    blend = t - index
    blend = blend * blend * (3 - 2 * blend)
    return lerp_color(RAINBOW[index], RAINBOW[(index + 1) % len(RAINBOW)], blend)


def ichor_frame(size: int, period: int, frame: int, frames: int, seed: int):
    tau = math.tau
    ph = tau * frame / frames
    # Organic, bilateral rainbow swirls. Still/overlay keep full four-way symmetry; the side-flow
    # tile scrolls vertically while remaining exactly mirrored from left to right.
    flow_phase = ph if period < size else 0.0
    palette_offset = (seed % len(RAINBOW)) / len(RAINBOW) * 0.12
    pixels = []
    for y in range(size):
        v = tau * y / period + flow_phase
        cv, c2v = math.cos(v), math.cos(2 * v)
        for x in range(size):
            u = tau * x / period
            cu, c2u = math.cos(u), math.cos(2 * u)
            field = (
                0.50
                + (0.27 + 0.035 * math.sin(ph)) * cu * math.cos(0.43 * cv + 0.13 * c2v)
                + (0.27 + 0.035 * math.cos(ph)) * cv * math.cos(0.43 * cu - 0.13 * c2u)
                + 0.12 * cu * cv
                + 0.06 * c2u * c2v
            )
            field = max(0.0, min(1.0, field))
            hue = (field * 0.96 + 0.07 * math.sin(ph) + palette_offset) * len(RAINBOW)
            color = rainbow_at(hue)
            # Soft moving highlights create liquid depth without hard white spots or checkerboard noise.
            wave = 0.5 + 0.5 * math.cos((field - 0.5) * math.tau * 3.0 - ph)
            glint = max(0.0, wave - 0.94) * 0.28
            shade = 0.86 + 0.14 * wave
            color = tuple(max(0, min(255, round(c * shade * (1 - glint) + 244 * glint))) for c in color)
            pixels.append((*color, 225))
    return pixels


def ichor_textures():
    frames, size = 48, 32
    for name, period, seed in (("ichor_still", 32, 91), ("ichor_overlay", 32, 91), ("ichor_flow", 16, 92)):
        sheet = []
        for frame in range(frames):
            sheet.extend(ichor_frame(size, period, frame, frames, seed))
        write_png(TEXTURES / "block" / f"{name}.png", size, size * frames, sheet)
        dump(TEXTURES / "block" / f"{name}.png.mcmeta", {"animation": {"frametime": 3, "interpolate": True}})


# --------------------------------------------------------------------------- matching Blub texture, model source of truth is tools/creatures.py

def creatures_module():
    path = ROOT / "tools/creatures.py"
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("entersift_creatures", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def blub_texture():
    creatures = creatures_module()
    spec = creatures.SPECS["blub"]
    size = spec["tex"]
    pixels = [(0, 0, 0, 0)] * (size * size)
    rng = random.Random("blub")

    def put(x, y, color, glow=False):
        if 0 <= x < size and 0 <= y < size:
            pixels[y * size + x] = (*color, 255)

    for part, box in creatures.pack(spec):
        _, _, (w, h, d) = creatures.uv_size(box)
        u, v = box["uv"]
        face_rects = creatures.faces(u, v, w, h, d)
        for face_name, (fx, fy, fw, fh) in face_rects.items():
            light = {"top": 1.12, "bottom": 0.78, "north": 1.0, "south": 0.92, "east": 0.95, "west": 0.95}[face_name]
            for yy in range(fh):
                for xx in range(fw):
                    color = box["base"]
                    sample = rng.random()
                    if box["pat"] == "speckle":
                        factor = 1.10 if sample < 0.08 else (0.90 if sample > 0.94 else 1.0)
                        color = creatures.shade(color, factor)
                    elif box["pat"] == "noise":
                        color = creatures.shade(color, 0.94 + 0.12 * sample)
                    color = creatures.shade(color, light)
                    put(fx + xx, fy + yy, color)
            for ax, ay, aw, ah, color, glow in box["faces"].get(face_name, []):
                for yy in range(ah):
                    for xx in range(aw):
                        if 0 <= ax + xx < fw and 0 <= ay + yy < fh:
                            put(fx + ax + xx, fy + ay + yy, color, glow)

    write_png(TEXTURES / "entity/blub.png", size, size, pixels)
    write_png(TEXTURES / "entity/blub_glow.png", size, size, [(0, 0, 0, 0)] * (size * size))

    # Vanilla spawn-egg silhouette, in the same cyan/indigo palette.
    base, spot = spec["egg"]
    egg, egg_size = [(0, 0, 0, 0)] * 256, 16
    rng = random.Random("blubegg")
    for y in range(egg_size):
        for x in range(egg_size):
            nx, ny = (x - 7.5) / 5.6, (y - 8.6) / 7.0
            if ny < 0:
                nx *= 1 + 0.35 * (-ny)
            r2 = nx * nx + ny * ny
            if r2 <= 1.0:
                edge = r2 > 0.78
                color = creatures.shade(base, 0.55) if edge else creatures.shade(base, 1.08 - 0.25 * ((x + y) / 30))
                if not edge and rng.random() < 0.13:
                    color = spot
                if 3 < x < 7 and 3 < y < 6 and not edge:
                    color = creatures.shade(color, 1.20)
                egg[y * egg_size + x] = (*color, 255)
    write_png(TEXTURES / "item/blub_spawn_egg.png", egg_size, egg_size, egg)

    # Generate the Java model from the edited creature spec, even when Pillow is unavailable.
    creatures.java()


# --------------------------------------------------------------------------- matching cyan Sift-side portal

def portal_functions():
    # Preserve 0.24's portal/travel routing and update only the visible return-side rift style.
    path = DATA / "function/portal/return_tick.mcfunction"
    text = path.read_text()
    text = text.replace('Tags:["sift.return_anchor"],RiftType:0,',
                        'Tags:["sift.return_anchor"],RiftType:4,')
    path.write_text(text)


def main():
    tides()
    jelly_lands()
    dry_terrain()
    bone_worldgen()
    moderate_crags()
    ichor_textures()
    blub_texture()
    portal_functions()
    print("phase19: Sift Overhaul 0.25 — independent tides, Jelly Lands, dry terrain, sparse Ichor, giant Canopy bones, matched Blub and cyan return portal")


if __name__ == "__main__":
    main()
