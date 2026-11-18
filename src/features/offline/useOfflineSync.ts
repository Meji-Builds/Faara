import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { useAppActive } from '@/lib/useAppActive';
import { useOnline } from '@/lib/connectivity';

import { applySettlement, waitingNotes } from './ledger';
import { pocketStatus, settleNotes } from './offlineApi';
import { loadLedger, updateLedger } from './store';

const RETRY_MS = 30_000;

/** Brings the phone's offline ledger up to date with the server. Safe to call often. */
export async function syncOffline(uid: string): Promise<void> {
  const ledger = await loadLedger(uid);
  const waiting = waitingNotes(ledger);
  for (let i = 0; i < waiting.length; i += 20) {
    const { results } = await settleNotes(waiting.slice(i, i + 20));
    await updateLedger(uid, (l) => ({ ledger: applySettlement(l, results), result: null }));
  }
  const askedAt = Date.now();
  const { pocket, serverPublicKey } = await pocketStatus();
  await updateLedger(uid, (l) => {
    const local = l.pocket;
    const matches = local !== null && local.signed.certificate.pocketId === pocket?.pocketId;
    // A pocket stored after this check started is newer than the answer: keep it.
    const keep = matches || (local !== null && local.openedAt >= askedAt);
    return {
      ledger: { ...l, serverPublicKey, remote: pocket, pocket: keep ? local : null },
      result: null,
    };
  });
}

/**
 * Keeps offline payments moving: whenever the app is open and online, payments received
 * offline are settled and the pocket and Faara's key are refreshed.
 */
export function useOfflineSync(): void {
  const { user } = useAuth();
  const uid = user?.uid;
  const online = useOnline();
  const active = useAppActive();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid) return;
    void loadLedger(uid);
    if (!active) return;
    syncOffline(uid).catch(() => {
      // Offline or the server is unavailable: try again shortly (below).
    });
  }, [uid, online, active, attempt]);
  // While offline, check back now and then; a successful sync also marks the app online.
  useEffect(() => {
    if (online || !active) return;
    const timer = setInterval(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearInterval(timer);
  }, [online, active]);
}
