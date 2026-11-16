/**
 * Bluetooth advertisement payload: 1 version byte + the 10-character hum code packed
 * as 50 bits (5 bits per Crockford base32 character) into 7 bytes. 8 bytes total fits
 * comfortably in a legacy advertisement next to the 16-bit service UUID.
 */
import { ALPHABET, CODE_LENGTH } from '@/features/sound/modem/alphabet';

export const PAYLOAD_VERSION = 1;
export const PAYLOAD_LENGTH = 8;

export function packToken(token: string): Uint8Array {
  if (token.length !== CODE_LENGTH) throw new RangeError('Hum code must be 10 characters');
  let bits = 0n;
  for (const char of token.toUpperCase()) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new RangeError(`Invalid character in hum code: ${char}`);
    bits = (bits << 5n) | BigInt(value);
  }
  const out = new Uint8Array(PAYLOAD_LENGTH);
  out[0] = PAYLOAD_VERSION;
  // 50 bits right-aligned in 56 bits (7 bytes), big-endian.
  for (let i = 7; i >= 1; i--) {
    out[i] = Number(bits & 0xffn);
    bits >>= 8n;
  }
  return out;
}

/** Returns the hum code, or null for payloads from other versions or other apps. */
export function unpackToken(payload: Uint8Array): string | null {
  if (payload.length !== PAYLOAD_LENGTH || payload[0] !== PAYLOAD_VERSION) return null;
  let bits = 0n;
  for (let i = 1; i < PAYLOAD_LENGTH; i++) bits = (bits << 8n) | BigInt(payload[i] as number);
  if (bits >> 50n !== 0n) return null;
  let token = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    token = (ALPHABET[Number(bits & 31n)] as string) + token;
    bits >>= 5n;
  }
  return token;
}

/**
 * Rough distance from RSSI with the log-distance path-loss model. `measuredPower` is the
 * expected RSSI at 1 m for the sender's ultra-low transmit power; phones vary, so this is
 * only used to rank claimants.
 */
export function estimateDistanceFromRssi(
  rssi: number,
  measuredPower = -75,
  pathLossExponent = 2,
): number {
  const metres = 10 ** ((measuredPower - rssi) / (10 * pathLossExponent));
  return Math.round(Math.min(500, Math.max(5, metres * 100)));
}

/** Advertisements weaker than this are treated as out of range (~1 m at ultra-low power). */
export const MIN_RSSI = -80;
