import type {
  AdminLogEntry,
  AdminOverview,
  AdminPayment,
  AdminUserDetail,
  AdminUserSummary,
} from '@shared/admin';
import type { SupportTicket } from '@shared/support';

import { postJson } from '@/lib/api/client';

export function amIAdmin() {
  return postJson<{ isAdmin: boolean }>('/api/admin/me', {}, { retry: true });
}

export function getOverview() {
  return postJson<AdminOverview>('/api/admin/overview', {}, { retry: true });
}

export function searchUsers(query: string) {
  return postJson<{ users: AdminUserSummary[] }>('/api/admin/users', { query });
}

export function getUser(uid: string) {
  return postJson<AdminUserDetail>('/api/admin/user', { uid }, { retry: true });
}

export function pauseUser(uid: string, paused: boolean, reason: string) {
  return postJson<{ ok: true }>('/api/admin/pause', { uid, paused, reason });
}

export function recentPayments() {
  return postJson<{ payments: AdminPayment[] }>('/api/admin/payments', {}, { retry: true });
}

export function adminLog() {
  return postJson<{ log: AdminLogEntry[] }>('/api/admin/log', {}, { retry: true });
}

export function supportQueue() {
  return postJson<{ tickets: SupportTicket[] }>('/api/admin/tickets', {}, { retry: true });
}

/** The wallet Faara pays Solana network fees from, and its SOL balance in lamports. */
export function getFeeWallet() {
  return postJson<{ address: string; lamports: number }>('/api/admin/feewallet', {});
}
