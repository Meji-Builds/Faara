import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { radii, useTheme } from '@/theme';

/** A slow ring that leaves a tile now and then, like a hum leaving the phone. */
export function ListeningRipple({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        {
          borderColor: colors.accent,
          opacity: progress.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.6, 0] }),
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({ ring: { borderRadius: radii.lg + 2, borderWidth: 2 } });
