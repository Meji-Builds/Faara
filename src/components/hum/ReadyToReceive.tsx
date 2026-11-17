import { Mic, MicOff } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { ListenState } from '@/features/sound';
import { radii, useTheme } from '@/theme';

interface ReadyToReceiveProps {
  state: ListenState;
  onPress: () => void;
}

/** Home indicator: Faara is (or isn't) listening for a hum while the app is open. */
export function ReadyToReceive({ state, onPress }: ReadyToReceiveProps) {
  const { colors } = useTheme();
  const blocked = state === 'denied' || state === 'error';
  const label = blocked
    ? 'Microphone is off. Tap to fix'
    : state === 'listening'
      ? 'Ready to receive'
      : 'Getting ready to receive…';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.dot, { backgroundColor: blocked ? colors.gold : colors.accent }]} />
      {blocked ? (
        <MicOff size={16} color={colors.gold} strokeWidth={1.75} />
      ) : (
        <Mic size={16} color={colors.accentText} strokeWidth={1.75} />
      )}
      <AppText variant="label" color={blocked ? 'gold' : 'textMuted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
