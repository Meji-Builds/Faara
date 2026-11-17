"""Soundtrack for the Faara ad (tools/demo/ad/index.html): music and sound design in one pass.

120 BPM (a beat is 0.5 s, a bar 2 s), A minor resolving to C. An afro/amapiano-leaning groove
with a log-drum bassline, locked to the picture: keypad ticks under the account number, a
glitch on "was that 1-4?", a riser and snare roll into the logo drop, the hum, whooshes on
every transition, a breakdown into "One touch.", and an impact on "Hummed.".

    python3 tools/demo/ad/score.py        # -> clips/ad/score.wav (and score-music.wav, score-sfx.wav)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from music import bell, clap, epiano, kick, midi, rim, shaker  # noqa: E402
from sfx import SR, band, caught, hum, lowpass, pluck, reverb, t_axis, write  # noqa: E402

rng = np.random.default_rng(23)
DUR = 42.0
BEAT = 0.5
BAR = 2.0
N = int(DUR * SR)

# Chords per bar (MIDI). Bass root + voicing.
CH = {
    'Am': (45, [57, 60, 64, 67]), 'F': (41, [57, 60, 64, 65]),
    'C': (48, [55, 60, 64, 67]), 'G': (43, [55, 59, 62, 67]),
}
PROG = ['Am', 'F', 'C', 'G']


# ---------- mixing helpers

class Bus:
    def __init__(self):
        self.x = np.zeros((N + SR * 4, 2))

    def add(self, t, sig, gain=1.0, pan=0.0):
        if t < 0:
            sig = sig[int(-t * SR):] if sig.ndim == 1 else sig[int(-t * SR):]
            t = 0
        s = int(t * SR)
        if sig.ndim == 1:
            n = min(len(sig), len(self.x) - s)
            l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
            self.x[s:s + n, 0] += gain * l * sig[:n] * np.sqrt(2)
            self.x[s:s + n, 1] += gain * r * sig[:n] * np.sqrt(2)
        else:
            n = min(len(sig), len(self.x) - s)
            self.x[s:s + n] += gain * sig[:n]


def stereo_reverb(x, wet, rt):
    return reverb(x, wet=wet, rt=rt)[: len(x)]


def env_follow(x, ms=10):
    hop = int(SR * ms / 1000)
    m = np.abs(x).max(axis=1)
    n = len(m) // hop
    blocks = m[: n * hop].reshape(n, hop).max(axis=1)
    return np.repeat(blocks, hop), hop


def compress(x, thresh_db=-14, ratio=3.0, attack=0.005, release=0.12, makeup_db=0):
    lvl, hop = env_follow(x, 5)
    lvl = np.concatenate([lvl, np.full(len(x) - len(lvl), lvl[-1] if len(lvl) else 0)])
    db = 20 * np.log10(lvl + 1e-9)
    over = np.maximum(0, db - thresh_db)
    gr = over * (1 - 1 / ratio)
    # smooth gain reduction (attack/release) at block rate
    blocks = gr[::hop]
    out = np.zeros_like(blocks)
    a = np.exp(-hop / (attack * SR)); r = np.exp(-hop / (release * SR))
    g = 0.0
    for i, v in enumerate(blocks):
        g = a * g + (1 - a) * v if v > g else r * g + (1 - r) * v
        out[i] = g
    gain = 10 ** ((-np.repeat(out, hop)[: len(x)] + makeup_db) / 20)
    gain = np.concatenate([gain, np.full(len(x) - len(gain), gain[-1])])
    return x * gain[:, None]


def limit(x, ceiling=0.89):
    peak = np.abs(x).max(axis=1)
    g = np.minimum(1, ceiling / (peak + 1e-9))
    # look-ahead-ish smoothing: min over a short window, then smooth
    w = int(0.004 * SR)
    gm = np.minimum.reduce([np.roll(g, -i) for i in range(0, w, max(1, w // 8))])
    k = np.ones(w) / w
    gs = np.convolve(gm, k, mode='same')
    return np.clip(x * np.minimum(gs, g)[:, None], -ceiling, ceiling)


# ---------- instruments

def log_drum(freq, length=0.45, v=1.0):
    """Amapiano log drum: a pitched thump that bends down onto the note, saturated."""
    t = t_axis(length)
    f = freq * (1 + 0.9 * np.exp(-t / 0.018))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    env = np.clip(t / 0.003, 0, 1) * np.exp(-t / (length * 0.45))
    knock = band(rng.standard_normal(len(t)), 600, 2400) * np.exp(-t / 0.006) * 0.4
    return v * np.tanh(2.2 * (x * env + knock)) * 0.8


def saw_pad(notes, length, v=1.0, cutoff=1800):
    t = t_axis(length)
    out = np.zeros(len(t))
    for m in notes:
        f0 = midi(m)
        for det in (-0.006, 0.0, 0.0055):
            f = f0 * (1 + det)
            ph = rng.uniform(0, 2 * np.pi)
            for h in range(1, 10):
                if f * h > 9000:
                    break
                out += np.sin(2 * np.pi * f * h * t + ph * h) / h
    env = np.clip(t / 0.35, 0, 1) * np.clip((length - t) / 0.5, 0, 1)
    return v * lowpass(out, cutoff) / (len(notes) * 6) * env


def sub_boom(length=2.2, v=1.0):
    t = t_axis(length)
    f = 32 + 70 * np.exp(-t / 0.09)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    return v * np.tanh(1.8 * x)


def noise_hit(length=1.5, v=1.0, lo=200, hi=9000, decay=0.25):
    t = t_axis(length)
    return v * band(rng.standard_normal(len(t)), lo, hi) * np.exp(-t / decay)


def impact(v=1.0):
    """Sub boom + crack + a long reverb tail, stereo."""
    boom = sub_boom(2.4, 1.0)
    crack = noise_hit(1.2, 0.7, 300, 8000, 0.08)
    x = np.zeros((len(boom), 2))
    x[:, 0] += boom
    x[:, 1] += boom
    x[: len(crack), 0] += crack
    x[: len(crack), 1] += crack * 0.9
    tail = reverb(x * 0.8, wet=0.9, rt=2.6)
    return v * tail[: int(3.0 * SR)]


def reverse_swell(length=0.6, v=1.0):
    t = t_axis(length)
    n = band(rng.standard_normal(len(t)), 1500, 9000) * (t / length) ** 3
    return v * n


def whoosh(length=0.45, v=1.0, up=True):
    """Band-passed noise whose centre sweeps; built from short grains so the sweep is smooth."""
    n = int(length * SR)
    out = np.zeros(n)
    grain = int(0.04 * SR)
    win = np.hanning(grain)
    for s in range(0, n - grain, grain // 3):
        p = s / n
        c = (400 + 5000 * p ** 1.5) if up else (5400 - 5000 * p ** 0.7)
        out[s:s + grain] += band(rng.standard_normal(grain), c * 0.7, c * 1.3) * win
    t = t_axis(length)
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 1.6
    return v * out * env * 0.6


def riser(length=2.0, v=1.0):
    t = t_axis(length)
    p = t / length
    f = 180 * (12 ** p)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    trem = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 28 * p ** 2) / SR)
    air = np.zeros(len(t))
    grain = int(0.05 * SR)
    win = np.hanning(grain)
    for s in range(0, len(t) - grain, grain // 2):
        c = 500 + 7000 * (s / len(t)) ** 2
        air[s:s + grain] += band(rng.standard_normal(grain), c * 0.6, c * 1.4) * win
    return v * (tone * trem + 0.5 * air) * p ** 2.2


def snare(v=1.0):
    t = t_axis(0.18)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03)
    sn = band(rng.standard_normal(len(t)), 1500, 8000) * np.exp(-t / 0.06)
    return v * (0.5 * body + 0.8 * sn)


def key_tick(i, v=1.0):
    """A soft keypad tone (two partials, like a phone keypad) with a click."""
    t = t_axis(0.09)
    lo = [697, 770, 852, 941][i % 4]
    hi = [1209, 1336, 1477][i % 3]
    tone = (np.sin(2 * np.pi * lo * t) + np.sin(2 * np.pi * hi * t)) * np.exp(-t / 0.03) * 0.35
    click = band(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t / 0.003) * 0.6
    return v * (tone + click)


def glitch(v=1.0):
    """Tape-stop style pitch drop, chopped, with a dissonant cluster: the 'wait, what?'."""
    length = 0.55
    t = t_axis(length)
    f = 520 * np.exp(-t / 0.18) + 60
    saw = 2 * ((np.cumsum(f) / SR) % 1) - 1
    gate = (np.sin(2 * np.pi * 26 * t) > -0.2).astype(float)
    cluster = sum(np.sin(2 * np.pi * midi(m) * t) for m in (70, 71, 73)) * np.exp(-t / 0.25) * 0.35
    return v * (lowpass(saw, 3000) * 0.4 * gate * np.exp(-t / 0.3) + cluster)


def bloop(freq=520, v=1.0):
    t = t_axis(0.22)
    f = freq * (1 + 0.6 * (1 - np.exp(-t / 0.03)))
    return v * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06) * np.clip(t / 0.003, 0, 1)


def thock(v=1.0):
    t = t_axis(0.12)
    return v * (np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.025) + band(rng.standard_normal(len(t)), 800, 3000) * np.exp(-t / 0.008) * 0.5)


def scan(length=0.9, v=1.0):
    """Fingerprint read: a shimmering, rising, soft tone."""
    t = t_axis(length)
    f = 900 + 900 * t / length
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * t))
    air = band(rng.standard_normal(len(t)), 3000, 9000) * 0.3
    env = np.sin(np.pi * np.clip(t / length, 0, 1))
    return v * (tone * 0.4 + air) * env


def chime(v=1.0):
    """'Hummed.': a bright C-major arpeggio with a bell on top."""
    out = np.zeros(int(2.4 * SR))
    for i, m in enumerate((72, 76, 79, 84, 88)):
        s = int(i * 0.06 * SR)
        p = pluck(midi(m), 2.0, 1.0 - 0.1 * i)
        out[s:s + len(p)] += p[: len(out) - s]
    b = bell(midi(96), 0.5)
    out[: len(b)] += b * 0.5
    return v * out


# ---------- the score

def build():
    music, drums, sfx = Bus(), Bus(), Bus()
    kicks = []

    def k_(t, v=1.0):
        drums.add(t, kick(v), 0.95)
        kicks.append(t)

    swing = 0.012

    def st(bar_t, s):  # 16th position with a little swing
        return bar_t + s * BEAT / 4 + (swing if s % 2 else 0)

    # Intro 0-4: dark pad, a heartbeat, ticks under the digits.
    music.add(0.0, saw_pad([45, 57, 60, 64], 4.2, 1.0, cutoff=900), 1.4)
    music.add(0.0, sub_boom(4.0, 0.0) + np.sin(2 * np.pi * 55 * t_axis(4.0)) * np.clip(t_axis(4.0) / 1.5, 0, 1) * 0.5, 0.6)
    for b in range(4, 8):
        k_(b * BEAT, 0.55)
    for i in range(10):
        sfx.add(0.5 + i * 0.25, key_tick(i, 1.0), 1.3, pan=-0.4 + 0.08 * i)
    sfx.add(3.0, glitch(1.0), 0.9)
    sfx.add(3.7, whoosh(0.35, 0.8, up=False), 0.7)

    # 4-6: build into the drop.
    music.add(4.0, saw_pad([41, 57, 60, 65], 2.0, 1.0, cutoff=1100), 0.5)
    sfx.add(4.55, whoosh(0.3, 0.9), 0.7, pan=0.3)                  # the strike-through
    sfx.add(4.0, riser(1.95, 1.0), 0.8)
    roll = [5.0 + i * 0.25 for i in range(2)] + [5.5 + i * 0.125 for i in range(2)] + [5.75 + i * 0.0625 for i in range(3)]
    for i, t in enumerate(roll):
        drums.add(t, snare(0.4 + 0.08 * i), 0.8)
    for b in range(8, 12):
        k_(b * BEAT, 0.7)

    # Impacts on the big moments.
    for t, v in ((6.0, 1.0), (24.0, 1.0), (36.0, 1.0)):
        sfx.add(t - 0.6, reverse_swell(0.6, 0.6), 0.6)
        sfx.add(t, impact(v), 0.9)

    # The hum itself: logo, "Hum it.", end card.
    hm = hum()
    for t in (6.05, 12.0, 36.05):
        sfx.add(t, hm, 0.9)
    for i, t in enumerate([6.05, 6.3, 6.55, 12.0, 12.5, 13.0, 13.5, 36.0, 36.15, 36.3, 36.45]):
        sfx.add(t, bloop(440 + 40 * (i % 4), 0.5), 0.45, pan=(-1) ** i * 0.3)
    # Phones catching it.
    for i, t in enumerate([14.3, 14.5, 14.7, 14.9, 15.1]):
        sfx.add(t, bloop(600 + 30 * i, 0.4), 0.35, pan=-0.5 + 0.25 * i)
    sfx.add(15.0, caught(), 0.9, pan=0.4)
    # Cards popping in.
    for t in (10.75, 16.0, 16.5):
        sfx.add(t, thock(0.7), 0.6)
    # The three shapes: one note each.
    for t, m, p in ((18.5, 76, -0.4), (19.0, 79, 0.0), (19.5, 81, 0.4)):
        sfx.add(t, pluck(midi(m), 1.6, 1.0), 0.85, pan=p)
        sfx.add(t, bell(midi(m + 12), 0.25), 0.5, pan=p)
    sfx.add(20.5, pluck(midi(84), 1.6, 0.7), 0.6)              # the "=" landing
    # One touch.
    sfx.add(22.0, scan(0.9, 0.8), 0.6)
    sfx.add(23.0, thock(1.0), 0.8)
    sfx.add(23.0, riser(0.9, 0.9), 0.6)
    # Hummed.
    sfx.add(24.0, chime(1.0), 0.8)
    # Montage and transitions.
    for t in (9.65, 13.75, 15.85, 17.7, 21.7, 25.75, 26.85, 27.85, 28.85, 29.75):
        sfx.add(t, whoosh(0.4, 0.9, up=bool(int(t * 4) % 2)), 0.6, pan=0.3 if int(t) % 2 else -0.3)
    for t in (26.0, 27.0, 28.0, 29.0):
        sfx.add(t + 0.05, thock(0.6), 0.45)
    # Hard cuts on the slogans.
    for t in (32.0, 33.5, 35.0):
        drums.add(t, clap(1.0), 0.8)
        sfx.add(t, sub_boom(0.8, 0.6), 0.6)
    sfx.add(35.4, riser(0.6, 0.8), 0.6)
    # Tagline and pill on the end card.
    sfx.add(37.4, pluck(midi(76), 2.0, 0.6), 0.5, pan=-0.2)
    sfx.add(38.0, pluck(midi(84), 2.0, 0.5), 0.45, pan=0.2)

    # ---- the groove (bars 3..17 = 6 s to 35.5 s), with a breakdown at 22-24
    bass_pat = [(0, 0, 0.45), (3, 0, 0.3), (6, 12, 0.3), (8, 7, 0.4), (11, 0, 0.3), (14, 10, 0.3)]
    melody = [[(0, 76), (3, 74), (6, 72), (10, 69), (14, 72)], [(0, 74), (3, 72), (6, 69), (8, 67), (12, 69)]]
    for b in range(3, 18):
        t0 = b * BAR
        name = PROG[b % 4]
        root, voicing = CH[name]
        breakdown = 22.0 <= t0 < 24.0
        last = b == 17                          # 34-36: stop at 35.5 for the riser
        if breakdown:
            music.add(t0, saw_pad(voicing + [root + 12], BAR + 0.4, 1.0, cutoff=1200), 1.3)
            music.add(t0, log_drum(midi(root - 12), 1.6, 0.8), 0.6)
            continue
        music.add(t0, saw_pad(voicing[:3], BAR + 0.3, 0.6, cutoff=1500), 0.35)
        for s in range(16):
            if last and s >= 12:
                break
            acc = 1.0 if s % 4 == 2 else (0.65 if s % 2 else 0.4)
            drums.add(st(t0, s), shaker(acc), 0.45, pan=0.25)
        for s in (0, 4, 8, 12):
            if not (last and s >= 12):
                k_(st(t0, s), 1.0 if s in (0, 8) else 0.85)
        for s in (4, 12):
            if not (last and s >= 12):
                drums.add(st(t0, s), clap(0.9), 0.7)
        for s in (3, 7, 10, 14):
            if not (last and s >= 12):
                drums.add(st(t0, s), rim(0.5), 0.5, pan=-0.25)
        for s in (0, 3, 6, 10, 12):
            if not (last and s >= 12):
                drums.add(st(t0, s), bell(midi(81 if s in (0, 10) else 76), 0.6), 0.35, pan=-0.45)
        for s, iv, ln in bass_pat:
            if not (last and s >= 12):
                music.add(st(t0, s), log_drum(midi(root - 12 + iv + 12), ln, 1.0), 0.85)
        for s in (2, 6, 10, 14):
            if not (last and s >= 12):
                music.add(st(t0, s), epiano([midi(m) for m in voicing], 0.7, 0.28), 0.55, pan=0.2)
        if t0 >= 24.0 and t0 < 32.0:
            for s, m in melody[(b // 1) % 2]:
                music.add(st(t0, s), pluck(midi(m), 1.3, 0.6), 0.5, pan=0.15 if s % 2 else -0.15)
        if 30.0 <= t0 < 32.0:  # the wall of screens: lift
            music.add(t0, riser(2.0, 0.5), 0.35)

    # Ending: C major on the end card, ringing out.
    root, voicing = CH['C']
    music.add(36.0, saw_pad(voicing + [72], 6.0, 1.0, cutoff=1800), 1.3)
    music.add(36.0, log_drum(midi(root - 12), 1.2, 1.0), 0.9)
    music.add(36.0, epiano([midi(m) for m in voicing], 0.9, 2.0), 0.6)

    # ---- mix
    m = stereo_reverb(music.x, 0.18, 1.2)
    d = drums.x + stereo_reverb(drums.x * 0.4, 0.12, 0.8)
    fx = stereo_reverb(sfx.x, 0.2, 1.4)
    # pump the music under the kick
    pump = np.ones(len(m))
    tt = np.arange(len(m)) / SR
    for t in kicks:
        s = int(t * SR); e = min(len(m), s + int(0.3 * SR))
        pump[s:e] = np.minimum(pump[s:e], 1 - 0.45 * np.exp(-(tt[s:e] - t) / 0.09))
    m *= pump[:, None]
    mix = 0.9 * m + 0.85 * d + 1.0 * fx
    mix = mix[:N]
    # gentle fade at the very end
    nf = int(1.5 * SR)
    mix[-nf:] *= np.linspace(1, 0, nf)[:, None] ** 1.5
    mix = compress(mix / (np.abs(mix).max() + 1e-9) * 0.7, thresh_db=-16, ratio=2.5, makeup_db=4)
    mix = limit(mix, 0.89)
    os.makedirs('clips/ad', exist_ok=True)
    write('clips/ad/score.wav', mix)
    write('clips/ad/score-music.wav', limit((0.9 * m + 0.85 * d)[:N] / (np.abs(0.9 * m + 0.85 * d).max() + 1e-9) * 0.8))
    write('clips/ad/score-sfx.wav', limit(fx[:N] / (np.abs(fx).max() + 1e-9) * 0.8))
    return 'clips/ad/score.wav'


if __name__ == '__main__':
    print(build())
