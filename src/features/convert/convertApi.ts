import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { type Balances, type ConvertCurrency, type Quote } from '@shared/convert';
import { MOCK_STARTING_BALANCE_KOBO } from '@shared/hum';

import { postJson } from '@/lib/api/client';
import { db } from '@/lib/firebase';

export function getQuote(from: ConvertCurrency, to: ConvertCurrency, amount: number) {
  return postJson<Quote>('/api/convert/quote', { from, to, amount }, { retry: true });
}

export interface ConversionResult {
  id: string;
  status: 'pending' | 'done' | 'failed';
  balances: Balances;
}

/** Runs a quote. Selling USDC passes `signature`: the phone's payment into Faara's float. */
export function executeQuote(quoteId: string, signature?: string) {
  return postJson<ConversionResult>(
    '/api/convert/execute',
    signature ? { quoteId, signature } : { quoteId },
    { retry: true },
  );
}

/** Checks a started conversion; finishes it once the USDC transfer has confirmed. */
export function conversionStatus(quoteId: string) {
  return postJson<ConversionResult>('/api/convert/status', { quoteId }, { retry: true });
}

/** Live balances in naira, dollars and USDC (minor units), from the ledger. */
export function watchBalances(uid: string, onChange: (balances: Balances) => void): Unsubscribe {
  const fallback: Balances = { NGN: MOCK_STARTING_BALANCE_KOBO, USD: 0, USDC: 0 };
  return onSnapshot(
    doc(db, 'ledgerAccounts', uid),
    (snapshot) => {
      const data = snapshot.data();
      onChange({
        NGN: Number(data?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO),
        USD: Number(data?.balanceUsdCents ?? 0),
        USDC: Number(data?.balanceUsdcCents ?? 0),
      });
    },
    () => onChange(fallback),
  );
}
