#!/usr/bin/env python3
"""Original synthesized rift audio, standard library only. CI encodes these WAVs to mono Vorbis.
The 4-second hum uses integer cycles (including modulation) for a continuous loop seam.
This is newly authored sound design, not an extracted/reference recording.
"""
import array
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
SR = 22050


def samples(kind):
    duration = 4 if kind == "hum" else 1
    result = array.array("h")
    for i in range(duration * SR):
        t = i / SR
        if kind == "hum":
            pulse = 0.8 + 0.2 * math.cos(2 * math.pi * t / 4)
            x = pulse * (0.28 * math.sin(2 * math.pi * 55 * t)
                + 0.13 * math.sin(2 * math.pi * 82.5 * t + 0.4 * math.sin(2 * math.pi * t / 4))
                + 0.04 * math.sin(2 * math.pi * 330 * t + math.sin(2 * math.pi * t)))
        else:
            envelope = min(1, t * 100) * (1 - t) ** 3
            x = envelope * (0.42 * math.sin(2 * math.pi * (240 * t - 90 * t * t))
                + 0.16 * math.sin(2 * math.pi * 660 * t + 2 * math.sin(2 * math.pi * 47 * t)))
        result.append(round(x * 32767))
    if sys.byteorder != "little":
        result.byteswap()
    return result.tobytes()


def main():
    for kind in ("hum", "growth"):
        path = ROOT / f"art/audio/rift/{kind}.wav"
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(SR)
            out.writeframes(samples(kind))
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
