#!/usr/bin/env python3
"""Reference-driven texture pass (0.4).

Pulls palettes and structure out of the reference crops in art/ref_crops and
turns them into tileable 16px Minecraft block textures plus animated 32px
portal / rift strips. Deterministic: re-running produces identical files.

    python3 tools/extract_textures.py
"""
from __future__ import annotations
import json, math, random
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CROPS = ROOT / "art" / "ref_crops"
TEX = ROOT / "src/main/resources/assets/entersift/textures"
BLOCK = TEX / "block"


def crop(name: str) -> Image.Image:
    return Image.open(CROPS / f"{name}.png").convert("RGB")


# Screenshot crops are shaded by in-scene lighting; these lift them back to albedo.
TONE = {"rose_brick": (1.45, 1.1, (8, -4, 0)), "spire_tower": (1.3, 1.1, (6, -2, 0)),
        "reef_stone": (1.35, 0.55, (-6, 8, 10)), "rose_ground": (1.1, 1.0, (0, 0, 0)),
        "teal_path": (1.15, 1.1, (0, 0, 0)),
        "rift_pink": (1.0, 1.9, (10, -8, 4)), "rift_orange": (1.0, 1.7, (14, -6, -14)),
        "rift_yellow": (1.0, 1.2, (0, 0, 0)), "rift_red": (1.05, 1.1, (0, 0, 0)), "rift_olive": (1.1, 1.5, (0, 6, -8))}


def tone(c, name):
    k, sat, shift = TONE.get(name, (1.0, 1.0, (0, 0, 0)))
    r, g, b = (v * k for v in c)
    m = (r + g + b) / 3
    return tuple(int(max(0, min(255, m + (v - m) * sat + s))) for v, s in zip((r, g, b), shift))


def palette(name: str, n: int = 7) -> list[tuple[int, int, int]]:
    """Median-cut palette, lighting-compensated, sorted dark -> light."""
    im = crop(name).filter(ImageFilter.GaussianBlur(1.2))
    q = im.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    cols = [tuple(pal[i : i + 3]) for i in range(0, len(pal), 3)]
    cols = [tone(c, name) for c in cols]
    return sorted(cols, key=lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])


def save(img: Image.Image, name: str, folder: Path = BLOCK) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    img.save(folder / f"{name}.png")


def value_noise(size: int, seed: int, cells: int = 4) -> np.ndarray:
    """Tileable value noise in [0,1]."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells, cells))
    out = np.zeros((size, size))
    for y in range(size):
        for x in range(size):
            gx, gy = x / size * cells, y / size * cells
            x0, y0 = int(gx) % cells, int(gy) % cells
            x1, y1 = (x0 + 1) % cells, (y0 + 1) % cells
            tx, ty = gx - int(gx), gy - int(gy)
            tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            a = grid[y0, x0] * (1 - tx) + grid[y0, x1] * tx
            b = grid[y1, x0] * (1 - tx) + grid[y1, x1] * tx
            out[y, x] = a * (1 - ty) + b * ty
    return out


def paint(values: np.ndarray, pal: list, alpha: np.ndarray | None = None) -> Image.Image:
    idx = np.clip((values * len(pal)).astype(int), 0, len(pal) - 1)
    rgb = np.array(pal, dtype=np.uint8)[idx]
    if alpha is None:
        return Image.fromarray(rgb, "RGB").convert("RGBA")
    a = (alpha * 255).astype(np.uint8)[..., None]
    return Image.fromarray(np.concatenate([rgb, a], axis=2), "RGBA")


def structured(name: str, seed: int, kind: str, pal_n: int = 6, lo: int = 0, hi: int | None = None) -> Image.Image:
    pal = palette(name, pal_n)[lo:hi]
    rng = random.Random(seed)
    n = value_noise(16, seed, 4) * 0.55 + value_noise(16, seed + 7, 8) * 0.45
    v = n.copy()
    if kind == "brick":
        for y in range(16):
            for x in range(16):
                row = y // 4
                off = 4 if row % 2 else 0
                if y % 4 == 3 or (x + off) % 8 == 7:
                    v[y, x] = min(v[y, x], 0.12)
                elif y % 4 == 0:
                    v[y, x] = min(1, v[y, x] + 0.2)
    elif kind == "cobble":  # irregular flagstones seen on the teal/rose paths
        pts = [(rng.random() * 16, rng.random() * 16) for _ in range(9)]
        for y in range(16):
            for x in range(16):
                ds = sorted(min((x - px) % 16, (px - x) % 16) ** 2 + min((y - py) % 16, (py - y) % 16) ** 2 for px, py in pts)
                edge = math.sqrt(ds[1]) - math.sqrt(ds[0])
                if edge < 0.9:
                    v[y, x] = 0.05
                else:
                    v[y, x] = 0.35 + 0.65 * v[y, x]
    elif kind == "strata":  # layered mesa / spire faces
        for y in range(16):
            band = 0.18 * math.sin(y * 1.3 + seed) + (0.15 if y % 5 == 0 else 0)
            v[y, :] = np.clip(v[y, :] * 0.7 + 0.3 + band - 0.1, 0, 1)
    elif kind == "cracked":  # reef sandstone with dark crack lines
        v = 0.45 + 0.55 * v
        x, y = rng.randrange(16), 0
        for _ in range(22):
            v[y % 16, x % 16] = 0.05
            y += 1 if rng.random() < 0.6 else 0
            x += rng.choice((-1, 0, 1))
    elif kind == "sand":
        v = 0.3 + 0.7 * (value_noise(16, seed, 8) * 0.4 + np.random.default_rng(seed).random((16, 16)) * 0.6)
    return paint(np.clip(v, 0, 0.999), pal)


def leaves(name: str, seed: int, drip: bool) -> Image.Image:
    """Chunky foliage with transparent notches and optional hanging drips (pale spirit trees)."""
    pal = palette(name, 6)[1:]
    rng = np.random.default_rng(seed)
    v = value_noise(16, seed, 4) * 0.6 + rng.random((16, 16)) * 0.4
    alpha = np.ones((16, 16))
    for _ in range(9):
        x, y = rng.integers(0, 16, 2)
        alpha[y, x] = 0
        if rng.random() < 0.5:
            alpha[y, (x + 1) % 16] = 0
    if drip:
        for x in range(0, 16, 3):
            L = rng.integers(2, 6)
            alpha[16 - L :, x] = np.where(rng.random(L) < 0.85, 1, 0)
            alpha[16 - L :, (x + 1) % 16] = 0
    return paint(np.clip(v, 0, 0.999), pal, alpha)


def plant(name: str, seed: int, style: str) -> Image.Image:
    """Cross-model plants: coral fans, grass tufts, glow bulbs."""
    pal = palette(name, 6)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    rng = random.Random(seed)
    if style == "coral_red":
        cols = [c for c in pal if c[0] > c[1] + 30] or [(200, 40, 40), (230, 70, 60)]
    elif style == "coral_yellow":
        cols = [(214, 162, 46), (236, 196, 80), (180, 120, 34)]
    elif style == "grass":
        cols = [(84, 196, 170), (112, 222, 190), (58, 150, 138), (150, 236, 206)]
    else:  # glow bulb
        cols = [(90, 240, 230), (170, 255, 250), (40, 170, 190)]
    blades = 6 if style != "glow" else 3
    for b in range(blades):
        x = 2 + b * (12 // blades) + rng.randint(0, 1)
        h = rng.randint(7, 15)
        lean = rng.choice((-1, 0, 1))
        for i in range(h):
            xx = int(x + lean * i / 5) % 16
            yy = 15 - i
            px[xx, yy] = cols[(i + b) % len(cols)] + (255,)
            if style.startswith("coral") and i > 3 and rng.random() < 0.35:
                px[(xx + rng.choice((-1, 1))) % 16, yy] = cols[0] + (255,)
        if style == "glow":
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    px[(x + dx + lean * h // 5) % 16, max(0, 15 - h + dy)] = cols[1] + (255,)
    return img


def animated_from_crop(name: str, frames: int, size: int = 32, mosaic: int = 16, drift=(1, 0), glint=True, seed=0) -> Image.Image:
    """Animated strip sampled from the literal reference interior, pixelated like the screenshots."""
    src = crop(name)
    big = src.resize((size * 4, size * 4), Image.LANCZOS)
    strip = Image.new("RGBA", (size, size * frames))
    rng = np.random.default_rng(seed)
    for f in range(frames):
        t = f / frames
        ox = int(t * big.width * drift[0]) % big.width
        oy = int(t * big.height * drift[1]) % big.height
        rolled = Image.fromarray(np.roll(np.roll(np.asarray(big), -oy, 0), -ox, 1))
        tile = rolled.crop((0, 0, size * 2, size * 2)).resize((mosaic, mosaic), Image.BOX).resize((size, size), Image.NEAREST)
        a = np.asarray(tile.convert("RGB")).astype(np.float32)
        # Colour breathing and sparse square glints (the screenshots' white pixel sparks).
        a *= 1.0 + 0.08 * math.sin(t * 6.283)
        if glint:
            for _ in range(3):
                gx, gy = rng.integers(0, size // 2, 2) * 2
                a[gy : gy + 2, gx : gx + 2] = 255
        strip.paste(Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert("RGBA"), (0, f * size))
    return strip


def animated_cloud(name: str, frames: int = 32, size: int = 32, seed: int = 0) -> Image.Image:
    """Rift interior: palette pulled from the reference rift, drifting blocky clouds + square sparks."""
    pal = palette(name, 9)[2:]  # drop the dark background / frame tones
    strip = Image.new("RGBA", (size, size * frames))
    n1, n2 = value_noise(size, seed, 4), value_noise(size, seed + 1, 8)
    rng = np.random.default_rng(seed)
    sparks = rng.integers(0, size // 2, (6, 2)) * 2
    for f in range(frames):
        t = f / frames
        a = np.roll(n1, int(t * size), 1) * 0.6 + np.roll(np.roll(n2, -int(t * size), 0), int(t * size), 1) * 0.4
        a = np.floor(a * 10) / 10  # posterise into the blocky bands of the screenshots
        img = np.asarray(paint(np.clip(a, 0, 0.999), pal)).copy()
        for i, (sx, sy) in enumerate(sparks):
            if (f + i * 5) % frames < frames // 3:
                img[sy : sy + 2, sx : sx + 2, :3] = 255
        strip.paste(Image.fromarray(img, "RGBA"), (0, f * size))
    return strip


def mcmeta(name: str, frametime: int, interpolate=True) -> None:
    (BLOCK / f"{name}.png.mcmeta").write_text(json.dumps({"animation": {"frametime": frametime, "interpolate": interpolate}}, indent=2) + "\n")


def forming_stages(name: str = "portal_mosaic", stages: int = 8) -> None:
    """The threshold 'pixelates inward': each stage fills more 2px cells from the rim towards the centre."""
    base = crop(name).resize((32, 32), Image.BOX).resize((16, 16), Image.BOX).resize((32, 32), Image.NEAREST)
    a = np.asarray(base.convert("RGBA")).copy()
    rng = np.random.default_rng(42)
    cells = 16
    order = np.zeros((cells, cells))
    for y in range(cells):
        for x in range(cells):
            rim = min(x, y, cells - 1 - x, cells - 1 - y) / (cells / 2)
            order[y, x] = rim + rng.random() * 0.35
    order = (order - order.min()) / (order.max() - order.min())
    for s in range(stages):
        threshold = (s + 1) / stages
        img = a.copy()
        for y in range(cells):
            for x in range(cells):
                if order[y, x] > threshold:
                    img[y * 2 : y * 2 + 2, x * 2 : x * 2 + 2, 3] = 0
                elif order[y, x] > threshold - 0.12:  # bright leading edge of the wave
                    img[y * 2 : y * 2 + 2, x * 2 : x * 2 + 2, :3] = (220, 255, 255)
        save(Image.fromarray(img, "RGBA"), f"threshold_stage_{s}")


def main() -> None:
    # Terrain — palettes pulled from the reference crops.
    save(structured("rose_brick", 11, "brick"), "saltstone")
    save(structured("rose_brick", 12, "strata"), "rose_spire")
    save(structured("spire_tower", 13, "brick", 6, 0, 5), "spire_bricks")
    save(structured("rose_ground", 14, "cobble"), "rose_path")
    save(structured("teal_path", 15, "cobble"), "singer_moss")
    save(structured("teal_path", 16, "cobble", 6, 2), "teal_path")
    save(structured("reef_stone", 17, "cracked"), "reef_stone")
    save(structured("reef_stone", 18, "sand", 6, 2), "salt")
    save(leaves("teal_leaves", 19, False), "soul_canopy")
    save(leaves("pale_leaves", 20, True), "pale_canopy")
    save(plant("coral", 21, "coral_red"), "sift_coral_red")
    save(plant("coral", 22, "coral_yellow"), "sift_coral_yellow")
    save(plant("teal_path", 23, "grass"), "sift_grass")
    save(plant("teal_path", 24, "glow"), "glow_bulb")
    # Portal and rift families — literally sampled from the screenshots, animated.
    save(animated_from_crop("portal_mosaic", 32, drift=(1, 0), seed=1), "threshold"); mcmeta("threshold", 3)
    forming_stages()
    for key in ("pink", "orange", "yellow", "red", "olive"):
        save(animated_cloud(f"rift_{key}", seed=len(key) * 3), f"rift_{key}")
        mcmeta(f"rift_{key}", 3)
    save(animated_from_crop("portal_mosaic", 16, size=16, mosaic=8, drift=(0, 1), glint=False, seed=3), "sift_mosaic"); mcmeta("sift_mosaic", 6)


if __name__ == "__main__":
    main()
