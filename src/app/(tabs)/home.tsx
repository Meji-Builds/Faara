import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Bell, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { HumMark } from '@/components/brand';
import { AppText, Avatar, IconButton, Screen } from '@/components/ui';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { QuickAction } from '@/components/wallet/QuickAction';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { balances, sampleAccounts, recentTransactions } from '@/data/fixtures';
import { useProfile } from '@/features/auth';
import { audioEngine } from '@/features/sound';
import { greeting } from '@/lib/greeting';
import { initials } from '@/lib/money';
import { palette, useTheme } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const profile = useProfile();
  const firstName = profile.fullName.split(/\s+/)[0] ?? profile.fullName;
  const iconProps = { size: 24, color: colors.text, strokeWidth: 1.75 } as const;

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <Avatar size={44} initials={initials(profile.fullName)} />
        <View style={styles.greeting}>
          <AppText variant="body" color="textMuted">
            {greeting()}
          </AppText>
          <AppText variant="subheading">{firstName}</AppText>
        </View>
        <IconButton
          accessibilityLabel="Notifications"
          badge
          icon={<Bell {...iconProps} size={22} />}
        />
      </View>

      <BalanceCard
        naira={balances.NGN}
        usdc={balances.USDC}
        accountNumber={sampleAccounts.accountNumber}
      />

      <View style={styles.actions}>
        <QuickAction
          label="Hum"
          highlighted
          icon={<HumMark size={20} color={palette.nearBlack} />}
          onPress={() => {
            audioEngine.prepare();
            router.push('/hum');
          }}
        />
        <QuickAction label="Send" icon={<ArrowRight {...iconProps} />} />
        <QuickAction
          label="Request"
          icon={<ArrowLeft {...iconProps} />}
          onPress={() => {
            // Unlock audio inside the tap (browsers), then listen for a hum.
            audioEngine.prepare();
            router.push('/receive');
          }}
        />
        <QuickAction
          label="Add money"
          icon={<Plus {...iconProps} />}
          onPress={() => router.push('/wallet')}
        />
      </View>

      <View style={styles.sectionHeader}>
        <AppText variant="heading">Recent</AppText>
        <AppText
          variant="bodyStrong"
          color="accentText"
          accessibilityRole="link"
          onPress={() => router.push('/activity')}
        >
          See all
        </AppText>
      </View>

      <View style={styles.list}>
        {recentTransactions.map((transaction, index) => (
          <View
            key={transaction.id}
            style={index > 0 && [styles.separator, { borderTopColor: colors.border }]}
          >
            <TransactionRow transaction={transaction} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 18 },
  greeting: { flex: 1 },
  actions: { flexDirection: 'row', marginTop: 20, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 6,
  },
  list: { paddingBottom: 24 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
