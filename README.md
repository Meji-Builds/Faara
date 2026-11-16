# Faara

Naira and dollar (USDC) payments for Nigeria, with **Hum**: phone-to-phone proximity payments over sound, Bluetooth and QR. Works on any phone, no NFC needed.

> Status: **MVP feature-complete on devnet (milestones 0–6).** Hum payments in naira (mock ledger) and USDC (Solana devnet) over sound, Bluetooth, QR and a typed code, with safety checks. Ready for two-phone testing.

## Stack

- [Expo](https://expo.dev) SDK 58 (React Native 0.88, TypeScript, strict mode)
- Expo Router (file-based navigation in `src/app`)
- Planned: Firebase (Auth, Firestore, Cloud Functions), Solana devnet USDC, Webacy / DD.xyz safety checks

## Getting started

Requires Node 20 or later.

```bash
npm install
npm run web        # open in a browser
npm run android    # requires an Android development build
```

### Scripts

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm start`         | Start the Expo dev server                 |
| `npm run web`       | Start the dev server and open the web app |
| `npm run build:web` | Export a static web build to `dist/`      |
| `npm run typecheck` | TypeScript check                          |
| `npm run lint`      | ESLint (`eslint-config-expo`)             |
| `npm run format`    | Format with Prettier                      |

### Android builds (EAS)

Builds run in the Expo cloud, so they can be started from any device.

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview       # installable APK
npx eas-cli build --platform android --profile development   # dev client APK
```

Profiles are defined in `eas.json`. The `preview` and `development` profiles output an `.apk` you can install directly.

## Project structure

```
src/
  app/                 Routes (Expo Router)
    (auth)/            Welcome, Sign up, Log in
    (tabs)/            Home, Activity, Invoices, Profile + custom tab bar
    hum/               Amount → Humming → Pick recipient → Confirm → Success
    lab/sound.tsx      Sound lab (two-phone test bench)
    settings.tsx
  components/
    brand/             Wordmark, HumMark, AdireBand, Rings, ShapeGlyph
    ui/                Buttons, fields, cards, rows, keypad, toggle, screen shell
    hum/               Hum pulse, channel list, claimant card, currency toggle
    wallet/            Balance card, transaction row, quick actions
    navigation/        Bottom tab bar with the centre Hum button
    settings/          Theme picker
  features/hum/        Hum draft state shared across the hum flow
  features/sound/      Hum modem, audio engine, broadcaster/listener hooks
modules/faara-audio/   Android native module for raw audio I/O
  theme/               Palette, semantic colour tokens (dark + light), type, spacing
  lib/                 Money formatting, keypad input, helpers
  data/fixtures.ts     Sample data until the backend is wired up
assets/images/         App icon, adaptive icon, splash, favicon
```

## Sound channel (Hum)

The sender broadcasts a one-time 10-character code; the amount and wallet address never leave the phone.

| Layer      | Choice                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| Band       | 18–20 kHz, near-ultrasonic                                                                   |
| Sync       | 80 ms linear chirp, found with an FFT matched filter; also measures the speaker/mic response |
| Modulation | 32-FSK, 62.5 Hz tone spacing, 36 ms symbols (32 ms integration window)                       |
| Payload    | Crockford base32 code: 10 symbols of 5 bits                                                  |
| Integrity  | CRC-15 over the payload, then Reed-Solomon over GF(32) with 6 parity symbols                 |
| Frame      | 19 symbols, 774 ms; repeats every 874 ms while humming                                       |

The modem (`src/features/sound/modem`) is plain TypeScript with no platform dependencies. Tests run it through a simulated acoustic channel: talking nearby, in-band noise, room echo, an uneven speaker response, 48 → 44.1 kHz resampling and clock drift.

Audio I/O sits behind one interface (`src/features/sound/audio`):

- **Android:** local Expo module `modules/faara-audio` (Kotlin). It records with the `UNPROCESSED` source (falling back to `VOICE_RECOGNITION`) so voice processing doesn't strip the tones, and plays looped PCM through `AudioTrack`.
- **Web:** Web Audio with echo cancellation, noise suppression and auto gain turned off; capture runs in an AudioWorklet.

To test, install a build on two phones, open **Settings → Developer → Sound lab**, start humming on one and listening on the other.

### Field results

| Date       | Build | Sender → receiver            | Conditions                                | Result                                                  |
| ---------- | ----- | ---------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| 2026-11-16 | Web   | Tecno Spark 10 Pro → Samsung | ~60 cm (a short step), background talking | 13/15 overall; last 10 consecutive passed; median 1.4 s |

Milestone 1 target (9 of 10 at 30 cm in under 2 s, with talking nearby) is met in the browser. Pending: the same test on the Android build.

## Accounts (Firebase)

Sign-in is by phone number with Firebase Authentication; profiles live in Firestore (project `faara-hum`).

- `users/{uid}`: name, username, verified phone, verification tier. Readable only by its owner.
- `usernames/{username}`: reservation that keeps usernames unique, written in the same transaction as the profile.
- Rules: `firestore.rules` (enforces ownership, the verified phone number and username format).

While `PHONE_AUTH_TEST_NUMBERS_ONLY` is on (`src/lib/firebase/config.ts`), only the test numbers set in Firebase Console → Authentication → Sign-in method → Phone work, and no SMS is sent. Real SMS will go through a Nigerian provider from Cloud Functions before launch.

## Hum backend

Server code runs as Vercel functions in `api/` (Firebase Admin SDK, credentials from the `FIREBASE_SERVICE_ACCOUNT` environment variable; never commit the key). Shared request types, limits and validation live in `shared/hum` and are used by both the app and the server.

| Endpoint                | Who      | Does                                                                      |
| ----------------------- | -------- | ------------------------------------------------------------------------- |
| `POST /api/hums/create` | Sender   | Issues a 10-character code valid for 30 s                                 |
| `POST /api/hums/claim`  | Receiver | Claims a decoded code (one claim per person, max 5 per hum, not your own) |
| `POST /api/hums/choose` | Sender   | Picks the recipient once; returns three matching shapes for both screens  |
| `POST /api/hums/cancel` | Sender   | Abandons an open hum                                                      |

Requests carry the user's Firebase ID token. Each user is rate-limited per action per minute. Clients read hum and claim status from Firestore (sender: their hum and its claims; receiver: their own claim); only the server writes.

`npm run typecheck` checks the app and the server (`api/tsconfig.json`, Node types).

## Channels

The sender broadcasts the code over every channel at once; the receiver claims with whichever decodes first.

| Channel      | Where        | Notes                                                             |
| ------------ | ------------ | ----------------------------------------------------------------- |
| Sound        | Android, web | 18–20 kHz modem (above)                                           |
| Bluetooth LE | Android      | `modules/faara-ble`: service data at ultra-low power, RSSI-ranked |
| QR code      | Android, web | Shown after 3 s with no claim; scanned with `expo-camera`         |
| Typed code   | Android, web | Six digits, issued with every hum; strictly rate-limited          |

## Wallet and payments

- **Keys:** 12-word BIP-39 phrase; Solana key at `m/44'/501'/0'/0'` (SLIP-0010), created on the device. Android keeps it in the OS keystore; the web encrypts it with the PIN (devnet only).
- **Approval:** fingerprint (Android, if enabled in Settings) or the six-digit PIN; five wrong PINs lock for five minutes.
- **USDC:** the phone signs a `TransferChecked` (creating the recipient's token account if needed) and sends it to devnet; `POST /api/hums/settle` verifies the transfer on-chain before marking the payment settled. Test funds: SOL from the Wallet screen or faucet.solana.com, USDC from faucet.circle.com (Solana Devnet).
- **Naira:** `NairaProvider` interface with a Firestore mock ledger (`api/_lib/naira.ts`); accounts open with ₦200,000 of test money. Swap in the BaaS partner's implementation later.

## Safety checks

Run on the server after each claim and shown on the sender's list and Confirm screen: account age, payment history between the two people, and Webacy wallet risk for USDC recipients. The most severe finding wins.

## Server configuration (Vercel environment variables)

| Variable                   | Required | Purpose                                                          |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | Yes      | Service account JSON for the Admin SDK. Never commit it.         |
| `WEBACY_API_KEY`           | No       | Enables wallet risk checks; without it badges say "not checked". |
| `WEBACY_CHAIN`             | No       | Webacy chain id for Solana (default `sol`).                      |
| `SOLANA_RPC_URL`           | No       | Devnet RPC for verifying transfers (default public devnet).      |

The app reads `EXPO_PUBLIC_API_URL` (API base for native builds; defaults to production) and `EXPO_PUBLIC_SOLANA_RPC_URL`.

Firestore rules live in `firestore.rules`; publish them in the Firebase console after changes.

## Native code checks

`tools/kotlin-check/check.sh` type-checks the Kotlin in `modules/` against the Android 15 framework and Expo API stand-ins, without the Android SDK. Run it after changing native code.

## Theming

Brand colours and fonts live in `src/theme`. Components read semantic tokens from `useTheme().colors` rather than raw hex values, so dark and light mode stay consistent. Dark is the default; users can switch to Light or System in Settings.

| Token         | Hex       | Use                                          |
| ------------- | --------- | -------------------------------------------- |
| Near-black    | `#0A1412` | App background (dark)                        |
| Deep green    | `#0B3D2E` | Brand colour, cards, success screen          |
| Electric teal | `#14E0C1` | Main buttons, hum animation, positive states |
| Soft teal     | `#A8F0E1` | Secondary text, light accents                |
| Gold          | `#E8B04B` | USDC balances, timers, cautions              |

Type: Bricolage Grotesque (headings, amounts), Inter (UI), JetBrains Mono (codes, references).

## Roadmap

| #   | Milestone      | Status  |
| --- | -------------- | ------- |
| 0   | Setup          | Done    |
| 1   | Sound spike    | Testing |
| 2   | Hum backend    |         |
| 3   | Bluetooth + QR |         |
| 4   | Wallet         |         |
| 5   | Safety         |         |
| 6   | Naira mock     |         |
