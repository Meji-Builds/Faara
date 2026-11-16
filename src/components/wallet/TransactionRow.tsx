import { Store } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { AvatarTone } from '@/data/fixtures';
import { formatMoney, initials } from '@/lib/money';

export interface TransactionView {
  id: string;
  counterparty: string;
  description: string;
  /** Signed: positive for money in. Major units. */
  amount: number;
  currency: 'NGN' | 'USDC';
  when: string;
  tone: AvatarTone;
  isMerchant?: boolean;
}

/** Merchant icon colour on the gold avatar fill; constant across themes. */
const MERCHANT_ICON_COLOR = '#3A2600';

export function TransactionRow({
  transaction,
  onPress,
}: {
  transaction: TransactionView;
  onPress?: () => void;
}) {
  const { counterparty, description, amount, currency, when, tone, isMerchant } = transaction;
  const incoming = amount > 0;
  const decimals = currency === 'USDC' ? 2 : undefined;

  const row = (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${counterparty}, ${description}, ${incoming ? 'received' : 'sent'} ${formatMoney(Math.abs(amount), currency, { decimals })}, ${when}`}
    >
      <Avatar
        size={44}
        tone={tone}
        initials={initials(counterparty)}
        icon={
          isMerchant ? (
            <Store size={20} color={MERCHANT_ICON_COLOR} strokeWidth={1.75} />
          ) : undefined
        }
      />
      <View style={styles.details}>
        <AppText variant="subheading" numberOfLines={1}>
          {counterparty}
        </AppText>
        <AppText variant="body" color="textMuted" numberOfLines={1}>
          {description}
        </AppText>
      </View>
      <View style={styles.amount}>
        <AppText variant="subheading" color={incoming ? 'accentText' : 'text'}>
          {formatMoney(amount, currency, { signed: true, decimals })}
        </AppText>
        <AppText variant="body" color="textMuted">
          {when}
        </AppText>
      </View>
    </View>
  );

  if (!onPress) return row;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the receipt"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  details: { flex: 1, gap: 2 },
  amount: { alignItems: 'flex-end', gap: 2 },
});
