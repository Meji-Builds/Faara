"""Sound effects for the demo film, synthesized so there's nothing to license.

The real hum is 18-20 kHz and barely audible (and lost in AAC), so the film uses a
designed stand-in: a breathy swell with a rising shimmer that nods to the chirp. Everything
else is soft kalimba-like plucks in one key (A minor resolving to C major on "Hummed."),
with a shared room reverb so the sounds sit together.

    python3 tools/demo/sfx.py            # writes clips/cut/sfx-*.wav and clips/sfx-audition.wav
"""
import os
import wave

import numpy as np

SR = 48_000
OUT = 'clips/cut'
rng = np.random.default_rng(7)

NOTE = {'A2': 110.0, 'E3': 164.81, 'A3': 220.0, 'C4': 261.63, 'E4': 329.63, 'G4': 392.0,
        'C5': 523.25, 'E5': 659.26, 'G5': 783.99, 'A5': 880.0, 'C6': 1046.5, 'E6': 1318.5}


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def band(x, lo, hi):
    """Brick-wall band-pass in the frequency domain with soft edges."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.clip((f - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1) * np.clip((hi * 1.4 - f) / (hi * 0.4), 0, 1)
    return np.fft.irfft(spec * gain, len(x))


def lowpass(x, hz):
    return band(x, 0.0001, hz)


def pluck(freq, dur=1.6, gain=1.0):
    """Kalimba-ish tine: a sine with fast-decaying inharmonic overtones and a soft tick."""
    t = t_axis(dur)
    attack = np.clip(t / 0.002, 0, 1)
    tone = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.45)
    tone += 0.35 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t / 0.12)
    tone += 0.22 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.035)
    tick = lowpass(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.004) * 0.15
    return gain * attack * (tone + tick)


def place(dur, events):
    """events: (start_s, mono signal, pan -1..1). Returns stereo (n, 2)."""
    out = np.zeros((int(dur * SR), 2))
    for start, sig, pan in events:
        s = int(start * SR)
        n = min(len(sig), len(out) - s)
        left, right = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        out[s:s + n, 0] += sig[:n] * left
        out[s:s + n, 1] += sig[:n] * right
    return out


def reverb(x, wet=0.22, rt=1.4):
    """Convolution with a decaying, darkened noise tail (different per channel)."""
    n = int(rt * SR)
    t = t_axis(rt)
    out = np.zeros((len(x) + n, 2))
    for ch in range(2):
        ir = lowpass(rng.standard_normal(n), 5000) * np.exp(-t * 6.9 / rt)
        ir[: int(0.012 * SR)] = 0  # pre-delay
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(len(x) + n)))
        wet_sig = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)[: len(x) + n]
        out[:, ch] = wet * wet_sig
        out[: len(x), ch] += x[:, ch]
    return out


def finish(x, peak_db=-4.0, fade=0.05):
    x = x.copy()
    nf = int(fade * SR)
    x[-nf:] *= np.linspace(1, 0, nf)[:, None]
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)


def hum():
    """A breathy swell with a warm A-minor pad under it and a shimmer rising across it."""
    dur = 2.6
    t = t_axis(dur)
    swell = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    breath = band(rng.standard_normal(len(t)), 250, 1100) * 0.5
    pad = sum(
        g * np.sin(2 * np.pi * NOTE[n] * (1 + d) * t + p)
        for n, g, d, p in [('A2', .5, 0, 0), ('E3', .35, .0015, 1), ('A3', .3, -.001, 2), ('C4', .22, .002, 3)]
    )
    pad *= 1 + 0.12 * np.sin(2 * np.pi * 3.2 * t)  # gentle pulse
    # shimmer: narrow noise band sweeping 2 kHz -> 6 kHz, built in short overlapping grains
    shimmer = np.zeros(len(t))
    grain = int(0.08 * SR)
    win = np.hanning(grain)
    for s in range(0, len(t) - grain, grain // 2):
        c = 2000 + 4000 * (s / len(t))
        shimmer[s:s + grain] += band(rng.standard_normal(grain), c * 0.9, c * 1.1) * win
    mono = swell * (breath + 0.6 * pad) + 0.12 * swell * shimmer
    st = place(dur, [(0, mono, -0.15), (0.012, mono * 0.8, 0.3)])
    return finish(reverb(st, wet=0.3), -6)


def caught():
    return finish(reverb(place(1.4, [(0, pluck(NOTE['E5']), -0.2), (0.09, pluck(NOTE['A5']), 0.2)])), -7)


def shapes():
    """One pluck per shape: triangle, ring, diamond."""
    ev = [(0.0, pluck(NOTE['E5']), -0.35), (0.16, pluck(NOTE['G5']), 0), (0.32, pluck(NOTE['A5']), 0.35)]
    return finish(reverb(place(1.8, ev)), -7)


def hummed():
    """C-major arpeggio over a soft low thump: the payment landing."""
    t = t_axis(0.35)
    thump = np.sin(2 * np.pi * (70 + 50 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.09) * 1.4
    ev = [(0, thump, 0)] + [
        (0.02 + 0.075 * i, pluck(NOTE[n], 2.0, g), p)
        for i, (n, g, p) in enumerate([('C5', 1, -.3), ('E5', .9, -.1), ('G5', .9, .1), ('C6', .8, .3)])
    ]
    return finish(reverb(place(2.4, ev), wet=0.28), -5)


def send():
    """Quieter cousin of hummed for transfers and top-ups: two notes, no thump."""
    return finish(reverb(place(1.6, [(0, pluck(NOTE['G5']), -.2), (0.08, pluck(NOTE['C6']), .2)])), -8)


def close():
    """The hum's breath resolving to C major under the wordmark."""
    dur = 3.5
    t = t_axis(dur)
    swell = np.clip(t / 0.8, 0, 1) * np.clip((dur - t) / 1.6, 0, 1)
    pad = sum(g * np.sin(2 * np.pi * NOTE[n] * t) for n, g in [('C4', .4), ('E4', .3), ('G4', .25), ('C5', .15)])
    breath = band(rng.standard_normal(len(t)), 300, 1200) * 0.25
    st = place(dur, [(0, swell * (pad + breath), 0), (0.25, pluck(NOTE['E6'], 2.2, .35), .25)])
    return finish(reverb(st, wet=0.35, rt=2.0), -8)


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'w') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


SOUNDS = {'hum': hum, 'caught': caught, 'shapes': shapes, 'hummed': hummed, 'send': send, 'close': close}


def build():
    os.makedirs(OUT, exist_ok=True)
    made = {name: fn() for name, fn in SOUNDS.items()}
    paths = {name: write(f'{OUT}/sfx-{name}.wav', x) for name, x in made.items()}
    gap = np.zeros((int(0.6 * SR), 2))
    write('clips/sfx-audition.wav', np.concatenate([np.concatenate([x, gap]) for x in made.values()]))
    return paths


if __name__ == '__main__':
    for name, path in build().items():
        print(name, path)
