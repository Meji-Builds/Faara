import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { Currency } from '@/lib/money';
import { fonts, useTheme } from '@/theme';

const OPTIONS: Currency[] = ['NGN', 'USDC'];

interface CurrencyToggleProps {
  value: Currency;
  onChange: (currency: Currency) => void;
}

/** Text tabs with an underline on the active currency. */
export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {OPTIONS.map((option) => {
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
              {option}
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
