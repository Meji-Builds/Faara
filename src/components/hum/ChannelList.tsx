import { Bluetooth, QrCode, Sun, Volume2, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { fonts, useTheme } from '@/theme';

export type ChannelId = 'sound' | 'bluetooth' | 'light' | 'qr';

/** `active` channels are transmitting; `idle` ones are standing by. */
export interface ChannelStatus {
  id: ChannelId;
  state: 'active' | 'idle' | 'unavailable';
  statusLabel: string;
}

const CHANNEL_META: Record<ChannelId, { label: string; detail?: string; Icon: LucideIcon }> = {
  sound: { label: 'Sound', detail: '18–20 kHz', Icon: Volume2 },
  bluetooth: { label: 'Bluetooth LE', Icon: Bluetooth },
  light: { label: 'Light flash', Icon: Sun },
  qr: { label: 'QR code', Icon: QrCode },
};

export function ChannelList({ channels }: { channels: ChannelStatus[] }) {
  const { colors } = useTheme();
  return (
    <Card divided>
      {channels.map(({ id, state, statusLabel }) => {
        const { label, detail, Icon } = CHANNEL_META[id];
        const isActive = state === 'active';
        return (
          <View key={id} style={styles.row} accessibilityLabel={`${label}: ${statusLabel}`}>
            <Icon
              size={22}
              color={isActive ? colors.accentText : colors.textMuted}
              strokeWidth={1.75}
            />
            <AppText variant="bodyStrong" style={styles.label} numberOfLines={1}>
              {label}
              {detail ? <AppText color="textMuted">{` · ${detail}`}</AppText> : null}
            </AppText>
            <AppText
              variant="label"
              color={isActive ? 'accentText' : 'textMuted'}
              style={isActive && styles.activeStatus}
            >
              {statusLabel}
            </AppText>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    minHeight: 56,
  },
  label: { flex: 1, fontSize: 16 },
  activeStatus: { fontFamily: fonts.bodySemiBold },
});
