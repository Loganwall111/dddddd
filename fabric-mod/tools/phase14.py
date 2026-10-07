#!/usr/bin/env python3
"""Phase 14 (0.14): Sift terrain rework, Soul Valley + Campaign Peaks, biome fog, new creatures.

    python3 tools/phase14.py        (idempotent)

* Terrain: the checkerboard biome source (giant squares of biomes) is replaced by a multi-noise
  source driven by the overworld climate noise, and the terrain uses the vanilla AMPLIFIED density
  functions: much bigger cliffs and peaks. Biomes follow the terrain (peaks biome on the peaks,
  reef biomes on the ichor coasts).
* Soul Valley: green and purple giant tiered trees (verdant / violet wood and canopies), valley turf,
  ferns and blooms, ruined huts, towers, broken walls, wells and a colossal ruined gate. Soul bees,
  watchlings, sculkers and drift jellies.
* Campaign Peaks: mountains with a volcanic base (cinder rock, ash crust, glowing cinder, ember ore),
  ichor pouring out of the cliffs, bubbling ichor hot springs with sinter rims, ichor volcano cones
  and ruined ember shrines.
* Subtle per-biome fog: the dimension base fog is white and the sift_cycle timeline MULTIPLIES its
  day/night colour over it, so each biome contributes a soft tint (purple, green, amber...).

Reuses helpers from phase10 (overlay), phase11 (textures, dump/load) and phase13 (tiered trees).
"""
from __future__ import annotations
import json, math, random, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phase10 import overlay                                           # noqa: E402
from phase11 import (dump, load, save_png, rgba, hash2, strata, mottled,  # noqa: E402
                     grass_top, turf_side, cross_plant, A, D, R, ROOT)
from phase13 import tiered_tree                                       # noqa: E402

# ------------------------------------------------------------------ blocks
CUBES = {
    "verdant_wood": "Verdant Soulwood", "violet_wood": "Violet Soulwood",
    "ruin_bricks": "Ruin Bricks", "mossy_ruin_bricks": "Mossy Ruin Bricks", "ruin_tiles": "Ruin Tiles",
    "cinder_rock": "Cinder Rock", "ash_crust": "Ash Crust", "cinder_glow": "Glowing Cinder",
    "ember_ore": "Ember Ore", "sinter": "Sinter",
}
LEAVES = {"verdant_canopy": "Verdant Canopy", "violet_canopy": "Violet Canopy"}
TURF = {"valley_turf": "Valley Turf"}
PLANTS = {"valley_fern": "Valley Fern", "violet_bloom": "Violet Bloom"}
PICKAXE = ["ruin_bricks", "mossy_ruin_bricks", "ruin_tiles", "cinder_rock", "ash_crust", "cinder_glow", "ember_ore", "sinter"]
AXE = ["verdant_wood", "violet_wood"]
HOE = ["verdant_canopy", "violet_canopy"]
SHOVEL = ["valley_turf"]


def bark(seed, cols):
    """Vertical bark: strata rotated 90 degrees plus dark grooves."""
    img = np.rot90(strata(seed, cols, 0.14)).copy()
    for x in range(16):
        if hash2(x, 0, seed + 4) > 0.72:
            for y in range(16):
                if hash2(x, y, seed + 5) > 0.25: img[y, x, :3] *= 0.8
    return img


def bricks(seed, cols, grout, tall=4):
    img = np.zeros((16, 16, 4))
    for y in range(16):
        row = y // tall
        for x in range(16):
            off = 4 if row % 2 else 0
            if y % tall == tall - 1 or (x + off) % 8 == 7:
                c = np.array(grout, float)
            else:
                brick = ((x + off) // 8, row)
                c = np.array(cols[int(hash2(brick[0], brick[1], seed) * len(cols))], float)
                r = hash2(x, y, seed + 1)
                if r < 0.12: c *= 0.9
                elif r > 0.9: c = np.minimum(255, c * 1.07 + 5)
            img[y, x] = rgba(c)
    return img


def textures():
    save_png(bark(141, [(70, 150, 96), (56, 128, 82), (88, 170, 110), (46, 110, 72)]), "verdant_wood")
    save_png(bark(142, [(120, 78, 160), (100, 62, 140), (140, 96, 180), (86, 52, 120)]), "violet_wood")
    save_png(mottled(143, [(110, 210, 120), (86, 186, 104), (140, 230, 140), (96, 198, 116)], 2, 0.16), "verdant_canopy")
    save_png(mottled(144, [(176, 120, 230), (150, 96, 210), (206, 156, 246), (164, 108, 222)], 2, 0.16), "violet_canopy")
    earth = [(92, 70, 96), (80, 60, 86), (104, 80, 106)]
    save_png(grass_top(145, [(84, 196, 150), (70, 176, 134), (110, 214, 170), (78, 188, 142)]), "valley_turf_top")
    save_png(turf_side(146, earth, (84, 196, 150), (56, 150, 112)), "valley_turf_side")
    stone = [(132, 150, 158), (120, 138, 148), (144, 160, 166), (112, 130, 140)]
    save_png(bricks(147, stone, (84, 96, 106)), "ruin_bricks")
    mossy = bricks(148, stone, (84, 96, 106))
    for y in range(16):
        for x in range(16):
            h = hash2(x // 2, y // 2, 149)
            if h > 0.62 or (y < 3 and hash2(x, y, 150) > 0.4):
                mossy[y, x] = rgba((96, 190, 120) if hash2(x, y, 151) > 0.45 else (150, 100, 200))
    save_png(mossy, "mossy_ruin_bricks")
    save_png(bricks(152, [(150, 164, 170), (138, 152, 160), (160, 172, 176)], (96, 108, 116), tall=8), "ruin_tiles")
    cinder = [(58, 50, 62), (48, 42, 54), (70, 60, 72), (40, 36, 46)]
    save_png(strata(153, cinder, 0.16, crack=0.7), "cinder_rock")
    save_png(mottled(154, [(120, 114, 120), (106, 100, 108), (136, 130, 134), (112, 106, 114)], 2, 0.18), "ash_crust")
    glow = strata(155, cinder, 0.12)
    for y in range(16):  # branching glowing cracks
        x = int(8 + 5 * math.sin(y * 0.6)) % 16
        for dx in (0, 1 if y % 3 == 0 else 0):
            glow[y, (x + dx) % 16] = rgba((255, 150, 96) if hash2(x, y, 156) > 0.3 else (255, 214, 140))
        if y % 5 == 2:
            for k in range(1, 5):
                glow[y, (x + k) % 16] = rgba((255, 120, 110))
    save_png(glow, "cinder_glow")
    ore = strata(157, cinder, 0.14)
    for (cx, cy) in [(3, 3), (11, 5), (6, 11), (13, 13)]:
        for dx, dy in [(0, 0), (1, 0), (0, 1), (-1, 0), (1, 1)]:
            ore[(cy + dy) % 16, (cx + dx) % 16] = rgba((255, 140, 190) if (dx + dy) % 2 == 0 else (255, 214, 150))
    save_png(ore, "ember_ore")
    save_png(strata(158, [(236, 226, 206), (222, 212, 192), (214, 236, 230), (230, 220, 200)], 0.1), "sinter")
    save_png(cross_plant(159, [(46, 130, 90), (80, 180, 120), (150, 110, 210)], blades=11, height=(7, 15)), "valley_fern")
    save_png(cross_plant(160, [(56, 140, 110), (80, 170, 130)], blades=3, height=(4, 9), flower=((190, 130, 255), (255, 230, 250))), "violet_bloom")


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

    for n, l in {**CUBES, **LEAVES}.items():
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
    # Biome names (F3 / locate) and the new creatures.
    lang["biome.entersift.soul_valley"] = "Soul Valley"
    lang["biome.entersift.campaign_peaks"] = "Campaign Peaks"
    for k, label in (("soul_bee", "Soul Bee"), ("watchling", "Watchling")):
        lang[f"entity.entersift.{k}"] = label
        lang[f"item.entersift.{k}_spawn_egg"] = f"{label} Spawn Egg"
        lang[f"subtitles.entersift.entity.{k}.ambient"] = f"{label} calls" if k != "soul_bee" else "Soul Bee buzzes"
        lang[f"subtitles.entersift.entity.{k}.hurt"] = f"{label} hurts"
        lang[f"subtitles.entersift.entity.{k}.death"] = f"{label} dies"
        dump(A / f"items/{k}_spawn_egg.json", {"model": {"type": "minecraft:model", "model": f"entersift:item/{k}_spawn_egg"}})
        dump(A / f"models/item/{k}_spawn_egg.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"entersift:item/{k}_spawn_egg"}})
    dump(lang_p, lang)
    # Tool tags.
    for tool, names in (("pickaxe", PICKAXE), ("axe", AXE), ("hoe", HOE), ("shovel", SHOVEL)):
        p = R / f"data/minecraft/tags/block/mineable/{tool}.json"
        tag = load(p) if p.exists() else {"values": []}
        for n in names:
            if f"entersift:{n}" not in tag["values"]: tag["values"].append(f"entersift:{n}")
        dump(p, tag)


# ------------------------------------------------------------------ creature sounds
def creature_audio():
    import audio11 as au

    def soul_bee():
        buzz = lambda f, sec: au.lp(au.sweep(f, f * 1.04, sec, 1, 0.03, 18) * (1 + 0.6 * np.sign(np.sin(2 * np.pi * 190 * au.t_(sec)))), 2400) * au.env(int(sec * au.SR), 0.05, 0.1, 0, sec * 0.3, 0.8)
        chime = lambda n, sec: au.sweep(au.midi(n), au.midi(n), sec, 1) * np.exp(-au.t_(sec) * 6)
        return (buzz(220, 0.9) + 0.25 * chime(84, 0.9), buzz(240, 0.7) + 0.25 * chime(88, 0.7),
                buzz(420, 0.2), buzz(460, 0.18), buzz(300, 0.8) * np.linspace(1, 0, int(0.8 * au.SR)) + 0.3 * chime(76, 0.8))

    def watchling():
        blip = lambda f0, f1, sec: au.sweep(f0, f1, sec, 1, 0.02, 9) * au.env(int(sec * au.SR), 0.01, 0.05, 0, sec * 0.5, 0.7)
        click = lambda sec: au.lp(au.noise(sec), 3000) * np.exp(-au.t_(sec) * 30)
        return (au.reverb(blip(520, 380, 0.7), 0.4), au.reverb(blip(600, 700, 0.5), 0.4), click(0.15) + blip(900, 500, 0.15),
                click(0.12) + blip(1000, 600, 0.12), au.reverb(blip(700, 90, 1.3), 0.5))

    new = {"soul_bee": soul_bee, "watchling": watchling}
    au.KINDS.update(new)
    for i, (kind, fn) in enumerate(new.items()):
        au.rng = np.random.default_rng(900 + i)
        a1, a2, h1, h2, d = fn()
        for name, x in (("ambient1", a1), ("ambient2", a2), ("hurt1", h1), ("hurt2", h2), ("death", d)):
            x = np.asarray(x, dtype=np.float64)
            fade = min(len(x) // 4, int(0.02 * au.SR))
            x[-fade:] *= np.linspace(1, 0, fade)
            au.save(f"entity/{kind}/{name}", x, 0.8)
    au.sounds_json()


# ------------------------------------------------------------------ structures (overlay point lists)
def ruined_hut(rng, w=7, d=7, h=5):
    pts = []
    for x in range(w):
        for z in range(d):
            pts.append((x, -1, z, "ruin_tiles"))  # floor (only fills air: hangs over slopes like a foundation)
            edge = x in (0, w - 1) or z in (0, d - 1)
            if not edge:
                continue
            top = h - (0 if (x + z) % 3 else rng.randint(1, 3))
            if rng.random() < 0.18: top = rng.randint(0, 2)  # crumbled
            if z == 0 and x == w // 2: continue          # doorway
            for y in range(0, max(0, top)):
                if z == 0 and x == w // 2: continue
                pts.append((x, y, z, "mossy_ruin_bricks" if rng.random() < 0.35 else "ruin_bricks"))
    for x in range(1, w - 1):  # half-collapsed roof
        for z in range(1, d - 1):
            if rng.random() < 0.45:
                pts.append((x, h, z, "ruin_tiles"))
    pts.append((w // 2, 0, d // 2, "soul_lantern_stone"))
    for _ in range(6):  # violet vines over the walls
        x, z = rng.choice([(0, rng.randrange(d)), (w - 1, rng.randrange(d)), (rng.randrange(w), d - 1)])
        for y in range(h - 1, h - 1 - rng.randint(1, 3), -1):
            pts.append((x, y, z, "violet_canopy"))
    return pts


def ruined_tower(rng, r=3.5, h=16):
    pts = []
    top = [h - rng.randint(0, 6) for _ in range(16)]
    for y in range(-1, h):
        for x in range(-5, 6):
            for z in range(-5, 6):
                d = math.hypot(x, z)
                if r - 1.2 < d <= r + 0.2:
                    a = int((math.atan2(z, x) + math.pi) / (2 * math.pi) * 16) % 16
                    if y < top[a] and not (y in (6, 7, 11, 12) and a % 4 == 0):  # broken top, windows
                        pts.append((x, y, z, "mossy_ruin_bricks" if rng.random() < 0.3 else "ruin_bricks"))
                elif d <= r - 1.2 and y in (-1, 7):
                    if rng.random() < 0.85: pts.append((x, y, z, "ruin_tiles"))
    pts.append((0, 0, 0, "soul_lantern_stone"))
    pts.append((0, 8, 0, "soul_lantern_stone"))
    return pts


def broken_wall(rng, length=14):
    pts = []
    for i in range(length):
        hgt = max(0, int(4 + 2 * math.sin(i * 0.7) + rng.randint(-2, 1)))
        for y in range(-1, hgt):
            pts.append((i, y, 0, "mossy_ruin_bricks" if rng.random() < 0.4 else "ruin_bricks"))
            if y == 0 and rng.random() < 0.4: pts.append((i, y, 1, "ruin_bricks"))
    return pts


def ruin_well(rng):
    pts = []
    for x in range(-2, 3):
        for z in range(-2, 3):
            ring = max(abs(x), abs(z)) == 2
            if ring:
                pts += [(x, 0, z, "ruin_bricks"), (x, 1, z, "mossy_ruin_bricks" if rng.random() < 0.5 else "ruin_bricks")]
            pts.append((x, -1, z, "ruin_tiles"))
            if not ring:
                pts.append((x, 0, z, "ichor"))
    for (x, z) in ((-2, -2), (2, 2)):
        for y in range(2, 5): pts.append((x, y, z, "ruin_bricks"))
    for x in range(-2, 3): pts.append((x, 5, -2 if x < 0 else 2, "ruin_tiles"))
    return pts


def colossus_gate(rng):
    """A colossal ruined archway: two 5x5 pillars ~24 tall and a broken lintel, draped in canopy."""
    pts = []
    span, hgt = 14, 24
    for px in (0, span):
        top = hgt - (rng.randint(0, 4) if px else 0)
        for y in range(-2, top):
            for x in range(px - 2, px + 3):
                for z in range(-2, 3):
                    shell = x in (px - 2, px + 2) or z in (-2, 2) or y in (-2, top - 1)
                    if shell and not (rng.random() < 0.05 and y > 4):
                        pts.append((x, y, z, "mossy_ruin_bricks" if rng.random() < 0.3 else "ruin_bricks"))
    for x in range(-2, span + 3):  # lintel, broken on one side
        if x > span - 4 and rng.random() < 0.5: continue
        for y in (hgt, hgt + 1, hgt + 2):
            for z in range(-2, 3):
                if y == hgt + 1 and z in (-1, 0, 1) and 0 < x < span: continue
                pts.append((x, y, z, "ruin_bricks"))
    for x in range(0, span + 1, 2):  # hanging violet/verdant drapes
        for y in range(hgt - 1, hgt - 1 - rng.randint(2, 7), -1):
            pts.append((x, y, rng.choice((-2, 2)), rng.choice(("violet_canopy", "verdant_canopy"))))
    pts += [(span // 2, hgt - 1, 0, "soul_lantern_stone")]
    return pts


def ichor_volcano(rng, r=7, h=11):
    """Small volcano cone of cinder rock with a glowing throat; an ichor source in the crater pours down."""
    pts = []
    for y in range(-2, h):
        rr = r * (1 - y / (h + 2))
        for x in range(-r - 1, r + 2):
            for z in range(-r - 1, r + 2):
                d = math.hypot(x, z) + rng.uniform(-0.4, 0.4)
                if d <= rr and (d > rr - 1.6 or y < 0):
                    pts.append((x, y, z, "cinder_glow" if rng.random() < 0.08 else ("ash_crust" if d > rr - 0.6 and rng.random() < 0.4 else "cinder_rock")))
                elif d <= 1.2 and y < h - 1:
                    pts.append((x, y, z, "cinder_glow"))
    pts.append((0, h - 1, 0, "ichor"))
    for (dx, dz) in ((1, 0), (0, 1)):
        pts.append((dx, h - 1, dz, "ichor"))
    return pts


def ember_shrine(rng):
    pts = []
    for x in range(-3, 4):
        for z in range(-3, 4):
            pts.append((x, -1, z, "cinder_rock"))
            if max(abs(x), abs(z)) == 3 and (x + z) % 2 == 0 and rng.random() < 0.8:
                for y in range(0, rng.randint(2, 5)):
                    pts.append((x, y, z, "ruin_bricks" if y else "cinder_rock"))
    for (x, z) in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
        pts.append((x, 5, z, "cinder_glow"))
    pts += [(0, 0, 0, "ember_ore"), (0, 1, 0, "cinder_glow")]
    return pts


def write_feature(name, pts):
    (D / f"worldgen/feature/{name}.json").write_text(json.dumps(overlay(pts), separators=(",", ":")) + "\n")
    return len(overlay(pts)["features"])


def placed(name, feature, mods):
    dump(D / f"worldgen/placed_feature/{name}.json", {"feature": f"entersift:{feature}", "placement": mods})


SURFACE = lambda chance: [{"type": "minecraft:rarity_filter", "chance": chance}, {"type": "minecraft:in_square"},
                          {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"}, {"type": "minecraft:biome"}]


def patch(block, count, ground):
    return [{"type": "minecraft:count", "count": count}, {"type": "minecraft:in_square"},
            {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"},
            {"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:all_of", "predicates": [
                {"type": "minecraft:matching_blocks", "blocks": "minecraft:air"},
                {"type": "minecraft:matching_blocks", "offset": [0, -1, 0], "blocks": ground}]}},
            {"type": "minecraft:biome"}]


VALLEY_GROUND = ["entersift:valley_turf", "entersift:blue_turf", "entersift:crag_moss", "entersift:sift_earth"]
PEAK_GROUND = ["entersift:ash_crust", "entersift:cinder_rock", "entersift:crag_rock", "entersift:pale_crust"]


def features():
    rng = random.Random(1414)
    sizes = {}
    sizes["verdant_tree"] = write_feature("verdant_tree", tiered_tree(rng, 26, 7.5, 3, "verdant_canopy", "violet_canopy", wood="verdant_wood"))
    sizes["violet_tree"] = write_feature("violet_tree", tiered_tree(rng, 24, 7.0, 3, "violet_canopy", "verdant_canopy", wood="violet_wood"))
    sizes["ruined_hut"] = write_feature("ruined_hut", ruined_hut(rng))
    sizes["ruined_tower"] = write_feature("ruined_tower", ruined_tower(rng))
    sizes["broken_wall"] = write_feature("broken_wall", broken_wall(rng))
    sizes["ruin_well"] = write_feature("ruin_well", ruin_well(rng))
    sizes["colossus_gate"] = write_feature("colossus_gate", colossus_gate(rng))
    sizes["ichor_volcano"] = write_feature("ichor_volcano", ichor_volcano(rng))
    sizes["ember_shrine"] = write_feature("ember_shrine", ember_shrine(rng))
    for f in ("valley_fern", "violet_bloom"):
        dump(D / f"worldgen/feature/{f}.json", {"type": "minecraft:simple_block", "to_place": {"id": f"entersift:{f}"}})
    # Ichor pouring from the Campaign Peaks cliffs, hot springs, ember ore.
    dump(D / "worldgen/feature/ichor_spring.json", {"type": "minecraft:spring_feature",
         "state": {"id": "entersift:ichor", "properties": {"falling": "true"}},
         "valid_blocks": ["entersift:cinder_rock", "entersift:crag_rock", "entersift:crag_rock_dark", "entersift:ash_crust", "entersift:cinder_glow"]})
    dump(D / "worldgen/feature/ichor_hot_spring.json", {"type": "minecraft:delta_feature", "contents": "entersift:ichor",
         "rim": "entersift:sinter", "rim_size": {"type": "minecraft:uniform", "min_inclusive": 1, "max_inclusive": 2},
         "size": {"type": "minecraft:uniform", "min_inclusive": 3, "max_inclusive": 6}})
    dump(D / "worldgen/feature/ichor_lake.json", {"type": "minecraft:lake", "barrier": {"id": "entersift:sinter"},
         "can_place_feature": {"type": "minecraft:true"},
         "can_replace_with_air_or_fluid": {"type": "minecraft:not", "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:features_cannot_replace"}},
         "can_replace_with_barrier": {"type": "minecraft:not", "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:features_cannot_replace"}},
         "fluid": {"id": "entersift:ichor", "properties": {"level": "0"}}})
    dump(D / "worldgen/feature/ember_ore.json", {"type": "minecraft:ore", "discard_chance_on_air_exposure": 0.0, "size": 7,
         "targets": [{"state": "entersift:ember_ore", "target": {"predicate_type": "minecraft:block_match", "block": "entersift:cinder_rock"}},
                     {"state": "entersift:ember_ore", "target": {"predicate_type": "minecraft:block_match", "block": "entersift:crag_rock"}}]})
    dump(D / "worldgen/feature/cinder_glow_ore.json", {"type": "minecraft:ore", "discard_chance_on_air_exposure": 0.0, "size": 12,
         "targets": [{"state": "entersift:cinder_glow", "target": {"predicate_type": "minecraft:block_match", "block": "entersift:cinder_rock"}}]})

    # Placed features. Per-biome names keep the global feature order acyclic.
    placed("verdant_tree", "verdant_tree", SURFACE(3))
    placed("violet_tree", "violet_tree", SURFACE(3))
    placed("ruined_hut", "ruined_hut", SURFACE(9))
    placed("ruined_tower", "ruined_tower", SURFACE(22))
    placed("broken_wall", "broken_wall", SURFACE(12))
    placed("ruin_well", "ruin_well", SURFACE(26))
    placed("colossus_gate", "colossus_gate", SURFACE(70))
    placed("valley_fern_soul_valley", "valley_fern", patch("valley_fern", 28, VALLEY_GROUND))
    placed("violet_bloom_soul_valley", "violet_bloom", patch("violet_bloom", 10, VALLEY_GROUND))
    placed("glow_tuft_soul_valley", "glow_tuft", patch("glow_tuft", 8, VALLEY_GROUND))
    placed("blue_grass_soul_valley", "blue_grass", patch("blue_grass", 12, VALLEY_GROUND))
    placed("ichor_spring", "ichor_spring", [{"type": "minecraft:count", "count": 14}, {"type": "minecraft:in_square"},
           {"type": "minecraft:height_range", "height": {"type": "minecraft:uniform", "min_inclusive": {"absolute": 60}, "max_inclusive": {"absolute": 250}}},
           {"type": "minecraft:biome"}])
    placed("ichor_hot_spring", "ichor_hot_spring", [{"type": "minecraft:count", "count": 2}, {"type": "minecraft:in_square"},
           {"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"}, {"type": "minecraft:biome"}])
    placed("ichor_lake", "ichor_lake", SURFACE(8))
    placed("ichor_volcano", "ichor_volcano", SURFACE(14))
    placed("ember_shrine", "ember_shrine", SURFACE(18))
    placed("ember_ore", "ember_ore", [{"type": "minecraft:count", "count": 12}, {"type": "minecraft:in_square"},
           {"type": "minecraft:height_range", "height": {"type": "minecraft:trapezoid", "min_inclusive": {"absolute": -40}, "max_inclusive": {"absolute": 140}}},
           {"type": "minecraft:biome"}])
    placed("cinder_glow_ore", "cinder_glow_ore", [{"type": "minecraft:count", "count": 6}, {"type": "minecraft:in_square"},
           {"type": "minecraft:height_range", "height": {"type": "minecraft:uniform", "min_inclusive": {"absolute": 40}, "max_inclusive": {"absolute": 160}}},
           {"type": "minecraft:biome"}])
    placed("glow_tuft_campaign_peaks", "glow_tuft", patch("glow_tuft", 5, PEAK_GROUND))
    return sizes


# ------------------------------------------------------------------ biomes
FOG = {  # subtle tints multiplied with the sift_cycle day/night fog colour
    "soul_valley": "#dccaff", "campaign_peaks": "#ffd4bc", "singer_meadow": "#d6f4de", "pale_grove": "#e2ecff",
    "rose_spires": "#ffdbe4", "titan_crags": "#e6def2", "boneyard": "#ece4da", "carapace": "#eee6e6",
    "saltwound_expanse": "#f2f2e2", "coral_expanse": "#d4f2ee", "tidepool_reef": "#d8f0f0",
}


def biome(name, water, particles, steps):
    b = {"has_precipitation": False, "temperature": 0.5, "downfall": 0, "effects": {"water_color": water},
         "attributes": {
             "minecraft:visual/ambient_particles": {"modifier": "append", "argument": [
                 {"particle": {"type": t}, "probability": p} for t, p in particles]},
             "minecraft:gameplay/natural_mob_spawns": {"modifier": "overlay", "argument": {"spawn_costs": {}, "spawns_by_category": {}}}},
         "carvers": [], "features": [[] for _ in range(11)]}
    for i, feats in steps.items():
        b["features"][i] = [f"entersift:{f}" for f in feats]
    dump(D / f"worldgen/biome/{name}.json", b)


def biomes():
    biome("soul_valley", "#8fd6b8",
          [("minecraft:glow", 0.006), ("minecraft:spore_blossom_air", 0.008), ("minecraft:soul", 0.0015), ("minecraft:white_ash", 0.003)],
          {4: ["colossus_gate", "ruined_tower", "ruined_hut", "ruin_well", "broken_wall"],
           9: ["verdant_tree", "violet_tree", "valley_fern_soul_valley", "violet_bloom_soul_valley", "glow_tuft_soul_valley", "blue_grass_soul_valley"]})
    biome("campaign_peaks", "#e89a7a",
          [("minecraft:white_ash", 0.012), ("minecraft:ash", 0.008), ("minecraft:white_smoke", 0.003),
           ("minecraft:lava", 0.0008), ("minecraft:bubble_pop", 0.004)],
          {1: ["ichor_lake"], 2: ["ichor_hot_spring"], 4: ["ichor_volcano", "ember_shrine"],
           6: ["ember_ore", "cinder_glow_ore"], 8: ["ichor_spring"], 9: ["glow_tuft_campaign_peaks"]})
    # Subtle fog tint on every Sift biome.
    for name, tint in FOG.items():
        p = D / f"worldgen/biome/{name}.json"
        b = load(p)
        b.setdefault("attributes", {})["minecraft:visual/fog_color"] = tint
        dump(p, b)
    # Base fog white; the timeline multiplies its colour over the biome tint.
    dt = D / "dimension_type/the_sift.json"
    d = load(dt); d["attributes"]["minecraft:visual/fog_color"] = "#ffffff"; dump(dt, d)
    tl = D / "timeline/sift_cycle.json"
    t = load(tl); t["tracks"]["minecraft:visual/fog_color"]["modifier"] = "multiply"; dump(tl, t)


# ------------------------------------------------------------------ biome source + terrain
def P(biome, T=(-1, 1), H=(-1, 1), C=(-0.11, 1), E=(-1, 1), W=(-1, 1), depth=(0, 1), offset=0.0):
    return {"biome": f"entersift:{biome}", "parameters": {"temperature": list(T), "humidity": list(H), "continentalness": list(C),
            "erosion": list(E), "weirdness": list(W), "depth": list(depth), "offset": offset}}


INLAND_E = (-0.22, 1)
MULTI_NOISE = [
    P("coral_expanse", C=(-1.2, -0.19)),
    P("tidepool_reef", C=(-0.19, -0.11)),
    P("campaign_peaks", C=(0.03, 1), E=(-1, -0.45)),
    P("titan_crags", E=(-0.45, -0.22)),
    P("pale_grove", T=(-1, -0.15), H=(0, 1), E=INLAND_E),
    P("carapace", T=(-1, -0.15), H=(-1, 0), E=INLAND_E),
    P("soul_valley", T=(-0.15, 0.35), H=(0.1, 1), E=INLAND_E),
    P("singer_meadow", T=(-0.15, 0.35), H=(-1, 0.1), E=INLAND_E),
    P("saltwound_expanse", T=(0.35, 1), H=(0.1, 1), E=INLAND_E),
    P("rose_spires", T=(0.35, 1), H=(-0.45, 0.1), E=INLAND_E),
    P("boneyard", T=(0.35, 1), H=(-1, -0.45), E=INLAND_E),
]


def terrain():
    dim = D / "dimension/the_sift.json"
    d = load(dim)
    d["generator"]["biome_source"] = {"type": "minecraft:multi_noise", "biomes": MULTI_NOISE}
    dump(dim, d)
    ns = D / "worldgen/noise_settings/the_sift.json"
    n = load(ns)
    r = n["noise_router"]
    r["final_density"] = "minecraft:overworld_amplified/final_density"   # bigger cliffs and peaks
    r["depth"] = "minecraft:overworld_amplified/depth"
    r["chunk_surface_level"] = "minecraft:overworld_amplified/chunk_surface_level"
    aq = n["aquifers"]
    aq["surface_level"] = "minecraft:overworld_amplified/preliminary_surface_level"
    aq["exclusion"]["right"]["left"]["left"] = "minecraft:overworld_amplified/depth"
    for f in n.get("debug_functions", []):
        if f["function"] == "minecraft:overworld/final_density": f["function"] = "minecraft:overworld_amplified/final_density"
        if f["function"] == "minecraft:overworld/depth": f["function"] = "minecraft:overworld_amplified/depth"
        if f["function"] == "minecraft:overworld/preliminary_surface_level": f["function"] = "minecraft:overworld_amplified/preliminary_surface_level"
    dump(ns, n)


# ------------------------------------------------------------------ surfaces
def material():
    """Soul Valley: valley turf with crag-moss patches. Campaign Peaks: a volcanic crust of ash, cinder
    rock and glowing cinder cracks with cinder rock beneath (steep faces keep the rose crag rock)."""
    p = D / "worldgen/material_rule/the_sift.json"
    d = load(p)
    seq = d["sequence"]
    new = ("entersift:soul_valley", "entersift:campaign_peaks")
    seq[:] = [r for r in seq if not (isinstance(r, dict) and isinstance(r.get("if_true"), dict) and r["if_true"].get("biome_is") in new)]
    nt = lambda lo, hi, b: {"type": "minecraft:condition", "if_true": {"type": "minecraft:noise_threshold", "noise": "minecraft:surface",
                            "min_threshold": lo, "max_threshold": hi}, "then_run": {"type": "minecraft:block", "result_state": b}}
    blk = lambda b: {"type": "minecraft:block", "result_state": b}
    valley = {"type": "minecraft:condition", "if_true": {"type": "minecraft:biome", "biome_is": "entersift:soul_valley"},
              "then_run": {"type": "minecraft:condition", "if_true": "minecraft:on_floor", "then_run": {"type": "minecraft:sequence",
                           "sequence": [nt(0.35, 10.0, "entersift:crag_moss"), blk("entersift:valley_turf")]}}}
    peaks = {"type": "minecraft:condition", "if_true": {"type": "minecraft:biome", "biome_is": "entersift:campaign_peaks"},
             "then_run": {"type": "minecraft:sequence", "sequence": [
                 {"type": "minecraft:condition", "if_true": "minecraft:on_floor", "then_run": {"type": "minecraft:sequence", "sequence": [
                     nt(0.55, 10.0, "entersift:cinder_glow"), nt(0.1, 0.55, "entersift:ash_crust"),
                     nt(-0.25, 0.1, "entersift:cinder_rock"), blk("entersift:pale_crust")]}},
                 {"type": "minecraft:condition", "if_true": "minecraft:under_floor", "then_run": blk("entersift:cinder_rock")}]}}
    seq.insert(1, valley)
    seq.insert(2, peaks)
    dump(p, d)


def spawn_functions():
    for k, part in (("soul_bee", "minecraft:soul"), ("watchling", "minecraft:sculk_soul")):
        f = D / f"function/creature/{k}/spawn.mcfunction"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"summon entersift:{k} ~ ~ ~\nparticle {part} ~ ~0.6 ~ 0.3 0.4 0.3 0.02 12 normal\n")


def main():
    textures(); block_assets(); creature_audio()
    sizes = features(); biomes(); terrain(); material(); spawn_functions()
    print("phase14:", len(CUBES) + len(LEAVES) + len(TURF) + len(PLANTS), "blocks;",
          ", ".join(f"{k} {v}" for k, v in sizes.items()))


if __name__ == "__main__":
    main()
