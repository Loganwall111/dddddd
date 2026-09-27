#!/usr/bin/env python3
"""Paint the Sift sky panoramas (equirectangular 2048x1024, v=0 zenith, v=0.5 horizon).

Colour script matches the reference footage:
  * DAY   - warm glowing orange / peach / soft rose-pink ichor mist, with hazy crimson vertical
            pillars filling the top ~40% of the panorama, soft god-ray streaks and faint mint panes.
  * NIGHT - luminous pale cyan-teal / mint fog (never navy), with clean sweeping horizontal
            aurora curtains made of flat translucent rectangles, faint rose haze at top & horizon.
Deterministic (seeded). Writes shaderpack/shaders/textures/sift_{day,night}.png and art/ previews.
"""
from __future__ import annotations
import math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
W, H = 2048, 1024


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def gradient(stops):
    """stops: list of (v, hex) over v in [0,1]; returns HxWx3 float image."""
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    vs = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.stack([hexrgb(s[1]) for s in stops])
    out = np.stack([np.interp(v, vs, cols[:, c]) for c in range(3)], axis=1)
    return np.repeat(out[:, None, :], W, axis=1)


def noise(seed, scale, octaves=4):
    """Tileable-in-x value noise, HxW in [0,1]."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw, gh = max(2, int(scale * 2 ** o)), max(2, int(scale * 2 ** o / 2))
        g = rng.random((gh + 1, gw)).astype(np.float32)
        g = np.concatenate([g, g[:, :1]], axis=1)  # wrap in x
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        acc += np.asarray(img, np.float32) / 255 * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def comp(base: np.ndarray, lay: Image.Image, blur=0.0):
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(lay, np.float32) / 255
    alpha = a[..., 3:4]
    return base * (1 - alpha) + a[..., :3] * 255 * alpha


def screen(base, lay: Image.Image, blur=0.0):
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(lay, np.float32) / 255
    add = a[..., :3] * a[..., 3:4]
    b = base / 255
    return (1 - (1 - b) * (1 - add)) * 255


def rect(draw, cx, cy, w, h, ang, fill):
    """Rotated rectangle, drawn with horizontal wrap."""
    c, s = math.cos(ang), math.sin(ang)
    pts = [(cx + x * c - y * s, cy + x * s + y * c) for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    for dx in (-W, 0, W):
        draw.polygon([(x + dx, y) for x, y in pts], fill=fill)


def curtains(rng, n_curtains, v_lo, v_hi, palette, alpha, count=46, amp=26):
    """Clean sweeping horizontal aurora curtains built from flat rectangles."""
    soft, crisp = layer(), layer()
    ds, dc = ImageDraw.Draw(soft), ImageDraw.Draw(crisp)
    for k in range(n_curtains):
        base_v = v_lo + (v_hi - v_lo) * (k + 0.5) / n_curtains
        phase, freq = rng.random() * 6.283, rng.choice([1, 2])
        col = palette[k % len(palette)]
        pane_h = 80 + rng.random() * 50
        for i in range(count):
            u = (i + rng.random() * 0.4) / count
            x = u * W
            y = base_v * H + amp * math.sin(u * 6.283 * freq + phase)
            slope = amp * 6.283 * freq / W * math.cos(u * 6.283 * freq + phase)
            ang = math.atan(slope) + (rng.random() - 0.5) * 0.08
            w = W / count * 0.94
            h = pane_h * (0.85 + rng.random() * 0.3)
            a = int(255 * alpha * (0.55 + rng.random() * 0.45))
            rect(ds, x, y, w * 1.1, h * 1.2, ang, (*col, a))
            if rng.random() < 0.7:
                rect(dc, x, y + (rng.random() - 0.5) * 6, w * 0.86, h * 0.8, ang, (*[min(255, c + 25) for c in col], int(a * 0.8)))
    return soft, crisp


def pillars(rng, count, v_top, v_bottom, colors, alpha):
    """Hazy vertical crimson columns across the upper sky (top ~40%)."""
    lay = layer()
    arr = np.zeros((H, W, 4), np.float32)
    v = np.arange(H, dtype=np.float32) / H
    xs = np.arange(W, dtype=np.float32)
    for i in range(count):
        cx = (i + rng.random() * 0.7) / count * W
        width = 14 + rng.random() * 70 * rng.random() + 12
        top = v_top + rng.random() * 0.05
        bot = v_bottom - rng.random() * 0.12
        d = np.minimum(np.abs(xs - cx), W - np.abs(xs - cx))
        prof_x = np.exp(-(d / width) ** 2)
        prof_y = np.clip((v - top) / 0.06, 0, 1) * np.clip((bot - v) / 0.14, 0, 1)
        m = np.outer(prof_y, prof_x) * alpha * (0.6 + rng.random() * 0.4)
        col = np.array(colors[i % len(colors)], np.float32)
        arr[..., :3] = arr[..., :3] * (1 - m[..., None]) + col * m[..., None]  # premultiplied colour
        arr[..., 3] = arr[..., 3] * (1 - m) + m
    rgb = arr[..., :3] / np.maximum(arr[..., 3:4], 1e-4)
    lay = Image.fromarray(np.dstack([rgb, arr[..., 3] * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    return lay


def rays(rng, count, color, alpha):
    lay = layer()
    d = ImageDraw.Draw(lay)
    for i in range(count):
        x = rng.random() * W
        w = 10 + rng.random() * 40
        lean = (rng.random() - 0.5) * 120
        a = int(255 * alpha * (0.4 + rng.random() * 0.6))
        for dx in (-W, 0, W):
            d.polygon([(x + dx, 0), (x + w + dx, 0), (x + w + lean + dx, H * 0.5), (x + lean + dx, H * 0.5)], fill=(*color, a))
    return lay


def day():
    rng = random.Random(0xDA7)
    img = gradient([(0.0, "#e98a8f"), (0.18, "#f19a98"), (0.34, "#f6ae9a"), (0.46, "#fcc79c"),
                    (0.5, "#ffd9ab"), (0.56, "#f7c09e"), (1.0, "#d98c86")])
    n = noise(11, 6)
    img *= (0.94 + 0.1 * n[..., None])
    # Crimson pillars in the top 30-40%, two depths for parallax-like richness.
    img = comp(img, pillars(rng, 7, 0.0, 0.42, [(226, 40, 70), (238, 70, 90)], 0.55), blur=26)
    img = comp(img, pillars(rng, 11, 0.0, 0.4, [(208, 30, 60), (230, 52, 78), (246, 96, 112)], 0.5), blur=10)
    img = screen(img, pillars(rng, 9, 0.02, 0.38, [(255, 150, 150), (255, 190, 170)], 0.25), blur=6)
    # God-ray streaks from the glowing mist.
    img = screen(img, rays(rng, 26, (255, 236, 205), 0.16), blur=10)
    # Faint mint/white panes echoing the Sift aurora even by day.
    soft, crisp = curtains(rng, 2, 0.24, 0.4, [(190, 250, 225), (240, 255, 250)], 0.2, count=30, amp=30)
    img = screen(img, soft, blur=8)
    img = screen(img, crisp, blur=2.5)
    # Horizon glow band.
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    glow = np.exp(-((v - 0.5) / 0.05) ** 2)[:, None, None]
    img = img * (1 - 0.35 * glow) + np.array([255, 226, 190], np.float32) * 0.35 * glow
    return Image.fromarray(img.clip(0, 255).astype(np.uint8), "RGB")


def night():
    rng = random.Random(0x7EA1)
    img = gradient([(0.0, "#84cfd0"), (0.2, "#96dcd8"), (0.38, "#b4ecdf"), (0.48, "#cff5e6"),
                    (0.5, "#d8f7ea"), (0.56, "#b9e8df"), (1.0, "#7fc4c4")])
    n = noise(23, 5)
    img *= (0.95 + 0.08 * n[..., None])
    # Faint rose haze at the zenith corners and along the horizon (as in the refs).
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    u = (np.arange(W, dtype=np.float32) + 0.5) / W
    haze_top = (np.clip(1 - v / 0.16, 0, 1) ** 1.5)[:, None] * (0.5 + 0.5 * np.cos(u * 6.283 * 2))[None, :]
    haze_hor = np.exp(-((v - 0.5) / 0.04) ** 2)[:, None] * (0.5 + 0.5 * np.sin(u * 6.283 * 3 + 1))[None, :]
    rose = np.array([232, 150, 170], np.float32)
    for hz, k in ((haze_top, 0.42), (haze_hor, 0.3)):
        img = img * (1 - k * hz[..., None]) + rose * k * hz[..., None]
    # Subtle crimson columns at the very top (kept soft so the backdrop stays luminous teal).
    img = comp(img, pillars(rng, 8, 0.0, 0.3, [(238, 140, 165), (246, 160, 180)], 0.3), blur=18)
    # Clean horizontal aurora curtains of flat rectangles.
    pal = [(150, 255, 200), (205, 255, 250), (120, 240, 190), (235, 255, 255), (170, 250, 235)]
    soft, crisp = curtains(rng, 3, 0.14, 0.42, pal, 0.5, count=30, amp=40)
    img = screen(img, soft, blur=10)
    img = screen(img, crisp, blur=2.5)
    return Image.fromarray(img.clip(0, 255).astype(np.uint8), "RGB")


def main():
    out = ROOT / "shaderpack/shaders/textures"
    d, n = day(), night()
    d.save(out / "sift_day.png")
    n.save(out / "sift_night.png")
    d.resize((1024, 512)).save(ROOT / "art/sift-day-sky.png")
    n.resize((1024, 512)).save(ROOT / "art/sift-night-sky.png")
    print("skies painted")


if __name__ == "__main__":
    main()
