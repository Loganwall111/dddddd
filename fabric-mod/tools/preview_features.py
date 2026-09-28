#!/usr/bin/env python3
"""Isometric voxel preview of overlay features (reads the feature JSON). Writes art/feature_preview.png."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
F = ROOT / "src/main/resources/data/entersift/worldgen/feature"
COL = {"soulwood": (40, 70, 72), "pale_canopy": (226, 240, 244), "soul_canopy": (96, 200, 196), "rose_spire": (196, 96, 78),
       "spire_bricks": (172, 72, 58), "sift_grass": (110, 220, 190)}
def pts(name):
    out = []
    for f in json.loads((F / f"{name}.json").read_text())["features"]:
        x = y = z = 0
        for m in f["placement"]:
            if m["type"] == "minecraft:offset": x += m["x"]; y += m["y"]; z += m["z"]
        out.append((x, y, z, f["feature"]["to_place"]["id"].split(":")[1]))
    return out
def render(p, s=5):
    img = Image.new("RGB", (80 * s, 110 * s), (126, 211, 207)); d = ImageDraw.Draw(img)
    for x, y, z, b in sorted(p, key=lambda q: (q[0] + q[2], q[1])):
        c = COL.get(b, (255, 0, 255)); cx = 40 * s + (x - z) * s; cy = 90 * s - y * s + (x + z) * s // 2
        top = [(cx, cy - s), (cx + s, cy - s // 2), (cx, cy), (cx - s, cy - s // 2)]
        d.polygon(top, fill=c)
        d.polygon([(cx - s, cy - s // 2), (cx, cy), (cx, cy + s), (cx - s, cy + s // 2)], fill=tuple(int(v * .75) for v in c))
        d.polygon([(cx + s, cy - s // 2), (cx, cy), (cx, cy + s), (cx + s, cy + s // 2)], fill=tuple(int(v * .6) for v in c))
    return img
names = sys.argv[1:] or ["pale_tree", "weeping_soul_tree", "rose_spire"]
ims = [render(pts(n)) for n in names]
out = Image.new("RGB", (sum(i.width for i in ims), ims[0].height)); x = 0
for i in ims: out.paste(i, (x, 0)); x += i.width
out.save(ROOT / "art/feature_preview.png"); out.save("/tmp/feat.png")
