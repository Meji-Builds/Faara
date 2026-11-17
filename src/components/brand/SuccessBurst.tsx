import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { palette, useTheme } from '@/theme';

interface SuccessBurstProps {
  size?: number;
}

const RINGS = [0, 160, 320];

/** The "paid" moment: a check drops in and rings travel outward, once. */
export function SuccessBurst({ size = 128 }: SuccessBurstProps) {
  const { colors } = useTheme();
  const [pop] = useState(() => new Animated.Value(0));
  const [rings] = useState(() => RINGS.map(() => new Animated.Value(0)));

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ...rings.map((ring, index) =>
        Animated.timing(ring, {
          toValue: 1,
          duration: 1300,
          delay: RINGS[index],
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pop, rings]);

  return (
    <View style={{ width: size, height: size }}>
      {rings.map((ring, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            {
              borderColor: colors.accent,
              opacity: ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
              transform: [
                { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) },
              ],
            },
          ]}
        />
      ))}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.disc,
          { backgroundColor: colors.accent, transform: [{ scale: pop }] },
        ]}
      >
        <Check size={size * 0.44} color={palette.nearBlack} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderRadius: 999, borderWidth: 2 },
  disc: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
