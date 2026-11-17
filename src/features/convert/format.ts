import type { ConvertCurrency } from '@shared/convert';

import { groupDigits } from '@/lib/money';

/** Display name people recognise. */
export const CURRENCY_NAME: Record<ConvertCurrency, string> = {
  NGN: 'Naira',
  USD: 'Dollars',
  USDC: 'USDC',
};

/** Formats minor units (kobo or cents): ₦150,000 · $99.00 · 49.87 USDC. */
export function formatMinor(minor: number, currency: ConvertCurrency): string {
  const major = minor / 100;
  if (currency === 'NGN') return `₦${groupDigits(String(Math.floor(major)))}`;
  const text = groupDigits(major.toFixed(2));
  return currency === 'USD' ? `$${text}` : `${text} USDC`;
}

/** The rate as people say it: "1 USD = ₦1,500" or "₦1 = $0.00066". */
export function describeRate(rate: number, from: ConvertCurrency, to: ConvertCurrency): string {
  // Always state the rate per one dollar-like unit, so it reads naturally.
  const perUnit = from === 'NGN' ? 1 / rate : rate;
  const dollarSide = from === 'NGN' ? to : from;
  const naira = Math.round(perUnit * 100) / 100;
  return `1 ${dollarSide} = ₦${groupDigits(naira.toFixed(2))}`;
}
