import type { Keypair } from '@solana/web3.js';
import { Redirect, useRouter } from 'expo-router';
import {
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  ShieldQuestion,
  TriangleAlert,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ShapeGlyph } from '@/components/brand';
import { AppText, Avatar, Button, Card, Header, ListRow, OtpField, Screen } from '@/components/ui';
import { FREE_TRANSFERS_PER_MONTH } from '@/data/fixtures';
import { useActivity } from '@/features/account';
import { cancelHum, settleHum, useHumDraft } from '@/features/hum';
import { PIN_LENGTH, sendUsdc, solanaErrorMessage, useApproval } from '@/features/wallet';
import { apiErrorMessage, ApiRequestError } from '@/lib/api/client';
import { CURRENCY_SYMBOL, groupDigits, initials } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

export default function ConfirmScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { currency, amount, amountLabel, note, session, chosen, claims, setSettlement, reset } =
    useHumDraft();
  const { biometricsEnabled, approveWithBiometrics, approveWithPin } = useApproval();
  const activity = useActivity(100);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const sentThisMonth =
    activity?.filter((entry) => entry.direction === 'out' && entry.createdAt >= monthStart)
      .length ?? 0;
  const [stage, setStage] = useState<'review' | 'pin' | 'paying'>('review');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!chosen || !session) return <Redirect href="/hum" />;

  const recipient = {
    name: chosen.recipient.fullName,
    firstName: chosen.recipient.fullName.split(/\s+/)[0] ?? chosen.recipient.fullName,
  };
  const safety = claims.find((claim) => claim.id === chosen.claimId)?.safety ?? null;
  const amountText = groupDigits(currency === 'USDC' ? amount.toFixed(2) : String(amount));

  /** Approved: send the money (USDC on-chain, naira on the ledger), then settle. */
  const pay = async (signer: Keypair) => {
    setStage('paying');
    setError(null);
    const startedAt = Date.now();
    try {
      let signature: string | undefined;
      if (currency === 'USDC') {
        if (!chosen.recipient.walletAddress) throw new Error('Recipient has no dollar wallet');
        signature = await sendUsdc(
          signer,
          chosen.recipient.walletAddress,
          Math.round(amount * 100),
        );
      }
      const result = await settleHum(session.paymentId, signature);
      setSettlement({ ...result, elapsedMs: Date.now() - startedAt });
      router.replace('/hum/success');
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? apiErrorMessage(cause) : solanaErrorMessage(cause),
      );
      setStage('review');
    }
  };

  const confirmWithFingerprint = async () => {
    setError(null);
    try {
      const signer = await approveWithBiometrics(`Pay ${amountLabel} to ${recipient.name}`);
      if (signer) await pay(signer);
      else setStage('pin');
    } catch {
      setStage('pin');
    }
  };

  const confirmWithPin = async () => {
    setError(null);
    try {
      const signer = await approveWithPin(pin);
      setPin('');
      await pay(signer);
    } catch (cause) {
      setPin('');
      setError(cause instanceof Error ? cause.message : 'Wrong PIN.');
    }
  };

  const cancel = async () => {
    await cancelHum(session.paymentId).catch(() => undefined);
    reset();
    router.dismissTo('/home');
  };

  const footer =
    stage === 'pin' ? (
      <>
        <AppText variant="label" color="textMuted" align="center">
          Enter your PIN to pay {amountLabel}
        </AppText>
        <OtpField
          value={pin}
          onChangeText={setPin}
          length={PIN_LENGTH}
          secure
          autoFocus
          accessibilityLabel="PIN"
        />
        <Button label="Pay" disabled={pin.length !== PIN_LENGTH} onPress={confirmWithPin} />
        {biometricsEnabled ? (
          <Button label="Use fingerprint instead" variant="text" onPress={confirmWithFingerprint} />
        ) : null}
      </>
    ) : (
      <>
        {biometricsEnabled ? (
          <>
            <Button
              label="Confirm with fingerprint"
              icon={<Fingerprint size={24} color={palette.nearBlack} strokeWidth={1.75} />}
              loading={stage === 'paying'}
              onPress={confirmWithFingerprint}
            />
            <Button
              label="Use PIN instead"
              variant="text"
              disabled={stage === 'paying'}
              onPress={() => setStage('pin')}
              style={styles.pin}
            />
          </>
        ) : (
          <Button
            label="Confirm with PIN"
            loading={stage === 'paying'}
            onPress={() => setStage('pin')}
          />
        )}
        <Button
          label="Shapes don’t match? Cancel"
          variant="text"
          disabled={stage === 'paying'}
          onPress={cancel}
        />
      </>
    );

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          {stage === 'paying' ? (
            <AppText variant="label" color="textMuted" align="center">
              {currency === 'USDC' ? 'Sending on the Solana network…' : 'Paying…'}
            </AppText>
          ) : null}
          {footer}
        </>
      }
    >
      <Header center={<AppText variant="subheading">Confirm</AppText>} />

      <View style={styles.parties} accessibilityLabel={`From you to ${recipient.name}`}>
        <View style={[styles.you, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="subheading" color="textMuted">
            You
          </AppText>
        </View>
        <ArrowRight size={36} color={colors.accent} strokeWidth={1.75} />
        <Avatar size={48} tone="soft" initials={initials(recipient.name)} />
      </View>

      <AppText align="center" style={[styles.amount, { color: colors.text }]}>
        <AppText
          style={[
            styles.amount,
            { color: scheme === 'dark' ? palette.softTeal : colors.accentText },
          ]}
        >
          {CURRENCY_SYMBOL[currency]}
        </AppText>
        {amountText}
      </AppText>
      <AppText color="textMuted" align="center">
        to{' '}
        <AppText variant="bodyStrong" color="text">
          {recipient.name}
        </AppText>
        {note ? ` · ${note}` : ''}
      </AppText>

      <Card tone="brand" padded style={styles.match}>
        <AppText variant="overline" color="onBrandMuted">
          MATCH WITH {recipient.firstName.toUpperCase()}&apos;S SCREEN
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
          {recipient.firstName} sees the same three shapes. If they don&apos;t match, cancel.
        </AppText>
      </Card>

      <Card divided style={styles.details}>
        <ListRow
          compact
          label="Fee"
          labelColor="textMuted"
          value={
            <AppText variant="bodyStrong">
              Free{' '}
              <AppText color="textMuted">
                · {Math.min(sentThisMonth + 1, FREE_TRANSFERS_PER_MONTH)} of{' '}
                {FREE_TRANSFERS_PER_MONTH} this month
              </AppText>
            </AppText>
          }
        />
        <ListRow
          compact
          label="Arrives"
          labelColor="textMuted"
          value={<AppText variant="bodyStrong">Instantly</AppText>}
        />
        <ListRow
          compact
          label="Safety"
          labelColor="textMuted"
          value={
            <View style={styles.safety}>
              {safety?.level === 'low' ? (
                <ShieldCheck size={18} color={colors.accentText} strokeWidth={1.75} />
              ) : safety?.level === 'caution' || safety?.level === 'high' ? (
                <TriangleAlert size={18} color={colors.gold} strokeWidth={1.75} />
              ) : (
                <ShieldQuestion size={18} color={colors.textMuted} strokeWidth={1.75} />
              )}
              <AppText
                variant="bodyStrong"
                color={
                  safety?.level === 'low'
                    ? 'accentText'
                    : safety?.level === 'caution' || safety?.level === 'high'
                      ? 'gold'
                      : 'textMuted'
                }
              >
                {safety?.level === 'low'
                  ? 'Low risk'
                  : safety?.level === 'high'
                    ? 'High risk'
                    : safety?.level === 'caution'
                      ? 'Check first'
                      : 'Not checked'}
              </AppText>
            </View>
          }
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  parties: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 20,
  },
  you: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 54,
    letterSpacing: -2,
    marginTop: 14,
  },
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
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pin: { marginTop: -4 },
});
