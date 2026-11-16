import { palette } from './palette';

export type ColorScheme = 'dark' | 'light';

export interface ColorTokens {
  /** App background. */
  background: string;
  /** Raised surfaces: list cards, inputs, keypad keys. */
  surface: string;
  /** Quieter filled surface: quick-action tiles, country code, neutral avatars. */
  surfaceMuted: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary text: labels, hints, captions. */
  textMuted: string;
  /** Main call-to-action fill. */
  accent: string;
  /** Text and icons placed on `accent`. */
  onAccent: string;
  /** Accent used for text and icons on `background` (links, positive amounts). */
  accentText: string;
  /** Brand card fill (deep green). Identical in both schemes. */
  brand: string;
  /** Inner panels placed on `brand`. */
  brandInset: string;
  /** Borders and decorative rings on `brand`. */
  brandLine: string;
  /** Primary text on `brand`. */
  onBrand: string;
  /** Secondary text on `brand`. */
  onBrandMuted: string;
  /** Gold used for dollars, timers and cautions on `background`. */
  gold: string;
  /** Gold used on `brand` surfaces. */
  goldOnBrand: string;
  /** Background for warning chips. */
  warningSurface: string;
  /** Soft teal used for avatars and light accents. */
  soft: string;
  /** Decorative rings drawn on `background`. */
  ring: string;
  /** Inner, more prominent decorative ring on `background`. */
  ringStrong: string;
  /** Track colour for switches in the off state. */
  switchTrackOff: string;
  /** Thumb colour for switches in the off state. */
  switchThumbOff: string;
  /** Bottom tab bar background. */
  tabBar: string;
}

const shared = {
  accent: palette.electricTeal,
  onAccent: palette.nearBlack,
  brand: palette.deepGreen,
  brandInset: '#0A2E24',
  brandLine: '#1B6A55',
  onBrand: palette.text,
  onBrandMuted: palette.softTeal,
  goldOnBrand: palette.gold,
  soft: palette.softTeal,
} as const;

export const colors: Record<ColorScheme, ColorTokens> = {
  dark: {
    ...shared,
    background: palette.nearBlack,
    surface: '#101E1B',
    surfaceMuted: '#132420',
    border: '#1C3530',
    text: palette.text,
    textMuted: palette.mutedText,
    accentText: palette.electricTeal,
    gold: palette.gold,
    warningSurface: '#21190C',
    ring: '#123A31',
    ringStrong: '#1B6A55',
    switchTrackOff: '#2D4A43',
    switchThumbOff: '#0F1C19',
    tabBar: '#0E1A17',
  },
  light: {
    ...shared,
    background: '#F3F8F6',
    surface: palette.white,
    surfaceMuted: '#E7F1EE',
    border: '#DCE9E4',
    text: palette.nearBlack,
    textMuted: '#4E6B63',
    accentText: '#0B7A64',
    gold: '#8A5A00',
    warningSurface: '#FBF1DC',
    ring: '#C8F2EA',
    ringStrong: '#8FE3D3',
    switchTrackOff: '#C9DAD4',
    switchThumbOff: palette.white,
    tabBar: palette.white,
  },
};
