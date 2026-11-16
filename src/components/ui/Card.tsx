import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radii, useTheme } from '@/theme';

interface CardProps {
  children: ReactNode;
  /** `surface` is the neutral list card; `brand` is the deep-green feature card. */
  tone?: 'surface' | 'brand';
  /** Draw hairline dividers between direct children. */
  divided?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}

export function Card({
  children,
  tone = 'surface',
  divided = false,
  padded = false,
  style,
}: CardProps) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <View
      style={[
        styles.card,
        tone === 'surface'
          ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
          : { backgroundColor: colors.brand },
        padded && styles.padded,
        style,
      ]}
    >
      {divided
        ? items.map((child, index) => (
            <Fragment key={child.key ?? index}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              {child}
            </Fragment>
          ))
        : children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, overflow: 'hidden' },
  padded: { padding: 20 },
  divider: { height: StyleSheet.hairlineWidth * 2, marginHorizontal: 20 },
});
