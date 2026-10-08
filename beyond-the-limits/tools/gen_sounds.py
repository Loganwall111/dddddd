#!/usr/bin/env python3
"""Synthesises every sound effect Beyond the Limits ships, as real Ogg Vorbis files.

Nothing here is a sample or a placeholder: each sound is built out of oscillators, shaped noise and
filters, so the mod is self-contained, the files are small, and the repository can regenerate them
byte-for-byte. The palette is deliberately narrow — low drones, shaped noise, a few struck
partials — because the mod's horror is environmental rather than jump-scare, and a narrow palette
is what makes a Backrooms hum recognisable after one encounter.

Requires: numpy, soundfile (pip install numpy soundfile).
"""
import os
import numpy as np
import soundfile as sf

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                   "src", "main", "resources", "assets", "beyondthelimits", "sounds")

rng = np.random.default_rng(20261008)


# ---------------------------------------------------------------------------------------
# building blocks
# ---------------------------------------------------------------------------------------


def t(seconds):
    return np.linspace(0.0, seconds, int(RATE * seconds), endpoint=False)


def noise(seconds):
    return rng.normal(0.0, 1.0, int(RATE * seconds))


def sine(freq, seconds, phase=0.0):
    return np.sin(2 * np.pi * freq * t(seconds) + phase)


def sweep(start, end, seconds, curve="exp"):
    time = t(seconds)
    if curve == "exp":
        freq = start * np.power(max(1e-6, end / start), time / max(1e-6, time[-1]))
    else:
        freq = np.linspace(start, end, time.size)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return np.sin(phase)


def adsr(seconds, attack=0.01, decay=0.1, sustain=0.7, release=0.2):
    time = t(seconds)
    total = time[-1] if time.size else 1.0
    env = np.ones_like(time)
    a = max(1, int(RATE * attack))
    d = max(1, int(RATE * decay))
    r = max(1, int(RATE * release))
    env[:a] = np.linspace(0, 1, a)
    if d < time.size:
        env[a:a + d] = np.linspace(1, sustain, min(d, time.size - a))
    env[a + d:] = sustain
    if r < time.size:
        env[-r:] *= np.linspace(1, 0, r)
    return env


def lowpass(signal, cutoff, resonance=0.0):
    """One-pole lowpass; cheap, and it is the only filter this palette needs."""
    alpha = 1.0 - np.exp(-2.0 * np.pi * cutoff / RATE)
    out = np.zeros_like(signal)
    previous = 0.0
    for index in range(signal.size):
        previous += alpha * (signal[index] - previous)
        out[index] = previous
    if resonance > 0.0:
        out = out + resonance * (signal - out)
    return out


def highpass(signal, cutoff):
    return signal - lowpass(signal, cutoff)


def bandpass(signal, low, high):
    return lowpass(highpass(signal, low), high)


def ring(signal, freq, depth=0.6):
    return signal * (1.0 - depth + depth * sine(freq, signal.size / RATE))


def bitcrush(signal, bits=6, downsample=4):
    steps = 2 ** bits
    crushed = np.round(signal * steps) / steps
    if downsample > 1:
        hold = np.copy(crushed)
        for index in range(0, crushed.size, downsample):
            hold[index:index + downsample] = crushed[index]
        crushed = hold
    return crushed


def reverb(signal, decay=0.4, length=0.6):
    """A short convolutional tail built from decaying noise: enough to place a sound in a room."""
    tail = noise(length) * np.exp(-np.linspace(0, 6, int(RATE * length)))
    tail = lowpass(tail, 3000)
    wet = np.convolve(signal, tail * decay)[:signal.size]
    return signal + wet


def normalise(signal, peak=0.85):
    maximum = np.max(np.abs(signal))
    if maximum < 1e-9:
        return signal
    return signal / maximum * peak


def mix(*layers):
    length = max(layer.size for layer in layers)
    total = np.zeros(length)
    for layer in layers:
        total[:layer.size] += layer
    return total


def pad_to(signal, seconds):
    target = int(RATE * seconds)
    if signal.size >= target:
        return signal[:target]
    return np.concatenate([signal, np.zeros(target - signal.size)])


def fade_edges(signal, seconds=0.01):
    fade = max(1, int(RATE * seconds))
    if signal.size > 2 * fade:
        signal[:fade] *= np.linspace(0, 1, fade)
        signal[-fade:] *= np.linspace(1, 0, fade)
    return signal


# ---------------------------------------------------------------------------------------
# the sounds
# ---------------------------------------------------------------------------------------


def rift_open():
    """A tear: air being pulled apart, then the drop on the other side."""
    rip = bandpass(noise(1.6), 400, 6000) * adsr(1.6, 0.02, 0.3, 0.5, 0.9)
    rise = sweep(60, 900, 1.4) * np.linspace(0, 0.7, t(1.4).size)
    fall = sweep(300, 40, 0.6) * np.linspace(0.6, 0, t(0.6).size)
    sub = lowpass(noise(1.6), 120) * adsr(1.6, 0.4, 0.4, 0.6, 0.6) * 0.8
    return reverb(normalise(mix(pad_to(rip, 1.6), pad_to(rise, 1.6), sub) + pad_to(fall, 1.6)), 0.5)


def rift_ambient():
    """The noise a tear makes when nobody is listening: two detuned drones and a slow heartbeat."""
    beat = 0.5 * (sine(52, 5.0) + sine(52.7, 5.0))
    air = bandpass(noise(5.0), 300, 2500) * 0.25
    pulse = np.zeros(int(RATE * 5.0))
    for centre in (0.6, 2.1, 3.6):
        start = int(RATE * centre)
        length = int(RATE * 0.5)
        pulse[start:start + length] += sine(38, 0.5) * np.exp(-np.linspace(0, 7, length))
    return normalise(lowpass(mix(beat, air, pulse * 0.5), 4000)) * 0.8


def reality_tear():
    """Something that should not move, moving."""
    scrape = bandpass(noise(1.2), 800, 9000) * adsr(1.2, 0.005, 0.05, 0.4, 1.0)
    scrape = ring(scrape, 33.0, 0.8)
    sub = lowpass(noise(1.2), 90) * adsr(1.2, 0.01, 0.2, 0.3, 0.8)
    crack = np.zeros(int(RATE * 1.2))
    crack[:int(RATE * 0.08)] = noise(0.08) * np.exp(-np.linspace(0, 12, int(RATE * 0.08)))
    return reverb(normalise(mix(scrape, sub * 0.9, crack)), 0.6)


def storm_start():
    """Pressure dropping, and something enormous clearing its throat."""
    wind = bandpass(noise(3.2), 120, 1200)
    env = np.linspace(0.1, 1.0, int(RATE * 3.2)) ** 2
    wind = wind * env
    rumble = lowpass(noise(3.2), 60) * np.linspace(0, 1.0, int(RATE * 3.2)) ** 3
    swell = sweep(30, 70, 3.2, "lin") * np.linspace(0, 0.4, int(RATE * 3.2))
    return reverb(normalise(mix(wind * 0.7, rumble, swell)), 0.4)


def storm_thunder():
    """A strike: one crack, then the ground answering for two seconds."""
    crack = noise(0.25) * np.exp(-np.linspace(0, 14, int(RATE * 0.25)))
    crack = lowpass(crack, 5000)
    rumble = lowpass(noise(2.4), 90) * np.exp(-np.linspace(0, 3.2, int(RATE * 2.4)))
    roll = lowpass(noise(2.4), 200) * np.exp(-np.linspace(0, 2.0, int(RATE * 2.4))) * 0.6
    return reverb(normalise(mix(pad_to(crack, 2.4) * 1.2, rumble, roll)), 0.7, 1.2)


def backrooms_hum():
    """The hum. Fluorescent ballast, a room tone, and one note that is almost a word."""
    ballast = 0.5 * (sine(120, 4.5) + 0.4 * sine(240, 4.5) + 0.2 * sine(360, 4.5))
    ballast = ring(ballast, 6.0, 0.25)
    room = lowpass(noise(4.5), 400) * 0.25
    almost = sine(78.4, 4.5) * (1.0 + 0.35 * sine(0.35, 4.5)) * 0.35
    return normalise(mix(ballast * 0.5, room, almost)) * 0.7


def backrooms_drone():
    """Something moving, several rooms away, that is too big for the corridor."""
    low = sine(31, 5.5) * (1.0 + 0.2 * sine(0.13, 5.5))
    grind = bandpass(noise(5.5), 80, 600) * (1.0 + 0.5 * sine(0.21, 5.5)) * 0.5
    shift = sweep(44, 33, 5.5, "lin") * 0.5
    return normalise(lowpass(mix(low, grind, shift), 1500)) * 0.85


def backrooms_step():
    """A footstep on damp carpet, from a direction you are not facing."""
    damp = lowpass(noise(0.35), 700) * np.exp(-np.linspace(0, 16, int(RATE * 0.35)))
    thud = sine(90, 0.35) * np.exp(-np.linspace(0, 20, int(RATE * 0.35)))
    return reverb(normalise(mix(damp, thud * 0.8)), 0.35, 0.3) * 0.7


def backrooms_chase():
    """The moment it decides. A rising, breathing, four-beat pulse."""
    length = 2.4
    pulse = np.zeros(int(RATE * length))
    for beat in range(4):
        start = int(RATE * beat * 0.55)
        body = bandpass(noise(0.5), 200, 3000) * np.exp(-np.linspace(0, 9, int(RATE * 0.5)))
        pulse[start:start + body.size] += body
    rise = sweep(70, 320, length) * np.linspace(0, 0.5, int(RATE * length))
    breath = bandpass(noise(length), 500, 4000) * (0.5 + 0.5 * sine(1.6, length)) * 0.35
    return normalise(mix(pulse * 1.2, rise, breath))


def observer_whisper():
    """Not words. The shape of words, at the volume of a thought."""
    base = bandpass(noise(2.6), 900, 4500)
    formant = base * (0.4 + 0.6 * np.abs(sine(3.1, 2.6)))
    formant *= (0.5 + 0.5 * sine(0.7, 2.6))
    formant = lowpass(formant, 5000) * 0.6
    tail = sweep(300, 120, 2.6) * 0.15
    return normalise(mix(formant, tail)) * 0.55


def corruption_whisper():
    """The ground itself, saying something."""
    wet = lowpass(bandpass(noise(2.8), 300, 2000), 2500) * (0.5 + 0.5 * sine(0.9, 2.8))
    gurgle = bandpass(noise(2.8), 120, 700) * (0.5 + 0.5 * np.sin(2 * np.pi * 3.3 * t(2.8) + 2 * np.sin(2 * np.pi * 0.4 * t(2.8))))
    return normalise(mix(wet * 0.8, gurgle * 0.7)) * 0.6


def signal_loop():
    """A transmission that has been repeating for longer than the world has existed."""
    length = 3.2
    out = np.zeros(int(RATE * length))
    pattern = [0.0, 0.25, 0.45, 0.9, 1.1, 1.5, 1.9, 2.2, 2.6]
    for start_time in pattern:
        start = int(RATE * start_time)
        tone = sine(880, 0.14) * np.exp(-np.linspace(0, 8, int(RATE * 0.14)))
        out[start:start + tone.size] += tone * 0.6
    hiss = bandpass(noise(length), 1000, 6000) * 0.25
    carrier = sine(440, length) * (0.3 + 0.3 * sine(0.8, length)) * 0.2
    return normalise(mix(out, hiss, carrier)) * 0.75


def signal_static():
    """Pure noise, band-limited to the shape of an old radio."""
    hiss = bandpass(noise(2.2), 600, 7000)
    crackle = np.zeros(int(RATE * 2.2))
    for _ in range(40):
        start = rng.integers(0, int(RATE * 2.1))
        length = int(RATE * 0.01)
        crackle[start:start + length] += rng.normal(0, 0.6, length)
    return normalise(mix(hiss * 0.7, crackle)) * 0.65


def black_sun_arrival():
    """A mass arriving: everything descends, and keeps descending."""
    length = 4.5
    descent = sweep(220, 18, length) * np.linspace(0.2, 1.0, int(RATE * length))
    sub = lowpass(noise(length), 50) * np.linspace(0, 1.2, int(RATE * length))
    light = bandpass(noise(length), 3000, 9000) * np.exp(-np.linspace(0, 4, int(RATE * length))) * 0.6
    beat = sine(24, length) * (0.5 + 0.5 * sine(0.7, length))
    return normalise(lowpass(mix(descent, sub, light, beat), 8000)) * 0.9


def codescape_glitch():
    """The world reading itself aloud, badly."""
    out = np.zeros(int(RATE * 1.6))
    for step in range(14):
        start = int(RATE * rng.uniform(0.0, 1.4))
        freq = float(rng.choice([220, 330, 440, 660, 880, 1320]))
        length = float(rng.uniform(0.02, 0.09))
        blip = sine(freq, length) * np.exp(-np.linspace(0, 12, sine(freq, length).size))
        out[start:start + blip.size] += blip * 0.5
    digital = bitcrush(out, bits=4, downsample=6)
    hiss = bandpass(noise(1.6), 2000, 9000) * 0.15
    return normalise(mix(digital, hiss)) * 0.7


def memory_chime():
    """A remembered thing settling into place: struck partials, no attack."""
    length = 2.8
    out = np.zeros(int(RATE * length))
    for start_time, base in ((0.0, 523.25), (0.35, 659.25), (0.75, 783.99), (1.3, 1046.5)):
        start = int(RATE * start_time)
        partial = np.zeros(int(RATE * 1.4))
        for multiplier, amplitude in ((1.0, 1.0), (2.0, 0.45), (3.01, 0.22), (4.7, 0.1)):
            partial += sine(base * multiplier, 1.4) * amplitude
        partial *= np.exp(-np.linspace(0, 4.5, partial.size)) * 0.35
        out[start:start + partial.size] += partial
    return normalise(reverb(out, 0.45, 0.8)) * 0.75


def guide_open():
    """Paper, and the small sound of being trusted with something."""
    paper = bandpass(noise(0.45), 1500, 8000) * np.exp(-np.linspace(0, 9, int(RATE * 0.45)))
    paper = ring(paper, 40.0, 0.4)
    close = lowpass(noise(0.45), 500) * np.exp(-np.linspace(0, 12, int(RATE * 0.45))) * 0.5
    return normalise(mix(paper, close)) * 0.7


def mirror_whisper():
    """Your own voice, played back slightly late by something that is not you."""
    forward = bandpass(noise(2.4), 700, 4000) * (0.4 + 0.6 * np.abs(sine(2.3, 2.4)))
    backward = forward[::-1] * 0.8
    blend = forward * 0.55 + backward * 0.45
    crack = np.zeros(int(RATE * 2.4))
    for centre in (0.5, 1.4):
        start = int(RATE * centre)
        length = int(RATE * 0.05)
        crack[start:start + length] += np.exp(-np.linspace(0, 10, length)) * 0.4
    return normalise(mix(blend, crack)) * 0.6


def mirror_crack():
    """A reflection failing structurally."""
    split = highpass(noise(0.7), 2500) * np.exp(-np.linspace(0, 8, int(RATE * 0.7)))
    shards = np.zeros(int(RATE * 0.9))
    for _ in range(9):
        start = rng.integers(0, int(RATE * 0.7))
        length = int(rng.integers(int(RATE * 0.01), int(RATE * 0.05)))
        shard = sine(float(rng.choice([1800, 2400, 3100, 4200, 5600])), length / RATE)
        envelope = np.exp(-np.linspace(0, 8, shard.size))
        shards[start:start + shard.size] += shard * envelope * 0.4
    return normalise(mix(split, shards)) * 0.75


def signal_found():
    """The transmission stops being noise."""
    length = 1.8
    lock = np.zeros(int(RATE * length))
    for start_time in (0.15, 0.5):
        start = int(RATE * start_time)
        tone = sine(1200, 0.12) * np.exp(-np.linspace(0, 9, int(RATE * 0.12)))
        lock[start:start + tone.size] += tone
    rise = sweep(200, 1600, length) * np.linspace(0, 0.5, int(RATE * length))
    hold = sine(1600, length) * (0.3 + 0.3 * sine(3.0, length)) * 0.25
    return normalise(mix(lock, rise, hold)) * 0.7


def noclip_whoosh():
    """Falling out of the world: a rush of air and then the wrong kind of quiet."""
    whoosh = bandpass(noise(1.6), 200, 5000)
    env = np.concatenate([np.linspace(0, 1.0, int(RATE * 0.7)),
                          np.linspace(1.0, 0.0, int(RATE * 0.9))])
    whoosh = whoosh[:env.size] * env
    drop = sweep(400, 60, 1.6)
    cut = np.zeros(int(RATE * 1.6))
    tail = lowpass(noise(0.45), 200) * 0.4
    cut[int(RATE * 1.15):int(RATE * 1.15) + tail.size] = tail[:cut.size - int(RATE * 1.15)]
    return normalise(mix(whoosh, drop * 0.5, cut)) * 0.8


def evolution_growl():
    """Something changing its mind about you, out loud."""
    length = 2.1
    base = sine(70, length) * (1.0 + 0.5 * np.sin(2 * np.pi * 7.0 * t(length)))
    grit = bandpass(noise(length), 100, 1500) * (0.5 + 0.5 * sine(5.5, length))
    growl = lowpass(base + grit, 1200)
    growl *= adsr(length, 0.06, 0.3, 0.6, 0.7)
    rise = sweep(60, 110, length) * 0.3
    return normalise(mix(growl, rise)) * 0.85


def explosion_fallout():
    """A detonation and the two seconds of falling dust after it."""
    length = 3.2
    blast = noise(0.6) * np.exp(-np.linspace(0, 10, int(RATE * 0.6)))
    blast = lowpass(blast, 4000) * 1.4
    boom = sine(48, 1.2) * np.exp(-np.linspace(0, 6, int(RATE * 1.2)))
    debris = np.zeros(int(RATE * length))
    for _ in range(70):
        start = rng.integers(0, int(RATE * 2.8))
        step = bandpass(noise(0.05), 200, 2000) * 0.25
        debris[start:start + step.size] += step
    dust = lowpass(noise(length), 300) * np.exp(-np.linspace(0, 3, int(RATE * length))) * 0.7
    return normalise(mix(pad_to(blast, length), pad_to(boom, length), debris, dust)) * 0.95


SOUNDS = {
    "rift_open": (rift_open, 24, False),
    "rift_ambient": (rift_ambient, 32, False),
    "reality_tear": (reality_tear, 32, False),
    "storm_start": (storm_start, 64, False),
    "storm_thunder": (storm_thunder, 96, False),
    "backrooms_hum": (backrooms_hum, 32, False),
    "backrooms_drone": (backrooms_drone, 48, False),
    "backrooms_step": (backrooms_step, 24, False),
    "backrooms_chase": (backrooms_chase, 48, False),
    "observer_whisper": (observer_whisper, 32, False),
    "corruption_whisper": (corruption_whisper, 24, False),
    "signal_loop": (signal_loop, 32, False),
    "signal_static": (signal_static, 24, False),
    "black_sun_arrival": (black_sun_arrival, 96, False),
    "codescape_glitch": (codescape_glitch, 24, False),
    "memory_chime": (memory_chime, 24, False),
    "guide_open": (guide_open, 12, False),
    "mirror_whisper": (mirror_whisper, 24, False),
    "mirror_crack": (mirror_crack, 24, False),
    "signal_found": (signal_found, 24, False),
    "noclip_whoosh": (noclip_whoosh, 24, False),
    "evolution_growl": (evolution_growl, 32, False),
    "explosion_fallout": (explosion_fallout, 64, False),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    subtitles = {name: f"subtitles.beyondthelimits.{name}" for name in SOUNDS}
    entries = {}
    total_bytes = 0

    for name, (builder, distance, streaming) in SOUNDS.items():
        signal = fade_edges(normalise(builder(), 0.85), 0.015)
        path = os.path.join(OUT, f"{name}.ogg")
        sf.write(path, signal.astype(np.float32), RATE, format="OGG", subtype="VORBIS")
        total_bytes += os.path.getsize(path)
        entries[name] = {
            "subtitle": subtitles[name],
            "sounds": [{
                "name": f"beyondthelimits:{name}",
                "stream": streaming,
                "attenuation_distance": distance,
            }],
        }

    import json
    with open(os.path.join(OUT, "..", "sounds.json"), "w") as handle:
        json.dump(entries, handle, indent=2)
        handle.write("\n")

    print(f"sounds: {len(SOUNDS)} ogg files, {total_bytes / 1024:.0f} KiB total, "
          f"largest {max(os.path.getsize(os.path.join(OUT, f + '.ogg')) for f in SOUNDS) / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
