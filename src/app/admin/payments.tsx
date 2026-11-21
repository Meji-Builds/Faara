import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AdminPayment } from '@shared/admin';

import { AppText, Header, Screen } from '@/components/ui';
import { recentPayments } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** The latest settled payments across Faara. */
export default function AdminPaymentsScreen() {
  const { colors } = useTheme();
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      recentPayments()
        .then((result) => active && setPayments(result.payments))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load payments. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Recent payments</AppText>} />
      <View style={styles.body}>
        {error ? <AppText color="gold">{error}</AppText> : null}
        {payments === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {payments?.length === 0 ? <AppText color="textMuted">No payments yet.</AppText> : null}
        {payments?.map((payment) => (
          <View key={payment.paymentId} style={[styles.row, { borderColor: colors.border }]}>
            <View style={styles.rowText}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                @{payment.from.username} → {payment.to ? `@${payment.to.username}` : 'unknown'}
              </AppText>
              <AppText variant="label" color="textMuted" numberOfLines={1}>
                {payment.kind} · {payment.channel} · {when(payment.settledAt)}
                {payment.note ? ` · ${payment.note}` : ''}
              </AppText>
              <AppText variant="label" color="textMuted">
                {payment.paymentId}
              </AppText>
            </View>
            <AppText variant="bodyStrong">
              {payment.currency === 'NGN'
                ? formatMoney(payment.amountMinor / 100, 'NGN')
                : `${(payment.amountMinor / 100).toFixed(2)} USDC`}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
});
