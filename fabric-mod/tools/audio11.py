#!/usr/bin/env python3
"""0.11 audio (deterministic, original, synthesised from scratch; no samples).

Writes 16-bit mono WAVs under art/audio/ (CI encodes every WAV to OGG under
assets/entersift/sounds/ with the same relative path) and assets/entersift/sounds.json.

* music/sift_1, music/sift_2: two dreamy Sift tracks (pads, FM bells, sub, sparkles; lydian/dorian).
* ambient/sift_loop: airy wind + shimmer bed (seamless loop), ambient/sift_mood, ambient/sift_add_1..3.
* entity/<kind>/{ambient1,ambient2,hurt1,hurt2,death}: a voice for every Sift creature.
"""
import json, math, wave
from pathlib import Path
import numpy as np
from scipy.signal import lfilter, butter

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art/audio"
ASSETS = ROOT / "src/main/resources/assets/entersift"
SR = 22050
rng = np.random.default_rng(1117)


def save(rel, x, peak=0.89, trim=True):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    if trim:  # drop the inaudible reverb tail
        loud = np.nonzero(np.abs(x) > 0.004)[0]
        end = min(len(x), (loud[-1] if len(loud) else len(x)) + int(0.05 * SR))
        x = x[:end]
        f = min(len(x) // 4, int(0.04 * SR)); x[-f:] *= np.linspace(1, 0, f)
    p = ART / f"{rel}.wav"
    p.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def t_(sec): return np.arange(int(sec * SR)) / SR


def env(n, a, d, s, r, sustain_level=0.7):
    """ADSR in seconds over n samples."""
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, n - A - D - R)
    e = np.concatenate([np.linspace(0, 1, max(A, 1)), np.linspace(1, sustain_level, max(D, 1)),
                        np.full(S, sustain_level), np.linspace(sustain_level, 0, max(R, 1))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def sweep(f0, f1, sec, curve=1.0, vib=0.0, vib_rate=5.0):
    t = t_(sec)
    f = f0 + (f1 - f0) * (t / sec) ** curve
    f = f * (1 + vib * np.sin(2 * np.pi * vib_rate * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def lp(x, fc, order=2):
    b, a = butter(order, min(0.99, fc / (SR / 2)), "low"); return lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = butter(order, max(0.001, fc / (SR / 2)), "high"); return lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), min(0.99, hi / (SR / 2))], "band"); return lfilter(b, a, x)


def noise(sec): return rng.standard_normal(int(sec * SR))


def reverb(x, mix=0.3, size=1.0):
    """Small Schroeder reverb: 4 combs + 2 allpasses."""
    out = np.zeros(len(x) + int(SR * 2.5 * size))
    xin = np.pad(x, (0, len(out) - len(x)))
    acc = np.zeros_like(out)
    for dms, g in [(29.7, 0.80), (37.1, 0.78), (41.1, 0.76), (43.7, 0.74)]:
        d = int(dms * size * SR / 1000)
        b = np.zeros(d + 1); b[0] = 1
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g
        acc += lfilter(b, a, xin)
    for dms, g in [(5.0, 0.7), (1.7, 0.7)]:
        d = int(dms * SR / 1000)
        b = np.zeros(d + 1); b[0] = -g; b[d] = 1
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g
        acc = lfilter(b, a, acc)
    return xin * (1 - mix) + acc / 4 * mix


def mix_into(buf, x, at):
    i = int(at * SR)
    if i >= len(buf): return
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n]


def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


# ------------------------------------------------------------------ instruments

def pad(freqs, sec, bright=0.35):
    t = t_(sec); out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.004, 0.0, 0.0045):
            ff = f * (1 + det)
            for h in range(1, 6):
                out += np.sin(2 * np.pi * ff * h * t + rng.random() * 6.28) * (bright ** (h - 1)) / h
    out = lp(out, 2200)
    return out * env(len(t), sec * 0.35, 0.1, 0, sec * 0.45, 1.0)


def bell(f, sec=2.2, ratio=3.5, index=2.4):
    t = t_(sec)
    e = np.exp(-t * 2.6)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t * 4.0)
    return np.sin(2 * np.pi * f * t + mod) * e * np.minimum(1, t * 400)


def pluck(f, sec=1.2):
    """Soft marimba-ish pluck."""
    t = t_(sec)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 18)) * np.exp(-t * 5.5)
    return x * np.minimum(1, t * 600)


def formant_voice(f, sec, vowel="a", vib=0.012):
    """Breathy sung vowel: pulse train through three formant band-passes."""
    t = t_(sec)
    ph = np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5.2 * t))) / SR
    src = np.zeros_like(t)
    for h in range(1, 30):
        src += np.sin(2 * np.pi * h * ph) / h ** 1.2
    src += 0.05 * rng.standard_normal(len(t))
    F = {"a": [(800, 1150), (1150, 1500), (2800, 3200)], "o": [(450, 650), (800, 1000), (2800, 3100)],
         "u": [(300, 450), (700, 900), (2400, 2700)], "e": [(400, 560), (1900, 2200), (2600, 2900)]}[vowel]
    y = sum(bp(src, lo, hi) * g for (lo, hi), g in zip(F, (1.0, 0.6, 0.25)))
    return y


# ------------------------------------------------------------------ music

def track(seed, bpm, chords, bars_per_chord, cycles, scale, bell_density, voice=False):
    global rng
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = beat * 4
    total = len(chords) * bars_per_chord * bar * cycles + 6
    buf = np.zeros(int(total * SR))
    at = 1.0
    for c in range(cycles):
        for chord in chords:
            dur = bars_per_chord * bar
            mix_into(buf, pad([midi(n) for n in chord], dur + 1.5, 0.3) * 0.16, at)
            mix_into(buf, sweep(midi(chord[0] - 12), midi(chord[0] - 12), dur + 0.8) * env(int((dur + 0.8) * SR), 0.6, 0.2, 0, 1.0, 0.8) * 0.12, at)
            steps = int(bars_per_chord * 8)
            for s in range(steps):
                if rng.random() < bell_density:
                    n = chord[rng.integers(len(chord))] + 12 * rng.integers(1, 3)
                    if rng.random() < 0.3: n = scale[rng.integers(len(scale))] + 72
                    mix_into(buf, bell(midi(n), 2.4) * (0.05 + 0.04 * rng.random()), at + s * beat / 2)
                if c > 0 and rng.random() < bell_density * 0.5:
                    n = scale[rng.integers(len(scale))] + 60
                    mix_into(buf, pluck(midi(n)) * 0.06, at + s * beat / 2 + beat / 4)
            if voice and c % 2 == 1:
                mix_into(buf, formant_voice(midi(chord[2] + 12), dur * 0.9, "o") * env(int(dur * 0.9 * SR), dur * 0.3, 0.2, 0, dur * 0.4, 1) * 0.035, at + 0.3)
            for k in range(int(dur * 2)):  # high sparkles
                if rng.random() < 0.25:
                    mix_into(buf, bell(midi(scale[rng.integers(len(scale))] + 96), 0.9, 2.0, 1.2) * 0.012, at + k * 0.5 + rng.random() * 0.3)
            at += dur
    buf = reverb(buf, 0.42, 1.3)
    fade = int(4 * SR)
    buf[:fade] *= np.linspace(0, 1, fade); buf[-fade:] *= np.linspace(1, 0, fade)
    return buf


def music():
    # Track 1: "Veil Lullaby", D lydian, 70 bpm.
    save("music/sift_1", track(11, 70, [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66, 68], [57, 61, 64, 69]], 2, 3,
                               [62, 64, 66, 68, 69, 71, 73], 0.34), 0.8)
    # Track 2: "Ichor Tides", E dorian, 60 bpm, with a distant sung line (the Singer's echo).
    save("music/sift_2", track(22, 60, [[52, 59, 62, 66], [57, 60, 64, 67], [50, 57, 62, 66], [55, 59, 62, 69]], 2, 3,
                               [64, 66, 67, 69, 71, 73, 74], 0.26, voice=True), 0.8)


# ------------------------------------------------------------------ ambience

def ambience():
    global rng
    rng = np.random.default_rng(33)
    sec = 16.0
    n = int(sec * SR)
    t = t_(sec)
    # Wind: band-limited noise with slow periodic swells (period divides the loop length -> seamless).
    w = bp(noise(sec + 2), 180, 900)[-n:]
    w *= 0.55 + 0.45 * np.sin(2 * np.pi * t / sec * 2) ** 2
    hiss = hp(noise(sec + 2), 3000)[-n:] * 0.05 * (0.6 + 0.4 * np.sin(2 * np.pi * t / sec * 3 + 1))
    # Shimmer: soft sine clusters whose frequencies complete whole cycles in the loop.
    sh = np.zeros(n)
    for f in (587.33, 880.0, 1174.66, 1318.5):
        ff = round(f * sec) / sec
        sh += np.sin(2 * np.pi * ff * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / sec * (1 + (f % 3)) + f))
    loop = w * 0.8 + hiss + sh * 0.025
    # Cross-fade the tail into the head to hide any residual seam.
    xf = int(0.5 * SR)
    loop[:xf] = loop[:xf] * np.linspace(0, 1, xf) + loop[-xf:] * np.linspace(1, 0, xf)
    save("ambient/sift_loop", loop[:-xf], 0.5, trim=False)
    # Mood: a low, far-away hum with a rising shimmer.
    mood = sweep(55, 49, 5.0) * env(int(5 * SR), 1.5, 0.5, 0, 2.5, 0.8) * 0.6 + bell(midi(86), 5.0, 2.0, 1.0) * 0.2
    save("ambient/sift_mood", reverb(mood, 0.5, 1.4), 0.6)
    # Additions: wind chimes / glassy tinkles.
    for i in range(3):
        buf = np.zeros(int(3.5 * SR))
        for k in range(4 + i):
            mix_into(buf, bell(midi([81, 84, 86, 88, 91, 93][rng.integers(6)]), 2.5, 2.8, 1.6) * (0.5 + 0.5 * rng.random()), 0.1 + k * (0.18 + 0.2 * rng.random()))
        save(f"ambient/sift_add_{i + 1}", reverb(buf, 0.45, 1.1), 0.5)


# ------------------------------------------------------------------ creatures

def blub():
    def bloop(f0, f1, sec): return sweep(f0, f1, sec, 0.6, 0.06, 18) * env(int(sec * SR), 0.01, 0.05, 0, sec * 0.5, 0.8)
    a = np.concatenate([bloop(300, 520, 0.16), np.zeros(int(0.06 * SR)), bloop(360, 640, 0.14)])
    b = bloop(420, 260, 0.22)
    h = bloop(700, 380, 0.14) + lp(noise(0.14), 2500) * env(int(0.14 * SR), 0.002, 0.03, 0, 0.1, 0.4) * 0.3
    d = np.concatenate([bloop(500, 150, 0.4), lp(noise(0.12), 1200) * np.exp(-t_(0.12) * 30) * 0.8])
    return a, b, h, bloop(820, 450, 0.12), d


def clicks(n, rate, pitch):
    buf = np.zeros(int(n * SR))
    for k in range(int(n * rate)):
        c = bp(noise(0.02), pitch * 0.7, pitch * 1.4) * np.exp(-t_(0.02) * 200)
        mix_into(buf, c, k / rate + rng.random() * 0.02)
    return buf


def sculker(small=False):
    p = 2.0 if small else 1.0
    growl = lambda sec, f0, f1: lp(sweep(f0 * p, f1 * p, sec, 1, 0.08, 23) * (1 + 0.6 * np.sign(np.sin(2 * np.pi * 31 * p * t_(sec)))), 900 * p) * env(int(sec * SR), 0.05, 0.1, 0, sec * 0.4, 0.8)
    a = clicks(0.7, 14, 1800 * p) * 0.6 + growl(0.7, 70, 60) * 0.5
    b = clicks(0.5, 22, 2400 * p) * 0.7
    h = bp(noise(0.25), 400 * p, 2600 * p) * env(int(0.25 * SR), 0.005, 0.05, 0, 0.18, 0.6) + growl(0.25, 120, 80) * 0.6
    h2 = clicks(0.2, 40, 2000 * p) + growl(0.2, 140, 90) * 0.5
    d = growl(1.1, 110, 35) + clicks(1.1, 8, 1500 * p) * 0.4
    return a, b, h, h2, d


def antlerling():
    hoo = lambda f, sec: formant_voice(f, sec, "u", 0.02) * env(int(sec * SR), 0.08, 0.1, 0, sec * 0.5, 0.8)
    knock = lambda: (np.sin(2 * np.pi * 420 * t_(0.12)) + 0.5 * np.sin(2 * np.pi * 1130 * t_(0.12))) * np.exp(-t_(0.12) * 40)
    a = np.concatenate([hoo(330, 0.5), np.zeros(int(0.1 * SR)), hoo(294, 0.6)])
    b = np.concatenate([knock(), np.zeros(int(0.1 * SR)), knock() * 0.7])
    h = formant_voice(520, 0.25, "e", 0.05) * env(int(0.25 * SR), 0.01, 0.05, 0, 0.15, 0.8)
    return a, b, h, formant_voice(600, 0.2, "a", 0.06) * env(int(0.2 * SR), 0.01, 0.05, 0, 0.12, 0.8), hoo(260, 1.2) * np.linspace(1, 0.2, int(1.2 * SR))


def drift_jelly():
    hum = lambda f0, f1, sec: reverb(sweep(f0, f1, sec, 1, 0.01, 0.7) * env(int(sec * SR), sec * 0.3, 0.1, 0, sec * 0.5, 0.9) + 0.3 * sweep(f0 * 2.01, f1 * 2.01, sec) * env(int(sec * SR), sec * 0.4, 0.1, 0, sec * 0.5, 0.6), 0.5, 1.6)
    return hum(120, 180, 2.2), hum(160, 110, 2.0), hum(260, 170, 0.6), hum(300, 200, 0.5), hum(180, 45, 3.0)


def licker():
    slurp = lambda sec, lo, hi: bp(noise(sec), lo, hi) * env(int(sec * SR), sec * 0.2, 0.05, 0, sec * 0.5, 0.8) * (1 + 0.8 * np.sin(2 * np.pi * 9 * t_(sec)))
    flick = lambda: bp(noise(0.08), 1500, 5000) * np.exp(-t_(0.08) * 60)
    a = np.concatenate([slurp(0.45, 300, 1800), flick()])
    b = slurp(0.35, 500, 2600) + np.pad(flick(), (int(0.2 * SR), int(0.35 * SR)))[:int(0.35 * SR)]
    yelp = lambda f0, f1: formant_voice(f0, 0.22, "e", 0.08) * env(int(0.22 * SR), 0.005, 0.05, 0, 0.14, 0.8) + 0.3 * sweep(f0, f1, 0.22)
    d = np.concatenate([yelp(500, 200), slurp(0.8, 150, 900) * np.linspace(1, 0, int(0.8 * SR))])
    return a, b, yelp(560, 380), yelp(620, 420), d


def overseer():
    whine = lambda f0, f1, sec: sweep(f0, f1, sec, 1, 0.02, 7) * sweep(f0 * 1.51, f1 * 1.51, sec) * env(int(sec * SR), sec * 0.2, 0.1, 0, sec * 0.4, 0.8)
    glitch = lambda sec: np.sign(np.sin(2 * np.pi * 180 * t_(sec))) * (rng.random(int(sec * SR)) > 0.4) * env(int(sec * SR), 0.005, 0.05, 0, sec * 0.5, 0.7)
    return (reverb(whine(700, 760, 1.2), 0.4), reverb(whine(900, 640, 0.9), 0.4), lp(glitch(0.25), 3000) + whine(1200, 800, 0.25),
            lp(glitch(0.2), 2500), reverb(whine(900, 60, 1.6), 0.5))


def warden():
    roar = lambda f0, f1, sec: lp(sweep(f0, f1, sec, 1, 0.05, 11) * (1 + np.sin(2 * np.pi * 37 * t_(sec))) + 0.6 * lp(noise(sec), 500), 700) * env(int(sec * SR), 0.1, 0.2, 0, sec * 0.4, 0.9)
    heart = lambda: np.concatenate([np.sin(2 * np.pi * 50 * t_(0.12)) * np.exp(-t_(0.12) * 25), np.zeros(int(0.12 * SR)), 0.7 * np.sin(2 * np.pi * 45 * t_(0.12)) * np.exp(-t_(0.12) * 25)])
    return (np.concatenate([heart(), np.zeros(int(0.4 * SR)), heart()]), roar(60, 50, 1.4) * 0.8, roar(90, 55, 0.6), roar(110, 60, 0.5), reverb(roar(80, 25, 2.6), 0.4, 1.5))


def note_bird():
    notes = [76, 79, 81, 83, 86, 88]
    chirp = lambda n, sec=0.09: sweep(midi(n), midi(n + 2), sec, 0.5) * env(int(sec * SR), 0.005, 0.02, 0, sec * 0.5, 0.7)
    a = np.concatenate([chirp(notes[i]) if i >= 0 else np.zeros(int(0.05 * SR)) for i in (0, -1, 2, -1, 4, 3)])
    b = np.concatenate([chirp(n, 0.07) for n in (88, 86, 83)])
    sq = lambda f0, f1: sweep(f0, f1, 0.18, 1, 0.1, 30) * (1 + 0.5 * np.sign(np.sin(2 * np.pi * 70 * t_(0.18)))) * env(int(0.18 * SR), 0.005, 0.04, 0, 0.1, 0.7)
    return a, b, sq(1800, 1200), sq(2000, 1500), np.concatenate([chirp(n, 0.12) for n in (88, 83, 79, 74, 69)]) * np.linspace(1, 0.3, int(0.6 * SR))


def singer():
    def chord(ns, sec, vowel):
        return sum(formant_voice(midi(n), sec, vowel) for n in ns) * env(int(sec * SR), sec * 0.3, 0.1, 0, sec * 0.4, 0.9)
    return (reverb(chord([69, 76], 1.6, "a"), 0.5, 1.4), reverb(chord([71, 74, 78], 1.4, "o"), 0.5, 1.4),
            reverb(chord([70, 71], 0.4, "e"), 0.3), reverb(chord([73, 74], 0.35, "a"), 0.3),
            reverb(chord([69, 72, 76], 2.4, "o") * np.linspace(1, 0.1, int(2.4 * SR)), 0.6, 1.6))


KINDS = {"blub": blub, "sculker": sculker, "sculkling": lambda: sculker(True), "antlerling": antlerling,
         "drift_jelly": drift_jelly, "licker": licker, "overseer": overseer, "twisted_warden": warden,
         "note_bird": note_bird, "singer": singer}


def creatures():
    global rng
    for i, (kind, fn) in enumerate(KINDS.items()):
        rng = np.random.default_rng(500 + i)
        a1, a2, h1, h2, d = fn()
        for name, x in (("ambient1", a1), ("ambient2", a2), ("hurt1", h1), ("hurt2", h2), ("death", d)):
            x = np.asarray(x, dtype=np.float64)
            fade = min(len(x) // 4, int(0.02 * SR))
            x[-fade:] *= np.linspace(1, 0, fade)
            save(f"entity/{kind}/{name}", x, 0.85)


def sounds_json():
    p = ASSETS / "sounds.json"
    data = json.loads(p.read_text()) if p.exists() else {}
    data["music.sift"] = {"sounds": [{"name": "entersift:music/sift_1", "stream": True}, {"name": "entersift:music/sift_2", "stream": True}]}
    data["ambient.sift.loop"] = {"sounds": [{"name": "entersift:ambient/sift_loop"}]}
    data["ambient.sift.mood"] = {"sounds": [{"name": "entersift:ambient/sift_mood"}], "subtitle": "subtitles.entersift.ambient.sift.mood"}
    data["ambient.sift.additions"] = {"sounds": [{"name": f"entersift:ambient/sift_add_{i}", "volume": 0.6} for i in (1, 2, 3)]}
    for kind in KINDS:
        base = f"entersift:entity/{kind}/"
        data[f"entity.{kind}.ambient"] = {"sounds": [base + "ambient1", base + "ambient2"], "subtitle": f"subtitles.entersift.entity.{kind}.ambient"}
        data[f"entity.{kind}.hurt"] = {"sounds": [base + "hurt1", base + "hurt2"], "subtitle": f"subtitles.entersift.entity.{kind}.hurt"}
        data[f"entity.{kind}.death"] = {"sounds": [base + "death"], "subtitle": f"subtitles.entersift.entity.{kind}.death"}
    p.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    music(); ambience(); creatures(); sounds_json()
    total = sum(f.stat().st_size for f in ART.rglob("*.wav"))
    print(f"audio written: {sum(1 for _ in ART.rglob('*.wav'))} wavs, {total / 1e6:.1f} MB")
