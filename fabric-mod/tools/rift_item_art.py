#!/usr/bin/env python3
"""Rift staff / gauntlet item artwork (0.32).

The 0.31 staff textures were byte-identical to the gauntlet textures, which is exactly what the
user reported ("the rift staffs have the same textures as the gauntlet"). This script draws the
staff art: a 16x16 sheet whose left column is the shaft (for the 3D model's side UVs) and whose
top-right 8x8 block is the floating crystal (for the cube face UVs).

Pure standard library; deterministic; safe to re-run.
"""
from __future__ import annotations

import pathlib
import struct
import zlib

W = H = 16
TEX = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/assets/entersift/textures/item"


def write_png(path: pathlib.Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    raw = b"".join(b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in pixels)
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def blank() -> list[list[tuple[int, int, int, int]]]:
    return [[(0, 0, 0, 0) for _ in range(W)] for _ in range(H)]


SHAFT_DARK = (43, 47, 58, 255)
SHAFT_MID = (108, 114, 131, 255)
SHAFT_LIGHT = (170, 176, 196, 255)
BAND = (214, 176, 96, 255)  # gold bindings, matching the gauntlet's trim


def draw_shaft(px) -> None:
    """A 2-pixel column at x 0..1 spanning the full height: dark edge, lit inner edge, gold bands."""
    for y in range(H):
        px[y][0] = SHAFT_DARK
        if y in (3, 4, 10, 11):
            px[y][1] = BAND
        else:
            px[y][1] = SHAFT_MID if y % 4 else SHAFT_LIGHT


def draw_crystal(px, core, mid, edge, glow) -> None:
    """An 8x8 bevelled gem in the block x 4..11, y 0..7."""
    cx, cy = 7.5, 3.5
    for y in range(0, 8):
        for x in range(4, 12):
            dx, dy = abs(x - cx), abs(y - cy)
            d = dx + dy
            if d > 4.6:
                px[y][x] = (0, 0, 0, 0)
            elif d > 3.7:
                px[y][x] = edge
            elif d > 1.2:
                px[y][x] = mid
            else:
                px[y][x] = core
    px[3][7] = glow
    px[4][6] = glow
    px[2][7] = (255, 255, 255, 255)


def staff(path: pathlib.Path, core, mid, edge, glow) -> None:
    px = blank()
    draw_shaft(px)
    draw_crystal(px, core, mid, edge, glow)
    write_png(path, px)


if __name__ == "__main__":
    # Rift staff: violet-blue crystal. Blue staff: brighter cyan crystal, same shaft.
    staff(TEX / "rift_staff.png", (206, 222, 255, 255), (106, 140, 255, 255), (32, 48, 104, 255), (156, 200, 255, 255))
    staff(TEX / "rift_staff_blue.png", (214, 250, 255, 255), (47, 212, 255, 255), (16, 70, 104, 255), (150, 240, 255, 255))
    print("wrote rift_staff.png and rift_staff_blue.png")
