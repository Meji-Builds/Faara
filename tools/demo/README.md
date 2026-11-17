# Demo footage

Films the real app with made-up people, for the demo and advertisement video.

- `EXPO_PUBLIC_DEMO=1` swaps the backend for a scripted one (`src/features/demo/engine.ts`).
  Personas are chosen with `?as=ada` (sender), `?as=tolu` (receiver), `?as=chidi`.
- Build: `EXPO_PUBLIC_DEMO=1 EXPO_OFFLINE=1 CI=1 npx expo export --platform web`, then serve `dist`
  on port 8081 (any static SPA server).
- Record: `NODE_PATH=<playwright> node tools/demo/s1.js` (writes `clips/<name>.webm`, 780x1688).
  `lib.js` holds the recorder (tap indicator, 2x video). Scenes are small scripts like `s1.js`.
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
Sound: effects on the hum, the shape match and "Hummed."; light afrobeat-leaning instrumental.
Graphics: real screen captures and typeset text only, no AI-generated images with text.

Known: in `s1.js` the nearest-phone click needs a coordinate click on the claimant row
(`getByText('Tolu Adebayo')` was null at the time of the click; wait for it before measuring).
