#!/usr/bin/env python3
"""0.12 rift views (deterministic, idempotent). Writes two horizontally tileable 256x128 canvases:

  textures/rift/view_sift.png       seen from the Overworld (or any non-Sift dimension) through SIFT
                                    rifts: coral / orange / yellow pixel sunset clouds with white
                                    square sparkles, like the trailer shot with the cow.
  textures/rift/view_overworld.png  seen from inside the Sift: a flat Overworld panorama (blue sky,
                                    blocky clouds, far blue hills, green hills with blocky trees and a
                                    golden field in front), like the yellow rift in the Sift footage.

Both are painted at 1/4 resolution and upscaled with nearest-neighbour, so they read as chunky
pixels like the footage. Every noise term is periodic in x, so U can wrap without a seam.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/main/resources/assets/entersift/textures/rift"
W, H = 256, 128
LW, LH = W // 4, H // 4  # painting resolution (64 x 32)


def pnoise(rng, cells_x, cells_y, w=LW, h=LH):
    """Value noise, periodic in x."""
    g = rng.random((cells_y + 1, cells_x))
    g = np.concatenate([g, g[:, :1]], axis=1)
    y, x = np.mgrid[0:h, 0:w]
    fx, fy = x / w * cells_x, y / h * cells_y
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    y1 = np.minimum(y0 + 1, cells_y)
    a, b, c, d = g[y0, x0], g[y0, x0 + 1], g[y1, x0], g[y1, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def fbm(seed, base_x=4, base_y=2, octaves=4):
    rng = np.random.default_rng(seed)
    return sum(pnoise(rng, base_x * 2 ** i, base_y * 2 ** i) * 0.5 ** i for i in range(octaves)) / (2 - 0.5 ** (octaves - 1))


def line_noise(seed, x, terms):
    """Periodic 1-D height function: sum of sines with integer frequencies (wraps at x = 1)."""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(x, dtype=float)
    for f, amp in terms:
        out += amp * np.sin(2 * math.pi * (f * x + rng.random()))
    return out


def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return np.asarray(a, float) * (1 - t) + np.asarray(b, float) * t


def vgrad(stops, h=LH, w=LW):
    """Vertical gradient from a list of (pos, rgb)."""
    y = (np.arange(h) + 0.5) / h
    col = np.zeros((h, 3))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (y >= p0) & (y <= p1)
        t = ((y - p0) / (p1 - p0))[m]
        col[m] = np.asarray(c0) * (1 - t[:, None]) + np.asarray(c1) * t[:, None]
    return np.repeat(col[:, None, :], w, axis=1)


def upscale(img):
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").resize((W, H), Image.NEAREST)


def sift_sunset():
    img = vgrad([(0.0, (226, 92, 104)), (0.35, (242, 128, 96)), (0.62, (250, 170, 96)), (0.82, (255, 212, 118)), (1.0, (255, 236, 170))])
    y = (np.mgrid[0:LH, 0:LW][0] + 0.5) / LH
    # Three banks of puffy clouds, each denser toward its own band, shaded top-light / bottom-coral.
    banks = [(0.22, 0.16, (255, 196, 150), (208, 84, 96), 11), (0.5, 0.18, (255, 222, 160), (226, 110, 88), 23), (0.78, 0.16, (255, 244, 196), (240, 150, 90), 37)]
    for centre, spread, light, dark, seed in banks:
        n = fbm(seed, 5, 2, 4)
        band = np.exp(-((y - centre) / spread) ** 2)
        cover = n * band
        mask = cover > 0.34
        shade = np.clip((fbm(seed + 1, 5, 2, 3) - 0.35) * 2.2 + (centre - y) * 2.5, 0, 1)  # lighter on top
        cloud = lerp(dark, light, shade)
        edge = np.clip((cover - 0.34) / 0.08, 0, 1)
        img = np.where(mask[..., None], img * (1 - edge[..., None]) + cloud * edge[..., None], img)
    # The bright glow where the light pours through from the other side.
    glow = np.exp(-((y - 0.58) / 0.22) ** 2)[..., None]
    img = img + glow * np.array([40, 30, 10])
    # White square sparkles (1-2 painting pixels = 4-8 texels), wrapping in x.
    rng = np.random.default_rng(1212)
    for _ in range(34):
        sx, sy, s = int(rng.integers(0, LW)), int(rng.integers(1, LH - 2)), int(rng.choice([1, 1, 1, 2]))
        for dx in range(s):
            for dy in range(s):
                img[min(LH - 1, sy + dy), (sx + dx) % LW] = (255, 255, 250)
    return upscale(img)


def overworld_panorama():
    x = (np.arange(LW) + 0.5) / LW
    img = vgrad([(0.0, (104, 158, 236)), (0.45, (150, 196, 246)), (0.62, (206, 228, 250)), (1.0, (206, 228, 250))])
    # Blocky white clouds high in the sky.
    n = fbm(401, 6, 2, 3)
    yy = (np.mgrid[0:LH, 0:LW][0] + 0.5) / LH
    cloud = (n > 0.6) & (yy > 0.06) & (yy < 0.3)
    img[cloud] = img[cloud] * 0.1 + np.array([250, 252, 255]) * 0.9
    under = np.roll(cloud, 1, axis=0) & ~cloud & (yy < 0.34)
    img[under] = img[under] * 0.6 + np.array([214, 224, 240]) * 0.4
    # Far blue hills, near green hills, golden field.
    far = 0.52 + line_noise(7, x, [(1, 0.05), (3, 0.03), (7, 0.012)])
    near = 0.64 + line_noise(9, x, [(2, 0.05), (5, 0.025), (11, 0.01)])
    field = 0.8 + line_noise(13, x, [(1, 0.015), (4, 0.008)])
    for i in range(LW):
        for j in range(LH):
            v = (j + 0.5) / LH
            if v > field[i]:
                stripe = 1.0 if (j + (i // 3)) % 3 else 0.86  # wheat rows
                d = (v - field[i]) / (1 - field[i] + 1e-6)
                c = np.array([236, 196, 72]) * (1 - d) + np.array([206, 150, 46]) * d
                img[j, i] = c * stripe
            elif v > near[i]:
                d = (v - near[i]) / max(field[i] - near[i], 1e-3)
                img[j, i] = np.array([112, 178, 70]) * (1 - d) + np.array([78, 140, 52]) * d
            elif v > far[i]:
                d = (v - far[i]) / max(near[i] - far[i], 1e-3)
                img[j, i] = np.array([128, 164, 196]) * (1 - d * 0.4) + np.array([96, 150, 120]) * d * 0.4
    # Blocky oak trees standing on the near hills (3x3 canopy, 1-wide trunk), wrapping in x.
    rng = np.random.default_rng(77)
    xs = sorted(set(int(v) for v in rng.integers(0, LW, 11)))
    for tx in xs:
        base = int(near[tx] * LH)
        trunk_h = int(rng.integers(1, 3))
        for k in range(trunk_h):
            if 0 <= base - 1 - k < LH:
                img[base - 1 - k, tx] = (110, 78, 44)
        top = base - 1 - trunk_h
        leaf = np.array([54, 118, 40]) if rng.random() < 0.5 else np.array([66, 132, 46])
        for dx in (-1, 0, 1):
            for dy in (-2, -1, 0):
                y0 = top + dy
                if 0 <= y0 < LH:
                    shade = 1.12 if dy == -2 else (0.9 if dy == 0 else 1.0)
                    img[y0, (tx + dx) % LW] = leaf * shade
    return upscale(img)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("view_sift", sift_sunset), ("view_overworld", overworld_panorama)):
        img = fn()
        a = np.asarray(img)
        assert (a[:, 0] == a[:, 0]).all() and img.size == (W, H)
        img.save(OUT / f"{name}.png")
        print("wrote", f"{name}.png")


if __name__ == "__main__":
    main()
