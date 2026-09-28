#!/usr/bin/env python3
"""Flat interior canvases for the 0.10 RiftPortalRenderer (one per RiftType), deterministic.
Soft fbm "clouds of the other side", pixelated like the trailer footage, seamless horizontally
(the renderer scrolls them slowly in U). Writes textures/rift/interior_<type>.png (256x128)."""
import math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/main/resources/assets/entersift/textures/rift"
W, H = 256, 128

def periodic_noise(seed, cells_x, cells_y):
    rng = np.random.default_rng(seed)
    g = rng.random((cells_y + 1, cells_x))
    g = np.concatenate([g, g[:, :1]], axis=1)  # wrap horizontally
    y, x = np.mgrid[0:H, 0:W]
    fx, fy = x / W * cells_x, y / H * cells_y
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a, b = g[y0, x0], g[y0, x0 + 1]
    c, d = g[np.minimum(y0 + 1, cells_y), x0], g[np.minimum(y0 + 1, cells_y), x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def fbm(seed):
    return sum(periodic_noise(seed + i, 4 * 2 ** i, 2 * 2 ** i) * 0.5 ** i for i in range(4)) / 1.875

def ramp(v, stops):
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (v >= p0) & (v <= p1)
        t = ((v - p0) / (p1 - p0))[..., None]
        out[m] = (np.array(c0) * (1 - t) + np.array(c1) * t)[m]
    return out

TYPES = {
    "sift": [(0, (214, 76, 72)), (0.35, (240, 128, 92)), (0.55, (248, 170, 118)), (0.75, (252, 212, 168)), (1, (255, 242, 222))],
    "nether": [(0, (44, 6, 12)), (0.4, (132, 20, 28)), (0.65, (212, 44, 36)), (0.85, (255, 120, 40)), (1, (255, 214, 120))],
    "overworld": [(0, (170, 120, 30)), (0.4, (226, 180, 60)), (0.7, (246, 222, 110)), (0.85, (190, 214, 110)), (1, (255, 246, 200))],
    "end": [(0, (30, 16, 58)), (0.4, (96, 56, 150)), (0.7, (176, 132, 228)), (0.9, (226, 206, 250)), (1, (246, 242, 190))],
    "portal": [(0, (22, 110, 140)), (0.45, (60, 190, 214)), (0.75, (128, 238, 246)), (1, (236, 255, 255))],
}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for k, (name, stops) in enumerate(TYPES.items()):
        v = fbm(100 + k * 17)
        v = (v - v.min()) / (v.max() - v.min())
        # A bright heart in the middle band, like light pouring through from the other side.
        yy = np.mgrid[0:H, 0:W][0] / H
        v = np.clip(v * 0.85 + 0.25 * np.exp(-((yy - 0.5) / 0.28) ** 2), 0, 1)
        img = Image.fromarray(ramp(v, stops).astype(np.uint8), "RGB")
        block = 8 if name == "portal" else 4  # trailer interiors are pixelated; the portal is a mosaic
        img = img.resize((W // block, H // block), Image.BILINEAR).resize((W, H), Image.NEAREST)
        img.save(OUT / f"interior_{name}.png")
        print("wrote", f"interior_{name}.png")

if __name__ == "__main__":
    main()
