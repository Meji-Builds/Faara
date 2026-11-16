import { fromHex, toHex } from './keys';
import {
  assertNotLocked,
  parseLockout,
  recordFailure,
  recordSuccess,
  type LockoutStorage,
} from './pinLockout';
import type { WalletSecrets, WalletVault } from './vault.types';

/**
 * Web vault: browsers have no hardware keystore, so the secrets are encrypted with a key
 * derived from the PIN (PBKDF2-SHA-256 → AES-GCM) and kept in localStorage. A six-digit
 * PIN can be brute-forced offline from a copied browser profile, so this is suitable for
 * devnet testing only; production web wallets need a stronger secret or passkeys.
 */
const STORAGE_KEY = 'faara.wallet.v1';
const LOCKOUT_KEY = 'faara.wallet.lockout';
const ITERATIONS = 310_000;

interface Envelope {
  v: 1;
  address: string;
  salt: string;
  iv: string;
  data: string;
}

function readEnvelope(): Envelope | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Envelope) : null;
  } catch {
    return null;
  }
}

const lockout: LockoutStorage = {
  read: async () => parseLockout(window.localStorage.getItem(LOCKOUT_KEY)),
  write: async (state) => window.localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state)),
};

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export const vault: WalletVault = {
  pinEncrypted: true,

  storedAddress: async () => readEnvelope()?.address ?? null,

  async save(secrets, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pin, salt);
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ phrase: secrets.phrase, seedHex: secrets.seedHex }),
    );
    const data = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
    );
    const envelope: Envelope = {
      v: 1,
      address: secrets.address,
      salt: toHex(salt),
      iv: toHex(iv),
      data: toHex(data),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    await recordSuccess(lockout);
  },

  async unlock(pin) {
    const envelope = readEnvelope();
    if (!envelope) throw new Error('No wallet on this device');
    if (pin === null) throw new Error('A PIN is required on the web');
    await assertNotLocked(lockout);
    const key = await deriveKey(pin, fromHex(envelope.salt));
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromHex(envelope.iv) as BufferSource },
        key,
        fromHex(envelope.data) as BufferSource,
      );
    } catch {
      throw await recordFailure(lockout);
    }
    await recordSuccess(lockout);
    const { phrase, seedHex } = JSON.parse(new TextDecoder().decode(plaintext)) as Omit<
      WalletSecrets,
      'address'
    >;
    return { phrase, seedHex, address: envelope.address };
  },

  async clear() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LOCKOUT_KEY);
  },
};
