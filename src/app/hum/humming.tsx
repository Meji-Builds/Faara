import { Redirect, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { HUM_TOKEN_TTL_MS } from '@shared/hum';

import {
  BluetoothReminder,
  ChannelList,
  FallbackCode,
  HumPulse,
  OfflineHum,
  type ChannelStatus,
} from '@/components/hum';
import { AppText, Avatar, Button, Header, Screen } from '@/components/ui';
import { useBleBroadcast, type BleChannelState } from '@/features/ble';
import { cancelHum, createHum, useHumDraft } from '@/features/hum';
import { HUM_VOLUME_GAIN, usePreferences } from '@/features/preferences';
import { useHumBroadcaster } from '@/features/sound';
import { apiErrorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/connectivity';
import { initials } from '@/lib/money';
import { fonts, radii, useTheme } from '@/theme';

/** Show the hum ring and manual code if nobody has claimed within this long. */
const FALLBACK_AFTER_MS = 6000;
const AVATAR_TONES = ['soft', 'gold', 'surface'] as const;

const BLE_LABELS: Partial<Record<BleChannelState, string>> = {
  'not-on-platform': 'App only',
  'not-in-build': 'Update app',
  unsupported: 'Not supported',
  off: 'Turned off',
  denied: 'No permission',
  error: 'Unavailable',
};

function bluetoothStatus(state: BleChannelState, live: boolean): ChannelStatus {
  if (state === 'active') return { id: 'bluetooth', state: 'active', statusLabel: 'Broadcasting' };
  if (!live)
    return {
      id: 'bluetooth',
      state: 'idle',
      statusLabel: Platform.OS === 'web' ? 'App only' : 'Stopped',
    };
  const label = BLE_LABELS[state];
  return label
    ? { id: 'bluetooth', state: 'unavailable', statusLabel: label }
    : { id: 'bluetooth', state: 'idle', statusLabel: 'Starting' };
}

/**
 * A hum. With a network the server pairs the phones; with none (or if the network drops
 * before the hum starts) the same screen pays over Bluetooth from the offline pocket. Once
 * offline it stays offline, so a payment is never interrupted by the network coming back.
 */
export default function HummingScreen() {
  const online = useOnline();
  const [offline, setOffline] = useState(!online);
  if (!online && !offline) setOffline(true);
  return offline ? <OfflineHum /> : <OnlineHumming />;
}

function OnlineHumming() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amount, currency, note, amountLabel, session, setSession, claims } = useHumDraft();
  const broadcaster = useHumBroadcaster();
  const humVolume = usePreferences().preferences.humVolume;
  const [error, setError] = useState<string | null>(null);
  const [expiresAtLocal, setExpiresAtLocal] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const creating = useRef(false);

  const startHum = useCallback(() => {
    if (creating.current) return;
    creating.current = true;
    createHum(amount, currency, note)
      .then(
        (created) => {
          setSession(created);
          // Count down on the device clock; the server enforces the real expiry.
          setExpiresAtLocal(Date.now() + HUM_TOKEN_TTL_MS);
        },
        (cause: unknown) => setError(apiErrorMessage(cause)),
      )
      .finally(() => {
        creating.current = false;
      });
  }, [amount, currency, note, setSession]);

  // Issue the hum when the screen opens (with a real amount; a page refresh loses the draft).
  useEffect(() => {
    if (!session && amount > 0) startHum();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first open
  }, []);

  const remainingMs =
    expiresAtLocal === null ? HUM_TOKEN_TTL_MS : Math.max(0, expiresAtLocal - now);
  const expired = session !== null && remainingMs === 0;
  const { start: startBroadcast, stop: stopBroadcast } = broadcaster;
  const bleState = useBleBroadcast(session && !expired ? session.token : null);

  // Broadcast the code while it's valid.
  useEffect(() => {
    if (!session || expired) return;
    startBroadcast(session.token, HUM_VOLUME_GAIN[humVolume]);
    return () => {
      stopBroadcast();
    };
  }, [session, expired, startBroadcast, stopBroadcast, humVolume]);

  useEffect(() => {
    if (!session || expired) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [session, expired]);

  const leave = () => {
    if (session && claims.length === 0) cancelHum(session.paymentId).catch(() => undefined);
    setSession(null);
    router.back();
  };

  const humAgain = () => {
    setError(null);
    setSession(null);
    setExpiresAtLocal(null);
    startHum();
  };

  const seconds = Math.ceil(remainingMs / 1000);
  const elapsedMs = HUM_TOKEN_TTL_MS - remainingMs;
  const showFallback =
    session !== null && !expired && claims.length === 0 && elapsedMs >= FALLBACK_AFTER_MS;
  const fallbackIn = Math.max(0, Math.ceil((FALLBACK_AFTER_MS - elapsedMs) / 1000));
  const soundState: ChannelStatus =
    error || broadcaster.state === 'error'
      ? { id: 'sound', state: 'unavailable', statusLabel: 'Unavailable' }
      : expired
        ? { id: 'sound', state: 'idle', statusLabel: 'Stopped' }
        : broadcaster.state === 'humming'
          ? { id: 'sound', state: 'active', statusLabel: 'Humming' }
          : { id: 'sound', state: 'idle', statusLabel: 'Starting' };

  const channels: ChannelStatus[] = [
    soundState,
    bluetoothStatus(bleState, Boolean(session) && !expired),
    { id: 'light', state: 'unavailable', statusLabel: 'Coming soon' },
    session && !expired
      ? showFallback
        ? { id: 'qr', state: 'active', statusLabel: 'Showing' }
        : { id: 'qr', state: 'idle', statusLabel: `Backup in ${fallbackIn}s` }
      : { id: 'qr', state: 'idle', statusLabel: 'Ready' },
  ];

  const title = error
    ? 'Couldn’t start the hum'
    : expired && claims.length === 0
      ? 'Nobody caught it'
      : 'Hold phones close';
  const subtitle = error
    ? error
    : expired && claims.length === 0
      ? 'The code expired before a phone claimed it. Hold the phones closer and hum again.'
      : showFallback
        ? 'Still humming. If their phone can’t hear it, they can scan the ring or type the code in Receive.'
        : 'Faara is humming a one-time code. Your wallet address and amount never leave your phone.';

  if (!session && amount <= 0) return <Redirect href="/hum" />;

  return (
    <Screen
      footer={
        claims.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${claims.length} ${claims.length === 1 ? 'phone' : 'phones'} caught your hum. Tap to choose who gets paid.`}
            onPress={() => router.push('/hum/recipient')}
            style={({ pressed }) => [
              styles.claims,
              { backgroundColor: colors.brand, borderColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.avatars}>
              {claims.slice(0, 3).map((claim, index) => (
                <View key={claim.id} style={index > 0 && styles.overlap}>
                  <Avatar
                    size={40}
                    tone={AVATAR_TONES[index % AVATAR_TONES.length]}
                    initials={initials(claim.fullName)}
                    outlineColor={colors.brand}
                  />
                </View>
              ))}
            </View>
            <View style={styles.claimsText}>
              <AppText
                variant="subheading"
                color="onBrand"
                numberOfLines={1}
                style={styles.claimsTitle}
              >
                {claims.length === 1
                  ? '1 phone caught your hum'
                  : `${claims.length} phones caught your hum`}
              </AppText>
              <AppText variant="body" color="onBrandMuted" numberOfLines={1}>
                Tap to choose who gets paid
              </AppText>
            </View>
            <ChevronRight size={22} color={colors.accent} strokeWidth={2} />
          </Pressable>
        ) : error || expired ? (
          <Button label="Hum again" onPress={humAgain} />
        ) : null
      }
    >
      <Header
        onBack={leave}
        center={
          <AppText variant="subheading">
            Sending{' '}
            <AppText variant="subheading" color="accentText">
              {amountLabel}
            </AppText>
          </AppText>
        }
        right={
          session && !error ? (
            <AppText
              style={[styles.timer, { color: colors.gold }]}
              accessibilityLabel={expired ? 'Code expired' : `${seconds} seconds left`}
            >
              {expired ? 'Expired' : `${seconds}s`}
            </AppText>
          ) : null
        }
      />

      <View style={styles.pulse}>
        {showFallback && session ? (
          <FallbackCode token={session.token} manualCode={session.manualCode} />
        ) : (
          <HumPulse size={120} active={broadcaster.state === 'humming' && !expired} />
        )}
      </View>

      <View style={styles.copy}>
        <AppText variant="title" align="center" style={styles.title}>
          {title}
        </AppText>
        <AppText color={error ? 'gold' : 'textMuted'} align="center">
          {subtitle}
        </AppText>
      </View>

      <View style={styles.channels}>
        {session && !expired ? <BluetoothReminder state={bleState} /> : null}
        <ChannelList channels={channels} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  timer: { fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 22 },
  pulse: { alignItems: 'center', marginTop: 8 },
  copy: { gap: 10, paddingHorizontal: 12 },
  title: { fontSize: 30, lineHeight: 36 },
  channels: { marginTop: 24, marginBottom: 16, gap: 12 },
  claims: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatars: { flexDirection: 'row' },
  overlap: { marginLeft: -12 },
  claimsText: { flex: 1, gap: 2 },
  claimsTitle: { fontSize: 15 },
  pressed: { opacity: 0.9 },
});
