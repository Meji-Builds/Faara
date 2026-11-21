import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { useActivity } from '@/features/account';
import { useVendorStatus } from '@/features/vendors';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const naira = (amount: number) => formatMoney(amount, 'NGN');
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const REQUIREMENTS = [
  'Your business name, what you sell, and where customers find you',
  'Your NIN (National Identification Number)',
  'Your CAC number, if your business is registered (optional)',
  'Agreeing to the vendor terms',
];

/**
 * Vendor home: how to apply, where an application stands, or (once approved) today's
 * sales.
 */
export default function VendorScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { status } = useVendorStatus();

  if (!status) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Vendor</AppText>} />
        <ActivityIndicator color={colors.accent} style={styles.gap} />
      </Screen>
    );
  }

  if (status.vendor) return <VendorDashboard businessName={status.vendor.businessName} />;

  const application = status.application;
  if (application?.status === 'pending') {
    return (
      <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
        <Header center={<AppText variant="subheading">Vendor</AppText>} />
        <View style={styles.message}>
          <AppText variant="title" align="center">
            Application received
          </AppText>
          <AppText color="textMuted" align="center">
            Faara’s team is reviewing {application.businessName}. We’ll tell you as soon as it’s
            decided, usually within two working days.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Apply" onPress={() => router.push('/vendor/apply')} />}>
      <Header center={<AppText variant="subheading">Become a vendor</AppText>} />
      <View style={styles.body}>
        {application?.status === 'rejected' ? (
          <Card padded style={styles.card}>
            <AppText variant="bodyStrong" color="gold">
              Your last application needs changes
            </AppText>
            <AppText color="textMuted">{application.reason}</AppText>
          </Card>
        ) : null}
        <AppText>
          Take payments from customers as a business: by hum, invoice or link, with a sales
          dashboard for your day. Vendors are reviewed first, so customers know they’re paying a
          real business.
        </AppText>
        <Card padded style={styles.card}>
          <AppText variant="label" color="textMuted">
            You’ll need
          </AppText>
          {REQUIREMENTS.map((item) => (
            <AppText key={item}>• {item}</AppText>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

function VendorDashboard({ businessName }: { businessName: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const activity = useActivity(100);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sales = (activity ?? []).filter(
      (entry) =>
        entry.direction === 'in' &&
        entry.currency === 'NGN' &&
        entry.kind !== 'deposit' &&
        entry.createdAt >= start.getTime(),
    );
    return {
      sales,
      total: sales.reduce((sum, entry) => sum + entry.amountMinor, 0) / 100,
    };
  }, [activity]);

  return (
    <Screen
      footer={
        <>
          <Button label="Receive a hum" onPress={() => router.push('/receive')} />
          <Button
            label="New invoice"
            variant="outline"
            onPress={() => router.push('/request-new')}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">{businessName}</AppText>} />
      <View style={styles.body}>
        <Card tone="brand" padded style={styles.card}>
          <AppText variant="overline" color="onBrandMuted">
            TODAY’S SALES
          </AppText>
          <AppText variant="title" color="onBrand">
            {activity === null ? '…' : naira(today.total)}
          </AppText>
          <AppText color="onBrandMuted">
            {today.sales.length} {today.sales.length === 1 ? 'payment' : 'payments'}
          </AppText>
        </Card>
        {activity === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : today.sales.length === 0 ? (
          <AppText color="textMuted">
            No sales yet today. Payments customers send you show up here as they arrive.
          </AppText>
        ) : (
          <View>
            {today.sales.map((sale) => (
              <View key={sale.paymentId} style={[styles.row, { borderColor: colors.border }]}>
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong">{sale.counterpartyName || 'Customer'}</AppText>
                  <AppText variant="label" color="textMuted">
                    {sale.note || 'Payment'} · {time(sale.createdAt)}
                  </AppText>
                </View>
                <AppText variant="bodyStrong" color="accentText">
                  +{naira(sale.amountMinor / 100)}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  card: { gap: 8 },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
});
