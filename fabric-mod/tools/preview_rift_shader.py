#!/usr/bin/env python3
"""Rasterise the shader-plane rift (the same silhouette the GLSL draws) so the look can be checked
without a Minecraft client. Not part of the mod runtime."""
import math
import struct
import zlib
from pathlib import Path

W, H = 640, 512
U0, U1, V0, V1 = -4.5, 15.5, -4.0, 12.0


def sd_box(p, b):
    dx = abs(p[0]) - b[0]
    dy = abs(p[1]) - b[1]
    out = math.hypot(max(dx, 0.0), max(dy, 0.0))
    return out + min(max(dx, dy), 0.0)


def sd_rect(p, a, b):
    c = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
    h = ((b[0] - a[0]) * 0.5, (b[1] - a[1]) * 0.5)
    return sd_box((p[0] - c[0], p[1] - c[1]), h)


def cross_sdf(p):
    rects = (
        (5, 6, 6, 8),
        (3, 4, 8, 6),
        (2, 2, 10, 4),
        (3, 0, 8, 2),
        (1, 0, 3, 2),
        (0, 2, 2, 4),
    )
    d = 8.0
    for r in rects:
        d = min(d, sd_rect(p, (r[0], r[1]), (r[2], r[3])))
    return d


def frame(p, c, hx, hy, width):
    d = abs(sd_box((p[0] - c[0], p[1] - c[1]), (hx, hy)))
    return max(0.0, 1.0 - smooth(width * 0.35, width, d))


def smooth(e0, e1, x):
    if e0 == e1:
        return 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def shade(u, v, progress, night, t):
    cell = (U0 + (U1 - U0) * u, V0 + (V1 - V0) * v)
    center = (5.5, 3.6)
    wave = (
        0.20 * math.sin(cell[1] * 1.9 + t * 1.1) + 0.07 * math.sin(cell[1] * 3.7 - t * 1.7),
        0.06 * math.sin(cell[0] * 1.4 + t * 0.7),
    )
    # Vertical borders take the full wave; horizontal runs are damped, same idea as borderWave.
    side = abs(math.cos(math.atan2(cell[1] - center[1], cell[0] - center[0])))
    waved = (cell[0] + wave[0] * (0.45 + 0.55 * side), cell[1] + wave[1])
    sdf = cross_sdf(cell)
    sdf_w = cross_sdf(waved)
    q = (cell[0] - center[0], cell[1] - center[1])
    tier = min(1.0, math.hypot(q[0] / 6.5, q[1] / 5.0))
    appear = smooth(0.58 + tier * 0.38, 0.66 + tier * 0.38, progress)
    interior = (1.0 - smooth(-0.02, 0.10, sdf)) * appear

    # Symmetrical shader outline: equal stroke inside and outside the contour.
    stroke = (1.0 - smooth(0.05, 0.16, abs(sdf_w))) * appear
    inner = (1.0 - smooth(0.015, 0.07, abs(sdf + 0.26))) * appear
    halo = (1.0 - smooth(0.10, 0.72, max(sdf_w, 0.0))) * appear

    # Detached hollow frames — borders, not cubes. Faint in the day, stronger at night.
    frags = (
        ((11.15, 5.35), 0.55, 0.55),
        ((-0.55, 3.15), 0.95, 0.38),
        ((1.15, 6.45), 0.42, 0.42),
        ((10.7, 1.15), 0.70, 0.42),
        ((11.55, 0.35), 0.42, 0.62),
        ((2.4, 7.15), 0.48, 0.32),
        ((8.6, -0.85), 0.40, 0.40),
        ((-1.3, 1.1), 0.36, 0.52),
    )
    frag = 0.0
    for i, (c, hx, hy) in enumerate(frags):
        drift = (
            0.12 * math.sin(t * 0.17 + i * 1.7),
            0.10 * math.cos(t * 0.13 + i * 0.9),
        )
        frag = max(frag, frame(cell, (c[0] + drift[0], c[1] + drift[1]), hx, hy, 0.09))
    frag *= appear * (0.78 if night else 0.28)

    # Birth: localised white disc + three ripple rings. Stops growing once progress hits 1.
    dist = math.hypot(q[0], q[1])
    disc_r = 0.15 + 5.2 * smooth(0.0, 0.30, min(progress, 0.30))
    disc = (1.0 - smooth(disc_r - 0.55, disc_r, dist)) * (1.0 - smooth(0.18, 0.38, progress))
    rings = 0.0
    if progress < 0.42:
        for i in range(3):
            radius = (0.4 + progress * 7.5) * (0.46 + i * 0.24)
            rings += (1.0 - smooth(0.02, 0.11, abs(dist - radius))) * (0.55 - i * 0.12)
        rings *= 1.0 - smooth(0.22, 0.42, progress)

    # Tilted incubation seed.
    ang = 0.32
    rx = math.cos(ang) * q[0] + math.sin(ang) * q[1]
    ry = -math.sin(ang) * q[0] + math.cos(ang) * q[1]
    seed_d = sd_box((rx, ry), (1.85, 0.52))
    seed_life = smooth(0.20, 0.32, progress) * (1.0 - smooth(0.52, 0.68, progress))
    pulse = 0.55 + 0.45 * math.sin(t * 9.0)
    seed = (1.0 - smooth(-0.02, 0.08, seed_d)) * seed_life * (0.45 + 0.55 * pulse)
    seed_rim = (1.0 - smooth(0.02, 0.10, abs(seed_d))) * seed_life

    # Sparse lightning, only while the rift is opening.
    bolt = 0.0
    if progress < 0.62:
        for i in range(5):
            ang_b = (i * 1.27 + 0.4) % 6.28318
            direc = (math.cos(ang_b), math.sin(ang_b))
            nrm = (-direc[1], direc[0])
            a = center
            reach = 1.3 + (i % 3) * 0.7
            for s in range(6):
                jitter = (math.sin(i * 12.9 + s * 4.1 + t) ) * 0.55
                b = (a[0] + direc[0] * reach, a[1] + direc[1] * reach + nrm[1] * jitter + nrm[0] * jitter)
                # point-segment distance
                pax, pay = cell[0] - a[0], cell[1] - a[1]
                bax, bay = b[0] - a[0], b[1] - a[1]
                den = bax * bax + bay * bay + 1e-4
                h = max(0.0, min(1.0, (pax * bax + pay * bay) / den))
                bolt = max(bolt, 1.0 - smooth(0.02, 0.09, math.hypot(pax - bax * h, pay - bay * h)))
                a = b
        bolt *= 1.0 - smooth(0.40, 0.62, progress)

    # Destination: warm blurred place, not a flat colour. Frost sits over it.
    # Trailer fill: gold low, pink high. No white cap. Night leans amber, day leans coral.
    up = max(0.0, min(1.0, cell[1] / 8.0))
    right = max(0.0, min(1.0, cell[0] / 11.0))
    gold, pink = (1.0, 0.74, 0.34), (1.0, 0.50, 0.64)
    k = max(0.0, min(1.0, up * 0.62 + right * 0.18))
    dest = tuple(gold[i] * (1 - k) + pink[i] * k for i in range(3))
    if night:
        amber = (0.86, 0.45, 0.22)
        dest = tuple(amber[i] * 0.58 + dest[i] * 0.42 for i in range(3))
    else:
        coral = (1.0, 0.42, 0.55)
        dest = tuple(dest[i] * 0.80 + coral[i] * 0.20 for i in range(3))
    dest = tuple(min(0.78, c) for c in dest)

    # Wavy aurora outside the opening — the shader structure, kept secondary.
    aura = math.exp(-max(sdf_w, 0.0) * 0.42) * (1.0 - interior) * appear
    face = math.sin(cell[1] * 0.55 + t * 0.02) * math.cos(cell[0] * 0.38 - t * 0.01)
    hollow = smooth(0.55, 0.82, face)
    aura *= 1.0 - 0.72 * hollow
    aura_col = (0.45, 0.95, 0.85) if not night else (0.85, 0.35, 0.70)
    aura *= 0.34 if night else 0.20

    # Soft shafts, many and dim.
    rays = 0.0
    ang = math.atan2(q[1], q[0])
    for i in range(10):
        a = ang + i * 0.628 + t * 0.03
        band = math.exp(-(math.sin(a * 2.0 + i) ** 2) * 14.0)
        rays += band * math.exp(-dist * 0.22)
    rays *= (0.04 if night else 0.012) * (1.0 - interior * 0.9) * appear

    col = [0.0, 0.0, 0.0]
    alpha = 0.0
    # interior glass
    if interior > 0.01:
        col = [dest[k] * interior for k in range(3)]
        alpha = interior * 0.65
    # aurora behind / around
    col = [col[k] + aura_col[k] * aura for k in range(3)]
    alpha = max(alpha, aura * 0.85)
    # halo + symmetrical stroke + inner line
    halo_col = (1.0, 0.62, 0.48) if not night else (1.0, 0.45, 0.28)
    col = [col[k] + halo_col[k] * halo * 0.55 for k in range(3)]
    alpha = max(alpha, halo * 0.45)
    col = [min(1.8, col[k] + stroke) for k in range(3)]
    alpha = max(alpha, stroke)
    col = [min(1.8, col[k] + inner * 0.2) for k in range(3)]
    alpha = max(alpha, inner * 0.2)
    # fragments
    col = [min(1.8, col[k] + frag) for k in range(3)]
    alpha = max(alpha, frag)
    # rays
    ray_col = (0.75, 0.95, 1.0) if not night else (1.0, 0.7, 0.85)
    col = [col[k] + ray_col[k] * rays for k in range(3)]
    alpha = max(alpha, rays * 3.0)
    # birth overlays
    col = [col[k] + disc + rings * 0.8 + seed + seed_rim + bolt for k in range(3)]
    alpha = max(alpha, disc, rings, seed, seed_rim, bolt)
    # white ignition drains into colour
    white = 1.0 - smooth(0.30, 0.62, progress)
    if progress < 0.62:
        col = [col[k] * (1 - white) + min(1.5, col[k] + 0.4) * white for k in range(3)]
    return col, max(0.0, min(1.0, alpha))


def write_png(path, pixels):
    raw = b"".join(b"\x00" + bytes(c for pix in row for c in pix) for row in pixels)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def panel(progress, night, t, ox, oy, pw, ph, canvas):
    for y in range(ph):
        v = 1.0 - (y + 0.5) / ph
        for x in range(pw):
            u = (x + 0.5) / pw
            col, a = shade(u, v, progress, night, t)
            # composite over a dim world so the opening reads as glass, not a sticker
            bg = (28, 36, 42) if night else (92, 118, 86)
            r = int(max(0, min(255, (col[0] * a + bg[0] / 255 * (1 - a)) * 255)))
            g = int(max(0, min(255, (col[1] * a + bg[1] / 255 * (1 - a)) * 255)))
            b = int(max(0, min(255, (col[2] * a + bg[2] / 255 * (1 - a)) * 255)))
            canvas[oy + y][ox + x] = (r, g, b)


def main():
    # Stable day (left) and stable night (right). Small on purpose — this is a silhouette check.
    global W, H
    W, H = 480, 240
    out = Path(__file__).resolve().parents[1] / "docs" / "rift-shader-preview.png"
    canvas = [[(18, 22, 20) for _ in range(W)] for _ in range(H)]
    panel(1.0, False, 4.0, 0, 0, 240, 240, canvas)
    panel(1.0, True, 5.5, 240, 0, 240, 240, canvas)
    write_png(out, canvas)
    print(out)


if __name__ == "__main__":
    main()
