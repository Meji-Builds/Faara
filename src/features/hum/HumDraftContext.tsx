import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { formatMoney, type Currency } from '@/lib/money';

/**
 * Client-side state for a hum being composed, shared across the
 * Amount → Humming → Pick recipient → Confirm → Success screens.
 */
export interface HumDraft {
  currency: Currency;
  /** Amount as typed on the keypad, e.g. "12500" or "40.5". */
  amountInput: string;
  note: string;
  recipientId: string | null;
}

interface HumDraftContextValue extends HumDraft {
  amount: number;
  /** Amount formatted for display, e.g. "₦12,500" or "$40.50". */
  amountLabel: string;
  setCurrency: (currency: Currency) => void;
  setAmountInput: (amountInput: string) => void;
  setNote: (note: string) => void;
  setRecipientId: (recipientId: string | null) => void;
  reset: () => void;
}

const INITIAL_DRAFT: HumDraft = {
  currency: 'NGN',
  amountInput: '0',
  note: '',
  recipientId: null,
};

const HumDraftContext = createContext<HumDraftContextValue | null>(null);

export function HumDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<HumDraft>(INITIAL_DRAFT);

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
      setRecipientId: (recipientId) => setDraft((d) => ({ ...d, recipientId })),
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
