import { getRandomBytes } from 'expo-crypto';
import { Buffer } from 'buffer';

/** A random id that is safe in notes and QR codes. */
export function randomId(prefix: string): string {
  return prefix + Buffer.from(getRandomBytes(15)).toString('base64url');
}
