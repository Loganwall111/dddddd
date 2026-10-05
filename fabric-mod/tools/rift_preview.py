"""Offline preview of the rift WINDOW shader (assets/entersift/shaders/core/rift.fsh).

Ports the GLSL math to numpy 1:1 so rendered frames can be compared against the
reference screenshots without a GPU. Pure development/verification tool; the game
never runs this. Usage: python3 rift_preview.py [outdir]
"""
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "build/rift_preview"
import os
os.makedirs(OUT, exist_ok=True)

TINT = np.array([[0.97, 0.60, 0.40], [0.95, 0.25, 0.18], [0.65, 0.38, 0.85], [1.0, 0.58, 0.65],
                 [0.20, 0.80, 0.95], [0.95, 0.85, 0.25], [1.0, 0.97, 0.96], [1.0, 0.78, 0.52]])
FROST = np.array([[0.90, 0.75, 0.76], [0.86, 0.44, 0.40], [0.52, 0.44, 0.58], [0.88, 0.81, 0.83],
                  [0.40, 0.70, 0.78], [0.92, 0.88, 0.66], [0.97, 0.96, 0.96], [0.52, 0.55, 0.60]])

def fract(x): return x - np.floor(x)
def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
def mix(a, b, t):
    a = np.asarray(a, float); b = np.asarray(b, float); t = np.asarray(t, float)
    if t.ndim >= 1 and t.shape[-1] != 3 and (a.shape[-1] == 3 or b.shape[-1] == 3):
        t = t[..., None]                      # per-pixel weight over colour vectors
    n = max(a.ndim, b.ndim, t.ndim)
    if a.ndim < n: a = a[(None,) * (n - a.ndim)]
    if b.ndim < n: b = b[(None,) * (n - b.ndim)]
    return a * (1 - t) + b * t

def hash21(p):
    px, py = p[..., 0], p[..., 1]
    p3x, p3y, p3z = fract(px * 0.1031), fract(py * 0.1031), fract(px * 0.1031)
    d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33)
    p3x, p3y, p3z = p3x + d, p3y + d, p3z + d
    return fract((p3x + p3y) * p3z)

def noise2d(p):
    i = np.floor(p); f = fract(p)
    u = f * f * (3 - 2 * f)
    a = mix(hash21(i), hash21(i + [1, 0]), u[..., 0])
    b = mix(hash21(i + [0, 1]), hash21(i + [1, 1]), u[..., 0])
    return mix(a, b, u[..., 1])

def pixel_clouds(d, t, scale, cover, seed):
    k = 1.0 / (np.maximum(d[..., 1], -0.08) + 0.22)
    g = np.stack([np.arctan2(d[..., 2], d[..., 0]), d[..., 1] * 3.0], -1)
    cell = np.floor(g * scale + [t * 0.010, 0.0] + seed)
    n = hash21(cell) * 0.6 + hash21(np.floor(cell * 0.37) + 7.0) * 0.4
    return (n >= cover).astype(float)

def sparkles(d, t):
    g = np.stack([np.arctan2(d[..., 2], d[..., 0]) * 30.0, d[..., 1] * 30.0 - t * 0.35], -1)
    cell = np.floor(g); fr = fract(g) - 0.5
    on = (hash21(cell + np.floor(t * 0.5)) >= 0.982).astype(float)
    return on * (np.maximum(np.abs(fr[..., 0]), np.abs(fr[..., 1])) <= 0.16)

def destination(d, tint, frost, uv, crack, strength, t):
    up = np.clip(d[..., 1], -1, 1)
    az = np.arctan2(d[..., 2], d[..., 0])
    zenith = mix(tint, frost, 0.25) * 0.55
    horizon = mix(tint, np.ones(3), 0.16)
    floorC = mix(tint, np.array([0.05, 0.06, 0.09]), 0.30)
    ridgeFar = mix(tint, frost, 0.45) * 0.30
    ridgeNear = mix(tint, np.array([0.03, 0.04, 0.06]), 0.62)
    col = mix(horizon, zenith, sstep(0.02, 0.62, up))
    col = mix(col, floorC, sstep(0.02, -0.22, up) * 0.85)
    farR = 0.115 + 0.055 * np.sin(az * 2.3 + 0.8) + 0.030 * np.sin(az * 5.1 + 2.2)
    nearR = 0.045 + 0.045 * np.sin(az * 3.1 - 1.1) + 0.022 * np.sin(az * 7.3 + 0.4)
    col = mix(col, ridgeFar, 0.75 * (1 - sstep(farR - 0.008, farR + 0.008, up)))
    col = mix(col, ridgeNear, 0.60 * (1 - sstep(nearR - 0.008, nearR + 0.008, up)))
    sun = np.sqrt(((az - 0.55) * 0.85) ** 2 + (up - 0.34) ** 2)
    col = col + tint * (np.exp(-sun * 4.5) * 0.12)[..., None]
    col = mix(col, np.ones(3), 1 - sstep(0.020, 0.045, sun))
    motes = np.sin(up * 26 - t * 2.2 + az * 5) * np.sin(up * 41 - t * 3.1 - az * 3 + 1.7)
    col = col + tint * (np.maximum(motes, 0) ** 6 * 0.30)[..., None]
    col = mix(col, mix(np.ones(3), tint, 0.30), pixel_clouds(d, t, 2.2, 0.72, 3.0) * 0.30)
    col = mix(col, np.ones(3), pixel_clouds(d, t * 1.35, 4.4, 0.80, 11.0) * 0.14)
    col = col + (sparkles(d, t) * 0.80)[..., None]
    col = mix(col, np.array([1.0, 0.48, 0.12]), crack * 0.35)
    uc = uv * 2 - 1
    col = col + tint * (0.08 + 0.12 * strength) * np.exp(-1.6 * (uc[..., 0] ** 2 + uc[..., 1] ** 2))[..., None]
    return col

def aperture_field(uc, ph):
    cx = uc[..., 0] + 0.06 * np.sin(uc[..., 1] * 2.8 + ph * 0.8976) + 0.03 * np.cos(uc[..., 1] * 5.2 - ph * 0.8976)
    cy = uc[..., 1] * 0.86 + 0.04 * np.cos(uc[..., 0] * 3.1 + ph * 0.8976)
    r = np.sqrt((cx * 1.08) ** 2 + cy ** 2)
    return np.clip(1 - sstep(0.42, 1.12, r), 0, 1)

def soul_face_band(uc, d, ph):
    w1 = np.sin(uc[..., 1] * 4.2 + np.sin(uc[..., 0] * 3.1 - ph * 0.8976) * 1.25 + ph * 0.8976)
    w2 = np.cos(uc[..., 0] * 3.4 - uc[..., 1] * 3.8 + np.cos(uc[..., 1] * 2.2 + ph * 0.8976) * 1.10)
    n = noise2d(uc * 2.6 + d[..., :2] * 1.4 + [0, ph * 0.35])
    L = np.sqrt((uc[..., 0] * 1.0) ** 2 + (uc[..., 1] * 0.82) ** 2)
    ring = sstep(0.18, 0.52, L) * (1 - sstep(0.78, 1.08, L))
    crest = 0.62 + 0.26 * (0.55 * w1 + 0.45 * w2) + 0.16 * (n - 0.5)
    return np.clip(crest * (0.65 + 0.45 * ring), 0, 1)

def interior_energy(uc, d, ph, tint, frost):
    fa = 0.5 + 0.5 * np.sin(uc[..., 1] * 3.6 + uc[..., 0] * 2.2 - ph * 0.8976 + d[..., 0] * 2)
    fb = 0.5 + 0.5 * np.cos(uc[..., 0] * 4.1 - uc[..., 1] * 2.9 + ph * 0.8976 + d[..., 1] * 2.4)
    rib = mix(mix([0.36, 0.92, 0.90], [0.58, 0.96, 0.84], fa),
              mix([0.98, 0.46, 0.72], mix([0.84, 0.26, 0.68], [0.52, 0.30, 0.88], fb), fb), 0.42 * fb)
    return mix(rib, mix(tint, frost, 0.48), 0.78)

def inner_glow(uc, edgeFade, ph, tint, frost):
    spine = 0.10 * np.sin(uc[..., 1] * 3.2 - ph * 0.8976)
    core = np.exp(-np.abs(uc[..., 0] - spine) * 3.2) * np.exp(-np.abs(uc[..., 1]) * 1.35)
    rim = np.clip(1 - edgeFade, 0, 1) ** 2.1
    coreCol = mix(mix(tint, frost, 0.5), [1.0, 0.99, 1.0], 0.68)
    return coreCol * (0.12 * core + 0.10 * rim)[..., None]

def floating_squares(uc, d, ph, tint, frost):
    acc = np.zeros(uc.shape[:-1] + (3,))
    for i in range(16):
        fi = float(i)
        layer = i % 3
        par = 0.04 + 0.045 * layer
        cx = (fract(fi * 0.6180339 + 0.13) * 2 - 1) * 0.68 + 0.045 * np.sin(ph * 0.8976 + fi * 1.73) - d[..., 0] * par
        cy = (fract(fi * 0.3819660 + 0.29) * 2 - 1) * 0.74 + 0.065 * np.cos(ph * 0.8976 + fi * 2.19) - d[..., 1] * par
        hx = (0.065 + 0.045 * fract(fi * 0.4142135)) * (1 - 0.14 * layer)
        hy = (0.070 + 0.050 * fract(fi * 0.7320508)) * (1 - 0.14 * layer)
        dd = np.maximum(np.abs(np.stack([uc[..., 0] - cx, uc[..., 1] - cy], -1)) / max(hx, hy), 1e-4)
        sq = np.maximum(dd[..., 0], dd[..., 1])
        pane = sstep(1.04, 0.86, sq)
        border = sstep(0.18, 0.0, np.abs(sq - 0.94))
        halo = np.exp(-sq * 2.3) * 0.16
        pulse = 0.72 + 0.28 * np.sin(ph * 0.8976 + fi * 1.37)
        w = [0.32, 0.22, 0.14][layer]
        sqc = mix(frost, np.ones(3), 0.55) if i % 2 == 0 else mix(tint, [0.72, 0.98, 1.0], 0.45)
        acc += sqc * ((pane * 0.06 + border * 0.90 + halo) * pulse * w)[..., None]
    return acc

def god_rays(uc, d, ph, tint, frost):
    diag = uc[..., 0] * 0.78 + uc[..., 1] * 0.62 + d[..., 0] * 0.35
    r1 = (0.5 + 0.5 * np.sin(diag * 7.5 - ph * 0.8976)) ** 4
    r2 = (0.5 + 0.5 * np.cos(diag * 11.0 + ph * 0.8976 + 1.1)) ** 5
    fall = sstep(-0.85, 0.75, uc[..., 1])
    shaft = mix(mix(tint, frost, 0.5), [1.0, 0.92, 0.96], 0.42)
    return shaft * ((0.08 * r1 + 0.06 * r2) * (0.45 + 0.55 * fall))[..., None]

def bloom(col, edgeFade, gloss):
    luma = col.max(-1)
    hi = sstep(0.68, 1.15, luma)
    bt = mix(col, np.ones(3), 0.35)
    return col + bt * (0.12 * hi + 0.06 * (1 - edgeFade) + 0.03 * gloss)[..., None]

def window(uv, view, frostAmt, fade, t):
    """1:1 port of the WINDOW branch (fogFade=1, no RIFT_REFRACT)."""
    uc = uv * 2 - 1
    tint, frost = TINT[view].copy(), FROST[view]
    ph = (t % 6.0) * (7.0 / 6.0)
    throb = 0.5 + 0.5 * np.sin(t * 8)
    p = ph
    strength = np.where(p < 1, p, np.where(p < 2, 1, np.where(p < 3, 0.45 + 0.4 * throb,
             np.where(p < 4, 4 - p, np.where(p < 5, 0.15, np.where(p < 6, 0.9, 0.25 + 0.3 * throb))))))
    if 4 <= p < 5: tint = np.array([0.6, 0.6, 0.6])
    if 5 <= p < 6: tint = np.array([1.0, 0.97, 0.96])
    edgeFade = np.exp(-3.0 * (uc[..., 0] ** 2 + uc[..., 1] ** 2))
    crack = 1 - sstep(0.012, 0.045, np.abs(uv[..., 0] - 0.5 - 0.1 * np.sin(np.floor(uv[..., 1] * 24) + np.floor(t * 5))))
    d = np.stack([uv[..., 0] * 0.9 - 0.45, uv[..., 1] * 0.9 - 0.45, np.ones_like(uv[..., 0])], -1)
    d = d / np.linalg.norm(d, axis=-1, keepdims=True)
    blur = 0.006 + 0.020 * frostAmt
    col = destination(d, tint, frost, uv, crack, strength, t)
    for off, w in [([0, blur, 0], 0.5), ([blur * 1.4, 0, 0], 0.35), ([0, 0, blur * 1.4], 0.35)]:
        dd = d + np.array(off)
        dd = dd / np.linalg.norm(dd, axis=-1, keepdims=True)
        col = mix(col, destination(dd, tint, frost, uv, crack, strength, t), w)
    ap = aperture_field(uc, ph)
    col = mix(col, interior_energy(uc, d, ph, tint, frost), (0.16 + 0.12 * ap) * (1 - 0.45 * frostAmt))
    fm = soul_face_band(uc, d, ph)
    bandK = 0.36 * (1 - 0.4 * frostAmt) * sstep(0.05, 0.45, edgeFade)
    col = mix(col, np.array([0.02, 0.02, 0.04]), sstep(0.70, 0.88, fm) * bandK)
    col = col + floating_squares(uc, d, ph, tint, frost) * (0.34 + 0.20 * (1 - frostAmt))
    col = col + god_rays(uc, d, ph, tint, frost)
    col = col + inner_glow(uc, edgeFade, ph, tint, frost)
    col = mix(col, frost, frostAmt * 0.40)
    col = col + 0.02 * frostAmt
    gloss = sstep(0.72, 1.0, np.sin((uv[..., 0] * 1.25 + uv[..., 1] * 0.75) * np.pi + t * 0.25) * 0.5 + 0.5)
    col = col + (0.14 * gloss * (0.35 + frostAmt))[..., None]
    col = bloom(col, edgeFade, gloss)
    arcAmt = sstep(0.16, 0.30, fade) * (1 - sstep(0.44, 0.60, fade))
    whiteOut = sstep(0.42, 0.66, fade)
    reveal = sstep(0.66, 0.94, fade)
    col = mix(col, np.array([1.0, 0.99, 0.98]), whiteOut * (1 - reveal))
    ringR = 0.18 + (1.45 - 0.18) * sstep(0.16, 0.60, fade)
    thick = 0.34 + (0.10 - 0.34) * sstep(0.16, 0.60, fade)
    arc = sstep(thick, thick * 0.35, np.abs(np.sqrt(uc[..., 0] ** 2 + uc[..., 1] ** 2) - ringR))
    col = mix(col, np.ones(3), arc * arcAmt * 0.9)
    destAmt = sstep(0.05, 0.45, edgeFade)
    glass = 0.86 + (0.98 - 0.86) * frostAmt
    a = (0.45 * edgeFade * (1 - destAmt) + glass * destAmt) * fade
    a *= 0.10 + 0.90 * sstep(0.04, 0.30, fade)
    a = np.maximum(a, arc * arcAmt * 0.85)
    return np.clip(col, 0, 1.6), a

# ---- pixel-cross silhouette (the geometry) + white neon rim ----------------
def cross_mask(uv):
    x = (uv[..., 0] * 2 - 1) * 4.5
    y = (uv[..., 1] * 2 - 1) * 4.5
    m = ((np.abs(x) < 1.5) & (np.abs(y) < 4.5)) | ((np.abs(x) < 4.5) & (np.abs(y) < 1.5))
    m = m | ((np.abs(x) < 2.5) & (np.abs(y) < 2.5))                      # shoulder tabs
    m = m | ((np.abs(x - 3.5) < 0.5) & (np.abs(y - 2.5) < 0.5))          # detached cube
    m = m | ((np.abs(x + 3.5) < 0.5) & (np.abs(y + 3.0) < 0.5))
    return m

def render(uv, view, frostAmt, fade, t, bg):
    col, a = window(uv, view, frostAmt, fade, t)
    m = cross_mask(uv)
    rim = (~m) & _dilate(m, 3)
    out = bg * (1 - (m * a)[..., None]) + np.clip(col, 0, 1) * (m * a)[..., None]
    out[rim] = out[rim] * 0.2 + np.array([1.0, 1.0, 1.0]) * 0.9          # neon rim
    return np.clip(out, 0, 1)

def _dilate(m, k):
    out = m.copy()
    for _ in range(k):
        out = out | np.roll(out, 1, 0) | np.roll(out, -1, 0) | np.roll(out, 1, 1) | np.roll(out, -1, 1)
    return out

def overworld_bg(uv):
    y = uv[..., 1]
    sky = mix(np.array([0.75, 0.88, 0.98]), np.array([0.45, 0.70, 0.95]), np.clip(y, 0, 1))
    ground = np.array([0.42, 0.62, 0.30])
    return np.where((y < 0.22)[..., None], ground, sky)

N = 448
gy, gx = np.mgrid[0:N, 0:N]
uv = np.stack([(gx + 0.5) / N, 1 - (gy + 0.5) / N], -1)

t = 12.0
img0 = render(uv, 0, 0.35, 1.0, t, overworld_bg(uv))
Image.fromarray((img0 * 255).astype(np.uint8)).save(f"{OUT}/rift_view0_overworld.png")
img3 = render(uv, 3, 0.35, 1.0, t, overworld_bg(uv))
Image.fromarray((img3 * 255).astype(np.uint8)).save(f"{OUT}/rift_view3_sift.png")

# ignition contact sheet, matches the reference sprite sheet order
fades = [0.08, 0.20, 0.30, 0.45, 0.60, 0.75, 0.90, 1.0]
S = 224
sheet = np.zeros((S * 2, S * 4, 3))
gy2, gx2 = np.mgrid[0:S, 0:S]
uv2 = np.stack([(gx2 + 0.5) / S, 1 - (gy2 + 0.5) / S], -1)
for k, f in enumerate(fades):
    r, c = divmod(k, 4)
    sheet[r * S:(r + 1) * S, c * S:(c + 1) * S] = render(uv2, 0, 0.25, f, t, overworld_bg(uv2))
Image.fromarray((sheet * 255).astype(np.uint8)).save(f"{OUT}/rift_ignition_sheet.png")
print("previews written to", OUT)
