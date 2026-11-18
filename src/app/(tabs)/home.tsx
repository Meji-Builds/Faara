import { useIsFocused, useRouter } from 'expo-router';
import { ArrowDownUp, ArrowLeft, ArrowRight, Bell, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { HumMark } from '@/components/brand';
import { ListeningLine } from '@/components/hum';
import { AppText, Avatar, IconButton, Screen } from '@/components/ui';
import { ActivityList } from '@/components/wallet/ActivityList';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { QuickAction } from '@/components/wallet/QuickAction';
import { useActivity, useNairaBalance, useUsdcBalance } from '@/features/account';
import { CONVERT_ENABLED } from '@/config/features';
import { useProfile } from '@/features/auth';
import { useWalletUsdc } from '@/features/usdc/useWalletUsdc';
import { useAmbientReceive } from '@/features/hum';
import { takePendingRecipient } from '@/features/referral';
import { useNotifications } from '@/features/notifications';
import { usePreferences } from '@/features/preferences';
import { audioEngine } from '@/features/sound';
import { greeting } from '@/lib/greeting';
import { useAppActive } from '@/lib/useAppActive';
import { initials } from '@/lib/money';
import { faaraNumber } from '@/lib/phone';
import { palette, useTheme } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const profile = useProfile();
  const { preferences } = usePreferences();
  const naira = useNairaBalance();
  const usdc = useUsdcBalance();
  const walletUsdc = useWalletUsdc().cents;
  const activity = useActivity(10);
  const { unreadCount } = useNotifications();
  // Someone who opened a pay link before joining carries on to pay them.
  useEffect(() => {
    const to = takePendingRecipient();
    if (to) router.push({ pathname: '/send', params: { to } });
  }, [router]);

  const focused = useIsFocused();
  const appActive = useAppActive();

  // Listen for a hum while Home is on screen and the app is open (app only: browsers
  // need a tap before they allow the microphone). The Receive screen takes over from here.
  const ambient = Platform.OS !== 'web' && preferences.readyToReceive && focused && appActive;
  const { sound } = useAmbientReceive(ambient, (hum) =>
    router.push({
      pathname: '/receive',
      params: {
        token: hum.token,
        channel: hum.channel,
        ...(hum.distanceCm === undefined ? {} : { distanceCm: String(hum.distanceCm) }),
      },
    }),
  );
  const firstName = profile.fullName.split(/\s+/)[0] ?? profile.fullName;
  const iconProps = { size: 24, color: colors.text, strokeWidth: 1.75 } as const;

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <Avatar size={44} initials={initials(profile.fullName)} />
        <View style={styles.greeting}>
          <AppText variant="body" color="textMuted">
            {greeting()}
          </AppText>
          <AppText variant="subheading">{firstName}</AppText>
        </View>
        <IconButton
          accessibilityLabel={
            unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'
          }
          badge={unreadCount > 0}
          icon={<Bell {...iconProps} size={22} />}
          onPress={() => router.push('/notifications')}
        />
      </View>

      <BalanceCard
        key={preferences.hideBalances ? 'hidden' : 'shown'}
        naira={naira}
        usdc={usdc.value}
        faaraNumber={faaraNumber(profile.phone)}
        walletUsdc={walletUsdc}
        initiallyHidden={preferences.hideBalances}
      />

      <View style={styles.ready}>
        {ambient ? (
          <ListeningLine state={sound} onPress={() => router.push('/receive')} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Receive a hum"
            hitSlop={10}
            onPress={() => {
              // Unlock audio inside the tap (browsers), then listen for a hum.
              audioEngine.prepare();
              router.push('/receive');
            }}
            style={styles.receiveLink}
          >
            <ArrowLeft size={16} color={colors.accentText} strokeWidth={1.75} />
            <AppText variant="label" color="accentText">
              Receive a hum
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        <QuickAction
          label="Hum"
          highlighted
          listening={ambient && sound === 'listening'}
          icon={<HumMark size={20} color={palette.nearBlack} />}
          onPress={() => {
            audioEngine.prepare();
            router.push('/hum');
          }}
        />
        <QuickAction
          label="Send"
          icon={<ArrowRight {...iconProps} />}
          onPress={() => router.push('/send')}
        />
        <QuickAction
          label="Add money"
          icon={<Plus {...iconProps} />}
          onPress={() => router.push('/add-money')}
        />
        {CONVERT_ENABLED ? (
          <QuickAction
            label="Convert"
            icon={<ArrowDownUp {...iconProps} />}
            onPress={() => router.push('/convert')}
          />
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <AppText variant="heading">Recent</AppText>
        <AppText
          variant="bodyStrong"
          color="accentText"
          accessibilityRole="link"
          onPress={() => router.push('/activity')}
        >
          See all
        </AppText>
      </View>

      <View style={styles.list}>
        <ActivityList entries={activity} limit={4} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ready: { marginTop: 16 },
  receiveLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 18 },
  greeting: { flex: 1 },
  actions: { flexDirection: 'row', marginTop: 20, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 6,
  },
  list: { paddingBottom: 24 },
});
