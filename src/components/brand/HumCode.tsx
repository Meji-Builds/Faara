import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { palette } from '@/theme';

import { buildHumCodeMatrix } from './humCodeMatrix';

const AnimatedG = Animated.createAnimatedComponent(G);

const INK = palette.deepGreen;
const PAPER = '#EAF7F2';
/** Quiet zone in modules; scanners need a light margin around the symbol. */
const QUIET = 3;
const WAVE_MS = 2200;
/** Darkest-to-lightest shading during the ripple. Kept high so modules always read as dark. */
const MIN_OPACITY = 0.74;
const DOT_RADIUS = 0.43;

interface HumCodeProps {
  /** Text to encode (e.g. "faara:hum:K72GEKVHAA"). */
  value: string;
  /** Rendered width and height in points. */
  size: number;
  /** Ripple and pulse animation; off renders a still code. */
  animated?: boolean;
  accessibilityLabel?: string;
}

/**
 * Faara's branded QR code: round dots, rounded finder squares, the hum mark in the centre,
 * and a ripple of shading moving outward like the hum. It is a standard QR code at error
 * correction level H, so any QR scanner reads it.
 */
export function HumCode({
  value,
  size,
  animated = true,
  accessibilityLabel = 'Faara payment code',
}: HumCodeProps) {
  const matrix = useMemo(() => buildHumCodeMatrix(value), [value]);
  const [wave] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) return;
    const loops = [
      Animated.loop(
        Animated.timing(wave, {
          toValue: 1,
          duration: WAVE_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ),
      Animated.loop(
        Animated.timing(pulse, {
          toValue: 1,
          duration: WAVE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [animated, wave, pulse]);

  const { modules, ringCount, total, cell } = useMemo(() => {
    const n = matrix.size;
    const totalModules = n + QUIET * 2;
    const centre = (n - 1) / 2;
    const half = (matrix.logoSpan - 1) / 2;
    const rings = Math.ceil(n / 2);
    const byRing: { r: number; c: number }[][] = Array.from({ length: rings }, () => []);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix.isDark(r, c) || matrix.isFinder(r, c)) continue;
        if (Math.abs(r - centre) <= half && Math.abs(c - centre) <= half) continue; // logo area
        const ring = Math.min(
          rings - 1,
          Math.floor(Math.max(Math.abs(r - centre), Math.abs(c - centre))),
        );
        byRing[ring]?.push({ r, c });
      }
    }
    return { modules: byRing, ringCount: rings, total: totalModules, cell: size / totalModules };
  }, [matrix, size]);

  const ringOpacity = (ring: number) => {
    if (!animated) return 1;
    // The wave passes ring k at phase k / ringCount, dimming it briefly.
    const p = ring / ringCount;
    const w = 0.12;
    const points = [0, p - w, p, p + w, 1]
      .map((x) => Math.min(1, Math.max(0, x)))
      .filter((x, i, all) => i === 0 || x > (all[i - 1] as number));
    const outputs = points.map((x) => (Math.abs(x - p) < 1e-9 ? MIN_OPACITY : 1));
    return points.length < 2 ? 1 : wave.interpolate({ inputRange: points, outputRange: outputs });
  };

  const o = QUIET * cell;
  const finderOrigins: [number, number][] = [
    [0, 0],
    [0, matrix.size - 7],
    [matrix.size - 7, 0],
  ];
  const logo = matrix.logoSpan * cell;
  const logoCentre = o + (matrix.size * cell) / 2;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.pulse,
            {
              borderColor: palette.electricTeal,
              borderRadius: cell * 4,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
              ],
            },
          ]}
        />
      ) : null}
      <Svg width={size} height={size} viewBox={`0 0 ${total * cell} ${total * cell}`}>
        <Rect x={0} y={0} width={total * cell} height={total * cell} rx={cell * 3} fill={PAPER} />

        {modules.map((ring, index) => (
          <AnimatedG key={index} opacity={ringOpacity(index)}>
            {ring.map(({ r, c }) => (
              <Circle
                key={`${r}-${c}`}
                cx={o + (c + 0.5) * cell}
                cy={o + (r + 0.5) * cell}
                r={cell * DOT_RADIUS}
                fill={INK}
              />
            ))}
          </AnimatedG>
        ))}

        {finderOrigins.map(([row, col]) => {
          const x = o + col * cell;
          const y = o + row * cell;
          return (
            <G key={`${row}-${col}`}>
              <Rect x={x} y={y} width={7 * cell} height={7 * cell} rx={cell * 2} fill={INK} />
              <Rect
                x={x + cell}
                y={y + cell}
                width={5 * cell}
                height={5 * cell}
                rx={cell * 1.4}
                fill={PAPER}
              />
              <Rect
                x={x + 2 * cell}
                y={y + 2 * cell}
                width={3 * cell}
                height={3 * cell}
                rx={cell}
                fill={INK}
              />
            </G>
          );
        })}

        <Circle cx={logoCentre} cy={logoCentre} r={logo * 0.5} fill={palette.electricTeal} />
        <Path d={humBarsPath(logoCentre, logoCentre, logo * 0.42)} fill={palette.nearBlack} />
      </Svg>
    </View>
  );
}

/** The five hum bars as one path, centred at (cx, cy), `height` tall. */
function humBarsPath(cx: number, cy: number, height: number): string {
  const heights = [0.34, 0.67, 1, 0.67, 0.34];
  const bar = height * 0.12;
  const step = height * 0.22;
  const left = cx - (step * 4 + bar) / 2;
  return heights
    .map((h, i) => {
      const barHeight = height * h;
      const x = left + i * step;
      const y = cy - barHeight / 2;
      const rx = bar / 2;
      return `M${x + rx},${y} h0 a${rx},${rx} 0 0 1 ${rx},${rx} v${barHeight - bar} a${rx},${rx} 0 0 1 ${-bar},0 v${-(barHeight - bar)} a${rx},${rx} 0 0 1 ${rx},${-rx} z`;
    })
    .join(' ');
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pulse: { borderWidth: 3 },
});
