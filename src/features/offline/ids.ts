import { getRandomBytes } from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * A random id that is safe in notes and QR codes: 20 characters from a 64-character
 * alphabet (120 random bits). Built by hand because the phone's Buffer polyfill doesn't
 * support base64url.
 */
export function randomId(prefix: string): string {
  let id = prefix;
  for (const byte of getRandomBytes(20)) id += ALPHABET[byte & 63];
  return id;
}
