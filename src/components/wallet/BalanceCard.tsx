import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AdireBand, Rings } from '@/components/brand';
import { AppText } from '@/components/ui';
import { formatMoney, groupDigits } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

interface BalanceCardProps {
  naira: number;
  usdc: number;
  accountNumber: string;
  initiallyHidden?: boolean;
}

const HIDDEN = '••••••';

export function BalanceCard({
  naira,
  usdc,
  accountNumber,
  initiallyHidden = false,
}: BalanceCardProps) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(initiallyHidden);
  const [whole, fraction] = naira.toFixed(2).split('.');
  const VisibilityIcon = hidden ? EyeOff : Eye;

  return (
    <View style={[styles.card, { backgroundColor: colors.brand }]}>
      <Rings
        radii={[40, 70, 100, 130]}
        color={colors.brandLine}
        center={{ x: 320, y: 80 }}
        opacity={0.7}
      />
      <View style={styles.top}>
        <AppText variant="bodyStrong" color="onBrandMuted">
          Naira balance
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balances' : 'Hide balances'}
          onPress={() => setHidden((h) => !h)}
          hitSlop={12}
        >
          <VisibilityIcon size={24} color={colors.onBrandMuted} strokeWidth={1.75} />
        </Pressable>
      </View>

      <AppText
        style={[styles.amount, { color: colors.onBrand }]}
        accessibilityLabel={hidden ? 'Balance hidden' : undefined}
      >
        {hidden ? (
          HIDDEN
        ) : (
          <>
            <AppText style={[styles.amount, { color: palette.softTeal }]}>₦</AppText>
            {groupDigits(whole ?? '0')}
            <AppText style={[styles.fraction, { color: palette.softTeal }]}>.{fraction}</AppText>
          </>
        )}
      </AppText>

      <View style={[styles.divider, { backgroundColor: colors.brandLine }]} />

      <View style={styles.footer}>
        <AppText variant="body" color="onBrand" style={styles.muted}>
          Dollars{' '}
          <AppText variant="bodyStrong" color="goldOnBrand">
            {hidden ? HIDDEN : `${formatMoney(usdc, 'USDC', { decimals: 2 })} USDC`}
          </AppText>
        </AppText>
        <AppText variant="body" color="onBrand" style={styles.muted}>
          Acct {accountNumber}
        </AppText>
      </View>

      <AdireBand color={colors.brandLine} style={styles.band} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 50,
    letterSpacing: -1.6,
    marginTop: 10,
  },
  fraction: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4 },
  divider: { height: 1, marginTop: 14, marginBottom: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  muted: { opacity: 0.92 },
  band: { marginTop: 18, opacity: 0.9 },
});
