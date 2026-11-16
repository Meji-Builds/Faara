import type { Keypair } from '@solana/web3.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { setWalletAddress, useAuth } from '@/features/auth';

import { canUseBiometrics } from './biometrics';
import {
  createRecoveryPhrase,
  fromHex,
  keypairFromSeed,
  solanaSeedFromPhrase,
  toHex,
} from './keys';
import { vault } from './vault';

/**
 * - `loading`: checking this device
 * - `needsWallet`: the account has no wallet yet (sign-up step 3)
 * - `needsRestore`: the account's wallet isn't on this device (new phone or browser)
 * - `ready`: this device holds the account's wallet
 */
export type WalletStatus = 'loading' | 'needsWallet' | 'needsRestore' | 'ready';

interface WalletContextValue {
  status: WalletStatus;
  /** Address of the wallet stored on this device, if any. */
  deviceAddress: string | null;
  biometricsAvailable: boolean;
  /** Secrets are PIN-encrypted (web), so every unlock needs the PIN. */
  pinRequired: boolean;
  createWallet: (pin: string) => Promise<void>;
  restoreWallet: (phrase: string, pin: string) => Promise<void>;
  /** Signing key. Pass the PIN, or null after a successful biometric check (native only). */
  unlockKeypair: (pin: string | null) => Promise<Keypair>;
  revealPhrase: (pin: string | null) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** Defers heavy key derivation a tick so a spinner can render first. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 16));

export function WalletProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user, profile } = useAuth();
  const [deviceAddress, setDeviceAddress] = useState<string | null | undefined>(undefined);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    vault
      .storedAddress()
      .catch(() => null)
      .then((address) => !cancelled && setDeviceAddress(address));
    canUseBiometrics().then((available) => !cancelled && setBiometricsAvailable(available));
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (phrase: string, pin: string) => {
      if (!user) throw new Error('Sign in first');
      await nextTick();
      const seed = solanaSeedFromPhrase(phrase);
      const address = keypairFromSeed(seed).publicKey.toBase58();
      await vault.save({ phrase, seedHex: toHex(seed), address }, pin);
      await setWalletAddress(user.uid, address);
      setDeviceAddress(address);
    },
    [user],
  );

  const createWallet = useCallback(
    (pin: string) => persist(createRecoveryPhrase(), pin),
    [persist],
  );
  const restoreWallet = useCallback(
    (phrase: string, pin: string) => persist(phrase, pin),
    [persist],
  );

  const unlockKeypair = useCallback(async (pin: string | null) => {
    const secrets = await vault.unlock(pin);
    return keypairFromSeed(fromHex(secrets.seedHex));
  }, []);

  const revealPhrase = useCallback(
    async (pin: string | null) => (await vault.unlock(pin)).phrase,
    [],
  );

  const status: WalletStatus =
    authStatus !== 'ready' || deviceAddress === undefined
      ? 'loading'
      : !profile?.walletAddress
        ? 'needsWallet'
        : deviceAddress !== profile.walletAddress
          ? 'needsRestore'
          : 'ready';

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      deviceAddress: deviceAddress ?? null,
      biometricsAvailable,
      pinRequired: vault.pinEncrypted,
      createWallet,
      restoreWallet,
      unlockKeypair,
      revealPhrase,
    }),
    [
      status,
      deviceAddress,
      biometricsAvailable,
      createWallet,
      restoreWallet,
      unlockKeypair,
      revealPhrase,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside <WalletProvider>.');
  return context;
}
