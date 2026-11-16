import { useLocalSearchParams } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Download, ExternalLink } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import type { ActivityEntry } from '@shared/hum';

import { AdireBand } from '@/components/brand';
import { AppText, Button, Card, EmptyState, Header, ListRow, Screen } from '@/components/ui';
import { watchActivityEntry } from '@/features/account';
import { useAuth } from '@/features/auth';
import { downloadReceipt, receiptFromActivity } from '@/features/receipts';
import { fonts, radii, useTheme } from '@/theme';

/** Receipt for one settled payment, with PDF download. */
export default function ReceiptScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const [entry, setEntry] = useState<ActivityEntry | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !paymentId) return;
    return watchActivityEntry(user.uid, paymentId, setEntry);
  }, [user, paymentId]);

  if (entry === undefined) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Receipt</AppText>} />
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      </Screen>
    );
  }
  if (entry === null) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Receipt</AppText>} />
        <EmptyState
          icon={<Download size={30} color={colors.accentText} strokeWidth={1.75} />}
          title="Receipt not found"
          message="This payment isn’t in your activity."
        />
      </Screen>
    );
  }

  const receipt = receiptFromActivity(entry);
  const incoming = entry.direction === 'in';
  const DirectionIcon = incoming ? ArrowDownLeft : ArrowUpRight;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await downloadReceipt(receipt);
    } catch {
      setError('Couldn’t create the receipt. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          <Button
            label="Download receipt"
            icon={<Download size={20} color={colors.onAccent} strokeWidth={1.75} />}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">Receipt</AppText>} />

      <Card tone="brand" style={styles.hero}>
        <View style={styles.heroBody}>
          <View style={[styles.badge, { backgroundColor: colors.brandInset }]}>
            <DirectionIcon size={22} color={colors.accent} strokeWidth={2} />
          </View>
          <AppText variant="overline" color="onBrandMuted">
            {incoming ? 'PAYMENT RECEIVED' : 'PAYMENT SENT'}
          </AppText>
          <AppText style={[styles.amount, { color: colors.onBrand }]}>
            {incoming ? '+' : '−'}
            {receipt.amountLabel}
          </AppText>
          <AppText variant="bodyStrong" style={{ color: colors.accent }}>
            Completed
          </AppText>
        </View>
        <AdireBand color={colors.brandLine} style={styles.band} />
      </Card>

      <Card divided style={styles.details}>
        <ListRow
          compact
          label={incoming ? 'From' : 'To'}
          labelColor="textMuted"
          value={`${receipt.counterpartyName}`}
        />
        <ListRow
          compact
          label="Username"
          labelColor="textMuted"
          value={`@${receipt.counterpartyUsername}`}
        />
        <ListRow compact label="For" labelColor="textMuted" value={receipt.note || '—'} />
        <ListRow
          compact
          label="Date"
          labelColor="textMuted"
          value={new Date(receipt.settledAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
        <ListRow compact label="Sent by" labelColor="textMuted" value={receipt.channelLabel} />
        <ListRow compact label="Fee" labelColor="textMuted" value="Free" />
        <ListRow
          compact
          label="Reference"
          labelColor="textMuted"
          value={
            <AppText variant="mono" selectable>
              {receipt.reference}
            </AppText>
          }
        />
        {receipt.explorerUrl ? (
          <ListRow
            compact
            label="On-chain record"
            labelColor="textMuted"
            trailing={<ExternalLink size={18} color={colors.accentText} strokeWidth={1.75} />}
            onPress={() => Linking.openURL(receipt.explorerUrl as string)}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
  hero: { marginTop: 16 },
  heroBody: { alignItems: 'center', gap: 8, paddingTop: 24, paddingHorizontal: 20 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  amount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
  band: { marginTop: 22, marginBottom: 14 },
  details: { marginTop: 16, marginBottom: 24 },
});
