import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { palette } from '@/theme';

import { BRAND_SHAPES, type BrandShape } from '@shared/hum';

// The shape set is shared with the server, which picks the three shapes for each payment.
export { BRAND_SHAPES, type BrandShape };

const SHAPE_COLOR: Record<BrandShape, string> = {
  triangle: palette.electricTeal,
  ring: palette.gold,
  diamond: palette.softTeal,
  square: palette.gold,
  dot: palette.electricTeal,
  cross: palette.softTeal,
};

const SHAPE_LABEL: Record<BrandShape, string> = {
  triangle: 'Triangle',
  ring: 'Ring',
  diamond: 'Diamond',
  square: 'Square',
  dot: 'Dot',
  cross: 'Cross',
};

export function shapeLabel(shape: BrandShape): string {
  return SHAPE_LABEL[shape];
}

interface ShapeGlyphProps {
  shape: BrandShape;
  size?: number;
}

export function ShapeGlyph({ shape, size = 36 }: ShapeGlyphProps) {
  const color = SHAPE_COLOR[shape];
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel={SHAPE_LABEL[shape]}>
      {renderShape(shape, color)}
    </Svg>
  );
}

function renderShape(shape: BrandShape, color: string) {
  switch (shape) {
    case 'triangle':
      return <Path d="M20 4 L37 34 H3 Z" fill={color} />;
    case 'ring':
      return <Circle cx={20} cy={20} r={13} stroke={color} strokeWidth={7} fill="none" />;
    case 'diamond':
      return <Path d="M20 2 L37 20 L20 38 L3 20 Z" fill={color} />;
    case 'square':
      return <Rect x={6} y={6} width={28} height={28} rx={4} fill={color} />;
    case 'dot':
      return <Circle cx={20} cy={20} r={15} fill={color} />;
    case 'cross':
      return <Path d="M15 4 H25 V15 H36 V25 H25 V36 H15 V25 H4 V15 H15 Z" fill={color} />;
  }
}
