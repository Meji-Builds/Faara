import type { ActivityEntry } from '../hum';
import type { SupportTicket } from '../support';
import type { ApplicationStatus, VendorProfile } from '../vendors';
import { ValidationError } from '../hum/validation';

/** What Faara's team sees in the admin area. */

export interface AdminLogEntry {
  id: string;
  admin: string;
  action: string;
  /** Username of the person it was about, if any. */
  target: string | null;
  detail: string;
  at: number;
}

export interface AdminOverview {
  users: number;
  paymentsToday: { count: number; nairaKobo: number };
  openTickets: number;
  pendingVendors: number;
  vendors: number;
  pausedAccounts: number;
  openPockets: number;
  recentLog: AdminLogEntry[];
}

export interface AdminUserSummary {
  uid: string;
  fullName: string;
  username: string;
  phone: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  createdAt: number | null;
  verificationTier: number;
  nairaKobo: number;
  usdcAddress: string | null;
  vendor: VendorProfile | null;
  vendorApplication: ApplicationStatus | null;
  paused: { reason: string; at: number; by: string } | null;
  pocket: { limitKobo: number; remainingKobo: number; expiresAt: number } | null;
  activity: ActivityEntry[];
  tickets: SupportTicket[];
}

export interface AdminPayment {
  paymentId: string;
  kind: 'hum' | 'transfer';
  channel: string;
  amountMinor: number;
  currency: 'NGN' | 'USDC';
  note: string;
  settledAt: number;
  from: { fullName: string; username: string };
  to: { fullName: string; username: string } | null;
}

/** Thrown for malformed requests; the message is safe to show. */
export class AdminValidationError extends ValidationError {}

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

export function parseUserSearch(body: unknown): { query: string } {
  const query = record(body).query;
  return { query: typeof query === 'string' ? query.trim().slice(0, 64) : '' };
}

export function parseUserRef(body: unknown): { uid: string } {
  const uid = record(body).uid;
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
    throw new AdminValidationError('That user isn’t valid.');
  }
  return { uid };
}

export function parsePause(body: unknown): { uid: string; paused: boolean; reason: string } {
  const data = record(body);
  const { uid } = parseUserRef(body);
  if (typeof data.paused !== 'boolean') throw new AdminValidationError('Pause or unpause.');
  const reason = typeof data.reason === 'string' ? data.reason.trim().slice(0, 300) : '';
  if (data.paused && reason.length < 5) {
    throw new AdminValidationError('Say why the account is being paused.');
  }
  return { uid, paused: data.paused, reason };
}
