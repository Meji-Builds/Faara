import {
  CATEGORY_LABELS,
  type SupportCategory,
  type SupportTicket,
  type TicketMessage,
  type TicketStatus,
} from '../../shared/support';

import type { AdminService } from './adminService';
import { ApiError } from './errors';
import type { PushMessage } from './push';
import { consumeRate } from './rateLimit';
import type { DocumentStore, StoreTransaction } from './store';

interface TicketDoc extends Omit<SupportTicket, 'id'> {
  uid: string;
}

interface ProfileDoc {
  fullName: string;
  username: string;
}

export interface SupportDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  admin: AdminService;
  notify?: (uid: string, message: PushMessage) => Promise<void>;
}

const ticketPath = (id: string) => `supportTickets/${id}`;
const mirrorPath = (uid: string, id: string) => `users/${uid}/tickets/${id}`;
const messagePath = (id: string, messageId: string) => `supportTickets/${id}/messages/${messageId}`;

function writeTicket(tx: StoreTransaction, id: string, doc: TicketDoc) {
  tx.set(ticketPath(id), doc);
  const { uid: _uid, ...mirror } = doc;
  tx.set(mirrorPath(doc.uid, id), mirror);
}

const view = (id: string, doc: TicketDoc): SupportTicket => {
  const { uid: _uid, ...rest } = doc;
  return { ...rest, id };
};

/**
 * Support tickets. A person opens one about a problem (optionally a specific payment);
 * Faara's team replies in the same thread. Each side is told when the other replies.
 */
export class SupportService {
  constructor(private readonly deps: SupportDeps) {}

  async create(
    uid: string,
    request: { category: SupportCategory; message: string; paymentId: string | null },
  ): Promise<SupportTicket> {
    const { store, now, newId, admin, notify } = this.deps;
    await consumeRate(store, now, uid, 'support');
    const id = `TK${newId()}`;
    const ticket = await store.transaction(async (tx) => {
      const me = await tx.get<ProfileDoc>(`users/${uid}`);
      if (!me) throw new ApiError('failed-precondition', 'Finish creating your account first.');
      const at = now();
      const doc: TicketDoc = {
        uid,
        category: request.category,
        subject: request.message.split('\n')[0]?.slice(0, 80) ?? '',
        status: 'open',
        user: { fullName: me.fullName, username: me.username },
        paymentId: request.paymentId,
        lastMessage: request.message.slice(0, 160),
        lastFrom: 'user',
        createdAt: at,
        updatedAt: at,
      };
      writeTicket(tx, id, doc);
      tx.set(messagePath(id, `M${newId()}`), {
        from: 'user',
        authorName: me.fullName,
        text: request.message,
        at,
      } satisfies Omit<TicketMessage, 'id'>);
      return view(id, doc);
    });
    if (notify) {
      for (const adminUid of await admin.adminUids()) {
        await notify(adminUid, {
          title: `New ticket: ${CATEGORY_LABELS[request.category]}`,
          body: `${ticket.user.fullName}: ${ticket.subject}`,
          data: { ticketId: id },
        }).catch(() => undefined);
      }
    }
    return ticket;
  }

  /** The person's own tickets, newest activity first. */
  async mine(uid: string): Promise<SupportTicket[]> {
    const rows = await this.deps.store.list<Omit<TicketDoc, 'uid'>>(`users/${uid}/tickets`, {
      orderBy: 'updatedAt',
      limit: 50,
    });
    return rows.map(({ id, data }) => ({ ...data, id }));
  }

  /** All tickets for the team: open ones first, then by latest activity. */
  async queue(uid: string): Promise<SupportTicket[]> {
    await this.deps.admin.requireAdmin(uid);
    const rows = await this.deps.store.list<TicketDoc>('supportTickets', {
      orderBy: 'updatedAt',
      limit: 100,
    });
    const rank: Record<TicketStatus, number> = { open: 0, answered: 1, closed: 2 };
    return rows
      .map(({ id, data }) => view(id, data))
      .sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt);
  }

  private async readable(uid: string, id: string): Promise<{ doc: TicketDoc; isAdmin: boolean }> {
    const doc = await this.deps.store.transaction((tx) => tx.get<TicketDoc>(ticketPath(id)));
    if (!doc) throw new ApiError('not-found', 'That ticket wasn’t found.');
    if (doc.uid === uid) return { doc, isAdmin: false };
    if (await this.deps.admin.isAdmin(uid)) return { doc, isAdmin: true };
    throw new ApiError('not-found', 'That ticket wasn’t found.');
  }

  async thread(
    uid: string,
    id: string,
  ): Promise<{ ticket: SupportTicket; messages: TicketMessage[] }> {
    const { doc } = await this.readable(uid, id);
    const rows = await this.deps.store.list<Omit<TicketMessage, 'id'>>(
      `supportTickets/${id}/messages`,
      { orderBy: 'at', limit: 200, oldestFirst: true },
    );
    return {
      ticket: view(id, doc),
      messages: rows.map(({ id: messageId, data }) => ({ ...data, id: messageId })),
    };
  }

  /** A reply from the person (reopens the ticket) or from the team (marks it answered). */
  async reply(uid: string, id: string, text: string): Promise<SupportTicket> {
    const { store, now, newId, admin, notify } = this.deps;
    await consumeRate(store, now, uid, 'support');
    const { isAdmin } = await this.readable(uid, id);
    const updated = await store.transaction(async (tx) => {
      const doc = await tx.get<TicketDoc>(ticketPath(id));
      const me = await tx.get<ProfileDoc>(`users/${uid}`);
      if (!doc) throw new ApiError('not-found', 'That ticket wasn’t found.');
      const at = now();
      const next: TicketDoc = {
        ...doc,
        status: isAdmin ? 'answered' : 'open',
        lastMessage: text.slice(0, 160),
        lastFrom: isAdmin ? 'faara' : 'user',
        updatedAt: at,
      };
      writeTicket(tx, id, next);
      tx.set(messagePath(id, `M${newId()}`), {
        from: isAdmin ? 'faara' : 'user',
        authorName: isAdmin ? 'Faara support' : (me?.fullName ?? ''),
        text,
        at,
      } satisfies Omit<TicketMessage, 'id'>);
      return next;
    });
    if (isAdmin) {
      await admin.record(uid, 'Replied to ticket', updated.uid, updated.subject);
      await notify?.(updated.uid, {
        title: 'Faara support replied',
        body: text.slice(0, 120),
        data: { ticketId: id },
      }).catch(() => undefined);
    }
    return view(id, updated);
  }

  /** The team marks a ticket open, answered or closed. */
  async setStatus(uid: string, id: string, status: TicketStatus): Promise<SupportTicket> {
    const { store, now, admin } = this.deps;
    await admin.requireAdmin(uid);
    const updated = await store.transaction(async (tx) => {
      const doc = await tx.get<TicketDoc>(ticketPath(id));
      if (!doc) throw new ApiError('not-found', 'That ticket wasn’t found.');
      const next: TicketDoc = { ...doc, status, updatedAt: now() };
      writeTicket(tx, id, next);
      return next;
    });
    await admin.record(uid, `Marked ticket ${status}`, updated.uid, updated.subject);
    return view(id, updated);
  }
}
