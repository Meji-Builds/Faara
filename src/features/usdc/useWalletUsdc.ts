import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getUsdcWallet } from './usdcApi';

/**
 * USDC held in the person's Faara wallet, in cents (null until known or when wallets aren't
 * switched on). Reloads whenever the screen comes into view; call `refresh` after a change.
 */
export function useWalletUsdc(): { cents: number | null; refresh: () => Promise<void> } {
  const [cents, setCents] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { wallet } = await getUsdcWallet();
      setCents(wallet ? Math.floor(Number(wallet.usdc) * 100 + 1e-6) : null);
    } catch {
      // Keep the last known balance; the next refresh will try again.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { cents, refresh };
}
