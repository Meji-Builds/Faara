import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '../../shared/hum';
import {
  OFFLINE_LIMITS,
  certificateMessage,
  checkNote,
  identityMessage,
  type NoteResult,
  type PocketCertificate,
  type SignedCertificate,
  type SignedIdentity,
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
   * Keeps a pocket topped up: adds `addKobo` to the open pocket on this phone (0 just renews
   * it for another 7 days) and returns a fresh certificate, or opens a pocket if there is none.
   * The certificate's limit is the total ever locked into the pocket, matching how the phone
   * counts what it has spent. What is locked at any moment stays within the pocket limit.
   */
  async topUpPocket(
    uid: string,
    request: { addKobo: number; devicePublicKey: string },
  ): Promise<SignedCertificate> {
    const { store, now } = this.deps;
    const signer = await this.requireSigner();
    const current = await store.transaction(async (tx) => {
      const active = await tx.get<{ pocketId: string }>(activePocketPath(uid));
      return active ? tx.get<PocketDoc>(pocketPath(active.pocketId)) : undefined;
    });
    if (!current || current.status !== 'open') {
      if (request.addKobo < 100_00) {
        throw new ApiError('failed-precondition', 'Choose at least ₦100 for your offline pocket.');
      }
      return this.openPocket(uid, {
        amountKobo: request.addKobo,
        devicePublicKey: request.devicePublicKey,
      });
    }
    await consumeRate(store, now, uid, 'offline');
    const certificate = await store.transaction(async (tx): Promise<PocketCertificate> => {
      const pocket = await tx.get<PocketDoc>(pocketPath(current.pocketId));
      if (!pocket || pocket.status !== 'open') {
        throw new ApiError('failed-precondition', 'Your offline pocket changed. Try again.');
      }
      if (pocket.devicePublicKey !== request.devicePublicKey) {
        throw new ApiError(
          'failed-precondition',
          'Your offline pocket is on another phone. It comes back to your balance when it expires.',
        );
      }
      if (pocket.remainingKobo + request.addKobo > OFFLINE_LIMITS.maxPocketKobo) {
        throw new ApiError('failed-precondition', 'That’s more than an offline pocket can hold.');
      }
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const balance = account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
      if (balance < request.addKobo) {
        throw new ApiError('failed-precondition', 'You don’t have enough naira for this.');
      }
      const issuedAt = now();
      const limitKobo = pocket.limitKobo + request.addKobo;
      const next: PocketCertificate = {
        pocketId: pocket.pocketId,
        uid,
        devicePublicKey: pocket.devicePublicKey,
        limitKobo,
        maxNoteKobo: Math.min(OFFLINE_LIMITS.maxNoteKobo, limitKobo),
        issuedAt,
        expiresAt: issuedAt + OFFLINE_LIMITS.pocketTtlMs,
      };
      if (request.addKobo > 0) {
        tx.set(accountPath(uid), {
          ...account,
          balanceKobo: balance - request.addKobo,
          updatedAt: issuedAt,
        } satisfies AccountDoc);
      }
      tx.set(pocketPath(pocket.pocketId), {
        ...next,
        remainingKobo: pocket.remainingKobo + request.addKobo,
        status: 'open',
      } satisfies PocketDoc);
      return next;
    });
    return { certificate, signature: signer.sign(certificateMessage(certificate)) };
  }

  /** A Faara-signed card with the person's name, for receiving offline. */
  async identity(uid: string): Promise<SignedIdentity> {
    const { store, now } = this.deps;
    const signer = await this.requireSigner();
    const { profile, vendor } = await store.transaction(async (tx) => ({
      profile: await tx.get<ProfileDoc>(`users/${uid}`),
      vendor: await tx.get<{ businessName: string }>(`vendors/${uid}`),
    }));
    if (!profile?.fullName) {
      throw new ApiError('failed-precondition', 'Finish setting up your profile first.');
    }
    const issuedAt = now();
    const card = {
      uid,
      name: profile.fullName.slice(0, 80),
      shop: (vendor?.businessName ?? '').slice(0, 80),
      issuedAt,
      expiresAt: issuedAt + OFFLINE_LIMITS.identityTtlMs,
    };
    return { card, signature: signer.sign(identityMessage(card)) };
  }

  /**
   * Settles notes this person received or sent. Each note is applied once, from the sender's locked
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
    // Either phone can bring a payment in; the money always goes to the person it names.
    if (note.toUid !== uid && note.fromUid !== uid) {
      throw new ApiError('permission-denied', 'This payment is for someone else.');
    }
    const receiverUid = note.toUid;
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
      const receiver = await tx.get<AccountDoc>(accountPath(receiverUid));
      const senderProfile = await tx.get<ProfileDoc>(`users/${note.fromUid}`);
      const receiverProfile = await tx.get<ProfileDoc>(`users/${receiverUid}`);
      const time = now();
      tx.update(pocketPath(note.pocketId), {
        remainingKobo: pocket.remainingKobo - note.amountKobo,
      });
      tx.set(accountPath(receiverUid), {
        ...receiver,
        balanceKobo: (receiver?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO) + note.amountKobo,
        updatedAt: time,
      } satisfies AccountDoc);
      tx.set(notePath(note.noteId), {
        pocketId: note.pocketId,
        fromUid: note.fromUid,
        toUid: receiverUid,
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
      tx.set(activityPath(receiverUid, note.noteId), entry('in', senderProfile));
      tx.set(activityPath(note.fromUid, note.noteId), entry('out', receiverProfile));
      return { noteId: note.noteId, status: 'settled' };
    });
    return settled;
  }

  /**
   * Gives a phone back the certificate of the person's open pocket, after it lost its copy
   * (a reinstall clears the app's storage). Only the phone holding the pocket's key can
   * reclaim it, so a pocket opened on another phone stays there. Returns how much is left,
   * so the phone treats everything else as already spent.
   */
  async reclaim(
    uid: string,
    devicePublicKey: string,
  ): Promise<{ certificate: SignedCertificate; remainingKobo: number }> {
    const signer = await this.requireSigner();
    const pocket = await this.deps.store.transaction(async (tx) => {
      const active = await tx.get<{ pocketId: string }>(activePocketPath(uid));
      return active ? tx.get<PocketDoc>(pocketPath(active.pocketId)) : undefined;
    });
    if (!pocket || pocket.status !== 'open') {
      throw new ApiError('not-found', 'You have no offline pocket to restore.');
    }
    if (pocket.devicePublicKey !== devicePublicKey) {
      throw new ApiError('failed-precondition', 'Your offline pocket is on another phone.');
    }
    const certificate: PocketCertificate = {
      pocketId: pocket.pocketId,
      uid: pocket.uid,
      devicePublicKey: pocket.devicePublicKey,
      limitKobo: pocket.limitKobo,
      maxNoteKobo: pocket.maxNoteKobo,
      issuedAt: pocket.issuedAt,
      expiresAt: pocket.expiresAt,
    };
    return {
      certificate: { certificate, signature: signer.sign(certificateMessage(certificate)) },
      remainingKobo: pocket.remainingKobo,
    };
  }

  /** How much the person chose to keep ready offline, in kobo (null if never chosen). */
  async reserve(uid: string): Promise<number | null> {
    const saved = await this.deps.store.transaction((tx) =>
      tx.get<{ reserveKobo: number }>(`offlineReserves/${uid}`),
    );
    return saved?.reserveKobo ?? null;
  }

  /** Saves how much to keep ready offline, so a reinstall or a new phone keeps the choice. */
  async setReserve(uid: string, reserveKobo: number): Promise<void> {
    const { store, now } = this.deps;
    await store.transaction(async (tx) => {
      tx.set(`offlineReserves/${uid}`, { reserveKobo, updatedAt: now() });
    });
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
