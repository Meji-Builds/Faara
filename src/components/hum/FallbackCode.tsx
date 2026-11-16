import { StyleSheet, View } from 'react-native';

import { humQrPayload } from '@shared/hum';

import { HumCode } from '@/components/brand';
import { AppText } from '@/components/ui';
import { fonts, radii, useTheme } from '@/theme';

interface FallbackCodeProps {
  token: string;
  manualCode: string;
}

/** "482913" → "482 913" */
const groupManualCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** QR code and six-digit code shown when no phone has claimed the hum within a few seconds. */
export function FallbackCode({ token, manualCode }: FallbackCodeProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.brand }]}>
      <HumCode value={humQrPayload(token)} size={208} accessibilityLabel="Faara payment code" />
      <AppText variant="overline" color="onBrandMuted">
        OR TYPE THIS CODE
      </AppText>
      <AppText
        style={[styles.code, { color: colors.onBrand }]}
        accessibilityLabel={`Code ${manualCode.split('').join(' ')}`}
      >
        {groupManualCode(manualCode)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 10, borderRadius: radii.xl, padding: 20 },
  code: { fontFamily: fonts.mono, fontSize: 34, lineHeight: 42, letterSpacing: 4 },
});
