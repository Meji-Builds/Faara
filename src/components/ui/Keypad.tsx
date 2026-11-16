import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '@/theme';

import { AppText } from './AppText';

export type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'backspace';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

interface KeypadProps {
  onKeyPress: (key: KeypadKey) => void;
  /** Hide the decimal key (e.g. for whole-naira amounts). */
  allowDecimal?: boolean;
}

export function Keypad({ onKeyPress, allowDecimal = true }: KeypadProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => {
            if (key === '.' && !allowDecimal) return <View key={key} style={styles.key} />;
            return (
              <Pressable
                key={key}
                accessibilityRole="keyboardkey"
                accessibilityLabel={
                  key === 'backspace' ? 'Delete' : key === '.' ? 'Decimal point' : key
                }
                onPress={() => onKeyPress(key)}
                style={({ pressed }) => [
                  styles.key,
                  pressed && { backgroundColor: colors.surface },
                ]}
              >
                {key === 'backspace' ? (
                  <Delete size={26} color={colors.text} strokeWidth={1.75} />
                ) : (
                  <AppText style={styles.digit}>{key}</AppText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  key: { flex: 1, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: fonts.displayMedium, fontSize: 28, lineHeight: 34 },
});
