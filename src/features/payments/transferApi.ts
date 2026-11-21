import type { CreateTransferResponse, HumCurrency, LookupUserResponse } from '@shared/hum';

import { postJson } from '@/lib/api/client';

export function lookupUser(query: { username: string } | { phone: string }) {
  return postJson<LookupUserResponse>('/api/users/lookup', query, { retry: true });
}

export function createTransfer(
  username: string,
  amount: number,
  currency: HumCurrency,
  note: string,
  /** When paying a payment request: the transfer must match it. */
  requestId?: string,
) {
  return postJson<CreateTransferResponse>('/api/payments/transfer', {
    username,
    amount,
    currency,
    note,
    ...(requestId ? { requestId } : {}),
  });
}
