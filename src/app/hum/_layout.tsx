import { Stack } from 'expo-router/stack';

import { HumDraftProvider } from '@/features/hum';
import { useTheme } from '@/theme';

export default function HumLayout() {
  const { colors } = useTheme();
  return (
    <HumDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="humming" />
        <Stack.Screen name="recipient" />
        <Stack.Screen name="confirm" />
        <Stack.Screen name="success" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </HumDraftProvider>
  );
}
