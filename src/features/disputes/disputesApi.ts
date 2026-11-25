import type { Dispute, DisputeReason } from '@shared/disputes';

import { postJson } from '@/lib/api/client';

/** Opens a dispute about a payment the person made. */
export function openDispute(paymentId: string, reason: DisputeReason, details: string) {
  return postJson<Dispute>('/api/users/dispute', { paymentId, reason, details });
}

/** The dispute about a payment, if there is one (for the payer, recipient or an admin). */
export function getDispute(paymentId: string) {
  return postJson<{ dispute: Dispute | null }>(
    '/api/users/disputestatus',
    { paymentId },
    { retry: true },
  );
}

/** All disputes, newest first (admins only). */
export function listDisputes() {
  return postJson<{ disputes: Dispute[] }>('/api/admin/disputes', {}, { retry: true });
}

/** Refunds or rejects a dispute (admins only; large refunds need a second admin). */
export function decideDispute(paymentId: string, action: 'refund' | 'reject', note: string) {
  return postJson<Dispute>('/api/admin/decide', { paymentId, action, note });
}
