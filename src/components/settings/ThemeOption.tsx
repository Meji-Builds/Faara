import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors as themeColors, palette, radii, useTheme, type ThemePreference } from '@/theme';

interface ThemeOptionProps {
  option: ThemePreference;
  selected: boolean;
  onSelect: (option: ThemePreference) => void;
}

const LABEL: Record<ThemePreference, string> = { dark: 'Dark', light: 'Light', system: 'System' };

/** A miniature app preview used to pick the colour theme. */
export function ThemeOption({ option, selected, onSelect }: ThemeOptionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${LABEL[option]} theme`}
      accessibilityState={{ selected }}
      onPress={() => onSelect(option)}
      style={styles.option}
    >
      <View
        style={[
          styles.preview,
          {
            borderColor: selected ? colors.accent : colors.border,
            borderWidth: selected ? 2.5 : 1,
          },
        ]}
      >
        {option === 'system' ? (
          <View style={styles.split}>
            <View style={[styles.half, { backgroundColor: themeColors.light.background }]} />
            <View style={[styles.half, { backgroundColor: themeColors.dark.background }]} />
          </View>
        ) : (
          <MiniScreen scheme={option} />
        )}
      </View>
      <AppText variant="bodyStrong" align="center">
        {LABEL[option]}
      </AppText>
    </Pressable>
  );
}

function MiniScreen({ scheme }: { scheme: 'dark' | 'light' }) {
  const tokens = themeColors[scheme];
  const line = scheme === 'dark' ? '#1E3A33' : '#D9E7E2';
  return (
    <View style={[styles.mini, { backgroundColor: tokens.background }]}>
      <View style={[styles.miniCard, { backgroundColor: palette.deepGreen }]} />
      <View style={[styles.miniLine, { backgroundColor: line, width: '55%' }]} />
      <View style={[styles.miniLine, { backgroundColor: line, width: '40%' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flex: 1, gap: 10 },
  preview: { height: 84, borderRadius: radii.lg, overflow: 'hidden' },
  split: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },
  mini: { flex: 1, padding: 10, gap: 6 },
  miniCard: { height: 22, borderRadius: 6, marginBottom: 2 },
  miniLine: { height: 5, borderRadius: 3 },
});
