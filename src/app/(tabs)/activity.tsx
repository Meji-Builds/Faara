import { StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { recentTransactions } from '@/data/fixtures';
import { useTheme } from '@/theme';

/** Interim activity list until the full Activity screen is designed. */
export default function ActivityScreen() {
  const { colors } = useTheme();
  return (
    <Screen edges={['top']}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Activity
      </AppText>
      {recentTransactions.map((transaction, index) => (
        <View
          key={transaction.id}
          style={index > 0 && [styles.separator, { borderTopColor: colors.border }]}
        >
          <TransactionRow transaction={transaction} />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8, marginBottom: 12 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
