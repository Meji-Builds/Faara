import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { decodeOfflineRequest, encodeSignedNote, type OfflineRequest } from '@shared/offline';

import { SuccessBurst } from '@/components/brand';
import { Approve, QrScanner, ShowCode } from '@/components/offline';
import { AppText, Button, Header, Screen, TextField } from '@/components/ui';
import { useAuth, useProfile } from '@/features/auth';
import { maxPayment, payOffline, randomId, updateLedger, useLedger } from '@/features/offline';
import { formatMoney, groupDigits } from '@/lib/money';
import { haptics } from '@/lib/haptics';

type Step =
  | { kind: 'scan'; error?: string }
  | { kind: 'amount'; request: OfflineRequest }
  | { kind: 'approve'; request: OfflineRequest; amountKobo: number }
  | { kind: 'show'; request: OfflineRequest; amountKobo: number; code: string };

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');

/** Pay someone with no network: scan their request, approve, then show them the payment. */
export default function PayOfflineScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const profile = useProfile();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [amountText, setAmountText] = useState('');
  const [openedAt] = useState(() => Date.now());
  const limit = maxPayment(ledger.pocket, openedAt);

  const scanned = (data: string): boolean => {
    const request = decodeOfflineRequest(data);
    if (!request) return false;
    if (request.uid === uid) {
      setStep({ kind: 'scan', error: 'That’s your own code. Scan the other phone.' });
      return false;
    }
    haptics.success();
    if (request.amountKobo > 0) {
      setStep({ kind: 'approve', request, amountKobo: request.amountKobo });
    } else {
      setStep({ kind: 'amount', request });
    }
    return true;
  };

  if (step.kind === 'show') {
    return (
      <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
        <View style={styles.center}>
          <SuccessBurst size={72} />
          <AppText variant="title" align="center">
            {naira(step.amountKobo)} to {step.request.name}
          </AppText>
          <AppText color="textMuted" align="center">
            Show this to {step.request.name}. Their phone checks it, and it settles when either of
            you is back online.
          </AppText>
          <ShowCode value={step.code} />
        </View>
      </Screen>
    );
  }

  if (step.kind === 'approve') {
    const { request, amountKobo } = step;
    const reason = `Pay ${naira(amountKobo)} to ${request.name} offline.`;
    return (
      <Screen
        footer={
          <Approve
            reason={reason}
            onApproved={async (secretKey) => {
              const note = await updateLedger(uid, (current) => {
                const paid = payOffline(current, {
                  request,
                  amountKobo,
                  fromUid: uid,
                  secretKey,
                  now: Date.now(),
                  noteId: randomId('NT'),
                });
                return { ledger: paid.ledger, result: paid.note };
              });
              haptics.success();
              setStep({
                kind: 'show',
                request,
                amountKobo,
                code: encodeSignedNote(note, profile.fullName),
              });
            }}
          />
        }
      >
        <Header center={<AppText variant="subheading">Pay offline</AppText>} />
        <View style={styles.center}>
          <AppText color="textMuted">Paying</AppText>
          <AppText variant="title" align="center">
            {request.name}
          </AppText>
          <AppText variant="title" color="accentText" align="center">
            {naira(amountKobo)}
          </AppText>
          {amountKobo > limit ? (
            <AppText variant="label" color="gold" align="center">
              Your pocket can pay up to {naira(limit)} right now.
            </AppText>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (step.kind === 'amount') {
    const amount = Number(amountText.replace(/,/g, ''));
    const kobo = Math.round(amount * 100);
    const valid = Number.isFinite(amount) && kobo > 0 && kobo <= limit;
    return (
      <Screen
        footer={
          <Button
            label={valid ? `Continue with ${naira(kobo)}` : 'Continue'}
            disabled={!valid}
            onPress={() => setStep({ kind: 'approve', request: step.request, amountKobo: kobo })}
          />
        }
      >
        <Header center={<AppText variant="subheading">Pay {step.request.name}</AppText>} />
        <View style={styles.form}>
          <TextField
            label="Amount in naira"
            value={amountText}
            onChangeText={(text) =>
              setAmountText(groupDigits(text.replace(/[^0-9]/g, '').slice(0, 7)))
            }
            placeholder="2,000"
            keyboardType="number-pad"
            autoFocus
            hint={
              <AppText variant="label" color={kobo > limit ? 'gold' : 'textMuted'}>
                Up to {naira(limit)} from your offline pocket
              </AppText>
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Pay offline</AppText>} />
      <View style={styles.form}>
        {limit > 0 ? (
          <>
            <AppText color="textMuted" align="center">
              Scan the code on the other person’s phone. You can pay up to {naira(limit)}.
            </AppText>
            {step.error ? (
              <AppText variant="label" color="gold" align="center">
                {step.error}
              </AppText>
            ) : null}
            <QrScanner onScan={scanned} />
          </>
        ) : (
          <AppText color="textMuted" align="center">
            Your offline pocket is empty. Fill it while you’re online, then you can pay with no
            network.
          </AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  form: { gap: 16, marginTop: 20 },
});
