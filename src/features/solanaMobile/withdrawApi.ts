import { postJson } from '@/lib/api/client';

export function withdrawUsdc(address: string, amountCents: number, requestId: string) {
  return postJson<{ transferId: string }>(
    '/api/wallet/withdraw',
    { address, amountCents, requestId },
    { retry: true },
  );
}

export function withdrawalState(requestId: string) {
  return postJson<{ state: 'pending' | 'done' | 'failed'; reason?: string }>(
    '/api/wallet/withdrawal',
    { requestId },
    { retry: true },
  );
}
