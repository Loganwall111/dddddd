#!/usr/bin/env python3
"""Phase 13 (0.13): gigantic multi-tier Sift trees in the Minecraft Dungeons II style.

The old pale / weeping soul trees were a single umbrella canopy. The Dungeons II trees are giants:
a thick trunk with buttress roots carrying three or four stacked, drooping canopy tiers that get
narrower toward the top, every tier fringed with long hanging strands like frosted icicles.

Only the visible shell of each tier is emitted (the inside is hidden by the shell and the trunk),
which keeps the overlay features light enough for worldgen.

    python3 tools/phase13.py        (idempotent; only rewrites the two tree features)

It reuses the JSON helpers of phase10.py by import. phase10 itself must NOT be re-run (its
cleanup step deletes the shader pack).
"""
from __future__ import annotations
import math, random, sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phase10 import overlay, write, D  # noqa: E402  (main code of phase10 is guarded)


def tiered_tree(rng, height, base_r, tiers, leaf, strand, trunk_w=3, wood="soulwood"):
    pts = []
    half = trunk_w // 2
    trunk = [(x, z) for x in range(-half, trunk_w - half) for z in range(-half, trunk_w - half)]
    for y in range(-3, height - 1):
        for (tx, tz) in trunk:
            pts.append((tx, y, tz, wood))
    # Buttress roots flaring out at the base.
    for k in range(4):
        ang = k * math.pi / 2 + math.pi / 4 + rng.uniform(-0.3, 0.3)
        for s in range(1, 4):
            rx, rz = round(math.cos(ang) * (half + s)), round(math.sin(ang) * (half + s))
            for y in range(-1, 3 - s):
                pts.append((rx, y, rz, wood))

    for t in range(tiers):
        f = t / max(1, tiers - 1)
        cy = round(height * (0.30 + 0.70 * f))              # tier base height (clear gaps between tiers)
        r = base_r * (1.0 - 0.55 * f)                        # much narrower toward the top
        thick = 3
        ox = 0 if t in (0, tiers - 1) else rng.choice((-1, 0, 1))
        oz = 0 if t in (0, tiers - 1) else rng.choice((-1, 0, 1))
        # Branches carrying the tier (lower tiers only; the top tier sits on the trunk).
        if t < tiers - 1:
            for k in range(5):
                ang = k * 2 * math.pi / 5 + rng.uniform(-0.3, 0.3)
                for s in range(half + 1, int(r * 0.75)):
                    pts.append((round(math.cos(ang) * s), cy - 2 + (s - half) // 3, round(math.sin(ang) * s), wood))
        R = int(math.ceil(r)) + 2
        for x in range(-R, R + 1):
            for z in range(-R, R + 1):
                dx, dz = x - ox, z - oz
                # Boxy-round blob (Dungeons canopies are chunky, not perfect discs), edges noised.
                d = 0.55 * max(abs(dx), abs(dz)) + 0.45 * math.hypot(dx, dz) + rng.uniform(-0.35, 0.35)
                if d > r + 0.3:
                    continue
                sag = 1 if d > r - 1.2 else 0                   # rim droops one block
                bottom, top = cy - sag, cy + thick - 1 - (1 if d > r - 0.6 else 0)
                edge = d > r - 1.4
                for y in range(bottom, top + 1):
                    if y == bottom or y == top or edge:        # shell only
                        if edge and rng.random() < 0.05:
                            continue
                        pts.append((x, y, z, leaf))
                # Icicle strands hanging from the drooping rim; longer on the lower tiers.
                if d > r - 1.8 and rng.random() < 0.34:
                    length = rng.randint(2, 4 + (tiers - t) * 2)
                    for h in range(1, length + 1):
                        pts.append((x, bottom - h, z, strand if h % 3 else leaf))
    # Crown tuft above the top tier.
    for x in range(-1, 2):
        for z in range(-1, 2):
            if abs(x) + abs(z) < 2:
                pts.append((x, height + 3 + (1 if x == z == 0 else 0), z, leaf))
    return pts


def main():
    rng = random.Random(1313)
    fdir = D / "worldgen/feature"
    trees = {
        "pale_tree": tiered_tree(rng, 30, 9.0, 4, "pale_canopy", "soul_canopy"),
        "weeping_soul_tree": tiered_tree(rng, 24, 7.0, 3, "soul_canopy", "pale_canopy"),
    }
    for name, pts in trees.items():
        feature = overlay(pts)
        # Compact JSON: these giants have thousands of blocks, and indentation tripled the file size.
        (fdir / f"{name}.json").write_text(json.dumps(feature, separators=(",", ":")) + "\n")
        ys = [p[1] for p in pts]
        print(f"{name}: {len(feature['features'])} blocks, y {min(ys)}..{max(ys)}, "
              f"{(fdir / f'{name}.json').stat().st_size // 1024} KB")
    # Giants need more room: a little rarer than the 0.10 single-canopy trees.
    for name, chance in (("pale_tree", 4), ("weeping_soul_tree", 5)):
        p = D / f"worldgen/placed_feature/{name}.json"
        d = json.loads(p.read_text())
        for m in d["placement"]:
            if m["type"] == "minecraft:rarity_filter":
                m["chance"] = chance
        write(p, d)


if __name__ == "__main__":
    main()
