# Demo footage

Films the real app with made-up people, for the demo and advertisement video.

- `EXPO_PUBLIC_DEMO=1` swaps the backend for a scripted one (`src/features/demo/engine.ts`).
  Personas are chosen with `?as=ada` (sender), `?as=tolu` (receiver), `?as=chidi`.
- Build: `EXPO_PUBLIC_DEMO=1 EXPO_OFFLINE=1 CI=1 npx expo export --platform web`, then serve `dist`
  on port 8081 (any static SPA server).
- Record: `NODE_PATH=$(npm root -g) node tools/demo/s1.js`, then `s2.js` … `s5.js`. Each writes
  `clips/<name>.webm` and `clips/<name>.json` (seconds into the clip of each moment, used by the cut).
  The picture is 390x844 CSS px in the top-left of the 780x1688 frame (Playwright records at CSS size).
  `lib.js` holds the recorder (tap indicator, `mark`, `vis`).
  - `s1.js` Ada hums ₦5,000 · `s2.js` Tolu receives (`PICK`/`SETTLE` env tune the receiver to Ada's
    marks; defaults match the current `send-hum.json`) · `s3.js` send by number and username, receipt ·
    `s4.js` add money · `s5.js` Faara code and pay link.
- Cut: `python3 tools/demo/cut.py` → `clips/faara-demo.mp4` (1920x1080, 30 fps, about 80 s), with
  typeset captions in the app's fonts and the sound effects from `sfx.py`
  (`python3 tools/demo/sfx.py` also writes `clips/sfx-audition.wav`; `cut.py --audio-only` remixes
  without re-rendering). The real hum is 18-20 kHz and near-inaudible, so the film's hum is designed. Voiceover script with timings:
  `voiceover.md`. Voiceover and music still need recording and mixing over the cut.
- Never merge this branch into `main`.

## Film (about 90 seconds, 16:9, two phones side by side for the hum)

1. Problem: "What's your account number?" (text only)
2. Hum, sender (`ada`): amount, "Hum it", phones caught, choose, match shapes, fingerprint, paying, success
3. Hum, receiver (`tolu`): Home listening, hum caught, "You were picked", shapes, "Hummed."
4. Send by username and by phone number without the 0 (`ada` -> `tolu.a`)
5. Add money: amount chips, pay by card or bank transfer, balance updates
6. Receipt: branded, share as image or PDF
7. Safety: claimant card with the check line
8. Faara code: Profile QR opens a pay link
9. Close: "Hold phones close."

Voiceover: warm, clear, concrete moments (splitting a bill), no generic app-ad lines. Do not mention dollars.
Sound: effects on the hum, caught, the shape match, "Hummed.", sent and top-up, close; light afrobeat-leaning instrumental.
Graphics: real screen captures and typeset text only, no AI-generated images with text.

Known: screens left in the navigation stack stay in the DOM, so locators need `visible=true`
(`c.vis`, `c.btn` already do this).
