import { ShieldAlert, ShieldQuestion } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { RiskLevel } from '@shared/ai';

import { AppText } from '@/components/ui';
import { radii, useTheme } from '@/theme';

interface RiskBannerProps {
  level: Exclude<RiskLevel, 'ok'>;
  title: string;
  reason: string;
}

/** The scam guard's note on a payment, shown before it is approved. */
export function RiskBanner({ level, title, reason }: RiskBannerProps) {
  const { colors } = useTheme();
  const Icon = level === 'warning' ? ShieldAlert : ShieldQuestion;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { borderColor: colors.gold, backgroundColor: colors.surface }]}
    >
      <Icon size={22} color={colors.gold} strokeWidth={1.75} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color="gold">
          {title}
        </AppText>
        <AppText color="textMuted">{reason}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 4 },
});
