#!/usr/bin/env python3
"""0.8.0 ritual polish (idempotent): coloured light shafts on right-click, a flickering song
replay with tall beams, a finale where all eight beams rise together, and the ritual music."""
from pathlib import Path
F = Path(__file__).resolve().parents[1] / "src/main/resources/data/entersift/function"
COLORS = {"red": "1.0f,0.1f,0.13f", "orange": "1.0f,0.55f,0.16f", "yellow": "1.0f,0.9f,0.28f", "green": "0.4f,0.97f,0.55f",
          "cyan": "0.08f,0.94f,1.0f", "blue": "0.18f,0.32f,1.0f", "purple": "0.58f,0.2f,1.0f", "pink": "1.0f,0.43f,0.65f"}
NAMES = list(COLORS)
ORDER = [1, 3, 7, 6, 5, 2, 4, 8]

def beam(c, width, height, age):
    t = -width / 2
    return (f'summon minecraft:block_display ~0.5 ~1 ~0.5 {{Tags:["sift.beam","sift.beam_new"],block_state:{{id:"entersift:resonance_{c}"}},'
            f'brightness:{{block:15,sky:15}},view_range:8f,transformation:{{translation:[{t}f,0.0f,{t}f],scale:[{width}f,{height}f,{width}f],'
            f'left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}}}\n'
            f'scoreboard players set @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] sift.age {age}\n'
            f'tag @e[type=minecraft:block_display,tag=sift.beam_new,distance=..2] remove sift.beam_new\n')

for c, rgb in COLORS.items():
    # Right-click: a short coloured light shaft from the note block (lives ~1.5 s).
    (F / f"notes/shaft_{c}.mcfunction").write_text(
        beam(c, 0.14, 6.0, 130) +
        f"particle minecraft:dust{{color:[{rgb}],scale:1.6f}} ~0.5 ~2.5 ~0.5 0.06 1.4 0.06 0 24 normal\n"
        f"particle minecraft:end_rod ~0.5 ~1.2 ~0.5 0.1 0.1 0.1 0.04 4 normal\n")
    # Ritual replay: a tall, wide beam that rises out of the block.
    (F / f"notes/beam_{c}.mcfunction").write_text(
        beam(c, 0.42, 56.0, 0) + beam(c, 0.12, 80.0, 0) +
        f"particle minecraft:dust{{color:[{rgb}],scale:2.4f}} ~0.5 ~6 ~0.5 0.25 5 0.25 0 90 force\n"
        f"particle minecraft:end_rod ~0.5 ~1.5 ~0.5 0.3 0.3 0.3 0.12 16 force\n")

for i, pitch in enumerate(ORDER):
    c = NAMES[pitch - 1]
    pos = f"$(n{i}x).0 $(n{i}y).0 $(n{i}z).0"  # ".0" = exact block corner, not block-centred
    pitch_mult = 2 ** ((pitch - 5) / 12)
    (F / f"ritual/note_{i}.mcfunction").write_text(
        f"$execute positioned {pos} run playsound minecraft:block.note_block.chime ambient @a[distance=..48] ~ ~ ~ 0.8 {pitch_mult:.4f}\n"
        f"$execute positioned {pos} run function entersift:notes/{c}\n"
        f"$execute positioned {pos} run function entersift:notes/beam_{c}\n")
    (F / f"ritual/flicker_{i}.mcfunction").write_text(
        f"$execute positioned {pos} run function entersift:notes/{c}\n"
        f"$execute positioned {pos} run particle minecraft:dust{{color:[{COLORS[c]}],scale:1.4f}} ~0.5 ~1.1 ~0.5 0.3 0.05 0.3 0 10 normal\n")

finale = "".join(f"$execute positioned $(n{i}x).0 $(n{i}y).0 $(n{i}z).0 run function entersift:notes/beam_{NAMES[p - 1]}\n" for i, p in enumerate(ORDER))
(F / "ritual/finale.mcfunction").write_text(
    finale + "playsound minecraft:block.beacon.power_select ambient @a[distance=..64] ~ ~ ~ 2 0.6\n"
    "playsound minecraft:block.amethyst_block.resonate ambient @a[distance=..64] ~ ~ ~ 2 0.5\n")

begin = F / "ritual/begin.mcfunction"
text = begin.read_text()
if "entersift:ritual.song" not in text:
    text += "stopsound @a[distance=..96] record entersift:ritual.song\nplaysound entersift:ritual.song record @a[distance=..96] ~ ~ ~ 1.5 1\n"
    begin.write_text(text)

# Timeline: each note flickers twice after it sings; all eight beams rise together at 232, then the threshold forms.
tick = F / "ritual/tick.mcfunction"
lines = [l for l in tick.read_text().splitlines() if "ritual/flicker_" not in l and "ritual/finale" not in l]
extra = []
for i in range(8):
    t = 60 + 24 * i
    for d in (8, 16):
        extra.append(f"execute if score @s sift.age matches {t + d} run function entersift:ritual/flicker_{i} with entity @s data")
extra.append("execute if score @s sift.age matches 232 run function entersift:ritual/finale with entity @s data")
tick.write_text("\n".join(lines + extra) + "\n")
print("phase8: shafts, beams, replay flicker, finale, song")
