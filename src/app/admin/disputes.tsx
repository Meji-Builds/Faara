import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DISPUTE_REASON_LABELS, type Dispute } from '@shared/disputes';

import { AppText, Header, Screen, TextTabs } from '@/components/ui';
import { listDisputes } from '@/features/disputes';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const FILTERS = ['open', 'decided'] as const;
type Filter = (typeof FILTERS)[number];

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Payment disputes for Faara's team: open ones to decide, and decided ones for the record. */
export default function AdminDisputesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listDisputes()
        .then((result) => active && setDisputes(result.disputes))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load disputes. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const shown = (disputes ?? []).filter((d) =>
    filter === 'open' ? d.status === 'open' : d.status !== 'open',
  );

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Disputes</AppText>} />
      <View style={styles.tabs}>
        <TextTabs
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          labels={{ open: 'To decide', decided: 'Decided' }}
        />
      </View>
      {error ? (
        <AppText color="gold">{error}</AppText>
      ) : !disputes ? (
        <ActivityIndicator color={colors.accent} style={styles.gap} />
      ) : shown.length === 0 ? (
        <AppText color="textMuted" style={styles.gap}>
          {filter === 'open' ? 'Nothing to decide right now.' : 'No decided disputes yet.'}
        </AppText>
      ) : (
        shown.map((dispute) => (
          <Pressable
            key={dispute.paymentId}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/dispute/[paymentId]',
                params: { paymentId: dispute.paymentId },
              })
            }
            style={[styles.row, { borderColor: colors.border }]}
          >
            <View style={styles.flex}>
              <AppText variant="bodyStrong">
                @{dispute.payer.username} → @{dispute.payee.username}
              </AppText>
              <AppText variant="label" color="textMuted">
                {DISPUTE_REASON_LABELS[dispute.reason]} · {when(dispute.createdAt)}
                {dispute.approvals.length === 1 && dispute.status === 'open'
                  ? ' · 1 of 2 approvals'
                  : ''}
              </AppText>
            </View>
            <AppText variant="bodyStrong" color={dispute.status === 'open' ? 'gold' : 'textMuted'}>
              {dispute.currency === 'USDC'
                ? `${(dispute.amountMinor / 100).toFixed(2)} USDC`
                : formatMoney(dispute.amountMinor / 100, 'NGN')}
            </AppText>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { alignItems: 'flex-start', marginTop: 8, marginBottom: 8 },
  gap: { marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
});
