import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { toHex } from './keys';
import { hashPin, safeEqual } from './pinHash';
import {
  assertNotLocked,
  parseLockout,
  recordFailure,
  recordSuccess,
  type LockoutStorage,
} from './pinLockout';
import type { WalletSecrets, WalletVault } from './vault.types';

/**
 * Native vault: secrets live in the OS keystore via expo-secure-store (Android Keystore /
 * iOS Keychain), readable only by this app on this device. The PIN hash gates use.
 */
const KEYS = {
  phrase: 'faara.wallet.phrase',
  seed: 'faara.wallet.seed',
  address: 'faara.wallet.address',
  pinSalt: 'faara.wallet.pinSalt',
  pinHash: 'faara.wallet.pinHash',
  lockout: 'faara.wallet.lockout',
} as const;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const lockout: LockoutStorage = {
  read: async () => parseLockout(await SecureStore.getItemAsync(KEYS.lockout, OPTIONS)),
  write: (state) => SecureStore.setItemAsync(KEYS.lockout, JSON.stringify(state), OPTIONS),
};

async function readSecrets(): Promise<WalletSecrets> {
  const [phrase, seedHex, address] = await Promise.all([
    SecureStore.getItemAsync(KEYS.phrase, OPTIONS),
    SecureStore.getItemAsync(KEYS.seed, OPTIONS),
    SecureStore.getItemAsync(KEYS.address, OPTIONS),
  ]);
  if (!phrase || !seedHex || !address) throw new Error('No wallet on this device');
  return { phrase, seedHex, address };
}

export const vault: WalletVault = {
  pinEncrypted: false,

  storedAddress: () => SecureStore.getItemAsync(KEYS.address, OPTIONS),

  async save(secrets, pin) {
    const salt = toHex(getRandomBytes(16));
    await SecureStore.setItemAsync(KEYS.phrase, secrets.phrase, OPTIONS);
    await SecureStore.setItemAsync(KEYS.seed, secrets.seedHex, OPTIONS);
    await SecureStore.setItemAsync(KEYS.pinSalt, salt, OPTIONS);
    await SecureStore.setItemAsync(KEYS.pinHash, hashPin(pin, salt), OPTIONS);
    await SecureStore.setItemAsync(KEYS.address, secrets.address, OPTIONS);
    await recordSuccess(lockout);
  },

  async unlock(pin) {
    if (pin !== null) {
      await assertNotLocked(lockout);
      const [salt, expected] = await Promise.all([
        SecureStore.getItemAsync(KEYS.pinSalt, OPTIONS),
        SecureStore.getItemAsync(KEYS.pinHash, OPTIONS),
      ]);
      if (!salt || !expected) throw new Error('No wallet on this device');
      if (!safeEqual(hashPin(pin, salt), expected)) throw await recordFailure(lockout);
      await recordSuccess(lockout);
    }
    return readSecrets();
  },

  async clear() {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key, OPTIONS)));
  },
};
