import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { SplashScreen, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchScreen } from '@/components/brand';
import { ErrorScreen } from '@/components/ui';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ASSISTANT_ENABLED, OFFLINE_ENABLED } from '@/config/features';
import { AuthProvider, useAuth } from '@/features/auth';
import { IncomingBanner } from '@/components/notifications/IncomingBanner';
import { LockScreen } from '@/components/security/LockScreen';
import { NotificationsProvider } from '@/features/notifications';
import { useMoneyAgentRun } from '@/features/assistant';
import { useOfflineSync } from '@/features/offline';
import { takeLastCrash } from '@/lib/crashLog';
import { useAppUpdate } from '@/lib/useAppUpdate';
import { PreferencesProvider, usePreferences } from '@/features/preferences';
import { useWallet, WalletProvider } from '@/features/wallet';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash already hidden (e.g. fast refresh); safe to ignore.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const [appReady, setAppReady] = useState(false);
  const [launching, setLaunching] = useState(true);
  const markReady = useCallback(() => setAppReady(true), []);
  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const endLaunch = useCallback(() => setLaunching(false), []);

  return (
    <View style={styles.root}>
      {fontsLoaded || fontError ? (
        <SafeAreaProvider>
          <ThemeProvider>
            <PreferencesProvider>
              <AuthProvider>
                <WalletProvider>
                  <NotificationsProvider>
                    <RootStack onReady={markReady} />
                  </NotificationsProvider>
                </WalletProvider>
              </AuthProvider>
            </PreferencesProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ) : null}
      {launching ? <LaunchScreen ready={appReady} onShown={hideSplash} onDone={endLaunch} /> : null}
    </View>
  );
}

/** Replaces a screen that failed to load or crashed, with a way to try again. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <ErrorScreen onRetry={retry} />;
}

/** Settles offline payments in the background whenever the app is open and online. */
function OfflineSync() {
  useOfflineSync();
  return null;
}

/** Lets the money agent catch up whenever the app is opened. */
function MoneyAgentRunner() {
  useMoneyAgentRun(true);
  return null;
}

function RootStack({ onReady }: { onReady: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { status, profile, signOut } = useAuth();
  const {
    status: walletStatus,
    locked,
    biometricsAvailable,
    pinRequired,
    unlockWithPin,
    unlockWithBiometrics,
  } = useWallet();
  const { preferences } = usePreferences();
  const loading = status === 'loading' || (status === 'ready' && walletStatus === 'loading');
  // Only the very first session restore holds the splash screen. Later loading states
  // (e.g. fetching the profile right after sign-in) must keep the current screen mounted.
  const [restored, setRestored] = useState(false);
  const restoring = !restored && loading;
  if (!restored && !loading) setRestored(true);

  useAppUpdate();

  // If the app closed on an error last time, say why, so it can be reported.
  useEffect(() => {
    void takeLastCrash().then((text) => {
      if (text) {
        Alert.alert(
          'Faara closed unexpectedly last time',
          `Please take a screenshot of this and send it to support.\n\n${text}`,
        );
      }
    });
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  // The opening animation stays up until the saved session has been restored.
  useEffect(() => {
    if (!restoring) onReady();
  }, [restoring, onReady]);

  if (restoring) return null;
  const signedIn = status === 'ready';
  const walletReady = signedIn && walletStatus === 'ready';

  const showLock = walletReady && locked && preferences.appLock && profile !== null;

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && walletStatus === 'needsWallet'}>
          <Stack.Screen name="setup-wallet" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && walletStatus === 'needsRestore'}>
          <Stack.Screen name="restore-wallet" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={walletReady}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="hum" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="receive" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="wallet" />
          <Stack.Screen name="change-pin" />
          <Stack.Screen name="convert" />
          <Stack.Screen name="usdc-wallet" />
          <Stack.Screen name="personal-details" />
          <Stack.Screen name="limits" />
          <Stack.Screen name="help" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="add-money" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="send" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="receipt/[paymentId]" />
          <Stack.Screen name="offline/index" />
          <Stack.Screen name="offline/pay" />
          <Stack.Screen name="offline/receive" />
          <Stack.Screen name="assistant" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="scam-check" />
          <Stack.Screen name="agent" />
          <Stack.Screen name="request-new" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="vendor/index" />
          <Stack.Screen name="vendor/apply" />
          <Stack.Screen name="vendor/review" />
          <Stack.Screen name="vendor/till" />
          <Stack.Screen name="vendor/sticker" />
          <Stack.Screen name="support/index" />
          <Stack.Screen name="support/new" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="support/[id]" />
          <Stack.Screen name="admin/index" />
          <Stack.Screen name="admin/support" />
          <Stack.Screen name="admin/users" />
          <Stack.Screen name="admin/user/[uid]" />
          <Stack.Screen name="admin/payments" />
          <Stack.Screen name="admin/log" />
        </Stack.Protected>
        <Stack.Screen name="pay/[username]" options={{ animation: 'none' }} />
        <Stack.Screen name="r/[id]" />
        <Stack.Screen name="lab/sound" />
        <Stack.Screen name="lab/code" />
      </Stack>
      {walletReady && !showLock ? <IncomingBanner /> : null}
      {walletReady && OFFLINE_ENABLED ? <OfflineSync /> : null}
      {walletReady && ASSISTANT_ENABLED ? <MoneyAgentRunner /> : null}
      <OfflineBanner
        onPress={walletReady && OFFLINE_ENABLED ? () => router.push('/offline') : undefined}
      />
      {showLock ? (
        <LockScreen
          fullName={profile.fullName}
          biometrics={biometricsAvailable && !pinRequired && preferences.unlockWithFingerprint}
          onPin={unlockWithPin}
          onBiometrics={unlockWithBiometrics}
          onLogOut={signOut}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
