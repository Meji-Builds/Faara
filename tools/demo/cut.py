"""Cuts the recorded clips into the 16:9 demo film (clips/faara-demo.mp4).

Run from the repo root after the scene scripts (s1..s5.js) have written clips/*.webm and
clips/*.json:  python3 tools/demo/cut.py
Text is typeset with the app's own fonts; sound effects are synthesized. Voiceover and
music are added afterwards (see tools/demo/voiceover.md).
"""
import json
import math
import os
import struct
import subprocess
import wave

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
BG = (10, 20, 18)  # nearBlack
TEAL = (20, 224, 193)
MUTED = (157, 181, 173)
WHITE = (240, 247, 244)
PH_H = 900
PH_W = round(780 / 1688 * PH_H) // 2 * 2
PH_Y = 120
OUT = 'clips/cut'
FONTS = 'node_modules/@expo-google-fonts'
os.makedirs(OUT, exist_ok=True)


def font(kind, size):
    path = {
        'display': f'{FONTS}/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf',
        'bold': f'{FONTS}/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf',
        'body': f'{FONTS}/inter/400Regular/Inter_400Regular.ttf',
        'semi': f'{FONTS}/inter/600SemiBold/Inter_600SemiBold.ttf',
    }[kind]
    return ImageFont.truetype(path, size)


def marks(name):
    with open(f'clips/{name}.json') as f:
        return json.load(f)


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr[-3000:])


# ---------- stills

def wrap(draw, text, f, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=f) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def caption(name, title, sub=None, over=None, x=1180, width=640, y=None, align='left'):
    """A transparent 1920x1080 layer with an overline, heading and supporting line."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ft, fs, fo = font('display', 76), font('body', 32), font('semi', 22)
    tl = wrap(d, title, ft, width)
    sl = wrap(d, sub, fs, width) if sub else []
    block = (40 if over else 0) + len(tl) * 84 + (24 + len(sl) * 46 if sl else 0)
    cy = y if y is not None else (H - block) // 2

    def put(text, f, fill, yy, spacing=0):
        tx = x if align == 'left' else x + (width - d.textlength(text, font=f)) / 2
        d.text((tx, yy), text, font=f, fill=fill)

    if over:
        put(over.upper(), fo, TEAL, cy)
        cy += 40
    for line in tl:
        put(line, ft, WHITE, cy)
        cy += 84
    cy += 24
    for line in sl:
        put(line, fs, MUTED, cy)
        cy += 46
    path = f'{OUT}/{name}.png'
    im.save(path)
    return path


def label(name, text, cx):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font('semi', 26)
    d.text((cx - d.textlength(text, font=f) / 2, PH_Y - 56), text, font=f, fill=MUTED)
    path = f'{OUT}/{name}.png'
    im.save(path)
    return path


def bezel(w=PH_W, h=PH_H, r=46):
    """Rounds the phone's corners and outlines it."""
    path = f'{OUT}/bezel-{w}x{h}.png'
    im = Image.new('RGBA', (w, h), BG + (255,))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), r, fill=(0, 0, 0, 0))
    d.rounded_rectangle((0, 0, w - 1, h - 1), r, outline=(36, 66, 58, 255), width=3)
    im.save(path)
    return path


def wordmark(width):
    im = Image.open('assets/images/wordmark.png').convert('RGBA')
    a = im.split()[3]
    solid = Image.new('RGBA', im.size, TEAL + (255,))
    solid.putalpha(a)
    return solid.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


# ---------- scenes

def scene(name, dur, phones=(), layers=(), crops=()):
    """phones: dicts(clip, start, x, pre=0, speed=1). layers: (png, t0, t1) fades.
    crops: dicts(clip, start, crop=(x,y,w,h), x, y, scale, len=seconds before it freezes)."""
    inputs = ['-f', 'lavfi', '-i', f'color=c=0x0A1412:s={W}x{H}:r={FPS}:d={dur}']
    fc, last, n = [], '0:v', 1
    bz = bezel()
    for i, p in enumerate(phones):
        inputs += ['-ss', str(p['start']), '-i', f"clips/{p['clip']}.webm", '-loop', '1', '-i', bz]
        sp = p.get('speed', 1)
        fc.append(
            f"[{n}:v]setpts=(PTS-STARTPTS)/{sp},fps={FPS},crop=390:844:0:0,scale={PH_W}:{PH_H}:flags=lanczos,"
            f"tpad=start_mode=clone:start_duration={p.get('pre', 0)}:stop_mode=clone:stop_duration={dur},"
            f"trim=duration={dur}[p{i}];[p{i}][{n + 1}:v]overlay=shortest=1[pb{i}];"
            f"[{last}][pb{i}]overlay={p['x']}:{PH_Y}:shortest=1[v{i}]"
        )
        last, n = f'v{i}', n + 2
    for i, c in enumerate(crops):
        x0, y0, cw, ch = c['crop']
        sw, sh = round(cw * c['scale']) // 2 * 2, round(ch * c['scale']) // 2 * 2
        inputs += ['-ss', str(c['start']), '-i', f"clips/{c['clip']}.webm"]
        fc.append(
            f"[{n}:v]setpts=PTS-STARTPTS,fps={FPS},crop={cw}:{ch}:{x0}:{y0},scale={sw}:{sh}:flags=lanczos,trim=duration={c.get('len', dur)},"
            f"tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur}[c{i}];"
            f"[{last}][c{i}]overlay={c['x']}:{c['y']}:shortest=1[vc{i}]"
        )
        last, n = f'vc{i}', n + 1
    for i, (png, t0, t1) in enumerate(layers):
        t1 = min(t1, dur)
        inputs += ['-loop', '1', '-t', str(dur), '-i', png]
        fade_out = f",fade=t=out:st={t1 - 0.35:.2f}:d=0.35:alpha=1" if t1 < dur else ''
        fc.append(
            f"[{n}:v]format=rgba,fade=t=in:st={t0:.2f}:d=0.4:alpha=1{fade_out}[l{i}];"
            f"[{last}][l{i}]overlay=0:0:shortest=1[vl{i}]"
        )
        last, n = f'vl{i}', n + 1
    fc.append(f'[{last}]fade=t=in:st=0:d=0.3,fade=t=out:st={dur - 0.3:.2f}:d=0.3,format=yuv420p[out]')
    path = f'{OUT}/{name}.mp4'
    run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(fc),
         '-map', '[out]', '-t', str(dur), '-r', str(FPS), '-c:v', 'libx264', '-crf', '18',
         '-preset', 'medium', path])
    return path, dur


def still_scene(name, dur, png):
    return scene(name, dur, layers=[(png, 0.2, dur)])


# ---------- sound

SR = 44100


def tone(path, parts, dur):
    """parts: (freq, t0, length, gain, tremolo_hz). Soft attack and release."""
    n = int(SR * dur)
    buf = [0.0] * n
    for freq, t0, length, gain, trem in parts:
        s0, ln = int(t0 * SR), int(length * SR)
        for k in range(ln):
            if s0 + k >= n:
                break
            t = k / SR
            env = min(1, t / 0.03) * min(1, (length - t) / 0.25) ** 2
            mod = 1 - 0.35 * (0.5 + 0.5 * math.sin(2 * math.pi * trem * t)) if trem else 1
            buf[s0 + k] += gain * env * mod * math.sin(2 * math.pi * freq * t)
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 30000)) for v in buf))
    return path


def sounds():
    return {
        # the hum: a low, warm chord with a slow pulse
        'hum': tone(f'{OUT}/hum.wav', [(220, 0, 2.2, .18, 5), (277.2, 0, 2.2, .12, 5),
                                       (329.6, 0, 2.2, .10, 5), (440, 0.1, 2.0, .05, 5)], 2.3),
        # caught / shapes matched: two soft rising notes
        'match': tone(f'{OUT}/match.wav', [(659.3, 0, .35, .22, 0), (987.8, .12, .5, .22, 0)], .7),
        # Hummed.: a bright three-note resolve
        'done': tone(f'{OUT}/done.wav', [(523.3, 0, .6, .2, 0), (659.3, .1, .6, .2, 0),
                                         (784, .2, 1.0, .22, 0), (1046.5, .3, .9, .1, 0)], 1.4),
        'tick': tone(f'{OUT}/tick.wav', [(1318.5, 0, .12, .18, 0)], .15),
    }


# ---------- film

def main():
    hum, rcv = marks('send-hum'), marks('receive-hum')
    uname, add = marks('send-username'), marks('add-money')
    film, cues = [], []  # cues: (sound, seconds into the film)

    def push(seg, sfx=()):
        start = sum(d for _, d in film)
        film.append(seg)
        cues.extend((s, start + t) for s, t in sfx)

    # 1. Problem
    push(scene('01-problem', 5.5, layers=[
        (caption('t-problem', '“What’s your account number?”', x=260, width=1400, y=400, align='center'), 0.3, 5.5),
        (caption('t-problem-2', '', 'Spelling it out. Checking it twice. Waiting for the alert.',
                 x=260, width=1400, y=560, align='center'), 2.0, 5.5),
    ]))

    # 2–3. Hum: Ada sends, Tolu receives, in step (aligned on the shapes moment).
    a0 = hum['home'] + 0.3
    a1 = hum['hummed'] + 2.8
    offset = hum['shapes'] - rcv['shapes']  # Ada time = Tolu time + offset
    t_start = 3.6  # first settled Home frame of Tolu's clip
    pre = t_start + offset - a0
    ax, tx = 250, 250 + PH_W + 90
    rel = lambda t: t - a0  # noqa: E731
    dur = round(a1 - a0, 2)
    push(scene('02-hum', dur, phones=[
        dict(clip='send-hum', start=a0, x=ax),
        dict(clip='receive-hum', start=t_start, x=tx, pre=round(pre, 2)),
    ], layers=[
        (label('l-ada', 'Ada · paying', ax + PH_W // 2), 0, dur),
        (label('l-tolu', 'Tolu · getting paid', tx + PH_W // 2), 0, dur),
        (caption('t-hum1', 'Splitting the suya?', 'Type the amount. Tap Hum it.', over='Hum',
                 x=1250, width=600), 0.2, rel(hum['humming'])),
        (caption('t-hum2', 'Phones nearby hear it.', 'No numbers to type. Tolu’s phone was just open on Home.',
                 over='Hum', x=1250, width=600), rel(hum['humming']), rel(hum['choose'])),
        (caption('t-hum3', 'You choose who gets paid.', 'Closest phone is on top. Nobody is paid until you pick.',
                 over='Hum', x=1250, width=600), rel(hum['choose']), rel(hum['shapes'])),
        (caption('t-hum4', 'Same three shapes.', 'If both screens match, it’s the right person.',
                 over='Hum', x=1250, width=600), rel(hum['shapes']), rel(hum['hummed'])),
        (caption('t-hum5', 'Hummed.', 'Paid and settled in under two seconds.',
                 over='Hum', x=1250, width=600), rel(hum['hummed']), dur),
    ]), [('hum', rel(hum['humming']) + 0.2), ('match', rel(hum['caught'])),
         ('match', rel(hum['shapes']) + 0.3), ('done', rel(hum['hummed']))])

    # 4. Send by Faara number or username
    s0, sp = uname['send'] - 0.3, 1.25
    s1 = uname['sent'] + 2.0
    d4 = round((s1 - s0) / sp, 2)
    r4 = lambda t: (t - s0) / sp  # noqa: E731
    px = 330
    push(scene('03-send', d4, phones=[dict(clip='send-username', start=s0, x=px, speed=sp)], layers=[
        (caption('t-send1', 'Not in the same room?', 'Send to their Faara number. No need for the 0.',
                 over='Send', x=1000, width=680), 0.2, r4(uname['username'])),
        (caption('t-send2', 'Or just their username.', 'You see the name before any money moves.',
                 over='Send', x=1000, width=680), r4(uname['username']), r4(uname['review'])),
        (caption('t-send3', 'Rent share, sent.', 'Free, and it arrives instantly.',
                 over='Send', x=1000, width=680), r4(uname['review']), d4),
    ]), [('done', r4(uname['sent']))])

    # 5. Add money
    m0, m1 = add['add'] - 0.2, add['home2'] + 2.6
    d5 = round(m1 - m0, 2)
    push(scene('04-add', d5, phones=[dict(clip='add-money', start=m0, x=px)], layers=[
        (caption('t-add', 'Top up in seconds.', 'Pick an amount. Pay by card or bank transfer. Your balance updates right away.',
                 over='Add money', x=1000, width=680), 0.2, d5),
    ]), [('tick', add['pay'] - m0), ('match', add['added'] - m0)])

    # 6. Receipt
    e0 = uname['receipt'] - 0.2
    push(scene('05-receipt', 5.5, phones=[dict(clip='send-username', start=e0, x=px)], layers=[
        (caption('t-receipt', 'A receipt for every payment.', 'Branded, and ready to share as an image or a PDF.',
                 over='Receipts', x=1000, width=680), 0.2, 5.5),
    ]))

    # 7. Safety: the claimant cards, close up
    push(scene('06-safety', 5.0, crops=[dict(clip='send-hum', start=hum['choose'] + 0.9,
                                             crop=(15, 185, 360, 340), scale=2.5, x=170, y=115,
                                             len=hum['shapes'] - hum['choose'] - 1.2)],
               layers=[(caption('t-safety', 'Every phone is checked.', 'How old the account is, and whether you’ve paid them before, before you choose.',
                                over='Safety', x=1220, width=600), 0.2, 5.0)]))

    # 8. Faara code
    push(scene('07-code', 6.5, phones=[
        dict(clip='faara-code', start=2.6, x=ax),
        dict(clip='pay-link', start=3.6, x=tx, pre=1.5),
    ], layers=[
        (label('l-code-a', 'Ada’s Faara code', ax + PH_W // 2), 0, 6.5),
        (label('l-code-t', 'Tolu scans it', tx + PH_W // 2), 0, 6.5),
        (caption('t-code', 'Your Faara code.', 'Anyone who scans it can pay you, even before they join.',
                 over='Get paid', x=1250, width=600), 0.2, 6.5),
    ]))

    # 9. Close
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    wm = wordmark(420)
    im.alpha_composite(wm, ((W - wm.width) // 2, 330))
    d = ImageDraw.Draw(im)
    f = font('display', 84)
    t = 'Hold phones close.'
    d.text(((W - d.textlength(t, font=f)) / 2, 330 + wm.height + 60), t, font=f, fill=WHITE)
    im.save(f'{OUT}/t-close.png')
    push(still_scene('08-close', 5.0, f'{OUT}/t-close.png'), [('hum', 0.4)])

    # Join, then lay the sound effects on top.
    with open(f'{OUT}/list.txt', 'w') as f:
        f.writelines(f"file '{os.path.basename(p)}'\n" for p, _ in film)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', f'{OUT}/list.txt',
         '-c', 'copy', f'{OUT}/video.mp4'])
    total = sum(d for _, d in film)
    sfx = sounds()
    ins, fc = ['-f', 'lavfi', '-t', str(total), '-i', 'anullsrc=r=44100:cl=mono'], []
    for i, (s, t) in enumerate(cues):
        ins += ['-i', sfx[s]]
        ms = int(t * 1000)
        fc.append(f'[{i + 1}:a]adelay={ms}[a{i}]')
    fc.append(''.join(f'[a{i}]' for i in range(len(cues))) + f'[0:a]amix=inputs={len(cues) + 1}:normalize=0[sfx]')
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '[sfx]',
         '-t', str(total), '-c:a', 'pcm_s16le', f'{OUT}/sfx.wav'])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{OUT}/video.mp4', '-i', f'{OUT}/sfx.wav',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
         'clips/faara-demo.mp4'])
    with open('clips/faara-demo-cues.json', 'w') as f:
        json.dump({'scenes': [[os.path.basename(p), round(d, 2)] for p, d in film],
                   'sfx': [[s, round(t, 2)] for s, t in cues]}, f, indent=2)
    print(f'clips/faara-demo.mp4  {total:.1f}s')


if __name__ == '__main__':
    main()
