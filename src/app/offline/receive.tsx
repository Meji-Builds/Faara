import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { encodeOfflineRequest, readPaymentQr, type OfflineRequest } from '@shared/offline';

import { SuccessBurst } from '@/components/brand';
import { QrScanner, ShowCode } from '@/components/offline';
import { AppText, Button, Header, Screen, TextField } from '@/components/ui';
import { useAuth, useProfile } from '@/features/auth';
import { randomId, receiveOffline, updateLedger, useLedger } from '@/features/offline';
import { formatMoney, groupDigits } from '@/lib/money';
import { haptics } from '@/lib/haptics';

type Step =
  | { kind: 'amount' }
  | { kind: 'request'; request: OfflineRequest; error?: string }
  | { kind: 'scan'; request: OfflineRequest }
  | { kind: 'done'; amountKobo: number; fromName: string | null };

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');

/** Get paid with no network: show a request code, then scan the payer's payment. */
export default function ReceiveOfflineScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const profile = useProfile();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const [step, setStep] = useState<Step>({ kind: 'amount' });
  const [amountText, setAmountText] = useState('');
  const amountKobo = Math.round(Number(amountText.replace(/,/g, '') || '0') * 100);
  const requestCode = useMemo(
    () => (step.kind === 'request' ? encodeOfflineRequest(step.request) : ''),
    [step],
  );

  if (!ledger.serverPublicKey) {
    return (
      <Screen footer={<Button label="Back" onPress={() => router.back()} />}>
        <Header center={<AppText variant="subheading">Receive offline</AppText>} />
        <AppText color="textMuted" align="center" style={styles.note}>
          Open Faara once while you’re online. After that you can receive with no network.
        </AppText>
      </Screen>
    );
  }

  if (step.kind === 'done') {
    return (
      <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
        <View style={styles.center}>
          <SuccessBurst size={104} />
          <AppText variant="title" align="center">
            {naira(step.amountKobo)} received
          </AppText>
          <AppText color="textMuted" align="center">
            {step.fromName ? `From ${step.fromName}. ` : ''}It’s checked and safe. It lands in your
            balance next time you’re online.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (step.kind === 'scan') {
    const { request } = step;
    return (
      <Screen
        footer={
          <Button
            label="Show my code again"
            variant="text"
            onPress={() => setStep({ kind: 'request', request })}
          />
        }
      >
        <Header center={<AppText variant="subheading">Scan their payment</AppText>} />
        <View style={styles.form}>
          <QrScanner
            onScan={(data) => {
              const payment = readPaymentQr(data);
              if (!payment) return false;
              void updateLedger(uid, (current) => {
                const got = receiveOffline(current, {
                  note: payment.note,
                  fromName: payment.fromName,
                  request,
                  now: Date.now(),
                });
                return { ledger: got.ledger, result: got.error };
              }).then((error) => {
                if (error) {
                  haptics.warning();
                  setStep({ kind: 'request', request, error });
                  return;
                }
                haptics.success();
                setStep({
                  kind: 'done',
                  amountKobo: payment.note.note.amountKobo,
                  fromName: payment.fromName,
                });
              });
              return true;
            }}
          />
        </View>
      </Screen>
    );
  }

  if (step.kind === 'request') {
    const { request } = step;
    return (
      <Screen
        footer={
          <Button label="Scan their payment" onPress={() => setStep({ kind: 'scan', request })} />
        }
      >
        <Header center={<AppText variant="subheading">Receive offline</AppText>} />
        <View style={styles.center}>
          <AppText color="textMuted" align="center">
            {request.amountKobo > 0 ? `Asking for ${naira(request.amountKobo)}. ` : ''}
            Let the payer scan this. Then scan the payment their phone shows.
          </AppText>
          {step.error ? (
            <AppText variant="label" color="gold" align="center">
              {step.error}
            </AppText>
          ) : null}
          <ShowCode value={requestCode} />
        </View>
      </Screen>
    );
  }

  const validAmount = amountKobo === 0 || (amountKobo >= 100_00 && amountKobo <= 500_000);
  return (
    <Screen
      footer={
        <Button
          label="Show my code"
          disabled={!validAmount}
          onPress={() =>
            setStep({
              kind: 'request',
              request: { uid, name: profile.fullName, nonce: randomId('N'), amountKobo },
            })
          }
        />
      }
    >
      <Header center={<AppText variant="subheading">Receive offline</AppText>} />
      <View style={styles.form}>
        <TextField
          label="Amount (optional)"
          value={amountText}
          onChangeText={(text) =>
            setAmountText(groupDigits(text.replace(/[^0-9]/g, '').slice(0, 7)))
          }
          placeholder="Let the payer choose"
          keyboardType="number-pad"
          hint={
            <AppText variant="label" color={validAmount ? 'textMuted' : 'gold'}>
              Up to ₦5,000 per offline payment
            </AppText>
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  form: { gap: 16, marginTop: 20 },
  note: { marginTop: 24 },
});
