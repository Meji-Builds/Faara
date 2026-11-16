import { ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { SafetyResult } from '@shared/hum';

import { AppText, Card, ListRow } from '@/components/ui';
import { FREE_TRANSFERS_PER_MONTH } from '@/data/fixtures';
import { useActivity } from '@/features/account';
import { useTheme } from '@/theme';

interface PaymentDetailsProps {
  safety: SafetyResult | null;
  style?: ViewStyle;
}

const SAFETY_LABEL = {
  low: 'Low risk',
  caution: 'Check first',
  high: 'High risk',
  unchecked: 'Not checked',
} as const;

/** Fee (free transfers used this month), arrival time and the recipient safety result. */
export function PaymentDetails({ safety, style }: PaymentDetailsProps) {
  const { colors } = useTheme();
  const activity = useActivity(100);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const sentThisMonth =
    activity?.filter((entry) => entry.direction === 'out' && entry.createdAt >= monthStart)
      .length ?? 0;
  const level = safety?.level ?? 'unchecked';
  const warning = level === 'caution' || level === 'high';

  return (
    <Card divided style={style}>
      <ListRow
        compact
        label="Fee"
        labelColor="textMuted"
        value={
          <AppText variant="bodyStrong">
            Free{' '}
            <AppText color="textMuted">
              · {Math.min(sentThisMonth + 1, FREE_TRANSFERS_PER_MONTH)} of{' '}
              {FREE_TRANSFERS_PER_MONTH} this month
            </AppText>
          </AppText>
        }
      />
      <ListRow
        compact
        label="Arrives"
        labelColor="textMuted"
        value={<AppText variant="bodyStrong">Instantly</AppText>}
      />
      <ListRow
        compact
        label="Safety"
        labelColor="textMuted"
        value={
          <View
            style={styles.safety}
            accessibilityLabel={
              safety
                ? `${safety.headline}${safety.detail ? `, ${safety.detail}` : ''}`
                : 'Not checked'
            }
          >
            {level === 'low' ? (
              <ShieldCheck size={18} color={colors.accentText} strokeWidth={1.75} />
            ) : warning ? (
              <TriangleAlert size={18} color={colors.gold} strokeWidth={1.75} />
            ) : (
              <ShieldQuestion size={18} color={colors.textMuted} strokeWidth={1.75} />
            )}
            <AppText
              variant="bodyStrong"
              color={level === 'low' ? 'accentText' : warning ? 'gold' : 'textMuted'}
            >
              {SAFETY_LABEL[level]}
            </AppText>
          </View>
        }
      />
      {warning && safety ? (
        <View style={styles.warning}>
          <AppText variant="label" color="gold">
            {safety.headline}
            {safety.detail ? ` · ${safety.detail}` : ''}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warning: { paddingHorizontal: 20, paddingVertical: 12 },
});
