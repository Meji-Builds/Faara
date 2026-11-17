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
import { SplashScreen, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchScreen } from '@/components/brand';
import { ErrorScreen } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth';
import { IncomingBanner } from '@/components/notifications/IncomingBanner';
import { LockScreen } from '@/components/security/LockScreen';
import { NotificationsProvider } from '@/features/notifications';
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

function RootStack({ onReady }: { onReady: () => void }) {
  const { colors } = useTheme();
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
          <Stack.Screen name="notifications" />
          <Stack.Screen name="add-money" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="send" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="receipt/[paymentId]" />
        </Stack.Protected>
        <Stack.Screen name="lab/sound" />
        <Stack.Screen name="lab/code" />
      </Stack>
      {walletReady && !showLock ? <IncomingBanner /> : null}
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
