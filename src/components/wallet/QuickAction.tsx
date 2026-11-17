import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radii, useTheme } from '@/theme';

import { ListeningRipple } from './ListeningRipple';

interface QuickActionProps {
  label: string;
  icon: ReactNode;
  onPress?: () => void;
  highlighted?: boolean;
  /** Ripples outward to show Faara is listening for a hum. */
  listening?: boolean;
}

export function QuickAction({
  label,
  icon,
  onPress,
  highlighted = false,
  listening = false,
}: QuickActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.action}
    >
      {({ pressed }) => (
        <>
          <View>
            <ListeningRipple active={listening} />
            <View
              style={[
                styles.tile,
                { backgroundColor: highlighted ? colors.accent : colors.surfaceMuted },
                pressed && styles.pressed,
              ]}
            >
              {icon}
            </View>
          </View>
          <AppText variant="bodyStrong" align="center">
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1, alignItems: 'center', gap: 10 },
  tile: {
    width: 58,
    height: 58,
    borderRadius: radii.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
