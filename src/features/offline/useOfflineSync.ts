import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { usePreferences } from '@/features/preferences';
import { useWallet } from '@/features/wallet';
import { useAppActive } from '@/lib/useAppActive';
import { useOnline } from '@/lib/connectivity';

import {
  applySettlement,
  applyTopUp,
  restorePocket,
  topUpNeeded,
  waitingNotes,
  type OfflineLedger,
} from './ledger';
import { fetchIdentity, pocketStatus, reclaimPocket, settleNotes, topUpPocket } from './offlineApi';
import { loadLedger, updateLedger } from './store';

const RETRY_MS = 30_000;
/** Fetch a fresh name card this long before the old one runs out. */
const IDENTITY_REFRESH_MS = 7 * 24 * 3_600_000;
/** After a refill fails (say, not enough balance), wait this long before trying again. */
const REFILL_BACKOFF_MS = 10 * 60_000;
let refillFailedAt = 0;

export interface SyncOptions {
  /** Naira (kobo) to keep ready for offline payments; 0 turns refills off. */
  reserveKobo?: number;
  /** This phone's wallet address; its key is the pocket's key. */
  walletAddress?: string | null;
  /** Told the reserve saved on the account, when this phone has none of its own yet. */
  onSavedReserve?: (reserveKobo: number) => void;
}

/** The pocket key for a wallet address: the same Ed25519 key, as base64. */
export function keyFromAddress(address: string): string {
  return Buffer.from(new PublicKey(address).toBytes()).toString('base64');
}

/**
 * Brings the phone's offline ledger up to date with the server: settles payments, refreshes
 * the pocket, Faara's key and this person's name card, and keeps the pocket topped up to the
 * amount they chose. Safe to call often.
 */
export async function syncOffline(uid: string, options: SyncOptions = {}): Promise<void> {
  const ledger = await loadLedger(uid);
  const waiting = waitingNotes(ledger);
  for (let i = 0; i < waiting.length; i += 20) {
    const { results } = await settleNotes(waiting.slice(i, i + 20));
    await updateLedger(uid, (l) => ({ ledger: applySettlement(l, results), result: null }));
  }
  const askedAt = Date.now();
  const { pocket, serverPublicKey, reserveKobo: savedReserve } = await pocketStatus();
  if (typeof savedReserve === 'number') options.onSavedReserve?.(savedReserve);
  let synced: OfflineLedger = await updateLedger(uid, (l) => {
    const local = l.pocket;
    const matches = local !== null && local.signed.certificate.pocketId === pocket?.pocketId;
    // A pocket stored after this check started is newer than the answer: keep it.
    const keep = matches || (local !== null && local.openedAt >= askedAt);
    const next = { ...l, serverPublicKey, remote: pocket, pocket: keep ? local : null };
    return { ledger: next, result: next };
  });

  if (!synced.identity || synced.identity.card.expiresAt - Date.now() < IDENTITY_REFRESH_MS) {
    const identity = await fetchIdentity().catch(() => null);
    if (identity) await updateLedger(uid, (l) => ({ ledger: { ...l, identity }, result: null }));
  }

  const { walletAddress } = options;
  // This phone lost its copy of the pocket (say, the app was reinstalled): get it back,
  // as long as the pocket's key is this phone's.
  if (synced.pocket === null && synced.remote && walletAddress) {
    const key = keyFromAddress(walletAddress);
    const back = await reclaimPocket(key).catch(() => null);
    if (back && back.certificate.certificate.devicePublicKey === key) {
      synced = await updateLedger(uid, (l) => {
        const next = restorePocket(l, back.certificate, back.remainingKobo, Date.now());
        return { ledger: next, result: next };
      });
    }
  }

  const reserveKobo = Math.max(0, options.reserveKobo ?? savedReserve ?? 0);
  const add = topUpNeeded(synced, reserveKobo, Date.now());
  if (add === null || !walletAddress || Date.now() - refillFailedAt < REFILL_BACKOFF_MS) return;
  try {
    const signed = await topUpPocket(add, keyFromAddress(walletAddress));
    await updateLedger(uid, (l) => ({ ledger: applyTopUp(l, signed, Date.now()), result: null }));
    const fresh = await pocketStatus();
    await updateLedger(uid, (l) => ({ ledger: { ...l, remote: fresh.pocket }, result: null }));
  } catch {
    refillFailedAt = Date.now();
  }
}

/**
 * Keeps offline payments moving: whenever the app is open and online, payments are settled,
 * and the pocket, Faara's key and the name card are refreshed and topped up.
 */
export function useOfflineSync(): void {
  const { user } = useAuth();
  const uid = user?.uid;
  const online = useOnline();
  const active = useAppActive();
  const { preferences, setPreference } = usePreferences();
  const chosen = preferences.offlineReserveKobo;
  // -1 means this phone hasn't been told yet: use what's saved on the account.
  const reserveKobo = chosen >= 0 ? chosen : undefined;
  const walletAddress = useWallet().deviceAddress;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid) return;
    void loadLedger(uid);
    if (!active) return;
    const onSavedReserve =
      chosen < 0 ? (saved: number) => setPreference('offlineReserveKobo', saved) : undefined;
    syncOffline(uid, { reserveKobo, walletAddress, onSavedReserve }).catch(() => {
      // Offline or the server is unavailable: try again shortly (below).
    });
  }, [uid, online, active, attempt, reserveKobo, chosen, walletAddress, setPreference]);
  // While offline, check back now and then; a successful sync also marks the app online.
  useEffect(() => {
    if (online || !active) return;
    const timer = setInterval(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearInterval(timer);
  }, [online, active]);
}
