import { ValidationError } from '../hum/validation';

/**
 * Converting between naira, dollars and USDC inside Faara. Every conversion is a quote the
 * person sees first (what they give, what they get, the rate and the fee), valid for a
 * short time, then executed exactly as quoted.
 */

export type ConvertCurrency = 'NGN' | 'USD' | 'USDC';
export const CONVERT_CURRENCIES: readonly ConvertCurrency[] = ['NGN', 'USD', 'USDC'];

/** How long a quote can be accepted. */
export const QUOTE_TTL_MS = 30_000;

/**
 * Faara's fee on a conversion, in basis points of the amount received. Placeholders until
 * the partners' pricing is known: any conversion touching naira, and dollar-to-USDC.
 */
export const CONVERSION_FEE_BPS = { withNaira: 100, par: 25 } as const;

/** Most that can be converted at once, in major units of the currency given. */
export const MAX_CONVERT: Record<ConvertCurrency, number> = {
  NGN: 5_000_000,
  USD: 5_000,
  USDC: 5_000,
};
/** Least that can be converted at once, in major units of the currency given. */
export const MIN_CONVERT: Record<ConvertCurrency, number> = { NGN: 100, USD: 1, USDC: 1 };

export interface QuoteRequest {
  from: ConvertCurrency;
  to: ConvertCurrency;
  /** Amount to give, in major units (naira, dollars, USDC). */
  amount: number;
}

export interface Quote {
  id: string;
  from: ConvertCurrency;
  to: ConvertCurrency;
  /** Given, in minor units (kobo or cents). */
  fromMinor: number;
  /** Received after the fee, in minor units. */
  toMinor: number;
  /** Fee already taken out of what is received, in minor units of the `to` currency. */
  feeMinor: number;
  /** Units of `to` per unit of `from`, before the fee. */
  rate: number;
  expiresAt: number;
}

export interface ExecuteRequest {
  quoteId: string;
}

/** Balances in minor units (kobo for naira, cents for dollars and USDC). */
export interface Balances {
  NGN: number;
  USD: number;
  USDC: number;
}

/** Mid-market rates from a provider; USD and USDC are treated as one-to-one. */
export interface MidRates {
  ngnPerUsd: number;
  asOf: number;
}

function usdValue(currency: ConvertCurrency, rates: MidRates): number {
  return currency === 'NGN' ? 1 / rates.ngnPerUsd : 1;
}

/** Units of `to` per unit of `from` at the mid-market rate. */
export function midRate(from: ConvertCurrency, to: ConvertCurrency, rates: MidRates): number {
  return usdValue(from, rates) / usdValue(to, rates);
}

/** Works out what a conversion gives, with Faara's fee taken out of the amount received. */
export function priceConversion(
  from: ConvertCurrency,
  to: ConvertCurrency,
  fromMinor: number,
  rates: MidRates,
): { rate: number; toMinor: number; feeMinor: number } {
  const rate = midRate(from, to, rates);
  const gross = Math.floor(fromMinor * rate);
  const bps =
    from === 'NGN' || to === 'NGN' ? CONVERSION_FEE_BPS.withNaira : CONVERSION_FEE_BPS.par;
  const toMinor = Math.floor((gross * (10_000 - bps)) / 10_000);
  return { rate, toMinor, feeMinor: gross - toMinor };
}

/** Thrown for malformed requests; the message is safe to show. */
export class ConvertValidationError extends ValidationError {}

export function parseQuoteRequest(body: unknown): QuoteRequest {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { from, to, amount } = data;
  if (!CONVERT_CURRENCIES.includes(from as ConvertCurrency))
    throw new ConvertValidationError('Choose a currency to convert from.');
  if (!CONVERT_CURRENCIES.includes(to as ConvertCurrency))
    throw new ConvertValidationError('Choose a currency to convert to.');
  if (from === to) throw new ConvertValidationError('Choose two different currencies.');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
    throw new ConvertValidationError('Enter an amount to convert.');
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
    throw new ConvertValidationError('Use at most two decimal places.');
  const currency = from as ConvertCurrency;
  if (amount < MIN_CONVERT[currency] || amount > MAX_CONVERT[currency])
    throw new ConvertValidationError('That amount is outside the allowed range.');
  return { from: currency, to: to as ConvertCurrency, amount };
}

export function parseExecuteRequest(body: unknown): ExecuteRequest {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const id = data.quoteId;
  if (typeof id !== 'string' || !/^QT[A-Za-z0-9_-]{8,40}$/.test(id))
    throw new ConvertValidationError('That quote isn’t valid.');
  return { quoteId: id };
}
