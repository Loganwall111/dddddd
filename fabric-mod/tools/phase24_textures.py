#!/usr/bin/env python3
"""0.24.0-alpha trailer-accuracy texture pass (pure Python stdlib, deterministic).

Updates block, fluid, and portal textures in assets/entersift/textures/block/ to match the
Minecraft Dungeons II / Minecraft Live 2026 trailer screenshots:
  * ichor_still / ichor_flow: pastel iridescent pink, peach-coral, cyan-aqua, and mint-white
    swirling marble fluid (Images 13, 39, 43, 44).
  * sinter / pale_crust: pale mint-green & white wavy fingerprint-patterned stone tiles bordering
    the Ichor pools (Images 13, 39, 43, 44).
  * rose_spire / spire_bricks / crag_rock / crag_band: rich salmon-terracotta / coral-red striated
    canyon rock (Images 9, 12, 35, 36).
  * singer_moss / teal_path: vibrant mint-turquoise cliff-top grass (Images 9, 12, 35, 36).
  * blue_turf_top / blue_turf_side: vivid cerulean-cyan stepped plateau turf (Images 37, 38, 40).
  * saltstone / reef_stone / salt: olive-chartreuse stone arches & golden-ochre soil (Images 35, 37, 38).
  * pink_grass / sift_bloom / glow_tuft / sift_grass / sift_coral_red / sift_coral_yellow:
    bubblegum-pink reeds, chartreuse flower stalks, mint tufts, and red/yellow meadow grass.
  * pale_canopy / soul_canopy: glowing mint-white and pastel-pink/lavender canopy leaves.
  * sift_portal / sift_portal_b / sift_portal_base / threshold: layered 3D cyan/teal Tetris-pixel
    mosaic with recessed dark-teal sockets and bright white stepped core (Images 6, 7, 14, 15, 29, 34).
  * sonorous_deepslate / soul_lantern_stone: crenellated cyan-inlaid portal frame and carved cyan
    soul lantern block (Images 5, 6, 11, 20, 21, 29, 34).
"""
from __future__ import annotations
import math, random, struct, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / "src/main/resources/assets/entersift/textures/block"


def save_png(path: Path, w: int, h: int, rows: list[list[tuple[int, int, int, int]]]) -> None:
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        row = rows[y]
        for x in range(w):
            r, g, b, a = row[x]
            raw.extend((max(0, min(255, int(r))), max(0, min(255, int(g))),
                        max(0, min(255, int(b))), max(0, min(255, int(a)))))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def mix(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def pnoise(x: float, y: float, z: float = 0.0) -> float:
    """Smooth periodic value noise over [0, 1)^3."""
    return (
        math.sin(x * math.tau + 0.7 * math.cos(y * math.tau + z * math.tau))
        + 0.6 * math.sin(2.0 * x * math.tau - y * math.tau + z * math.tau)
        + 0.35 * math.cos(x * math.tau + 2.0 * y * math.tau - z * math.tau)
    ) / 1.95


def make_ichor() -> None:
    # 32x1536 (48 frames of 32x32) pastel iridescent pink / peach / cyan / mint swirling fluid
    pink = (255, 162, 208)
    peach = (255, 198, 176)
    cyan = (108, 244, 236)
    mint = (182, 255, 224)
    pearl = (244, 255, 252)

    for name, flow in (("ichor_still.png", False), ("ichor_flow.png", True)):
        w, frames = 32, 48
        h = w * frames
        rows = [[(0, 0, 0, 255) for _ in range(w)] for _ in range(h)]
        for f in range(frames):
            t = f / frames
            for y in range(w):
                for x in range(w):
                    # Flow repeats every 16px so half-sprite sampling is seamless
                    period = 16.0 if flow else 32.0
                    u = (x % period) / period
                    v = ((y + (f * 2.0 / 3.0 if flow else 0.0)) % period) / period
                    wx = u + 0.18 * pnoise(u, v, t)
                    wy = v + 0.18 * pnoise(v + 0.37, u + 0.19, t)
                    swirl = 0.5 + 0.5 * pnoise(wx * 2.0, wy * 2.0, t)
                    band = 0.5 + 0.5 * math.sin((wx * 2.0 + wy * 1.5) * math.tau + swirl * 4.2)
                    if band < 0.32:
                        col = mix(pink, peach, band / 0.32)
                    elif band < 0.68:
                        col = mix(peach, cyan, (band - 0.32) / 0.36)
                    else:
                        col = mix(cyan, mint, (band - 0.68) / 0.32)
                    crest = max(0.0, math.sin((wx * 3.0 - wy * 2.0) * math.tau + swirl * 5.0))
                    if crest > 0.76:
                        col = mix(col, pearl, (crest - 0.76) / 0.24 * 0.85)
                    rows[f * w + y][x] = (int(col[0]), int(col[1]), int(col[2]), 242)
        save_png(TEX / name, w, h, rows)


def make_wavy_mint_tiles() -> None:
    # Images 13, 39, 43, 44: pale mint-green & white wavy fingerprint-patterned stone bordering ichor
    for name, base, hi, lo in (
        ("sinter.png", (174, 238, 214), (228, 255, 244), (122, 198, 176)),
        ("pale_crust.png", (196, 246, 228), (240, 255, 248), (144, 212, 190)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            for x in range(16):
                u, v = x / 16.0, y / 16.0
                wave = math.sin((u * 2.0 + 0.35 * math.sin(v * math.tau)) * math.tau * 1.5)
                if wave > 0.45:
                    c = hi
                elif wave < -0.45:
                    c = lo
                else:
                    c = base
                # Subtle tile bevel at edges
                if x in (0, 15) or y in (0, 15):
                    c = mix(c, lo, 0.35)
                rows[y][x] = (int(c[0]), int(c[1]), int(c[2]), 255)
        save_png(TEX / name, 16, 16, rows)


def make_terracotta_and_turf() -> None:
    # Images 9, 12, 35, 36: salmon-terracotta / coral-red striated canyon stone & mint-turquoise grass
    rng = random.Random(2401)
    for name, c_base, c_hi, c_lo in (
        ("rose_spire.png", (214, 102, 96), (236, 136, 124), (178, 76, 74)),
        ("crag_rock.png", (204, 96, 92), (228, 126, 116), (168, 72, 70)),
        ("crag_band.png", (232, 146, 132), (248, 178, 162), (196, 106, 98)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            band = math.sin(y / 16.0 * math.tau * 2.0)
            for x in range(16):
                n = (rng.random() - 0.5) * 0.16
                v = band * 0.45 + n
                c = c_hi if v > 0.22 else (c_lo if v < -0.22 else c_base)
                rows[y][x] = (int(c[0]), int(c[1]), int(c[2]), 255)
        save_png(TEX / name, 16, 16, rows)

    # spire_bricks.png: salmon-terracotta stepped bricks
    rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        row_idx = y // 4
        offset = (row_idx % 2) * 4
        for x in range(16):
            mortar = (y % 4 == 0) or ((x + offset) % 8 == 0)
            c = (164, 68, 66) if mortar else ((222, 112, 104) if (x + y) % 5 == 0 else (208, 96, 90))
            rows[y][x] = (*c, 255)
    save_png(TEX / "spire_bricks.png", 16, 16, rows)

    # singer_moss.png & teal_path.png: vibrant mint-turquoise cliff-top grass
    for name, base, hi, lo in (
        ("singer_moss.png", (76, 226, 178), (124, 250, 206), (48, 188, 146)),
        ("teal_path.png", (68, 214, 176), (112, 242, 204), (44, 176, 144)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            for x in range(16):
                h = ((x * 7 + y * 13) ^ (x * 3)) % 11
                c = hi if h in (0, 1) else (lo if h in (9, 10) else base)
                rows[y][x] = (*c, 255)
        save_png(TEX / name, 16, 16, rows)

    # blue_turf_top.png & blue_turf_side.png: vivid cerulean-cyan stepped plateau turf (Images 37, 38, 40)
    rows_top = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    rows_side = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            h = ((x * 11 + y * 5) ^ (y * 3)) % 9
            ct = (92, 208, 248) if h in (0, 1) else ((44, 152, 208) if h == 8 else (62, 182, 232))
            rows_top[y][x] = (*ct, 255)
            fringe = 5 + ((x * 5) % 3)
            if y < fringe:
                rows_side[y][x] = (*ct, 255)
            elif y == fringe:
                rows_side[y][x] = (38, 134, 188, 255)
            else:
                rock = (198, 96, 92) if (x + y) % 4 else (176, 78, 76)
                rows_side[y][x] = (*rock, 255)
    save_png(TEX / "blue_turf_top.png", 16, 16, rows_top)
    save_png(TEX / "blue_turf_side.png", 16, 16, rows_side)

    # Olive-chartreuse stone arches & golden-ochre soil (Images 35, 37, 38)
    for name, base, hi, lo in (
        ("saltstone.png", (148, 168, 84), (178, 198, 108), (118, 136, 64)),
        ("reef_stone.png", (138, 160, 78), (168, 190, 102), (108, 128, 58)),
        ("salt.png", (216, 170, 78), (238, 194, 104), (186, 142, 58)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            for x in range(16):
                h = ((x * 9 + y * 7) ^ (x + y)) % 9
                c = hi if h in (0, 1) else (lo if h in (7, 8) else base)
                rows[y][x] = (*c, 255)
        save_png(TEX / name, 16, 16, rows)

    # Glowing mint-white (White Willow leaves) and pastel-pink/lavender blossom canopy leaves
    for name, base, hi, lo in (
        ("pale_canopy.png", (236, 252, 248), (252, 255, 254), (188, 228, 220)),
        ("soul_canopy.png", (244, 192, 224), (255, 228, 244), (212, 148, 194)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            for x in range(16):
                h = ((x * 5 + y * 11) ^ (x * y)) % 7
                c = hi if h in (0, 1) else (lo if h == 6 else base)
                rows[y][x] = (*c, 255)
        save_png(TEX / name, 16, 16, rows)

    # Minecraft LIVE 2026 Vanilla Sift Reveal blocks (https://minecraft.wiki/w/The_Sift#Blocks):
    # - sift_earth.png: "Orange healthy sculk — a dark orange sculk block that generates below sculk grass blocks"
    # - pink_turf_top.png / pink_turf_side.png / rose_path.png: "Orange/salmon & baby-pink sculk grass block"
    # - crag_moss.png / valley_turf_top.png: "Green healthy sculk — dark grayish green sculk with a turquoise tint"
    # - soulwood.png: "White Willow log — a gray tree trunk block comparable to pale oak log"
    # - carapace.png: "The Carapace — dark-blue stone walls"
    for name, base, hi, lo in (
        ("sift_earth.png", (196, 98, 68), (224, 126, 88), (156, 72, 50)),
        ("pink_turf_top.png", (238, 142, 136), (252, 178, 172), (206, 112, 108)),
        ("rose_path.png", (244, 164, 162), (254, 196, 194), (214, 128, 126)),
        ("crag_moss.png", (58, 112, 108), (84, 148, 142), (38, 82, 80)),
        ("valley_turf_top.png", (64, 138, 128), (96, 176, 164), (44, 102, 96)),
        ("carapace.png", (46, 78, 126), (68, 106, 162), (32, 56, 94)),
    ):
        rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
        for y in range(16):
            for x in range(16):
                # Sculk-like organic cell pattern
                h = ((x * 7 + y * 13) ^ ((x // 2) * 5 + (y // 2) * 11)) % 11
                c = hi if h in (0, 1) else (lo if h in (9, 10) else base)
                rows[y][x] = (*c, 255)
        save_png(TEX / name, 16, 16, rows)

    # pink_turf_side.png: salmon/baby-pink sculk grass fringe over dark-orange healthy sculk dirt
    rows_pside = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            fringe = 5 + ((x * 7) % 3)
            if y < fringe:
                c = (246, 158, 152) if (x + y) % 3 else (228, 132, 126)
            elif y == fringe:
                c = (198, 104, 98)
            else:
                c = (196, 98, 68) if (x * 3 + y) % 4 else (164, 78, 54)
            rows_pside[y][x] = (*c, 255)
    save_png(TEX / "pink_turf_side.png", 16, 16, rows_pside)

    # soulwood.png: White Willow log (dark weathered grey bark with vertical ridges)
    rows_wood = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            ridge = (x % 4 == 0) or ((x + (y // 4)) % 5 == 0)
            c = (74, 80, 88) if ridge else ((108, 114, 122) if (x + y) % 3 == 0 else (92, 98, 106))
            rows_wood[y][x] = (*c, 255)
    save_png(TEX / "soulwood.png", 16, 16, rows_wood)


def make_foliage() -> None:
    # Cross-plant sprites with transparent backgrounds: pink_grass, sift_bloom, glow_tuft, sift_grass,
    # sift_coral_red, sift_coral_yellow (Images 35-40)
    def plant_sprite(stalk_cols, tip_col=None, tall=True):
        rows = [[(0, 0, 0, 0) for _ in range(16)] for _ in range(16)]
        cols_x = [2, 4, 6, 8, 9, 11, 13]
        for idx, cx in enumerate(cols_x):
            top_y = (2 + (idx * 3) % 4) if tall else (5 + (idx * 2) % 4)
            for y in range(top_y, 16):
                sway = 1 if (y < 8 and idx % 2 == 0) else (-1 if (y < 7 and idx % 3 == 0) else 0)
                px = max(1, min(14, cx + sway))
                t = (y - top_y) / max(1, 15 - top_y)
                c = stalk_cols[0] if t < 0.35 else (stalk_cols[1] if t < 0.75 else stalk_cols[2])
                if tip_col and y <= top_y + 1:
                    c = tip_col
                rows[y][px] = (*c, 255)
                if y > top_y + 2 and idx % 2 == 1 and px + 1 < 15:
                    rows[y][px + 1] = (*stalk_cols[1], 255)
        return rows

    # Bubblegum-pink/magenta reeds (Images 37, 38, 40)
    save_png(TEX / "pink_grass.png", 16, 16,
             plant_sprite([(255, 136, 204), (242, 88, 172), (198, 52, 134)], tip_col=(255, 196, 232)))
    # Chartreuse-yellow & pink flower stalks (Images 37, 38)
    save_png(TEX / "sift_bloom.png", 16, 16,
             plant_sprite([(186, 238, 78), (144, 204, 54), (98, 162, 42)], tip_col=(255, 238, 96)))
    # Glowing mint-aqua grass tufts (Images 9, 12, 36)
    save_png(TEX / "glow_tuft.png", 16, 16,
             plant_sprite([(156, 255, 224), (84, 236, 192), (48, 192, 154)], tip_col=(224, 255, 244), tall=False))
    # Vibrant turquoise-mint meadow grass
    save_png(TEX / "sift_grass.png", 16, 16,
             plant_sprite([(104, 244, 198), (64, 214, 168), (38, 172, 134)], tip_col=(176, 255, 228)))
    # Crimson-red and golden-yellow meadow reeds around olive stone arches (Image 35)
    save_png(TEX / "sift_coral_red.png", 16, 16,
             plant_sprite([(248, 86, 78), (218, 54, 52), (172, 36, 38)], tip_col=(255, 138, 118)))
    save_png(TEX / "sift_coral_yellow.png", 16, 16,
             plant_sprite([(255, 224, 78), (236, 188, 52), (196, 146, 36)], tip_col=(255, 246, 148)))


def make_portal_and_ancient_blocks() -> None:
    # Layered 3D Cyan/Teal Tetris-pixel mosaic portal (Images 6, 7, 14, 15, 29, 34)
    deep = (8, 54, 72)
    mid = (24, 158, 194)
    bright = (68, 246, 232)
    white = (232, 255, 254)

    for name in ("sift_portal.png", "sift_portal_b.png", "sift_portal_base.png"):
        w, frames = 16, 16
        h = w * frames
        rows = [[(0, 0, 0, 255) for _ in range(w)] for _ in range(h)]
        for f in range(frames):
            for y in range(w):
                for x in range(w):
                    # 2x2 pixel-mosaic cells with animated depth pulse
                    cx, cy = x // 2, y // 2
                    hval = ((cx * 7 + cy * 13 + f) ^ (cx * 3 - cy * 5)) % 16
                    dist_center = abs(x - 7.5) / 7.5
                    if dist_center < 0.28 and hval > 5:
                        c = white
                    elif hval < 4:
                        c = deep
                    elif hval < 11:
                        c = mid
                    else:
                        c = bright
                    # Crisp 3D bevel inside each 2x2 mosaic block
                    if (x % 2 == 0 and y % 2 == 0) and c != deep:
                        c = mix(c, white, 0.25)
                    elif (x % 2 == 1 and y % 2 == 1) and c != white:
                        c = mix(c, deep, 0.28)
                    rows[f * w + y][x] = (int(c[0]), int(c[1]), int(c[2]), 248)
        save_png(TEX / name, w, h, rows)

    # threshold.png (32x1024, 32 frames of 32x32): cyan Tetris-mosaic portal curtain
    w, frames = 32, 32
    h = w * frames
    rows = [[(0, 0, 0, 255) for _ in range(w)] for _ in range(h)]
    for f in range(frames):
        for y in range(w):
            for x in range(w):
                cx, cy = x // 2, y // 2
                hval = ((cx * 11 + cy * 7 + f) ^ (cx * 5 + cy * 3)) % 16
                dc = math.hypot((x - 15.5) / 10.0, (y - 15.5) / 14.0)
                if dc < 0.42 and hval > 4:
                    c = white
                elif hval < 4:
                    c = deep
                elif hval < 11:
                    c = mid
                else:
                    c = bright
                rows[f * w + y][x] = (int(c[0]), int(c[1]), int(c[2]), 252)
    save_png(TEX / "threshold.png", w, h, rows)

    # sonorous_deepslate.png (16x16): dark-teal deepslate frame with glowing cyan crenellated inlay (Images 5, 6, 11, 29)
    rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            border = x in (0, 15) or y in (0, 15)
            crenel = (x in (2, 3, 6, 7, 10, 11, 13) and y in (2, 13)) or (y in (2, 3, 6, 7, 10, 11, 13) and x in (2, 13))
            if crenel:
                c = (72, 248, 232)
            elif border:
                c = (20, 34, 46)
            else:
                c = (34, 54, 68) if (x + y) % 3 else (44, 68, 84)
            rows[y][x] = (*c, 255)
    save_png(TEX / "sonorous_deepslate.png", 16, 16, rows)

    # soul_lantern_stone.png (16x16): carved stone lantern with glowing cyan soul-flame window (Images 20, 21, 34, 42)
    rows = [[(0, 0, 0, 255) for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            in_window = 4 <= x <= 11 and 4 <= y <= 11
            in_core = 6 <= x <= 9 and 5 <= y <= 10
            if in_core:
                c = (196, 255, 248) if (x in (7, 8) and 6 <= y <= 9) else (64, 244, 232)
            elif in_window:
                c = (28, 168, 196)
            elif x in (0, 15) or y in (0, 1, 14, 15):
                c = (68, 82, 96)
            else:
                c = (92, 108, 122) if (x + y) % 2 == 0 else (78, 94, 108)
            rows[y][x] = (*c, 255)
    save_png(TEX / "soul_lantern_stone.png", 16, 16, rows)


def main() -> None:
    make_ichor()
    make_wavy_mint_tiles()
    make_terracotta_and_turf()
    make_foliage()
    make_portal_and_ancient_blocks()
    print("0.24 trailer-accuracy textures generated in", TEX)


if __name__ == "__main__":
    main()
