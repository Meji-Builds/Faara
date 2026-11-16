import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AvatarTone } from '@/data/fixtures';
import { fonts, palette, useTheme } from '@/theme';

import { AppText } from './AppText';

/** Avatar fills stay constant across themes; `surface` follows the theme. */
const TONE_BACKGROUND: Partial<Record<AvatarTone, string>> = {
  soft: palette.softTeal,
  gold: palette.gold,
};

const TONE_FOREGROUND: Record<Exclude<AvatarTone, 'surface'>, string> = {
  soft: palette.deepGreen,
  gold: '#3A2600',
};

interface AvatarProps {
  initials?: string;
  /** Icon shown instead of initials (e.g. a store icon for merchants). */
  icon?: ReactNode;
  size?: number;
  tone?: AvatarTone;
  /** Ring separating overlapping avatars. */
  outlineColor?: string;
}

export function Avatar({ initials, icon, size = 44, tone = 'soft', outlineColor }: AvatarProps) {
  const { colors } = useTheme();
  const background = TONE_BACKGROUND[tone] ?? colors.surfaceMuted;
  const foreground = tone === 'surface' ? colors.text : TONE_FOREGROUND[tone];

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        tone === 'surface' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        outlineColor ? { borderWidth: 3, borderColor: outlineColor } : null,
      ]}
    >
      {icon ?? (
        <AppText
          style={{
            fontFamily: fonts.displayBold,
            fontSize: size * 0.36,
            lineHeight: size * 0.44,
            color: foreground,
          }}
        >
          {initials}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
