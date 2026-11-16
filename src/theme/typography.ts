import type { TextStyle } from 'react-native';

/** Font family names, as registered with `useFonts` in the root layout. */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displaySemiBold: 'BricolageGrotesque_600SemiBold',
  displayMedium: 'BricolageGrotesque_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export type TextVariant =
  | 'hero'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'overline'
  | 'button'
  | 'mono';

/**
 * Text styles. Headings and amounts use Bricolage Grotesque,
 * UI copy uses Inter, codes and references use JetBrains Mono.
 */
export const textVariants: Record<TextVariant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 64, lineHeight: 70, letterSpacing: -3 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -1.2 },
  heading: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  subheading: { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  button: { fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 22 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
};
