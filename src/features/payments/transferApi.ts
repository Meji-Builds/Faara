import type { CreateTransferResponse, HumCurrency, LookupUserResponse } from '@shared/hum';

import { DEMO, demoApi } from '@/features/demo/engine';
import { postJson } from '@/lib/api/client';

export function lookupUser(query: { username: string } | { phone: string }) {
  if (DEMO)
    return new Promise<LookupUserResponse>((r, j) =>
      setTimeout(() => {
        try {
          r(demoApi.lookup(query));
        } catch (e) {
          j(e);
        }
      }, 500),
    );
  return postJson<LookupUserResponse>('/api/users/lookup', query);
}

export function createTransfer(
  username: string,
  amount: number,
  currency: HumCurrency,
  note: string,
) {
  if (DEMO) return Promise.resolve(demoApi.createTransfer(username, amount, currency, note));
  return postJson<CreateTransferResponse>('/api/payments/transfer', {
    username,
    amount,
    currency,
    note,
  });
}
