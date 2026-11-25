import { useEffect, useMemo, useRef, useState } from 'react';

import type { ActivityEntry } from '@shared/hum';

import { DOLLARS_ENABLED } from '@/config/features';
import { watchActivity } from '@/features/account';
import { useLedger } from '@/features/offline';
import { recentUsdcCredits, type UsdcCredit } from '@/features/wallet/solana';

import { announce, OUTSIDE_WALLET, type TillCurrency, type TillVoice } from './announce';

export interface TillPayment {
  /** The payment id; a payment taken offline keeps its id once it settles. */
  id: string;
  /** Kobo for naira, cents for USDC. */
  amountMinor: number;
  currency: TillCurrency;
  fromName: string;
  at: number;
  /** Taken with no network and not settled yet. */
  offline: boolean;
}

/** How often the till checks the blockchain for USDC from other Solana wallets. */
const CHAIN_POLL_MS = 8_000;

const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Payments to the till since it was opened, newest first: naira from the account, ones
 * taken offline that haven't settled, and USDC arriving in the vendor's own wallet, whether
 * from a Faara customer or any Solana wallet (Solana Pay). Each new one is read out once.
 */
export function useTillFeed(
  uid: string,
  since: number,
  voice: TillVoice,
  walletAddress: string | null = null,
): TillPayment[] {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [credits, setCredits] = useState<UsdcCredit[]>([]);
  const ledger = useLedger(uid);

  useEffect(() => {
    if (!uid) return;
    return watchActivity(uid, 50, setActivity);
  }, [uid]);

  // USDC arriving on the blockchain, including from wallets outside Faara.
  useEffect(() => {
    if (!DOLLARS_ENABLED || !walletAddress) return;
    const seen = new Set<string>();
    let cancelled = false;
    const check = () =>
      recentUsdcCredits(walletAddress, since, seen)
        .then((fresh) => {
          if (!cancelled && fresh.length > 0) setCredits((current) => [...current, ...fresh]);
        })
        .catch(() => undefined); // no network or the node is busy: try again shortly
    void check();
    const timer = setInterval(() => void check(), CHAIN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [walletAddress, since]);

  const payments = useMemo(() => {
    const byId = new Map<string, TillPayment>();
    // Faara's own records name the payer; a USDC one is keyed by its signature so the
    // same payment seen on the blockchain isn't counted twice.
    const namesBySignature = new Map<string, string>();
    for (const entry of activity) {
      if (entry.direction !== 'in' || entry.kind === 'deposit' || entry.createdAt < since) continue;
      if (entry.currency === 'USDC') {
        if (entry.signature) namesBySignature.set(entry.signature, entry.counterpartyName);
        continue;
      }
      if (entry.currency !== 'NGN') continue;
      byId.set(entry.paymentId, {
        id: entry.paymentId,
        amountMinor: entry.amountMinor,
        currency: 'NGN',
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
        amountMinor: received.note.note.amountKobo,
        currency: 'NGN',
        fromName: received.fromName ?? 'A customer',
        at: received.receivedAt,
        offline: received.status === 'waiting',
      });
    }
    for (const credit of credits) {
      byId.set(credit.signature, {
        id: credit.signature,
        amountMinor: credit.cents,
        currency: 'USDC',
        fromName:
          namesBySignature.get(credit.signature) ??
          (credit.from ? `Solana wallet ${shortAddress(credit.from)}` : 'A Solana wallet'),
        at: credit.at,
        offline: false,
      });
    }
    return [...byId.values()].sort((a, b) => b.at - a.at);
  }, [activity, ledger.received, credits, since]);

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
      const name = payment.fromName.startsWith('Solana wallet') ? OUTSIDE_WALLET : payment.fromName;
      announce(payment.amountMinor, name, voiceRef.current, payment.currency);
    }
  }, [payments]);

  return payments;
}
