#!/usr/bin/env python3
"""Generates every texture Beyond the Limits ships, procedurally.

No image libraries: PNGs are written straight out of zlib, so this runs anywhere Python
does and the output is byte-for-byte reproducible from the seeds below. Re-running it
regenerates the same art, which is why the repository can carry source instead of
binaries.

Layout written:
  assets/beyondthelimits/textures/block/*.png     16x16 block textures
  assets/beyondthelimits/textures/item/*.png      16x16 item icons
  assets/beyondthelimits/textures/particle/*.png  8x8 particle sprites
  assets/beyondthelimits/textures/entity/*.png    entity skins
"""
import json
import os
import random
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                    "src", "main", "resources", "assets", "beyondthelimits", "textures")

# ---------------------------------------------------------------------------------------
# png writer
# ---------------------------------------------------------------------------------------


def write_png(path, pixels, width, height):
    """pixels: list of rows, each row a list of (r, g, b, a) tuples."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r & 255, g & 255, b & 255, a & 255))
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(blob)


# ---------------------------------------------------------------------------------------
# a tiny pixel canvas
# ---------------------------------------------------------------------------------------


def norm(color):
    """Accepts (r, g, b) or (r, g, b, a) and always returns the four-component form."""
    if len(color) == 3:
        return (color[0], color[1], color[2], 255)
    return color


class Canvas:
    def __init__(self, size=16, color=(0, 0, 0, 0)):
        self.size = size
        self.px = [[color for _ in range(size)] for _ in range(size)]

    def get(self, x, y):
        return self.px[y % self.size][x % self.size]

    def set(self, x, y, color):
        if 0 <= x < self.size and 0 <= y < self.size:
            self.px[y][x] = norm(color)

    def blend(self, x, y, color, amount=1.0):
        if not (0 <= x < self.size and 0 <= y < self.size):
            return
        color = norm(color)
        r, g, b, a = self.px[y][x]
        cr, cg, cb, ca = color
        alpha = max(0.0, min(1.0, amount * (ca / 255.0)))
        self.px[y][x] = (
            int(r + (cr - r) * alpha),
            int(g + (cg - g) * alpha),
            int(b + (cb - b) * alpha),
            int(a + (ca - a) * alpha),
        )

    def fill(self, color):
        color = norm(color)
        for y in range(self.size):
            for x in range(self.size):
                self.px[y][x] = color

    def noise(self, base, amplitude, seed, hueshift=0):
        base = norm(base)
        rng = random.Random(seed)
        for y in range(self.size):
            for x in range(self.size):
                d = rng.randint(-amplitude, amplitude)
                self.px[y][x] = (clamp(base[0] + d + hueshift), clamp(base[1] + d),
                                 clamp(base[2] + d), base[3] if len(base) > 3 else 255)

    def speckle(self, color, count, seed, size=1):
        color = norm(color)
        rng = random.Random(seed)
        for _ in range(count):
            cx = rng.randrange(self.size)
            cy = rng.randrange(self.size)
            for dx in range(size):
                for dy in range(size):
                    self.set(cx + dx, cy + dy, color)

    def rect(self, x0, y0, x1, y1, color, fill=True):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if fill or x in (x0, x1) or y in (y0, y1):
                    self.set(x, y, color)

    def line(self, x0, y0, x1, y1, color, width=1):
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for step in range(steps + 1):
            x = x0 + (x1 - x0) * step / steps
            y = y0 + (y1 - y0) * step / steps
            for dx in range(width):
                for dy in range(width):
                    self.set(int(round(x)) + dx, int(round(y)) + dy, color)

    def veins(self, color, seed, count=3, width=1, branch=0.8):
        """Dark branching cracks: the mod's visual signature for anything corrupted or bleeding."""
        rng = random.Random(seed)
        for _ in range(count):
            x = rng.uniform(0, self.size)
            y = rng.uniform(0, self.size)
            for _ in range(14):
                nx = x + rng.uniform(-1.6, 1.6)
                ny = y + rng.uniform(-1.6, 1.6)
                self.line(int(x), int(y), int(nx), int(ny), color, width)
                if rng.random() > branch:
                    self.line(int(x), int(y), int(x + rng.uniform(-2.5, 2.5)),
                              int(y + rng.uniform(-2.5, 2.5)), color, 1)
                x, y = nx, ny

    def grid(self, color, step=8, width=1):
        for i in range(0, self.size + 1, step):
            self.line(0, i, self.size - 1, i, color, width)
            self.line(i, 0, i, self.size - 1, color, width)

    def bricks(self, mortar, seed, rows=4, cols=4, jitter=0):
        rng = random.Random(seed)
        height = self.size // rows
        width = self.size // cols
        for row in range(rows):
            offset = (row % 2) * width // 2
            self.line(0, row * height, self.size - 1, row * height, mortar, 1)
            for col in range(cols + 1):
                bx = (col * width + offset) % self.size
                if jitter:
                    bx += rng.randint(-jitter, jitter)
                self.line(bx, row * height, bx, (row + 1) * height - 1, mortar, 1)
        self.line(0, self.size - 1, self.size - 1, self.size - 1, mortar, 1)

    def vertical_stripes(self, color, step=4, width=1):
        for x in range(0, self.size, step):
            for w in range(width):
                for y in range(self.size):
                    self.blend(x + w, y, color, 0.5)

    def scanlines(self, color, step=3):
        for y in range(0, self.size, step):
            for x in range(self.size):
                self.blend(x, y, color, 0.55)

    def glow(self, cx, cy, radius, color):
        for y in range(self.size):
            for x in range(self.size):
                distance = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if distance < radius:
                    self.blend(x, y, color, (1.0 - distance / radius) ** 1.6)

    def edge_light(self, color, amount=0.5):
        for x in range(self.size):
            self.blend(x, 0, color, amount)
            self.blend(x, self.size - 1, color, amount * 0.4)
        for y in range(self.size):
            self.blend(0, y, color, amount * 0.6)
            self.blend(self.size - 1, y, color, amount * 0.6)

    def grayscale_holes(self, seed, threshold=0.35):
        """Punches transparent holes for cutout textures (leaves)."""
        rng = random.Random(seed)
        for y in range(self.size):
            for x in range(self.size):
                if rng.random() < threshold:
                    r, g, b, a = self.px[y][x]
                    self.px[y][x] = (r, g, b, 0)

    def save(self, path):
        write_png(path, self.px, self.size, self.size)


def clamp(value):
    return max(0, min(255, int(value)))


def rgba(hexcolor, alpha=255):
    hexcolor = hexcolor.lstrip("#")
    return (int(hexcolor[0:2], 16), int(hexcolor[2:4], 16), int(hexcolor[4:6], 16), alpha)


def shade(color, amount):
    return (clamp(color[0] + amount), clamp(color[1] + amount), clamp(color[2] + amount), color[3])


# ---------------------------------------------------------------------------------------
# block textures
# ---------------------------------------------------------------------------------------

BLOCKS = {}


def block(name):
    def wrap(fn):
        BLOCKS[name] = fn
        return fn
    return wrap


@block("corrupted_grass_top")
def _(c):
    c.noise(rgba("5A6E45"), 12, 11)
    c.veins(rgba("2B1C33", 130), 12, 3, 1)
    c.speckle(rgba("8FA06A"), 22, 13)


@block("corrupted_grass_side")
def _(c):
    c.noise(rgba("6B5237"), 10, 21)
    for x in range(16):
        depth = 3 + (x * 7 % 3)
        for y in range(depth):
            c.set(x, y, shade(rgba("556B42"), (y * 6) - 8))
    c.veins(rgba("2B1C33", 120), 22, 3, 1)
    c.speckle(rgba("43290F"), 18, 23)


@block("corrupted_soil")
def _(c):
    c.noise(rgba("4E3A2A"), 11, 31)
    c.speckle(rgba("2B1C33"), 26, 32)
    c.speckle(rgba("6E5238"), 20, 33)


@block("corrupted_stone")
def _(c):
    c.noise(rgba("565A5E"), 9, 41)
    c.veins(rgba("1A1218", 150), 42, 4, 1)
    c.speckle(rgba("3C3F42"), 20, 43)


@block("bleeding_vein")
def _(c):
    c.noise(rgba("2A1013"), 9, 51)
    c.veins(rgba("8C0F1C", 235), 52, 4, 1)
    c.veins(rgba("E0243C", 200), 53, 2, 1)
    c.glow(8, 8, 5, rgba("FF3B4E", 90))


@block("bleed_pool")
def _(c):
    # Nearly black, with the red only present as depth: this is a fluid, not a candy.
    c.noise(rgba("0C0305"), 4, 61)
    c.veins(rgba("4A0510", 170), 62, 4, 1)
    c.glow(6, 10, 5, rgba("8C0F1C", 90))
    c.glow(11, 5, 4, rgba("3D060E", 80))
    c.glow(8, 8, 7, rgba("2A0308", 70))


@block("rift_anchor")
def _(c):
    c.noise(rgba("241230"), 8, 71)
    c.veins(rgba("7A2ECC", 220), 72, 5, 1)
    c.veins(rgba("D79BFF", 210), 73, 3, 1)
    c.glow(8, 8, 7, rgba("A855F7", 130))
    c.glow(8, 8, 2.5, rgba("F3E8FF", 200))
    c.edge_light(rgba("C084FC", 160), 0.4)


@block("rift_frame")
def _(c):
    c.noise(rgba("2E2438"), 7, 81)
    c.bricks(rgba("100A16", 200), 82, 4, 4)
    c.veins(rgba("8B5CF6", 150), 83, 2, 1)
    c.speckle(rgba("4C3B63"), 16, 84)


@block("void_glass")
def _(c):
    # Stained glass: the void is what fills the panes, the frame is what makes it a block.
    c.fill(rgba("05030A", 150))
    c.grid(rgba("3B2A5A", 230), 8, 1)
    c.rect(0, 0, 15, 15, rgba("4C3B63", 235), fill=False)
    c.veins(rgba("2E1065", 140), 91, 2, 1)
    c.glow(4, 4, 3, rgba("6D28D9", 110))
    c.glow(12, 12, 3, rgba("8B5CF6", 90))


@block("sky_shard")
def _(c):
    c.fill(rgba("16243A", 120))
    c.line(3, 12, 8, 2, rgba("BFE6FF", 230), 1)
    c.line(8, 2, 12, 11, rgba("8FC8FF", 200), 1)
    c.line(3, 12, 12, 11, rgba("E8F7FF", 190), 1)
    c.glow(8, 8, 6, rgba("CFEAFF", 120))
    c.glow(5, 5, 3, rgba("FFFFFF", 140))


@block("gravity_core")
def _(c):
    c.noise(rgba("0B1B33"), 7, 101)
    c.glow(8, 8, 7, rgba("3B82F6", 200))
    c.glow(8, 8, 3, rgba("DBEAFE", 230))
    for angle in range(0, 16, 3):
        c.line(8, 8, angle, angle, rgba("93C5FD", 120), 1)


@block("memory_stone")
def _(c):
    c.noise(rgba("9AA6B2"), 8, 111)
    c.veins(rgba("6B7683", 130), 112, 3, 1)
    c.vertical_stripes(rgba("B9C6D2", 60), 3, 1)
    c.speckle(rgba("D7E2EA"), 14, 113)


@block("memory_lamp")
def _(c):
    c.noise(rgba("BFD9F2"), 6, 121)
    c.glow(8, 8, 9, rgba("EAF4FF", 220))
    c.edge_light(rgba("8FC7FF", 200), 0.5)


@block("mirror_block")
def _(c):
    c.fill(rgba("D7DEE6", 235))
    c.noise(rgba("C2CBD6"), 6, 131)
    for i in range(-16, 16, 3):
        c.line(i, 0, i + 16, 16, rgba("FFFFFF", 60), 1)
    c.line(0, 15, 15, 0, rgba("8FA3B8", 150), 1)
    c.line(0, 14, 14, 0, rgba("6E7F91", 90), 1)


@block("code_monolith")
def _(c):
    c.noise(rgba("06120A"), 6, 141)
    rng = random.Random(142)
    for y in range(1, 16, 3):
        x = rng.randrange(1, 5)
        while x < 15:
            length = rng.randint(1, 4)
            color = rgba("22C55E", rng.randint(150, 245))
            for i in range(length):
                c.set(x + i, y, color)
                c.set(x + i, y + 1, shade(color, -60))
            x += length + rng.randint(1, 3)
    c.edge_light(rgba("4ADE80", 120), 0.4)


@block("code_brick")
def _(c):
    c.noise(rgba("12201A"), 8, 151)
    c.bricks(rgba("04100A", 220), 152, 4, 4)
    c.speckle(rgba("2FA968"), 22, 153)
    c.speckle(rgba("0A3B22"), 18, 154)


@block("code_panel")
def _(c):
    c.fill(rgba("052012"))
    c.scanlines(rgba("22C55E", 130), 2)
    c.grid(rgba("16A34A", 90), 8, 1)
    c.glow(8, 8, 10, rgba("4ADE80", 90))
    c.edge_light(rgba("86EFAC", 220), 0.6)


@block("backrooms_carpet")
def _(c):
    c.noise(rgba("B7A24E"), 10, 161)
    for y in range(16):
        for x in range(16):
            if (x + y) % 2 == 0:
                c.blend(x, y, rgba("A08C3E"), 0.35)
    c.speckle(rgba("6E5C22"), 26, 162)
    c.speckle(rgba("8A7A3A"), 18, 163)


@block("backrooms_wall")
def _(c):
    # Cream wallpaper, not banana: the Backrooms' yellow is a sickly off-white in low light.
    c.noise(rgba("C7BC96"), 6, 171)
    c.vertical_stripes(rgba("A89C78", 90), 4, 1)
    rng = random.Random(172)
    for _ in range(9):
        x, y = rng.randrange(16), rng.randrange(16)
        c.glow(x, y, 2.8, rgba("8A7E5E", 130))
    c.veins(rgba("9A8E6C", 90), 173, 2, 1)
    c.edge_light(rgba("DED4B0", 80), 0.3)


@block("backrooms_ceiling")
def _(c):
    c.noise(rgba("DCD4B8"), 5, 181)
    c.grid(rgba("B4AC90", 170), 8, 1)
    c.speckle(rgba("9C9478"), 14, 182)
    rng = random.Random(183)
    for _ in range(4):
        c.glow(rng.randrange(16), rng.randrange(16), 3.0, rgba("A89E80", 110))


@block("backrooms_light")
def _(c):
    c.fill(rgba("F6F1D8"))
    c.grid(rgba("C9C39A", 180), 8, 1)
    c.glow(4, 4, 5, rgba("FFFFFF", 220))
    c.glow(12, 12, 5, rgba("FFFFFF", 200))


@block("pool_tile")
def _(c):
    c.noise(rgba("7FC7D9"), 6, 191)
    c.grid(rgba("4E93A8", 200), 4, 1)
    c.speckle(rgba("BFE9F5"), 20, 192)


@block("pool_tile_dark")
def _(c):
    c.noise(rgba("1E5F86"), 6, 201)
    c.grid(rgba("0C3A57", 210), 4, 1)
    c.speckle(rgba("4FA3C8"), 16, 202)


@block("store_shelf")
def _(c):
    c.noise(rgba("6E7378"), 7, 211)
    for x in range(1, 16, 5):
        c.line(x, 0, x, 15, rgba("4A4E52", 220), 2)
    c.line(0, 7, 15, 7, rgba("3E4246", 200), 1)
    c.speckle(rgba("8A9096"), 18, 212)


@block("warehouse_concrete")
def _(c):
    c.noise(rgba("8C8C86"), 9, 221)
    rng = random.Random(222)
    for _ in range(5):
        c.glow(rng.randrange(16), rng.randrange(16), 3.2, rgba("6E6E68", 150))
    c.veins(rgba("5E5E58", 110), 223, 2, 1)


@block("warehouse_floor")
def _(c):
    c.noise(rgba("75756F"), 7, 231)
    c.line(0, 12, 15, 12, rgba("D9C24A", 190), 1)
    c.line(0, 13, 15, 13, rgba("8A7A2E", 150), 1)
    c.speckle(rgba("5E5E58"), 24, 232)


@block("wrong_grass_top")
def _(c):
    c.noise(rgba("4F7A3A"), 12, 241)
    c.speckle(rgba("A64B4B"), 16, 242)
    c.veins(rgba("243B1C", 120), 243, 2, 1)


@block("wrong_grass_side")
def _(c):
    c.noise(rgba("6E5236"), 9, 251)
    for x in range(16):
        for y in range(2):
            c.set(x, y, shade(rgba("4F7A3A"), (y * 8) - 4))
    # Deliberately wrong: a strip of grass where a strip of dirt should be.
    for x in range(16):
        c.set(x, 9, rgba("4F7A3A"))
    c.speckle(rgba("8A3B3B"), 12, 252)


@block("impossible_grass")
def _(c):
    c.noise(rgba("101010"), 7, 261)
    c.speckle(rgba("F2F2F2"), 30, 262)
    c.veins(rgba("000000", 200), 263, 3, 1)


@block("impossible_leaves")
def _(c):
    c.noise(rgba("EFEFE8"), 10, 271)
    c.veins(rgba("1A1A1A", 170), 272, 4, 1)
    c.grayscale_holes(273, 0.28)


@block("impossible_log")
def _(c):
    c.noise(rgba("E8E4DA"), 8, 281)
    for y in range(0, 16, 2):
        c.line(0, y, 15, y + (y % 4) - 2, rgba("6E6A60", 190), 1)
    c.veins(rgba("4A463E", 170), 282, 3, 1)
    c.speckle(rgba("2A2823"), 20, 283)


@block("impossible_log_top")
def _(c):
    c.noise(rgba("DEDAD0"), 7, 291)
    for radius in range(2, 9, 2):
        for angle in range(0, 360, 6):
            import math
            x = 8 + int(radius * math.cos(math.radians(angle)))
            y = 8 + int(radius * math.sin(math.radians(angle)))
            c.set(x, y, rgba("8A867C", 170))


@block("ancient_brick")
def _(c):
    c.noise(rgba("A9A08C"), 12, 301)
    c.bricks(rgba("615948", 235), 302, 4, 4)
    c.veins(rgba("4A4236", 150), 303, 3, 1)
    c.speckle(rgba("C4BBA6"), 22, 304)
    c.speckle(rgba("7A7261"), 18, 305)


@block("ancient_pillar_side")
def _(c):
    c.noise(rgba("B4AB96"), 10, 311)
    for x in range(2, 16, 4):
        c.line(x, 0, x, 15, rgba("7E7564", 190), 1)
        c.line(x + 1, 0, x + 1, 15, rgba("CFC6B0", 120), 1)
    c.veins(rgba("6A6152", 90), 312, 2, 1)


@block("ancient_pillar_top")
def _(c):
    c.noise(rgba("BCB3A0"), 6, 321)
    c.glow(8, 8, 6, rgba("D9D0BB", 140))
    for angle in range(0, 360, 30):
        import math
        x = 8 + int(5 * math.cos(math.radians(angle)))
        y = 8 + int(5 * math.sin(math.radians(angle)))
        c.set(x, y, rgba("7E7564", 200))


@block("ancient_statue")
def _(c):
    c.noise(rgba("C6BEAA"), 7, 331)
    # A suggestion of a face, worn smooth: two hollows and a line.
    c.glow(5, 6, 2.2, rgba("8A8171", 190))
    c.glow(10, 6, 2.2, rgba("8A8171", 190))
    c.line(6, 10, 9, 10, rgba("7E7564", 190), 1)
    c.veins(rgba("6A6152", 90), 332, 3, 1)


@block("signal_casing")
def _(c):
    c.noise(rgba("8A8F94"), 6, 341)
    c.rect(0, 0, 15, 15, rgba("5E6367", 200), fill=False)
    for cx, cy in ((3, 3), (12, 3), (3, 12), (12, 12)):
        c.set(cx, cy, rgba("D3D8DC"))
        c.set(cx + 1, cy, rgba("6E7377"))


@block("signal_machine")
def _(c):
    c.noise(rgba("6E3B3B"), 7, 351)
    c.rect(2, 3, 13, 9, rgba("1A0E0E", 230))
    c.rect(3, 4, 12, 8, rgba("B91C1C", 120))
    rng = random.Random(352)
    for x in range(3, 13, 2):
        c.line(x, 4 + rng.randint(0, 3), x, 8, rgba("F87171", 200), 1)
    c.grid(rgba("4A2929", 150), 4, 1)


@block("fog_moss")
def _(c):
    c.noise(rgba("6E7A72"), 9, 361)
    c.speckle(rgba("95A49A"), 30, 362)
    c.veins(rgba("4E5A54", 130), 363, 3, 1)


@block("fog_stone")
def _(c):
    c.noise(rgba("7A807E"), 8, 371)
    c.speckle(rgba("A8AEAC"), 22, 372)
    c.veins(rgba("565C5A", 120), 373, 3, 1)


# ---------------------------------------------------------------------------------------
# item textures
# ---------------------------------------------------------------------------------------

ITEMS = {}


def item(name):
    def wrap(fn):
        ITEMS[name] = fn
        return fn
    return wrap


@item("guidebook")
def _(c):
    c.rect(1, 1, 14, 14, rgba("2E3440"))
    c.rect(2, 2, 13, 13, rgba("3F4A5A"))
    c.rect(2, 2, 3, 13, rgba("C8B45C"))
    c.line(5, 4, 12, 4, rgba("E5E9F0", 200), 1)
    c.line(5, 6, 12, 6, rgba("E5E9F0", 160), 1)
    c.line(5, 8, 10, 8, rgba("E5E9F0", 160), 1)
    # The cover sigil: a rift mark.
    c.line(9, 10, 11, 13, rgba("A855F7", 230), 1)
    c.line(8, 12, 11, 10, rgba("D79BFF", 220), 1)


@item("reality_scanner")
def _(c):
    # A handset: screen on top, grip below, one antenna bent off the corner.
    c.rect(1, 0, 14, 15, rgba("1A1E23"))
    c.rect(1, 0, 14, 15, rgba("5A6169"), fill=False)
    c.rect(2, 1, 13, 7, rgba("0B2A1A"))
    c.rect(3, 2, 12, 6, rgba("0E3A22"))
    c.line(4, 6, 6, 4, rgba("4ADE80", 245), 1)
    c.line(6, 4, 9, 5, rgba("4ADE80", 220), 1)
    c.line(9, 5, 11, 3, rgba("BBF7D0", 240), 1)
    c.rect(3, 8, 12, 14, rgba("3A4048"))
    c.line(3, 8, 12, 8, rgba("141821"), 1)
    c.set(5, 10, rgba("FFB86B"))
    c.set(6, 10, rgba("FFB86B"))
    c.set(10, 12, rgba("FF6B6B"))
    c.line(14, 0, 15, 0, rgba("8A9096"), 1)


@item("dimensional_gauge")
def _(c):
    import math
    c.rect(1, 4, 14, 13, rgba("2B3036"))
    c.rect(1, 4, 14, 13, rgba("6E7377"), fill=False)
    c.rect(2, 5, 13, 12, rgba("0E1116"))
    for angle in range(200, 341, 20):
        x = 7 + int(4.6 * math.cos(math.radians(angle)))
        y = 10 + int(4.6 * math.sin(math.radians(angle)))
        c.set(x, y, rgba("9AA3AE"))
    c.line(7, 10, 11, 6, rgba("6BD1FF"), 1)
    c.set(7, 10, rgba("EAF6FF"))
    c.line(6, 3, 9, 3, rgba("9AA3AE"), 1)
    c.set(5, 2, rgba("6E7377"))
    c.set(10, 2, rgba("6E7377"))


@item("memory_shard")
def _(c):
    c.line(8, 1, 3, 9, rgba("BFE6FF", 240), 1)
    c.line(8, 1, 12, 8, rgba("8FC8FF", 220), 1)
    c.line(3, 9, 8, 14, rgba("CFEAFF", 230), 1)
    c.line(12, 8, 8, 14, rgba("9AD4FF", 210), 1)
    c.line(8, 1, 8, 14, rgba("EAF6FF", 190), 1)
    c.glow(8, 8, 5, rgba("7DD3FC", 90))


@item("signal_receiver")
def _(c):
    # A field radio: body, dial, and a whip antenna with the received signal lit at the tip.
    c.rect(2, 5, 13, 15, rgba("2E343B"))
    c.rect(2, 5, 13, 15, rgba("5A6169"), fill=False)
    c.rect(3, 6, 12, 10, rgba("0B2A1A"))
    c.line(4, 9, 6, 7, rgba("4ADE80", 230), 1)
    c.line(6, 7, 11, 8, rgba("4ADE80", 200), 1)
    c.rect(4, 12, 9, 13, rgba("6E7377"))
    c.set(11, 12, rgba("FF6B6B"))
    c.set(12, 12, rgba("FF6B6B"))
    c.line(6, 5, 4, 0, rgba("C4CBD4"), 1)
    c.glow(4, 1, 3, rgba("F87171", 130))
    c.set(4, 0, rgba("FF6B6B"))


@item("rift_stabilizer")
def _(c):
    # Two clamps and a bar: you wedge it into a tear and it holds the tear open, or shut.
    c.rect(1, 3, 4, 13, rgba("2E2438"))
    c.rect(11, 3, 14, 13, rgba("2E2438"))
    c.rect(1, 3, 4, 13, rgba("8B5CF6"), fill=False)
    c.rect(11, 3, 14, 13, rgba("8B5CF6"), fill=False)
    c.rect(5, 6, 10, 9, rgba("160B22"))
    c.rect(5, 6, 10, 9, rgba("C084FC"), fill=False)
    for x in range(6, 10, 2):
        c.line(x, 7, x, 8, rgba("F3E8FF", 220), 1)
    c.line(4, 8, 5, 8, rgba("8B5CF6"), 1)
    c.line(10, 8, 11, 8, rgba("8B5CF6"), 1)
    c.set(2, 4, rgba("D8B4FE"))
    c.set(13, 4, rgba("D8B4FE"))


@item("void_lens")
def _(c):
    # A monocle: bright metal ring, and inside it somewhere else entirely.
    import math
    for angle in range(0, 360, 5):
        x = 8 + int(6.2 * math.cos(math.radians(angle)))
        y = 8 + int(6.2 * math.sin(math.radians(angle)))
        c.set(x, y, rgba("9AA3AE"))
        c.set(x, y + 1, rgba("5A6169"))
    for angle in range(0, 360, 5):
        x = 8 + int(4.6 * math.cos(math.radians(angle)))
        y = 8 + int(4.6 * math.sin(math.radians(angle)))
        c.set(x, y, rgba("2A1236"))
    c.glow(8, 8, 4.4, rgba("5B21B6", 190))
    c.glow(7, 7, 2.6, rgba("A855F7", 150))
    for i in range(6):
        c.set(6 + i, 8 - i // 2, rgba("F3E8FF", 150))
    c.set(2, 13, rgba("C4CBD4"))
    c.set(3, 14, rgba("8A9096"))


@item("storm_beacon")
def _(c):
    # A stubby beacon: heavy base, glass envelope, light building inside it.
    c.rect(3, 12, 12, 15, rgba("3A4048"))
    c.rect(3, 12, 12, 15, rgba("6E7377"), fill=False)
    c.rect(5, 4, 10, 12, rgba("16303D"))
    c.rect(5, 4, 10, 12, rgba("8A9096"), fill=False)
    c.glow(8, 8, 6, rgba("6BD1FF", 200))
    c.glow(8, 6, 3, rgba("E0F7FF", 230))
    c.set(8, 3, rgba("FFFFFF", 235))
    c.line(6, 1, 10, 1, rgba("FFFFFF", 150), 1)


@item("ancient_tablet")
def _(c):
    c.rect(2, 1, 13, 14, rgba("BCB3A0"))
    c.rect(3, 2, 12, 13, rgba("C6BEAA"))
    rng = random.Random(901)
    for y in range(4, 13, 3):
        x = 4
        while x < 12:
            length = rng.randint(1, 3)
            c.line(x, y, min(11, x + length), y, rgba("7E7564", 210), 1)
            x += length + 1
    c.glow(8, 8, 6, rgba("E4DCC8", 60))


@item("reality_warhead")
def _(c):
    c.rect(5, 1, 10, 6, rgba("8A9096"))
    c.rect(4, 6, 11, 15, rgba("3A4048"))
    c.rect(5, 7, 10, 14, rgba("C4112A"))
    c.line(5, 9, 10, 9, rgba("FFD166"), 1)
    c.line(5, 12, 10, 12, rgba("FFD166"), 1)
    c.glow(8, 4, 4, rgba("F87171", 140))


@item("reality_fragment")
def _(c):
    c.line(8, 2, 4, 8, rgba("D8B4FE", 240), 1)
    c.line(8, 2, 12, 9, rgba("A855F7", 220), 1)
    c.line(4, 8, 9, 14, rgba("C084FC", 230), 1)
    c.line(12, 9, 9, 14, rgba("8B5CF6", 200), 1)
    c.glow(8, 8, 6, rgba("D8B4FE", 90))


@item("black_sun_fragment")
def _(c):
    # Deliberately the only item that is a hole rather than an object: a black disc with its edge on fire.
    c.fill(rgba("000000", 0))
    for y in range(16):
        for x in range(16):
            distance = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if distance < 5.0:
                c.px[y][x] = (2, 0, 5, 255)
            elif distance < 6.6:
                heat = (6.6 - distance) / 1.6
                c.px[y][x] = (clamp(40 + 215 * heat), clamp(20 + 60 * heat), clamp(10 + 25 * heat), 255)
            elif distance < 7.6:
                c.blend(x, y, rgba("FF4A22", 120), (7.6 - distance))


@item("code_key")
def _(c):
    # A physical key, cut from a monolith and still running: green shaft, teeth on the right.
    c.rect(1, 6, 7, 9, rgba("22C55E", 240))
    c.rect(1, 6, 7, 9, rgba("0B2A1A"), fill=False)
    c.rect(8, 7, 14, 8, rgba("16A34A", 240))
    c.rect(10, 9, 11, 11, rgba("16A34A", 240))
    c.rect(13, 9, 14, 13, rgba("16A34A", 240))
    c.set(3, 7, rgba("BBF7D0", 255))
    c.set(5, 7, rgba("4ADE80", 255))
    c.line(8, 6, 14, 6, rgba("86EFAC", 200), 1)
    c.glow(12, 10, 5, rgba("4ADE80", 110))


# ---------------------------------------------------------------------------------------
# particle sprites
# ---------------------------------------------------------------------------------------

PARTICLES = {}
PARTICLE_TYPES = {}


def particle(name, frames=1):
    PARTICLE_TYPES[name] = frames

    def wrap(fn):
        for frame in range(frames):
            PARTICLES[f"{name}_{frame}"] = (fn, frame, frames)
        return fn
    return wrap


@particle("rift_spark", 6)
def _(c, frame, frames):
    """A shard of torn space, scrolling through its own gradient as the frames advance."""
    import math
    c.fill((0, 0, 0, 0))
    phase = frame / frames
    c.glow(4, 4, 3.6, rgba("7A2ECC", 150))
    c.glow(4, 3.4 + phase, 2.4, rgba("E9D5FF", 210))
    for i in range(4):
        angle = phase * 6.28 + i * 1.57
        x = 4 + 3 * math.cos(angle)
        y = 4 + 3 * math.sin(angle)
        c.blend(int(x), int(y), rgba("D79BFF", 230), 0.9)


@particle("reality_dust", 4)
def _(c, frame, frames):
    import math
    c.fill((0, 0, 0, 0))
    phase = frame / frames
    for i in range(5):
        angle = phase * 6.28 + i * 1.25
        x = 4 + int(2.4 * math.cos(angle))
        y = 4 + int(2.4 * math.sin(angle))
        c.blend(x, y, rgba("E9D5FF", 220), 0.85)
    c.glow(4, 4, 2.4, rgba("8B5CF6", 130))


@particle("reality_scar", 3)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    c.line(1, 6, 6, 1, rgba("8B5CF6", 230), 1)
    c.line(6, 1, 7, 6, rgba("C084FC", 200), 1)
    c.line(2, 7, 6, 2, rgba("5B21B6", 150), 1)
    if frame > 0:
        c.glow(4, 4, 3, rgba("A855F7", 90))


@particle("code_glyph", 4)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    rows = [(1, 0, 5), (5, 1, 4), (2, 3, 3), (4, 5, 3), (1, 6, 4)]
    for index, (x, y, length) in enumerate(rows):
        if (index + frame) % 2 == 0:
            for i in range(length):
                c.set(x + i, y, rgba("4ADE80", 235))
                c.set(x + i, y + 1, rgba("166534", 200))


@particle("bleed_drip", 3)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    # A falling droplet: the shape stretches as it accelerates.
    height = 2 + frame
    for y in range(4 - height // 2, 4 + height // 2):
        for x in range(3, 5):
            c.blend(x, y, rgba("8C0F1C", 235), 0.95)
    c.set(4, 2 + frame, rgba("E0243C", 230))
    c.blend(3, 5, rgba("5E0713", 200), 0.8)


@particle("fog_mote", 2)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    c.glow(4, 4, 3.2, rgba("E2E8F0", 140))
    if frame == 1:
        c.glow(4, 4, 4.0, rgba("FFFFFF", 90))


@particle("black_sun_corona", 4)
def _(c, frame, frames):
    import math
    c.fill((0, 0, 0, 0))
    phase = frame / frames * 6.28
    for i in range(8):
        angle = phase + i * 0.785
        length = 2.6 + 1.2 * math.sin(phase * 2 + i)
        x = 4 + int(length * math.cos(angle))
        y = 4 + int(length * math.sin(angle))
        c.blend(x, y, rgba("FF4A22", 200), 0.8)
    c.glow(4, 4, 2.2, rgba("05010A", 255))
    c.glow(4, 4, 3.4, rgba("FF7A52", 110))


@particle("memory_mote", 2)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    c.glow(4, 4, 3.0, rgba("FDE68A", 170))
    c.set(4, 4, rgba("FFFBEB", 240))
    if frame == 1:
        c.set(3, 3, rgba("FCD34D", 220))
        c.set(5, 5, rgba("FCD34D", 220))


@particle("mirror_mote", 2)
def _(c, frame, frames):
    c.fill((0, 0, 0, 0))
    c.glow(4, 4, 3.0, rgba("CBD5E1", 160))
    c.line(2, 5, 5, 2, rgba("FFFFFF", 200), 1)
    if frame == 1:
        c.line(3, 6, 6, 3, rgba("E2E8F0", 150), 1)


@particle("static_noise", 4)
def _(c, frame, frames):
    rng = random.Random(1000 + frame)
    for y in range(8):
        for x in range(8):
            value = rng.randint(0, 255)
            c.px[y][x] = (value, value, value, 235 if value > 120 else 40)


# ---------------------------------------------------------------------------------------
# entity skins
# ---------------------------------------------------------------------------------------

ENTITIES = {}


def entity(name, size=64):
    def wrap(fn):
        ENTITIES[name] = (fn, size)
        return fn
    return wrap


def skin_canvas(size):
    canvas = Canvas(size)
    canvas.fill((0, 0, 0, 0))
    return canvas


def skin_body(canvas, base, dark, seed, eyes=(200, 40, 40), eye_alpha=255, grin=False, scale=1.0):
    """Paints a full skin: the whole sheet is patterned, so any UV region reads as the same material."""
    rng = random.Random(seed)
    base = norm(base)
    dark = norm(dark)
    eyes = norm(eyes)
    r, g, b, a = base
    for y in range(canvas.size):
        for x in range(canvas.size):
            # Large-scale mottling plus per-pixel grain: reads as flesh, hide or alloy depending on palette.
            blotch = ((x * 7 + y * 13 + seed) % 23) - 11
            grain = rng.randint(-9, 9)
            value = blotch * 0.6 + grain
            canvas.px[y][x] = (clamp(r + value), clamp(g + value), clamp(b + value), a)
    # Shadow seams along the standard limb boxes, so the model reads as separate parts.
    for box in ((0, 16, 16, 32), (16, 16, 40, 32), (40, 16, 56, 32), (0, 0, 32, 16)):
        x0, y0, x1, y1 = box
        for x in range(x0, min(x1, canvas.size)):
            canvas.blend(x, y0, dark, 0.5)
            canvas.blend(x, min(y1 - 1, canvas.size - 1), dark, 0.35)
        for y in range(y0, min(y1, canvas.size)):
            canvas.blend(x0, y, dark, 0.5)
            canvas.blend(min(x1 - 1, canvas.size - 1), y, dark, 0.35)
    # Head front is the 8x8 block at (8, 8) on a 64x64 sheet.
    if canvas.size >= 64:
        canvas.rect(8, 8, 15, 15, dark, fill=False)
        for ex, ey in ((10, 11), (13, 11)):
            canvas.rect(ex, ey, ex + 1, ey, eyes, fill=True)
            canvas.blend(ex, ey, (255, 255, 255, 255), 0.4)
        if grin:
            for gx in range(9, 15):
                canvas.set(gx, 13, (250, 250, 250, 255))
            canvas.set(11, 14, (250, 250, 250, 255))
            canvas.set(12, 14, (250, 250, 250, 255))
            canvas.glow(11, 13, 4, (255, 255, 255, 80))
        else:
            canvas.line(10, 13, 13, 13, (10, 10, 10, 200), 1)


@entity("smiler")
def _(c):
    skin_body(c, (168, 154, 120), (60, 52, 38), 2001, eyes=(250, 250, 245), grin=True)
    c.veins((40, 30, 20, 120), 2002, 4, 1)


@entity("skin_stealer")
def _(c):
    skin_body(c, (214, 178, 156), (120, 90, 76), 2011, eyes=(120, 20, 20))
    # Stretched, hairless, and stitched.
    for y in range(0, 64, 7):
        c.line(0, y, 63, y + 2, (150, 108, 92, 120), 1)


@entity("partygoer")
def _(c):
    skin_body(c, (232, 190, 66), (140, 100, 20), 2021, eyes=(30, 20, 10), grin=True)
    rng = random.Random(2022)
    for _ in range(40):
        c.set(rng.randrange(64), rng.randrange(64), (250, 240, 180, 255))
    c.edge_light((255, 230, 140, 90), 0.4)


@entity("faceling")
def _(c):
    skin_body(c, (166, 160, 148), (86, 82, 74), 2031, eyes=(20, 20, 20))
    # A face with no features except the eyes.
    c.rect(8, 8, 15, 15, (150, 144, 132), fill=True)
    c.rect(10, 11, 11, 11, (20, 20, 20))
    c.rect(13, 11, 14, 11, (20, 20, 20))


@entity("code_wraith")
def _(c):
    skin_body(c, (10, 30, 18), (2, 10, 6), 2041, eyes=(74, 222, 128), grin=False)
    rng = random.Random(2042)
    for y in range(0, 64, 4):
        x = rng.randrange(0, 40)
        while x < 64:
            length = rng.randint(2, 6)
            for i in range(length):
                c.set((x + i) % 64, y, (34, 197, 94, 220))
            x += length + rng.randint(1, 5)
    c.glow(11, 11, 5, (74, 222, 128, 100))


@entity("fog_walker")
def _(c):
    skin_body(c, (138, 146, 144), (66, 72, 70), 2051, eyes=(226, 232, 240))
    c.veins((40, 46, 44, 140), 2052, 5, 1)
    c.glow(11, 12, 6, (226, 232, 240, 60))


@entity("evolved_zombie")
def _(c):
    skin_body(c, (74, 122, 80), (30, 58, 36), 2061, eyes=(20, 24, 20))
    # Learned scars: healed-over damage where the player's weapons used to work.
    for y in range(18, 30, 4):
        c.line(20, y, 34, y, (150, 200, 150, 140), 1)
    c.rect(44, 20, 50, 26, (60, 60, 66), fill=True)  # armour on one arm


@entity("hunter_skeleton")
def _(c):
    skin_body(c, (156, 156, 150), (86, 86, 82), 2071, eyes=(255, 90, 60))
    for y in range(0, 64, 3):
        c.line(0, y, 63, y, (110, 110, 106, 90), 1)
    c.rect(20, 20, 30, 30, (60, 60, 60), fill=True)


@entity("mirror_double")
def _(c):
    skin_body(c, (184, 196, 210), (96, 108, 124), 2081, eyes=(30, 40, 60))
    for i in range(-64, 64, 5):
        c.line(i, 0, i + 64, 64, (255, 255, 255, 26), 1)


@entity("memory_echo")
def _(c):
    skin_body(c, (220, 214, 186), (140, 132, 104), 2091, eyes=(255, 240, 190), eye_alpha=200)
    c.glow(11, 12, 9, (255, 250, 220, 70))


@entity("hound", size=64)
def _(c):
    rng = random.Random(2101)
    for y in range(64):
        for x in range(64):
            v = rng.randint(-12, 12)
            c.px[y][x] = (clamp(38 + v), clamp(30 + v), clamp(26 + v), 255)
    # Head front on a wolf sheet is the 8x8 block at (4, 4).
    c.rect(4, 4, 11, 11, (18, 14, 12), fill=False)
    c.rect(5, 6, 6, 6, (255, 90, 60))
    c.rect(9, 6, 10, 6, (255, 90, 60))
    for y in range(8, 12, 2):
        c.line(5, y, 10, y, (180, 180, 180, 200), 1)


@entity("giant_insect", size=64)
def _(c):
    rng = random.Random(2111)
    for y in range(64):
        for x in range(64):
            v = rng.randint(-10, 10)
            c.px[y][x] = (clamp(30 + v), clamp(36 + v), clamp(26 + v), 255)
    c.rect(32, 4, 39, 11, (20, 24, 18), fill=False)
    for ex, ey in ((34, 6), (37, 6), (34, 8), (37, 8)):
        c.set(ex, ey, (220, 60, 60, 255))
    for x in range(0, 64, 4):
        c.line(x, 0, x, 63, (60, 70, 50, 120), 1)


@entity("ambush_spider", size=64)
def _(c):
    rng = random.Random(2121)
    for y in range(64):
        for x in range(64):
            v = rng.randint(-12, 12)
            c.px[y][x] = (clamp(24 + v), clamp(20 + v), clamp(28 + v), 255)
    c.rect(32, 4, 39, 11, (12, 10, 16), fill=False)
    for ex, ey in ((34, 6), (37, 6), (34, 7), (37, 7)):
        c.set(ex, ey, (200, 60, 200, 255))
    for x in range(0, 64, 6):
        c.line(x, 0, x, 63, (70, 40, 80, 110), 1)


@entity("hiding_creeper", size=64)
def _(c):
    rng = random.Random(2131)
    for y in range(64):
        for x in range(64):
            v = rng.randint(-14, 14)
            c.px[y][x] = (clamp(58 + v), clamp(122 + v), clamp(72 + v), 255)
    # Creeper face: 8x8 at (8, 8).
    c.rect(8, 8, 15, 15, (40, 88, 52), fill=True)
    c.rect(9, 10, 10, 11, (10, 16, 12))
    c.rect(13, 10, 14, 11, (10, 16, 12))
    c.rect(11, 12, 12, 15, (10, 16, 12))
    c.rect(9, 13, 10, 14, (10, 16, 12))
    c.rect(13, 13, 14, 14, (10, 16, 12))


# ---------------------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------------------


def main():
    counts = {"block": 0, "item": 0, "particle": 0, "entity": 0}
    for name, fn in sorted(BLOCKS.items()):
        canvas = Canvas(16)
        fn(canvas)
        canvas.save(os.path.join(ROOT, "block", f"{name}.png"))
        counts["block"] += 1
    for name, fn in sorted(ITEMS.items()):
        canvas = Canvas(16)
        fn(canvas)
        canvas.save(os.path.join(ROOT, "item", f"{name}.png"))
        counts["item"] += 1
    for name, (fn, frame, frames) in sorted(PARTICLES.items()):
        canvas = Canvas(8)
        fn(canvas, frame, frames)
        canvas.save(os.path.join(ROOT, "particle", f"{name}.png"))
        counts["particle"] += 1
    particle_definitions = os.path.join(os.path.dirname(ROOT), "particles")
    for name, frames in sorted(PARTICLE_TYPES.items()):
        path = os.path.join(particle_definitions, f"{name}.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"textures": [f"beyondthelimits:particle/{name}_{frame}" for frame in range(frames)]},
                      handle, indent=2)
            handle.write("\n")
    for name, (fn, size) in sorted(ENTITIES.items()):
        canvas = skin_canvas(size)
        fn(canvas)
        canvas.save(os.path.join(ROOT, "entity", f"{name}.png"))
        counts["entity"] += 1
    total = sum(counts.values())
    print(f"textures: block {counts['block']} item {counts['item']} "
          f"particle {counts['particle']} entity {counts['entity']} — total {total}")
    return total




# ---------------------------------------------------------------------------------------
# the mod icon (128x128), drawn at 4x and downsampled for clean edges
# ---------------------------------------------------------------------------------------


def icon():
    size = 512
    canvas = Canvas(size, (0, 0, 0, 255))
    centre = size / 2.0

    # A night sky behind everything, with stars placed on a stable hash.
    import math
    for y in range(size):
        for x in range(size):
            depth = 1.0 - min(1.0, ((x - centre) ** 2 + (y - centre) ** 2) ** 0.5 / centre)
            canvas.px[y][x] = (int(6 + 18 * depth), int(4 + 10 * depth), int(14 + 42 * depth), 255)
    star = random.Random(5150)
    for _ in range(340):
        x, y = star.randrange(size), star.randrange(size)
        v = star.randint(150, 255)
        canvas.set(x, y, (v, v, min(255, v + 20), 255))

    # The tear: a vertical wound, torn at both ends, brighter at the core.
    for y in range(size):
        vertical = y / size
        sway = math.sin(vertical * 7.0) * 22.0 + math.sin(vertical * 23.0) * 7.0
        width = (26.0 + 34.0 * math.sin(vertical * math.pi)) * (0.55 + 0.45 * math.sin(vertical * 31.0) ** 2)
        for offset in range(-int(width) - 12, int(width) + 13):
            x = int(centre + sway + offset)
            distance = abs(offset) / max(1.0, width)
            if distance > 1.35:
                continue
            core = max(0.0, 1.0 - distance)
            heat = core ** 2.2
            r = int(min(255, 40 + 215 * heat + 120 * core * (1 - vertical)))
            g = int(min(255, 10 + 90 * heat))
            b = int(min(255, 90 + 165 * heat))
            alpha = int(min(255, 40 + 235 * heat))
            canvas.set(x, y, (r, g, b, alpha))

    # Light spilling out of the tear onto the sky.
    for y in range(0, size, 2):
        for x in range(0, size, 2):
            distance = ((x - centre) ** 2 + (y - centre) ** 2) ** 0.5
            if distance < 1:
                continue
            spill = max(0.0, 1.0 - distance / (size * 0.62)) ** 3
            if spill <= 0.002:
                continue
            r, g, b, a = canvas.get(x, y)
            canvas.set(x, y, (min(255, int(r + spill * 70)), int(g + spill * 16), min(255, int(b + spill * 105)), a))

    # Cracks radiating from the tear: the sky is not holding.
    crack = random.Random(99)
    for _ in range(11):
        angle = crack.uniform(0, 6.283)
        x, y = centre, centre
        for step in range(28):
            x += math.cos(angle) * crack.uniform(4, 16)
            y += math.sin(angle) * crack.uniform(4, 16)
            angle += crack.uniform(-0.22, 0.22)
            for w in range(2):
                canvas.set(int(x) + w, int(y), (222, 198, 255, 190))
            if 0 <= x < size and 0 <= y < size and (x < 30 or y < 30 or x > size - 30 or y > size - 30):
                break

    # Downsample 4x4 with a box filter: the same art, without the aliasing.
    scale = 4
    final = Canvas(size // scale, (0, 0, 0, 0))
    for y in range(final.size):
        for x in range(final.size):
            total = [0, 0, 0, 0]
            for dy in range(scale):
                for dx in range(scale):
                    r, g, b, a = canvas.get(x * scale + dx, y * scale + dy)
                    total[0] += r * a
                    total[1] += g * a
                    total[2] += b * a
                    total[3] += a
            if total[3] == 0:
                final.px[y][x] = (0, 0, 0, 0)
            else:
                final.px[y][x] = (total[0] // total[3], total[1] // total[3], total[2] // total[3],
                                  total[3] // (scale * scale))
    target = os.path.join(ROOT, "..", "icon.png")
    final.save(target)
    return target


_original_main = main


def main_with_icon():
    total = _original_main()
    path = icon()
    print(f"icon: {path} (128x128)")


if __name__ == "__main__":
    main_with_icon()
