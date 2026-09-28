#!/usr/bin/env python3
"""Preview of the 0.9 Java lava-lamp sky (client/SiftSky.java), same maths ported to numpy.
Writes art/sky/lava_lamp_stages.png: 4 stages (day, noon, evening, night), each a 360x90 degree
equirectangular strip from 20 degrees below the horizon to the zenith, plus 3 time steps each."""
import math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
r = random.Random(0x5117)  # note: differs from java.util.Random; the pattern differs, the look matches
p = list(range(256)); r.shuffle(p); PERM = np.array(p + p)

def rgb(c): return np.array([(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255])
HORIZON = [rgb(0x7FD3CF), rgb(0x8CF2C4), rgb(0xC86A92), rgb(0xD99A3C)]
ZENITH = [rgb(0x9FE6E0), rgb(0x5CF5B4), rgb(0xA8457E), rgb(0xE8A838)]
BLOBS = [[rgb(0xC8F7F0), rgb(0x5CC4C8), rgb(0xE6FFFB), rgb(0x86D9E6)],
         [rgb(0x2EFFA8), rgb(0xF4FFF9), rgb(0x9DFFD8), rgb(0x16D99A)],
         [rgb(0xE040A8), rgb(0xD993A8), rgb(0x9E2B45), rgb(0xF07AB8)],
         [rgb(0xFFC23A), rgb(0xF59A1E), rgb(0xFFDA7A), rgb(0xD9782A)]]
PILLAR = rgb(0xB8323F)

def fade(t): return t * t * t * (t * (t * 6 - 15) + 10)
def grad(h, x, y, z):
    g = h & 15
    u = np.where(g < 8, x, y)
    v = np.where(g < 4, y, np.where((g == 12) | (g == 14), x, z))
    return np.where(g & 1 == 0, u, -u) + np.where(g & 2 == 0, v, -v)
def noise(x, y, z):
    x, y, z = [np.asarray(a, dtype=float) for a in (x, y, z)]
    X, Y, Z = [np.floor(a).astype(int) & 255 for a in (x, y, z)]
    x, y, z = x - np.floor(x), y - np.floor(y), z - np.floor(z)
    u, v, w = fade(x), fade(y), fade(z)
    A = PERM[X] + Y; AA = PERM[A] + Z; AB = PERM[A + 1] + Z; B = PERM[X + 1] + Y; BA = PERM[B] + Z; BB = PERM[B + 1] + Z
    L = lambda a, b, t: a + (b - a) * t
    x1 = L(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u)
    x2 = L(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u)
    y1 = L(x1, x2, v)
    x1 = L(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u)
    x2 = L(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u)
    return L(y1, L(x1, x2, v), w)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def blob(k, x, y, z, t):
    s, d = 1.35, t * (0.018 + 0.006 * k)
    wx = noise(x * .8 + 11 * k, y * .8 + d, z * .8) * .6
    wy = noise(x * .8, y * .8 + 23 * k, z * .8 - d) * .6
    return noise((x + wx) * s + 37 * k + d, (y + wy) * s * 1.2 - d * .7, z * s + d * .5) + .45 * noise(x * s * 2.1 - d, y * s * 2.1 + 51 * k, z * s * 2.1 + d)

def sky(stage, t, W=360, H=110):
    az = np.linspace(0, 2 * math.pi, W)[None, :]
    el = np.radians(np.linspace(90, -20, H))[:, None]
    x, y, z = np.cos(el) * np.cos(az), np.sin(el) * np.ones_like(az), np.cos(el) * np.sin(az)
    up = np.maximum(0, y)[..., None]
    c = HORIZON[stage] + (ZENITH[stage] - HORIZON[stage]) * smooth(.05, .75, up)
    for k in range(4):
        w = (smooth(-.02, .55, blob(k, x, y, z, t)) * .9)[..., None]
        c = c + (BLOBS[stage][k] - c) * w
    if stage == 1:
        c = c + (np.array([.96, 1, .97]) - c) * (smooth(.55, 1, up) * .35)
    if stage == 3:
        a = np.arctan2(z, x)
        col = noise(np.cos(a) * 3.2 + t * .01, np.sin(a) * 3.2, t * .02 + 0 * a) + .35 * noise(np.cos(a) * 7, np.sin(a) * 7 + t * .015, y * 1.5)
        e = (smooth(.02, .6, col) * (1 - smooth(.25, .95, np.maximum(0, y))) * smooth(-.1, .12, y))[..., None]
        c = c + (PILLAR - c) * e * .8
    haze = (1 - smooth(-.02, .2, y))[..., None]
    c = c + (HORIZON[stage] - c) * haze
    return Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8))

names = ["DAY  pale cyan-teal", "NOON  neon mint + pearl", "EVENING  magenta / rose / crimson", "NIGHT  amber-gold + crimson pillars"]
out = Image.new("RGB", (3 * 360 + 40, 4 * 130 + 10), (20, 20, 24))
d = ImageDraw.Draw(out)
for s in range(4):
    for i, t in enumerate((0, 60, 120)):
        out.paste(sky(s, t), (10 + i * 370, 10 + s * 130 + 16))
    d.text((12, 10 + s * 130), names[s] + "   (t = 0 s, 60 s, 120 s)", fill=(255, 255, 255))
(ROOT / "art/sky").mkdir(parents=True, exist_ok=True)
out.save(ROOT / "art/sky/lava_lamp_stages.png")
print("wrote art/sky/lava_lamp_stages.png")
