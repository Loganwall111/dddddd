#!/usr/bin/env python3
"""Front-view preview of RiftPortalRenderer (a port of its shape + timeline logic) -> art/rift_preview.png.
Top row: the five RiftTypes fully grown. Bottom row: the SIFT growth timeline (ticks 10..90)."""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / "src/main/resources/assets/entersift/textures/rift"
M64 = (1 << 64) - 1
CELL, BASE, TIERS = 0.5, 0.25, 5
TYPES = {0: ("overworld", (0xFF, 0xE4, 0x5C)), 1: ("nether", (0xFF, 0x33, 0x33)), 2: ("end", (0xC9, 0xA2, 0xFF)),
         3: ("sift", (0xFF, 0xBF, 0xE0)), 4: ("portal", (0x8C, 0xF6, 0xFF))}

def s64(v): v &= M64; return v - (1 << 64) if v >> 63 else v
def hash_(seed, a, b):
    h = (seed * 0x9E3779B97F4A7C15 + a * 0xBF58476D1CE4E5B9 + b * 0x94D049BB133111EB) & M64
    h ^= h >> 31; h = (h * 0x7FB5D329728EA185) & M64; h ^= h >> 27
    return (h >> 40) / float(1 << 24)

def in_body(t, seed, u, v, xb, yb, i, j, cols, rows):
    if t == 3:
        arm = 0.8 + 0.16 * hash_(seed, j // 2, 7)
        inn = (abs(u) < .42 and abs(v) < .66) or (abs(u) < .17 and 0 < v < .98) or (abs(v) < .3 and abs(u) < arm)
        if hash_(seed, 1, 1) > .35: inn |= -.8 < u < -.48 and -.72 < v < -.28
        if hash_(seed, 2, 2) > .35: inn |= .5 < u < .82 and .28 < v < .58
        return inn
    if t == 1:
        if abs(xb) < 1 and abs(yb) < 1: return True
        for k in range(6):
            cx = (hash_(seed, k, 11) - .5) * cols * CELL * .75; cy = (hash_(seed, k, 12) - .5) * rows * CELL * .7
            hb = .35 + .6 * hash_(seed, k, 13)
            if abs(xb - cx) < hb and abs(yb - cy) < hb: return True
        return False
    if t == 0:
        return (abs(u) < .45 and abs(v) < .5) or (-.92 < u < -.2 and -.25 < v < .35) or (.15 < u < .86 and .05 < v < .75) \
            or (-.35 < u < .1 and .4 < v < .96) or (.3 < u < .95 and -.62 < v < -.2)
    if t == 2:
        band = min(3, int((v + 1) / 2 * 4)); off = (hash_(seed, band, 21) - .5) * .5; half = .34 + .26 * hash_(seed, band, 22)
        return abs(u - off) < half
    border = i == 0 or j == 0 or i == cols - 1 or j == rows - 1
    return not (border and hash_(seed, i, j) < .3)

def build(t, seed, w, h):
    cols, rows = max(4, round(w / CELL)), max(4, round(h / CELL)); cw, ch = w / cols, h / rows
    body = [[False] * rows for _ in range(cols)]; tier = [[0] * rows for _ in range(cols)]
    for i in range(cols):
        for j in range(rows):
            u = (i + .5) / cols * 2 - 1; v = (j + .5) / rows * 2 - 1
            body[i][j] = in_body(t, seed, u, v, -w / 2 + (i + .5) * cw, -h / 2 + (j + .5) * ch, i, j, cols, rows)
            d = max(abs(u), abs(v)) * .85 + .15 * hash_(seed, i, j + 97); tier[i][j] = min(TIERS - 1, int(d * TIERS))
    on = lambda i, j: 0 <= i < cols and 0 <= j < rows and body[i][j]
    sats = []
    for k in range({3: 8, 1: 11, 0: 6, 2: 7}.get(t, 4)):
        a = hash_(seed, k, 31) * math.pi * 2; px = py = 0; r = 0
        while r < 1.5:
            u, v = math.cos(a) * r, math.sin(a) * r
            if not on(int((u + 1) / 2 * cols), int((v + 1) / 2 * rows)): break
            px, py = u * w / 2, v * h / 2; r += .02
        sc = .9 * hash_(seed, k, 36) if t == 1 else .25
        px += math.cos(a) * sc; py += math.sin(a) * sc
        sw, sh = .5 + .5 * hash_(seed, k, 32), .45 + .5 * hash_(seed, k, 33)
        zf = .12 + .7 * hash_(seed, k, 34)
        sats.append((px - sw / 2, BASE + h / 2 + py - sh / 2, px + sw / 2, BASE + h / 2 + py + sh / 2, zf, k))
    return dict(cols=cols, rows=rows, cw=cw, ch=ch, w=w, h=h, body=body, tier=tier, sats=sats, on=on)

def appear(tier): return 51 + tier * (80 - 51 - 4) / TIERS
def pop(age, at):
    d = age - at
    if d < 0: return 0
    if d >= 4: return 1
    f = d / 4; c = 1.70158; return 1 + (c + 1) * (f - 1) ** 3 + c * (f - 1) ** 2

def render(t, age, seed, w=5.0, h=3.5, S=64, size=(460, 400), S2=None):
    sh = build(t, seed, w, h); name, edge = TYPES[t]
    tex = Image.open(TEX / f"interior_{name}.png").convert("RGB")
    img = Image.new("RGB", size, (46, 58, 52)); glow = Image.new("RGB", size, (0, 0, 0))
    cx0, cy0 = size[0] / 2, size[1] / 2 + (BASE + h / 2) * S
    P = lambda x, y: (cx0 + x * S, cy0 - y * S)
    d = ImageDraw.Draw(img); g = ImageDraw.Draw(glow)
    cy = BASE + h / 2
    if age < 28:
        f = min(1, age / 20); e = 1 - (1 - f) ** 2; R = max(w, h) * .62 * S
        for rn in range(2):
            r = max(1, (e - rn * .25) * R); a = (1 - f * .7) * (.55 if rn == 0 else .3)
            c = tuple(int(v * a) for v in edge); x, y = P(0, cy)
            g.ellipse([x - r, y - r, x + r, y + r], outline=c, width=max(2, int(.18 * r * .3)))
    if 21 <= age < appear(1) + 2:
        k = min(1, (age - 21) / 4) * (1 - max(0, min(1, (age - appear(0)) / 8)))
        x, y = P(0, cy); g.ellipse([x - 70 * k, y - 70 * k, x + 70 * k, y + 70 * k], fill=tuple(int(v * .5) for v in edge))
        d.rectangle([x - .2 * k * S, y - .12 * k * S, x + .2 * k * S, y + .12 * k * S], fill=(255, 250, 242))
        for b in range(5):
            bk = int(age // 2)
            if hash_(seed + bk, b, 50) < .25: continue
            tx = round((hash_(seed + bk, b, 51) - .5) * (w + 3)) + .5; ty = round(cy + (hash_(seed + bk, b, 52) - .5) * (h + 2))
            pts = [P(0, cy)]
            for i in range(1, 11):
                f = i / 10; jit = 0 if i == 10 else 0.5
                pts.append(P(tx * f + (hash_(seed + bk * 7 + b, i, 61) - .5) * jit, cy + (ty - cy) * f + (hash_(seed + bk * 7 + b, i, 62) - .5) * jit))
            g.line(pts, fill=edge, width=6); d.line(pts, fill=(255, 255, 255), width=2)
    if age >= 51:
        span = max(w, h) * 2
        def canvas(x0, y0, x1, y1, shift=0):
            u0 = (x0 / span + .5 + shift) % 1; v0 = min(1, max(0, .5 - (y1 - cy) / (h * 1.3))); v1 = min(1, max(0, .5 - (y0 - cy) / (h * 1.3)))
            uw = (x1 - x0) / span
            box = (int(u0 * 256), int(v0 * 128), max(int(u0 * 256) + 1, int(min(1, u0 + uw) * 256)), max(int(v0 * 128) + 1, int(v1 * 128)))
            (a, b), (c, e2) = P(x0, y1), P(x1, y0)
            if c - a >= 1 and e2 - b >= 1: img.paste(tex.crop(box).resize((int(c - a) + 1, int(e2 - b) + 1), Image.NEAREST), (int(a), int(b)))
        glow_col = tuple(int(v * .12) for v in edge); x, y = P(0, cy); R = max(w, h) * .85 * S
        g.ellipse([x - R, y - R, x + R, y + R], fill=glow_col)
        vis = lambda i, j: sh["on"](i, j) and pop(age, appear(sh["tier"][i][j])) >= 1
        for i in range(sh["cols"]):
            for j in range(sh["rows"]):
                if not sh["body"][i][j]: continue
                at = appear(sh["tier"][i][j]); k = pop(age, at)
                if k <= 0: continue
                x0 = -w / 2 + i * sh["cw"]; y0 = BASE + j * sh["ch"]; mx, my = x0 + sh["cw"] / 2, y0 + sh["ch"] / 2
                hx, hy = sh["cw"] / 2 * k, sh["ch"] / 2 * k
                canvas(mx - hx, my - hy, mx + hx, my + hy)
                hot = max(0, 1 - (age - at) / 7)
                if hot > 0:
                    (a, b), (c, e2) = P(mx - hx, my + hy), P(mx + hx, my - hy); d.rectangle([a, b, c, e2], fill=tuple(int(255 * hot + v * (1 - hot)) for v in (200, 190, 180)))
                for (ni, nj, seg) in [(i - 1, j, ((mx - hx, my - hy), (mx - hx, my + hy))), (i + 1, j, ((mx + hx, my - hy), (mx + hx, my + hy))),
                                      (i, j - 1, ((mx - hx, my - hy), (mx + hx, my - hy))), (i, j + 1, ((mx - hx, my + hy), (mx + hx, my + hy)))]:
                    if not vis(ni, nj):
                        p0, p1 = P(*seg[0]), P(*seg[1]); g.line([p0, p1], fill=tuple(int(v * .8) for v in edge), width=int(.32 * S)); d.line([p0, p1], fill=(255, 252, 247), width=int(.13 * S))
        for (x0, y0, x1, y1, zf, k2) in sh["sats"]:
            k = pop(age, appear(TIERS) + k2 % 3)
            if k <= 0: continue
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2; hx, hy = (x1 - x0) / 2 * k, (y1 - y0) / 2 * k
            off = zf * .35  # fake perspective: forward boxes shift up-right, showing their cream walls
            (a, b), (c, e2) = P(mx - hx + off, my + hy + off), P(mx + hx + off, my - hy + off)
            (a2, b2), (c2, e3) = P(mx - hx, my + hy), P(mx + hx, my - hy)
            d.polygon([(a2, b2), (a, b), (a, e2), (a2, e3)], fill=(236, 226, 214)); d.polygon([(a2, e3), (a, e2), (c, e2), (c2, e3)], fill=(214, 200, 190))
            canvas(mx - hx, my - hy, mx + hx, my + hy, .07)
            for q in ([(a, b), (c, b), (c, e2), (a, e2), (a, b)], [(a2, b2), (c2, b2), (c2, e3), (a2, e3), (a2, b2)]):
                g.line(q, fill=edge, width=int(.3 * S)); d.line(q, fill=(255, 252, 247), width=int(.08 * S))
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    out = Image.fromarray(np.clip(np.asarray(img, dtype=np.int32) + np.asarray(glow, dtype=np.int32), 0, 255).astype(np.uint8))
    ImageDraw.Draw(out).text((8, 6), f"{TYPES[t][0].upper()}  tick {age if age < 900 else 'stable'}", fill=(255, 255, 255))
    return out

def main():
    seed = 123456789
    top = [render(t, 999, seed + t, w=5.0 if t != 2 else 3.5, h=3.5 if t != 2 else 4.5) for t in (3, 1, 0, 2, 4)]
    bot = [render(3, a, seed + 3) for a in (8, 16, 34, 57, 64, 71, 999)][:5]
    W = 460 * 5; sheet = Image.new("RGB", (W, 800), (20, 22, 30))
    for i, im in enumerate(top): sheet.paste(im, (i * 460, 0))
    for i, im in enumerate(bot): sheet.paste(im, (i * 460, 400))
    out = ROOT / "art/rift_preview.png"; sheet.save(out); print("wrote", out)

if __name__ == "__main__":
    main()
