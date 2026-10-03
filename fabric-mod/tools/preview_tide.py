#!/usr/bin/env python3
"""0.22 Sift tide skyboxes -> art/sky/sift_tides.png

Renders the three Sift tides that `/sifttide` selects, using the same maths as
`client/SiftSky.java` (dome gradient, lava-lamp blobs, arches, god rays, light squares):
equirectangular strips from 20 degrees below the horizon to the zenith, one row per tide.

  flow        the wavy mint dome: arch bands across the top, a glowing wavy border, light squares
  thrive      near night: rose/magenta sky with thousands of god rays fanning over the whole screen
  lava_lamp   the shipped lava-lamp sky at night (amber with crimson pillars)

This is a preview, not the game: the real sky is drawn by the client every frame. It exists so the three
skyboxes can be looked at side by side.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "art/sky/sift_tides.png"
W, H = 1024, 300           # 360 x ~120 degrees
SHEET_H = H * 3 + 40 * 4

rng = np.random.default_rng(0x5117)
PERM = rng.permutation(256).astype(np.int64)
PERM = np.concatenate([PERM, PERM])


def rgb(c):
    return np.array([(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255], dtype=float)


def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def grad(h, x, y, z):
    g = h & 15
    u = np.where(g < 8, x, y)
    v = np.where(g < 4, y, np.where((g == 12) | (g == 14), x, z))
    return np.where(g & 1 == 0, u, -u) + np.where(g & 2 == 0, v, -v)


def noise(x, y, z):
    X, Y, Z = [np.floor(a).astype(np.int64) & 255 for a in (x, y, z)]
    x, y, z = x - np.floor(x), y - np.floor(y), z - np.floor(z)
    u, v, w = fade(x), fade(y), fade(z)
    A = PERM[X] + Y
    AA, AB = PERM[A] + Z, PERM[A + 1] + Z
    B = PERM[X + 1] + Y
    BA, BB = PERM[B] + Z, PERM[B + 1] + Z
    L = lambda a, b, t: a + (b - a) * t
    x1 = L(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u)
    x2 = L(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u)
    y1 = L(x1, x2, v)
    x1 = L(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u)
    x2 = L(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u)
    return L(y1, L(x1, x2, v), w)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blob(k, x, y, z, t):
    s, d = 1.35, t * (0.018 + 0.006 * k)
    wx = noise(x * .8 + 11 * k, y * .8 + d, z * .8) * .6
    wy = noise(x * .8, y * .8 + 23 * k, z * .8 - d) * .6
    return noise((x + wx) * s + 37 * k + d, (y + wy) * s * 1.2 - d * .7, z * s + d * .5) \
        + .45 * noise(x * s * 2.1 - d, y * s * 2.1 + 51 * k, z * s * 2.1 + d)


# --------------------------------------------------------------------- palettes (SiftSky.java)
HORIZON = [rgb(0x7FD3CF), rgb(0x8FC2C4), rgb(0xC86A92), rgb(0xDB7840)]
MID = [rgb(0x5CC8C4), rgb(0x78C6C0), rgb(0xB45C8C), rgb(0xC8683A)]
ZENITH = [rgb(0x2E9AA6), rgb(0x4AA8AC), rgb(0x7A3C7C), rgb(0x9A4A30)]
BLOBS = [[rgb(0xF08CB4), rgb(0x7FF0D0), rgb(0x4FD0E0), rgb(0xFFA8C8)],
         [rgb(0x9CF0D8), rgb(0xF0A0C0), rgb(0x60D0D0), rgb(0xB8F0DC)],
         [rgb(0xFF8CB8), rgb(0x70D0D8), rgb(0xD080C0), rgb(0xFFA890)],
         [rgb(0xFFB060), rgb(0xE86A50), rgb(0xFFD08A), rgb(0xC05A70)]]
PILLAR = rgb(0xA84E56)

TIDES = {                       # (stage, tide adjustments)
    "flow": dict(stage=0, arches=True, rays=False, mint=True),
    "thrive": dict(stage=2, arches=False, rays=True, mint=False),
    "lava_lamp": dict(stage=3, arches=False, rays=False, mint=False),
}


def base_sky(stage, x, y, z, t, mint):
    up = np.maximum(0, y)[..., None]
    horizon, mid, zenith = HORIZON[stage].copy(), MID[stage].copy(), ZENITH[stage].copy()
    blobs = [b.copy() for b in BLOBS[stage]]
    if mint:                                    # FLOW tide adjustment (tidePalette)
        horizon = horizon * .65 + rgb(0x7FD3CF) * .35
        mid = mid * .65 + rgb(0x6FD8D0) * .35
        zenith = zenith * .70 + rgb(0x4FB0BE) * .30
        blobs = [b * .7 + (rgb(0xFF9FD0) if k % 2 == 0 else rgb(0x8CF0E4)) * .3 for k, b in enumerate(blobs)]
    c = horizon + (mid - horizon) * smooth(.02, .45, up)
    c = c + (zenith - c) * smooth(.40, .95, up)
    for k in range(4):
        w = (smooth(.05, .7, blob(k, x, y, z, t)) * .5)[..., None]
        c = c + (blobs[k] - c) * w
    if stage == 3:                              # crimson pillars at night
        az = np.arctan2(z, x)
        col = noise(np.cos(az) * 3.2 + t * .01, np.sin(az) * 3.2, np.full_like(az, t * .02)) \
            + .35 * noise(np.cos(az) * 7, np.sin(az) * 7 + t * .015, y * 1.5)
        edge = smooth(.02, .6, col) * (1 - smooth(.25, .95, up[..., 0])) * smooth(-.1, .12, y)
        c = c + (PILLAR - c) * (edge * .45)[..., None]
    haze = (1 - smooth(-.02, .2, y))[..., None]
    return c + (horizon - c) * haze


def add_arches(img, x, y, z, t):
    """FLOW: the wavy dome border — bright arch bands with an undulating lower edge."""
    az = np.arctan2(z, x)
    el = np.arcsin(np.clip(y, -1, 1))
    col = np.zeros_like(img)
    for b in range(5):
        base = 0.42 + 0.145 * b + 0.02 * math.sin(t * 0.05 + b)
        wav = base + 0.055 * np.sin(az * 3 + t * 0.09) + 0.022 * np.sin(az * 7 - t * 0.13)
        a = 0.44 * (1 - 0.55 * b / 6.0) * (0.6 + 0.4 * np.sin(t * 0.11))
        line = smooth(-0.03, 0.0, el - wav) * (1 - smooth(0.02, 0.14, el - wav))
        c = rgb(0x9CFFEE) if b % 2 == 0 else rgb(0xFFC8E8)
        col += line[..., None] * c * a
    return np.clip(img + col, 0, 1)


def add_rays(img, x, y, z, t, count=2400):
    """THRIVE: thousands of god rays fanning from a source above the zenith."""
    src_az, src_el = t * 0.010, 1.44
    src = np.array([math.cos(src_el) * math.cos(src_az), math.sin(src_el), math.cos(src_el) * math.sin(src_az)])
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(src, up)
    right /= np.linalg.norm(right)
    up2 = np.cross(right, src)
    col = np.zeros_like(img)
    rng2 = np.random.default_rng(7)
    for k in range(count):
        h1, h2, h3 = rng2.random(3)
        spread = 1.55 * (h1 * 2 - 1) + 0.12 * math.sin(t * 0.05 + k * 0.02)
        d = src + right * spread + up2 * (spread * 0.35)
        d /= np.linalg.norm(d)
        w = 0.006 + 0.018 * h2 * h2
        a = 0.055 + 0.10 * h2 * h2
        # angular distance from the ray direction to this pixel
        dot = np.clip(x * d[0] + y * d[1] + z * d[2], -1, 1)
        ang = np.arccos(dot)
        along = np.clip((src[0] * x + src[1] * y + src[2] * z), -1, 1)
        gate = smooth(0.02, 0.14, 1.0 - along)           # wedges start away from the source
        fall = 1.0 - 0.55 * (1.0 - along)
        beam = np.exp(-(ang / (w * (1 + 2.0 * (1 - along) * 0.5))) ** 2) * gate * fall * a
        c = rgb(0xFFF2D8) if k % 3 == 0 else (rgb(0xFFD9A0) if k % 3 == 1 else rgb(0xFFB6D8))
        col += beam[..., None] * c
    return np.clip(img + col, 0, 1)


def add_squares(img, x, y, z, t, weight):
    """Floating light squares (all tides)."""
    if weight <= 0:
        return img
    col = np.zeros_like(img)
    rng2 = np.random.default_rng(11)
    az = np.arctan2(z, x)
    el = np.arcsin(np.clip(y, -1, 1))
    for k in range(int(220 * min(1.6, weight))):
        h1, h2, h3, h4 = rng2.random(4)
        a_ = h1 * 2 * math.pi + t * 0.006 * (1 if k % 2 == 0 else -1)
        e_ = ((h2 + t * (0.004 + 0.010 * h3)) % 1.0) * 1.45 - 0.05
        if e_ < 0.02:
            continue
        size = 0.012 + 0.030 * h3
        alpha = weight * (0.28 + 0.30 * h4) * math.sin(math.pi * min(1.0, max(0.0, e_ / 1.45)))
        da = np.abs(((az - a_ + math.pi) % (2 * math.pi)) - math.pi)
        de = np.abs(el - e_)
        sq = (da < size / max(0.2, math.cos(e_))) & (de < size)
        col += sq[..., None] * alpha
    return np.clip(img + col, 0, 1)


def render(tide, name, t=37.0):
    az = np.linspace(0, 2 * math.pi, W)[None, :]
    el = np.radians(np.linspace(90, -20, H))[:, None]
    x = np.cos(el) * np.cos(az)
    y = np.sin(el) * np.ones_like(az)
    z = np.cos(el) * np.sin(az)
    cfg = TIDES[tide]
    img = base_sky(cfg["stage"], x, y, z, t, cfg["mint"])
    if cfg["arches"]:
        img = add_arches(img, x, y, z, t)
    if cfg["rays"]:
        img = add_rays(img, x, y, z, t)
    img = add_squares(img, x, y, z, t, 1.0 if cfg["arches"] else (1.6 if cfg["rays"] else 0.4))
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB")


def main():
    sheet = Image.new("RGB", (W, SHEET_H), (10, 10, 14))
    d = ImageDraw.Draw(sheet)
    y = 40
    for tide in ("flow", "thrive", "lava_lamp"):
        img = render(tide, tide, t=37.0 if tide != "lava_lamp" else 60.0)
        sheet.paste(img, (0, y))
        d.text((12, y + 8), f"/sifttide {tide}", fill=(255, 255, 255))
        y += H + 40
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f"wrote {OUT.relative_to(ROOT)} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
