import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { VendorStatus } from '@shared/vendors';

import { getVendorStatus } from './vendorsApi';

/** The person's vendor status, reloaded whenever the screen comes into view. */
export function useVendorStatus(): { status: VendorStatus | null; reload: () => Promise<void> } {
  const [status, setStatus] = useState<VendorStatus | null>(null);
  const reload = useCallback(async () => {
    try {
      setStatus(await getVendorStatus());
    } catch {
      // Keep what we had; the next visit tries again.
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { status, reload };
}
