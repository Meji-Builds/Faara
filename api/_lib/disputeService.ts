import {
  DISPUTE_REASON_LABELS,
  DISPUTE_WINDOW_MS,
  SECOND_APPROVAL_KOBO,
  type Dispute,
  type DisputeReason,
} from '../../shared/disputes';
import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '../../shared/hum';

import type { AdminService } from './adminService';
import { ApiError } from './errors';
import type { PushMessage } from './push';
import { consumeRate } from './rateLimit';
import type { DocumentStore } from './store';
import type { SupportService } from './supportService';

interface DisputeDoc extends Dispute {
  payerUid: string;
  payeeUid: string;
}

interface AccountDoc {
  balanceKobo: number;
  /** Naira held while disputes are open; not spendable. */
  heldKobo?: number;
  updatedAt: number;
}

interface ProfileDoc {
  fullName: string;
  username: string;
}

export interface DisputeDeps {
  store: DocumentStore;
  now: () => number;
  admin: AdminService;
  support: SupportService;
  notify?: (uid: string, message: PushMessage) => Promise<void>;
}

const disputePath = (paymentId: string) => `disputes/${paymentId}`;
const accountPath = (uid: string) => `ledgerAccounts/${uid}`;
const activityPath = (uid: string, id: string) => `users/${uid}/activity/${id}`;

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

function view(doc: DisputeDoc): Dispute {
  const { payerUid: _payer, payeeUid: _payee, ...dispute } = doc;
  return dispute;
}

/**
 * Disputes about payments. The payer opens one; naira is held in the recipient's account so
 * it can't be spent while Faara's team looks into it; an admin then refunds the payer or
 * releases the hold. Large refunds need a second admin. Every decision is logged and both
 * people are told.
 */
export class DisputeService {
  constructor(private readonly deps: DisputeDeps) {}

  /** Opens a dispute about a payment the caller made. */
  async open(
    uid: string,
    request: { paymentId: string; reason: DisputeReason; details: string },
  ): Promise<Dispute> {
    const { store, now, notify, admin, support } = this.deps;
    await consumeRate(store, now, uid, 'support');
    const { paymentId } = request;

    const opened = await store.transaction(async (tx): Promise<DisputeDoc> => {
      if (await tx.get(disputePath(paymentId))) {
        throw new ApiError('failed-precondition', 'This payment already has a dispute.');
      }
      const entry = await tx.get<ActivityEntry>(activityPath(uid, paymentId));
      if (
        !entry ||
        entry.direction !== 'out' ||
        entry.kind === 'deposit' ||
        entry.kind === 'refund'
      ) {
        throw new ApiError('not-found', 'You can only dispute a payment you made.');
      }
      if (now() - entry.createdAt > DISPUTE_WINDOW_MS) {
        throw new ApiError(
          'failed-precondition',
          'Payments can be disputed for 30 days. Contact support about older ones.',
        );
      }
      const payeeRef = await tx.get<{ uid: string }>(`usernames/${entry.counterpartyUsername}`);
      if (!payeeRef) throw new ApiError('not-found', 'The person you paid wasn’t found.');
      const payer = await tx.get<ProfileDoc>(`users/${uid}`);
      const payee = await tx.get<ProfileDoc>(`users/${payeeRef.uid}`);

      // Hold what the recipient still has of it, so it can't be spent while it's looked at.
      let heldKobo = 0;
      if (entry.currency === 'NGN') {
        const account = await tx.get<AccountDoc>(accountPath(payeeRef.uid));
        const balance = account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
        heldKobo = Math.max(0, Math.min(entry.amountMinor, balance));
        tx.set(accountPath(payeeRef.uid), {
          ...account,
          balanceKobo: balance - heldKobo,
          heldKobo: (account?.heldKobo ?? 0) + heldKobo,
          updatedAt: now(),
        } satisfies AccountDoc);
      }
      const at = now();
      const doc: DisputeDoc = {
        paymentId,
        payerUid: uid,
        payeeUid: payeeRef.uid,
        payer: { fullName: payer?.fullName ?? '', username: payer?.username ?? '' },
        payee: {
          fullName: payee?.fullName ?? entry.counterpartyName,
          username: entry.counterpartyUsername,
        },
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        reason: request.reason,
        details: request.details,
        status: 'open',
        heldKobo,
        ticketId: null,
        approvals: [],
        createdAt: at,
        updatedAt: at,
        decision: null,
      };
      tx.set(disputePath(paymentId), doc);
      return doc;
    });

    // The conversation with the payer happens in a support thread linked to the payment.
    const amount =
      opened.currency === 'NGN'
        ? naira(opened.amountMinor)
        : `${(opened.amountMinor / 100).toFixed(2)} USDC`;
    const ticket = await support.create(uid, {
      category: request.reason === 'fraud' ? 'fraud' : 'payment',
      message: `Dispute: ${amount} to @${opened.payee.username}. ${DISPUTE_REASON_LABELS[request.reason]}.\n\n${request.details}`,
      paymentId,
    });
    await store.transaction(async (tx) => {
      tx.update(disputePath(paymentId), { ticketId: ticket.id });
    });
    opened.ticketId = ticket.id;

    if (notify) {
      const held =
        opened.heldKobo > 0 ? ` ${naira(opened.heldKobo)} is on hold until it’s sorted.` : '';
      await notify(opened.payeeUid, {
        title: 'A payment to you is being looked into',
        body: `${opened.payer.fullName} raised a problem with a payment of ${amount}.${held}`,
        data: { disputeId: paymentId },
      }).catch(() => undefined);
      for (const adminUid of await admin.adminUids()) {
        await notify(adminUid, {
          title: 'New payment dispute',
          body: `${amount} from @${opened.payer.username} to @${opened.payee.username}`,
          data: { disputeId: paymentId },
        }).catch(() => undefined);
      }
    }
    return view(opened);
  }

  /** A dispute, for the payer, the recipient or an admin. */
  async get(uid: string, paymentId: string): Promise<Dispute | null> {
    const doc = await this.deps.store.transaction((tx) =>
      tx.get<DisputeDoc>(disputePath(paymentId)),
    );
    if (!doc) return null;
    if (doc.payerUid !== uid && doc.payeeUid !== uid && !(await this.deps.admin.isAdmin(uid))) {
      return null;
    }
    return view(doc);
  }

  /** Disputes for Faara's team, newest first. */
  async list(adminUid: string): Promise<Dispute[]> {
    await this.deps.admin.requireAdmin(adminUid);
    const rows = await this.deps.store.list<DisputeDoc>('disputes', {
      orderBy: 'createdAt',
      limit: 100,
    });
    return rows.map(({ data }) => view(data));
  }

  /**
   * An admin decides a dispute. Rejecting releases the hold. Refunding returns the naira to
   * the payer, from the hold first and then the recipient's balance; refunds of ₦50,000 or
   * more need two different admins. Dollar payments can't be refunded by Faara.
   */
  async decide(
    adminUid: string,
    request: { paymentId: string; action: 'refund' | 'reject'; note: string },
  ): Promise<Dispute> {
    const { store, now, admin, notify } = this.deps;
    await admin.requireAdmin(adminUid);
    const { paymentId, action, note } = request;

    const result = await store.transaction(async (tx) => {
      const doc = await tx.get<DisputeDoc>(disputePath(paymentId));
      if (!doc) throw new ApiError('not-found', 'That dispute wasn’t found.');
      if (doc.status !== 'open')
        throw new ApiError('failed-precondition', 'This dispute is already decided.');
      if (adminUid === doc.payerUid || adminUid === doc.payeeUid) {
        throw new ApiError(
          'permission-denied',
          'Another admin has to decide a dispute you’re part of.',
        );
      }
      const at = now();
      const payee = await tx.get<AccountDoc>(accountPath(doc.payeeUid));
      const payeeBalance = payee?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
      const payeeHeld = payee?.heldKobo ?? 0;

      if (action === 'reject') {
        if (doc.heldKobo > 0) {
          tx.set(accountPath(doc.payeeUid), {
            ...payee,
            balanceKobo: payeeBalance + doc.heldKobo,
            heldKobo: Math.max(0, payeeHeld - doc.heldKobo),
            updatedAt: at,
          } satisfies AccountDoc);
        }
        const decided: DisputeDoc = {
          ...doc,
          status: 'rejected',
          heldKobo: 0,
          updatedAt: at,
          decision: { by: adminUid, note, refundedKobo: 0, at },
        };
        tx.set(disputePath(paymentId), decided);
        return { doc: decided, waiting: false };
      }

      if (doc.currency !== 'NGN') {
        throw new ApiError(
          'failed-precondition',
          'Dollar payments live in people’s own wallets, so Faara can’t refund them. Ask the recipient to send it back, then close the dispute.',
        );
      }
      const approvals = [...new Set([...doc.approvals, adminUid])];
      if (doc.amountMinor >= SECOND_APPROVAL_KOBO && approvals.length < 2) {
        const waiting: DisputeDoc = { ...doc, approvals, updatedAt: at };
        tx.set(disputePath(paymentId), waiting);
        return { doc: waiting, waiting: true };
      }

      // The hold first, then whatever the recipient still has, up to the amount paid.
      const fromBalance = Math.min(payeeBalance, doc.amountMinor - doc.heldKobo);
      const refundedKobo = doc.heldKobo + Math.max(0, fromBalance);
      tx.set(accountPath(doc.payeeUid), {
        ...payee,
        balanceKobo: payeeBalance - Math.max(0, fromBalance),
        heldKobo: Math.max(0, payeeHeld - doc.heldKobo),
        updatedAt: at,
      } satisfies AccountDoc);
      const payer = await tx.get<AccountDoc>(accountPath(doc.payerUid));
      tx.set(accountPath(doc.payerUid), {
        ...payer,
        balanceKobo: (payer?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO) + refundedKobo,
        updatedAt: at,
      } satisfies AccountDoc);
      tx.set(`ledgerEntries/refund-${paymentId}`, {
        fromUid: doc.payeeUid,
        toUid: doc.payerUid,
        amountKobo: refundedKobo,
        createdAt: at,
      });
      const entry = (direction: 'in' | 'out', who: DisputeParty): ActivityEntry => ({
        direction,
        kind: 'refund',
        paymentId: `RF${paymentId}`,
        counterpartyName: who.fullName,
        counterpartyUsername: who.username,
        amountMinor: refundedKobo,
        currency: 'NGN',
        note: 'Refund after a dispute',
        createdAt: at,
        signature: null,
      });
      tx.set(activityPath(doc.payerUid, `RF${paymentId}`), entry('in', doc.payee));
      tx.set(activityPath(doc.payeeUid, `RF${paymentId}`), entry('out', doc.payer));
      const decided: DisputeDoc = {
        ...doc,
        status: 'refunded',
        heldKobo: 0,
        approvals,
        updatedAt: at,
        decision: { by: adminUid, note, refundedKobo, at },
      };
      tx.set(disputePath(paymentId), decided);
      return { doc: decided, waiting: false };
    });

    const { doc, waiting } = result;
    await admin.record(
      adminUid,
      waiting
        ? 'Approved a refund (needs a second admin)'
        : action === 'refund'
          ? 'Refunded a disputed payment'
          : 'Rejected a dispute',
      doc.payerUid,
      `${paymentId}: ${note}`,
    );
    if (notify && !waiting) {
      const refunded = doc.decision?.refundedKobo ?? 0;
      await notify(doc.payerUid, {
        title: action === 'refund' ? `${naira(refunded)} refunded` : 'Your dispute was decided',
        body: action === 'refund' ? 'It’s back in your balance.' : note,
        data: { disputeId: paymentId },
      }).catch(() => undefined);
      await notify(doc.payeeUid, {
        title:
          action === 'refund'
            ? 'A disputed payment was refunded'
            : 'The hold on your money is lifted',
        body: action === 'refund' ? `${naira(refunded)} went back to ${doc.payer.fullName}.` : note,
        data: { disputeId: paymentId },
      }).catch(() => undefined);
    }
    return view(doc);
  }
}

type DisputeParty = Dispute['payer'];
