import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { formatPhoneInput, normalizePhoneInput } from '@/lib/phone';
import { inputFocusReset } from '@/lib/platformStyles';
import { fonts, radii, useTheme } from '@/theme';

import { AppText } from './AppText';

interface PhoneFieldProps {
  /** Digits as entered (see `normalizePhoneInput`); may include a leading trunk 0. */
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  countryCode?: string;
  autoFocus?: boolean;
}

export function PhoneField({
  value,
  onChangeText,
  label = 'Phone number',
  countryCode = '+234',
  autoFocus,
}: PhoneFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.row}>
        <View
          style={[
            styles.code,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
            },
          ]}
        >
          <AppText variant="bodyStrong" style={styles.codeText}>
            {countryCode}
          </AppText>
        </View>
        <View
          style={[
            styles.field,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.accent : colors.border,
              borderWidth: focused ? 2 : 1,
            },
          ]}
        >
          <TextInput
            value={formatPhoneInput(value)}
            onChangeText={(text) => onChangeText(normalizePhoneInput(text))}
            keyboardType="phone-pad"
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            autoFocus={autoFocus}
            accessibilityLabel={label}
            placeholder="803 123 4567"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, inputFocusReset, { color: colors.text }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { marginLeft: 2 },
  row: { flexDirection: 'row', gap: 8 },
  code: {
    width: 66,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: { fontSize: 16 },
  field: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  input: { fontFamily: fonts.body, fontSize: 16, paddingVertical: 14 },
});
