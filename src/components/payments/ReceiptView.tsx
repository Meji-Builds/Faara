import { ArrowDownLeft, ArrowUpRight, ExternalLink } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { AdireBand, Wordmark } from '@/components/brand';
import { AppText, Card, ListRow } from '@/components/ui';
import type { ReceiptData } from '@/features/receipts';
import type { ViewRef } from '@/lib/viewRef';
import { fonts, radii, useTheme } from '@/theme';

interface ReceiptViewProps {
  receipt: ReceiptData;
  /** Attached to the branded area so it can be captured as an image. */
  captureRef?: ViewRef;
}

/** The branded receipt: wordmark, amount and status, then the payment details. */
export function ReceiptView({ receipt, captureRef }: ReceiptViewProps) {
  const { colors } = useTheme();
  const incoming = receipt.direction === 'in';
  const DirectionIcon = incoming ? ArrowDownLeft : ArrowUpRight;

  return (
    // `collapsable={false}` keeps this a real native view so it can be captured.
    <View
      ref={captureRef}
      collapsable={false}
      style={[styles.capture, { backgroundColor: colors.background }]}
    >
      <Card tone="brand">
        <View style={styles.heroBody}>
          <View style={styles.heroTop}>
            <Wordmark size={24} color={colors.onBrand} />
            <View style={[styles.badge, { backgroundColor: colors.brandInset }]}>
              <DirectionIcon size={20} color={colors.accent} strokeWidth={2} />
            </View>
          </View>
          <AppText variant="overline" color="onBrandMuted" style={styles.kind}>
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
          value={receipt.counterpartyName}
        />
        {receipt.counterpartyUsername ? (
          <ListRow
            compact
            label="Username"
            labelColor="textMuted"
            value={`@${receipt.counterpartyUsername}`}
          />
        ) : null}
        <ListRow compact label="For" labelColor="textMuted" value={receipt.note || '—'} />
        <ListRow
          compact
          label="Date"
          labelColor="textMuted"
          value={new Date(receipt.settledAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
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
    </View>
  );
}

const styles = StyleSheet.create({
  capture: { paddingVertical: 12, gap: 14 },
  heroBody: { gap: 6, paddingTop: 22, paddingHorizontal: 22 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: { marginTop: 14 },
  amount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
  band: { marginTop: 20, marginBottom: 14 },
  details: {},
});
