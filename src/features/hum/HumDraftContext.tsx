import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CreateHumResponse, ShapeTriple } from '@shared/hum';

import { formatMoney, type Currency } from '@/lib/money';

import { watchClaims, type HumClaim } from './humApi';

/**
 * Client state for one outgoing hum, shared across
 * Amount → Humming → Pick recipient → Confirm → Success.
 */
export interface HumDraft {
  currency: Currency;
  /** Amount as typed on the keypad, e.g. "12500" or "40.5". */
  amountInput: string;
  note: string;
  /** The issued hum once created on the server. */
  session: CreateHumResponse | null;
  /** Everyone who claimed the hum, closest first (live). */
  claims: HumClaim[];
  /** Set once the sender has chosen a recipient. */
  chosen: {
    claimId: string;
    shapes: ShapeTriple;
    recipient: { fullName: string; username: string; walletAddress: string | null };
  } | null;
  /** Set once the payment is settled. */
  settlement: { settledAt: number; signature: string | null; elapsedMs: number } | null;
}

interface HumDraftContextValue extends HumDraft {
  amount: number;
  /** Amount formatted for display, e.g. "₦12,500" or "$40.50". */
  amountLabel: string;
  setCurrency: (currency: Currency) => void;
  setAmountInput: (amountInput: string) => void;
  setNote: (note: string) => void;
  setSession: (session: CreateHumResponse | null) => void;
  setChosen: (chosen: HumDraft['chosen']) => void;
  setSettlement: (settlement: HumDraft['settlement']) => void;
  reset: () => void;
}

const INITIAL_DRAFT: HumDraft = {
  currency: 'NGN',
  amountInput: '0',
  note: '',
  session: null,
  claims: [],
  chosen: null,
  settlement: null,
};

const HumDraftContext = createContext<HumDraftContextValue | null>(null);

export function HumDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<HumDraft>(INITIAL_DRAFT);
  const paymentId = draft.session?.paymentId;

  // One live claims listener for the whole flow, so every screen sees the same list.
  useEffect(() => {
    if (!paymentId) return;
    return watchClaims(paymentId, (claims) => setDraft((d) => ({ ...d, claims })));
  }, [paymentId]);

  const value = useMemo<HumDraftContextValue>(() => {
    const amount = Number.parseFloat(draft.amountInput) || 0;
    return {
      ...draft,
      amount,
      amountLabel: formatMoney(amount, draft.currency, {
        decimals: draft.currency === 'USDC' ? 2 : undefined,
      }),
      setCurrency: (currency) => setDraft((d) => ({ ...d, currency, amountInput: '0' })),
      setAmountInput: (amountInput) => setDraft((d) => ({ ...d, amountInput })),
      setNote: (note) => setDraft((d) => ({ ...d, note })),
      setSession: (session) =>
        setDraft((d) => ({ ...d, session, claims: [], chosen: null, settlement: null })),
      setChosen: (chosen) => setDraft((d) => ({ ...d, chosen })),
      setSettlement: (settlement) => setDraft((d) => ({ ...d, settlement })),
      reset: () => setDraft(INITIAL_DRAFT),
    };
  }, [draft]);

  return <HumDraftContext.Provider value={value}>{children}</HumDraftContext.Provider>;
}

export function useHumDraft(): HumDraftContextValue {
  const context = useContext(HumDraftContext);
  if (!context) throw new Error('useHumDraft must be used inside <HumDraftProvider>.');
  return context;
}
