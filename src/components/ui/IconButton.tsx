import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

interface IconButtonProps {
  icon: ReactNode;
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  /** Small gold dot in the top-right corner (e.g. unread notifications). */
  badge?: boolean;
}

/** Circular outlined button used for back, settings and notifications. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 44,
  badge = false,
}: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2, borderColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      {icon}
      {badge ? <View style={[styles.badge, { backgroundColor: colors.gold }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4 },
});
