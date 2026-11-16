import { useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

const PERIOD = 18;
const HEIGHT = 6;

interface AdireBandProps {
  color: string;
  opacity?: number;
  style?: ViewStyle;
}

/** The brand pattern: a repeating band of dots and dashes. Stretches to its container's width. */
export function AdireBand({ color, opacity = 1, style }: AdireBandProps) {
  const patternId = `adire-${useId().replace(/:/g, '')}`;
  return (
    <View
      style={[styles.band, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={HEIGHT} opacity={opacity}>
        <Defs>
          <Pattern
            id={patternId}
            x={0}
            y={0}
            width={PERIOD}
            height={HEIGHT}
            patternUnits="userSpaceOnUse"
          >
            <Circle cx={3} cy={HEIGHT / 2} r={2.5} fill={color} />
            <Rect x={8} y={HEIGHT / 2 - 1} width={7} height={2} rx={1} fill={color} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height={HEIGHT} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: HEIGHT, width: '100%', overflow: 'hidden' },
});
