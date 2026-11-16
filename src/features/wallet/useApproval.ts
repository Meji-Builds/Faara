import type { Keypair } from '@solana/web3.js';
import { useCallback } from 'react';

import { usePreferences } from '@/features/preferences';

import { confirmWithBiometrics } from './biometrics';
import { useWallet } from './WalletProvider';

/**
 * Payment approval. Every payment needs the user's fingerprint or PIN; approval yields the
 * signing key (needed for USDC; naira only needs the approval itself).
 */
export function useApproval() {
  const { biometricsAvailable, pinRequired, unlockKeypair } = useWallet();
  const { preferences } = usePreferences();
  const biometricsEnabled = biometricsAvailable && !pinRequired && preferences.payWithFingerprint;

  /** Resolves with the key, or null if the person cancelled the biometric prompt. */
  const approveWithBiometrics = useCallback(
    async (reason: string): Promise<Keypair | null> => {
      const approved = await confirmWithBiometrics(reason);
      return approved ? unlockKeypair(null) : null;
    },
    [unlockKeypair],
  );

  /** Rejects with WrongPinError / PinLockedError for a bad PIN. */
  const approveWithPin = useCallback((pin: string) => unlockKeypair(pin), [unlockKeypair]);

  return { biometricsEnabled, approveWithBiometrics, approveWithPin };
}
