import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdireBand, HumMark, Rings, Wordmark } from '@/components/brand';
import { CurrencyToggle } from '@/components/hum';
import { AppText, Button, Header, Keypad, Screen, TextField } from '@/components/ui';
import { balances } from '@/data/fixtures';
import { useHumDraft } from '@/features/hum';
import { applyKeypadInput, CURRENCY_SYMBOL, formatMoney, groupDigits } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

/** Shrinks the amount as it grows so it always fits on one line. */
function amountFontSize(characters: number): number {
  if (characters <= 7) return 60;
  return Math.max(34, 60 - (characters - 7) * 6);
}

export default function AmountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { currency, amountInput, amount, note, setCurrency, setAmountInput, setNote } =
    useHumDraft();

  const display = groupDigits(amountInput);
  const fontSize = amountFontSize(display.length + 1);
  const exceedsBalance = amount > balances[currency];

  return (
    <Screen
      footer={
        <>
          <Button
            label="Hum it"
            icon={<HumMark size={20} color={palette.nearBlack} />}
            disabled={amount <= 0 || exceedsBalance}
            onPress={() => router.push('/hum/humming')}
          />
          <AppText variant="label" color="textMuted" align="center">
            Then hold phones close, about a foot apart
          </AppText>
        </>
      }
    >
      <Header
        center={<Wordmark size={26} />}
        right={<CurrencyToggle value={currency} onChange={setCurrency} />}
      />

      <View style={[styles.card, { backgroundColor: colors.brand }]}>
        <Rings
          radii={[40, 70, 100, 130]}
          color={colors.brandLine}
          center={{ x: 320, y: 40 }}
          opacity={0.7}
        />
        <AppText variant="overline" color="onBrandMuted">
          PAYING SOMEONE NEARBY
        </AppText>
        <AppText
          accessibilityLabel={`Amount ${formatMoney(amount, currency)}`}
          style={[styles.amount, { fontSize, lineHeight: fontSize * 1.12, color: colors.onBrand }]}
          numberOfLines={1}
        >
          <AppText style={[styles.amount, { fontSize, color: palette.softTeal }]}>
            {CURRENCY_SYMBOL[currency]}
          </AppText>
          {display}
        </AppText>
        <AppText variant="body" color="onBrand" style={styles.balance}>
          Balance {formatMoney(balances.NGN, 'NGN', { decimals: 2 })} ·{' '}
          <AppText variant="body" color="goldOnBrand">
            {formatMoney(balances.USDC, 'USDC', { decimals: 2 })} USDC
          </AppText>
        </AppText>
        {exceedsBalance ? (
          <AppText variant="label" color="goldOnBrand">
            {"That's more than your "}
            {currency === 'NGN' ? 'naira' : 'USDC'} balance.
          </AppText>
        ) : null}
        <View style={styles.note}>
          <TextField
            label="What's it for?"
            value={note}
            onChangeText={setNote}
            placeholder="Suya & drinks"
            maxLength={60}
            returnKeyType="done"
            onBrand
          />
        </View>
        <AdireBand color={colors.brandLine} style={styles.band} />
      </View>

      <View style={styles.keypad}>
        <Keypad
          allowDecimal={currency === 'USDC'}
          onKeyPress={(key) => setAmountInput(applyKeypadInput(amountInput, key))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 14,
    marginTop: 16,
    gap: 4,
  },
  amount: { fontFamily: fonts.display, letterSpacing: -2.4, marginTop: 6 },
  balance: { opacity: 0.92 },
  note: { marginTop: 18 },
  band: { marginTop: 22 },
  keypad: { flex: 1, justifyContent: 'center', paddingVertical: 20 },
});
