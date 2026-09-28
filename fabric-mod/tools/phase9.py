#!/usr/bin/env python3
"""0.8.0 biomes (idempotent): Boneyard, Coral Expanse and Titan Crags — a gigantic rocky area with
towering banded crags crowned by twisted trees. Features are fixed-geometry overlays (like the
existing rose spires), placed only into air so they sit on the terrain surface."""
import json, math, random
from pathlib import Path
D = Path(__file__).resolve().parents[1] / "src/main/resources/data/entersift"

def write(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + "\n")

def overlay(points):
    seen, feats = set(), []
    for (x, y, z, b) in points:
        if (x, y, z) in seen: continue
        seen.add((x, y, z))
        bid = b if ":" in b else f"entersift:{b}"
        feats.append({"feature": {"type": "minecraft:simple_block", "to_place": {"id": bid}},
                      "placement": [{"type": "minecraft:offset", "x": x, "y": y, "z": z},
                                    {"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:air"}}]})
    return {"type": "minecraft:overlay", "features": feats}

def placed(feature, head):
    return {"feature": f"entersift:{feature}", "placement": head + [
        {"type": "minecraft:in_square"}, {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"}, {"type": "minecraft:biome"}]}

rng = random.Random(809)

# ------------------------------------------------------------------ Boneyard
def giant_skull():
    pts = []
    for x in range(-3, 4):
        for y in range(0, 6):
            for z in range(-3, 4):
                if (x * x) / 12 + ((y - 3) ** 2) / 9 + (z * z) / 12 > 1.05: continue
                if z == -3 and y in (3, 4) and x in (-2, -1, 1, 2): continue       # eye sockets
                if z == -3 and y == 1 and x == 0: continue                          # nose hole
                pts.append((x, y, z, "minecraft:bone_block"))
    for x in (-2, 0, 2):  # teeth
        pts.append((x, 0, -4, "minecraft:bone_block"))
    pts += [(-1, 4, -2, "minecraft:soul_lantern"), (1, 4, -2, "minecraft:soul_lantern")]  # ghostly eyes
    return pts

def tusk(sign=1):
    pts = []
    for y in range(0, 10):
        off = int(round((y / 9) ** 2 * 3)) * sign
        pts.append((off, y, 0, "minecraft:bone_block"))
        if y < 4: pts.append((off, y, 1, "minecraft:bone_block"))
    return pts

# ------------------------------------------------------------------ Coral Expanse
def coral_tree():
    pts = [(0, y, 0, "reef_stone") for y in range(3)]
    tips = ["minecraft:pearlescent_froglight", "minecraft:ochre_froglight", "minecraft:verdant_froglight"]
    for k in range(6):
        ang = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
        mat = "minecraft:pink_concrete" if k % 2 == 0 else "minecraft:orange_terracotta"
        x = z = 0.0; y = 2.0
        for s in range(6):
            x += math.cos(ang) * 0.8; z += math.sin(ang) * 0.8; y += 0.9
            pts.append((int(round(x)), int(round(y)), int(round(z)), mat))
        pts.append((int(round(x)), int(round(y)) + 1, int(round(z)), tips[k % 3]))
    return pts

# ------------------------------------------------------------------ Titan Crags
BANDS = ["minecraft:stone", "minecraft:andesite", "minecraft:tuff", "minecraft:stone", "minecraft:calcite", "minecraft:stone"]

def twisted_tree(ox, oy, oz, height=7):
    pts, x, z = [], 0, 0
    for y in range(height):
        if y > 2 and y % 2 == 0: x += rng.choice((-1, 0, 1)); z += rng.choice((-1, 0, 1))
        pts.append((ox + x, oy + y, oz + z, "soulwood"))
    top = oy + height
    for dx in range(-4, 5):
        for dz in range(-4, 5):
            d = dx * dx + dz * dz
            if d <= 16: pts.append((ox + x + dx, top, oz + z + dz, "pale_canopy"))
            if d <= 7: pts.append((ox + x + dx, top + 1, oz + z + dz, "pale_canopy"))
            if 9 <= d <= 16 and rng.random() < 0.45:
                for k in range(1, rng.randint(2, 4)):
                    pts.append((ox + x + dx, top - k, oz + z + dz, "pale_canopy"))
    return pts

def crag(height, radius):
    pts = []
    for y in range(height):
        t = y / height
        r = radius * (1 - 0.72 * t) + 0.6 * math.sin(y * 0.7)
        band = BANDS[(y // 4) % len(BANDS)]
        for x in range(-radius - 1, radius + 2):
            for z in range(-radius - 1, radius + 2):
                wob = 0.8 * math.sin(x * 1.3 + y * 0.4) * math.cos(z * 1.1 - y * 0.3)
                if x * x + z * z <= (r + wob) ** 2:
                    pts.append((x, y, z, band))
    for x in range(-2, 3):
        for z in range(-2, 3):
            if x * x + z * z <= 4: pts.append((x, height, z, "minecraft:moss_block"))
    pts += twisted_tree(0, height + 1, 0, 6)
    return pts

def boulder():
    return [(x, y, z, rng.choice(["minecraft:stone", "minecraft:andesite", "minecraft:mossy_cobblestone"]))
            for x in range(-3, 4) for y in range(0, 4) for z in range(-3, 4) if x * x + (y * 1.4) ** 2 + z * z <= 10]

FEATURES = {
    "giant_skull": (giant_skull(), [{"type": "minecraft:rarity_filter", "chance": 3}]),
    "bone_tusk": (tusk(1) + [(x + 3, y, z, b) for (x, y, z, b) in tusk(-1)], [{"type": "minecraft:rarity_filter", "chance": 2}]),
    "coral_tree": (coral_tree(), [{"type": "minecraft:count", "count": 2}]),
    "titan_crag": (crag(30, 6), [{"type": "minecraft:rarity_filter", "chance": 3}]),
    "crag_spire": (crag(20, 4), [{"type": "minecraft:rarity_filter", "chance": 2}]),
    "crag_boulder": (boulder(), [{"type": "minecraft:count", "count": 1}]),
    "crag_tree": (twisted_tree(0, 0, 0, 9), [{"type": "minecraft:rarity_filter", "chance": 2}]),
}
for name, (pts, head) in FEATURES.items():
    write(D / f"worldgen/feature/{name}.json", overlay(pts))
    write(D / f"worldgen/placed_feature/{name}.json", placed(name, head))
# Dense ribcages / corals reuse existing features with their own placements.
write(D / "worldgen/placed_feature/boneyard_ribcage.json", placed("ribcage", [{"type": "minecraft:rarity_filter", "chance": 1}]))
write(D / "worldgen/placed_feature/dense_coral.json", placed("sift_coral_red", [{"type": "minecraft:count", "count": 30}]))

BIOMES = {
    "boneyard": dict(water="#8fb8b0", fog="#c9bfae", sky="#d8d0c0", particle="minecraft:white_ash", prob=0.012, floor="minecraft:calcite",
                     feats=["entersift:bones", "entersift:soul_salt", "entersift:boneyard_ribcage", "entersift:giant_skull", "entersift:bone_tusk"]),
    "coral_expanse": dict(water="#35d6c8", fog="#5fb8b4", sky="#7fd4cf", particle="minecraft:glow", prob=0.004, floor="entersift:reef_stone",
                          feats=["entersift:reef_boulder", "entersift:coral_tree", "entersift:dense_coral", "entersift:sift_coral_yellow", "entersift:glow_bulb"]),
    "titan_crags": dict(water="#4fa0a8", fog="#8fa7a6", sky="#a3c4c2", particle="minecraft:spore_blossom_air", prob=0.003, floor="minecraft:stone",
                        feats=["entersift:titan_crag", "entersift:crag_spire", "entersift:crag_boulder", "entersift:crag_tree", "entersift:sift_grass"]),
}
template = json.loads((D / "worldgen/biome/singer_meadow.json").read_text())
for name, b in BIOMES.items():
    data = json.loads(json.dumps(template))
    data["effects"]["water_color"] = b["water"]
    data["attributes"]["minecraft:visual/fog_color"] = b["fog"]
    data["attributes"]["minecraft:visual/sky_color"] = b["sky"]
    data["attributes"]["minecraft:visual/ambient_particles"] = {"modifier": "append", "argument": [{"particle": {"type": b["particle"]}, "probability": b["prob"]}]}
    data["features"] = [[] for _ in range(11)]
    data["features"][9] = b["feats"]
    write(D / f"worldgen/biome/{name}.json", data)

# One global feature order (prevents "Feature order cycle" crashes).
order = ["bones", "soul_salt", "crystals", "ribcage", "boneyard_ribcage", "ruined_arch", "rose_spire", "rose_arch", "reef_boulder",
         "titan_crag", "crag_spire", "crag_boulder", "giant_skull", "bone_tusk", "coral_tree",
         "weeping_soul_tree", "pale_tree", "crag_tree", "flowers", "sift_grass", "sift_coral_red", "dense_coral", "sift_coral_yellow", "glow_bulb"]
rank = {f"entersift:{n}": i for i, n in enumerate(order)}
for p in (D / "worldgen/biome").glob("*.json"):
    data = json.loads(p.read_text())
    data["features"] = [sorted(step, key=lambda f: (rank.get(f, 999), f)) for step in data["features"]]
    write(p, data)

rule_path = D / "worldgen/material_rule/the_sift.json"
rule = json.loads(rule_path.read_text())
seq = rule["sequence"]
have = {json.dumps(s) for s in seq}
idx = next(i for i, s in enumerate(seq) if isinstance(s, dict) and s.get("type") == "minecraft:condition" and s.get("if_true") == "minecraft:on_floor")
for name, b in BIOMES.items():
    cond = {"type": "minecraft:condition", "if_true": {"type": "minecraft:biome", "biome_is": f"entersift:{name}"},
            "then_run": {"type": "minecraft:condition", "if_true": "minecraft:on_floor", "then_run": {"type": "minecraft:block", "result_state": b["floor"]}}}
    if json.dumps(cond) not in have:
        seq.insert(idx, cond); idx += 1
write(rule_path, rule)

dim_path = D / "dimension/the_sift.json"
dim = json.loads(dim_path.read_text())
lst = dim["generator"]["biome_source"]["biomes"]
for name in BIOMES:
    if f"entersift:{name}" not in lst: lst.append(f"entersift:{name}")
write(dim_path, dim)
print("phase9 biomes:", ", ".join(BIOMES), "| features:", ", ".join(FEATURES))
