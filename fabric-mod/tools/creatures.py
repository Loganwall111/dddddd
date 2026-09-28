#!/usr/bin/env python3
"""Creature pipeline (0.4). All part pivots in SPECS are ABSOLUTE model coordinates: one spec per Sift creature ->
  * client Java model geometry  (src/client/java/.../SiftModelDefs.java)
  * box-UV packed entity texture + emissive layer (textures/entity/<kind>.png, <kind>_glow.png)
  * spawn egg sprite (textures/item/<kind>_spawn_egg.png)

Units are Minecraft model pixels: y grows DOWN, ground is y=24, the face is on -Z ("north").
Colours are sampled by eye from the reference crops in art/ref_crops.

    python3 tools/creatures.py
"""
from __future__ import annotations
import random
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/main/resources/assets/entersift/textures"
JAVA = ROOT / "src/client/java/dev/logan/entersift/client/SiftModelDefs.java"


def P(name, pivot, boxes, parent=None, rot=(0, 0, 0)):
    return dict(name=name, pivot=pivot, boxes=boxes, parent=parent, rot=rot)


def B(x, y, z, w, h, d, base, pat="noise", faces=None, glow=False, dark=None):
    """faces: {'north': [(fx, fy, fw, fh, colour, glow?)], ...} in face-local pixels."""
    return dict(o=(x, y, z), s=(w, h, d), base=base, pat=pat, faces=faces or {}, glow=glow, dark=dark)


# ----------------------------------------------------------------------------------------------
# Specs
# ----------------------------------------------------------------------------------------------
BLUE = (156, 214, 232)
RED_EYE = (224, 44, 62)
SPECS: dict[str, dict] = {}

# Blub — (0.9 ref crop) an all-blue jelly bunny: sky-blue cube body, dark navy bar eyes and a small dark
# mouth, upright ears in the same blue (slightly lighter inside). No pink, no purple.
BLUB_EYE, BLUB_MOUTH = (30, 38, 86), (40, 52, 104)
BLUB_TOP, BLUB_EAR, BLUB_EAR_IN, BLUB_LEG = (150, 206, 244), (112, 176, 232), (140, 198, 244), (92, 150, 206)
BLUB_BLUE = (118, 182, 236)
SPECS["blub"] = dict(tex=64, egg=(BLUB_BLUE, BLUB_EYE), parts=[
    P("body", (0, 21, 0), [B(-5, -8, -5, 10, 8, 10, BLUB_BLUE, "speckle", faces={
        "north": [(1, 3, 3, 1, BLUB_EYE, False), (6, 3, 3, 1, BLUB_EYE, False), (4, 5, 2, 1, BLUB_MOUTH, False)],
        "top": [(0, 0, 10, 10, BLUB_TOP, False)]})]),
    P("ear_l", (-3, 13, 1), [B(-1.5, -7, -0.5, 3, 7, 1, BLUB_EAR, "plain", faces={"north": [(1, 1, 1, 5, BLUB_EAR_IN, False)]})],
      parent="body", rot=(0.2, 0, -0.25)),
    P("ear_r", (3, 13, 1), [B(-1.5, -7, -0.5, 3, 7, 1, BLUB_EAR, "plain", faces={"north": [(1, 1, 1, 5, BLUB_EAR_IN, False)]})],
      parent="body", rot=(0.2, 0, 0.25)),
    P("leg_0", (-3, 21, -3), [B(-1, 0, -1, 2, 3, 2, BLUB_LEG)]),
    P("leg_1", (3, 21, -3), [B(-1, 0, -1, 2, 3, 2, BLUB_LEG)]),
    P("leg_2", (-3, 21, 3), [B(-1, 0, -1, 2, 3, 2, BLUB_LEG)]),
    P("leg_3", (3, 21, 3), [B(-1, 0, -1, 2, 3, 2, BLUB_LEG)]),
])

# Sculker — slate-blue gaper with a huge tan mouth, whiskers and antler sprouts (sculkers render).
SLATE, MOUTH, TOOTH = (72, 104, 140), (222, 168, 136), (242, 236, 222)
SPECS["sculker"] = dict(tex=128, egg=(SLATE, MOUTH), parts=[
    P("leg_0", (-2.5, 16, 0), [B(-1.5, 0, -1.5, 3, 8, 3, (60, 88, 120))]),
    P("leg_1", (2.5, 16, 0), [B(-1.5, 0, -1.5, 3, 8, 3, (60, 88, 120))]),
    P("body", (0, 16, 0), [B(-4, -8, -3, 8, 8, 6, SLATE, "speckle", faces={"north": [(2, 2, 4, 5, (98, 132, 164), False)]})]),
    P("head", (0, 8, 0), [B(-6, -5, -5, 12, 5, 10, SLATE, "speckle", faces={"north": [
        (2, 1, 2, 2, (20, 26, 40), False), (8, 1, 2, 2, (20, 26, 40), False), (1, 4, 10, 1, TOOTH, False)],
        "bottom": [(1, 1, 10, 8, MOUTH, False)]})], parent="body"),
    P("jaw", (0, 8, -1), [B(-6, 0, -4, 12, 3, 10, (64, 94, 128), faces={"north": [(1, 0, 10, 1, TOOTH, False)],
        "top": [(1, 1, 10, 8, MOUTH, False)]})], parent="head"),
    P("whisker_l", (-6, 6, -2), [B(-5, 0, 0, 5, 1, 1, (48, 70, 96), "plain")], parent="head", rot=(0, 0, 0.3)),
    P("whisker_r", (6, 6, -2), [B(0, 0, 0, 5, 1, 1, (48, 70, 96), "plain")], parent="head", rot=(0, 0, -0.3)),
    P("antenna_l", (-2, 3, 0), [B(-0.5, -6, -0.5, 1, 6, 1, (126, 156, 172), "plain"), B(-2.5, -5, -0.5, 2, 1, 1, (126, 156, 172), "plain")], parent="head"),
    P("antenna_r", (2, 3, 0), [B(-0.5, -6, -0.5, 1, 6, 1, (126, 156, 172), "plain"), B(0.5, -4, -0.5, 2, 1, 1, (126, 156, 172), "plain")], parent="head"),
])

# Sculkling — little tan critter with a teal head and a sprout.
TAN, TEAL = (226, 192, 144), (104, 170, 158)
SPECS["sculkling"] = dict(tex=64, egg=(TAN, TEAL), parts=[
    P("body", (0, 21, 0), [B(-3, -4, -3, 6, 5, 6, TAN, "speckle")]),
    P("head", (0, 17, -1), [B(-3, -5, -3, 6, 5, 5, TEAL, faces={"north": [(1, 2, 1, 1, (20, 30, 30), False), (4, 2, 1, 1, (20, 30, 30), False), (2, 4, 2, 1, (60, 100, 90), False)]})], parent="body"),
    P("antenna_0", (0, 12, -1), [B(-0.5, -3, -0.5, 1, 3, 1, (120, 200, 170), "plain"), B(-1.5, -4, -0.5, 3, 1, 1, (150, 226, 196), "plain")], parent="head"),
    P("leg_0", (-2, 22, -2), [B(-1, 0, -1, 2, 2, 2, (200, 166, 120))]),
    P("leg_1", (2, 22, -2), [B(-1, 0, -1, 2, 2, 2, (200, 166, 120))]),
    P("leg_2", (-2, 22, 2), [B(-1, 0, -1, 2, 2, 2, (200, 166, 120))]),
    P("leg_3", (2, 22, 2), [B(-1, 0, -1, 2, 2, 2, (200, 166, 120))]),
])

# Antlerling — small villager-like figure with two antlers on top.
ROBE, SKIN, BONE, CYAN_EYE = (58, 118, 124), (150, 190, 200), (212, 218, 204), (90, 250, 240)
SPECS["antlerling"] = dict(tex=64, egg=(ROBE, BONE), parts=[
    P("leg_0", (-2, 18, 0), [B(-2, 0, -2, 4, 6, 4, (46, 96, 104))]),
    P("leg_1", (2, 18, 0), [B(-2, 0, -2, 4, 6, 4, (46, 96, 104))]),
    P("body", (0, 18, 0), [B(-4, -9, -3, 8, 9, 6, ROBE, "stripes", faces={"north": [(3, 0, 2, 9, (40, 90, 96), False)]})]),
    P("arms", (0, 11, -2), [B(-5, -1, -2, 10, 3, 3, (70, 136, 140)), B(-2, 2, -2, 4, 2, 2, SKIN)], parent="body"),
    P("head", (0, 9, 0), [B(-4, -8, -4, 8, 8, 8, SKIN, faces={"north": [(1, 3, 2, 1, CYAN_EYE, True), (5, 3, 2, 1, CYAN_EYE, True)]}),
                          B(-1, -4, -6, 2, 4, 2, (130, 170, 180))], parent="body"),
    P("antler_l", (-3, 1, 0), [B(-0.5, -7, -0.5, 1, 7, 1, BONE, "plain"), B(-3.5, -6, -0.5, 3, 1, 1, BONE, "plain"), B(-2.5, -9, -0.5, 1, 3, 1, BONE, "plain")], parent="head", rot=(0, 0, -0.25)),
    P("antler_r", (3, 1, 0), [B(-0.5, -7, -0.5, 1, 7, 1, BONE, "plain"), B(0.5, -6, -0.5, 3, 1, 1, BONE, "plain"), B(1.5, -9, -0.5, 1, 3, 1, BONE, "plain")], parent="head", rot=(0, 0, 0.25)),
])

# Drift jelly — cube-headed jellyfish with a single square eye (sculkers render, top right).
JHEAD, JRIM, JEYE = (64, 84, 164), (224, 204, 172), (206, 240, 255)
SPECS["drift_jelly"] = dict(tex=64, egg=(JHEAD, JEYE), parts=[
    P("head", (0, -14, 0), [B(-5, -8, -5, 10, 8, 10, JHEAD, "speckle", faces={"north": [(3, 2, 4, 4, JEYE, True), (4, 3, 2, 2, (30, 40, 96), False)]}),
                          B(-5, 0, -5, 10, 2, 10, JRIM, "noise")]),
] + [P(f"tentacle_{i}", (x, -12, z), [B(-0.5, 0, -0.5, 1, 14, 1, (52, 66, 140), "plain", faces={"north": [(0, 10, 1, 4, (110, 130, 220), True)]})], parent="head")
     for i, (x, z) in enumerate([(-3.5, -3.5), (0, -3.5), (3.5, -3.5), (-3.5, 3.5), (0, 3.5), (3.5, 3.5), (-3.5, 0), (3.5, 0)])])

# Licker — sage-green head-creature with a long pink tongue (Licker reference).
SAGE, PATCH, TONGUE = (152, 188, 162), (96, 160, 130), (242, 176, 172)
SPECS["licker"] = dict(tex=128, egg=(SAGE, TONGUE), parts=[
    P("leg_0", (-4, 20, -3), [B(-1.5, 0, -1.5, 3, 4, 3, (120, 160, 140))]),
    P("leg_1", (4, 20, -3), [B(-1.5, 0, -1.5, 3, 4, 3, (120, 160, 140))]),
    P("leg_2", (-4, 20, 4), [B(-1.5, 0, -1.5, 3, 4, 3, (120, 160, 140))]),
    P("leg_3", (4, 20, 4), [B(-1.5, 0, -1.5, 3, 4, 3, (120, 160, 140))]),
    P("head", (0, 20, 0), [B(-7, -13, -7, 14, 13, 14, SAGE, "patches", dark=PATCH, faces={"north": [
        (2, 4, 3, 2, (176, 206, 238), True), (9, 4, 3, 2, (176, 206, 238), True), (4, 9, 6, 2, (80, 40, 50), False)]})]),
    P("crown", (0, 7, 0), [B(-2, -2, -2, 4, 2, 4, (196, 204, 84)), B(-1, -4, -1, 1, 2, 1, (170, 220, 110), "plain"), B(1, -3, 0, 1, 1, 1, (170, 220, 110), "plain")], parent="head"),
    P("tongue", (0, 17, -7), [B(-2.5, 0, -1, 5, 1, 7, TONGUE, "plain"), B(-2.5, 0, -8, 5, 8, 1, TONGUE, "plain")], parent="head", rot=(0.15, 0, 0)),
])

# Overseer — tentacled brain-god with a purple eye-cube head and curled horns (23_170726).
OV, OVR, OVE = (96, 60, 142), (142, 102, 192), (218, 196, 255)
SPECS["overseer"] = dict(tex=128, egg=(OV, OVE), parts=[
    P("head", (0, -8, 0), [B(-6, -12, -6, 12, 12, 12, OV, "speckle", faces={"north": [(2, 2, 8, 8, OVR, False), (3, 3, 6, 6, OVE, True), (5, 5, 2, 2, (40, 20, 70), False)]})]),
    P("horn_l", (-6, -16, 0), [B(-6, -1, -1, 6, 2, 2, (72, 46, 112)), B(-8, -9, -1, 2, 10, 2, (72, 46, 112)), B(-6, -11, -1, 2, 2, 2, (190, 130, 240), glow=True)], parent="head"),
    P("horn_r", (6, -16, 0), [B(0, -1, -1, 6, 2, 2, (72, 46, 112)), B(6, -9, -1, 2, 10, 2, (72, 46, 112)), B(4, -11, -1, 2, 2, 2, (190, 130, 240), glow=True)], parent="head"),
    P("body", (0, -8, 0), [B(-2, 0, -2, 4, 12, 4, (42, 36, 54))]),
    P("arm_l", (-2, -6, 0), [B(-12, 0, -1, 12, 2, 2, (54, 44, 70))], rot=(0, 0, -0.5)),
    P("arm_r", (2, -6, 0), [B(0, 0, -1, 12, 2, 2, (54, 44, 70))], rot=(0, 0, 0.5)),
] + [P(f"tentacle_{i}", (x, 4, z), [B(-0.5, 0, -0.5, 1, 18, 1, (62, 46, 84), "plain", faces={"north": [(0, 14, 1, 4, (170, 110, 220), True)]})])
     for i, (x, z) in enumerate([(-1.5, -1.5), (1.5, -1.5), (-1.5, 1.5), (1.5, 1.5), (0, 0)])])

# Twisted Warden — matches the MCD2 "work in progress" ref: void-dark cube body with faint cyan
# fissures, glowing cyan bracket antlers, a brass-toothed chest maw with a cyan glow inside, brass knuckles.
TW, TWL, TWG, BRASS, HOLLOW = (22, 32, 44), (34, 50, 64), (80, 244, 236), (184, 156, 72), (6, 10, 14)
def antler(side):
    s_ = -1 if side == "l" else 1
    def bx(x, y, w, h):  # mirror boxes for the right antler
        return B(x if s_ < 0 else -x - w, y, -1, w, h, 2, TWG, "plain", glow=True)
    return [bx(-1, -10, 2, 10), bx(-10, -10, 9, 2), bx(-10, -20, 2, 10), bx(-10, -20, 7, 2), bx(-5, -16, 2, 6), bx(-14, -15, 4, 2), bx(-14, -18, 2, 3)]
SPECS["twisted_warden"] = dict(tex=128, egg=(TW, TWG), parts=[
    P("leg_0", (-5, 11, 0), [B(-3, 0, -3, 6, 13, 6, TW, "cracks", dark=TWG)]),
    P("leg_1", (5, 11, 0), [B(-3, 0, -3, 6, 13, 6, TW, "cracks", dark=TWG)]),
    P("body", (0, 11, 0), [B(-9, -21, -5, 18, 21, 10, TW, "cracks", dark=TWG, faces={"north": [(2, 5, 14, 12, (40, 206, 206), True), (4, 7, 10, 8, (150, 255, 250), True)]})]),
    P("chest_upper", (0, -5, -5), [B(-8, 0, -2, 16, 3, 2, BRASS, "noise"), B(-7, 3, -2, 2, 2, 1, BRASS, "plain"), B(-3, 3, -2, 2, 2, 1, BRASS, "plain"),
                                   B(1, 3, -2, 2, 2, 1, BRASS, "plain"), B(5, 3, -2, 2, 2, 1, BRASS, "plain")], parent="body"),
    P("chest_lower", (0, 7, -5), [B(-8, -3, -2, 16, 3, 2, BRASS, "noise"), B(-5, -5, -2, 2, 2, 1, BRASS, "plain"), B(-1, -5, -2, 2, 2, 1, BRASS, "plain"),
                                  B(3, -5, -2, 2, 2, 1, BRASS, "plain")], parent="body"),
    P("head", (0, -10, 0), [B(-7, -12, -6, 14, 12, 12, TW, "cracks", dark=TWG, faces={"north": [(5, 4, 4, 4, HOLLOW, False), (6, 5, 2, 2, TWG, True)]})], parent="body"),
    P("horn_l", (-4, -22, 0), antler("l"), parent="head"),
    P("horn_r", (4, -22, 0), antler("r"), parent="head"),
    P("arm_l", (-13, -6, 1), [B(-4, 0, -4, 8, 26, 8, TW, "cracks", dark=TWG), B(-5, 19, -5, 10, 3, 10, BRASS, "noise")], parent="body"),
    P("arm_r", (13, -6, 1), [B(-4, 0, -4, 8, 26, 8, TW, "cracks", dark=TWG), B(-5, 19, -5, 10, 3, 10, BRASS, "noise")], parent="body"),
])

# Note bird — small mint songbird that flies over the Sift; glowing note-coloured wing tips.
NB, NBW, NBH = (84, 196, 196), (236, 250, 246), (40, 70, 90)
SPECS["note_bird"] = dict(tex=64, egg=(NB, (255, 120, 180)), parts=[
    P("body", (0, 18, 0), [B(-2, -3, -3, 4, 3, 6, NB, "speckle"), B(-1.5, -2, 3, 3, 1, 3, NBW, "plain", faces={"top": [(0, 2, 3, 1, (255, 120, 180), True)]})]),
    P("head", (0, 15, -2), [B(-1.5, -3, -2, 3, 3, 3, NBH, "noise", faces={"north": [(0, 1, 1, 1, (120, 255, 240), True), (2, 1, 1, 1, (120, 255, 240), True)]}),
                            B(-0.5, -1.5, -3, 1, 1, 1, (250, 190, 90), "plain")], parent="body"),
    P("wing_l", (-2, 16, 0), [B(-6, 0, -2, 6, 1, 4, NBW, "noise", faces={"top": [(0, 0, 2, 4, (255, 120, 180), True)], "bottom": [(4, 0, 2, 4, (255, 200, 90), True)]})], parent="body"),
    P("wing_r", (2, 16, 0), [B(0, 0, -2, 6, 1, 4, NBW, "noise", faces={"top": [(4, 0, 2, 4, (120, 200, 255), True)], "bottom": [(0, 0, 2, 4, (170, 120, 255), True)]})], parent="body"),
    P("leg_0", (-1, 18, 0), [B(-0.5, 0, -0.5, 1, 2, 1, (250, 190, 90), "plain")]),
    P("leg_1", (1, 18, 0), [B(-0.5, 0, -0.5, 1, 2, 1, (250, 190, 90), "plain")]),
])

# Singer — (0.9, MCD2 appearance art) tall sea-green figure: scaled teal robe, pale ridged mask face,
# branching cream antlers, wide teal feathered wing-arms spread downward, a peach flower on the chest.
SG, SGD, SGL = (104, 196, 176), (66, 146, 136), (164, 232, 212)
MASK, MASKD, ANT = (214, 240, 226), (160, 206, 192), (242, 234, 212)
PEACH, ORANGE, PETAL = (244, 196, 160), (232, 146, 104), (252, 236, 222)
SPECS["singer"] = dict(tex=128, egg=(SG, PEACH), parts=[
    P("body", (0, 24, 0), [
        B(-4, -22, -3, 8, 22, 6, SG, "speckle", faces={"north": [
            (0, 11, 8, 1, SGD, False), (0, 16, 8, 1, SGD, False), (3, 6, 1, 16, SGD, False),
            (2, 3, 4, 3, PEACH, True), (3, 4, 2, 1, ORANGE, True), (1, 4, 1, 1, PETAL, True), (6, 4, 1, 1, PETAL, True),
            (3, 2, 2, 1, PETAL, True)],
            "south": [(0, 8, 8, 1, SGD, False), (0, 14, 8, 1, SGD, False)]}),
        B(-5, -7, -4, 10, 7, 8, SGD, "speckle", faces={"north": [(0, 0, 10, 1, SGL, False)]})]),
    P("head", (0, 2, 0), [B(-3, -8, -3, 6, 8, 6, MASK, "plain", faces={"north": [
        (1, 1, 1, 6, MASKD, False), (4, 1, 1, 6, MASKD, False), (2, 7, 2, 1, MASKD, False),
        (2, 3, 1, 1, (70, 200, 186), True), (3, 3, 1, 1, (70, 200, 186), True)]})], parent="body"),
    P("antler_l", (-2, -5, 0), [B(-0.5, -9, -0.5, 1, 9, 1, ANT, "plain"), B(-3.5, -6, -0.5, 3, 1, 1, ANT, "plain"),
        B(-3.5, -9, -0.5, 1, 3, 1, ANT, "plain"), B(0.5, -8, -0.5, 2, 1, 1, ANT, "plain")], parent="head", rot=(0, 0, -0.45)),
    P("antler_r", (2, -5, 0), [B(-0.5, -9, -0.5, 1, 9, 1, ANT, "plain"), B(0.5, -6, -0.5, 3, 1, 1, ANT, "plain"),
        B(2.5, -9, -0.5, 1, 3, 1, ANT, "plain"), B(-2.5, -8, -0.5, 2, 1, 1, ANT, "plain")], parent="head", rot=(0, 0, 0.45)),
    P("arm_l", (-4, 4, 0), [B(-2, 0, -4, 2, 16, 8, SG, "speckle", faces={
        "west": [(0, 4, 8, 1, SGL, False), (0, 8, 8, 1, SGL, False), (0, 12, 8, 1, SGL, False)],
        "east": [(0, 4, 8, 1, SGD, False), (0, 10, 8, 1, SGD, False)]})], parent="body", rot=(0, 0, 0.55)),
    P("arm_r", (4, 4, 0), [B(0, 0, -4, 2, 16, 8, SG, "speckle", faces={
        "east": [(0, 4, 8, 1, SGL, False), (0, 8, 8, 1, SGL, False), (0, 12, 8, 1, SGL, False)],
        "west": [(0, 4, 8, 1, SGD, False), (0, 10, 8, 1, SGD, False)]})], parent="body", rot=(0, 0, -0.55)),
])


# ----------------------------------------------------------------------------------------------
# Texture packing and painting
# ----------------------------------------------------------------------------------------------
def uv_size(b):
    w, h, d = (max(1, int(round(v))) for v in b["s"])
    return 2 * (w + d), d + h, (w, h, d)


def pack(spec):
    size = spec["tex"]
    boxes = [(p, b) for p in spec["parts"] for b in p["boxes"]]
    order = sorted(range(len(boxes)), key=lambda i: -uv_size(boxes[i][1])[1])
    x = y = row = 0
    for i in order:
        bw, bh, _ = uv_size(boxes[i][1])
        if x + bw > size:
            x, y, row = 0, y + row, 0
        boxes[i][1]["uv"] = (x, y)
        x += bw
        row = max(row, bh)
    if y + row > size:
        raise SystemExit(f"texture {size} too small for {spec}")
    return boxes


def faces(u, v, w, h, d):
    return {"top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d), "east": (u, v + d, d, h),
            "north": (u + d, v + d, w, h), "west": (u + d + w, v + d, d, h), "south": (u + 2 * d + w, v + d, w, h)}


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def paint(kind, spec):
    size = spec["tex"]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px, gx = img.load(), glow.load()
    rng = random.Random(kind)
    for part, b in pack(spec):
        _, _, (w, h, d) = uv_size(b)
        u, v = b["uv"]
        for fname, (fx, fy, fw, fh) in faces(u, v, w, h, d).items():
            light = {"top": 1.12, "bottom": 0.78, "north": 1.0, "south": 0.92, "east": 0.95, "west": 0.95}[fname]
            for yy in range(fh):
                for xx in range(fw):
                    c = b["base"]
                    r = rng.random()
                    if b["pat"] == "noise":
                        c = shade(c, 0.92 + 0.16 * r)
                    elif b["pat"] == "speckle":
                        c = shade(c, 1.18 if r < 0.12 else (0.86 if r > 0.9 else 1.0))
                    elif b["pat"] == "stripes":
                        c = shade(c, 0.88 if (yy // 2) % 2 else 1.04)
                    elif b["pat"] == "patches":
                        n = (hash((part["name"], fname, xx // 3, yy // 3)) % 7)
                        c = b["dark"] if n == 0 else ((206, 152, 150) if n == 1 else shade(c, 0.95 + 0.1 * r))
                    elif b["pat"] == "cracks":
                        c = shade(c, 0.9 + 0.2 * r)
                    c = shade(c, light)
                    px[fx + xx, fy + yy] = c + (255,)
                    if b["glow"]:
                        gx[fx + xx, fy + yy] = b["base"] + (255,)
            if b["pat"] == "cracks" and b.get("dark"):  # glowing cyan fissures, the Twisted Warden's signature
                for _ in range(max(1, fw * fh // 40)):
                    cx, cy = rng.randrange(fw), rng.randrange(fh)
                    for _ in range(rng.randint(3, 7)):
                        if 0 <= cx < fw and 0 <= cy < fh:
                            px[fx + cx, fy + cy] = b["dark"] + (255,)
                            gx[fx + cx, fy + cy] = b["dark"] + (255,)
                        cx += rng.choice((-1, 0, 1)); cy += 1
            for (ax, ay, aw, ah, col, g) in b["faces"].get(fname, []):
                for yy in range(ah):
                    for xx in range(aw):
                        X, Y = fx + ax + xx, fy + ay + yy
                        if fx <= X < fx + fw and fy <= Y < fy + fh:
                            px[X, Y] = col + (255,)
                            if g:
                                gx[X, Y] = col + (255,)
    (ASSETS / "entity").mkdir(parents=True, exist_ok=True)
    img.save(ASSETS / "entity" / f"{kind}.png")
    glow.save(ASSETS / "entity" / f"{kind}_glow.png")


def egg(kind, spec):
    """Spawn-egg sprite in the vanilla silhouette, creature palette with spots."""
    base, spot = spec["egg"]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    rng = random.Random(kind + "egg")
    for y in range(16):
        for x in range(16):
            nx, ny = (x - 7.5) / 5.6, (y - 8.6) / 7.0
            if ny < 0:
                nx *= 1 + 0.35 * (-ny)
            r2 = nx * nx + ny * ny
            if r2 <= 1.0:
                edge = r2 > 0.78
                c = shade(base, 0.55) if edge else shade(base, 1.08 - 0.25 * ((x + y) / 30))
                if not edge and rng.random() < 0.18:
                    c = spot
                if 3 < x < 7 and 3 < y < 6 and not edge:
                    c = shade(c, 1.25)
                px[x, y] = c + (255,)
    img.save(ASSETS / "item" / f"{kind}_spawn_egg.png")


# ----------------------------------------------------------------------------------------------
# Java generation
# ----------------------------------------------------------------------------------------------
def f(v):
    return f"{float(v)}f"


def java():
    out = ["package dev.logan.entersift.client;", "",
           "import net.minecraft.client.model.geom.PartPose;",
           "import net.minecraft.client.model.geom.builders.CubeListBuilder;",
           "import net.minecraft.client.model.geom.builders.LayerDefinition;",
           "import net.minecraft.client.model.geom.builders.MeshDefinition;",
           "import net.minecraft.client.model.geom.builders.PartDefinition;", "",
           "/** GENERATED by tools/creatures.py — edit the specs there, not this file. */",
           "public final class SiftModelDefs {", "    private SiftModelDefs() {}", ""]
    for kind, spec in SPECS.items():
        pack(spec)
        out.append(f"    public static LayerDefinition {camel(kind)}() {{")
        out.append("        MeshDefinition mesh = new MeshDefinition();")
        out.append("        PartDefinition root = mesh.getRoot();")
        for p in spec["parts"]:
            parent = "root" if not p["parent"] else "p_" + p["parent"]
            cubes = "CubeListBuilder.create()"
            for b in p["boxes"]:
                (x, y, z), (w, h, d) = b["o"], uv_size(b)[2]
                cubes += f".texOffs({b['uv'][0]}, {b['uv'][1]}).addBox({f(x)}, {f(y)}, {f(z)}, {f(w)}, {f(h)}, {f(d)})"
            px_, py_, pz_ = p["pivot"]  # specs use absolute pivots; Minecraft wants parent-relative
            if p["parent"]:
                qx, qy, qz = next(q for q in spec["parts"] if q["name"] == p["parent"])["pivot"]
                px_, py_, pz_ = px_ - qx, py_ - qy, pz_ - qz
            rx, ry, rz = p["rot"]
            pose = f"PartPose.offsetAndRotation({f(px_)}, {f(py_)}, {f(pz_)}, {f(rx)}, {f(ry)}, {f(rz)})"
            out.append(f"        PartDefinition p_{p['name']} = {parent}.addOrReplaceChild(\"{p['name']}\", {cubes}, {pose});")
        out.append(f"        return LayerDefinition.create(mesh, {spec['tex']}, {spec['tex']});")
        out.append("    }")
        paths = []
        for p in spec["parts"]:
            chain, cur = [p["name"]], p
            while cur["parent"]:
                cur = next(q for q in spec["parts"] if q["name"] == cur["parent"])
                chain.insert(0, cur["name"])
            paths.append("{" + ", ".join(f'"{c}"' for c in chain) + "}")
        out.append(f"    public static final String[][] {kind.upper()}_PARTS = {{{', '.join(paths)}}};")
        out.append("")
    out.append("}")
    JAVA.parent.mkdir(parents=True, exist_ok=True)
    JAVA.write_text("\n".join(out) + "\n")


def camel(s):
    a = s.split("_")
    return a[0] + "".join(x.title() for x in a[1:])


def main():
    for kind, spec in SPECS.items():
        paint(kind, spec)
        egg(kind, spec)
    java()
    print("creatures:", ", ".join(SPECS))


if __name__ == "__main__":
    main()
