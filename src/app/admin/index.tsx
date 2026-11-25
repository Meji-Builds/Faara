import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AdminOverview } from '@shared/admin';

import { FeeWalletCard } from '@/components/admin/FeeWalletCard';
import { AppText, Card, Header, ListRow, Screen } from '@/components/ui';
import { getOverview } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { radii, useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Faara's team: the state of things today, and where to act. */
export default function AdminScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getOverview()
        .then((result) => active && setOverview(result))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load the dashboard. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const tile = (label: string, value: string, onPress?: () => void, alert = false) => (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: alert ? colors.gold : colors.border },
      ]}
    >
      <AppText variant="title" color={alert ? 'gold' : 'text'}>
        {value}
      </AppText>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Admin</AppText>} />
      {error ? (
        <AppText color="gold" style={styles.gap}>
          {error}
        </AppText>
      ) : !overview ? (
        <ActivityIndicator color={colors.accent} style={styles.gap} />
      ) : (
        <View style={styles.body}>
          <Card tone="brand" padded style={styles.today}>
            <AppText variant="overline" color="onBrandMuted">
              PAYMENTS TODAY (LAGOS TIME)
            </AppText>
            <AppText variant="title" color="onBrand">
              {formatMoney(overview.paymentsToday.nairaKobo / 100, 'NGN')}
            </AppText>
            <AppText color="onBrandMuted">{overview.paymentsToday.count} naira payments</AppText>
          </Card>

          <View style={styles.grid}>
            {tile(
              'Open tickets',
              String(overview.openTickets),
              () => router.push('/admin/support'),
              overview.openTickets > 0,
            )}
            {tile(
              'Vendors to review',
              String(overview.pendingVendors),
              () => router.push('/vendor/review'),
              overview.pendingVendors > 0,
            )}
            {tile('Users', String(overview.users), () => router.push('/admin/users'))}
            {tile('Vendors', String(overview.vendors))}
            {tile(
              'Paused accounts',
              String(overview.pausedAccounts),
              undefined,
              overview.pausedAccounts > 0,
            )}
            {tile('Open offline pockets', String(overview.openPockets))}
          </View>

          <FeeWalletCard />

          <Card divided>
            <ListRow label="Payment disputes" onPress={() => router.push('/admin/disputes')} />
            <ListRow label="Support tickets" onPress={() => router.push('/admin/support')} />
            <ListRow label="Vendor applications" onPress={() => router.push('/vendor/review')} />
            <ListRow label="Find a user" onPress={() => router.push('/admin/users')} />
            <ListRow label="Recent payments" onPress={() => router.push('/admin/payments')} />
            <ListRow label="Admin log" onPress={() => router.push('/admin/log')} />
          </Card>

          {overview.recentLog.length > 0 ? (
            <View>
              <AppText variant="overline" color="textMuted" style={styles.section}>
                LATEST ADMIN ACTIONS
              </AppText>
              {overview.recentLog.map((entry) => (
                <AppText key={entry.id} variant="label" color="textMuted" style={styles.logLine}>
                  {when(entry.at)} · @{entry.admin} · {entry.action}
                  {entry.target ? ` · @${entry.target}` : ''}
                </AppText>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  today: { gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  section: { marginBottom: 6 },
  logLine: { paddingVertical: 4 },
});
