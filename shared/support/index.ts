import { ValidationError } from '../hum/validation';

/** Support: people tell Faara's team about a problem, and talk it through in a thread. */

export const SUPPORT_CATEGORIES = ['payment', 'account', 'vendor', 'fraud', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  payment: 'A payment went wrong',
  account: 'My account or login',
  vendor: 'Being a vendor',
  fraud: 'Report fraud or a scam',
  other: 'Something else',
};

export type TicketStatus = 'open' | 'answered' | 'closed';

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  /** The first line of the first message. */
  subject: string;
  status: TicketStatus;
  user: { fullName: string; username: string };
  /** The payment it's about, if any. */
  paymentId: string | null;
  lastMessage: string;
  lastFrom: 'user' | 'faara';
  createdAt: number;
  updatedAt: number;
}

export interface TicketMessage {
  id: string;
  from: 'user' | 'faara';
  authorName: string;
  text: string;
  at: number;
}

export const MAX_MESSAGE = 2_000;

/** Thrown for malformed requests; the message is safe to show. */
export class SupportValidationError extends ValidationError {}

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

function message(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 5) throw new SupportValidationError('Tell us a little more.');
  if (text.length > MAX_MESSAGE) {
    throw new SupportValidationError('Keep it under 2,000 characters.');
  }
  return text;
}

export function ticketId(value: unknown): string {
  if (typeof value !== 'string' || !/^TK[A-Za-z0-9_-]{8,40}$/.test(value)) {
    throw new SupportValidationError('That ticket isn’t valid.');
  }
  return value;
}

export function parseNewTicket(body: unknown): {
  category: SupportCategory;
  message: string;
  paymentId: string | null;
} {
  const data = record(body);
  if (!SUPPORT_CATEGORIES.includes(data.category as SupportCategory)) {
    throw new SupportValidationError('Choose what it’s about.');
  }
  const payment = data.paymentId;
  if (payment !== undefined && payment !== null && payment !== '') {
    if (typeof payment !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(payment)) {
      throw new SupportValidationError('That payment reference isn’t valid.');
    }
  }
  return {
    category: data.category as SupportCategory,
    message: message(data.message),
    paymentId: typeof payment === 'string' && payment ? payment : null,
  };
}

export function parseTicketReply(body: unknown): { ticketId: string; text: string } {
  const data = record(body);
  return { ticketId: ticketId(data.ticketId), text: message(data.text) };
}

export function parseTicketRef(body: unknown): { ticketId: string } {
  return { ticketId: ticketId(record(body).ticketId) };
}

export function parseTicketStatus(body: unknown): { ticketId: string; status: TicketStatus } {
  const data = record(body);
  if (data.status !== 'open' && data.status !== 'answered' && data.status !== 'closed') {
    throw new SupportValidationError('Choose a status.');
  }
  return { ticketId: ticketId(data.ticketId), status: data.status };
}
