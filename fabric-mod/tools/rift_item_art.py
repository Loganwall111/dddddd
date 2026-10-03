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
    path.parent.mkdir(parents=True, exist_ok=True)
    h = len(pixels)
    w = len(pixels[0])
    raw = b"".join(b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in pixels)
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def blank(w: int = W, h: int = H) -> list[list[tuple[int, int, int, int]]]:
    return [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]


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
    """An 8x8 BLUE BLOCK in the block x 4..11, y 0..7.

    The model maps this region onto every face of a floating cube, so it is drawn like a block face:
    a lit top-left edge, a shaded bottom-right edge and a bright core, which reads as a solid glowing
    cube from any angle (the user: "a 3D staff with a blue block floating on top").
    """
    for y in range(0, 8):
        for x in range(4, 12):
            lx, ly = x - 4, y
            if lx == 0 or ly == 0:                       # lit edges
                px[y][x] = glow
            elif lx == 7 or ly == 7:                     # shaded edges
                px[y][x] = edge
            elif lx in (1, 6) or ly in (1, 6):           # bevel
                px[y][x] = mid
            else:                                        # the block's glowing heart
                px[y][x] = core
    for y, x in ((3, 7), (4, 7), (3, 8), (4, 8)):
        px[y][x] = (255, 255, 255, 255)                   # white spark on the face


def staff(path: pathlib.Path, core, mid, edge, glow) -> None:
    px = blank()
    draw_shaft(px)
    draw_crystal(px, core, mid, edge, glow)
    write_png(path, px)


if __name__ == "__main__":
    # Both staffs carry a blue floating block: violet-blue for the rift staff, electric blue for the
    # blue one; the shaft art is shared.
    staff(TEX / "rift_staff.png", (150, 190, 255, 255), (96, 132, 255, 255), (22, 34, 84, 255), (215, 232, 255, 255))
    staff(TEX / "rift_staff_blue.png", (168, 236, 255, 255), (52, 186, 255, 255), (10, 52, 96, 255), (226, 250, 255, 255))
    print("wrote rift_staff.png and rift_staff_blue.png")

# ---------------------------------------------------------------------------------------------------
# 0.34 - the WORN sheet. 26.3 renders worn equipment from assets/<ns>/equipment/<id>.json, whose
# "humanoid" layer samples textures/entity/equipment/humanoid/<texture>.png in the vanilla 64x32
# humanoid layout: head (0,0), body (16,16), right arm (40,16), right leg (0,16) - and the LEFT arm is
# mirrored from the right arm's region. So painting only those 16x16 arm cells, and nothing else, puts
# the gauntlet on both arms and leaves the body, head and legs bare.
# ---------------------------------------------------------------------------------------------------
ARM_U, ARM_V = 40, 16          # right arm region; left arm mirrors it
SIDE_V, CAP_V = ARM_V + 12, ARM_V + 12   # v 16..28 = the four sides, v 28..32 = the two caps


def gauntlet_sheet(path: pathlib.Path, metal, trim, gem, dark) -> None:
    px = blank(64, 32)
    # The forearm shell: the lower eight rows of the arm's four side faces.
    for v in range(ARM_V + 4, ARM_V + 12):
        for u in range(ARM_U, ARM_U + 16):
            px[v][u] = metal
    # Gold rings at the wrist and the elbow end of the gauntlet.
    for v in (ARM_V + 4, ARM_V + 5, ARM_V + 10, ARM_V + 11):
        for u in range(ARM_U, ARM_U + 16):
            px[v][u] = trim
    # The glowing rift gem on the two outward faces (first and third face of the strip).
    for u in range(ARM_U + 1, ARM_U + 3):
        for v in range(ARM_V + 6, ARM_V + 10):
            px[v][u] = gem
    for u in range(ARM_U + 9, ARM_U + 11):
        for v in range(ARM_V + 6, ARM_V + 10):
            px[v][u] = gem
    # The hand end: the cap cells at v 28..32 (bottom cap u 44..48, top cap u 48..52).
    for v in range(CAP_V, CAP_V + 4):
        for u in range(ARM_U + 4, ARM_U + 12):
            px[v][u] = dark
    write_png(path, px)


if __name__ == "__main__":
    gauntlet_sheet(TEX.parent / "entity/equipment/humanoid/rift_gauntlet.png",
                   (58, 66, 84, 255), (214, 176, 96, 255), (120, 206, 255, 255), (40, 46, 60, 255))
    gauntlet_sheet(TEX.parent / "entity/equipment/humanoid/red_rift_gauntlet.png",
                   (74, 44, 44, 255), (214, 176, 96, 255), (255, 116, 96, 255), (52, 28, 30, 255))
    print("wrote the worn-arm gauntlet sheets")
