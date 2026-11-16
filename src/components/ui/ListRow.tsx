import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

interface ListRowProps {
  label: string;
  /** Muted value shown before the trailing control. */
  value?: ReactNode;
  /** Leading icon. */
  icon?: ReactNode;
  /** Replaces the chevron (e.g. a switch or status text). */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Visual-only rows have no chevron and no press state. */
  showChevron?: boolean;
  /** Compact rows are used for receipts and summaries. */
  compact?: boolean;
  labelColor?: 'text' | 'textMuted' | 'onBrandMuted';
}

export function ListRow({
  label,
  value,
  icon,
  trailing,
  onPress,
  showChevron = Boolean(onPress),
  compact = false,
  labelColor = 'text',
}: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, compact && styles.compact]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <AppText variant="bodyStrong" color={labelColor} style={styles.label} numberOfLines={1}>
        {label}
      </AppText>
      <View style={styles.trailing}>
        {typeof value === 'string' ? (
          <AppText variant="body" color="textMuted" align="right">
            {value}
          </AppText>
        ) : (
          value
        )}
        {trailing}
        {showChevron && !trailing ? (
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: colors.border }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    minHeight: 64,
    gap: 14,
  },
  compact: { minHeight: 52 },
  icon: { width: 24, alignItems: 'center' },
  label: { flexShrink: 1, fontSize: 16 },
  trailing: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
