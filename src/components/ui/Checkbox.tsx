import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { palette, useTheme } from '@/theme';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Label content; may contain inline links. */
  children: ReactNode;
  accessibilityLabel: string;
}

export function Checkbox({ checked, onChange, children, accessibilityLabel }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        hitSlop={10}
        style={[
          styles.box,
          checked
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { borderColor: colors.textMuted },
        ]}
      >
        {checked ? <Check size={14} color={palette.nearBlack} strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.label}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
});
