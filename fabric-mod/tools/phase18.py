#!/usr/bin/env python3
"""Phase 18 (0.18): colossal Sift trees and the Frostbloom Spires biome.

* Trees: every Sift tree is regenerated as a true giant. The trunk is 5x5 and hollow (only the shell is
  emitted, as it is all anyone sees) with flaring buttress roots. 4-5 thick canopy tiers (5 blocks
  deep, radius up to ~13) shrink toward the top and have long frosted strands hanging from each
  drooping rim. No tree is a single log any more (the old crag_tree was 9 logs + 88 leaves).
* Frostbloom Spires (was Titan Crags; ref: the MCD2 Sift ambience shots): red rose spires, pink / blue
  turf and giant white / pale-cyan frosted trees. All stone in the biome becomes rose_spire, and the
  crag features are remapped onto rose_spire / spire_bricks with pale bands.

    python3 tools/phase18.py        (idempotent)

It reuses phase10's JSON helpers by import (phase10's main is guarded; never run phase10 itself).
"""
from __future__ import annotations
import json, math, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phase10 import overlay, write, D  # noqa: E402

FDIR = D / "worldgen/feature"
PDIR = D / "worldgen/placed_feature"
BIOME = "titan_crags"


def giant_tree(rng, height, base_r, tiers, leaf, strand, wood="soulwood", trunk_w=5, thick=5, rmax=13.0):
    pts = []
    half = trunk_w // 2
    # Hollow 5x5 trunk: the shell only, rounded corners above the flared foot, capped on top.
    for y in range(-3, height):
        for x in range(-half, half + 1):
            for z in range(-half, half + 1):
                if max(abs(x), abs(z)) != half:
                    continue
                if abs(x) == half and abs(z) == half and y > 5:
                    continue
                pts.append((x, y, z, wood))
    for x in range(-half + 1, half):
        for z in range(-half + 1, half):
            pts.append((x, height - 1, z, wood))
    # Buttress roots flaring out at the base (six, 2 wide near the trunk).
    for k in range(6):
        ang = k * math.pi / 3 + rng.uniform(-0.25, 0.25)
        for s in range(1, 6):
            rr = half + s
            for w in (0.0, 0.6):
                rx = round(math.cos(ang) * rr + math.cos(ang + math.pi / 2) * w)
                rz = round(math.sin(ang) * rr + math.sin(ang + math.pi / 2) * w)
                for y in range(-2, 6 - s):
                    pts.append((rx, y, rz, wood))

    for t in range(tiers):
        f = t / max(1, tiers - 1)
        cy = round(height * (0.34 + 0.62 * f))
        r = min(rmax, base_r * (1.0 - 0.5 * f))
        ox = 0 if t in (0, tiers - 1) else rng.choice((-1, 0, 1))
        oz = 0 if t in (0, tiers - 1) else rng.choice((-1, 0, 1))
        # Thick branches carrying the tier (two blocks tall), except for the top tier.
        if t < tiers - 1:
            for k in range(6):
                ang = k * 2 * math.pi / 6 + rng.uniform(-0.3, 0.3)
                for s in range(half + 1, int(r * 0.8)):
                    bx, bz = round(math.cos(ang) * s), round(math.sin(ang) * s)
                    by = cy - 3 + (s - half) // 3
                    pts.append((bx, by, bz, wood))
                    pts.append((bx, by - 1, bz, wood))
        R = int(math.ceil(r)) + 2
        for x in range(-R, R + 1):
            for z in range(-R, R + 1):
                dx, dz = x - ox, z - oz
                d = 0.55 * max(abs(dx), abs(dz)) + 0.45 * math.hypot(dx, dz) + rng.uniform(-0.35, 0.35)
                if d > r + 0.3:
                    continue
                # Domed: thickest in the middle, the rim droops two blocks.
                sag = 2 if d > r - 1.2 else (1 if d > r - 2.6 else 0)
                dome = 1 if d < r * 0.45 else 0
                bottom, top = cy - sag, cy + thick - 1 + dome - (2 if d > r - 0.8 else (1 if d > r - 2.0 else 0))
                edge = d > r - 1.6
                for y in range(bottom, top + 1):
                    if y == bottom or y == top or edge:
                        if edge and rng.random() < 0.04:
                            continue
                        pts.append((x, y, z, leaf))
                # Long frosted strands hanging from the drooping rim; longest on the lowest tier.
                if d > r - 2.0 and rng.random() < 0.38:
                    length = rng.randint(3, 5 + (tiers - t) * 2)
                    for h in range(1, length + 1):
                        pts.append((x, bottom - h, z, strand if h % 3 else leaf))
    # Crown tuft above the top tier.
    top_y = round(height * 0.96) + thick + 1
    for x in range(-2, 3):
        for z in range(-2, 3):
            if abs(x) + abs(z) <= 2:
                pts.append((x, top_y, z, leaf))
                if abs(x) + abs(z) <= 1:
                    pts.append((x, top_y + 1, z, leaf))
    pts.append((0, top_y + 2, 0, leaf))
    return pts


def write_compact(name, pts):
    feature = overlay(pts)
    path = FDIR / f"{name}.json"
    path.write_text(json.dumps(feature, separators=(",", ":")) + "\n")
    ys = [p[1] for p in pts]
    xs = [abs(p[0]) for p in pts] + [abs(p[2]) for p in pts]
    print(f"{name}: {len(feature['features'])} blocks, y {min(ys)}..{max(ys)}, reach {max(xs)}, {path.stat().st_size // 1024} KB")
    return len(feature["features"])


def set_rarity(name, chance):
    p = PDIR / f"{name}.json"
    d = json.loads(p.read_text())
    for m in d["placement"]:
        if m["type"] == "minecraft:rarity_filter":
            m["chance"] = chance
    write(p, d)


def trees():
    rng = random.Random(1818)
    specs = {
        "pale_tree": (38, 13.0, 5, "pale_canopy", "soul_canopy", "soulwood"),
        "weeping_soul_tree": (34, 12.0, 4, "soul_canopy", "pale_canopy", "soulwood"),
        "verdant_tree": (34, 12.0, 4, "verdant_canopy", "violet_canopy", "verdant_wood"),
        "violet_tree": (32, 11.5, 4, "violet_canopy", "verdant_canopy", "violet_wood"),
        # Frostbloom Spires: the giant frosted white / pale-cyan tree (replaces the old one-log crag tree).
        "crag_tree": (40, 13.0, 5, "pale_canopy", "soul_canopy", "soulwood"),
    }
    counts = {}
    for name, (h, r, tiers, leaf, strand, wood) in specs.items():
        counts[name] = write_compact(name, giant_tree(rng, h, r, tiers, leaf, strand, wood))
    for name, chance in (("pale_tree", 5), ("weeping_soul_tree", 6), ("crag_tree", 3)):
        set_rarity(name, chance)
    for name in ("verdant_tree", "violet_tree"):
        set_rarity(name, 4)
    return counts


REMAP = {
    "entersift:crag_rock": "entersift:rose_spire",
    "entersift:crag_rock_dark": "entersift:spire_bricks",
    "entersift:crag_band": "entersift:pale_crust",
    "entersift:crag_moss": "entersift:pink_turf",
    "minecraft:moss_block": "entersift:pink_turf",
    "entersift:soulwood": "entersift:spire_bricks",
    "entersift:pale_canopy": "entersift:pale_canopy",
}


def remap_rocks():
    for name in ("titan_crag", "crag_spire", "crag_boulder"):
        p = FDIR / f"{name}.json"
        d = json.loads(p.read_text())
        n = 0
        for f in d["features"]:
            tp = f["feature"].get("to_place", {})
            if tp.get("id") in REMAP:
                tp["id"] = REMAP[tp["id"]]
                n += 1
        p.write_text(json.dumps(d, separators=(",", ":")) + "\n")
        print(f"{name}: remapped {n} blocks onto red spire stone")
    set_rarity("titan_crag", 2)
    # More spires: every chunk rather than every other chunk.
    p = PDIR / "crag_spire.json"
    d = json.loads(p.read_text())
    d["placement"] = [m for m in d["placement"] if m["type"] != "minecraft:rarity_filter"]
    if not any(m["type"] == "minecraft:count" for m in d["placement"]):
        d["placement"].insert(0, {"type": "minecraft:count", "count": 1})
    write(p, d)
    # Flowers: denser sift blooms.
    p = PDIR / f"sift_bloom_{BIOME}.json"
    d = json.loads(p.read_text())
    for m in d["placement"]:
        if m["type"] == "minecraft:count":
            m["count"] = 8
        if m["type"] == "minecraft:block_predicate_filter":
            for pred in m["predicate"].get("predicates", []):
                blocks = pred.get("blocks")
                if isinstance(blocks, list) and "entersift:rose_spire" not in blocks:
                    blocks += ["entersift:rose_spire", "entersift:spire_bricks"]
    write(p, d)


def material_rule():
    p = D / "worldgen/material_rule/the_sift.json"
    d = json.loads(p.read_text())
    for i, rule in enumerate(d["sequence"]):
        if isinstance(rule, dict) and rule.get("if_true", {}) == {"type": "minecraft:biome", "biome_is": f"entersift:{BIOME}"}:
            d["sequence"][i] = {
                "type": "minecraft:condition",
                "if_true": {"type": "minecraft:biome", "biome_is": f"entersift:{BIOME}"},
                "then_run": {"type": "minecraft:sequence", "sequence": [
                    {"type": "minecraft:condition", "if_true": "minecraft:on_floor", "then_run": {
                        "type": "minecraft:sequence", "sequence": [
                            {"type": "minecraft:condition",
                             "if_true": {"type": "minecraft:noise_threshold", "noise": "minecraft:surface",
                                         "min_threshold": 0.1, "max_threshold": 10.0},
                             "then_run": {"type": "minecraft:block", "result_state": "entersift:pink_turf"}},
                            {"type": "minecraft:block", "result_state": "entersift:blue_turf"}]}},
                    # 0.18 Frostbloom Spires: every stone block in the biome is red spire rock.
                    {"type": "minecraft:block", "result_state": "entersift:rose_spire"}]}}
            break
    else:
        raise SystemExit("titan_crags material rule not found")
    write(p, d)


def biome():
    p = D / f"worldgen/biome/{BIOME}.json"
    d = json.loads(p.read_text())
    a = d["attributes"]
    a["minecraft:visual/ambient_particles"] = {"modifier": "append", "argument": [
        {"particle": {"type": "minecraft:cherry_leaves"}, "probability": 0.006},
        {"particle": {"type": "minecraft:white_ash"}, "probability": 0.008},
        {"particle": {"type": "minecraft:snowflake"}, "probability": 0.003},
        {"particle": {"type": "minecraft:glow"}, "probability": 0.003}]}
    a["minecraft:visual/fog_color"] = "#f4dfe6"
    d["effects"]["water_color"] = "#7fd3cf"
    write(p, d)
    lang = D.parent.parent / "assets/entersift/lang/en_us.json"
    ld = json.loads(lang.read_text())
    ld[f"biome.entersift.{BIOME}"] = "Frostbloom Spires"
    lang.write_text(json.dumps(ld, indent=2, ensure_ascii=False) + "\n")


def main():
    trees()
    remap_rocks()
    material_rule()
    biome()


if __name__ == "__main__":
    main()
