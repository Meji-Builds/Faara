import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface RingsProps {
  /** Radii of each ring in points, innermost first. */
  radii: readonly number[];
  color: string;
  strokeWidth?: number;
  /** Positions the rings' shared centre inside the parent. */
  center: { x: number; y: number };
  opacity?: number;
}

/**
 * Decorative concentric rings (the "hum" ripple). Absolutely positioned;
 * place inside a container with `overflow: 'hidden'` to crop.
 */
export function Rings({ radii, color, strokeWidth = 1.5, center, opacity = 1 }: RingsProps) {
  const outer = Math.max(...radii) + strokeWidth;
  const size = outer * 2;
  const position: ViewStyle = {
    left: center.x - outer,
    top: center.y - outer,
    width: size,
    height: size,
  };
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, position]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} opacity={opacity}>
        {radii.map((radius) => (
          <Circle
            key={radius}
            cx={outer}
            cy={outer}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}
