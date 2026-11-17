"""A light afrobeat-leaning instrumental for the demo film, composed in code (nothing to license).

About 104 BPM with a slight 16th swing: kick, rim, shaker, a bell on a 3-2 pattern, a round
bass, offbeat electric-piano stabs, a soft pad, and a kalimba line for the second half.
The tempo is fitted so a bar's downbeat lands exactly on "Hummed.", where the groove,
which drops out for the half bar before, comes back in full.

    python3 tools/demo/music.py 79.7 30.13 74.7   # length, "Hummed." time, close-scene time
"""
import sys

import numpy as np

from sfx import NOTE, SR, band, finish, lowpass, place, pluck, reverb, t_axis, write

rng = np.random.default_rng(11)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# Chords as MIDI notes: bass root, then the stab voicing (around middle C).
CHORDS = {
    'Am': (45, [57, 60, 64, 67]),   # Am7
    'F': (41, [57, 60, 64, 65]),    # Fmaj7 (A C E F)
    'C': (48, [55, 60, 64, 67]),    # C (G C E G)
    'G': (43, [55, 59, 62, 67]),    # G
    'Dm': (50, [57, 60, 62, 65]),   # Dm7
}
LOOP = ['C', 'G', 'Am', 'F']        # I - V - vi - IV, bright and resolved
INTRO = ['Am', 'F']                 # the "account number" problem: unresolved


# ---------- instruments (mono)

def kick(v=1.0):
    t = t_axis(0.35)
    f = 48 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.2)
    click = lowpass(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.003) * 0.25
    return v * np.tanh(1.6 * (body + click))


def rim(v=1.0):
    t = t_axis(0.12)
    tone = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.018)
    snap = band(rng.standard_normal(len(t)), 1800, 5000) * np.exp(-t / 0.03)
    return v * (0.6 * tone + 0.7 * snap)


def clap(v=1.0):
    t = t_axis(0.25)
    burst = np.zeros(len(t))
    for d in (0, 0.009, 0.018):
        s = int(d * SR)
        burst[s:] += np.exp(-(t[: len(t) - s]) / 0.012)
    tail = np.exp(-t / 0.09) * 0.4
    return v * band(rng.standard_normal(len(t)), 900, 4000) * (burst + tail) * 0.6


def shaker(v=1.0):
    t = t_axis(0.09)
    env = np.clip(t / 0.012, 0, 1) * np.exp(-t / 0.028)
    return v * band(rng.standard_normal(len(t)), 5000, 11000) * env


def bell(freq, v=1.0):
    """Agogo-ish: two-operator FM with a quick, metallic decay."""
    t = t_axis(0.5)
    mod = 1.8 * np.exp(-t / 0.08) * np.sin(2 * np.pi * freq * 1.41 * t)
    return v * np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / 0.12)


def bass(freq, length, v=1.0):
    t = t_axis(length + 0.08)
    env = np.clip(t / 0.006, 0, 1) * np.exp(-t / 0.6) * np.clip((length + 0.08 - t) / 0.08, 0, 1)
    x = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
    return v * np.tanh(1.3 * x) * env


def epiano(freqs, v=1.0, length=0.32):
    """Rhodes-like FM stab: bell-ish attack that mellows quickly."""
    t = t_axis(length + 0.25)
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t / 0.22) * np.clip((length + 0.25 - t) / 0.25, 0, 1)
    out = np.zeros(len(t))
    for f in freqs:
        idx = 1.2 * np.exp(-t / 0.05)
        out += np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) + 0.15 * np.sin(2 * np.pi * 2 * f * t)
    return v * out / len(freqs) * env


def pad(freqs, length, v=1.0):
    t = t_axis(length)
    env = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 0.8, 0, 1)
    out = np.zeros(len(t))
    for f in freqs:
        for d in (-0.003, 0.0, 0.004):
            ph = rng.uniform(0, 2 * np.pi)
            out += np.sin(2 * np.pi * f * (1 + d) * t + ph) + 0.3 * np.sin(4 * np.pi * f * (1 + d) * t + ph)
    return v * lowpass(out, 2200) / (3 * len(freqs)) * env


# ---------- arrangement

def compose(total, hummed, close):
    bar = hummed / 13                     # 13 bars to "Hummed." -> ~104 BPM
    step = bar / 16
    swing = 0.14 * step                   # late off-16ths
    nbars = int(np.ceil(total / bar)) + 1
    end_bar = int(np.floor(close / bar))  # last full groove bar ends at the close scene

    tracks = {k: [] for k in ('drums', 'perc', 'bass', 'keys', 'pad', 'lead')}

    def at(b, s):
        jitter = rng.normal(0, 0.003)
        return b * bar + s * step + (swing if s % 2 else 0) + jitter

    def chord(b):
        if b < 2:
            return INTRO[b % 2]
        return LOOP[(b - 13) % 4]

    melody = [  # (step, scale degree MIDI) per 2-bar phrase; A-minor pentatonic, ends on the root
        [(0, 76), (3, 74), (6, 72), (10, 69), (14, 72)],
        [(0, 74), (3, 72), (6, 69), (8, 67), (12, 69)],
    ]

    for b in range(min(nbars, end_bar)):
        name = chord(b)
        root, voicing = CHORDS[name]
        freqs = [midi(m) for m in voicing]
        full = 3 <= b < end_bar
        drop = b == 12                    # half-bar stop before "Hummed."
        tracks['pad'].append((b * bar, pad([midi(m) for m in voicing[:3]] + [midi(root + 12)], bar + 0.6,
                                           1.8 if b < 3 else 0.45), 0))
        if b >= 2:
            for s in range(16):
                if drop and s >= 8:
                    break
                acc = 1.0 if s % 4 == 2 else (0.7 if s % 2 else 0.45)
                tracks['perc'].append((at(b, s), shaker(acc * rng.uniform(0.85, 1.05)), 0.35))
            for s in (0, 3, 6, 10, 12):
                if drop and s >= 8:
                    continue
                tracks['perc'].append((at(b, s), bell(midi(81 if s in (0, 10) else 76), 0.9 if s == 0 else 0.6), -0.4))
        if full:
            kicks = (0, 7, 8, 14) if b % 2 else (0, 7, 8, 11)
            for s in kicks:
                if drop and s >= 8:
                    continue
                tracks['drums'].append((at(b, s), kick(1.0 if s in (0, 8) else 0.7), 0))
            for s in (4, 12):
                if drop and s >= 8:
                    continue
                tracks['drums'].append((at(b, s), clap(0.9), 0.05))
            for s in (3, 6, 10, 13):
                if drop and s >= 8:
                    continue
                tracks['drums'].append((at(b, s), rim(0.55), 0.25))
            # bass: root on 1, a pickup to the octave, the fifth, an approach into the next bar
            line = [(0, root, 5), (6, root + 12, 2), (8, root, 3), (11, root + 7, 3), (14, root + 10, 2)]
            for s, m, ln in line:
                if drop and s >= 8:
                    continue
                tracks['bass'].append((at(b, s), bass(midi(m), ln * step, 0.9), 0))
            for s in (2, 6, 10, 14) if b % 2 else (2, 6, 9, 14):
                if drop and s >= 8:
                    continue
                tracks['keys'].append((at(b, s), epiano(freqs, 0.8 if s == 2 else 0.6), 0.2))
        if b >= 13:
            for s, m in melody[(b - 13) % 2]:
                tracks['lead'].append((at(b, s), pluck(midi(m), 1.4, 0.55), -0.15 if s % 2 else 0.15))

    # Ending: the groove hits the C chord on the close scene and rings out.
    end = end_bar * bar
    root, voicing = CHORDS['C']
    tracks['drums'].append((end, kick(1.0), 0))
    tracks['bass'].append((end, bass(midi(root), 2.4, 0.9), 0))
    tracks['keys'].append((end, epiano([midi(m) for m in voicing], 1.3, 1.6), 0.1))
    tracks['pad'].append((end, pad([midi(m) for m in voicing] + [midi(72)], total - end + 0.5, 1.6), 0))
    for i, m in enumerate((72, 76, 79, 84)):
        tracks['lead'].append((end + 0.6 + i * 0.12, pluck(midi(m), 2.0, 0.7), -0.3 + 0.2 * i))

    gains = {'drums': 0.55, 'perc': 1.1, 'bass': 0.38, 'keys': 1.3, 'pad': 0.4, 'lead': 0.75}
    mix = np.zeros((int((total + 3) * SR), 2))
    stems = {}
    for name, events in tracks.items():
        dur = total + 3
        stem = place(dur, [(max(0.0, t), x, p) for t, x, p in events])
        if name in ('keys', 'lead', 'perc', 'pad'):
            stem = reverb(stem, wet=0.25, rt=1.2)[: len(mix)]
        stems[name] = gains[name] * stem[: len(mix)]
        mix += stems[name]
    mix = mix[: int(total * SR)]
    # fade the tail so it ends with the film
    nf = int(2.5 * SR)
    mix[-nf:] *= np.linspace(1, 0, nf)[:, None] ** 1.5
    compose.stems = stems
    return finish(mix, -3, fade=0.02), 60 / (bar / 4)


def build(total, hummed, close, path='clips/cut/music.wav'):
    mix, bpm = compose(total, hummed, close)
    write(path, mix)
    return path, bpm


if __name__ == '__main__':
    total, hummed, close = map(float, sys.argv[1:4])
    p, bpm = build(total, hummed, close)
    print(p, f'{bpm:.1f} BPM')
