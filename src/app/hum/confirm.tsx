import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ShapeGlyph } from '@/components/brand';
import { ApprovalFooter, PaymentDetails, PaymentHeader } from '@/components/payments';
import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { cancelHum, useHumDraft } from '@/features/hum';
import { usePayFlow, type PaymentToSettle, type Settlement } from '@/features/payments';
import { radii, useTheme } from '@/theme';

export default function ConfirmScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { currency, amount, amountLabel, note, session, chosen, claims, setSettlement, reset } =
    useHumDraft();

  const payment = useMemo<PaymentToSettle | null>(
    () =>
      session && chosen
        ? {
            paymentId: session.paymentId,
            currency,
            amountMinor: Math.round(amount * 100),
            recipientWallet: chosen.recipient.walletAddress,
            approvalReason: `Pay ${amountLabel} to ${chosen.recipient.fullName}`,
          }
        : null,
    [session, chosen, currency, amount, amountLabel],
  );
  const onSettled = useCallback(
    (settlement: Settlement) => {
      setSettlement(settlement);
      router.replace('/hum/success');
    },
    [setSettlement, router],
  );
  const flow = usePayFlow(payment, onSettled);

  if (!chosen || !session) return <Redirect href="/hum" />;

  const name = chosen.recipient.fullName;
  const firstName = name.split(/\s+/)[0] ?? name;
  const safety = claims.find((claim) => claim.id === chosen.claimId)?.safety ?? null;

  const cancel = async () => {
    await cancelHum(session.paymentId).catch(() => undefined);
    reset();
    router.dismissTo('/home');
  };

  return (
    <Screen
      footer={
        <ApprovalFooter
          flow={flow}
          amountLabel={amountLabel}
          currency={currency}
          secondary={
            <Button
              label="Shapes don’t match? Cancel"
              variant="text"
              disabled={flow.stage === 'paying'}
              onPress={cancel}
            />
          }
        />
      }
    >
      <Header center={<AppText variant="subheading">Confirm</AppText>} />
      <PaymentHeader recipientName={name} amount={amount} currency={currency} note={note} />

      <Card tone="brand" padded style={styles.match}>
        <AppText variant="overline" color="onBrandMuted">
          MATCH WITH {firstName.toUpperCase()}&apos;S SCREEN
        </AppText>
        <View style={styles.shapes}>
          {chosen.shapes.map((shape, index) => (
            <View
              key={`${shape}-${index}`}
              style={[styles.shapeTile, { backgroundColor: colors.brandInset }]}
            >
              <ShapeGlyph shape={shape} size={34} />
            </View>
          ))}
        </View>
        <AppText variant="label" color="onBrand" style={styles.matchHint}>
          {firstName} sees the same three shapes. If they don&apos;t match, cancel.
        </AppText>
      </Card>

      <PaymentDetails safety={safety} style={styles.details} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  match: { marginTop: 24, gap: 14 },
  shapes: { flexDirection: 'row', gap: 10 },
  shapeTile: {
    flex: 1,
    height: 76,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchHint: { fontSize: 14, lineHeight: 20, opacity: 0.92 },
  details: { marginTop: 16, marginBottom: 16 },
});
