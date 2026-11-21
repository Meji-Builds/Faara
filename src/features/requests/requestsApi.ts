import type { PaymentRequest, RequestListItem } from '@shared/requests';

import { postJson } from '@/lib/api/client';

export type RequestView = PaymentRequest & { canPay: boolean; mine: boolean };

export function createRequest(amountKobo: number, note: string, fromUsername: string | null) {
  return postJson<PaymentRequest>('/api/requests/create', { amountKobo, note, fromUsername });
}

export function getRequest(id: string) {
  return postJson<RequestView>('/api/requests/get', { id }, { retry: true });
}

export function listRequests() {
  return postJson<{ requests: RequestListItem[] }>('/api/requests/list', {}, { retry: true });
}

export function cancelRequest(id: string) {
  return postJson<PaymentRequest>('/api/requests/cancel', { id });
}
