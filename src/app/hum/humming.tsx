import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ChannelList, HumPulse, type ChannelStatus } from '@/components/hum';
import { AppText, Avatar, Header, Screen } from '@/components/ui';
import { sampleClaimants } from '@/data/fixtures';
import { useHumDraft } from '@/features/hum';
import { initials } from '@/lib/money';
import { fonts, radii, useTheme } from '@/theme';

/** Matches the backend token lifetime. */
const TOKEN_TTL_SECONDS = 30;
/** Silence before the QR fallback is offered. */
const QR_FALLBACK_SECONDS = 3;

export default function HummingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amountLabel } = useHumDraft();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (elapsed >= TOKEN_TTL_SECONDS) return;
    const timer = setTimeout(() => setElapsed((s) => s + 1), 1000);
    return () => clearTimeout(timer);
  }, [elapsed]);

  const remaining = TOKEN_TTL_SECONDS - elapsed;
  const expired = remaining <= 0;
  const qrCountdown = Math.max(QR_FALLBACK_SECONDS - elapsed, 0);

  // Static channel states for the design stage; driven by the channel race from milestone 3.
  const channels: ChannelStatus[] = [
    { id: 'sound', state: 'active', statusLabel: 'Humming' },
    Platform.OS === 'web'
      ? { id: 'bluetooth', state: 'unavailable', statusLabel: 'App only' }
      : { id: 'bluetooth', state: 'active', statusLabel: 'Broadcasting' },
    { id: 'light', state: 'idle', statusLabel: 'Ready' },
    {
      id: 'qr',
      state: 'idle',
      statusLabel: qrCountdown > 0 ? `Backup in ${qrCountdown}s` : 'Ready',
    },
  ];

  const claimants = sampleClaimants;

  return (
    <Screen
      footer={
        claimants.length > 0 && !expired ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${claimants.length} phones caught your hum. Tap to choose who gets paid.`}
            onPress={() => router.push('/hum/recipient')}
            style={({ pressed }) => [
              styles.claims,
              { backgroundColor: colors.brand, borderColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.avatars}>
              {claimants.slice(0, 3).map((claimant, index) => (
                <View key={claimant.id} style={index > 0 && styles.overlap}>
                  <Avatar
                    size={40}
                    tone={claimant.tone}
                    initials={initials(claimant.name)}
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
                {claimants.length === 1
                  ? '1 phone caught your hum'
                  : `${claimants.length} phones caught your hum`}
              </AppText>
              <AppText variant="body" color="onBrandMuted" numberOfLines={1}>
                Tap to choose who gets paid
              </AppText>
            </View>
            <ChevronRight size={22} color={colors.accent} strokeWidth={2} />
          </Pressable>
        ) : null
      }
    >
      <Header
        center={
          <AppText variant="subheading">
            Sending{' '}
            <AppText variant="subheading" color="accentText">
              {amountLabel}
            </AppText>
          </AppText>
        }
        right={
          <AppText
            style={[styles.timer, { color: colors.gold }]}
            accessibilityLabel={`${remaining} seconds left`}
          >
            {expired ? 'Expired' : `${remaining}s`}
          </AppText>
        }
      />

      <View style={styles.pulse}>
        <HumPulse size={120} active={!expired} />
      </View>

      <View style={styles.copy}>
        <AppText variant="title" align="center" style={styles.title}>
          {expired ? 'Hum expired' : 'Hold phones close'}
        </AppText>
        <AppText color="textMuted" align="center">
          {expired
            ? 'Nobody was paid. Go back and hum again.'
            : 'Faara is humming a one-time code. Your wallet address and amount never leave your phone.'}
        </AppText>
      </View>

      <View style={styles.channels}>
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
  channels: { marginTop: 24, marginBottom: 16 },
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
