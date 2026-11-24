import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { ShapeTriple } from '@shared/hum';
import { decodeHumPayment, encodeHumOffer, shapesForNonce } from '@shared/offline';

import {
  bleAvailability,
  offlineLink,
  requestBlePermissions,
  type HumAnswer,
} from '@/features/ble';
import { useAuth } from '@/features/auth';
import { haptics } from '@/lib/haptics';

import { randomId } from './ids';
import { receiveOffline } from './ledger';
import { updateLedger, useLedger } from './store';

export type OfflineReceiveState =
  | { kind: 'waiting' }
  | { kind: 'connected'; shapes: ShapeTriple }
  | { kind: 'paid'; amountKobo: number; fromName: string }
  | { kind: 'failed'; reason: string };

/** Why the phone isn't receiving offline right now, if it isn't. */
export type OfflineReceiveBlocker =
  'android-only' | 'bluetooth-off' | 'no-permission' | 'not-set-up' | 'error' | null;

/** Offers recently handed out; a payment answering any of them is accepted. */
const RECENT_OFFERS = 5;

/**
 * Receives offline hums while `enabled`: this phone offers its Faara-signed name and a fresh
 * nonce over Bluetooth, checks any payment that comes back with no network, and keeps it to
 * settle later. A new nonce is offered after every payment.
 */
export function useOfflineReceive(enabled: boolean): {
  state: OfflineReceiveState;
  blocker: OfflineReceiveBlocker;
  dismiss: () => void;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const { identity, serverPublicKey } = ledger;
  const [state, setState] = useState<OfflineReceiveState>({ kind: 'waiting' });
  // Problems found while starting (permission refused, Bluetooth failing).
  const [startError, setStartError] = useState<'no-permission' | 'error' | null>(null);
  const nonces = useRef<string[]>([]);

  // Problems known before starting.
  const availability = enabled && Platform.OS === 'android' ? bleAvailability() : null;
  const precondition: OfflineReceiveBlocker = !enabled
    ? null
    : Platform.OS !== 'android'
      ? 'android-only'
      : !identity || !serverPublicKey
        ? 'not-set-up'
        : availability === 'off'
          ? 'bluetooth-off'
          : availability !== 'ready'
            ? 'android-only'
            : null;
  const canStart = enabled && precondition === null;

  useEffect(() => {
    if (!canStart || !identity) return;

    let cancelled = false;
    let stop: (() => void) | null = null;
    const offerFor = (nonce: string) => {
      nonces.current = [nonce, ...nonces.current].slice(0, RECENT_OFFERS);
      return encodeHumOffer({ identity, nonce });
    };

    const onPayment = async (text: string): Promise<HumAnswer> => {
      const payment = decodeHumPayment(text);
      if (!payment) return { ok: false, reason: 'The payment couldn’t be read.' };
      const { note, fromName } = payment;
      if (!nonces.current.includes(note.note.nonce)) {
        return { ok: false, reason: 'This payment is for someone else.' };
      }
      const error = await updateLedger(uid, (current) => {
        const result = receiveOffline(current, {
          note,
          fromName,
          request: { uid, name: identity.card.name, nonce: note.note.nonce, amountKobo: 0 },
          now: Date.now(),
        });
        return { ledger: result.ledger, result: result.error };
      });
      if (error) {
        setState({ kind: 'failed', reason: error });
        haptics.warning();
        return { ok: false, reason: error };
      }
      haptics.success();
      setState({ kind: 'paid', amountKobo: note.note.amountKobo, fromName });
      // The next payer gets a fresh nonce.
      void offlineLink.replaceOffer(offerFor(randomId('NC'))).catch(() => undefined);
      return { ok: true };
    };

    (async () => {
      if (!(await requestBlePermissions())) {
        if (!cancelled) setStartError('no-permission');
        return;
      }
      if (cancelled) return;
      try {
        const nonce = randomId('NC');
        const stopReceiving = await offlineLink.startReceiving(offerFor(nonce), {
          onPayer: () => {
            const latest = nonces.current[0];
            if (latest) setState({ kind: 'connected', shapes: shapesForNonce(latest) });
          },
          onPayment,
        });
        if (cancelled) stopReceiving();
        else {
          stop = stopReceiving;
          setStartError(null);
        }
      } catch {
        if (!cancelled) setStartError('error');
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [canStart, uid, identity]);

  const dismiss = useCallback(() => setState({ kind: 'waiting' }), []);
  return {
    state,
    blocker: precondition ?? (enabled ? startError : null),
    dismiss,
  };
}
