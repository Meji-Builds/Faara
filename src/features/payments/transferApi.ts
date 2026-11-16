import type { CreateTransferResponse, HumCurrency, LookupUserResponse } from '@shared/hum';

import { postJson } from '@/lib/api/client';

export function lookupUser(username: string) {
  return postJson<LookupUserResponse>('/api/users/lookup', { username });
}

export function createTransfer(
  username: string,
  amount: number,
  currency: HumCurrency,
  note: string,
) {
  return postJson<CreateTransferResponse>('/api/payments/transfer', {
    username,
    amount,
    currency,
    note,
  });
}
