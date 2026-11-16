import { ArrowRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { CURRENCY_SYMBOL, groupDigits, initials, type Currency } from '@/lib/money';
import { fonts, palette, useTheme } from '@/theme';

interface PaymentHeaderProps {
  recipientName: string;
  amount: number;
  currency: Currency;
  note: string;
}

/** "You → TA", the amount, and "to Tolu Adebayo · note". */
export function PaymentHeader({ recipientName, amount, currency, note }: PaymentHeaderProps) {
  const { colors, scheme } = useTheme();
  const amountText = groupDigits(currency === 'USDC' ? amount.toFixed(2) : String(amount));
  return (
    <>
      <View style={styles.parties} accessibilityLabel={`From you to ${recipientName}`}>
        <View style={[styles.you, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="subheading" color="textMuted">
            You
          </AppText>
        </View>
        <ArrowRight size={36} color={colors.accent} strokeWidth={1.75} />
        <Avatar size={48} tone="soft" initials={initials(recipientName)} />
      </View>
      <AppText align="center" style={[styles.amount, { color: colors.text }]}>
        <AppText
          style={[
            styles.amount,
            { color: scheme === 'dark' ? palette.softTeal : colors.accentText },
          ]}
        >
          {CURRENCY_SYMBOL[currency]}
        </AppText>
        {amountText}
      </AppText>
      <AppText color="textMuted" align="center">
        to{' '}
        <AppText variant="bodyStrong" color="text">
          {recipientName}
        </AppText>
        {note ? ` · ${note}` : ''}
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  parties: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 20,
  },
  you: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 54,
    letterSpacing: -2,
    marginTop: 14,
  },
});
