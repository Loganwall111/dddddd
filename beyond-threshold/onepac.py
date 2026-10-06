#!/usr/bin/env python3
"""
ONEPAC — the single script that makes infinite procedural anything
for BEYOND THE THRESHOLD.

From one seed it fabricates, out of pure math (no image libraries):
  * variant block textures (grass / stone / log / leaves) in alien palettes
  * blockstates, block models, item models, lang entries
  * the item textures of the relic, the blade and the glasses
  * procedural dimensions with sky palettes
  * BTTGeneratedContent.java — the registration code, regenerated too

Usage:
  python3 onepac.py                     # default: seed 1337, 16 variants, 5 dims
  python3 onepac.py --seed 424242 --variants 48 --dims 9
  python3 onepac.py --variants 1000000  # infinite is just a number

Every run rewrites src/main/java/.../BTTGeneratedContent.java and the
generated assets, so "infinite" means: pick any seed and any count and
the mod rebuilds itself around a brand new multiverse.
"""
import argparse
import json
import math
import os
import random
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RES = ROOT / "src/main/resources/assets/beyondthreshold"
JAVA = ROOT / "src/main/java/dev/logan/beyondthreshold/BTTGeneratedContent.java"

DIM_BASE = [
    ("membrane", "plains"),
    ("aurora", "snowy_plains"),
    ("backrooms", "desert"),
    ("ember", "badlands"),
    ("mycelia", "mushroom_fields"),
]

# ---------------------------------------------------------------- png ----
def write_png(path: Path, w: int, h: int, rgb: list[tuple[int, int, int]]):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"".join(struct.pack("3B", *rgb[y * w + x]) for x in range(w)) for y in range(h))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def hsv(h, s, v):
    h %= 1.0
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]
    return int(r * 255), int(g * 255), int(b * 255)


def vnoise(rng, size, scale):
    """tiny value-noise field"""
    g = [[rng.random() for _ in range(size + 1)] for _ in range(size + 1)]
    out = []
    for y in range(size):
        for x in range(size):
            fx, fy = x / scale % 1, y / scale % 1
            x0, y0 = int(x / scale), int(y / scale)
            x0 %= size
            y0 %= size
            a = g[y0][x0]
            b = g[y0][(x0 + 1) % (size + 1)]
            c = g[(y0 + 1) % (size + 1)][x0]
            d = g[(y0 + 1) % (size + 1)][(x0 + 1) % (size + 1)]
            u, w = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
            out.append(a * (1 - u) * (1 - w) + b * u * (1 - w) + c * (1 - u) * w + d * u * w)
    return out


# ------------------------------------------------------------ textures ----
def tex_grass(rng, hue):
    n = vnoise(rng, 16, 4)
    px = []
    for y in range(16):
        for x in range(16):
            v = n[y * 16 + x]
            px.append(hsv(hue + 0.04 * (v - 0.5), 0.75, 0.28 + 0.5 * v))
    return px


def tex_stone(rng, hue):
    n = vnoise(rng, 16, 5)
    n2 = vnoise(rng, 16, 2)
    px = []
    for y in range(16):
        for x in range(16):
            v = 0.6 * n[y * 16 + x] + 0.4 * n2[y * 16 + x]
            band = 0.12 * (1 if (v * 6) % 1 < 0.5 else 0)
            px.append(hsv(hue, 0.30, 0.18 + 0.4 * v + band))
    return px


def tex_log(rng, hue):
    px = []
    for y in range(16):
        for x in range(16):
            stripe = 0.5 + 0.5 * math.sin(x * 1.7 + 2.5 * math.sin(y * 0.35))
            grain = rng.random() * 0.10
            px.append(hsv(hue + 0.02, 0.55, 0.16 + 0.30 * stripe + grain))
    return px


def tex_leaves(rng, hue):
    n = vnoise(rng, 16, 3)
    px = []
    for y in range(16):
        for x in range(16):
            v = n[y * 16 + x]
            hole = v < 0.18
            px.append(hsv(hue + 0.06 * (v - 0.5), 0.8, 0.10 if hole else 0.20 + 0.45 * v))
    return px


def tex_relic(rng):
    px = [(8, 6, 14)] * 256
    for y in range(16):
        for x in range(16):
            dx, dy = x - 8, y - 8
            if abs(dx) + abs(dy) < 7 and rng.random() > 0.08:
                crack = 1 if abs(dx * 0.7 + dy * 0.3) < 0.8 else 0
                glow = max(0, 1 - (abs(dx) + abs(dy)) / 7)
                if crack:
                    px[y * 16 + x] = (190, 120, 255)
                else:
                    px[y * 16 + x] = hsv(0.78, 0.8, 0.25 + 0.5 * glow)
    return px


def tex_blade(rng):
    px = [(0, 0, 0)] * 256
    for y in range(16):
        for x in range(16):
            # diagonal blade
            t = x - y + 6
            if 5 <= t <= 7 and x < 13:
                shine = 1 if t == 5 else 0
                px[y * 16 + x] = (220, 240, 255) if shine else (120, 150, 190)
            if x + y in (20, 21) and x >= 10:
                px[y * 16 + x] = (90, 40, 160)   # handle
    return px


def tex_glasses(rng):
    px = [(0, 0, 0)] * 256
    for y in range(16):
        for x in range(16):
            lens = (3 <= x <= 7 and 6 <= y <= 10) or (9 <= x <= 13 and 6 <= y <= 10)
            bridge = (x == 8 and 7 <= y <= 8)
            arm = (y == 7 and (x < 3 or x > 13))
            if lens:
                px[y * 16 + x] = hsv(0.5 + 0.4 * ((x + y) / 24), 0.9, 0.9)
            elif bridge or arm:
                px[y * 16 + x] = (230, 230, 240)
    return px


# ------------------------------------------------------- java emission ----
def emit_java(seed, variants, dims, palettes):
    lines = []
    a = lines.append
    a("package dev.logan.beyondthreshold;")
    a("")
    a("import net.minecraft.block.Block;")
    a("import net.minecraft.block.Blocks;")
    a("import net.minecraft.item.BlockItem;")
    a("import net.minecraft.item.Item;")
    a("import net.minecraft.sound.BlockSoundGroup;")
    a("import net.minecraft.registry.Registries;")
    a("import net.minecraft.registry.Registry;")
    a("import net.minecraft.util.Identifier;")
    a("")
    a("import java.util.ArrayList;")
    a("import java.util.List;")
    a("")
    a("/**")
    a(f" * GENERATED by onepac.py — seed {seed}, {variants} variants, {len(dims)} dimensions.")

    a(" * Do not edit by hand: rerun onepac.py for a new multiverse.")
    a(" */")
    a("@SuppressWarnings(\"unused\")")
    a("public final class BTTGeneratedContent {")
    a("	public record GenDim(String id, String biome) { }")
    a("")
    a("	public static final List<GenDim> DIMENSIONS = new ArrayList<>();")
    a("	static {")
    for d, b in dims:
        a(f"		DIMENSIONS.add(new GenDim(\"{d}\", \"{b}\"));")
    a("	}")
    a("")
    a("	private static final Block[][] BLOCKS = new Block[4][]; // grass stone log leaves")
    a("	private static final BlockItem[][] ITEMS = new BlockItem[4][];")
    a("")
    a("	public static void register() {")
    kinds = ["grass", "stone", "log", "leaves"]
    for k in range(4):
        a(f"		BLOCKS[{k}] = new Block[{variants}];")
        a(f"		ITEMS[{k}] = new BlockItem[{variants}];")
        a(f"		for (int i = 0; i < {variants}; i++) {{")
        a(f"\t\t\tBlock b = new Block(settingsFor({k}));")
        a(f"			BLOCKS[{k}][i] = b;")
        a(f"			Registry.register(Registries.BLOCK, new Identifier(BeyondTheThreshold.MOD_ID, \"vb_{kinds[k]}\" + i), b);")
        a(f"			BlockItem bi = new BlockItem(b, new Item.Settings());")
        a(f"			ITEMS[{k}][i] = bi;")
        a(f"			Registry.register(Registries.ITEM, new Identifier(BeyondTheThreshold.MOD_ID, \"vb_{kinds[k]}\" + i), bi);")
        a("		}")
    a("	}")
    a("")
    a("\tprivate static net.minecraft.block.AbstractBlock.Settings settingsFor(int kind) {")
    a("\t\treturn switch (kind) {")
    a("\t\t\tcase 0 -> net.minecraft.block.AbstractBlock.Settings.create().strength(0.6F).sounds(BlockSoundGroup.GRASS);")
    a("\t\t\tcase 1 -> net.minecraft.block.AbstractBlock.Settings.create().strength(1.5F, 6.0F).sounds(BlockSoundGroup.STONE);")
    a("\t\t\tcase 2 -> net.minecraft.block.AbstractBlock.Settings.create().strength(2.0F).sounds(BlockSoundGroup.WOOD);")
    a("\t\t\tdefault -> net.minecraft.block.AbstractBlock.Settings.create().strength(0.2F).nonOpaque().sounds(BlockSoundGroup.GRASS);")
    a("\t\t};")
    a("\t}")
    a("")
    a("	public static int variantCount() {")
    a(f"		return {variants};")
    a("	}")
    a("")
    a("	public static net.minecraft.block.BlockState blockState(int kind, int variant) {")
    a("		return BLOCKS[kind & 3][Math.floorMod(variant, variantCount())].getDefaultState();")
    a("	}")
    a("")
    a("	public static BlockItem pickBlock(int kind, int variant) {")
    a("		return ITEMS[kind & 3][Math.floorMod(variant, variantCount())];")
    a("	}")
    a("")
    a("	private static final float[][] PALETTES = {")
    for p in palettes:
        a("		{" + ", ".join(f"{v:.3f}F" for v in p) + "},")
    a("	};")
    a("")
    a("	public static float[] palette(int dim) {")
    a("		if (dim < 0 || dim >= PALETTES.length) return null;")
    a("		return PALETTES[dim];")
    a("	}")
    a("")
    a("	private BTTGeneratedContent() { }")
    a("}")
    JAVA.parent.mkdir(parents=True, exist_ok=True)
    JAVA.write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------- main ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--variants", type=int, default=16)
    ap.add_argument("--dims", type=int, default=5)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    os.makedirs(RES, exist_ok=True)

    # item textures for the tools
    write_png(RES / "textures/item/shattered_relic.png", 16, 16, tex_relic(random.Random(args.seed + 1)))
    write_png(RES / "textures/item/threshold_blade.png", 16, 16, tex_blade(random.Random(args.seed + 2)))
    write_png(RES / "textures/item/radiate_reality_glasses.png", 16, 16, tex_glasses(random.Random(args.seed + 3)))
    for n in ["shattered_relic", "threshold_blade", "radiate_reality_glasses"]:
        (RES / "models/item" / f"{n}.json").write_text(json.dumps({
            "parent": "item/generated", "textures": {"layer0": f"beyondthreshold:item/{n}"}}, indent=2))

    kinds = ["grass", "stone", "log", "leaves"]
    texfn = [tex_grass, tex_stone, tex_log, tex_leaves]
    copies_hue = [None, None, None, None]
    lang = {}
    for v in range(args.variants):
        hue = (rng.random() + v * 0.618034) % 1.0
        for k in range(4):
            name = f"vb_{kinds[k]}{v}"
            px = texfn[k](random.Random(args.seed * 31 + v * 7 + k), hue)
            write_png(RES / "textures/block" / f"{name}.png", 16, 16, px)
            (RES / "models/block" / f"{name}.json").write_text(json.dumps({
                "parent": "block/cube_all",
                "textures": {"all": f"beyondthreshold:block/{name}"}}, indent=2))
            (RES / "models/item" / f"{name}.json").write_text(json.dumps({
                "parent": f"beyondthreshold:block/{name}"}, indent=2))
            (RES.parent.parent / "data" / "beyondthreshold" / "loot_tables" / "blocks" / f"{name}.json").parent.mkdir(parents=True, exist_ok=True)
            lang[f"block.beyondthreshold.{name}"] = f"Threshold {kinds[k].capitalize()} {v:03d}"

    # dimensions + palettes
    dims = []
    palettes = []
    for i in range(args.dims):
        base = DIM_BASE[i % len(DIM_BASE)]
        name = base[0] if i < len(DIM_BASE) else f"{base[0]}_{i // len(DIM_BASE)}"
        biome = base[1]
        hue = rng.random()
        pal = []
        for c in range(4):
            h2 = (hue + c * 0.25 + rng.random() * 0.1) % 1.0
            r, g, b = hsv(h2, 0.8, 0.9)
            pal += [round(r / 255, 3), round(g / 255, 3), round(b / 255, 3)]
        dims.append((name, biome))
        palettes.append(pal)
        (RES / "dimension_meta").mkdir(exist_ok=True)
        (RES / "dimension_meta" / f"{name}.json").write_text(json.dumps({
            "dimension": f"beyondthreshold:{name}", "biome": biome,
            "palette": {"nebula_a": pal[0:3], "nebula_b": pal[3:6],
                        "horizon": pal[6:9], "glow": pal[9:12]},
            "seed": args.seed + i}, indent=2))
        lang[f"dimension.beyondthreshold.{name}"] = name.replace("_", " ").title()

        # datapack JSON — vanilla loads these as REAL worlds at startup,
        # so tearing reality actually lands you somewhere that exists.
        DATA = ROOT / "src/main/resources/data/beyondthreshold"
        (DATA / "dimension").mkdir(parents=True, exist_ok=True)
        (DATA / "worldgen" / "biome").mkdir(parents=True, exist_ok=True)
        rgb = lambda c: int(c[0] * 255) << 16 | int(c[1] * 255) << 8 | int(c[2] * 255)
        sky, neb, hor = rgb(pal[0:3]), rgb(pal[3:6]), rgb(pal[6:9])
        (DATA / "dimension" / f"{name}.json").write_text(json.dumps({
            "type": "minecraft:overworld",
            "generator": {
                "type": "minecraft:noise",
                "settings": "minecraft:overworld",
                "biome_source": {"type": "minecraft:fixed",
                                 "biome": f"beyondthreshold:{name}"},
            }}, indent=2))
        (DATA / "worldgen" / "biome" / f"{name}.json").write_text(json.dumps({
            "temperature": 0.8, "downfall": 0.3, "has_precipitation": False,
            "effects": {"sky_color": sky, "fog_color": hor,
                        "water_color": neb, "water_fog_color": sky},
            "spawners": {"monster": [], "creature": [], "ambient": [],
                         "axolotls": [], "underground_water_creature": [],
                         "water_creature": [], "water_ambient": [], "misc": []},
            "spawn_costs": {}, "carvers": {},
            "features": [[] for _ in range(11)],
        }, indent=2))

    (RES / "lang/en_us.json").write_text(json.dumps(dict(sorted({
        "item.beyondthreshold.shattered_relic": "Shattered Relic",
        "item.beyondthreshold.threshold_blade": "Threshold Blade",
        "item.beyondthreshold.radiate_reality_glasses": "Radiate Reality Glasses",
        "key.beyondthreshold.cycle": "Cycle Mandela Reality",
        "key.beyondthreshold.config": "Threshold Config",
        "key.beyondthreshold.category": "Beyond the Threshold",
        "screen.beyondthreshold.config": "Beyond the Threshold",
        "message.beyondthreshold.glasses_on": "Radiate Reality engaged — press V to shift realities",
        "message.beyondthreshold.glasses_off": "Radiate Reality disengaged",
        "message.beyondthreshold.no_glasses": "You need the Radiate Reality glasses for that",
        "message.beyondthreshold.mandela": "Mandela shift: %s",
        "message.beyondthreshold.tear_target": "The blade hums toward %s",
        "message.beyondthreshold.shrunk": "You are small now. The world is infinite.",
        **lang,
    }.items())), indent=2))

    emit_java(args.seed, args.variants, dims, palettes)
    print(f"onepac: seed={args.seed} variants={args.variants} dims={args.dims} "
          f"-> {args.variants * 4} blocks, {len(dims)} dimensions, java + assets written")


if __name__ == "__main__":
    main()
