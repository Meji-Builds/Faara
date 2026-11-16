import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '@/theme';

import { AppText } from './AppText';

interface TextTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Display labels; defaults to the option values. */
  labels?: Partial<Record<T, string>>;
}

/** Text tabs with an underline on the active option. */
export function TextTabs<T extends string>({ options, value, onChange, labels }: TextTabsProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            hitSlop={8}
            style={styles.option}
          >
            <AppText style={[styles.label, { color: active ? colors.text : colors.textMuted }]}>
              {labels?.[option] ?? option}
            </AppText>
            <View
              style={[
                styles.underline,
                { backgroundColor: active ? colors.accent : 'transparent' },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16 },
  option: { alignItems: 'center', paddingTop: 12 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  underline: {
    height: 2.5,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginTop: 8,
    marginHorizontal: -2,
  },
});
