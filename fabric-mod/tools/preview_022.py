#!/usr/bin/env python3
"""0.22 accuracy-pass preview (no Minecraft needed).

Ports the exact maths of the 0.22 renderer/sky changes to numpy and renders:
  top    : front view of a Sift rift - filled irregular voxel tear, translucent pastel energy fog
           interior (rift.fsh window branch), pale-lilac recessed step walls, THICK white rim + pink
           halo, detached satellite voxels, white sparkles, night background showing through (alpha 0.82);
  bottom : 360-degree Sift sky strip (night stage) with the new animated overlay dome (wavy bands) and
           the wavy ribbon arches over the original lava-lamp gradient.
Writes docs/preview-0.22.png. Dependencies: numpy + Pillow (tools venv).
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(0x5117)

# ---------------------------------------------------------------- value noise / fbm (shader maths)
def hash21(x, y):
    p = np.modf(np.stack([x, y], -1) * np.array([123.34, 456.21]))[0]
    p = p + (p * (p + 45.32)).sum(-1, keepdims=True)
    return np.modf(p[..., 0] * p[..., 1])[0]

def vnoise(x, y):
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    f, g = x - np.floor(x), y - np.floor(y)
    f, g = f * f * (3 - 2 * f), g * g * (3 - 2 * g)
    h = lambda a, b: hash21(i + a, j + b)
    return (h(0, 0) * (1 - f) + h(1, 0) * f) * (1 - g) + (h(0, 1) * (1 - f) + h(1, 1) * f) * g

def fbm(x, y):
    s, a = np.zeros_like(x), 0.5
    for _ in range(3):
        s = s + a * vnoise(x, y); x, y = x * 2.03 + 17.1, y * 2.03 + 9.2; a *= 0.5
    return s

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- rift silhouette (RiftShape SIFT)
COLS = ROWS = 11
def silhouette():
    body = np.zeros((COLS, ROWS), bool)
    for i in range(COLS):
        for j in range(ROWS):
            u = (i + .5) / COLS * 2 - 1; v = (j + .5) / ROWS * 2 - 1
            arm = 0.82 + 0.15 * 0.6; lean = 1
            inside = (abs(u) < .36 and abs(v) < .58) or (abs(u) < .19 and -0.96 < v < .98) \
                or (lean * u > -0.3 and lean * u < .1 and .5 < v < .8) \
                or (abs(v) < .26 and abs(u) < arm) \
                or (abs(u) > .5 and abs(u) < arm - .12 and .2 < v < .4)
            if 0.6 > 0.35: inside = inside or (-0.8 < u < -0.48 and -0.72 < v < -0.28)
            inside = inside or (0.5 < u < 0.82 and 0.28 < v < 0.58)
            body[i, j] = inside
    return body

def boxes(body):
    """Greedy rectangular depth boxes, centre first (port of RiftShape.boxes, deterministic)."""
    depth = np.zeros_like(body, float); done = np.zeros_like(body, bool)
    ci, cj = (COLS - 1) / 2, (ROWS - 1) / 2
    cells = sorted(((i, j) for i in range(COLS) for j in range(ROWS) if body[i, j]),
                   key=lambda c: abs(c[0] - ci) + abs(c[1] - cj) * 1.1)
    bid = 0
    for (i0, j0) in cells:
        if done[i0, j0]: continue
        x0, y0 = i0, j0
        x1, y1 = i0, j0
        maxw, maxh = 3 + bid % 3, 2 + bid % 2
        grew = True
        while grew:
            grew = False
            if x1 - x0 + 1 < maxw and x1 + 1 < COLS and body[x1 + 1, y0:y1 + 1].all() and not done[x1 + 1, y0:y1 + 1].any():
                x1 += 1; grew = True
            if x1 - x0 + 1 < maxw and x0 - 1 >= 0 and body[x0 - 1, y0:y1 + 1].all() and not done[x0 - 1, y0:y1 + 1].any():
                x0 -= 1; grew = True
            if y1 - y0 + 1 < maxh and y1 + 1 < ROWS and body[x0:x1 + 1, y1 + 1].all() and not done[x0:x1 + 1, y1 + 1].any():
                y1 += 1; grew = True
            if y1 - y0 + 1 < maxh and y0 - 1 >= 0 and body[x0:x1 + 1, y0 - 1].all() and not done[x0:x1 + 1, y0 - 1].any():
                y0 -= 1; grew = True
        d = 1.45 if bid == 0 else 0.55 + 0.7 * ((bid * 37 % 100) / 100)
        depth[x0:x1 + 1, y0:y1 + 1] = d; done[x0:x1 + 1, y0:y1 + 1] = True
        bid += 1
    return depth

# ---------------------------------------------------------------- rift panel
S = 64                      # px per cell
W, H = COLS * S, ROWS * S
def rift_panel():
    body = silhouette(); depth = boxes(body)
    yy, xx = np.mgrid[0:H, 0:W]
    ci, cj = xx // S, yy // S
    inside = body[np.minimum(ci, COLS - 1), np.minimum(cj, ROWS - 1)]
    dmap = depth[np.minimum(ci, COLS - 1), np.minimum(cj, ROWS - 1)]
    u, v = xx / W, yy / H
    t = 12.0
    # --- interior energy fog (rift.fsh 0.22 window branch, view 3 night)
    rip = np.stack([np.sin(v * 14 + t) * .02, np.cos(u * 10 - t * .6) * .02], -1)
    wu, wv = u + rip[..., 0], v + rip[..., 1]
    g1 = fbm(wu * 3.1 + t * .05, wv * 3.1 - t * .03)
    g2 = fbm(wu * 5.7 - t * .04 + 11, wv * 5.7 + t * .06)
    g3 = fbm(wu * 9.3 - t * .02 + 27, wv * 9.3 + t * .05)
    palA = np.array([1., .66, .80])
    palB = np.array([1., .78, .50])
    palC = np.array([1., .95, .86])
    e = palA[None, None] * (1 - smooth(.40, .68, g1))[..., None] + palB[None, None] * smooth(.40, .68, g1)[..., None]
    e = e * (1 - (smooth(.50, .80, g2) * .45)[..., None]) + palC[None, None] * (smooth(.50, .80, g2) * .45)[..., None]
    e = e * 1.12
    dd = np.stack([u - .5, v - .5], -1)
    core = np.exp(-(dd ** 2).sum(-1) * 6)
    e = e * (1 - (core * .35)[..., None]) + np.array([1., .99, .96])[None, None] * (core * .35)[..., None]
    e = e + np.array([.55, .95, .90])[None, None] * (smooth(.62, .90, g3) * .10)[..., None]
    e = e * (0.92 + 0.08 * math.sin(t * .9))
    # recessed-box shading: deeper boxes read a touch cooler/darker (alcove walls catch the glow)
    shade = 1.0 - 0.10 * (dmap / max(dmap.max(), 1e-6))
    e = e * shade[..., None]
    # sparkles
    sp = hash21(np.floor(wu * 140 + t * .6), np.floor(wv * 140 - t * .35))
    e = e + (sp > 0.988)[..., None] * 0.6
    # --- background: night overworld (deep blue + stars + turf)
    bg = np.zeros((H, W, 3))
    bg[..., 0] = 0.05 + 0.10 * (1 - v)
    bg[..., 1] = 0.09 + 0.16 * (1 - v)
    bg[..., 2] = 0.28 + 0.30 * (1 - v)
    stars = hash21(np.floor(u * 90), np.floor(v * 90)) > 0.995
    bg = bg + stars[..., None] * 0.9
    ground = v > 0.86
    bg[ground] = bg[ground] * 0.3 + np.array([0.10, 0.22, 0.10])
    # translucent: bg shows through at 1-0.82
    img = bg * (1 - 0.82) + np.clip(e, 0, 1) * 0.82
    img[~inside] = bg[~inside]
    # --- lilac step walls between depth boxes (inner steps of the alcove)
    step = np.zeros((H, W), bool)
    cell = lambda a: a[np.minimum(ci, COLS - 1), np.minimum(cj, ROWS - 1)]   # cell mask -> pixel mask
    for di in (-1, 1):
        ds = np.roll(depth, di, 0)
        edge = cell((np.abs(ds - depth) > 0.2) & body & np.roll(body, di, 0))
        px = ((xx % S) < 5) if di == 1 else ((xx % S) > S - 6)
        step |= edge & px
    for dj in (-1, 1):
        ds = np.roll(depth, dj, 1)
        edge = cell((np.abs(ds - depth) > 0.2) & body & np.roll(body, dj, 1))
        py = ((yy % S) < 5) if dj == 1 else ((yy % S) > S - 6)
        step |= edge & py
    lilac = np.array([0.80, 0.72, 0.88])
    img[step & inside] = img[step & inside] * 0.25 + lilac * 0.75
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    # --- thick white rim + pink halo on the silhouette (drawn, then blurred copy additive)
    rim = np.zeros((H, W), bool)
    one = np.ones((H, W), bool)
    for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nb = np.roll(np.roll(body, di, 0), dj, 1)
        edge = cell(body & ~nb)
        px = ((xx % S) < 7) if di == 1 else ((xx % S) > S - 8) if di == -1 else one
        py = ((yy % S) < 7) if dj == 1 else ((yy % S) > S - 8) if dj == -1 else one
        rim |= edge & px & py
    # wavy sides/corners: displace the rim mask horizontally by the 0.22 side-wave
    amp = 6 * (np.abs(u - 0.5) * 2) ** 2 * (0.55 + 0.45 * (np.abs(v - 0.5) * 2) ** 2)
    dx = (amp * np.sin(v * 9 + 1.3)).astype(int)
    rimw = np.zeros_like(rim)
    for x in range(W):
        xs = np.clip(x + dx[:, x], 0, W - 1)
        rimw[:, x] = rim[np.arange(H), xs]
    rgba = np.array(out.convert('RGB'), np.float32) / 255
    rgba[rimw] = rgba[rimw] * 0.1 + np.array([1., 1., 1.]) * 0.9
    rimimg = Image.fromarray((rimw * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
    ga = np.array(rimimg, np.float32) / 255
    pink = np.array([1.0, 0.55, 0.80])
    add = np.clip(ga[..., None] * 0.65 * pink[None, None, :], 0, 1)
    final = np.clip(rgba + add, 0, 1)
    # satellites: four detached voxel tabs
    from PIL import ImageDraw
    im = Image.fromarray((final * 255).astype(np.uint8)); dr = ImageDraw.Draw(im)
    for (sx, sy, sw, sh) in ((-1.5, 3.2, 1.3, 1.1), (10.6, 5.4, 1.2, 1.0), (2.2, -1.2, 1.1, 0.9), (8.4, 10.4, 1.2, 1.0)):
        x0, y0 = sx * S, sy * S
        dr.rectangle([x0, y0, x0 + sw * S, y0 + sh * S], fill=(246, 214, 224), outline=(255, 255, 255), width=5)
    return im.filter(ImageFilter.GaussianBlur(0.6))

# ---------------------------------------------------------------- sky strip (night + 0.22 layers)
def sky_strip(w=1024, h=256):
    az = np.linspace(0, 2 * math.pi, w, endpoint=False)[None, :].repeat(h, 0)
    el = np.linspace(-0.05, 1.45, h)[:, None].repeat(w, 1)
    t = 30.0
    hor, mid, zen = np.array([.859, .471, .251]), np.array([.784, .408, .227]), np.array([.604, .290, .188])
    c = hor[None, None] * (1 - smooth(.02, .45, el))[..., None] + mid[None, None] * smooth(.02, .45, el)[..., None]
    c = c * (1 - smooth(.4, .95, el))[..., None] + zen[None, None] * smooth(.4, .95, el)[..., None]
    # overlay dome: wavy additive bands (peak alpha .06)
    cx, cy = np.cos(az) * 2.2, np.sin(az) * 2.2
    wob = vnoise(cx, cy + t * .05)
    b = np.sin(el * 9.0 + 1.7 * wob + t * .06)
    band = smooth(.45, .9, b)
    a = 0.06 * band * (0.6 + 0.4 * np.sin(t * .1 + az * 2))
    c = c + (band[..., None] * a[..., None]) * np.array([1.0, .75, .85])[None, None] * 3
    # wavy ribbon arches
    AUR = [np.array([.49, 1., .77]), np.array([.37, .88, .88]), np.array([1., .55, .75]), np.array([.72, .61, 1.])]
    for k in range(5):
        base = .20 + .15 * k
        e2 = base + .055 * np.sin(az * 3 + t * .10 + k * 1.7) + .030 * np.sin(az * 6 - t * .061 + k) \
            + .018 * np.sin(az * 11 + t * .13 + k * .7)
        d = np.abs(el - e2)
        w = .035 + .02 * ((k * 37 % 10) / 10)
        fall = 1 - smooth(w * .4, w, d)
        c = c + fall[..., None] * 0.5 * AUR[k % 4][None, None]
    # faint vertical curtains
    for k in range(4):
        a0 = k * 1.7 + .4
        fall = np.exp(-((az - a0) % (2 * math.pi) - .6) ** 2 * 6)
        c = c + (fall * smooth(0, .3, el) * (1 - smooth(.6, 1.3, el)) * .22)[..., None] * AUR[(k + 1) % 4][None, None]
    return Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8))

if __name__ == '__main__':
    rift = rift_panel(); sky = sky_strip()
    canvas = Image.new('RGB', (rift.width, rift.height + sky.height + 8), (10, 10, 14))
    canvas.paste(rift, (0, 0)); canvas.paste(sky.resize((rift.width, sky.height)), (0, rift.height + 8))
    out = ROOT / 'docs' / 'preview-0.22.png'
    canvas.save(out)
    print('wrote', out, canvas.size)
