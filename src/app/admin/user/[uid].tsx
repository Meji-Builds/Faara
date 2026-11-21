import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AdminUserDetail } from '@shared/admin';

import { TicketRow } from '@/components/support';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { getUser, pauseUser } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN', { decimals: 2 });
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Everything about one person's account, and pausing it if something is wrong. */
export default function AdminUserScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const id = String(uid ?? '');
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUser(await getUser(id));
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t load this account. Try again.'));
    }
  }, [id]);

  useEffect(() => {
    // Load the account once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const setPaused = async (paused: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await pauseUser(id, paused, reason.trim());
      setPausing(false);
      setReason('');
      await load();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t change that. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Account</AppText>} />
        {error ? (
          <AppText color="gold" style={styles.gap}>
            {error}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.gap} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Account</AppText>} />
      <View style={styles.body}>
        <View>
          <AppText variant="title">{user.fullName}</AppText>
          <AppText color="textMuted">
            @{user.username} · {user.phone}
          </AppText>
          <AppText variant="label" color="textMuted">
            Joined {user.createdAt ? day(user.createdAt) : 'unknown'} · Tier {user.verificationTier}{' '}
            · {user.uid}
          </AppText>
        </View>

        {user.paused ? (
          <Card padded style={{ ...styles.card, borderColor: colors.gold, borderWidth: 1 }}>
            <AppText variant="bodyStrong" color="gold">
              Paused by @{user.paused.by} on {day(user.paused.at)}
            </AppText>
            <AppText color="textMuted">{user.paused.reason}</AppText>
            <Button
              label="Unpause account"
              variant="outline"
              loading={busy}
              onPress={() => setPaused(false)}
            />
          </Card>
        ) : pausing ? (
          <Card padded style={styles.card}>
            <TextField
              label="Why pause this account?"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Reported for fraud, checking payments"
            />
            <Button
              label="Pause payments"
              disabled={reason.trim().length < 5}
              loading={busy}
              onPress={() => setPaused(true)}
            />
            <Button label="Cancel" variant="text" onPress={() => setPausing(false)} />
          </Card>
        ) : (
          <Button label="Pause this account" variant="outline" onPress={() => setPausing(true)} />
        )}
        {error ? <AppText color="gold">{error}</AppText> : null}

        <Card padded style={styles.card}>
          <AppText variant="label" color="textMuted">
            Naira balance
          </AppText>
          <AppText variant="subheading">{naira(user.nairaKobo)}</AppText>
          <AppText variant="label" color="textMuted">
            USDC wallet: {user.usdcAddress ?? 'not created'}
          </AppText>
          <AppText variant="label" color="textMuted">
            Vendor:{' '}
            {user.vendor
              ? `${user.vendor.businessName} (${user.vendor.category})`
              : user.vendorApplication
                ? `application ${user.vendorApplication}`
                : 'no'}
          </AppText>
          <AppText variant="label" color="textMuted">
            Offline pocket:{' '}
            {user.pocket
              ? `${naira(user.pocket.remainingKobo)} of ${naira(user.pocket.limitKobo)} left, until ${day(user.pocket.expiresAt)}`
              : 'none'}
          </AppText>
        </Card>

        <View>
          <AppText variant="overline" color="textMuted" style={styles.section}>
            RECENT PAYMENTS
          </AppText>
          {user.activity.length === 0 ? <AppText color="textMuted">None yet.</AppText> : null}
          {user.activity.map((entry) => (
            <View key={entry.paymentId} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.rowText}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {entry.direction === 'in' ? 'From' : 'To'} {entry.counterpartyName || 'unknown'}
                </AppText>
                <AppText variant="label" color="textMuted" numberOfLines={1}>
                  {entry.kind} · {entry.channel ?? '—'} · {when(entry.createdAt)} ·{' '}
                  {entry.paymentId}
                </AppText>
              </View>
              <AppText
                variant="bodyStrong"
                color={entry.direction === 'in' ? 'accentText' : 'text'}
              >
                {entry.direction === 'in' ? '+' : '−'}
                {entry.currency === 'NGN'
                  ? formatMoney(entry.amountMinor / 100, 'NGN')
                  : `${(entry.amountMinor / 100).toFixed(2)} USDC`}
              </AppText>
            </View>
          ))}
        </View>

        <View>
          <AppText variant="overline" color="textMuted" style={styles.section}>
            SUPPORT TICKETS
          </AppText>
          {user.tickets.length === 0 ? <AppText color="textMuted">None.</AppText> : null}
          {user.tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onPress={() => router.push({ pathname: '/support/[id]', params: { id: ticket.id } })}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  card: { gap: 8 },
  section: { marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
});
