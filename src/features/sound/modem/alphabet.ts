/**
 * Crockford base32: 32 symbols without I, L, O or U, so codes are easy to read aloud
 * and type as a manual fallback. Each character maps to one 5-bit symbol, which is
 * also one element of GF(32) for the Reed-Solomon code and one FSK tone.
 */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Hum codes are exactly this many characters. */
export const CODE_LENGTH = 10;

const LOOKUP = new Map<string, number>(Array.from(ALPHABET, (char, index) => [char, index]));
// Crockford decoding aliases for characters people commonly mistype.
LOOKUP.set('O', 0).set('I', 1).set('L', 1);

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const char of code.toUpperCase()) if (!LOOKUP.has(char)) return false;
  return true;
}

/** Converts a code to symbol values (0–31). Throws on invalid input. */
export function codeToSymbols(code: string): number[] {
  if (!isValidCode(code)) throw new Error(`Invalid hum code: "${code}"`);
  return Array.from(code.toUpperCase(), (char) => LOOKUP.get(char) as number);
}

export function symbolsToCode(symbols: readonly number[]): string {
  return symbols
    .map((symbol) => {
      const char = ALPHABET[symbol];
      if (char === undefined) throw new Error(`Symbol out of range: ${symbol}`);
      return char;
    })
    .join('');
}

/**
 * Random code for local testing. Production codes are issued by the backend.
 * Uses `crypto.getRandomValues` where available.
 */
export function randomCode(length: number = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => ALPHABET[byte & 31]).join('');
}
