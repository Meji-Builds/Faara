import { useCallback, useEffect, useState } from 'react';

import type { ActivityEntry } from '@shared/hum';

import { useAuth } from '@/features/auth';
import { getUsdcBalance } from '@/features/wallet';
import { useAsyncValue } from '@/lib/useAsyncValue';

import { watchActivity, watchNairaBalance } from './activity';

/** Live naira balance in naira (null while loading). */
export function useNairaBalance(): number | null {
  const { user } = useAuth();
  const uid = user?.uid;
  const [kobo, setKobo] = useState<{ uid: string; value: number } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return watchNairaBalance(uid, (value) => setKobo({ uid, value }));
  }, [uid]);
  return kobo && kobo.uid === uid ? kobo.value / 100 : null;
}

/** Devnet USDC balance for the user's wallet, with a manual refresh. */
export function useUsdcBalance() {
  const { profile } = useAuth();
  const address = profile?.walletAddress ?? null;
  const load = useCallback(async () => (address ? getUsdcBalance(address) : 0), [address]);
  return useAsyncValue(load);
}

/** Live recent activity, newest first. */
export function useActivity(max = 50): ActivityEntry[] | null {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{ uid: string; entries: ActivityEntry[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return watchActivity(uid, max, (entries) => setState({ uid, entries }));
  }, [uid, max]);
  return state && state.uid === uid ? state.entries : null;
}
