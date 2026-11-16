import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HumPulse } from '@/components/hum';
import { AppText, Button, Card } from '@/components/ui';
import {
  DEFAULT_MODEM_CONFIG,
  frameDurationMs,
  randomCode,
  useHumBroadcaster,
} from '@/features/sound';
import { fonts, radii, useTheme } from '@/theme';

const VOLUMES = [
  { label: 'Quiet', value: 0.15 },
  { label: 'Normal', value: 0.5 },
  { label: 'Loud', value: 1 },
] as const;

/** Formats a code in two groups of five for reading across a table. */
const groupCode = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`;

export function SendPanel() {
  const { colors } = useTheme();
  const broadcaster = useHumBroadcaster();
  const [code, setCode] = useState(randomCode);
  const [volume, setVolume] = useState<number>(VOLUMES[1].value);
  const humming = broadcaster.state === 'humming';

  const restartWith = async (nextCode: string, nextVolume: number) => {
    if (humming) await broadcaster.start(nextCode, nextVolume);
  };

  const frameMs = frameDurationMs();
  const cycleMs = frameMs + DEFAULT_MODEM_CONFIG.repeatGapMs;

  return (
    <View style={styles.panel}>
      <Card tone="brand" padded style={styles.codeCard}>
        <AppText variant="overline" color="onBrandMuted">
          CODE BEING HUMMED
        </AppText>
        <AppText
          style={[styles.code, { color: colors.onBrand }]}
          accessibilityLabel={`Code ${code.split('').join(' ')}`}
        >
          {groupCode(code)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New code"
          onPress={() => {
            const next = randomCode();
            setCode(next);
            restartWith(next, volume);
          }}
          style={styles.newCode}
          hitSlop={8}
        >
          <RefreshCw size={16} color={colors.accent} strokeWidth={2} />
          <AppText variant="bodyStrong" color="accent">
            New code
          </AppText>
        </Pressable>
      </Card>

      <View style={styles.section}>
        <AppText variant="overline" color="textMuted">
          VOLUME
        </AppText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {VOLUMES.map((option) => {
            const selected = option.value === volume;
            return (
              <Pressable
                key={option.label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  setVolume(option.value);
                  restartWith(code, option.value);
                }}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { borderColor: colors.border },
                ]}
              >
                <AppText variant="bodyStrong" color={selected ? 'onAccent' : 'text'}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" color="textMuted">
          Media volume on the phone must be up. Quiet keeps the range to about 30 cm.
        </AppText>
      </View>

      <View style={styles.pulse}>
        <HumPulse size={84} active={humming} />
      </View>

      <AppText variant="caption" color="textMuted" align="center">
        18–20 kHz · frame {frameMs} ms · repeats every {cycleMs} ms
      </AppText>

      {broadcaster.error ? (
        <AppText variant="label" color="gold" align="center">
          {broadcaster.error}
        </AppText>
      ) : null}

      <Button
        label={humming ? 'Stop humming' : 'Start humming'}
        variant={humming ? 'outline' : 'primary'}
        loading={broadcaster.state === 'starting'}
        disabled={!broadcaster.available}
        onPress={() => (humming ? broadcaster.stop() : broadcaster.start(code, volume))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 20 },
  codeCard: { gap: 10 },
  code: { fontFamily: fonts.mono, fontSize: 32, lineHeight: 40, letterSpacing: 3 },
  newCode: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  section: { gap: 10 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: { alignItems: 'center' },
});
