import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

const BARS = 9;

/** Shown while a payment is going through: a hum travels along the bars. */
export function SendingWave({ label }: { label: string }) {
  const { colors } = useTheme();
  const [bars] = useState(() => Array.from({ length: BARS }, () => new Animated.Value(0)));

  useEffect(() => {
    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 80),
          Animated.timing(bar, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((BARS - index) * 80),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [bars]);

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={styles.bars}>
        {bars.map((bar, index) => (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                backgroundColor: colors.accent,
                transform: [
                  { scaleY: bar.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                ],
              },
            ]}
          />
        ))}
      </View>
      <AppText variant="label" color="textMuted" align="center">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 10, paddingVertical: 4 },
  bars: { flexDirection: 'row', alignItems: 'center', height: 28, gap: 5 },
  bar: { width: 4, height: 28, borderRadius: 2 },
});
