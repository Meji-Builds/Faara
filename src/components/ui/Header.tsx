import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from './BackButton';

interface HeaderProps {
  /** Centre content (title, amount, wordmark). */
  center?: ReactNode;
  /** Right-aligned content (timer, step count, toggle). */
  right?: ReactNode;
  /** Hide the back button. */
  hideBack?: boolean;
  onBack?: () => void;
}

/** Three-slot top bar: back button, centred content, trailing content. */
export function Header({ center, right, hideBack = false, onBack }: HeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>{hideBack ? null : <BackButton onPress={onBack} />}</View>
      <View style={styles.center}>{center}</View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: 8, gap: 8 },
  side: { flex: 1, minWidth: 44 },
  right: { alignItems: 'flex-end' },
  center: { flexShrink: 1, alignItems: 'center' },
});
