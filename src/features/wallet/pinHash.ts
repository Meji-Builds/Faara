import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { toHex } from './keys';

const ITERATIONS = 20_000;

/** Slow salted hash of the PIN, stored next to the keys in the OS keystore. */
export function hashPin(pin: string, saltHex: string): string {
  return toHex(
    pbkdf2(sha256, new TextEncoder().encode(pin), new TextEncoder().encode(saltHex), {
      c: ITERATIONS,
      dkLen: 32,
    }),
  );
}

/** Constant-time comparison of two hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
