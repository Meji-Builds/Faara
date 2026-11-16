# Faara

Naira and dollar (USDC) payments for Nigeria, with **Hum**: phone-to-phone proximity payments over sound, Bluetooth and QR. Works on any phone, no NFC needed.

> Status: **Milestone 0 (Setup)**. All designed screens are built as static UI with sample data, for Android and web.

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
    settings.tsx
  components/
    brand/             Wordmark, HumMark, AdireBand, Rings, ShapeGlyph
    ui/                Buttons, fields, cards, rows, keypad, toggle, screen shell
    hum/               Hum pulse, channel list, claimant card, currency toggle
    wallet/            Balance card, transaction row, quick actions
    navigation/        Bottom tab bar with the centre Hum button
    settings/          Theme picker
  features/hum/        Hum draft state shared across the hum flow
  theme/               Palette, semantic colour tokens (dark + light), type, spacing
  lib/                 Money formatting, keypad input, helpers
  data/fixtures.ts     Sample data until the backend is wired up
assets/images/         App icon, adaptive icon, splash, favicon
```

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

| #   | Milestone      | Status      |
| --- | -------------- | ----------- |
| 0   | Setup          | In progress |
| 1   | Sound spike    | Next        |
| 2   | Hum backend    |             |
| 3   | Bluetooth + QR |             |
| 4   | Wallet         |             |
| 5   | Safety         |             |
| 6   | Naira mock     |             |
