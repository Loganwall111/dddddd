#!/usr/bin/env python3
"""0.16 textures. Deterministic and idempotent.

  textures/rift/interior_portal.png  portal mosaic v3: brighter, whiter cyan, BIGGER blocky cells (32/16 px)
                                     with a fine frosted grain inside each cell (close-up blue portal ref).
  textures/rift/veil.png             tileable grid of soft translucent voxel squares, white (tinted per rift
                                     type by vertex colour). Two veils float in front of the canvas at different
                                     depths and zoom inward on a loop: the 3-layer "sinkhole" face.
  textures/gui/rift_flash.png        the orange-red lens-flare burst of the rift transition: white-gold core,
                                     radial rays, faint green streaks and pixel squares (transition refs).
  textures/gui/rift_glitch.png       tileable RGB-split glitch strip (red / cyan fringes, white scan streaks).
  textures/mob_effect/rift_transit.png  18x18 effect icon.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase15  # noqa: E402  (periodic noise + wrap blur helpers)

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / "src/main/resources/assets/entersift/textures"


def portal_mosaic():
    W, H = phase15.W, phase15.H
    rng = np.random.default_rng(1601)
    tones = np.array([(246, 255, 255), (214, 250, 255), (178, 242, 252), (140, 230, 248), (104, 214, 242), (78, 196, 234)], float)
    weights = np.array([0.24, 0.24, 0.2, 0.15, 0.1, 0.07])
    low = phase15.fbm(1602, 4, 3)
    img = np.zeros((H, W, 3))
    for size in (32, 16):
        for by in range(0, H, size):
            for bx in range(0, W, size):
                if size == 16 and rng.random() < 0.5:
                    continue  # many big squares stay whole
                k = rng.choice(len(tones), p=weights)
                k = int(np.clip(k - int(round((low[by, bx] - 0.5) * 3)), 0, len(tones) - 1))
                img[by:by + size, bx:bx + size] = tones[k]
    # 8 px flecks of near-white.
    for _ in range(70):
        x, y = rng.integers(0, W // 8) * 8, rng.integers(0, H // 8) * 8
        img[y:y + 8, x:x + 8] = img[y:y + 8, x:x + 8] * 0.35 + np.array((250, 255, 255)) * 0.65
    # Frosted grain inside the cells (the ref squares are not flat).
    grain = rng.normal(0, 7, (H, W, 1))
    img = img + grain
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    soft = phase15.wrap_blur(im, 1.2)
    Image.blend(im, soft, 0.55).convert("RGBA").save(TEX / "rift/interior_portal.png")


def veil():
    S, cell = 128, 16
    rng = np.random.default_rng(1603)
    a = np.zeros((S, S))
    y, x = np.mgrid[0:cell, 0:cell]
    # Soft-edged square: bright rim, faint centre (a hollow voxel seen face-on).
    edge = np.minimum(np.minimum(x, cell - 1 - x), np.minimum(y, cell - 1 - y)).astype(float)
    rim = np.clip(1.0 - edge / 2.5, 0, 1) * 0.9 + 0.12
    for by in range(0, S, cell):
        for bx in range(0, S, cell):
            r = rng.random()
            if r < 0.42:
                continue  # empty cell: the canvas behind shows through
            strength = 0.35 + 0.65 * rng.random()
            a[by:by + cell, bx:bx + cell] = np.maximum(a[by:by + cell, bx:bx + cell], rim * strength)
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    rgba = Image.merge("RGBA", (Image.new("L", (S, S), 255),) * 3 + (img,))
    rgba.save(TEX / "rift/veil.png")


def flash():
    S = 256
    rng = np.random.default_rng(1604)
    y, x = np.mgrid[0:S, 0:S].astype(float)
    dx, dy = (x - S / 2) / (S / 2), (y - S / 2) / (S / 2)
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    rays = np.zeros_like(r)
    for _ in range(26):
        a0, w, s = rng.random() * 2 * np.pi, 0.02 + rng.random() * 0.06, 0.4 + rng.random() * 0.6
        d = np.abs(np.angle(np.exp(1j * (ang - a0))))
        rays += s * np.exp(-(d / w) ** 2)
    core = np.exp(-(r / 0.28) ** 2)
    base = np.array((255, 88, 36), float)       # orange-red field
    gold = np.array((255, 196, 92), float)
    white = np.array((255, 250, 228), float)
    img = base * np.ones((S, S, 1))
    img = img * (1 - np.clip(rays * 0.35, 0, 0.6))[..., None] + gold * np.clip(rays * 0.35, 0, 0.6)[..., None]
    img = img * (1 - core)[..., None] + white * core[..., None]
    img *= (1 - 0.18 * np.clip(r - 0.8, 0, 1))[..., None]  # slightly deeper red corners
    # Faint green streaks and pixel squares, like the refs.
    for _ in range(9):
        a0 = rng.random() * 2 * np.pi
        d = np.abs(np.angle(np.exp(1j * (ang - a0))))
        m = np.exp(-(d / 0.012) ** 2) * np.clip(r - 0.25, 0, 1) * 0.45
        img = img * (1 - m)[..., None] + np.array((150, 230, 120)) * m[..., None]
    for _ in range(40):
        px, py, sz = rng.integers(0, S // 8) * 8, rng.integers(0, S // 8) * 8, int(rng.choice([4, 8]))
        c = np.array((255, 214, 130)) if rng.random() < 0.7 else np.array((170, 240, 150))
        img[py:py + sz, px:px + sz] = img[py:py + sz, px:px + sz] * 0.5 + c * 0.5
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.6))
    (TEX / "gui").mkdir(parents=True, exist_ok=True)
    im.convert("RGBA").save(TEX / "gui/rift_flash.png")


def glitch():
    W, H = 256, 128
    rng = np.random.default_rng(1605)
    img = np.zeros((H, W, 4))
    for _ in range(46):
        y0, h = rng.integers(0, H), int(rng.integers(1, 5))
        x0, w = rng.integers(0, W), int(rng.integers(30, 200))
        kind = rng.random()
        c = (255, 70, 90) if kind < 0.33 else (70, 240, 255) if kind < 0.72 else (255, 255, 255)
        alpha = 0.35 + 0.5 * rng.random()
        for k in range(w):
            xx = (x0 + k) % W
            img[y0:y0 + h, xx, :3] = c
            img[y0:y0 + h, xx, 3] = np.maximum(img[y0:y0 + h, xx, 3], alpha * (1 - abs(k / w - 0.5) * 1.2))
    img[..., 3] = np.clip(img[..., 3], 0, 1) * 255
    Image.fromarray(img.astype(np.uint8), "RGBA").save(TEX / "gui/rift_glitch.png")


def icon():
    S = 18
    y, x = np.mgrid[0:S, 0:S].astype(float)
    img = np.zeros((S, S, 4))
    edge = np.minimum(np.minimum(x - 2, 15 - x), np.minimum(y - 2, 15 - y))
    inside = edge >= 0
    img[inside] = (255, 132, 72, 255)
    img[(edge >= 0) & (edge < 1.5)] = (255, 236, 214, 255)
    img[(edge >= 4)] = (255, 250, 236, 255)
    (TEX / "mob_effect").mkdir(parents=True, exist_ok=True)
    Image.fromarray(img.astype(np.uint8), "RGBA").save(TEX / "mob_effect/rift_transit.png")


def main():
    portal_mosaic()
    veil()
    flash()
    glitch()
    icon()
    print("phase16: portal mosaic v3, veil, transition flash + glitch, effect icon written")


if __name__ == "__main__":
    main()
