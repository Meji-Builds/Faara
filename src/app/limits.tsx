import { ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { FUNDING_LIMITS, MAX_AMOUNT } from '@shared/hum';

import { AppText, Card, Header, ListRow, Screen } from '@/components/ui';
import { useProfile } from '@/features/auth';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

/** What you can do at your verification level. */
export default function LimitsScreen() {
  const { colors } = useTheme();
  const profile = useProfile();
  return (
    <Screen>
      <Header center={<AppText variant="subheading">Limits and verification</AppText>} />
      <View style={styles.tier}>
        <ShieldCheck size={28} color={colors.accentText} strokeWidth={1.75} />
        <View>
          <AppText variant="heading">Tier {profile.verificationTier}</AppText>
          <AppText color="textMuted">Phone number verified</AppText>
        </View>
      </View>
      <Card divided>
        <ListRow
          label="Most per payment"
          value={formatMoney(MAX_AMOUNT.NGN, 'NGN')}
          showChevron={false}
        />
        <ListRow
          label="Least per top-up"
          value={formatMoney(FUNDING_LIMITS.min, 'NGN')}
          showChevron={false}
        />
        <ListRow
          label="Most per top-up"
          value={formatMoney(FUNDING_LIMITS.max, 'NGN')}
          showChevron={false}
        />
        <ListRow label="Fees" value="Free" showChevron={false} />
      </Card>
      <AppText variant="caption" color="textMuted" style={styles.note}>
        Higher limits will open up when you verify your identity with a bank verification number.
        That arrives with our banking partner.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tier: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 24 },
  note: { marginTop: 14, paddingHorizontal: 4 },
});
