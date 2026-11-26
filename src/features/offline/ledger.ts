import { ed25519 } from '@noble/curves/ed25519';
import { Buffer } from 'buffer';

import {
  OFFLINE_LIMITS,
  checkNote,
  noteMessage,
  type NoteStatus,
  type OfflineRequest,
  type SignedCertificate,
  type SignedIdentity,
  type SignedNote,
} from '@shared/offline';

/**
 * The phone's own record of offline payments: the pocket it can spend, what it has paid
 * and what it has received but not yet settled. Pure functions over plain data, so the
 * rules can be tested without storage or a camera.
 */

export interface LocalPocket {
  signed: SignedCertificate;
  /** Total signed away from this pocket on this phone, in kobo. */
  spentKobo: number;
  nextSequence: number;
  /** When this phone stored it (phone clock), so a sync that started earlier can't drop it. */
  openedAt: number;
}

/** The server's view of the person's pocket, from the last time the phone was online. */
export interface RemotePocket {
  pocketId: string;
  limitKobo: number;
  remainingKobo: number;
  expiresAt: number;
  releasableAt: number;
}

export interface SentPayment {
  note: SignedNote;
  toName: string;
  /**
   * Whether the receiver's phone took it (Bluetooth payments only). Confirmed payments are
   * also settled from this phone, so they land even if the receiver's phone is lost. Others
   * are left to the receiver: this phone can't know they were handed over.
   */
  delivery?: 'confirmed' | 'refused' | 'unknown';
  /** Settlement, for confirmed payments. */
  status?: 'waiting' | NoteStatus;
}

export interface ReceivedPayment {
  note: SignedNote;
  fromName: string | null;
  receivedAt: number;
  status: 'waiting' | NoteStatus;
  reason?: string;
}

export interface OfflineLedger {
  serverPublicKey: string | null;
  /** This person's Faara-signed name card, handed to payers when receiving by Bluetooth. */
  identity: SignedIdentity | null;
  pocket: LocalPocket | null;
  remote: RemotePocket | null;
  sent: SentPayment[];
  received: ReceivedPayment[];
}

export const EMPTY_LEDGER: OfflineLedger = {
  serverPublicKey: null,
  identity: null,
  pocket: null,
  remote: null,
  sent: [],
  received: [],
};

/** Keeps history short on the phone; settled payments also live in Activity. */
const HISTORY_LIMIT = 50;

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** The public key (base64) for a 64-byte wallet secret key. */
export function devicePublicKey(secretKey: Uint8Array): string {
  return toBase64(ed25519.getPublicKey(secretKey.slice(0, 32)));
}

/** Verifies an Ed25519 signature over a UTF-8 message. Never throws. */
export function verifyEd25519(publicKey: string, message: string, signature: string): boolean {
  try {
    return ed25519.verify(
      Buffer.from(signature, 'base64'),
      new TextEncoder().encode(message),
      Buffer.from(publicKey, 'base64'),
    );
  } catch {
    return false;
  }
}

/** What the pocket can still pay on this phone, in kobo. */
export function spendable(pocket: LocalPocket | null, now: number): number {
  if (!pocket) return 0;
  const cert = pocket.signed.certificate;
  if (now > cert.expiresAt) return 0;
  return Math.max(0, cert.limitKobo - pocket.spentKobo);
}

/** Largest single payment possible right now, in kobo. */
export function maxPayment(pocket: LocalPocket | null, now: number): number {
  if (!pocket) return 0;
  return Math.min(spendable(pocket, now), pocket.signed.certificate.maxNoteKobo);
}

/**
 * Signs a payment answering a receiver's request. `secretKey` is the 64-byte wallet key
 * unlocked by the person's PIN or fingerprint; only its first 32 bytes (the seed) are used.
 */
export function payOffline(
  ledger: OfflineLedger,
  input: {
    request: OfflineRequest;
    amountKobo: number;
    fromUid: string;
    secretKey: Uint8Array;
    now: number;
    noteId: string;
  },
): { ledger: OfflineLedger; note: SignedNote } {
  const pocket = ledger.pocket;
  if (!pocket) throw new Error('Fill your offline pocket first.');
  const { request, amountKobo, fromUid, secretKey, now, noteId } = input;
  if (request.uid === fromUid) throw new Error('You can’t pay yourself.');
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new Error('Enter an amount.');
  if (amountKobo > maxPayment(pocket, now)) {
    throw new Error('That’s more than your offline pocket can pay.');
  }
  const seed = secretKey.slice(0, 32);
  if (devicePublicKey(secretKey) !== pocket.signed.certificate.devicePublicKey) {
    throw new Error('This pocket belongs to another phone.');
  }
  const note = {
    noteId,
    pocketId: pocket.signed.certificate.pocketId,
    fromUid,
    toUid: request.uid,
    amountKobo,
    nonce: request.nonce,
    sequence: pocket.nextSequence,
    createdAt: now,
  };
  const signed: SignedNote = {
    note,
    signature: toBase64(ed25519.sign(new TextEncoder().encode(noteMessage(note)), seed)),
    certificate: pocket.signed,
  };
  return {
    note: signed,
    ledger: {
      ...ledger,
      pocket: {
        ...pocket,
        spentKobo: pocket.spentKobo + amountKobo,
        nextSequence: pocket.nextSequence + 1,
      },
      sent: [{ note: signed, toName: request.name }, ...ledger.sent].slice(0, HISTORY_LIMIT),
    },
  };
}

/** Checks a scanned payment fully offline and, if it's good, keeps it to settle later. */
export function receiveOffline(
  ledger: OfflineLedger,
  input: { note: SignedNote; fromName: string | null; request: OfflineRequest; now: number },
): { ledger: OfflineLedger; error: string | null } {
  const { note, fromName, request, now } = input;
  if (!ledger.serverPublicKey) {
    return { ledger, error: 'Open Faara once while online, then you can receive offline.' };
  }
  if (ledger.received.some((r) => r.note.note.noteId === note.note.noteId)) {
    return { ledger, error: null };
  }
  const check = checkNote(note, {
    serverPublicKey: ledger.serverPublicKey,
    verify: verifyEd25519,
    now,
    expect: { toUid: request.uid, nonce: request.nonce },
  });
  if (!check.ok) return { ledger, error: check.reason };
  if (request.amountKobo > 0 && note.note.amountKobo !== request.amountKobo) {
    return { ledger, error: 'The amount doesn’t match what you asked for.' };
  }
  return {
    error: null,
    ledger: {
      ...ledger,
      received: [
        { note, fromName, receivedAt: now, status: 'waiting' as const },
        ...ledger.received,
      ].slice(0, HISTORY_LIMIT),
    },
  };
}

/** Records whether the receiver's phone took a payment sent by Bluetooth. */
export function markDelivery(
  ledger: OfflineLedger,
  noteId: string,
  delivery: NonNullable<SentPayment['delivery']>,
): OfflineLedger {
  return {
    ...ledger,
    sent: ledger.sent.map((s) =>
      s.note.note.noteId === noteId
        ? { ...s, delivery, status: delivery === 'confirmed' ? 'waiting' : s.status }
        : s,
    ),
  };
}

/** Payments this phone should settle: received ones, and sent ones the receiver confirmed. */
export function waitingNotes(ledger: OfflineLedger): SignedNote[] {
  return [
    ...ledger.received.filter((r) => r.status === 'waiting').map((r) => r.note),
    ...ledger.sent
      .filter((s) => s.delivery === 'confirmed' && s.status === 'waiting')
      .map((s) => s.note),
  ];
}

/** Records what the server said about settled payments. */
export function applySettlement(
  ledger: OfflineLedger,
  results: { noteId: string; status: NoteStatus; reason?: string }[],
): OfflineLedger {
  const byId = new Map(results.map((r) => [r.noteId, r]));
  return {
    ...ledger,
    received: ledger.received.map((r) => {
      const result = byId.get(r.note.note.noteId);
      return result ? { ...r, status: result.status, reason: result.reason } : r;
    }),
    sent: ledger.sent.map((s) => {
      const result = byId.get(s.note.note.noteId);
      return result && s.delivery === 'confirmed' ? { ...s, status: result.status } : s;
    }),
  };
}

/** Renew a pocket this long before it would expire, so it never lapses while in use. */
const RENEW_BEFORE_MS = 2 * 24 * 3_600_000;
/** Smaller refills aren't worth a trip to the server. */
const MIN_REFILL_KOBO = 500_00;

/**
 * How much to add so `reserveKobo` is ready to spend offline: null when nothing needs doing,
 * 0 to only renew a pocket that is about to expire. Stays within what a pocket may hold.
 */
export function topUpNeeded(
  ledger: OfflineLedger,
  reserveKobo: number,
  now: number,
): number | null {
  if (reserveKobo <= 0) return null;
  const { pocket, remote } = ledger;
  // A pocket opened on another phone can't be topped up from here; it releases on expiry.
  if (!pocket) return remote ? null : Math.min(reserveKobo, OFFLINE_LIMITS.maxPocketKobo);
  if (!remote || remote.pocketId !== pocket.signed.certificate.pocketId) return null;
  const want = reserveKobo - spendable(pocket, now);
  const room = OFFLINE_LIMITS.maxPocketKobo - remote.remainingKobo;
  const add = Math.max(0, Math.min(want, room));
  if (add >= MIN_REFILL_KOBO) return add;
  return pocket.signed.certificate.expiresAt - now < RENEW_BEFORE_MS ? 0 : null;
}

/** Stores a certificate from a top-up, keeping what this phone has already spent from it. */
export function applyTopUp(
  ledger: OfflineLedger,
  signed: SignedCertificate,
  now: number,
): OfflineLedger {
  const same = ledger.pocket?.signed.certificate.pocketId === signed.certificate.pocketId;
  return {
    ...ledger,
    pocket:
      same && ledger.pocket
        ? { ...ledger.pocket, signed }
        : { signed, spentKobo: 0, nextSequence: 0, openedAt: now },
  };
}

/**
 * Puts back a pocket this phone lost (a reinstall clears the app's storage). Whatever the
 * server hasn't got left counts as already spent, so nothing can be paid out twice.
 */
export function restorePocket(
  ledger: OfflineLedger,
  signed: SignedCertificate,
  remainingKobo: number,
  now: number,
): OfflineLedger {
  if (ledger.pocket) return ledger;
  const limit = signed.certificate.limitKobo;
  return {
    ...ledger,
    pocket: {
      signed,
      spentKobo: Math.min(limit, Math.max(0, limit - remainingKobo)),
      nextSequence: 0,
      openedAt: now,
    },
  };
}
