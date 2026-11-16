/** Business rules for hums, shared by the app and the server. */

export const CURRENCIES = ['NGN', 'USDC'] as const;
export type HumCurrency = (typeof CURRENCIES)[number];

/** A hum code can be claimed for this long after it is issued. */
export const HUM_TOKEN_TTL_MS = 30_000;
/** The sender must choose a recipient within this time of issuing the hum. */
export const HUM_CHOOSE_TTL_MS = 5 * 60_000;
/** Claims beyond this are refused; more than a handful nearby means something is off. */
export const MAX_CLAIMS_PER_HUM = 5;
export const MAX_NOTE_LENGTH = 60;
export const MANUAL_CODE_LENGTH = 6;

/** QR payload for a hum code, e.g. "faara:hum:K72GEKVHAA". */
export const QR_PREFIX = 'faara:hum:';

export function humQrPayload(token: string): string {
  return `${QR_PREFIX}${token}`;
}

/** Extracts the hum code from a scanned QR payload, or null if it isn't a Faara hum. */
export function parseHumQr(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.toLowerCase().startsWith(QR_PREFIX)) return null;
  const token = trimmed.slice(QR_PREFIX.length).toUpperCase();
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(token) ? token : null;
}

/** Per-transfer limits in major units. Real limits come from KYC tier later. */
export const MAX_AMOUNT: Record<HumCurrency, number> = { NGN: 5_000_000, USDC: 10_000 };

/** Requests allowed per user per minute. */
export const RATE_LIMITS = {
  createHum: 10,
  claimHum: 30,
  /** Six-digit codes are guessable, so typed claims are limited much harder. */
  claimManual: 6,
  chooseRecipient: 20,
} as const;
export type RateLimitedAction = keyof typeof RATE_LIMITS;

export type HumStatus = 'open' | 'chosen' | 'cancelled';
export type ClaimChannel = 'sound' | 'bluetooth' | 'qr' | 'manual';
export const CLAIM_CHANNELS: readonly ClaimChannel[] = ['sound', 'bluetooth', 'qr', 'manual'];

/** Amounts are stored as integer minor units (kobo, or cents of USDC). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}
