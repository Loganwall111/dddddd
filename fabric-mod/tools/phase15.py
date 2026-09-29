#!/usr/bin/env python3
"""0.15 rift + portal canvases, matched to the Dungeons II trailer refs. Deterministic and idempotent.

  textures/rift/interior_portal.png  the ritual portal: a bright, soft pixel mosaic of pale cyan and
                                     white squares (blue portal ref), slightly blurred like frosted glass.
  textures/rift/view_sift.png        rifts seen from outside the Sift: luminous rose / pink / cream
                                     marble with white veins and lavender hints (pink rift refs).
  textures/rift/view_overworld.png   rifts seen from inside the Sift: luminous coral / peach / gold /
                                     cream marble with a hint of mint (the warm rift ref).

All 256x128, seamless horizontally (the renderer scrolls U).
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/main/resources/assets/entersift/textures/rift"
W, H = 256, 128


def periodic_noise(rng, cx, cy):
    g = rng.random((cy + 1, cx))
    g = np.concatenate([g, g[:, :1]], axis=1)
    y, x = np.mgrid[0:H, 0:W]
    fx, fy = x / W * cx, y / H * cy
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    y1 = np.minimum(y0 + 1, cy)
    a, b, c, d = g[y0, x0], g[y0, x0 + 1], g[y1, x0], g[y1, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def fbm(seed, base=4, octaves=5):
    rng = np.random.default_rng(seed)
    return sum(periodic_noise(rng, base * 2 ** i, max(1, base // 2) * 2 ** i) * 0.5 ** i for i in range(octaves)) / (2 - 0.5 ** (octaves - 1))


def ramp(v, stops):
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (v >= p0) & (v <= p1)
        t = ((v - p0) / max(1e-6, p1 - p0))[..., None]
        out[m] = (np.array(c0, float) * (1 - t) + np.array(c1, float) * t)[m]
    return out


def wrap_blur(img, radius):
    """Gaussian blur that wraps horizontally (pad with the opposite edge, blur, crop)."""
    pad = int(radius * 3) + 2
    a = np.asarray(img)
    padded = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1)
    b = Image.fromarray(padded).filter(ImageFilter.GaussianBlur(radius))
    return Image.fromarray(np.asarray(b)[:, pad:pad + W])


def portal_mosaic():
    rng = np.random.default_rng(1501)
    tones = np.array([(236, 252, 255), (200, 242, 250), (168, 232, 244), (132, 218, 236), (98, 200, 226), (70, 178, 214)], float)
    # Weighted towards the pale tones: the ref reads almost white-cyan, with a few deeper squares.
    weights = np.array([0.2, 0.24, 0.22, 0.16, 0.11, 0.07])
    img = np.zeros((H, W, 3))
    low = fbm(1502, 4, 3)
    for size in (16, 8):
        for by in range(0, H, size):
            for bx in range(0, W, size):
                if size == 8 and rng.random() < 0.45:
                    continue  # keep some big squares whole
                k = rng.choice(len(tones), p=weights)
                # Nudge by a smooth field so light and dark squares cluster a little, like the ref.
                shift = int(round((low[by, bx] - 0.5) * 3))
                k = int(np.clip(k - shift, 0, len(tones) - 1))
                img[by:by + size, bx:bx + size] = tones[k]
    # A few small bright 4px flecks.
    for _ in range(90):
        x, y = rng.integers(0, W // 4) * 4, rng.integers(0, H // 4) * 4
        img[y:y + 4, x:x + 4] = img[y:y + 4, x:x + 4] * 0.4 + np.array((245, 255, 255)) * 0.6
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    soft = wrap_blur(im, 1.6)                                   # frosted, soft-edged squares
    out = Image.blend(im, soft, 0.7).convert("RGBA")
    out.save(OUT / "interior_portal.png")


def marble(seed, stops, vein=(255, 250, 246), accent=None, accent_amt=0.0):
    n1, n2, n3 = fbm(seed, 4), fbm(seed + 1, 4), fbm(seed + 2, 2, 4)
    y, x = np.mgrid[0:H, 0:W]
    # Domain-warped bands. The phase uses a whole number of periods across W, so it wraps seamlessly.
    phase = (x / W) * 2 * np.pi * 3 + (y / H) * 2 * np.pi * 0.8 + n1 * 7.0 + n2 * 4.0
    band = 0.5 + 0.5 * np.sin(phase)
    v = np.clip(band * 0.55 + n3 * 0.6 - 0.1, 0, 1)
    col = ramp(v, stops)
    # Thin white veins where the warped band crosses zero.
    veins = np.exp(-(np.sin(phase * 0.5 + n2 * 3) ** 2) / 0.012)
    col = col * (1 - veins[..., None] * 0.75) + np.array(vein, float) * veins[..., None] * 0.75
    if accent is not None:
        a = np.clip((fbm(seed + 5, 2, 4) - 0.62) * 4, 0, 1)[..., None] * accent_amt
        col = col * (1 - a) + np.array(accent, float) * a
    # Luminous: glow brighter towards the centre band, never dark.
    glow = (1 - np.abs(y / H - 0.5) * 2)[..., None] ** 1.5
    col = col * (0.88 + 0.12 * glow) + 255 * 0.1 * glow
    im = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB")
    # Gentle 2px pixelation like the trailer footage, then a whisper of softness.
    small = im.resize((W // 2, H // 2), Image.BILINEAR).resize((W, H), Image.NEAREST)
    return Image.blend(small, wrap_blur(small, 0.8), 0.35)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    portal_mosaic()
    marble(1511, [(0, (228, 108, 158)), (0.3, (246, 146, 186)), (0.55, (255, 186, 208)), (0.78, (255, 222, 230)), (1, (255, 246, 240))],
           accent=(214, 176, 255), accent_amt=0.45).save(OUT / "view_sift.png")
    marble(1521, [(0, (236, 112, 104)), (0.28, (250, 150, 112)), (0.52, (255, 190, 126)), (0.76, (255, 222, 160)), (1, (255, 244, 220))],
           accent=(196, 238, 206), accent_amt=0.3).save(OUT / "view_overworld.png")
    print("phase15: portal mosaic + marble views written")


if __name__ == "__main__":
    main()
