import { useRouter } from 'expo-router';
import { History } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ActivityEntry } from '@shared/hum';

import { EmptyState } from '@/components/ui';
import { relativeDay } from '@/features/account';
import { useTheme } from '@/theme';

import { TransactionRow, type TransactionView } from './TransactionRow';

const TONES = ['soft', 'gold', 'surface'] as const;

export function toTransactionView(entry: ActivityEntry, index: number): TransactionView {
  const major = entry.amountMinor / 100;
  return {
    id: `${entry.paymentId}-${entry.direction}`,
    counterparty: entry.counterpartyName || `@${entry.counterpartyUsername}`,
    description:
      entry.kind === 'deposit'
        ? 'Added money'
        : entry.kind === 'refund'
          ? 'Refund after a dispute'
          : [
              entry.kind === 'transfer' ? 'Sent by username' : 'Hum',
              entry.currency === 'USDC' ? 'USDC' : null,
              entry.note || null,
            ]
              .filter(Boolean)
              .join(' · '),
    amount: entry.direction === 'in' ? major : -major,
    currency: entry.currency,
    when: relativeDay(entry.createdAt),
    tone: TONES[index % TONES.length] ?? 'soft',
  };
}

interface ActivityListProps {
  /** Null while loading. */
  entries: ActivityEntry[] | null;
  limit?: number;
}

export function ActivityList({ entries, limit }: ActivityListProps) {
  const { colors } = useTheme();
  const router = useRouter();
  if (entries === null) return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<History size={30} color={colors.accentText} strokeWidth={1.75} />}
        title="No payments yet"
        message="Tap Hum to pay someone nearby. Payments you send and receive show up here."
      />
    );
  }
  return (
    <View>
      {entries.slice(0, limit).map((entry, index) => (
        <View
          key={`${entry.paymentId}-${entry.direction}`}
          style={index > 0 && [styles.separator, { borderTopColor: colors.border }]}
        >
          <TransactionRow
            transaction={toTransactionView(entry, index)}
            onPress={() =>
              router.push({
                pathname: '/receipt/[paymentId]',
                params: { paymentId: entry.paymentId },
              })
            }
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 32 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
