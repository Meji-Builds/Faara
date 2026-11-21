import {
  REQUEST_LIMITS,
  type PaymentRequest,
  type PersonRef,
  type RequestListItem,
} from '../../shared/requests';

import { ApiError } from './errors';
import type { PushMessage } from './push';
import { consumeRate } from './rateLimit';
import type { DocumentStore, StoreTransaction } from './store';

/** A payment request as stored, with the user ids the public view leaves out. */
export interface RequestDoc extends Omit<PaymentRequest, 'id'> {
  requesterUid: string;
  fromUid: string | null;
  paidByUid: string | null;
}

/** Each person's copy, so their list is one read. */
interface MirrorDoc extends Omit<RequestListItem, 'id'> {
  updatedAt: number;
}

interface ProfileDoc {
  fullName: string;
  username: string;
}

export const requestPath = (id: string) => `paymentRequests/${id}`;
const mirrorPath = (uid: string, id: string) => `users/${uid}/requests/${id}`;

/** The view everyone sees: no user ids, and "expired" once the time has passed. */
export function publicRequest(id: string, doc: RequestDoc, now: number): PaymentRequest {
  return {
    id,
    requester: doc.requester,
    from: doc.from,
    amountKobo: doc.amountKobo,
    note: doc.note,
    status: doc.status === 'open' && now > doc.expiresAt ? 'expired' : doc.status,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    paidAt: doc.paidAt,
    paidBy: doc.paidBy,
    paymentId: doc.paymentId,
  };
}

/**
 * Writes the request and every person's copy of it in the same transaction, so lists never
 * disagree with the request itself.
 */
export function writeRequest(tx: StoreTransaction, id: string, doc: RequestDoc, now: number) {
  tx.set(requestPath(id), doc);
  const view = publicRequest(id, doc, now);
  const { id: _id, ...rest } = view;
  tx.set(mirrorPath(doc.requesterUid, id), {
    ...rest,
    role: 'sent',
    updatedAt: now,
  } satisfies MirrorDoc);
  const payer = doc.paidByUid ?? doc.fromUid;
  if (payer) {
    tx.set(mirrorPath(payer, id), { ...rest, role: 'toPay', updatedAt: now } satisfies MirrorDoc);
  }
}

export interface RequestDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  notify?: (uid: string, message: PushMessage) => Promise<void>;
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

/**
 * Payment requests. Creating, viewing, listing and cancelling live here; paying one goes
 * through the normal payment flow (a transfer carrying the request id), which marks it paid
 * when it settles.
 */
export class RequestService {
  constructor(private readonly deps: RequestDeps) {}

  async create(
    uid: string,
    request: { amountKobo: number; note: string; fromUsername: string | null },
  ): Promise<PaymentRequest> {
    const { store, now, newId, notify } = this.deps;
    await consumeRate(store, now, uid, 'createHum');
    const id = `RQ${newId()}`;
    const result = await store.transaction(async (tx) => {
      const me = await tx.get<ProfileDoc>(`users/${uid}`);
      if (!me) throw new ApiError('failed-precondition', 'Finish creating your account first.');
      let from: { uid: string; person: PersonRef } | null = null;
      if (request.fromUsername) {
        const reservation = await tx.get<{ uid: string }>(`usernames/${request.fromUsername}`);
        const profile = reservation ? await tx.get<ProfileDoc>(`users/${reservation.uid}`) : null;
        if (!reservation || !profile) {
          throw new ApiError('not-found', `Nobody on Faara is called @${request.fromUsername}.`);
        }
        if (reservation.uid === uid) {
          throw new ApiError('invalid-argument', 'You can’t request money from yourself.');
        }
        from = {
          uid: reservation.uid,
          person: { fullName: profile.fullName, username: profile.username },
        };
      }
      const createdAt = now();
      const doc: RequestDoc = {
        requesterUid: uid,
        requester: { fullName: me.fullName, username: me.username },
        fromUid: from?.uid ?? null,
        from: from?.person ?? null,
        amountKobo: request.amountKobo,
        note: request.note,
        status: 'open',
        createdAt,
        expiresAt: createdAt + REQUEST_LIMITS.ttlMs,
        paidAt: null,
        paidBy: null,
        paidByUid: null,
        paymentId: null,
      };
      writeRequest(tx, id, doc, createdAt);
      return { view: publicRequest(id, doc, createdAt), from, me };
    });
    if (result.from && notify) {
      await notify(result.from.uid, {
        title: `${result.me.fullName} requested ${naira(request.amountKobo)}`,
        body: request.note,
        data: { requestId: id },
      }).catch(() => undefined);
    }
    return result.view;
  }

  /** A request, for its requester, the person asked, or (if open to anyone) anyone signed in. */
  async get(uid: string, id: string): Promise<PaymentRequest & { canPay: boolean; mine: boolean }> {
    const { store, now } = this.deps;
    const doc = await store.transaction((tx) => tx.get<RequestDoc>(requestPath(id)));
    const allowed =
      doc &&
      (doc.requesterUid === uid ||
        doc.fromUid === uid ||
        doc.paidByUid === uid ||
        doc.fromUid === null);
    if (!doc || !allowed) throw new ApiError('not-found', 'That request wasn’t found.');
    const view = publicRequest(id, doc, now());
    const mine = doc.requesterUid === uid;
    return { ...view, mine, canPay: !mine && view.status === 'open' };
  }

  /** The person's requests, newest first: ones they sent and ones they're asked to pay. */
  async list(uid: string): Promise<RequestListItem[]> {
    const { store, now } = this.deps;
    const rows = await store.list<MirrorDoc>(`users/${uid}/requests`, {
      orderBy: 'createdAt',
      limit: 50,
    });
    const time = now();
    return rows.map(({ id, data }) => {
      const { updatedAt: _updatedAt, ...item } = data;
      return {
        ...item,
        id,
        status: item.status === 'open' && time > item.expiresAt ? 'expired' : item.status,
      };
    });
  }

  /** The requester withdraws an open request. */
  async cancel(uid: string, id: string): Promise<PaymentRequest> {
    const { store, now } = this.deps;
    return store.transaction(async (tx) => {
      const doc = await tx.get<RequestDoc>(requestPath(id));
      if (!doc || doc.requesterUid !== uid) {
        throw new ApiError('not-found', 'That request wasn’t found.');
      }
      if (doc.status !== 'open') {
        throw new ApiError('failed-precondition', 'Only an unpaid request can be cancelled.');
      }
      const next: RequestDoc = { ...doc, status: 'cancelled' };
      writeRequest(tx, id, next, now());
      return publicRequest(id, next, now());
    });
  }
}
