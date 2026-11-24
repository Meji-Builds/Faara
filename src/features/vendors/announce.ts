import * as Speech from 'expo-speech';

/** How the till reads payments out: not at all, in English, or in Pidgin. */
export type TillVoice = 'off' | 'english' | 'pidgin';

/** What the till says for a payment, e.g. "5,000 naira from Ada". */
export function announcement(amountKobo: number, fromName: string, voice: TillVoice): string {
  const amount = `${Math.round(amountKobo / 100).toLocaleString('en-NG')} naira`;
  const first = fromName.trim().split(/\s+/)[0] || 'a customer';
  return voice === 'pidgin' ? `${first} don pay you ${amount}` : `${amount} from ${first}`;
}

/** Reads a payment out loud. Payments that arrive together are read one after another. */
export function announce(amountKobo: number, fromName: string, voice: TillVoice): void {
  if (voice === 'off') return;
  Speech.speak(announcement(amountKobo, fromName, voice), { language: 'en-NG', rate: 0.95 });
}
