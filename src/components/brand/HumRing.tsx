import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import {
  BAR_INNER_RADIUS,
  BAR_MAX_LENGTH,
  BAR_THICKNESS,
  OUTER_RADIUS,
  barAngle,
  encodeWave,
  levelToRatio,
} from '@/features/wavecode';
import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { palette, radii } from '@/theme';

const SPIN_MS = 16_000;
const SWEEP_MS = 3_600;
/** The hum mark's five bars in the centre: relative heights and bounce periods. */
const EQUALISER = [
  { height: 0.34, period: 520 },
  { height: 0.67, period: 680 },
  { height: 1, period: 440 },
  { height: 0.67, period: 600 },
  { height: 0.34, period: 760 },
] as const;

interface HumRingProps {
  /** The 10-character hum code to encode. */
  token: string;
  /** Rendered width and height in points. */
  size: number;
  /** Spin, sweep and equaliser motion; off renders a still ring. */
  animated?: boolean;
  accessibilityLabel?: string;
}

/**
 * Faara's scannable hum ring: sound bars radiating from the hum mark, their lengths carrying
 * the code. The ring spins, a light sweeps around it and the mark dances; the scanner reads
 * the ring at any rotation, so it stays readable while it moves.
 */
export function HumRing({
  token,
  size,
  animated = true,
  accessibilityLabel = 'Faara hum ring',
}: HumRingProps) {
  const levels = useMemo(() => encodeWave(token), [token]);
  const [spin] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [bounce] = useState(() => EQUALISER.map(() => new Animated.Value(1)));

  useEffect(() => {
    if (!animated) return;
    const loop = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      );
    const animations = [
      loop(spin, SPIN_MS),
      loop(sweep, SWEEP_MS),
      ...bounce.map((value, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: 0.35,
              duration: EQUALISER[index]?.period ?? 500,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(value, {
              toValue: 1,
              duration: EQUALISER[index]?.period ?? 500,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
        ),
      ),
    ];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [animated, spin, sweep, bounce]);

  const unit = size / (2 * OUTER_RADIUS); // one disc radius in points
  const half = size / 2;

  const bars = (color: string) => (
    <Svg width={size} height={size}>
      {levels.map((level, index) => {
        const angle = barAngle(index);
        const from = (BAR_INNER_RADIUS + BAR_THICKNESS / 2) * unit;
        const to =
          (BAR_INNER_RADIUS + levelToRatio(level) * BAR_MAX_LENGTH - BAR_THICKNESS / 2) * unit;
        return (
          <Line
            key={index}
            x1={half + from * Math.cos(angle)}
            y1={half + from * Math.sin(angle)}
            x2={half + to * Math.cos(angle)}
            y2={half + to * Math.sin(angle)}
            stroke={color}
            strokeWidth={BAR_THICKNESS * unit}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const sweepDeg = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const sweepBack = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const markHeight = unit * 0.62;
  const markBar = unit * 0.1;

  return (
    <View
      style={[styles.card, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {/* The ring of bars, spinning. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spinDeg }] }]}>
        {bars(palette.electricTeal)}
      </Animated.View>

      {/* A quarter-turn of light sweeping the other way: the same bars in a lighter tint,
          visible only inside a rotating quadrant and counter-rotated to stay aligned. */}
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: sweepDeg }] }]}
        >
          <View style={[styles.quadrant, { left: half, width: half, height: half }]}>
            <Animated.View
              style={{
                position: 'absolute',
                left: -half,
                top: 0,
                width: size,
                height: size,
                transform: [{ rotate: sweepBack }, { rotate: spinDeg }],
              }}
            >
              {bars(palette.softTeal)}
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}

      {/* Centre disc with the hum mark dancing like an equaliser. */}
      <View style={[styles.disc, { width: unit * 2, height: unit * 2, borderRadius: unit }]}>
        {EQUALISER.map((bar, index) => (
          <Animated.View
            key={index}
            style={{
              width: markBar,
              height: markHeight * bar.height,
              borderRadius: markBar / 2,
              backgroundColor: palette.nearBlack,
              transform: [{ scaleY: bounce[index] ?? 1 }],
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.deepGreen,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  quadrant: { position: 'absolute', top: 0, overflow: 'hidden' },
  disc: {
    backgroundColor: palette.electricTeal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
