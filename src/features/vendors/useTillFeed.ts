import { useEffect, useMemo, useRef, useState } from 'react';

import type { ActivityEntry } from '@shared/hum';

import { watchActivity } from '@/features/account';
import { useLedger } from '@/features/offline';

import { announce, type TillVoice } from './announce';

export interface TillPayment {
  /** The payment id; a payment taken offline keeps its id once it settles. */
  id: string;
  amountKobo: number;
  fromName: string;
  at: number;
  /** Taken with no network and not settled yet. */
  offline: boolean;
}

/**
 * Payments to the till since it was opened, newest first: settled ones from the account,
 * plus ones taken offline that haven't settled. Each new one is read out once.
 */
export function useTillFeed(uid: string, since: number, voice: TillVoice): TillPayment[] {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const ledger = useLedger(uid);

  useEffect(() => {
    if (!uid) return;
    return watchActivity(uid, 50, setActivity);
  }, [uid]);

  const payments = useMemo(() => {
    const byId = new Map<string, TillPayment>();
    for (const entry of activity) {
      if (entry.direction !== 'in' || entry.kind === 'deposit' || entry.currency !== 'NGN')
        continue;
      if (entry.createdAt < since) continue;
      byId.set(entry.paymentId, {
        id: entry.paymentId,
        amountKobo: entry.amountMinor,
        fromName: entry.counterpartyName || 'A customer',
        at: entry.createdAt,
        offline: false,
      });
    }
    for (const received of ledger.received) {
      const id = received.note.note.noteId;
      if (received.receivedAt < since || byId.has(id) || received.status === 'rejected') continue;
      byId.set(id, {
        id,
        amountKobo: received.note.note.amountKobo,
        fromName: received.fromName ?? 'A customer',
        at: received.receivedAt,
        offline: received.status === 'waiting',
      });
    }
    return [...byId.values()].sort((a, b) => b.at - a.at);
  }, [activity, ledger.received, since]);

  // Read out each payment the first time it shows up.
  const spoken = useRef(new Set<string>());
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    for (const payment of [...payments].reverse()) {
      if (spoken.current.has(payment.id)) continue;
      spoken.current.add(payment.id);
      announce(payment.amountKobo, payment.fromName, voiceRef.current);
    }
  }, [payments]);

  return payments;
}
