import type { Keypair } from '@solana/web3.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Keypair as DemoKeypair } from '@solana/web3.js';
import { AppState } from 'react-native';

import { DOLLARS_ENABLED } from '@/config/features';
import { setWalletAddress, useAuth } from '@/features/auth';
import { DEMO } from '@/features/demo/engine';

import { canUseBiometrics, confirmWithBiometrics } from './biometrics';
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
  /** Replaces the PIN. Rejects with WrongPinError / PinLockedError if `currentPin` is wrong. */
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  /** App lock: true until the passcode or fingerprint is given this session. */
  locked: boolean;
  unlockWithPin: (pin: string) => Promise<void>;
  /** Shows the fingerprint prompt; resolves true if it unlocked. */
  unlockWithBiometrics: () => Promise<boolean>;
}

/** Time in the background after which the app locks again. */
const RELOCK_AFTER_MS = 60_000;

const WalletContext = createContext<WalletContextValue | null>(null);

/** Defers heavy key derivation a tick so a spinner can render first. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 16));

function RealWalletProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user, profile } = useAuth();
  const [deviceAddress, setDeviceAddress] = useState<string | null | undefined>(undefined);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [locked, setLocked] = useState(true);
  const backgroundedAt = useRef<number | null>(null);

  // Lock again after the app has been in the background for a while.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const since = backgroundedAt.current;
        if (since !== null && Date.now() - since > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      } else if (backgroundedAt.current === null) {
        backgroundedAt.current = Date.now();
      }
    });
    return () => subscription.remove();
  }, []);

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
      // While dollars are paused the wallet stays on this device and is not published, so
      // using Faara on another phone or the web can't clash with it.
      if (DOLLARS_ENABLED) await setWalletAddress(user.uid, address);
      setDeviceAddress(address);
      setLocked(false); // they just chose the PIN
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

  const changePin = useCallback(async (currentPin: string, newPin: string) => {
    const secrets = await vault.unlock(currentPin);
    await nextTick();
    await vault.save(secrets, newPin);
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    await vault.unlock(pin);
    setLocked(false);
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    if (vault.pinEncrypted || !(await confirmWithBiometrics('Unlock Faara'))) return false;
    setLocked(false);
    return true;
  }, []);

  const status: WalletStatus =
    authStatus !== 'ready' || deviceAddress === undefined
      ? 'loading'
      : !DOLLARS_ENABLED
        ? // Naira only needs this phone's PIN, not the account's dollar wallet.
          deviceAddress
          ? 'ready'
          : 'needsWallet'
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
      changePin,
      locked,
      unlockWithPin,
      unlockWithBiometrics,
    }),
    [
      changePin,
      locked,
      unlockWithPin,
      unlockWithBiometrics,
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

const DEMO_WALLET: WalletContextValue = {
  status: 'ready',
  deviceAddress: null,
  biometricsAvailable: true,
  pinRequired: false,
  createWallet: async () => undefined,
  restoreWallet: async () => undefined,
  unlockKeypair: async () => DemoKeypair.generate(),
  revealPhrase: async () => '',
  changePin: async () => undefined,
  locked: false,
  unlockWithPin: async () => undefined,
  unlockWithBiometrics: async () => true,
};

export function WalletProvider({ children }: { children: ReactNode }) {
  return DEMO ? (
    <WalletContext.Provider value={DEMO_WALLET}>{children}</WalletContext.Provider>
  ) : (
    <RealWalletProvider>{children}</RealWalletProvider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside <WalletProvider>.');
  return context;
}
