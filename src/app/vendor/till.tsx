import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import type { TillResponse } from '@shared/vendors';

import { HumPulse } from '@/components/hum';
import { AppText, Button, Card, Header, Screen, TextTabs, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { useBleBroadcast } from '@/features/ble';
import { useOfflineReceive } from '@/features/offline';
import { HUM_VOLUME_GAIN, usePreferences } from '@/features/preferences';
import { useHumBroadcaster } from '@/features/sound';
import { getTill, useTillFeed, type TillVoice } from '@/features/vendors';
import { apiErrorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/connectivity';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');
const money = (amountMinor: number, currency: 'NGN' | 'USDC') =>
  currency === 'USDC'
    ? `${formatMoney(amountMinor / 100, 'USDC', { decimals: 2 })} USDC`
    : naira(amountMinor);
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const tillKey = (uid: string) => `faara.till.v1.${uid}`;

const VOICES = ['english', 'pidgin', 'off'] as const;
const VOICE_LABELS: Record<TillVoice, string> = {
  english: 'English',
  pidgin: 'Pidgin',
  off: 'Silent',
};

/**
 * The vendor's till. While it's open the phone hums the shop's code and broadcasts it over
 * Bluetooth, so any number of customers can pay at once. Each payment appears in the list
 * and is read out loud. With no network it takes offline payments over Bluetooth instead.
 */
export default function TillScreen() {
  useKeepAwake();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const online = useOnline();
  const { preferences, setPreference } = usePreferences();
  const [till, setTill] = useState<TillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [since] = useState(() => Date.now());

  // The till code, kept on the phone so the till also opens with no network.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    AsyncStorage.getItem(tillKey(uid))
      .then((saved) => {
        if (saved && !cancelled) setTill(JSON.parse(saved) as TillResponse);
      })
      .catch(() => undefined);
    getTill()
      .then((fresh) => {
        if (cancelled) return;
        setTill(fresh);
        void AsyncStorage.setItem(tillKey(uid), JSON.stringify(fresh)).catch(() => undefined);
      })
      .catch((cause: unknown) => !cancelled && setError(apiErrorMessage(cause)));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const code = till?.code ?? null;
  const broadcaster = useHumBroadcaster();
  const bluetooth = useBleBroadcast(code);
  // With no network, customers' phones connect to this one to hand over offline payments.
  const offline = useOfflineReceive(Boolean(code) && !online);

  const { start, stop } = broadcaster;
  useEffect(() => {
    if (!code || !preferences.tillSound) return;
    void start(code, HUM_VOLUME_GAIN[preferences.humVolume]);
    return () => {
      void stop();
    };
  }, [code, preferences.tillSound, preferences.humVolume, start, stop]);

  const payments = useTillFeed(uid, since, preferences.tillVoice, till?.walletAddress ?? null);
  const totals = useMemo(
    () => ({
      naira: payments
        .filter((p) => p.currency === 'NGN')
        .reduce((sum, p) => sum + p.amountMinor, 0),
      usdc: payments
        .filter((p) => p.currency === 'USDC')
        .reduce((sum, p) => sum + p.amountMinor, 0),
    }),
    [payments],
  );

  if (!till) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Till</AppText>} />
        <View style={styles.center}>
          {error ? (
            <AppText color="gold" align="center">
              {error}
            </AppText>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      </Screen>
    );
  }

  const listening = broadcaster.state === 'humming' || bluetooth === 'active';
  const status = !online
    ? offline.blocker
      ? 'No network. Turn on Bluetooth to take payments.'
      : 'No network. Taking payments over Bluetooth.'
    : listening
      ? 'Customers can pay now. Several can pay at once.'
      : Platform.OS === 'web'
        ? 'On a computer, customers pay by scanning your sticker.'
        : 'Starting…';

  return (
    <Screen
      footer={
        <Button
          label="Shop sticker"
          variant="outline"
          onPress={() => router.push('/vendor/sticker')}
        />
      }
    >
      <Header center={<AppText variant="subheading">{till.businessName}</AppText>} />
      <View style={styles.body}>
        <Card tone="brand" padded style={styles.hero}>
          <HumPulse size={64} active={listening} />
          <AppText variant="title" color="onBrand" align="center">
            {naira(totals.naira)}
          </AppText>
          {totals.usdc > 0 ? (
            <AppText variant="bodyStrong" color="goldOnBrand" align="center">
              + {money(totals.usdc, 'USDC')}
            </AppText>
          ) : null}
          <AppText color="onBrandMuted" align="center">
            {payments.length} {payments.length === 1 ? 'payment' : 'payments'} since you opened the
            till
          </AppText>
          <View style={styles.status}>
            {!online ? <WifiOff size={14} color={colors.onBrandMuted} strokeWidth={1.75} /> : null}
            <AppText variant="label" color="onBrand" align="center">
              {status}
            </AppText>
          </View>
        </Card>

        <View style={styles.settings}>
          <AppText variant="label" color="textMuted">
            Read payments out loud
          </AppText>
          <TextTabs
            options={VOICES}
            labels={VOICE_LABELS}
            value={preferences.tillVoice}
            onChange={(voice) => setPreference('tillVoice', voice)}
          />
          <View style={styles.toggleRow}>
            <AppText style={styles.flex}>Hum out loud</AppText>
            <Toggle
              value={preferences.tillSound}
              onValueChange={(on) => setPreference('tillSound', on)}
              accessibilityLabel="Hum out loud"
            />
          </View>
          <AppText variant="label" color="textMuted">
            Bluetooth stays on either way. Turn the hum off if it’s too much for your shop.
          </AppText>
        </View>

        {payments.length === 0 ? (
          <AppText color="textMuted" align="center">
            Customers open Faara and tap Hum near this phone. Your shop shows up for them, and their
            payments appear here.
          </AppText>
        ) : (
          <View>
            {payments.map((payment) => (
              <View key={payment.id} style={[styles.row, { borderColor: colors.border }]}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{payment.fromName}</AppText>
                  <AppText variant="label" color="textMuted">
                    {time(payment.at)}
                    {payment.offline ? ' · settles when online' : ''}
                  </AppText>
                </View>
                <AppText variant="bodyStrong" color="accentText">
                  +{money(payment.amountMinor, payment.currency)}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  body: { gap: 20, marginTop: 16, paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  settings: { gap: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
