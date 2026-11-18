import { Stack } from 'expo-router/stack';

import { useTheme } from '@/theme';

export default function OfflineLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="pay" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="receive" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
