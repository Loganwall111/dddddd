#!/usr/bin/env python3
"""Rift/portal "other world" scene textures for the client RiftRenderer.

Where the reference footage shows the inside of a rift, the texture is a literal crop of that
interior, pixelated (downsampled to a 24-40 px grid, upscaled nearest) like the blocky
footage. Other styles are painted procedurally in the same palette logic. Deterministic.
Writes assets/entersift/textures/rift/scene_<style>.png (128x128) and clouds.png.
Style ids (glow_color_override on the anchor display): 0 overworld, 1 sift day, 2 end,
3 sift night, 4 nether, 5 portal.
"""
import random
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CROPS = ROOT / "art/ref_crops"
OUT = ROOT / "src/main/resources/assets/entersift/textures/rift"
SIZE = 128


def pixelate(im: Image.Image, grid: int) -> Image.Image:
    return im.convert("RGB").resize((grid, grid), Image.BILINEAR).resize((SIZE, SIZE), Image.NEAREST)


def crop(name: str, box) -> Image.Image:
    im = Image.open(CROPS / f"{name}.png").convert("RGB")
    w, h = im.size
    return im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))


def noise_field(seed: int, grid: int, octaves=3):
    rnd = random.Random(seed)
    field = [[0.0] * SIZE for _ in range(SIZE)]
    amp, total = 1.0, 0.0
    g = grid
    for _ in range(octaves):
        pts = [[rnd.random() for _ in range(g + 1)] for _ in range(g + 1)]
        for y in range(SIZE):
            fy = y / SIZE * g; iy = int(fy); ty = fy - iy; ty = ty * ty * (3 - 2 * ty)
            for x in range(SIZE):
                fx = x / SIZE * g; ix = int(fx); tx = fx - ix; tx = tx * tx * (3 - 2 * tx)
                a = pts[iy][ix] * (1 - tx) + pts[iy][(ix + 1) % (g + 1)] * tx
                b = pts[(iy + 1) % (g + 1)][ix] * (1 - tx) + pts[(iy + 1) % (g + 1)][(ix + 1) % (g + 1)] * tx
                field[y][x] += (a * (1 - ty) + b * ty) * amp
        total += amp; amp *= 0.5; g *= 2
    return [[v / total for v in row] for row in field]


def paint(seed, stops, grid=28, sparkle=0.0, sparkle_col=(255, 255, 255)):
    f = noise_field(seed, 4)
    im = Image.new("RGB", (SIZE, SIZE))
    px = im.load()
    for y in range(SIZE):
        for x in range(SIZE):
            v = min(0.999, max(0.0, (f[y][x] - 0.25) / 0.5))
            i = v * (len(stops) - 1); k = int(i); t = i - k
            a, b = stops[k], stops[min(k + 1, len(stops) - 1)]
            px[x, y] = tuple(int(a[c] * (1 - t) + b[c] * t) for c in range(3))
    im = pixelate(im, grid)
    rnd = random.Random(seed + 7)
    px = im.load()
    cell = SIZE // grid
    for _ in range(int(sparkle * 60)):
        cx, cy = rnd.randrange(grid) * cell, rnd.randrange(grid) * cell
        for yy in range(cy, min(SIZE, cy + cell)):
            for xx in range(cx, min(SIZE, cx + cell)):
                px[xx, yy] = sparkle_col
    return im


def clouds():
    """White pixel-cloud puffs on transparency: drifts across the scene as a second layer."""
    f = noise_field(99, 5)
    im = Image.new("RGBA", (SIZE, SIZE))
    px = im.load()
    for y in range(SIZE):
        for x in range(SIZE):
            a = max(0.0, (f[y][x] - 0.52) / 0.2)
            px[x, y] = (255, 246, 232, int(min(1.0, a) * 200))
    return im.resize((32, 32), Image.BILINEAR).resize((SIZE, SIZE), Image.NEAREST)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    scenes = {
        # Overworld: the gold-green jungle glimpse (rift_yellow ref), pixelated.
        0: pixelate(crop("rift_yellow", (0.0, 0.5, 0.28, 0.98)), 28),
        # Sift by day: the orange-peach cloud interior (rift_orange ref).
        1: pixelate(crop("rift_orange", (0.36, 0.18, 0.78, 0.92)), 32),
        # The End: violet night with stars.
        2: paint(21, [(22, 10, 44), (52, 24, 92), (120, 60, 170), (190, 130, 230)], 30, 0.7, (240, 230, 255)),
        # Sift at night: pink/blue nebula with white motes (rift ref, right panel).
        3: paint(33, [(40, 50, 110), (110, 90, 170), (220, 120, 180), (250, 190, 220)], 30, 0.9),
        # Nether: crimson interior (rift_red ref).
        4: pixelate(crop("rift_red", (0.22, 0.08, 0.86, 0.6)), 26),
        # Portal: cyan pixel mosaic (portal_mosaic ref).
        5: pixelate(crop("portal_mosaic", (0.22, 0.12, 0.9, 0.9)), 24),
    }
    for style, im in scenes.items():
        im = im.filter(ImageFilter.UnsharpMask(radius=1, percent=40))
        im.save(OUT / f"scene_{style}.png")
    clouds().save(OUT / "clouds.png")
    print("rift_scenes: done")


if __name__ == "__main__":
    main()
