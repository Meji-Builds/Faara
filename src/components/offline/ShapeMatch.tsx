import { StyleSheet, View } from 'react-native';

import type { ShapeTriple } from '@shared/hum';

import { ShapeGlyph } from '@/components/brand';
import { AppText, Card } from '@/components/ui';
import { radii, useTheme } from '@/theme';

/** The three shapes both phones show, so two people can check they're paired with each other. */
export function ShapeMatch({ shapes, hint }: { shapes: ShapeTriple; hint: string }) {
  const { colors } = useTheme();
  return (
    <Card tone="brand" padded style={styles.card}>
      <AppText variant="overline" color="onBrandMuted">
        MATCH THE OTHER SCREEN
      </AppText>
      <View style={styles.shapes}>
        {shapes.map((shape, index) => (
          <View
            key={`${shape}-${index}`}
            style={[styles.tile, { backgroundColor: colors.brandInset }]}
          >
            <ShapeGlyph shape={shape} size={34} />
          </View>
        ))}
      </View>
      <AppText variant="label" color="onBrand">
        {hint}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  shapes: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    height: 76,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
