#!/usr/bin/env python3
"""0.11 world pass (idempotent; run after the other generators).

* Custom Sift rock / coral / turf blocks replace every vanilla block in Sift worldgen (no grey stone,
  calcite, tuff or andesite): dusty rose-mauve crag rock like the trailer canyons.
* Blue and pink turf surfaces (singer meadow, pale grove, titan crags) with noise patches.
* Much more foliage: blue grass, pink grass, glowing cyan tufts and sift blooms on every surface.
* More ambient particles (cyan glow motes, floating spores).
* Sift music + ambience attributes on the dimension.
* New portal interior mosaic (bright cyan pixel mosaic from the blue portal ref).
"""
import json, re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / "src/main/resources"
A = R / "assets/entersift"
D = R / "data/entersift"
rng = np.random.default_rng(1111)


def dump(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n")


def load(p): return json.loads(p.read_text())


def save_png(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").save(A / f"textures/block/{name}.png")


def rgba(c, a=255): return np.array([c[0], c[1], c[2], a], dtype=np.float64)


def hash2(x, y, s):
    h = (x * 374761393 + y * 668265263 + s * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return (h ^ (h >> 16)) / 0xFFFFFFFF


# ------------------------------------------------------------------ textures (16x16, tile seamlessly)

def strata(seed, bands, speck=0.12, crack=None):
    """Horizontal sedimentary strata with pixel speckle, like the Sift canyon walls."""
    img = np.zeros((16, 16, 4))
    rows = []
    y = 0
    k = 0
    while y < 16:
        h = 2 + int(hash2(k, 1, seed) * 3)
        rows += [bands[k % len(bands)]] * h
        y += h; k += 1
    for y in range(16):
        for x in range(16):
            # band boundary wobble
            yy = (y + (1 if hash2(x // 3, y, seed + 5) > 0.8 else 0)) % 16
            c = np.array(rows[yy], dtype=float)
            r = hash2(x, y, seed)
            if r < speck: c = c * 0.86
            elif r > 1 - speck: c = np.minimum(255, c * 1.1 + 6)
            img[y, x] = rgba(c)
    if crack:
        for y in range(16):
            x = int(8 + 5 * np.sin((y + seed) * 0.7)) % 16
            if hash2(x, y, seed + 9) > 0.35: img[y, x, :3] *= crack
    return img


def mottled(seed, cols, cell=3, speck=0.15):
    img = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            c = np.array(cols[int(hash2((x // cell) % (16 // cell + 1), y // cell, seed) * len(cols))], float)
            r = hash2(x, y, seed + 3)
            if r < speck: c *= 0.88
            elif r > 1 - speck: c = np.minimum(255, c * 1.08 + 8)
            img[y, x] = rgba(c)
    return img


def coral(seed, base, dark, light):
    img = mottled(seed, [base, base, light], 2, 0.1)
    for y in range(16):
        for x in range(16):
            if hash2(x, y, seed + 7) > 0.84:  # pores
                img[y, x] = rgba(dark)
                if y + 1 < 16: img[y + 1, x, :3] = np.minimum(255, np.array(light) * 1.05)
    return img


def grass_top(seed, cols):
    img = mottled(seed, cols, 2, 0.12)
    for y in range(16):
        for x in range(16):
            if hash2(x, y, seed + 2) > 0.9: img[y, x, :3] = np.minimum(255, img[y, x, :3] * 1.18)
    return img


def turf_side(seed, earth, grass, grass_dark):
    img = strata(seed, earth, 0.12)
    for x in range(16):
        drip = 3 + int(hash2(x, 0, seed) * 3) + (2 if hash2(x, 1, seed) > 0.8 else 0)
        for y in range(drip):
            c = grass if (y < drip - 1 or hash2(x, y, seed + 4) > 0.4) else grass_dark
            if hash2(x, y, seed + 6) > 0.85: c = np.minimum(255, np.array(c) * 1.12)
            img[y, x] = rgba(c)
    return img


def cross_plant(seed, blade_cols, tip=None, blades=7, height=(7, 14), flower=None):
    img = np.zeros((16, 16, 4))
    for b in range(blades):
        x = int(1 + hash2(b, 0, seed) * 14)
        h = int(height[0] + hash2(b, 1, seed) * (height[1] - height[0]))
        lean = (hash2(b, 2, seed) - 0.5) * 0.5
        for i in range(h):
            y = 15 - i
            xx = int(round(x + lean * i)) % 16
            c = blade_cols[min(len(blade_cols) - 1, i * len(blade_cols) // max(h, 1))]
            if tip is not None and i >= h - 2: c = tip
            img[y, xx] = rgba(c)
    if flower:
        petal, centre = flower
        for (cx, cy) in [(5, 4), (11, 6), (8, 2)]:
            for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]:
                img[cy + dy, cx + dx] = rgba(petal)
            img[cy, cx] = rgba(centre)
            for yy in range(cy + 2, 16):
                img[yy, cx] = rgba(blade_cols[0])
    return img


def textures():
    rose = [(186, 122, 132), (172, 108, 124), (196, 136, 140), (158, 98, 118), (180, 116, 128)]
    save_png(strata(11, rose, 0.14, crack=0.82), "crag_rock")
    save_png(strata(12, [(118, 70, 96), (104, 60, 88), (128, 80, 104), (96, 56, 82)], 0.14), "crag_rock_dark")
    save_png(strata(13, [(176, 96, 74), (160, 84, 66), (188, 110, 82), (150, 80, 64)], 0.12), "crag_band")
    save_png(mottled(14, [(236, 208, 210), (226, 194, 200), (244, 222, 222)], 2, 0.1), "pale_crust")
    moss = strata(15, rose, 0.12)
    for y in range(16):
        for x in range(16):
            if hash2(x // 2, y // 2, 16) > 0.55 or (y < 4 and hash2(x, y, 17) > 0.3):
                moss[y, x] = rgba((64, 184, 176) if hash2(x, y, 18) > 0.35 else (44, 150, 150))
    save_png(moss, "crag_moss")
    save_png(coral(21, (238, 120, 160), (170, 70, 110), (255, 176, 204)), "coral_pink_block")
    save_png(coral(22, (240, 142, 82), (180, 90, 50), (255, 194, 124)), "coral_orange_block")
    earth = [(150, 100, 118), (138, 90, 110), (160, 110, 124)]
    blue = [(92, 176, 226), (80, 160, 214), (112, 192, 236), (98, 182, 230)]
    pink = [(240, 150, 200), (222, 124, 182), (252, 186, 222), (232, 140, 192)]
    save_png(grass_top(31, blue), "blue_turf_top")
    save_png(turf_side(32, earth, (96, 176, 236), (64, 130, 204)), "blue_turf_side")
    save_png(grass_top(33, pink), "pink_turf_top")
    save_png(turf_side(34, earth, (238, 146, 198), (206, 110, 168)), "pink_turf_side")
    save_png(strata(35, earth, 0.14), "sift_earth")
    save_png(cross_plant(41, [(52, 118, 196), (80, 160, 230), (130, 204, 250)], blades=12, height=(8, 15)), "blue_grass")
    save_png(cross_plant(42, [(200, 96, 160), (236, 140, 196), (252, 190, 226)], blades=12, height=(8, 15)), "pink_grass")
    save_png(cross_plant(43, [(40, 170, 170), (90, 230, 220), (150, 255, 245)], tip=(230, 255, 255), blades=10, height=(6, 13)), "glow_tuft")
    save_png(cross_plant(44, [(56, 150, 140), (72, 180, 168)], blades=3, height=(4, 9), flower=((255, 150, 210), (255, 240, 170))), "sift_bloom")
    # Carapace no longer reads as End stone: pale bone plates with rose seams.
    car = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            plate = (x // 8 + (y // 4) % 2) % 2
            c = np.array((236, 214, 204) if plate else (224, 198, 192), float)
            if y % 4 == 0 or (x + (4 if (y // 4) % 2 else 0)) % 8 == 0: c = np.array((178, 118, 130), float)
            elif hash2(x, y, 51) > 0.88: c = c * 0.92
            car[y, x] = rgba(c)
    save_png(car, "carapace")


def portal_mosaic():
    """Bright cyan pixel mosaic (blue portal ref), horizontally periodic for the UV scroll."""
    W, H = 256, 128
    img = np.zeros((H, W, 3))
    yy = np.arange(H)[:, None] / H
    base = 0.55 + 0.45 * np.exp(-((yy - 0.5) / 0.35) ** 2)
    img[:] = np.array([60, 200, 220]) * base[..., None] * np.ones((1, W, 1))
    r = np.random.default_rng(404)
    for _ in range(900):
        s = int(r.choice([4, 8, 8, 12, 16, 16, 24, 32]))
        x, y = int(r.integers(0, W // 4)) * 4, int(r.integers(0, H // 4)) * 4
        t = r.random()
        col = np.array([30, 170, 200]) * (1 - t) + np.array([225, 255, 255]) * t
        if r.random() < 0.18: col = np.array([20, 120, 160])
        for dx in range(s):
            img[y:y + s, (x + dx) % W] = img[y:y + s, (x + dx) % W] * 0.25 + col * 0.75
    out = np.dstack([np.clip(img, 0, 255), np.full((H, W), 255)]).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(A / "textures/rift/interior_portal.png")


# ------------------------------------------------------------------ block assets

CUBES = {"crag_rock": "Crag Rock", "crag_rock_dark": "Dark Crag Rock", "crag_band": "Rust Crag Band",
         "pale_crust": "Pale Crust", "crag_moss": "Mossy Crag Rock", "coral_pink_block": "Pink Sift Coral Block",
         "coral_orange_block": "Orange Sift Coral Block", "sift_earth": "Sift Earth"}
TURF = {"blue_turf": "Blue Sift Turf", "pink_turf": "Pink Sift Turf"}
PLANTS = {"blue_grass": "Blue Sift Grass", "pink_grass": "Pink Sift Grass", "glow_tuft": "Glow Tuft", "sift_bloom": "Sift Bloom"}


def block_assets():
    lang_p = A / "lang/en_us.json"
    lang = load(lang_p)

    def common(name, label):
        dump(A / f"blockstates/{name}.json", {"variants": {"": {"model": f"entersift:block/{name}"}}})
        dump(A / f"items/{name}.json", {"model": {"type": "minecraft:model", "model": f"entersift:item/{name}"}})
        dump(D / f"loot_table/blocks/{name}.json", {"type": "minecraft:block", "pools": [{
            "rolls": 1, "entries": [{"type": "minecraft:item", "name": f"entersift:{name}"}],
            "condition": {"type": "minecraft:survives_explosion"}}]})
        lang[f"block.entersift.{name}"] = label

    for n, l in CUBES.items():
        common(n, l)
        dump(A / f"models/block/{n}.json", {"parent": "minecraft:block/cube_all", "textures": {"all": f"entersift:block/{n}"}})
        dump(A / f"models/item/{n}.json", {"parent": f"entersift:block/{n}"})
    for n, l in TURF.items():
        common(n, l)
        tex = {"parent": "minecraft:block/cube_bottom_top", "textures": {
            "top": f"entersift:block/{n}_top", "side": f"entersift:block/{n}_side", "bottom": "entersift:block/sift_earth"}}
        dump(A / f"models/block/{n}.json", tex)
        dump(A / f"models/item/{n}.json", tex)
    for n, l in PLANTS.items():
        common(n, l)
        dump(A / f"models/block/{n}.json", {"parent": "minecraft:block/cross", "textures": {"cross": f"entersift:block/{n}"}})
        dump(A / f"models/item/{n}.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"entersift:block/{n}"}})
    # Subtitles for 0.11 sounds.
    lang["subtitles.entersift.ambient.sift.mood"] = "The Sift hums"
    kinds = {"blub": "Blub", "sculker": "Sculker", "sculkling": "Sculkling", "antlerling": "Antlerling",
             "drift_jelly": "Drift Jelly", "licker": "Licker", "overseer": "Overseer", "twisted_warden": "Twisted Warden",
             "note_bird": "Note Bird", "singer": "Singer"}
    for k, label in kinds.items():
        lang[f"subtitles.entersift.entity.{k}.ambient"] = f"{label} calls"
        lang[f"subtitles.entersift.entity.{k}.hurt"] = f"{label} hurts"
        lang[f"subtitles.entersift.entity.{k}.death"] = f"{label} dies"
    dump(lang_p, lang)


# ------------------------------------------------------------------ worldgen

REMAP = {"minecraft:stone": "entersift:crag_rock", "minecraft:andesite": "entersift:crag_rock_dark",
         "minecraft:tuff": "entersift:crag_band", "minecraft:calcite": "entersift:pale_crust",
         "minecraft:mossy_cobblestone": "entersift:crag_moss", "minecraft:pink_concrete": "entersift:coral_pink_block",
         "minecraft:orange_terracotta": "entersift:coral_orange_block", "minecraft:allium": "entersift:sift_bloom",
         "minecraft:cobblestone": "entersift:crag_rock_dark", "minecraft:gravel": "entersift:sift_earth",
         "minecraft:granite": "entersift:crag_band", "minecraft:diorite": "entersift:pale_crust"}


def fix_old_loot():
    """26.x pools take a single "condition" object; older generators wrote a "conditions" list."""
    n = 0
    for p in (D / "loot_table/blocks").glob("*.json"):
        d = load(p)
        dirty = False
        for pool in d.get("pools", []):
            if pool.get("conditions") == [{"condition": "minecraft:survives_explosion"}]:
                del pool["conditions"]; pool["condition"] = {"type": "minecraft:survives_explosion"}; dirty = True
        if dirty: dump(p, d); n += 1
    return n


def remap_features():
    changed = 0
    for p in list((D / "worldgen/feature").glob("*.json")) + [D / "worldgen/material_rule/the_sift.json"]:
        s = p.read_text()
        t = s
        for a, b in REMAP.items():
            t = t.replace(f'"{a}"', f'"{b}"')
        if t != s:
            p.write_text(t); changed += 1
    return changed


def noise_patch(inside, outside):
    return {"type": "minecraft:sequence", "sequence": [
        {"type": "minecraft:condition",
         "if_true": {"type": "minecraft:noise_threshold", "noise": "minecraft:surface", "min_threshold": 0.2, "max_threshold": 10.0},
         "then_run": {"type": "minecraft:block", "result_state": inside}},
        {"type": "minecraft:block", "result_state": outside}]}


def material_rule():
    p = D / "worldgen/material_rule/the_sift.json"
    rule = load(p)
    seq = rule["sequence"]
    surfaces = {"entersift:singer_meadow": noise_patch("entersift:pink_turf", "entersift:blue_turf"),
                "entersift:pale_grove": noise_patch("entersift:blue_turf", "entersift:pink_turf"),
                "entersift:titan_crags": noise_patch("entersift:crag_moss", "entersift:blue_turf"),
                "entersift:boneyard": {"type": "minecraft:block", "result_state": "entersift:pale_crust"}}
    for r in seq:
        if isinstance(r, dict) and r.get("type") == "minecraft:condition" and isinstance(r["if_true"], dict) and r["if_true"].get("type") == "minecraft:biome":
            b = r["if_true"]["biome_is"]
            if b in surfaces:
                r["then_run"]["then_run"] = surfaces[b]
    # Canyon walls and everything under the surface: rose-mauve crag rock, not brick saltstone.
    seq[-1] = {"type": "minecraft:block", "result_state": "entersift:crag_rock"}
    dump(p, rule)
    ns = D / "worldgen/noise_settings/the_sift.json"
    n = load(ns); n["default_block"] = "entersift:crag_rock"; dump(ns, n)


GROUND = ["entersift:blue_turf", "entersift:pink_turf", "entersift:teal_path", "entersift:rose_path", "entersift:reef_stone",
          "entersift:pale_crust", "entersift:crag_rock", "entersift:crag_moss", "entersift:singer_moss", "entersift:carapace",
          "entersift:saltstone", "entersift:sift_earth", "entersift:crag_band", "entersift:crag_rock_dark"]
FOLIAGE = ["blue_grass", "pink_grass", "glow_tuft", "sift_bloom"]
COUNTS = {  # per chunk
    "singer_meadow": {"blue_grass": 40, "pink_grass": 20, "glow_tuft": 10, "sift_bloom": 6},
    "pale_grove": {"blue_grass": 18, "pink_grass": 36, "glow_tuft": 10, "sift_bloom": 5},
    "titan_crags": {"blue_grass": 24, "pink_grass": 6, "glow_tuft": 12, "sift_bloom": 3},
    "rose_spires": {"blue_grass": 8, "pink_grass": 22, "glow_tuft": 6, "sift_bloom": 4},
    "coral_expanse": {"blue_grass": 6, "pink_grass": 10, "glow_tuft": 14},
    "tidepool_reef": {"blue_grass": 6, "glow_tuft": 12},
    "boneyard": {"glow_tuft": 5, "pink_grass": 4},
    "carapace": {"glow_tuft": 6, "blue_grass": 4},
    "saltwound_expanse": {"glow_tuft": 8, "blue_grass": 6},
}
PARTICLES = {  # extra ambient particles per biome
    "singer_meadow": [("minecraft:glow", 0.006), ("minecraft:spore_blossom_air", 0.004)],
    "pale_grove": [("minecraft:glow", 0.004), ("minecraft:spore_blossom_air", 0.006)],
    "titan_crags": [("minecraft:glow", 0.004), ("minecraft:white_ash", 0.004)],
    "rose_spires": [("minecraft:spore_blossom_air", 0.004), ("minecraft:glow", 0.002)],
    "coral_expanse": [("minecraft:spore_blossom_air", 0.003)],
    "tidepool_reef": [("minecraft:spore_blossom_air", 0.003)],
    "boneyard": [("minecraft:glow", 0.002)],
    "carapace": [("minecraft:glow", 0.003), ("minecraft:white_ash", 0.004)],
    "saltwound_expanse": [("minecraft:glow", 0.004), ("minecraft:white_ash", 0.004)],
}


def foliage():
    for f in FOLIAGE:
        dump(D / f"worldgen/feature/{f}.json", {"type": "minecraft:simple_block", "to_place": {"id": f"entersift:{f}"}})
    for biome, counts in COUNTS.items():
        for f, c in counts.items():
            dump(D / f"worldgen/placed_feature/{f}_{biome}.json", {"feature": f"entersift:{f}", "placement": [
                {"type": "minecraft:count", "count": c},
                {"type": "minecraft:in_square"},
                {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"},
                {"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:all_of", "predicates": [
                    {"type": "minecraft:matching_blocks", "blocks": "minecraft:air"},
                    {"type": "minecraft:matching_blocks", "offset": [0, -1, 0], "blocks": GROUND}]}},
                {"type": "minecraft:biome"}]})
        bp = D / f"worldgen/biome/{biome}.json"
        b = load(bp)
        while len(b["features"]) < 10: b["features"].append([])
        step = [x for x in b["features"][9] if not any(x.startswith(f"entersift:{f}_") for f in FOLIAGE)]
        step += [f"entersift:{f}_{biome}" for f in FOLIAGE if f in counts]  # same global order everywhere: no cycles
        b["features"][9] = step
        parts = b.setdefault("attributes", {}).setdefault("minecraft:visual/ambient_particles", {"modifier": "append", "argument": []})
        have = {e["particle"]["type"] for e in parts["argument"]}
        for ptype, prob in PARTICLES.get(biome, []):
            if ptype not in have: parts["argument"].append({"particle": {"type": ptype}, "probability": prob})
        dump(bp, b)


def audio():
    p = D / "dimension_type/the_sift.json"
    d = load(p)
    at = d["attributes"]
    at["minecraft:audio/ambient_sounds"] = {
        "loop": "entersift:ambient.sift.loop",
        "mood": {"sound": "entersift:ambient.sift.mood", "tick_delay": 6000, "block_search_extent": 8, "offset": 2.0},
        "additions": {"sound": "entersift:ambient.sift.additions", "tick_chance": 0.0111}}
    at["minecraft:audio/background_music"] = {"default": {"sound": "entersift:music.sift", "min_delay": 12000, "max_delay": 24000}}
    dump(p, d)


if __name__ == "__main__":
    textures(); portal_mosaic(); block_assets()
    n = remap_features(); material_rule(); foliage(); audio(); fixed = fix_old_loot()
    print(f"phase11: {len(CUBES) + len(TURF) + len(PLANTS)} blocks, {n} worldgen files remapped, foliage in {len(COUNTS)} biomes, {fixed} loot tables fixed")
