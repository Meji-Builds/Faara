import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { fonts, radii, useTheme } from '@/theme';

import { AppText } from './AppText';

interface OtpFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
}

/**
 * One-time code input rendered as separate boxes. A single hidden TextInput
 * holds the value so paste and SMS autofill work on every platform.
 */
export function OtpField({ value, onChangeText, length = 6, autoFocus }: OtpFieldProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      accessibilityLabel={`${length}-digit code`}
      onPress={() => inputRef.current?.focus()}
      style={styles.row}
    >
      {Array.from({ length }, (_, index) => {
        const isActive = focused && index === activeIndex;
        return (
          <View
            key={index}
            style={[
              styles.box,
              {
                backgroundColor: colors.surface,
                borderColor: isActive ? colors.accent : colors.border,
                borderWidth: isActive ? 2 : 1,
              },
            ]}
          >
            <AppText style={styles.digit}>{value[index] ?? ''}</AppText>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.86,
    maxHeight: 60,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
