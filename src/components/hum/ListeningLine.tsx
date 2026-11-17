import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { ListenState } from '@/features/sound';
import { useTheme } from '@/theme';

const PEAKS = [0.5, 0.9, 0.65, 1, 0.55];

interface ListeningLineProps {
  state: ListenState;
  onPress: () => void;
}

/** One quiet line under the balance: Faara is listening for a hum, or can't. */
export function ListeningLine({ state, onPress }: ListeningLineProps) {
  const { colors } = useTheme();
  const blocked = state === 'denied' || state === 'error';
  const live = state === 'listening';
  const [bars] = useState(() => PEAKS.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (!live) return;
    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(bar, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [live, bars]);

  const tint = blocked ? colors.gold : colors.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={blocked ? 'Microphone is off. Fix it' : 'Listening for hums'}
      onPress={onPress}
      hitSlop={10}
      style={styles.row}
    >
      <View style={styles.bars}>
        {bars.map((bar, index) => (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                backgroundColor: tint,
                transform: [
                  {
                    scaleY: live
                      ? bar.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, PEAKS[index] ?? 1],
                        })
                      : 0.3,
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
      <AppText variant="label" color={blocked ? 'gold' : 'textMuted'}>
        {blocked ? 'Microphone is off · tap to fix' : live ? 'Listening for hums' : 'Starting up…'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  bar: { width: 3, height: 14, borderRadius: 2 },
});
