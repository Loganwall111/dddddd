#!/usr/bin/env python3
"""0.9.0 clean slate (idempotent).

* Timeline entersift:sift_cycle: the 4-stage lava-lamp cycle (day cyan-teal, noon mint/pearl,
  evening magenta/rose/crimson, night amber-gold). Keyframes MUST match client/SiftSky.java
  (STAGE_TICKS / HORIZON). sky_light_color tints the ground and ichor through the lightmap;
  water_fog_color tints the fog inside ichor.
* Vanilla clouds hidden in the Sift (cloud_color alpha 0): no hard blocks in the sky.
* Ichor joins #minecraft:water (swimming, buoyancy, underwater fog) and gets seamless textures:
  torus-periodic noise, so tiles meet with no seam and the animation loops with no jump. The flow
  sprite repeats every 16 px because the fluid renderer samples half-sprite windows.
* Floors: bluish teal path instead of olive moss / khaki salt. Spire bricks become red brick.
* Worldgen: huge pale trees (14-18 tall, wide drooping white/teal canopies with hanging strands),
  weeping teal trees, and red-brick mesa towers (25-40 tall) with flat caps and trees on top.
* Removes the old sky: sky shard/pillar/portal textures, panorama generators, the Iris pack.
"""
import json, math, random, shutil
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "src/main/resources/data/entersift"
A = ROOT / "src/main/resources/assets/entersift"
TEX = A / "textures/block"


def write(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + "\n")


# ------------------------------------------------------------------ timeline (4 stages)
STAGE_TICKS = [0, 3500, 5000, 8500, 11000, 14500, 16500, 22500]
STAGE_AT = [0, 0, 1, 1, 2, 2, 3, 3]
#            day        noon       evening    night
HORIZON = ["#7cc6d8", "#86d6dc", "#c89ab8", "#d9a450"]   # == SiftSky.HORIZON (fog + sky colour)
LIGHT = ["#dcf4fa", "#e6fff4", "#f6d6e6", "#ffd89a"]     # ground/ichor tint (multiplies sky light)
WATER_FOG = ["#5aa8bc", "#62b8c0", "#a87898", "#c08a3a"]  # fog inside ichor
LIGHT_FACTOR = [1.0, 1.0, 0.9, 0.8]
LIGHT_LEVEL = [1.0, 1.0, 0.9, 0.78]


def track(values, modifier=None):
    tr = {"keyframes": [{"ticks": t, "value": values[s]} for t, s in zip(STAGE_TICKS, STAGE_AT)]}
    if modifier:
        tr["modifier"] = modifier
    return tr


def timeline():
    bezier = {"cubic_bezier": [0.362, 0.241, 0.638, 0.759]}
    write(D / "timeline/sift_cycle.json", {
        "clock": "minecraft:overworld",
        "period_ticks": 24000,
        "tracks": {
            "minecraft:visual/sky_color": track(HORIZON),
            "minecraft:visual/fog_color": track(HORIZON),
            "minecraft:visual/water_fog_color": track(WATER_FOG),
            "minecraft:visual/cloud_color": track(["#00ffffff"] * 4),
            "minecraft:visual/sky_light_color": track(LIGHT, "multiply"),
            "minecraft:visual/sky_light_factor": track(LIGHT_FACTOR, "multiply"),
            "minecraft:gameplay/sky_light_level": track(LIGHT_LEVEL, "multiply"),
            "minecraft:visual/sun_angle": {"ease": bezier, "keyframes": [{"ticks": 6000, "value": 360.0}, {"ticks": 6000, "value": 0.0}]},
            "minecraft:visual/moon_angle": {"ease": bezier, "keyframes": [{"ticks": 6000, "value": 540.0}, {"ticks": 6000, "value": 180.0}]},
        },
    })
    p = D / "dimension_type/the_sift.json"
    dt = json.loads(p.read_text())
    at = dt["attributes"]
    at["minecraft:visual/sky_color"] = HORIZON[0]
    at["minecraft:visual/fog_color"] = HORIZON[0]
    at["minecraft:visual/cloud_color"] = "#00ffffff"
    at["minecraft:visual/water_fog_color"] = WATER_FOG[0]
    write(p, dt)
    # Biomes: no per-biome sky/fog colours any more; the timeline drives one coherent sky.
    for b in (D / "worldgen/biome").glob("*.json"):
        d = json.loads(b.read_text())
        for k in ("minecraft:visual/sky_color", "minecraft:visual/fog_color"):
            d.get("attributes", {}).pop(k, None)
        write(b, d)


# ------------------------------------------------------------------ ichor
def water_tag():
    write(ROOT / "src/main/resources/data/minecraft/tags/fluid/water.json",
          {"replace": False, "values": ["entersift:ichor", "entersift:flowing_ichor"]})


PASTEL = np.array([(255, 176, 214), (214, 180, 255), (170, 214, 255), (160, 246, 222),
                   (206, 255, 186), (255, 232, 178), (255, 196, 180)], dtype=float) / 255


def ichor_frames(size, period, frames, seed):
    rng = random.Random(seed)
    y, x = np.mgrid[0:size, 0:size].astype(float)
    waves = []
    for _ in range(5):
        kx, ky = rng.randint(-1, 1), rng.randint(-1, 1)
        if kx == 0 and ky == 0:
            kx = 1
        waves.append((kx, ky, rng.uniform(0, 6.283), rng.choice([-1, 1]) * rng.randint(1, 2), rng.uniform(0.5, 1.0)))
    warp = [(rng.randint(-1, 1) or 1, rng.randint(-1, 1), rng.uniform(0, 6.283)) for _ in range(2)]
    out = []
    for f in range(frames):
        ph = 2 * math.pi * f / frames
        u, v = x / period * 2 * math.pi, y / period * 2 * math.pi
        wu = u + 0.6 * np.sin(warp[0][0] * v + warp[0][1] * u + warp[0][2] + ph)
        wv = v + 0.6 * np.sin(warp[1][0] * u + warp[1][1] * v + warp[1][2] - ph)
        field = sum(a * np.sin(kx * wu + ky * wv + p0 + n * ph) for kx, ky, p0, n, a in waves)
        field = (field / sum(w[4] for w in waves)) * 0.5 + 0.5  # 0..1
        t = (field * 0.85 + f / frames) % 1.0 * len(PASTEL)       # colour bands slowly cycle
        i0 = np.floor(t).astype(int) % len(PASTEL)
        i1 = (i0 + 1) % len(PASTEL)
        fr = (t - np.floor(t))[..., None]
        fr = fr * fr * (3 - 2 * fr)
        col = PASTEL[i0] * (1 - fr) + PASTEL[i1] * fr
        glow = np.clip((field - 0.72) * 3, 0, 1)[..., None] * 0.35  # soft pearly highlights
        col = col * (1 - glow) + glow
        rgba = np.concatenate([np.clip(col, 0, 1) * 255, np.full((size, size, 1), 225.0)], axis=2)
        out.append(Image.fromarray(rgba.astype(np.uint8), "RGBA"))
    return out


def ichor_textures():
    frames = 48
    for name, period, seed in (("ichor_still", 32, 91), ("ichor_overlay", 32, 91), ("ichor_flow", 16, 92)):
        fr = ichor_frames(32, period, frames, seed)
        sheet = Image.new("RGBA", (32, 32 * frames))
        for i, im in enumerate(fr):
            sheet.paste(im, (0, 32 * i))
        sheet.save(TEX / f"{name}.png")
        (TEX / f"{name}.png.mcmeta").write_text(json.dumps({"animation": {"frametime": 3, "interpolate": True}}, indent=2) + "\n")


# ------------------------------------------------------------------ floors & bricks
def floors():
    p = D / "worldgen/material_rule/the_sift.json"
    s = p.read_text()
    s = s.replace('"result_state": "entersift:singer_moss"', '"result_state": "entersift:teal_path"')
    s = s.replace('"result_state": "entersift:salt"', '"result_state": "entersift:teal_path"')
    p.write_text(s)
    rng = random.Random(7)
    # Bluish flagstone path: irregular stones in blue-teal with darker grout.
    im = Image.new("RGB", (16, 16))
    px = im.load()
    stones = [(rng.randint(0, 15), rng.randint(0, 15)) for _ in range(7)]
    tones = [(78, 150, 176), (92, 170, 190), (70, 138, 170), (104, 182, 198), (84, 160, 188), (96, 164, 196), (74, 146, 180)]
    for yy in range(16):
        for xx in range(16):
            ds = sorted(((min(abs(xx - sx), 16 - abs(xx - sx)) ** 2 + min(abs(yy - sy), 16 - abs(yy - sy)) ** 2, i)
                         for i, (sx, sy) in enumerate(stones)))
            base = tones[ds[0][1]]
            if math.sqrt(ds[1][0]) - math.sqrt(ds[0][0]) < 1.0:
                base = (46, 96, 122)
            n = rng.randint(-6, 6)
            px[xx, yy] = tuple(max(0, min(255, c + n)) for c in base)
    im.save(TEX / "teal_path.png")
    # Red brick for the mesa towers.
    im = Image.new("RGB", (16, 16))
    px = im.load()
    for yy in range(16):
        for xx in range(16):
            row = yy // 4
            off = 4 if row % 2 else 0
            mortar = yy % 4 == 3 or (xx + off) % 8 == 7
            c = (150, 132, 120) if mortar else (rng.choice([(176, 74, 58), (164, 66, 54), (188, 86, 64), (158, 60, 50)]))
            n = rng.randint(-7, 7)
            px[xx, yy] = tuple(max(0, min(255, v + n)) for v in c)
    im.save(TEX / "spire_bricks.png")
    # Rose spire stone: terracotta-red banded mesa rock.
    im = Image.new("RGB", (16, 16))
    px = im.load()
    for yy in range(16):
        band = [(196, 96, 78), (182, 84, 70), (206, 112, 88), (170, 76, 64)][(yy // 3) % 4]
        for xx in range(16):
            n = rng.randint(-8, 8)
            px[xx, yy] = tuple(max(0, min(255, v + n)) for v in band)
    im.save(TEX / "rose_spire.png")


# ------------------------------------------------------------------ worldgen
def offsets(x, y, z):
    out, rest = [], [x, y, z]
    while True:
        step = [max(-16, min(16, v)) for v in rest]
        out.append({"type": "minecraft:offset", "x": step[0], "y": step[1], "z": step[2]})
        rest = [v - s_ for v, s_ in zip(rest, step)]
        if not any(rest):
            return out


def overlay(points):
    seen, feats = set(), []
    for (x, y, z, b) in points:
        if (x, y, z) in seen:
            continue
        seen.add((x, y, z))
        bid = b if ":" in b else f"entersift:{b}"
        feats.append({"feature": {"type": "minecraft:simple_block", "to_place": {"id": bid}},
                      "placement": offsets(x, y, z) + [
                          {"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:matching_block_tag", "tag": "minecraft:air"}}]})
    return {"type": "minecraft:overlay", "features": feats}


def big_tree(rng, height, radius, leaf, strand, ox=0, oy=0, oz=0, thick=True):
    """Huge pale tree: tall (optionally 2x2) trunk, a few up-swept branches, an umbrella canopy
    whose rim droops, and long hanging strands like the reference footage."""
    pts = []
    trunk = [(0, 0), (1, 0), (0, 1), (1, 1)] if thick else [(0, 0)]
    for y in range(-3, height):
        for (tx, tz) in trunk:
            pts.append((ox + tx, oy + y, oz + tz, "soulwood"))
    cx, cz = (0.5, 0.5) if thick else (0, 0)
    # Branches reaching out under the canopy.
    for k in range(4):
        ang = k * math.pi / 2 + rng.uniform(-0.4, 0.4)
        for s in range(1, radius - 1):
            bx, bz = round(cx + math.cos(ang) * s), round(cz + math.sin(ang) * s)
            pts.append((ox + bx, oy + height - 4 + s // 2, oz + bz, "soulwood"))
    top = oy + height
    r = radius
    for x in range(-r - 1, r + 2):
        for z in range(-r - 1, r + 2):
            d = math.hypot(x - cx + 0.5, z - cz + 0.5)
            if d > r + 0.4:
                continue
            # Dome: thicker in the middle; the rim sags down by up to 3 blocks.
            sag = int(max(0.0, d - r * 0.55) * 3.2 / (r * 0.45 + 0.01))
            layers = 2
            for l in range(layers):
                if rng.random() < 0.06:
                    continue
                pts.append((ox + x, top + l - sag + (1 if d < r * 0.35 else 0), oz + z, leaf))
            # Hanging strands from the drooping rim.
            if d > r - 1.6 and rng.random() < 0.45:
                length = rng.randint(2, 7)
                for h in range(1, length + 1):
                    pts.append((ox + x, top - sag - h, oz + z, strand if h % 3 else leaf))
    return pts


def mesa_tower(rng, height, radius, cap):
    """Red-brick mesa tower: banded shell that narrows then flares into a wide flat cap, crowned by
    a pale tree. Hollow inside (only the visible shell), so it stays light for worldgen."""
    pts = []
    for y in range(-4, height):
        f = y / height
        rr = radius * (1.0 - 0.25 * math.sin(f * math.pi)) + (cap - radius) * max(0.0, (f - 0.82) / 0.18) ** 1.5
        mat = "spire_bricks" if (y // 4) % 3 == 1 else "rose_spire"
        for x in range(-cap - 1, cap + 2):
            for z in range(-cap - 1, cap + 2):
                d = math.hypot(x, z)
                if rr - 1.3 < d <= rr + 0.3:
                    pts.append((x, y, z, mat))
    for x in range(-cap, cap + 1):
        for z in range(-cap, cap + 1):
            d = math.hypot(x, z)
            if d <= cap + 0.3:
                pts.append((x, height, z, "rose_spire" if d < cap - 1 else "spire_bricks"))
                if d < cap - 0.8 and rng.random() < 0.5:
                    pts.append((x, height + 1, z, "sift_grass"))
    pts += big_tree(rng, rng.randint(7, 9), 4, "pale_canopy", "soul_canopy", 0, height + 1, 0, thick=False)
    return pts


def worldgen():
    rng = random.Random(909)
    fdir = D / "worldgen/feature"
    write(fdir / "pale_tree.json", overlay(big_tree(rng, 18, 9, "pale_canopy", "soul_canopy")))
    write(fdir / "weeping_soul_tree.json", overlay(big_tree(rng, 14, 7, "soul_canopy", "pale_canopy")))
    write(fdir / "rose_spire.json", overlay(mesa_tower(rng, 32, 4, 7)))
    # Rarer spread: bigger features, same density feel.
    for name, chance in (("pale_tree", 3), ("weeping_soul_tree", 4), ("rose_spire", 4)):
        p = D / f"worldgen/placed_feature/{name}.json"
        d = json.loads(p.read_text())
        for m in d["placement"]:
            if m["type"] == "minecraft:rarity_filter":
                m["chance"] = chance
        write(p, d)


# ------------------------------------------------------------------ remove the old sky / shader pack
def cleanup():
    gone = [A / "textures/environment/sky_shard.png", A / "textures/environment/sky_pillar.png",
            A / "textures/environment/sky_portal.png", ROOT / "tools/sky_panorama.py", ROOT / "tools/paint_skies.py",
            ROOT / "tools/check_shaders.py", ROOT / "art/sky/preview_day_night.png",
            ROOT / "src/client/java/dev/logan/entersift/client/SiftSkyLayer.java"]
    for g in gone:
        if g.exists():
            g.unlink()
    for d in (ROOT / "shaderpack", A / "textures/environment"):
        if d.exists() and (d.name == "shaderpack" or not any(d.iterdir())):
            shutil.rmtree(d)


if __name__ == "__main__":
    timeline(); water_tag(); ichor_textures(); floors(); worldgen(); cleanup()
    for n in ("pale_tree", "weeping_soul_tree", "rose_spire"):
        d = json.loads((D / f"worldgen/feature/{n}.json").read_text())
        print(n, len(d["features"]), "blocks")
