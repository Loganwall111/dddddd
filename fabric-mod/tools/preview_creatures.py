#!/usr/bin/env python3
"""Software preview of the generated creature models (no Minecraft needed).

Rasterises every textured box of every spec in tools/creatures.py from a 3/4 view and
writes docs/creature-preview.png. Useful to sanity-check pivots, UVs and proportions.
"""
from __future__ import annotations
import math, sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import creatures as C  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def rot(v, r):
    x, y, z = v
    rx, ry, rz = r
    # Minecraft ModelPart applies Z, then Y, then X (translateAndRotate: rotation ZYX quaternion)
    c, s = math.cos(rz), math.sin(rz); x, y = x * c - y * s, x * s + y * c
    c, s = math.cos(ry), math.sin(ry); x, z = x * c + z * s, -x * s + z * c
    c, s = math.cos(rx), math.sin(rx); y, z = y * c - z * s, y * s + z * c
    return x, y, z


def world_transform(spec, part):
    chain, cur = [part], part
    while cur["parent"]:
        cur = next(q for q in spec["parts"] if q["name"] == cur["parent"])
        chain.insert(0, cur)

    def apply(v):
        # innermost first: local rotation, then offset by (relative) pivot, then parent's...
        for i in range(len(chain) - 1, -1, -1):
            p = chain[i]
            v = rot(v, p["rot"])
            piv = p["pivot"]
            if i > 0:
                q = chain[i - 1]["pivot"]
                piv = (piv[0] - q[0], piv[1] - q[1], piv[2] - q[2])
            v = (v[0] + piv[0], v[1] + piv[1], v[2] + piv[2])
        return v
    return apply


def render(kind, spec, size=260, yaw=-35, pitch=18):
    tex = Image.open(C.ASSETS / "entity" / f"{kind}.png").convert("RGBA").load()
    C.pack(spec)
    polys = []
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))

    def view(v):
        x, y, z = v
        x, z = x * cy + z * sy, -x * sy + z * cy
        y, z = y * cp - z * sp, y * sp + z * cp
        return x, y, z

    for part in spec["parts"]:
        T = world_transform(spec, part)
        for b in part["boxes"]:
            (ox, oy, oz), (w, h, d) = b["o"], C.uv_size(b)[2]
            u, v = b["uv"]
            F = C.faces(u, v, w, h, d)
            # face: (region, origin, axis_u, axis_v) in model coordinates
            specs = {
                "north": (F["north"], (ox, oy, oz), (1, 0, 0), (0, 1, 0)),
                "south": (F["south"], (ox + w, oy, oz + d), (-1, 0, 0), (0, 1, 0)),
                "east": (F["east"], (ox, oy, oz + d), (0, 0, -1), (0, 1, 0)),
                "west": (F["west"], (ox + w, oy, oz), (0, 0, 1), (0, 1, 0)),
                "top": (F["top"], (ox, oy, oz + d), (1, 0, 0), (0, 0, -1)),
                "bottom": (F["bottom"], (ox, oy + h, oz), (1, 0, 0), (0, 0, 1)),
            }
            for (fx, fy, fw, fh), o, au, av in specs.values():
                for ty in range(fh):
                    for tx in range(fw):
                        col = tex[fx + tx, fy + ty]
                        if col[3] == 0:
                            continue
                        pts = []
                        for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                            p = (o[0] + au[0] * (tx + du) + av[0] * (ty + dv),
                                 o[1] + au[1] * (tx + du) + av[1] * (ty + dv),
                                 o[2] + au[2] * (tx + du) + av[2] * (ty + dv))
                            pts.append(view(T(p)))
                        depth = sum(p[2] for p in pts) / 4
                        polys.append((depth, [(p[0], p[1]) for p in pts], col))
    xs = [x for _, pts, _ in polys for x, _ in pts]
    ys = [y for _, pts, _ in polys for _, y in pts]
    scale = (size - 20) / max(max(xs) - min(xs), max(ys) - min(ys))
    img = Image.new("RGBA", (size, size), (34, 40, 52, 255))
    dr = ImageDraw.Draw(img)
    for depth, pts, col in sorted(polys, key=lambda t: -t[0]):
        dr.polygon([((x - min(xs)) * scale + 10, (y - min(ys)) * scale + 10) for x, y in pts], fill=col[:3])
    dr.text((4, 4), kind, fill="white")
    return img


def main():
    kinds = list(C.SPECS)
    cols = 5
    sheet = Image.new("RGBA", (cols * 260, ((len(kinds) + cols - 1) // cols) * 260), (20, 20, 28, 255))
    for i, k in enumerate(kinds):
        sheet.paste(render(k, C.SPECS[k]), ((i % cols) * 260, (i // cols) * 260))
    out = ROOT / "docs" / "creature-preview.png"
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
