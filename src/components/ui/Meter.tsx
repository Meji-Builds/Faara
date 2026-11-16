import { StyleSheet, View } from 'react-native';

import { radii, useTheme } from '@/theme';

import { AppText } from './AppText';

interface MeterProps {
  label: string;
  /** 0–1. */
  value: number;
  /** Text shown on the right, e.g. the numeric value. */
  readout: string;
  /** Optional marker position (0–1), e.g. a detection threshold. */
  marker?: number;
}

export function Meter({ label, value, readout, marker }: MeterProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.wrapper} accessibilityLabel={`${label}: ${readout}`}>
      <View style={styles.labels}>
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
        <AppText variant="mono" color="text">
          {readout}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: colors.accent }]}
        />
        {marker !== undefined ? (
          <View
            style={[styles.marker, { left: `${marker * 100}%`, backgroundColor: colors.gold }]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2 },
});
