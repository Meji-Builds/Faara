import type { SupportCategory, SupportTicket, TicketMessage, TicketStatus } from '@shared/support';

import { postJson } from '@/lib/api/client';

export function openTicket(category: SupportCategory, message: string, paymentId: string | null) {
  return postJson<SupportTicket>('/api/users/ticket', { category, message, paymentId });
}

export function myTickets() {
  return postJson<{ tickets: SupportTicket[] }>('/api/users/tickets', {}, { retry: true });
}

export function getThread(ticketId: string) {
  return postJson<{ ticket: SupportTicket; messages: TicketMessage[] }>(
    '/api/users/thread',
    { ticketId },
    { retry: true },
  );
}

export function replyToTicket(ticketId: string, text: string) {
  return postJson<SupportTicket>('/api/users/reply', { ticketId, text });
}

/** Faara's team only. */
export function setTicketStatus(ticketId: string, status: TicketStatus) {
  return postJson<SupportTicket>('/api/admin/ticket-status', { ticketId, status });
}
