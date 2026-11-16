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
import { SplashScreen } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth';
import { PreferencesProvider } from '@/features/preferences';
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <AuthProvider>
            <WalletProvider>
              <RootStack />
            </WalletProvider>
          </AuthProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { colors } = useTheme();
  const { status } = useAuth();
  const { status: walletStatus } = useWallet();
  const loading = status === 'loading' || (status === 'ready' && walletStatus === 'loading');
  // Only the very first session restore holds the splash screen. Later loading states
  // (e.g. fetching the profile right after sign-in) must keep the current screen mounted.
  const [restored, setRestored] = useState(false);
  const restoring = !restored && loading;
  if (!restored && !loading) setRestored(true);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  // Keep the splash screen up until the saved session has been restored.
  useEffect(() => {
    if (!restoring) SplashScreen.hideAsync().catch(() => undefined);
  }, [restoring]);

  if (restoring) return null;
  const signedIn = status === 'ready';
  const walletReady = signedIn && walletStatus === 'ready';

  return (
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
        <Stack.Screen name="send" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="receipt/[paymentId]" />
      </Stack.Protected>
      <Stack.Screen name="lab/sound" />
      <Stack.Screen name="lab/code" />
    </Stack>
  );
}
