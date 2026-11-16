import { Text, type TextStyle } from 'react-native';

import { fonts, useTheme } from '@/theme';

interface WordmarkProps {
  size?: number;
  color?: string;
  style?: TextStyle;
}

/** The "fàárà" wordmark, set in Bricolage Grotesque ExtraBold. */
export function Wordmark({ size = 28, color, style }: WordmarkProps) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Faara"
      style={[
        {
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: size * 1.2,
          letterSpacing: -size * 0.03,
          color: color ?? colors.text,
        },
        style,
      ]}
    >
      fàárà
    </Text>
  );
}
