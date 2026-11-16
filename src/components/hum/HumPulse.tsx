import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { HumMark } from '@/components/brand';
import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { palette, useTheme } from '@/theme';

const WAVE_COUNT = 3;
const WAVE_DURATION_MS = 2400;
/** Fixed rings drawn around the core, as multiples of its diameter. */
const STATIC_RINGS = [1.6, 2.1] as const;

interface HumPulseProps {
  /** Diameter of the solid teal core. */
  size?: number;
  /** Animate expanding waves. Static rings are drawn when false. */
  active?: boolean;
}

/** Teal core with the hum mark and rippling rings: the visual for an active hum. */
export function HumPulse({ size = 120, active = true }: HumPulseProps) {
  const { colors } = useTheme();
  const [progress] = useState(() =>
    Array.from({ length: WAVE_COUNT }, () => new Animated.Value(0)),
  );

  useEffect(() => {
    if (!active) return;
    const loops = progress.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((WAVE_DURATION_MS / WAVE_COUNT) * index),
          Animated.timing(value, {
            toValue: 1,
            duration: WAVE_DURATION_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
      progress.forEach((value) => value.setValue(0));
    };
  }, [active, progress]);

  const container = size * 2.2;

  return (
    <View
      style={[styles.container, { width: container, height: container }]}
      accessibilityRole="image"
      accessibilityLabel={active ? 'Humming' : 'Hum'}
    >
      {STATIC_RINGS.map((scale) => (
        <View
          key={scale}
          style={[
            styles.ring,
            {
              width: size * scale,
              height: size * scale,
              borderRadius: (size * scale) / 2,
              borderColor: scale > 2 ? colors.ring : colors.ringStrong,
            },
          ]}
        />
      ))}
      {active
        ? progress.map((value, index) => (
            <Animated.View
              key={index}
              style={[
                styles.ring,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: colors.accent,
                  opacity: value.interpolate({
                    inputRange: [0, 0.15, 1],
                    outputRange: [0, 0.5, 0],
                  }),
                  transform: [
                    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) },
                  ],
                },
              ]}
            />
          ))
        : null}
      <View
        style={[
          styles.core,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
        ]}
      >
        <HumMark size={size * 0.3} color={palette.nearBlack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  core: { alignItems: 'center', justifyContent: 'center' },
});
