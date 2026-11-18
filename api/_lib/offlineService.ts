import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '../../shared/hum';
import {
  OFFLINE_LIMITS,
  certificateMessage,
  checkNote,
  type NoteResult,
  type PocketCertificate,
  type SignedCertificate,
  type SignedNote,
} from '../../shared/offline';

import { ApiError } from './errors';
import { generateSigner, signerFromPkcs8, verifySignature, type Signer } from './ed25519';
import { consumeRate } from './rateLimit';
import type { DocumentStore } from './store';

export interface OfflineDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  /**
   * Faara's signing key. Without one (the OFFLINE_SIGNING_KEY secret) the service creates a
   * key on first use and keeps it server-side. Move it to a managed key service before launch.
   */
  signer: Signer | null;
  notify?: (
    uid: string,
    message: { title: string; body: string; data: Record<string, string> },
  ) => Promise<void>;
}

interface AccountDoc {
  balanceKobo: number;
  balanceUsdCents?: number;
  balanceUsdcCents?: number;
  updatedAt: number;
}

interface PocketDoc extends PocketCertificate {
  remainingKobo: number;
  status: 'open' | 'released';
}

interface NoteDoc {
  pocketId: string;
  fromUid: string;
  toUid: string;
  amountKobo: number;
  settledAt: number;
}

interface ProfileDoc {
  fullName: string;
  username: string;
}

export interface PocketStatus {
  pocketId: string;
  limitKobo: number;
  remainingKobo: number;
  expiresAt: number;
  /** When the unspent part can be released back to the balance. */
  releasableAt: number;
}

const accountPath = (uid: string) => `ledgerAccounts/${uid}`;
const pocketPath = (id: string) => `pockets/${id}`;
const activePocketPath = (uid: string) => `activePockets/${uid}`;
const notePath = (id: string) => `offlineNotes/${id}`;
const activityPath = (uid: string, id: string) => `users/${uid}/activity/${id}`;

/**
 * The offline pocket. Money is locked into a pocket while online; spend notes signed on the
 * phone settle from it later. A pocket can never pay out more than it holds, so a phone that
 * spends the same pocket twice only ever hurts whoever settles last.
 */
export class OfflineService {
  constructor(private readonly deps: OfflineDeps) {}

  private storedSigner?: Promise<Signer>;

  private requireSigner(): Promise<Signer> {
    if (this.deps.signer) return Promise.resolve(this.deps.signer);
    this.storedSigner ??= this.loadStoredSigner();
    return this.storedSigner;
  }

  /** Faara's public key for pocket certificates, so phones can check payments offline. */
  async publicKey(): Promise<string> {
    return (await this.requireSigner()).publicKey;
  }

  private async loadStoredSigner(): Promise<Signer> {
    return this.deps.store.transaction(async (tx) => {
      const saved = await tx.get<{ pkcs8: string }>('serverKeys/offline');
      if (saved) return signerFromPkcs8(saved.pkcs8);
      const { pkcs8Base64, signer } = generateSigner();
      tx.set('serverKeys/offline', { pkcs8: pkcs8Base64, createdAt: this.deps.now() });
      return signer;
    });
  }

  /** Locks `amountKobo` of naira into a pocket tied to this phone's key; returns the certificate. */
  async openPocket(
    uid: string,
    request: { amountKobo: number; devicePublicKey: string },
  ): Promise<SignedCertificate> {
    const { store, now, newId } = this.deps;
    const signer = await this.requireSigner();
    await consumeRate(store, now, uid, 'offline');
    const pocketId = `PK${newId()}`;
    const issuedAt = now();
    const certificate: PocketCertificate = {
      pocketId,
      uid,
      devicePublicKey: request.devicePublicKey,
      limitKobo: request.amountKobo,
      maxNoteKobo: Math.min(OFFLINE_LIMITS.maxNoteKobo, request.amountKobo),
      issuedAt,
      expiresAt: issuedAt + OFFLINE_LIMITS.pocketTtlMs,
    };
    await store.transaction(async (tx) => {
      const active = await tx.get<{ pocketId: string }>(activePocketPath(uid));
      if (active) {
        const existing = await tx.get<PocketDoc>(pocketPath(active.pocketId));
        if (existing && existing.status === 'open') {
          throw new ApiError(
            'failed-precondition',
            'You already have an offline pocket. Spend it or wait for it to be released.',
          );
        }
      }
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const balance = account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
      if (balance < request.amountKobo) {
        throw new ApiError('failed-precondition', 'You don’t have enough naira for this.');
      }
      tx.set(accountPath(uid), {
        ...account,
        balanceKobo: balance - request.amountKobo,
        updatedAt: now(),
      } satisfies AccountDoc);
      tx.set(pocketPath(pocketId), {
        ...certificate,
        remainingKobo: request.amountKobo,
        status: 'open',
      } satisfies PocketDoc);
      tx.set(activePocketPath(uid), { pocketId });
    });
    return { certificate, signature: signer.sign(certificateMessage(certificate)) };
  }

  /**
   * Settles notes this person received. Each note is applied once, from the sender's locked
   * pocket, and credited to the receiver. Notes that can't be honoured are rejected with a
   * reason; the rest still go through.
   */
  async settleNotes(uid: string, notes: SignedNote[]): Promise<NoteResult[]> {
    const { store, now } = this.deps;
    const signer = await this.requireSigner();
    await consumeRate(store, now, uid, 'offline');
    const results: NoteResult[] = [];
    for (const signed of notes) {
      const noteId = String(signed?.note?.noteId ?? '');
      try {
        results.push(await this.settleOne(uid, signed, signer.publicKey));
      } catch (error) {
        if (error instanceof ApiError) {
          results.push({ noteId, status: 'rejected', reason: error.message });
        } else {
          results.push({ noteId, status: 'rejected', reason: 'This payment couldn’t be read.' });
        }
      }
    }
    return results;
  }

  private async settleOne(uid: string, signed: SignedNote, serverKey: string): Promise<NoteResult> {
    const { store, now } = this.deps;
    const { note } = signed;
    const check = checkNote(signed, {
      serverPublicKey: serverKey,
      verify: verifySignature,
      now: now(),
      expect: undefined,
    });
    if (!check.ok) throw new ApiError('invalid-argument', check.reason);
    if (note.toUid !== uid) {
      throw new ApiError('permission-denied', 'This payment is for someone else.');
    }
    const settled = await store.transaction(async (tx): Promise<NoteResult> => {
      if (await tx.get<NoteDoc>(notePath(note.noteId))) {
        return { noteId: note.noteId, status: 'already-settled' };
      }
      const pocket = await tx.get<PocketDoc>(pocketPath(note.pocketId));
      if (
        !pocket ||
        pocket.uid !== note.fromUid ||
        pocket.devicePublicKey !== signed.certificate.certificate.devicePublicKey
      ) {
        throw new ApiError('not-found', 'That pocket wasn’t found.');
      }
      if (pocket.status !== 'open' || pocket.remainingKobo < note.amountKobo) {
        throw new ApiError(
          'failed-precondition',
          'The sender’s pocket has already been spent. Ask them to pay you again.',
        );
      }
      const receiver = await tx.get<AccountDoc>(accountPath(uid));
      const senderProfile = await tx.get<ProfileDoc>(`users/${note.fromUid}`);
      const receiverProfile = await tx.get<ProfileDoc>(`users/${uid}`);
      const time = now();
      tx.update(pocketPath(note.pocketId), {
        remainingKobo: pocket.remainingKobo - note.amountKobo,
      });
      tx.set(accountPath(uid), {
        ...receiver,
        balanceKobo: (receiver?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO) + note.amountKobo,
        updatedAt: time,
      } satisfies AccountDoc);
      tx.set(notePath(note.noteId), {
        pocketId: note.pocketId,
        fromUid: note.fromUid,
        toUid: uid,
        amountKobo: note.amountKobo,
        settledAt: time,
      } satisfies NoteDoc);
      const entry = (direction: 'in' | 'out', who: ProfileDoc | undefined): ActivityEntry => ({
        direction,
        kind: 'transfer',
        paymentId: note.noteId,
        counterpartyName: who?.fullName ?? 'Faara user',
        counterpartyUsername: who?.username ?? '',
        amountMinor: note.amountKobo,
        currency: 'NGN',
        note: '',
        createdAt: time,
        signature: null,
        channel: 'offline',
      });
      tx.set(activityPath(uid, note.noteId), entry('in', senderProfile));
      tx.set(activityPath(note.fromUid, note.noteId), entry('out', receiverProfile));
      return { noteId: note.noteId, status: 'settled' };
    });
    return settled;
  }

  /** The caller's open pocket, if any. */
  async status(uid: string): Promise<PocketStatus | null> {
    return this.deps.store.transaction(async (tx) => {
      const active = await tx.get<{ pocketId: string }>(activePocketPath(uid));
      if (!active) return null;
      const pocket = await tx.get<PocketDoc>(pocketPath(active.pocketId));
      if (!pocket || pocket.status !== 'open') return null;
      return {
        pocketId: pocket.pocketId,
        limitKobo: pocket.limitKobo,
        remainingKobo: pocket.remainingKobo,
        expiresAt: pocket.expiresAt,
        releasableAt: pocket.expiresAt + OFFLINE_LIMITS.graceMs,
      };
    });
  }

  /**
   * Returns the unspent part of an expired pocket to the balance. Waits out the grace period
   * so that notes made before expiry can still arrive and settle.
   */
  async release(uid: string): Promise<{ releasedKobo: number }> {
    const { store, now } = this.deps;
    await consumeRate(store, now, uid, 'offline');
    return store.transaction(async (tx) => {
      const active = await tx.get<{ pocketId: string }>(activePocketPath(uid));
      const pocket = active ? await tx.get<PocketDoc>(pocketPath(active.pocketId)) : undefined;
      if (!pocket || pocket.status !== 'open') {
        throw new ApiError('not-found', 'You have no offline pocket to release.');
      }
      if (now() < pocket.expiresAt + OFFLINE_LIMITS.graceMs) {
        throw new ApiError(
          'failed-precondition',
          'Your pocket can be released once it has expired and any payments from it have had time to arrive.',
        );
      }
      const account = await tx.get<AccountDoc>(accountPath(uid));
      tx.set(accountPath(uid), {
        ...account,
        balanceKobo: (account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO) + pocket.remainingKobo,
        updatedAt: now(),
      } satisfies AccountDoc);
      tx.update(pocketPath(pocket.pocketId), { remainingKobo: 0, status: 'released' });
      return { releasedKobo: pocket.remainingKobo };
    });
  }
}
