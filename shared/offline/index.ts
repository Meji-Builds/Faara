import { pickShapes, type ShapeTriple } from '../hum/shapes';
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
  /** How long an identity card is good for before the phone fetches a fresh one. */
  identityTtlMs: 30 * 24 * 3_600_000,
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

/**
 * A card Faara signs naming a person. A receiver's phone hands it to the payer over
 * Bluetooth, so the payer sees a name that no nearby phone can fake.
 */
export interface IdentityCard {
  uid: string;
  name: string;
  /** The verified business name for vendors; empty for everyone else. */
  shop: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SignedIdentity {
  card: IdentityCard;
  signature: string;
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

/** The exact bytes Faara signs for an identity card. The name is base64url so any text fits. */
export function identityMessage(c: IdentityCard): string {
  return [
    'faara-id-v1',
    field(c.uid, 'uid'),
    field(toBase64Url(c.name), 'name'),
    field(c.shop ? toBase64Url(c.shop) : '-', 'shop'),
    whole(c.issuedAt, 'issuedAt'),
    whole(c.expiresAt, 'expiresAt'),
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

/**
 * What travels between phones by QR code, with no network:
 * - a request, shown by the receiver: who they are and a fresh nonce (and an amount, if set);
 * - a payment, shown by the payer: the signed note answering that request.
 */
export interface OfflineRequest {
  /** Receiver's user id. */
  uid: string;
  /** Receiver's name, shown to the payer. */
  name: string;
  nonce: string;
  /** Amount asked for in kobo; 0 lets the payer choose. */
  amountKobo: number;
}

const QR_PREFIX = { request: 'FAARA-OFF1-R:', note: 'FAARA-OFF1-N:' } as const;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 bytes of a string. Written out so it runs the same on every phone and server. */
function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let text = '';
  for (let i = 0; i < bytes.length;) {
    const byte = bytes[i] ?? 0;
    const extra = byte >= 0xf0 ? 3 : byte >= 0xe0 ? 2 : byte >= 0xc0 ? 1 : 0;
    let code = extra === 0 ? byte : byte & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) code = (code << 6) | ((bytes[i + k] ?? 0) & 63);
    text += String.fromCodePoint(code);
    i += extra + 1;
  }
  return text;
}

function toBase64Url(text: string): string {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

function fromBase64Url(text: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = B64.indexOf(char);
    if (value < 0) throw new Error('Not base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

function decodeQr(prefix: string, data: string): unknown {
  if (!data.startsWith(prefix)) return null;
  try {
    return JSON.parse(fromBase64Url(data.slice(prefix.length))) as unknown;
  } catch {
    return null;
  }
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function encodeOfflineRequest(request: OfflineRequest): string {
  return QR_PREFIX.request + toBase64Url(JSON.stringify(request));
}

/** Reads a receiver's request QR; null if it isn't one. */
export function decodeOfflineRequest(data: string): OfflineRequest | null {
  const value = decodeQr(QR_PREFIX.request, data) as Partial<OfflineRequest> | null;
  if (
    !value ||
    !isText(value.uid, 128) ||
    !isText(value.name, 80) ||
    !isText(value.nonce, 64) ||
    !isWhole(value.amountKobo) ||
    !SAFE.test(value.uid) ||
    !SAFE.test(value.nonce)
  ) {
    return null;
  }
  return { uid: value.uid, name: value.name, nonce: value.nonce, amountKobo: value.amountKobo };
}

/** A payment QR. `fromName` is shown to the receiver only; it isn't signed. */
export function encodeSignedNote(note: SignedNote, fromName?: string): string {
  const payload = fromName ? { ...note, fromName: fromName.slice(0, 80) } : note;
  return QR_PREFIX.note + toBase64Url(JSON.stringify(payload));
}

/** Reads a payment QR with the payer's display name, if given. */
export function readPaymentQr(data: string): { note: SignedNote; fromName: string | null } | null {
  const note = decodeSignedNote(data);
  if (!note) return null;
  const raw = (decodeQr(QR_PREFIX.note, data) as { fromName?: unknown }).fromName;
  return { note, fromName: isText(raw, 80) ? raw : null };
}

/** Reads a payer's payment QR; null if it isn't one. Signatures are checked separately. */
export function decodeSignedNote(data: string): SignedNote | null {
  return signedNoteFrom(decodeQr(QR_PREFIX.note, data));
}

/** Checks the shape of a signed note from any transport; null if it isn't one. */
function signedNoteFrom(raw: unknown): SignedNote | null {
  const value = raw as Partial<SignedNote> | null;
  const note = value?.note;
  const cert = value?.certificate?.certificate;
  if (
    !value ||
    !note ||
    !cert ||
    !isText(value.signature, 200) ||
    !isText(value.certificate?.signature, 200) ||
    !isText(note.noteId, 128) ||
    !isText(note.pocketId, 128) ||
    !isText(note.fromUid, 128) ||
    !isText(note.toUid, 128) ||
    !isText(note.nonce, 64) ||
    !isWhole(note.amountKobo) ||
    !isWhole(note.sequence) ||
    !isWhole(note.createdAt) ||
    !isText(cert.pocketId, 128) ||
    !isText(cert.uid, 128) ||
    !isText(cert.devicePublicKey, 64) ||
    !isWhole(cert.limitKobo) ||
    !isWhole(cert.maxNoteKobo) ||
    !isWhole(cert.issuedAt) ||
    !isWhole(cert.expiresAt)
  ) {
    return null;
  }
  return {
    note: {
      noteId: note.noteId,
      pocketId: note.pocketId,
      fromUid: note.fromUid,
      toUid: note.toUid,
      amountKobo: note.amountKobo,
      nonce: note.nonce,
      sequence: note.sequence,
      createdAt: note.createdAt,
    },
    signature: value.signature,
    certificate: {
      certificate: {
        pocketId: cert.pocketId,
        uid: cert.uid,
        devicePublicKey: cert.devicePublicKey,
        limitKobo: cert.limitKobo,
        maxNoteKobo: cert.maxNoteKobo,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
      },
      signature: value.certificate.signature,
    },
  };
}

/** Checks an identity card's shape; null if it isn't one. Signatures are checked separately. */
function identityFrom(raw: unknown): SignedIdentity | null {
  const value = raw as Partial<SignedIdentity> | null;
  const card = value?.card;
  if (
    !value ||
    !card ||
    !isText(value.signature, 200) ||
    !isText(card.uid, 128) ||
    !SAFE.test(card.uid) ||
    !isText(card.name, 80) ||
    !(card.shop === '' || isText(card.shop, 80)) ||
    !isWhole(card.issuedAt) ||
    !isWhole(card.expiresAt)
  ) {
    return null;
  }
  return {
    card: {
      uid: card.uid,
      name: card.name,
      shop: card.shop,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
    },
    signature: value.signature,
  };
}

/** Whether Faara signed this identity card and it's still in date. Never throws. */
export function checkIdentity(
  signed: SignedIdentity,
  options: { serverPublicKey: string; verify: VerifySignature; now: number },
): boolean {
  try {
    if (options.now > signed.card.expiresAt) return false;
    return options.verify(options.serverPublicKey, identityMessage(signed.card), signed.signature);
  } catch {
    return false;
  }
}

/** Reads a top-up request: naira to add to the pocket (0 just renews it) and the phone's key. */
export function parseTopUpPocket(body: unknown): { addKobo: number; devicePublicKey: string } {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const add = data.addKobo;
  const key = data.devicePublicKey;
  if (typeof add !== 'number' || !Number.isSafeInteger(add) || add < 0) {
    throw new OfflineValidationError('Choose an amount.');
  }
  if (add > OFFLINE_LIMITS.maxPocketKobo) {
    throw new OfflineValidationError('That’s more than an offline pocket can hold.');
  }
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    throw new OfflineValidationError('The phone’s key isn’t valid.');
  }
  return { addKobo: add, devicePublicKey: key };
}

/**
 * What two phones say to each other over Bluetooth during an offline hum:
 * - the offer, from the receiver: their Faara-signed identity and a fresh nonce;
 * - the payment, from the payer: the signed note answering that offer.
 * Both are compact JSON; each side checks everything it reads.
 */
export interface HumOffer {
  identity: SignedIdentity;
  nonce: string;
}

export interface HumPayment {
  note: SignedNote;
  /** Shown to the receiver only; it isn't signed. */
  fromName: string;
}

export const encodeHumOffer = (offer: HumOffer): string => JSON.stringify(offer);
export const encodeHumPayment = (payment: HumPayment): string => JSON.stringify(payment);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Reads a receiver's offer; null if it isn't one. */
export function decodeHumOffer(text: string): HumOffer | null {
  const value = parseJson(text) as Partial<HumOffer> | null;
  const identity = identityFrom(value?.identity ?? null);
  if (!value || !identity || !isText(value.nonce, 64) || !SAFE.test(value.nonce)) return null;
  return { identity, nonce: value.nonce };
}

/** Reads a payer's payment; null if it isn't one. */
export function decodeHumPayment(text: string): HumPayment | null {
  const value = parseJson(text) as Partial<HumPayment> | null;
  const note = signedNoteFrom(value?.note ?? null);
  if (!value || !note) return null;
  return { note, fromName: isText(value.fromName, 80) ? value.fromName : 'A Faara user' };
}

/**
 * The three shapes both phones show for an offline hum, worked out from the receiver's nonce
 * so the two screens agree with no server. FNV-1a seeds a small generator; it only has to
 * spread the 120 combinations evenly, not be secret.
 */
export function shapesForNonce(nonce: string): ShapeTriple {
  let hash = 0x811c9dc5;
  for (let i = 0; i < nonce.length; i++) {
    hash ^= nonce.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return pickShapes((n) => {
    hash = (Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return hash % n;
  });
}
