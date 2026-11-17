import { useEffect, useState } from 'react';

import type { Balances } from '@shared/convert';

import { useAuth } from '@/features/auth';

import { watchBalances } from './convertApi';

/** Live naira, dollar and USDC balances (null while loading). */
export function useBalances(): Balances | null {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{ uid: string; balances: Balances } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return watchBalances(uid, (balances) => setState({ uid, balances }));
  }, [uid]);
  return state && state.uid === uid ? state.balances : null;
}
