/**
 * Runtime polyfills for Solana libraries on React Native (Hermes). Imported first,
 * from the app entry, before any other module.
 */
import { Buffer } from 'buffer';
import { getRandomValues } from 'expo-crypto';

const globals = globalThis as unknown as {
  Buffer?: typeof Buffer;
  crypto?: { getRandomValues?: typeof getRandomValues };
};

globals.Buffer ??= Buffer;

if (typeof globals.crypto?.getRandomValues !== 'function') {
  // Cryptographically secure random bytes from the platform (expo-crypto).
  globals.crypto = { ...(globals.crypto ?? {}), getRandomValues };
}
