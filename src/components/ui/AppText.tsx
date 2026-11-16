import { Text, type TextProps } from 'react-native';

import { textVariants, useTheme, type ColorTokens, type TextVariant } from '@/theme';

type ColorToken = {
  [K in keyof ColorTokens]: ColorTokens[K] extends string ? K : never;
}[keyof ColorTokens];

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Semantic colour token. Defaults to `text`. */
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
}

/** Themed text. Prefer this over the bare React Native `Text`. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        textVariants[variant],
        { color: colors[color] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
