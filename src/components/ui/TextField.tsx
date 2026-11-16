import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { inputFocusReset } from '@/lib/platformStyles';
import { fonts, radii, useTheme } from '@/theme';

import { AppText } from './AppText';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Element rendered inside the field, before the input (e.g. "@"). */
  leading?: ReactNode;
  /** Helper or validation message under the field. */
  hint?: ReactNode;
  /** Field sits on a brand-green surface. */
  onBrand?: boolean;
}

export function TextField({
  label,
  leading,
  hint,
  onBrand = false,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = focused ? colors.accent : onBrand ? colors.brandLine : colors.border;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText
          variant="label"
          color={onBrand ? 'onBrandMuted' : 'textMuted'}
          style={styles.label}
        >
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: onBrand ? colors.brandInset : colors.surface,
            borderColor,
            borderWidth: focused ? 2 : 1,
          },
        ]}
      >
        {leading}
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, inputFocusReset, { color: onBrand ? colors.onBrand : colors.text }]}
        />
      </View>
      {hint}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { marginLeft: 2 },
  field: {
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 14 },
});
