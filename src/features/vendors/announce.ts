import * as Speech from 'expo-speech';

/** How the till reads payments out: not at all, in English, or in Pidgin. */
export type TillVoice = 'off' | 'english' | 'pidgin';

/** Naira in kobo, or USDC in cents. */
export type TillCurrency = 'NGN' | 'USDC';

/** Said for USDC from a wallet outside Faara, where there's no name to read. */
export const OUTSIDE_WALLET = 'a Solana wallet';

/** What the till says for a payment, e.g. "5,000 naira from Ada". */
export function announcement(
  amountMinor: number,
  fromName: string,
  voice: TillVoice,
  currency: TillCurrency = 'NGN',
): string {
  const amount =
    currency === 'USDC'
      ? `${(amountMinor / 100).toFixed(2).replace(/\.00$/, '')} US dollars`
      : `${Math.round(amountMinor / 100).toLocaleString('en-NG')} naira`;
  const first =
    fromName === OUTSIDE_WALLET ? fromName : fromName.trim().split(/\s+/)[0] || 'a customer';
  return voice === 'pidgin' ? `${first} don pay you ${amount}` : `${amount} from ${first}`;
}

/** Reads a payment out loud. Payments that arrive together are read one after another. */
export function announce(
  amountMinor: number,
  fromName: string,
  voice: TillVoice,
  currency: TillCurrency = 'NGN',
): void {
  if (voice === 'off') return;
  Speech.speak(announcement(amountMinor, fromName, voice, currency), {
    language: 'en-NG',
    rate: 0.95,
  });
}
