import { Redirect, useRouter } from 'expo-router';
import { Check, Download } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { explorerTxUrl } from '@shared/solana';

import { AdireBand, Rings } from '@/components/brand';
import { AppText, Button, Screen } from '@/components/ui';
import { useHumDraft } from '@/features/hum';
import { CHANNEL_LABEL, downloadReceipt, receiptReference } from '@/features/receipts';
import { fonts, palette, radii, useTheme } from '@/theme';

export default function SuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amountLabel, note, currency, session, chosen, claims, settlement, reset } = useHumDraft();
  const [receiptError, setReceiptError] = useState<string | null>(null);

  if (!session || !chosen || !settlement) return <Redirect href="/hum" />;
  const recipient = { name: chosen.recipient.fullName };
  const channel = claims.find((claim) => claim.id === chosen.claimId)?.channel ?? 'sound';
  const reference = receiptReference(session.paymentId);
  const seconds = (settlement.elapsedMs / 1000).toFixed(1);

  const saveReceipt = () => {
    setReceiptError(null);
    downloadReceipt({
      reference,
      direction: 'out',
      amountLabel,
      counterpartyName: recipient.name,
      counterpartyUsername: chosen.recipient.username,
      note,
      settledAt: settlement.settledAt,
      channelLabel: CHANNEL_LABEL[channel],
      currency,
      explorerUrl: settlement.signature ? explorerTxUrl(settlement.signature) : null,
    }).catch(() => setReceiptError('Couldn’t create the receipt. Try again.'));
  };

  const done = () => {
    reset();
    router.dismissTo('/home');
  };

  const rows: [string, string, boolean?][] = [
    ['For', note || '—'],
    ['Sent by', CHANNEL_LABEL[channel]],
    ['Fee', 'Free'],
    ['Reference', reference, true],
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.brand }]}>
      <AdireBand color={colors.brandLine} />
      <Rings
        radii={[90, 150, 210, 270]}
        color={colors.brandLine}
        center={{ x: 195, y: 300 }}
        opacity={0.6}
      />
      <Screen
        background="transparent"
        lightStatusBar
        edges={['bottom']}
        footer={
          <>
            {receiptError ? (
              <AppText variant="label" color="goldOnBrand" align="center">
                {receiptError}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Receipt"
                onPress={saveReceipt}
                variant="outline"
                tone="accent"
                icon={<Download size={20} color={palette.electricTeal} strokeWidth={1.75} />}
                style={styles.action}
              />
              <Button label="Done" onPress={done} style={styles.action} />
            </View>
          </>
        }
      >
        <View style={styles.hero}>
          <View style={[styles.check, { backgroundColor: colors.accent }]}>
            <Check size={56} color={palette.nearBlack} strokeWidth={3} />
          </View>
          <AppText style={[styles.title, { color: colors.onBrand }]} accessibilityRole="header">
            Hummed.
          </AppText>
          <AppText variant="body" color="onBrand" align="center" style={styles.summary}>
            {amountLabel} is with{' '}
            <AppText variant="subheading" color="onBrand">
              {recipient.name}
            </AppText>
          </AppText>
          <AppText variant="body" color="onBrandMuted" align="center">
            Settled in {seconds} seconds
          </AppText>
        </View>

        <View
          style={[
            styles.receipt,
            { backgroundColor: colors.brandInset, borderColor: colors.brandLine },
          ]}
        >
          {rows.map(([label, value, mono], index) => (
            <View
              key={label}
              style={[
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.brandLine },
              ]}
            >
              <AppText variant="body" color="onBrandMuted">
                {label}
              </AppText>
              <AppText
                variant={mono ? 'mono' : 'bodyStrong'}
                color="onBrand"
                style={styles.value}
                numberOfLines={1}
              >
                {value}
              </AppText>
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hero: { alignItems: 'center', marginTop: 56, gap: 8 },
  check: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: fonts.display, fontSize: 52, lineHeight: 60, letterSpacing: -2.5 },
  summary: { fontSize: 17, marginTop: 4 },
  receipt: { borderRadius: radii.xl, borderWidth: 1, marginTop: 28, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    marginHorizontal: 20,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
