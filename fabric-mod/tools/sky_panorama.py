#!/usr/bin/env python3
"""Sift sky panoramas for the shaderpack (2048x1024 equirectangular, seamless in x).

Day  : the user's panorama if art/sky/sift_panorama_day.png exists, otherwise a painted one from the
       "Sift supreme" blueprint: mint-cyan sky (#39A59E-#5BBFB7), pearl + #00F2FF aurora curtains
       and a fan of soft rainbow light rays.
Night: a colour-dragged version of the day panorama (amber-gold / peach #DE7E7A-#C96253) with
       crimson #B8506D and dusty-rose #A64B56 ray pillars, as the blueprint specifies.
Also writes the small vanilla-sky textures used by SiftSkyLayer."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "shaderpack/shaders/textures"
USER = ROOT / "art/sky/sift_panorama_day.png"
W, H = 2048, 1024
rng = np.random.default_rng(0x51F7)

def hexc(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)

def periodic_noise(u, v, octaves=4, base=4):
    """Value noise that tiles in u (sum of random-phase sines, cheap and seamless)."""
    n = np.zeros_like(u)
    amp = 1.0
    for o in range(octaves):
        f = base * 2 ** o
        for _ in range(3):
            a, b, p = rng.integers(1, f + 1), rng.uniform(0.5, 2.0) * f, rng.uniform(0, 6.283)
            n += amp * np.sin(2 * np.pi * (a * u) + b * v * 3.1 + p) / 3
        amp *= 0.5
    return n / 2 + 0.5

def hsv2rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)

u, v = np.meshgrid((np.arange(W) + 0.5) / W, (np.arange(H) + 0.5) / H)
alt = 0.5 - v  # +0.5 zenith, 0 horizon, -0.5 nadir
up = np.clip(alt * 2, 0, 1)

def painted_day():
    horizon, mid, zenith = hexc("#39A59E"), hexc("#5BBFB7"), hexc("#A9E6DF")
    g = np.where(up[..., None] < 0.35, horizon + (mid - horizon) * (up[..., None] / 0.35),
                 mid + (zenith - mid) * ((up[..., None] - 0.35) / 0.65))
    below = np.clip(-alt * 2, 0, 1)[..., None]
    g = g * (1 - below) + horizon * 0.92 * below  # below the horizon: horizon mist, never void
    # Pearl haze band hugging the horizon.
    g += (np.exp(-((alt - 0.02) / 0.05) ** 2) * 0.22)[..., None] * hexc("#F4FFFD")
    # Fan of soft rainbow rays from a point low in the sky (wraps smoothly in u).
    du = (u - 0.3 + 0.5) % 1 - 0.5
    dv = alt - 0.02
    ang = np.arctan2(dv, du * 2.2)
    dist = np.sqrt((du * 2.2) ** 2 + dv ** 2)
    rays = (0.5 + 0.5 * np.sin(ang * 26 + 1.3 * np.sin(ang * 7))) ** 5
    rays *= np.clip(dv * 6 + 0.2, 0, 1) * np.exp(-dist * 1.1) * np.cos(np.clip(np.abs(du) / 0.5, 0, 1) * np.pi / 2) ** 2
    hue = (ang / np.pi * 1.4 + 0.55) % 1
    rainbow = hsv2rgb(hue, np.full_like(hue, 0.62), np.ones_like(hue))
    g = g + rays[..., None] * 0.42 * (rainbow * 0.85 + hexc("#FFD6E8") * 0.15)
    # Aurora: clean horizontal curtains of flat panes (cyan #00F2FF + pearl white).
    for k, (el, col, w) in enumerate([(0.16, "#00F2FF", 0.028), (0.24, "#F4FFFD", 0.022), (0.31, "#7FFFF0", 0.018)]):
        wave = el + 0.018 * np.sin(2 * np.pi * (u * (3 + k)) + k * 1.7)
        band = np.exp(-((alt - wave) / w) ** 2)
        panes = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * u * (48 + k * 10)))  # blocky vertical pane rhythm
        streak = 0.6 + 0.4 * periodic_noise(u, np.full_like(u, k * 0.37), 2, 6)
        g += (band * panes * streak * 0.32)[..., None] * hexc(col)
    return np.clip(g, 0, 1)

def colour_drag_night(day):
    """Map day luminance onto the amber / peach night ramp and add crimson ray pillars."""
    lum = day @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lo, mid, hi = hexc("#8E3F4E"), hexc("#C96253"), hexc("#F2B27A")
    t = np.clip((lum - lum.min()) / (np.ptp(lum) + 1e-6), 0, 1)[..., None]
    night = np.where(t < 0.55, lo + (mid - lo) * (t / 0.55), mid + (hi - mid) * ((t - 0.55) / 0.45))
    night = night * 0.55 + hexc("#DE7E7A") * 0.45 * (0.7 + 0.3 * t)
    # Keep some of the day image's saturation structure (the rays / curtains) as warm highlights.
    detail = np.clip(day - day.mean(axis=(0, 1)), 0, 1).max(-1, keepdims=True)
    night += detail * hexc("#FFE0B0") * 0.6
    # Crimson + dusty-rose vertical ray pillars in the upper sky.
    for k in range(14):
        c = rng.uniform(0, 1); w = rng.uniform(0.01, 0.028)
        col = hexc("#B8506D") if k % 2 == 0 else hexc("#A64B56")
        d = (u - c + 0.5) % 1 - 0.5
        pillar = np.exp(-(d / w) ** 2) * np.clip((alt - 0.06) * 3.5, 0, 1) * (0.6 + 0.4 * np.sin(v * 40 + k))
        night = night * (1 - pillar[..., None] * 0.7) + col * pillar[..., None] * 0.95
    return np.clip(night, 0, 1)

if USER.exists():
    day = np.asarray(Image.open(USER).convert("RGB").resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    source = "user panorama " + USER.name
else:
    day = painted_day()
    source = "painted from the blueprint palette"
night = colour_drag_night(day)
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray((day * 255).astype(np.uint8)).save(OUT / "sift_day.png", optimize=True)
Image.fromarray((night * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)).save(OUT / "sift_night.png", optimize=True)
# Previews for the README / art review.
prev = Image.new("RGB", (1024, 1024))
prev.paste(Image.fromarray((day * 255).astype(np.uint8)).resize((1024, 512)), (0, 0))
prev.paste(Image.fromarray((night * 255).astype(np.uint8)).resize((1024, 512)), (0, 512))
prev.save(ROOT / "art/sky/preview_day_night.png")
print("sky panoramas:", source)
