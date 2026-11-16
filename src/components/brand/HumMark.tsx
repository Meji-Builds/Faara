import Svg, { Rect } from 'react-native-svg';

const BAR_WIDTH = 14;
const BAR_STEP = 26;
const BAR_HEIGHTS = [40, 80, 120, 80, 40] as const;
const VIEWBOX_WIDTH = BAR_STEP * (BAR_HEIGHTS.length - 1) + BAR_WIDTH;
const VIEWBOX_HEIGHT = 120;

interface HumMarkProps {
  /** Rendered height in points; width follows the mark's aspect ratio. */
  size: number;
  color: string;
}

/** The Faara mark: five sound-wave bars. */
export function HumMark({ size, color }: HumMarkProps) {
  const width = (size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;
  return (
    <Svg
      width={width}
      height={size}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {BAR_HEIGHTS.map((height, index) => (
        <Rect
          key={index}
          x={index * BAR_STEP}
          y={(VIEWBOX_HEIGHT - height) / 2}
          width={BAR_WIDTH}
          height={height}
          rx={BAR_WIDTH / 2}
          fill={color}
        />
      ))}
    </Svg>
  );
}
