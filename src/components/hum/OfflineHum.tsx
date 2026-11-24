import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { ShapeTriple } from '@shared/hum';
import {
  checkIdentity,
  decodeHumOffer,
  encodeHumPayment,
  shapesForNonce,
  type HumOffer,
} from '@shared/offline';

import { SuccessBurst } from '@/components/brand';
import { ShapeMatch } from '@/components/offline/ShapeMatch';
import { Approve } from '@/components/security/Approve';
import { AppText, Button, Header, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { bleAvailability, offlineLink, requestBlePermissions } from '@/features/ble';
import { useHumDraft } from '@/features/hum';
import {
  markDelivery,
  maxPayment,
  payOffline,
  randomId,
  updateLedger,
  useLedger,
  verifyEd25519,
} from '@/features/offline';
import { formatMoney } from '@/lib/money';
import { haptics } from '@/lib/haptics';

import { HumPulse } from './HumPulse';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');
/** Stop looking if no phone ready to receive turns up within this long. */
const LOOK_FOR_MS = 30_000;

type Step =
  | { kind: 'looking' }
  | { kind: 'connecting' }
  | { kind: 'confirm'; offer: HumOffer; shapes: ShapeTriple }
  | { kind: 'sending'; name: string }
  | { kind: 'paid'; name: string }
  | { kind: 'unsure'; name: string }
  | { kind: 'problem'; title: string; message: string; retry: boolean };

/**
 * A hum with no network. The phone finds the closest phone ready to receive over Bluetooth,
 * checks its Faara-signed name, shows the shapes both screens share, and once approved hands
 * over a payment signed from the offline pocket. It settles when either phone is online.
 */
export function OfflineHum() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const { amount, currency, note, reset } = useHumDraft();
  const amountKobo = Math.round(amount * 100);
  const [step, setStep] = useState<Step>({ kind: 'looking' });
  const [attempt, setAttempt] = useState(0);
  const [openedAt] = useState(() => Date.now());
  const limit = maxPayment(ledger.pocket, openedAt);
  const serverKey = ledger.serverPublicKey;

  // Why this hum can't go ahead offline. Only checked before looking: once paid, the pocket
  // is smaller, and that mustn't replace the receipt.
  const blocked: Extract<Step, { kind: 'problem' }> | null =
    step.kind !== 'looking'
      ? null
      : currency !== 'NGN'
        ? problem('Dollars need a network', 'With no network you can pay in naira only.')
        : Platform.OS !== 'android'
          ? problem(
              'No network',
              'Paying by hum with no network needs the Faara app on Android. You can still pay with a QR code.',
            )
          : !ledger.pocket || !serverKey
            ? problem(
                'Nothing set aside for offline',
                'Next time you’re online, choose an amount to keep ready in Offline payments. Then a hum works with no network.',
              )
            : amountKobo > limit
              ? problem(
                  'More than you can pay offline',
                  `With no network you can pay up to ${naira(limit)} at a time.`,
                )
              : null;

  // Look for the closest phone ready to receive, then read and check its offer.
  const stopLooking = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (blocked || !serverKey) return;
    let cancelled = false;
    const fail = (next: Step) => !cancelled && setStep(next);
    const timer = setTimeout(() => {
      stopLooking.current?.();
      fail(
        problem(
          'No phone found nearby',
          'Ask them to open Faara on their home screen, turn on Bluetooth, and hold the phones close.',
          true,
        ),
      );
    }, LOOK_FOR_MS);

    (async () => {
      const availability = bleAvailability();
      if (availability === 'off') {
        clearTimeout(timer);
        return fail(
          problem('Turn on Bluetooth', 'With no network, Faara pays over Bluetooth.', true),
        );
      }
      if (availability !== 'ready' || !(await requestBlePermissions())) {
        clearTimeout(timer);
        return fail(
          problem('Bluetooth isn’t available', 'Allow Bluetooth for Faara, then try again.', true),
        );
      }
      if (cancelled) return;
      stopLooking.current = await offlineLink.lookForReceiver(async (deviceId) => {
        clearTimeout(timer);
        if (cancelled) return;
        setStep({ kind: 'connecting' });
        try {
          const offer = decodeHumOffer(await offlineLink.readOffer(deviceId));
          if (
            !offer ||
            !checkIdentity(offer.identity, {
              serverPublicKey: serverKey,
              verify: verifyEd25519,
              now: Date.now(),
            })
          ) {
            offlineLink.disconnect();
            return fail(
              problem(
                'Couldn’t confirm who that is',
                'That phone didn’t show a name Faara signed. Nothing was paid.',
                true,
              ),
            );
          }
          if (offer.identity.card.uid === uid) {
            offlineLink.disconnect();
            return fail(problem('That’s your own account', 'Hold your phone to theirs.', true));
          }
          haptics.success();
          fail({ kind: 'confirm', offer, shapes: shapesForNonce(offer.nonce) });
        } catch {
          offlineLink.disconnect();
          fail(problem('Lost the other phone', 'Hold the phones closer and try again.', true));
        }
      });
    })().catch(() => {
      clearTimeout(timer);
      fail(
        problem('Bluetooth isn’t available', 'Turn Bluetooth off and on, then try again.', true),
      );
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopLooking.current?.();
    };
  }, [attempt, blocked === null, serverKey, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Never leave a Bluetooth link open behind the screen.
  useEffect(() => () => offlineLink.disconnect(), []);

  const done = () => {
    reset();
    router.dismissTo('/home');
  };

  const current = blocked ?? step;

  if (current.kind === 'problem') {
    return (
      <Screen
        footer={
          <View style={styles.actions}>
            {current.retry ? (
              <Button
                label="Try again"
                onPress={() => {
                  setStep({ kind: 'looking' });
                  setAttempt((n) => n + 1);
                }}
              />
            ) : null}
            {currency === 'NGN' ? (
              <Button
                label="Pay with a QR code"
                variant="outline"
                onPress={() => router.replace('/offline/pay')}
              />
            ) : null}
          </View>
        }
      >
        <Header
          onBack={() => router.back()}
          center={<AppText variant="subheading">No network</AppText>}
        />
        <View style={styles.center}>
          <AppText variant="title" align="center">
            {current.title}
          </AppText>
          <AppText color="textMuted" align="center">
            {current.message}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (current.kind === 'confirm') {
    const { offer, shapes } = current;
    const { shop } = offer.identity.card;
    // Shops show under their verified business name.
    const name = shop || offer.identity.card.name;
    const first = shop || (name.split(/\s+/)[0] ?? name);
    return (
      <Screen
        footer={
          <Approve
            reason={`Pay ${naira(amountKobo)} to ${name} with no network.`}
            onApproved={async (secretKey) => {
              const signed = await updateLedger(uid, (l) => {
                const paid = payOffline(l, {
                  request: { uid: offer.identity.card.uid, name, nonce: offer.nonce, amountKobo },
                  amountKobo,
                  fromUid: uid,
                  secretKey,
                  now: Date.now(),
                  noteId: randomId('NT'),
                });
                return { ledger: paid.ledger, result: paid.note };
              });
              setStep({ kind: 'sending', name });
              const noteId = signed.note.noteId;
              try {
                const answer = await offlineLink.sendPayment(
                  encodeHumPayment({ note: signed, fromName: profile?.fullName ?? 'A Faara user' }),
                );
                await updateLedger(uid, (l) => ({
                  ledger: markDelivery(l, noteId, answer.ok ? 'confirmed' : 'refused'),
                  result: null,
                }));
                if (answer.ok) {
                  haptics.success();
                  setStep({ kind: 'paid', name });
                } else {
                  setStep(problem(`${first} didn’t accept it`, answer.reason, true));
                }
              } catch {
                await updateLedger(uid, (l) => ({
                  ledger: markDelivery(l, noteId, 'unknown'),
                  result: null,
                }));
                setStep({ kind: 'unsure', name });
              }
            }}
          />
        }
      >
        <Header
          onBack={() => router.back()}
          center={<AppText variant="subheading">No network</AppText>}
        />
        <View style={styles.body}>
          <View style={styles.center}>
            <AppText color="textMuted">Paying</AppText>
            <AppText variant="title" align="center">
              {name}
            </AppText>
            {shop ? (
              <AppText variant="label" color="accentText">
                Verified shop · {offer.identity.card.name}
              </AppText>
            ) : null}
            <AppText variant="title" color="accentText" align="center">
              {naira(amountKobo)}
            </AppText>
            {note ? <AppText color="textMuted">{note}</AppText> : null}
          </View>
          {shop ? (
            <AppText color="textMuted" align="center">
              Faara checked this is {shop}, a verified shop. Their till shows your payment as soon
              as it arrives.
            </AppText>
          ) : (
            <ShapeMatch
              shapes={shapes}
              hint={`${first}’s screen shows the same three shapes. If it doesn’t, don’t approve.`}
            />
          )}
        </View>
      </Screen>
    );
  }

  if (current.kind === 'paid' || current.kind === 'unsure') {
    const paid = current.kind === 'paid';
    return (
      <Screen footer={<Button label="Done" onPress={done} />}>
        <View style={styles.center}>
          {paid ? <SuccessBurst size={104} /> : null}
          <AppText variant="title" align="center">
            {paid ? `${naira(amountKobo)} paid` : 'Check with them'}
          </AppText>
          <AppText color="textMuted" align="center">
            {paid
              ? `${current.name}’s phone checked it with no network. It settles when either phone is back online.`
              : `The phones lost each other just as the payment went across. Ask ${current.name} if it arrived. If it did, it settles when their phone is online.`}
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        onBack={() => router.back()}
        center={<AppText variant="subheading">No network</AppText>}
      />
      <View style={styles.center}>
        <HumPulse size={110} />
        <AppText variant="title" align="center">
          {current.kind === 'sending'
            ? `Paying ${current.name}`
            : current.kind === 'connecting'
              ? 'Found a phone'
              : 'Hold phones close'}
        </AppText>
        <AppText color="textMuted" align="center">
          {current.kind === 'looking'
            ? `No network, so Faara is pairing over Bluetooth. They just need Faara open on their home screen. You can pay up to ${naira(limit)}.`
            : 'Keep the phones together.'}
        </AppText>
      </View>
    </Screen>
  );
}

function problem(
  title: string,
  message: string,
  retry = false,
): Extract<Step, { kind: 'problem' }> {
  return { kind: 'problem', title, message, retry };
}

const styles = StyleSheet.create({
  body: { gap: 20, paddingVertical: 16 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 8 },
  actions: { gap: 10 },
});
