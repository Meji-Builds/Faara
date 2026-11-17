import { Bluetooth } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { BleChannelState } from '@/features/ble';
import { radii, useTheme } from '@/theme';

interface BluetoothReminderProps {
  /** Channel state from `useBleBroadcast` / `useBleScan` while it should be running. */
  state: BleChannelState;
}

/**
 * Reminder shown when Bluetooth is switched off (Android app only). Opens the system
 * Bluetooth settings; the channel starts by itself when the person comes back.
 */
export function BluetoothReminder({ state }: BluetoothReminderProps) {
  const { colors } = useTheme();
  if (state !== 'off' && state !== 'denied') return null;
  const denied = state === 'denied';
  const open = () =>
    (denied
      ? Linking.openSettings()
      : Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')
    ).catch(() => Linking.openSettings());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={denied ? 'Allow Bluetooth for Faara' : 'Turn on Bluetooth'}
      onPress={open}
      style={[styles.banner, { backgroundColor: colors.warningSurface }]}
    >
      <Bluetooth size={20} color={colors.gold} strokeWidth={1.75} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color="gold">
          {denied ? 'Bluetooth permission is off' : 'Bluetooth is off'}
        </AppText>
        <AppText variant="label" color="gold">
          {denied
            ? 'Allow Nearby devices so phones connect faster.'
            : 'Turn it on so phones connect faster. Sound still works without it.'}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color="gold">
        {denied ? 'Allow' : 'Turn on'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.lg,
    padding: 14,
  },
  text: { flex: 1, gap: 2 },
});
