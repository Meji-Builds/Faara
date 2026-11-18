import { ValidationError } from '../hum/validation';

/**
 * Offline payments between Faara users ("the offline pocket").
 *
 * While online, a person locks a small amount of naira into a pocket. Faara signs a
 * certificate for it and the phone holds its own signing key. Offline, the phone signs a
 * spend note naming the receiver; the receiver's phone can check both signatures without a
 * network. When either phone is next online the notes are settled from the locked money.
 *
 * The locked money is what keeps this safe: a pocket can never pay out more than it holds.
 */

/** Limits in kobo. Placeholders until legal advice and partners set the real ones. */
export const OFFLINE_LIMITS = {
  /** The most one pocket can hold. */
  maxPocketKobo: 2_000_000, // ₦20,000
  /** The most one payment can carry. */
  maxNoteKobo: 500_000, // ₦5,000
  /** How long a pocket can be spent from. */
  pocketTtlMs: 7 * 24 * 3_600_000,
  /** After expiry, notes can still settle for this long before the leftover is released. */
  graceMs: 2 * 24 * 3_600_000,
} as const;

export interface PocketCertificate {
  pocketId: string;
  /** Who owns the pocket. */
  uid: string;
  /** The phone's public signing key (raw Ed25519, base64). */
  devicePublicKey: string;
  limitKobo: number;
  maxNoteKobo: number;
  issuedAt: number;
  expiresAt: number;
}

/** The certificate and Faara's signature over it (base64). */
export interface SignedCertificate {
  certificate: PocketCertificate;
  signature: string;
}

export interface SpendNote {
  noteId: string;
  pocketId: string;
  fromUid: string;
  toUid: string;
  amountKobo: number;
  /** The receiver's fresh challenge, so a note can't be replayed to someone else. */
  nonce: string;
  /** Position in the pocket's run of notes, for the sender's own bookkeeping. */
  sequence: number;
  createdAt: number;
}

/** What travels from sender to receiver: the note, the sender's signature, and the pocket certificate. */
export interface SignedNote {
  note: SpendNote;
  signature: string;
  certificate: SignedCertificate;
}

export type NoteStatus = 'settled' | 'already-settled' | 'rejected';
export interface NoteResult {
  noteId: string;
  status: NoteStatus;
  /** Why a note was rejected, safe to show. */
  reason?: string;
}

const SAFE = /^[A-Za-z0-9_+/=-]{1,128}$/;

function field(value: string, name: string): string {
  if (!SAFE.test(value)) throw new Error(`Bad ${name}`);
  return value;
}

function whole(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Bad ${name}`);
  return value;
}

/** The exact bytes Faara signs for a certificate. */
export function certificateMessage(c: PocketCertificate): string {
  return [
    'faara-cert-v1',
    field(c.pocketId, 'pocketId'),
    field(c.uid, 'uid'),
    field(c.devicePublicKey, 'devicePublicKey'),
    whole(c.limitKobo, 'limit'),
    whole(c.maxNoteKobo, 'maxNote'),
    whole(c.issuedAt, 'issuedAt'),
    whole(c.expiresAt, 'expiresAt'),
  ].join('|');
}

/** The exact bytes the phone signs for a spend note. */
export function noteMessage(n: SpendNote): string {
  return [
    'faara-note-v1',
    field(n.noteId, 'noteId'),
    field(n.pocketId, 'pocketId'),
    field(n.fromUid, 'fromUid'),
    field(n.toUid, 'toUid'),
    whole(n.amountKobo, 'amount'),
    field(n.nonce, 'nonce'),
    whole(n.sequence, 'sequence'),
    whole(n.createdAt, 'createdAt'),
  ].join('|');
}

/** Checks one signature. The server and the phone each bring their own implementation. */
export type VerifySignature = (publicKey: string, message: string, signature: string) => boolean;

export type NoteCheck = { ok: true } | { ok: false; reason: string };

/**
 * Everything a receiver can check without a network: both signatures, that the note matches
 * its certificate, the limits, and (when given) that it is addressed to them with their nonce.
 */
export function checkNote(
  signed: SignedNote,
  options: {
    serverPublicKey: string;
    verify: VerifySignature;
    now: number;
    expect?: { toUid: string; nonce: string };
  },
): NoteCheck {
  const { note, certificate } = signed;
  const cert = certificate.certificate;
  try {
    if (!options.verify(options.serverPublicKey, certificateMessage(cert), certificate.signature)) {
      return { ok: false, reason: 'The pocket certificate isn’t valid.' };
    }
    if (!options.verify(cert.devicePublicKey, noteMessage(note), signed.signature)) {
      return { ok: false, reason: 'The payment signature isn’t valid.' };
    }
  } catch {
    return { ok: false, reason: 'The payment couldn’t be read.' };
  }
  if (note.pocketId !== cert.pocketId || note.fromUid !== cert.uid) {
    return { ok: false, reason: 'The payment doesn’t match its pocket.' };
  }
  if (note.fromUid === note.toUid) return { ok: false, reason: 'You can’t pay yourself.' };
  if (!Number.isInteger(note.amountKobo) || note.amountKobo <= 0) {
    return { ok: false, reason: 'The amount isn’t valid.' };
  }
  if (note.amountKobo > cert.maxNoteKobo || note.amountKobo > cert.limitKobo) {
    return { ok: false, reason: 'That’s more than one offline payment can carry.' };
  }
  if (note.createdAt > cert.expiresAt) {
    return { ok: false, reason: 'The pocket had expired when this was made.' };
  }
  if (options.now > cert.expiresAt + OFFLINE_LIMITS.graceMs) {
    return { ok: false, reason: 'This payment is too old to settle.' };
  }
  if (
    options.expect &&
    (note.toUid !== options.expect.toUid || note.nonce !== options.expect.nonce)
  ) {
    return { ok: false, reason: 'This payment is for someone else.' };
  }
  return { ok: true };
}

/** Reads a settle request body: a short list of signed notes. */
export function parseSettleNotes(body: unknown): { notes: SignedNote[] } {
  const data = (typeof body === 'object' && body !== null ? body : {}) as { notes?: unknown };
  if (!Array.isArray(data.notes) || data.notes.length === 0 || data.notes.length > 20) {
    throw new OfflineValidationError('Send between 1 and 20 payments.');
  }
  return { notes: data.notes as SignedNote[] };
}

export function parseOpenPocket(body: unknown): { amountKobo: number; devicePublicKey: string } {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const amount = data.amountKobo;
  const key = data.devicePublicKey;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 100_00) {
    throw new OfflineValidationError('Choose at least ₦100.');
  }
  if (amount > OFFLINE_LIMITS.maxPocketKobo) {
    throw new OfflineValidationError('That’s more than an offline pocket can hold.');
  }
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    throw new OfflineValidationError('The phone’s key isn’t valid.');
  }
  return { amountKobo: amount, devicePublicKey: key };
}

/** Thrown for malformed requests; the message is safe to show. */
export class OfflineValidationError extends ValidationError {}
