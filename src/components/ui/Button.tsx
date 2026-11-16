import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { radii, useTheme } from '@/theme';

import { AppText } from './AppText';

type ButtonVariant = 'primary' | 'outline' | 'text';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Leading icon element. */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** `accent` draws an electric-teal outline and label, for use on brand-green surfaces. */
  tone?: 'neutral' | 'accent';
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  tone = 'neutral',
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const containerStyle: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: colors.accent }
      : variant === 'outline'
        ? { borderWidth: 1.5, borderColor: tone === 'accent' ? colors.accent : colors.border }
        : {};

  const labelColor =
    variant === 'primary'
      ? 'onAccent'
      : tone === 'accent'
        ? 'accent'
        : variant === 'text'
          ? 'accentText'
          : 'text';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'text' ? styles.textButton : styles.button,
        containerStyle,
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accentText} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant="button" color={labelColor}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 60,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  textButton: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
