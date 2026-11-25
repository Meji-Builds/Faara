import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/features/auth';
import { getUsdcBalance } from '@/features/wallet/solana';

/**
 * USDC in the person's own dollar wallet, read from the blockchain, in cents (null until
 * known, or with no wallet). Reloads whenever the screen comes into view; call `refresh`
 * after a change.
 */
export function useWalletUsdc(): { cents: number | null; refresh: () => Promise<void> } {
  const { profile } = useAuth();
  const address = profile?.walletAddress ?? null;
  const [cents, setCents] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setCents(Math.floor((await getUsdcBalance(address)) * 100 + 1e-6));
    } catch {
      // Keep the last known balance; the next refresh will try again.
    }
  }, [address]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { cents: address ? cents : null, refresh };
}
